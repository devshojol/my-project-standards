# Backend architecture (Node server)

Labels: **[config]** enforced by config or by an automated test · **[code]** consistently demonstrated in source ·
**[inferred]** chosen where the reference was inconsistent or silent.

## Contents

1. Stack and dependency choices
2. Processes and infrastructure
3. Request lifecycle
4. Layers and dependency direction
5. API design
6. Data layer
7. Background work
8. Cross-cutting services
9. Scaling the architecture down (and to other frameworks)
10. Dependency policy

---

## 1. Stack and dependency choices

| Concern | Reference choice | Use in other projects |
|---|---|---|
| Runtime | Node.js, ES modules, no build step | Default |
| HTTP | Express 4 | Default; Fastify/Koa/Nest only if the project already uses them |
| Database | MongoDB via Mongoose 8, two named connections (app data, admin content), replica set | Default for document data; keep the project's DB otherwise |
| Validation | Zod 4 (requests and environment) | Always |
| Auth | `jsonwebtoken` access + refresh tokens (refresh rotation with reuse detection), `bcrypt` (cost ≥ 12), Google/Apple/Facebook token verification | As needed |
| Logging | `pino` + `pino-http`, JSON lines with redaction | Always |
| Errors | `@sentry/node`, manual capture of 5xx and failed jobs | Recommended |
| Security | `helmet`, `cors` allow-list, `express-rate-limit` with a Redis store that fails open, `compression`, `cookie-parser` | Always (rate limits per route) |
| Cache / limits / queues | Redis (Valkey) through `ioredis`; `bullmq` queues; Socket.IO + Redis adapter for live chat | Only when a feature needs them |
| Files | `multer` uploads, S3-compatible object storage (R2) via `@aws-sdk/client-s3`, `sharp` | As needed |
| E-mail | `nodemailer` over SMTP, templates in `src/emails/` | As needed |
| API docs | OpenAPI 3 (`swagger-jsdoc` + typed doc objects), `swagger-ui-express` behind basic auth, Spectral lint | Recommended for public APIs |
| Tests | Jest 30 (native ESM), Supertest, `mongodb-memory-server` replica set, `ioredis-mock`, `nock`, `aws-sdk-client-mock`, `@faker-js/faker` | Default |
| Dev | `nodemon` | Default |
| Product-specific | RevenueCat, Stripe, OneSignal, ActiveCampaign, GA4 Measurement Protocol, AppsFlyer, OpenAI moderation | Only when asked |

## 2. Processes and infrastructure

- **API process** (`src/index.js`): imports `instrument.js` first, connects Redis (bounded wait), listens, attaches
  the live-chat gateway, installs fatal handlers and graceful shutdown. [code]
- **Worker process** (`src/worker.js`, `npm run worker`): same codebase and config; consumes the BullMQ queue and
  registers repeatable schedules. The API only enqueues. [code]
- **MongoDB**: a replica set in every environment (Atlas in dev/prod, `MongoMemoryReplSet` in tests) because writes
  that span collections use transactions. [code]
- **Redis/Valkey**: rate-limit store, caches, queue; optional locally (everything fails open, the worker refuses to start). [code]
- Hosting: a container platform with health checks on `/health` (liveness) and `/ready` (Mongo + Redis). [code]

## 3. Request lifecycle

`src/app.js` order [code]:

1. `app.set("trust proxy", 1)`, `app.disable("x-powered-by")`
2. `requestId` (accepts a sane `X-Request-Id` or makes a UUID; echoes it) → `httpLogger`
3. `compression({ threshold: 1024 })` → `helmet()` (no CSP on the docs path)
4. Provider webhooks mounted **before** CORS and `express.json` (they read the raw body to check signatures)
5. `cors({ origin: allow-list, credentials: true, exposedHeaders: [...] })` → `cookieParser()` → `express.json({ limit })`
6. `/health`, `/ready` → `/api-docs` (basic auth) → `/api` routes → `notFoundHandler` → `errorHandler`

The v2 router then applies, in order: default `Cache-Control: private, no-store` on GETs → a minimum-app-version gate
(`426 VERSION_TOO_OLD`) → analytics-id capture → the domain routers. Each route adds its own chain (conventions §5).

## 4. Layers and dependency direction

```
routes/       mount points + middleware chain, nothing else
   │
middlewares/  auth, limits, flags, validation, cache headers, uploads, idempotency (request-scoped concerns)
   │
controllers/  HTTP adapter: validated input + subject → one service call → envelope
   │
services/     business rules, orchestration, transactions, side effects (queue, mail, events)
   │
models/  lib/  utils/  constants/  config   data access and infrastructure
```

- Imports point downward only; `lib/`, `utils/`, `constants/` never import services, controllers, or routes. [code]
- Domains talk to each other through `services/<domain>/index.js` or through registries/hooks
  (`registerHooks.js`, step and section registries) instead of reaching into another domain's files. [code]
- Jobs and scripts call services, never controllers. [code]
- `config` is imported by any layer; nothing else reads the environment. [config: test]

## 5. API design

