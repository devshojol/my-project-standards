# Backend coding conventions (Node server)

Labels: **[config]** enforced by config or by an automated test · **[code]** consistently demonstrated in source ·
**[inferred]** chosen where the reference was inconsistent or silent.
Full skeletons live in `code-templates.md`; this file explains the rules behind them.

## Contents

1. Language and modules
2. Formatting
3. Imports and exports
4. Functions
5. Routes
6. Controllers
7. Services
8. Models (Mongoose)
9. Request validation (Zod)
10. Errors
11. Responses
12. Async code, transactions, and side effects
13. Logging and privacy
14. Configuration
15. JSDoc and comments
16. Patterns in the reference not to copy

---

## 1. Language and modules

- JavaScript, Node ES modules: `"type": "module"` in package.json, `import`/`export` everywhere, top-level `await`
  allowed (entry points, config, tests). No transpiler, no build step. [config]
- Every relative import ends in `.js` (Node ESM requires it): 3,063 of 3,063 relative imports. [config + code]
- Node builtins with the `node:` prefix (`node:crypto`, `node:path`). [code: 36 of 48]
- In a TypeScript target keep TypeScript; JSDoc types become TS types, everything else here applies. [inferred]

## 2. Formatting

Prettier, verbatim config in `assets/backend/prettierrc.json`: `printWidth` 120, `tabWidth` 2, double quotes,
semicolons, `trailingComma: "es5"`. No JSX or Tailwind options. `npm run format:check` covers `src` and `tests`. [config]

## 3. Imports and exports

- One import block at the top: packages first, then relative paths [code: 512/516 files]; alphabetical inside each
  group [code: 351/516 files, the target for new files].
- Side-effect imports that must run first stay first and say why (`import "./instrument.js"; // must stay the first import`). [code]
- Named exports for functions and constants (`export const`: 2,516 uses). Default export only for one-per-file values:
  the Express `app`, a router, a model, `config`, `logger`, a job handler. [code]
- A domain folder's `index.js` is its public API: other domains import from `services/<domain>/index.js`, not from
  its internal files. [code]
- `lib/` modules never import services or controllers; pure helpers such as `lib/context.js` import nothing so every
  layer can use them without cycles. [code]

## 4. Functions

- Arrow functions assigned to `const` (2,935 vs 6 function declarations). [code]
- More than two inputs → an options object last, with defaults in the destructuring:
  `readDailyGoal(subject, { timeZone = "UTC", now = new Date() } = {})`. [code]
- Inject the clock (`now = new Date()`) and collaborators through options so rules and services stay testable. [code]
- Pure rule functions live in `*.rules.js`: no I/O, no clock, no imports of models. [code]
- Frozen constant maps and lists: `Object.freeze([1, 2, 3])`, `Object.freeze({ ... })`. [code]
- Guard programmer errors early with `throw new Error("<module>.<fn>: what was wrong (got X)")`. [code]

## 5. Routes

```js
const router = express.Router();
router.patch("/settings", noStore, authenticate, limiters.settings, validate(settingsSchema), patchMySettings);
export default router;
```

- One router per domain file; `export default router`, or named routers when one file serves several mount points
  (`export { competitionListRoutes, competitionRoutes }`). [code: 32 default, 5 named]
- Middleware chain order: cache header (`noStore`) → `authenticate` → rate limiter → `requireFlag(key)` → request
  enrichers (`attachClientMeta`) → `validate(schema, part)` → controller. The limiter runs before validation so a bad
  request still counts. [code]
- A header comment states the mount point, the full chain, and the spec section. [code]
- Mount each router with one commented line in `routes/v2/index.js`: `// <module> <ticket>: METHOD /path (spec §x)`. [code]
- Paths: kebab-case, plural nouns, `me` for the caller, ids as `:id` / `:childId`. [code]

## 6. Controllers

