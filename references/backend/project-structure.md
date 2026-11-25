# Backend project structure (Node server)

Labels: **[config]** enforced by config or by an automated test · **[code]** consistently demonstrated in source ·
**[inferred]** chosen where the reference was inconsistent or silent.
Reference: the Gonit API (Node.js + Express 4, ES modules, Mongoose 8 over MongoDB replica sets, Redis/Valkey, BullMQ,
Zod, pino, Jest 30), its maintained `develop` branch: about 710 files in `src/` and 800+ test files.

## Contents

1. Reference layout
2. Placement table
3. Naming rules
4. Adding an endpoint end-to-end
5. Bootstrapping a new Node server
6. Applying the structure to an existing server
7. Inconsistencies in the reference and the rule for new code

---

## 1. Reference layout

```
<root>/
├── src/
│   ├── index.js                 # API process: instrument → Redis connect → app.listen → shutdown/fatal handlers
│   ├── instrument.js            # error-monitoring init; must stay the first import of index.js
│   ├── app.js                   # the Express app (middleware order in architecture.md §3); exported, never listens
│   ├── worker.js                # background-job process (`npm run worker`), same codebase, consumes the queue
│   ├── config.js                # the ONLY reader of process.env: Zod-validated, frozen `config` object
│   ├── config/                  # module settings and bootstrap files (support.js, swagger.config.js, dotenv.config.js, …)
│   ├── constants/               # domain constants: <domain>.js exporting frozen UPPER_SNAKE objects
│   ├── db/index.js              # named Mongoose connections (appConnection, adminConnection)
│   ├── routes/
│   │   ├── index.js             # mounts /v2 and the frozen legacy routers
│   │   ├── <domain>.route.js    # legacy /api/* routers (shapes frozen for old clients)
│   │   └── v2/
│   │       ├── index.js         # mounts every v2 router, one commented line per mount
│   │       └── <domain>.route.js
│   ├── controllers/
│   │   ├── <domain>.controller.js     # legacy
│   │   └── v2/<domain>.controller.js  # thin HTTP adapters
│   ├── services/
│   │   ├── <domain>.service.js        # small domains: one file
│   │   └── <domain>/                  # larger domains: a folder
│   │       ├── index.js               # registrations + the domain's in-process API (re-exports)
│   │       ├── <domain>.service.js    # writes and orchestration
│   │       ├── <domain>.reader.js     # reads
│   │       ├── <domain>.rules.js      # pure rules: no I/O, no clock
│   │       ├── <domain>.step.js       # a step plugged into a shared pipeline
│   │       └── <name>.client.js       # an external API client
│   ├── models/<name>.model.js   # Mongoose models on the App DB; models/admin/ for the Admin DB
│   ├── schemas/<domain>.schema.js # Zod request schemas
│   ├── middlewares/<name>.middleware.js
│   ├── lib/                     # infrastructure: errors, codes, logger, redis, queue, cache, transaction, afterCommit,
│   │                            #   pagination, health, sentry, context, time, flags, upload, …
│   ├── utils/                   # small helpers: tokens, dates, mail transport, id/key builders
│   ├── jobs/
│   │   ├── index.js             # JOB_NAMES registry + name → handler map
│   │   ├── <name>.job.js        # one BullMQ handler per file
│   │   ├── <domain>.schedule.js # repeatable schedules registered by the worker
│   │   └── <domain>/<name>.job.js
│   ├── streams/                 # MongoDB change-stream handlers (cache invalidation)
│   ├── emails/<template>.js     # e-mail templates + index.js (`renderEmail`)
│   └── docs/                    # OpenAPI: v2/<domain>.docs.js (+ <domain>.schemas.js), _shared/, legacy/
├── tests/
│   ├── setup.js                 # env defaults, seeded faker, network guards (runs before every file)
│   ├── helpers/  factories/  fixtures/
│   ├── unit/<domain>/*.test.js            # pure logic and mocked modules
│   ├── integration/<domain>/*.int.test.js # real app + in-memory Mongo replica set + mocked Redis
│   ├── db/*.db.test.js  child-safety/*.safety.test.js  infra/  jobs/  scripts/  middlewares/
│   └── **/*.perf.test.js                  # timing tests, run alone
├── scripts/                     # ops scripts: v2/NN-<name>.js numbered migrations, seed-*.js, qa/
├── .env.example  .prettierrc  eslint.config.js  jest.config.js  .spectral.yaml  .gitleaksignore
└── package.json                 # "type": "module", "main": "src/index.js"
```

No `dist/` and no build step: Node runs `src/` directly. [config]

## 2. Placement table