- **Versioning**: new endpoints under `/api/v2`; legacy `/api/*` contracts are frozen for old app builds and send
  `Deprecation`/`Sunset` headers. [code]
- **Envelope**: `{ success: true, requestId, data }` / `{ success: false, code, message, requestId, errors?, data? }`. [code]
- **Error codes**: one registry (`lib/codes.js`) with default status and meaning; the OpenAPI error enum is generated
  from it. [config: test]
- **Auth**: `Authorization: Bearer <access token>`; guests use an app-level bearer; a parent can act for a child with
  `x-acting-as` (checked in `authenticate`, `403 NOT_YOUR_CHILD` otherwise); the subject of a request is
  `req.actingAs ?? req.user`. [code]
- **Client metadata headers**: `x-app-version`, `x-device-model`, `x-timezone`, `x-app-language`, `x-request-id`. [code]
- **Rate limits** on every route via a central `limiters` registry (per user, per IP, per e-mail as fits). [code]
- **Feature flags**: `requireFlag(key)` answers `404 FEATURE_OFF` so unreleased routes look absent. [code]
- **Idempotency** for retried writes through an idempotency middleware. [code]
- **Pagination**: opaque cursor `{ items, nextCursor }` for new lists; legacy `skip` lists unchanged. [code]
- **Caching**: private by default; public edge caching only for allow-listed routes, with cache tags for purges. [code]
- **Docs**: every v2 operation is documented, the spec is linted with Spectral, and integration tests validate every
  response against it. [config]

## 6. Data layer

- Two named connections in `db/index.js` (App DB for user data, Admin DB for content), created from `config`; in tests
  the connections are opened against an in-memory replica set. [code]
- Models are defined on a connection (`appConnection.model(...)`), one per file; enums exported and frozen. [code]
- Reads use projections and `.lean()`; writes use atomic operators. [code]
- Multi-collection writes use `withTransaction`; side effects queued with `afterCommit` run only after the commit and
  never on an abort. [code]
- Every personal-data collection has a deletion path (account erase cascades). [code]
- Schema changes ship with numbered, resumable migration scripts (`scripts/v2/NN-*.js`) that support a dry run. [code]

## 7. Background work

- BullMQ queue (prefix `bull`), one worker process; `enqueue(name, data, opts)` returns `null` instead of throwing when
  Redis is down. [code]
- `src/jobs/index.js` holds `JOB_NAMES` (frozen) and the name → handler map; an unknown name fails without retries. [code]
- A handler is `async (job) => result`, safe to repeat, processes in batches with an `_id` cursor, logs counts (never
  personal data), and throws once at the end if any part failed so the queue retries. [code]
- Repeatable schedules live in `src/jobs/<domain>.schedule.js` and are registered by the worker at boot. [code]
- Job payloads carry ids only, never e-mails or names. [code]

## 8. Cross-cutting services

- **Logging**: pino with a redaction list and request serializers that drop headers, IPs, query strings and child
  ids; `httpLogger` skips health and docs paths. [code]
- **Monitoring**: Sentry initialised in `instrument.js` (no-op without a DSN); 5xx and failed jobs captured manually
  with the request id, user id and route pattern. [code]
- **Fatal errors**: `unhandledRejection` / `uncaughtException` → fatal log → flush monitoring → exit(1); the platform
  restarts the process. [code]
- **Health**: `/health` always answers; `/ready` reports Mongo and Redis. [code]
- **Config**: one Zod-validated module; invalid configuration stops the boot. [config]
- **E-mail**: templates render subject/html/text from one layout; sending failures are logged, never thrown at users
  unless the feature depends on them. [code]
- **Privacy by design**: hashed ids in logs, data minimisation in job payloads, child-specific rules
  (`isChildContext`) checked in services, dedicated child-safety test suites. [code]

## 9. Scaling the architecture down (and to other frameworks)

| Need | Keep | Drop until needed |
|---|---|---|
| Small CRUD API | config.js, codes/errors, logger, requestId, validate, error handler, db, app/index, routes → controllers → services → models, tests | Redis, worker, streams, Socket.IO, Sentry, typed OpenAPI |
| API + background jobs | + Redis, BullMQ, `jobs/`, `worker.js` | streams, Socket.IO |
| Fastify / Koa | Same folders and layers; framework plugins/middleware replace Express middleware one-for-one | |
| NestJS | Nest modules/controllers/providers replace routes/controllers/services; keep Zod (or the project's pipes), the envelope, codes, logger, config rules | |
| Next.js route handlers | Handler = controller (thin); logic in a server-only `services/` folder; Zod at the edge; same envelope and codes | Express-specific middleware |
| PostgreSQL / Prisma or another DB | Layering, transactions helper, migrations as scripts, decimal money, ids not exposed in logs | Mongoose-specific rules (§6 bullets 1-3) |

When a framework's own convention conflicts with a row above, the framework wins; record the decision in the report.

## 10. Dependency policy

- Prefer what is installed, then the choices in §1, then the framework's recommendation; one library per concern.
- Pin exact versions for packages where upgrades have bitten (native modules, test tooling); caret ranges elsewhere. [code]
- Every new dependency is listed in the final report with the reason.