```js
export const getDailyGoal = async (req, res, next) => {
  try {
    const subject = req.actingAs ?? req.user;
    const dailyGoal = await readDailyGoal(subject, { timeZone: resolveTimeZone(req.headers["x-timezone"], subject) });
    return res.status(200).json({ success: true, requestId: req.requestId, data: { dailyGoal } });
  } catch (error) {
    return next(error);
  }
};
```

- Thin HTTP adapters: read the validated input (`req.validated.body|query|params`), the subject
  (`req.actingAs ?? req.user`), call one service, send the envelope. No queries, no business rules. [code]
- Every handler is `async (req, res, next)` with `try { … } catch (error) { return next(error); }` (108 in v2). [code]
- Explicit status every time: `res.status(200)` (201 for a create, 202 for accepted-later). [code]
- Never trust ids or identity from the body; identity comes from the token. [code]

## 7. Services

- Business logic and data access. New services take plain arguments (subject, input, options), not `req`/`res`, so jobs,
  scripts, and other services can call them. [inferred: most services do; a few older ones take `req`]
- Throw `AppError` with a registered code for every expected failure (145 uses); let unexpected errors propagate. [code]
- Read with projections and `.lean()` (553 uses); write with `updateOne`/`$set`/`$inc` and `runValidators: true`. [code]
- Multi-document writes run in `withTransaction(async (session) => …)` from `lib/transaction.js`; pass `session` to
  every read and write inside; work that must wait for the commit goes through `afterCommit(session, fn)`. [code]
- Parallel independent reads with `Promise.all`. [code]
- External calls (mail, payment, push providers) go through a client/service wrapper with a timeout (`withTimeout`)
  and a defined failure mode: fail open (log, continue) for optional infrastructure, fail closed for safety checks. [code]
- Split a growing domain into `index.js`, `<domain>.service.js` (writes), `<domain>.reader.js` (reads),
  `<domain>.rules.js` (pure), `<domain>.step.js` (pipeline hooks), `<name>.client.js` (external APIs). [code]

## 8. Models (Mongoose)

- Built on a named connection, never the default mongoose connection:
  `const Achievement = appConnection.model("Achievement", achievementSchema); export default Achievement;` [code]
- Schema options `{ timestamps: true, collection: "<lowercase name>" }`. [code]
- Each field carries an inline comment with its meaning and any rule; validators carry messages
  (`validate: { validator: Number.isInteger, message: "x must be a whole number" }`). [code]
- Enums are exported frozen constants (`export const ACHIEVEMENT_KINDS = Object.freeze([...])`) and reused in Zod
  schemas and docs. [code]
- Indexes are declared right after the schema (`schema.index({ userId: 1, date: 1 }, { unique: true })`). [code]
- Data migrations and backfills are numbered scripts, never code that runs at boot. [code]

## 9. Request validation (Zod)

- Zod 4 schemas in `src/schemas/<domain>.schema.js`, named `<thing>Schema`, with a JSDoc line describing the parsed
  output. [code]
- Messages are written for end users: `z.string({ error: "Please write a message." }).trim().min(20, { error: "…" })`. [code]
- Unknown keys are stripped, never rejected (old clients keep working). [code]
- Cross-field rules in `.superRefine` with an issue `path`. [code]
- Applied with `validate(schema, "body" | "query" | "params")`; controllers read `req.validated[part]` and never the
  raw `req.body` (legacy controllers excepted). [code: 196 `validate(` uses]
- Validation failures become `400 VALIDATION_ERROR` with `errors: [{ field, message }]`. [code]

## 10. Errors

- `new AppError(code, message, status?, { errors, cause, data })` from `lib/errors.js`, plus helpers:
  `validationError`, `unauthenticated`, `forbidden(code)`, `notFound`, `internalError(cause)`. [code]
- Every code is a key of `lib/codes.js` with its default status and meaning; an unregistered code throws in development
  and tests. [config: test-enforced]