| You need | Put it in | Name | Notes |
|---|---|---|---|
| A new endpoint | `src/routes/v2/<domain>.route.js` + mount in `src/routes/v2/index.js` | camelCase domain | New endpoints are v2 only; legacy routers are frozen [code] |
| Its HTTP adapter | `src/controllers/v2/<domain>.controller.js` | `export const verbNoun` | Thin: parse → service → envelope [code] |
| Its request schema | `src/schemas/<domain>.schema.js` | `<thing>Schema` | Zod; used through `validate(schema, part)` [code] |
| Business logic | `src/services/<domain>.service.js`, or `src/services/<domain>/` when it grows past one file | | No `req`/`res` in new services [inferred] |
| Pure rules | `src/services/<domain>/<domain>.rules.js` | | Unit-tested without mocks [code] |
| A collection | `src/models/<name>.model.js` (`models/admin/` for the Admin DB) | singular camelCase | Default export = the model [code] |
| A shared Mongoose validator | `src/models/validators.js` | | |
| A new error code | `src/lib/codes.js` | `UPPER_SNAKE` | Every code used in `src/` must be registered [config: test] |
| Cross-cutting infrastructure | `src/lib/<name>.js` | camelCase | Imported by any layer; imports no service [code] |
| A small helper | `src/utils/<name>.js` | camelCase | |
| Domain constants | `src/constants/<domain>.js` | `UPPER_SNAKE` frozen objects | Module settings may live in `src/config/<module>.js` [code] |
| An environment variable | `src/config.js` schema **and** `.env.example` | `UPPER_SNAKE` | Never read `process.env` elsewhere [config: test] |
| A middleware | `src/middlewares/<name>.middleware.js` | camelCase | Factories for parameterised ones (`validate(schema)`, `requireFlag(key)`) |
| A rate limit | `limiters` registry in `src/middlewares/rateLimiter.middleware.js` | `limiters.<name>` | Every route gets one [code] |
| Background work | `src/jobs/<name>.job.js` + entry in `src/jobs/index.js` | `domain:action` job names | Schedules in `src/jobs/<domain>.schedule.js` |
| An e-mail | `src/emails/<template>.js` + register in `src/emails/index.js` | camelCase | |
| API docs | `src/docs/v2/<domain>.docs.js` (+ `<domain>.schemas.js`) | | Spec validated in integration tests and by Spectral |
| A migration / backfill | `scripts/v2/NN-<kebab-name>.js` | numbered | Idempotent, resumable, dry-run first [code] |
| A unit test | `tests/unit/<domain>/<subject>.test.js` | | `.rules.test.js`, `.service.test.js` suffixes allowed |
| An integration test | `tests/integration/<domain>/<subject>.int.test.js` | | Real app via Supertest |
| A DB-level test | `tests/db/<subject>.db.test.js` | | Indexes, constraints, transactions |
| Test data | `tests/factories/index.js` (`buildX`/`createX`), `tests/fixtures/` | | |

## 3. Naming rules

| Item | Rule | Evidence |
|---|---|---|
| Layer files | `<camelName>.<role>.js` where role = `route`, `controller`, `service`, `model`, `schema`, `middleware`, `job`, `schedule`, `docs`, `schemas`, `rules`, `reader`, `step`, `client`, … | [code] 135 service, 49 controller, 47 model, 46 job, 44 route, 41 docs, 34 schema, 29 middleware, 10 schedule |
| Infrastructure/helper files | plain camelCase (`errors.js`, `pagination.js`, `localDate.js`) | [code] |
| Folders | lowercase plural for layers (`routes`, `controllers`, `services`, `models`, `middlewares`, `schemas`, `jobs`), camelCase for domain subfolders (`dailyGoal/`, `mockTest/`) | [code] |
| Functions | camelCase verb-first: `readDailyGoal`, `onGoalChange`, `sendSupport` | [code] |
| Controllers | `<verb><Noun>` matching the HTTP action: `getDailyGoal`, `patchMySettings` | [code] |
| Schemas | `<thing>Schema`: `settingsSchema`, `supportSchema` | [code] |
| Models | PascalCase singular model name, lowercase collection name set explicitly (`collection: "dailyactivity"`) | [code] |
| Constants, enums, error codes | `UPPER_SNAKE_CASE`, frozen (`Object.freeze`) | [code] |
| Job names | `domain:action` (`group:daily`, `account:erase`); scheduler ids without `:` | [code] |
| Log events | lowercase dotted `domain.action` (`mongo.connected`, `server.shutdown`) | [code] |
| URL paths | kebab-case, plural resources, `me` for the caller: `/api/v2/users/me/daily-goal`, `/mock-tests/:id` | [code] |
| Request/response JSON | camelCase keys | [code] |
| Tests | `<subject>.test.js`, `.int.test.js`, `.db.test.js`, `.safety.test.js`, `.perf.test.js` | [code] |
| Test case titles | spec ids first when the project has a test plan: `"UT-004: isMet(4, 3) is true"` | [code] |

## 4. Adding an endpoint end-to-end

Example: `GET /api/v2/users/me/achievements` and `POST /api/v2/achievements/:id/claim`.

1. **Error codes**: add any new code to `src/lib/codes.js` with its default status and meaning.
2. **Model** (if new data): `src/models/achievement.model.js`: schema, indexes, frozen enums, default export.
3. **Rules**: `src/services/achievement/achievement.rules.js`: pure functions, unit-tested first.
4. **Service**: `src/services/achievement/achievement.service.js` (writes; `withTransaction` for multi-document
   writes, `afterCommit` for side effects) and `achievement.reader.js` if reads are non-trivial; `index.js` re-exports
   what other domains may call.
5. **Schema**: `src/schemas/achievement.schema.js` for body/query/params.
6. **Controller**: `src/controllers/v2/achievement.controller.js`: one thin handler per route.
7. **Route**: `src/routes/v2/achievement.route.js` with the middleware chain (architecture.md §3), then one commented
   `router.use(...)` line in `src/routes/v2/index.js`.
8. **Rate limit and flag**: a `limiters.<name>` entry; `requireFlag("<key>")` if the feature ships dark.
9. **Docs**: `src/docs/v2/achievement.docs.js`; run the OpenAPI lint.
10. **Config**: new env vars in `src/config.js` + `.env.example` (comment: what it does, default, what happens when unset).
11. **Background work** (if any): `src/jobs/<name>.job.js` + registry entry + schedule.
12. **Tests**: rules (unit), service with mocked modules (unit), route through the real app (integration), and the
    data-protection cases when the endpoint touches personal or child data.
13. **Verify**: SKILL.md step 8.

## 5. Bootstrapping a new Node server

Create only what the service needs, in this order (skeletons in `code-templates.md` §1):

1. `package.json` with `"type": "module"`, `"main": "src/index.js"`, scripts from development-rules.md §3.
2. Tooling: `eslint.config.js`, `.prettierrc`, `jest.config.js` from `assets/backend/`; `.env.example`; `.gitignore`
   with `.env*` (except `.env.example`), `service-account*.json`, `*.p8`, `*.pem`, `coverage/`, `build/`.
3. `src/config.js` (Zod env) → `src/lib/codes.js` + `src/lib/errors.js` → `src/lib/logger.js` →
   `src/middlewares/{requestId,validate,error}.middleware.js` → `src/db/index.js` → `src/app.js` → `src/index.js`.
4. `/health` and `/ready` probes, graceful shutdown, fatal handlers.
5. `tests/setup.js`, `tests/helpers/db.js`, `tests/factories/index.js`, then the first feature with its tests.
6. Add Redis, a queue + `src/worker.js`, change streams, Swagger/Spectral, Sentry only when a feature needs them.

Single-database services use one named connection; keep the `db/index.js` shape so a second can be added later.

## 6. Applying the structure to an existing server

1. Map existing folders to the roles above (`src/api/` → routes, `src/handlers/` → controllers, `src/repositories/`
   → data access inside services). Use the existing folders; don't move files.
2. Put new code in the existing folder for its role, with the `<name>.<role>.js` suffix if the project already uses
   suffixes, otherwise its own naming.
3. Introduce the cross-cutting pieces (central error handler, envelope, config validation, request id, structured
   logging) only when the task needs them or the user asks; each changes behaviour for every route.
4. Keep a CommonJS server CommonJS: apply the conventions, don't convert module systems unasked.
5. TypeScript servers: same layering and rules, `.ts` files, types instead of JSDoc types, `tsc --noEmit` in verification.

## 7. Inconsistencies in the reference and the rule for new code

| Area | What the reference contains | Rule for new code |
|---|---|---|
| Legacy vs v2 | 12 legacy controllers/routers (`/api/*`) with older shapes (`createSuccessResponse`, `errorCode`) | New endpoints are v2 with the envelope; legacy shapes stay frozen |
| Service location | Top-level `*.service.js` and domain folders side by side | One file for a small domain; a `services/<domain>/` folder once it needs rules/reader/steps |
| Transactions | Some hand-written `startSession` + `withTransaction` blocks | `lib/transaction.js` `withTransaction(fn)` (the reference's stated direction) |
| Logging | 18 `console.*` calls in three older files | `logger` / `req.log` only |
| Import order | Packages before relative paths in 512/516 files; fully alphabetical in 351/516 | Packages first, then relative; alphabetical within each group |
| Builtins | `node:` prefix in 36 imports, bare in 12 | `node:fs`, `node:crypto`, … |
| Job handlers | Mostly `const xJob = async (job) => …; export default xJob`, some `export default async function` | Arrow const + default export |
| Model folder helpers | `validators.js`, `billingShared.js` without the `.model` suffix | Shared helpers fine; every model file ends `.model.js` |
| Older releases | Early versions of the reference used a flat layout with `dotenv` reads everywhere, no Zod config, no tests, and credential files in the repo | Follow the current layout; never copy the old one |