- Messages are safe to show a client; 5xx messages are replaced by `"Internal Server Error"` outside development. [code]
- Operational errors (`AppError`, `isOperational`) vs programmer errors (`throw new Error`): the first is a 4xx answer,
  the second a logged 5xx. [code]
- One central `errorHandler` (last middleware) and a `notFoundHandler`; it also maps Zod errors, body-parser errors
  (413, invalid JSON), Mongo duplicate keys and Mongoose validation errors. Controllers never format errors. [code]

## 11. Responses

- v2 success: `{ success: true, requestId, data }`; v2 error: `{ success: false, code, message, requestId, errors?, data? }`. [code]
- Lists: cursor pagination from `lib/pagination.js`, `?cursor=&limit=1..100` (default 20) → `{ items, nextCursor }`. [code]
- `Cache-Control: private, no-store` by default on v2 GETs; per-user routes set `noStore` on every answer; public
  caching only through an allowlist. [code]
- Versioning: new routes under `/api/v2`; legacy routes keep their exact shapes and send deprecation headers. [code]

## 12. Async code, transactions, and side effects

- `async/await` only. Fire-and-forget work is explicit: `void promise.catch(log)` with a comment. [code]
- Transactions need a replica set; there is deliberately no non-transactional fallback. [code]
- A transaction body must be safe to re-run (the driver retries it). [code]
- Optional infrastructure (Redis, queue, CDN purge) fails open with a log line; requests never hang on it
  (command timeouts). [code]
- Shutdown: stop accepting, drain, close Mongo/Redis/queue, flush monitoring, exit; a forced exit after 10 s. [code]

## 13. Logging and privacy

- `import logger from "../lib/logger.js"`; inside a request prefer `req.log ?? logger`. No `console.*`. [code: 434 vs 18 legacy]
- Structured lines: `logger.warn({ event: "dailyGoal.goalChange.noGrade", requestId }, "dailyGoal")`. [code]
- Never log tokens, passwords, e-mails, or child ids; the logger redacts known paths, and a line that must point at a
  user carries a salted hash (`hashId`), not the id. [config: logger redaction + tests]
- Request logs carry id, method, path (query string and ids stripped) and status only. [code]

## 14. Configuration

- `src/config.js` is the only module that reads `process.env`: a Zod schema with types, defaults, and
  human-readable messages; it exits on an invalid value and exports one frozen `config` object. [config: test-enforced]
- Fail-safe defaults: an unset `NODE_ENV` behaves as production. [code]
- Every variable is documented in `.env.example` with what it does, its default, and what happens when unset. [code]

## 15. JSDoc and comments

Enforced as **errors** on `src/**` (see development-rules.md §1):

- Every exported function, including exported arrow functions, has a JSDoc block with a description, `@param {type}`
  for every parameter (destructured options as `options.name`), `@returns {type}`, and `@throws {Type}` when it can throw.
- Types may use TypeScript-style imports (`{import("express").Request}`) and generics (`{Promise<boolean>}`).
- Non-exported helpers may skip JSDoc (`publicOnly`), but the reference documents most of them anyway.
- Each file opens with a comment that says what it is for and which spec/ticket it implements; inline comments explain
  *why* (constraints, decisions, edge cases) and cite ticket or decision ids. [code]
- `@swagger` / `@openapi` tags are allowed for annotated routes. [config]

## 16. Patterns in the reference not to copy

| Seen in the reference | Do instead |
|---|---|
| Legacy controllers with `createSuccessResponse` and `errorCode` bodies | v2 envelope and `AppError` |
| `console.log` in older integration services | `logger` with an event name |
| Hand-written `startSession` blocks | `withTransaction` from `lib/transaction.js` |
| Services that take `req` | Plain arguments; the controller unpacks the request |
| Project-specific references in comments (decision numbers, spec sections) | Cite the target project's own tickets/specs; don't invent references |
