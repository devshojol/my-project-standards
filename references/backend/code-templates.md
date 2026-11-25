# Backend code templates (Node server)

Skeletons that follow `coding-conventions.md`. They were checked with the reference ESLint config (strict JSDoc as
errors) and Prettier config with zero findings, the unit and route tests pass, and the server boots, answers the
probes, rejects an invalid environment, and shuts down on SIGTERM. They use the example domain **achievement**
(`GET /api/v2/users/me/achievements`, `POST /api/v2/achievements/:id/claim`). Copy what you need, rename consistently
(files, identifiers, error codes, routes, job names, tests), and adjust import depth to the real location.

Needed packages: `express@4 zod@4 mongoose@8 pino pino-http express-rate-limit@8 helmet cors compression
cookie-parser jsonwebtoken dotenv`; dev: `jest@30 @jest/globals supertest @faker-js/faker mongodb-memory-server
eslint @eslint/js globals eslint-plugin-jsdoc prettier nodemon`. Tooling files are in `assets/backend/`
(`eslint.config.js`, `prettierrc.json` → `.prettierrc`, `jest.config.js`, `env.example` → `.env.example`).

## Contents

1. Base files for a new server
2. Models
3. Request schema
4. Service folder
5. Controller
6. Route and mount
7. API docs
8. Background job and registry
9. Tests

---

## 1. Base files for a new server

Create these once, in this order, when the target server has no equivalent. An existing server keeps its own
infrastructure; borrow only the missing pieces, and only when the task needs them (each changes every route).

`src/config.js`:

```js
import "dotenv/config";
import { z } from "zod";

// The only module that reads process.env. Everything else imports `config`; a test can scan src/ for violations.

const blankToUndefined = (value) => (value === "" ? undefined : value);
// An empty variable (`SENTRY_DSN=`) means "not set", never a boot failure.
const optional = (schema) => z.preprocess(blankToUndefined, schema.optional());
const originList = (value) =>
  value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const envSchema = z
  .object({
    // Fail safe: an unset NODE_ENV behaves as production (no error details leave the server).
    NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
    PORT: z.coerce.number().int().positive().default(5000),
    LOG_LEVEL: optional(z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])),
    APP_MONGO_URI: optional(z.string().min(1)),
    JWT_SECRET: z.string({ error: "JWT_SECRET is required" }).min(1, "JWT_SECRET is required"),
    JWT_REFRESH_SECRET: z.string({ error: "JWT_REFRESH_SECRET is required" }).min(1, "JWT_REFRESH_SECRET is required"),
    CORS_ORIGINS: z.string().default("").transform(originList),
    REDIS_URL: optional(z.string().regex(/^rediss?:\/\//, "REDIS_URL must start with redis:// or rediss://")),
    SENTRY_DSN: optional(z.url()),
  })
  .superRefine((env, ctx) => {
    // Tests open their own in-memory replica set; every other environment needs a database.
    if (env.NODE_ENV !== "test" && !env.APP_MONGO_URI) {
      ctx.addIssue({ code: "custom", path: ["APP_MONGO_URI"], message: "APP_MONGO_URI is required" });
    }
  });

export class ConfigError extends Error {
  /**
   * Lists every invalid variable in one message.
   * @param {import("zod").ZodError} zodError
   */
  constructor(zodError) {
    super(`Invalid environment: ${zodError.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    this.name = "ConfigError";
  }
}

/**
 * Parses an environment object into the frozen app config.
 * @param {Record<string, string|undefined>} [env] defaults to `process.env`
 * @returns {Readonly<object>} the config every module imports
 * @throws {ConfigError} when a variable is missing or invalid
 */
export const loadConfig = (env = process.env) => {
  const result = envSchema.safeParse(env);
  if (!result.success) throw new ConfigError(result.error);
  const e = result.data;
  return Object.freeze({
    env: e.NODE_ENV,
    isDevelopment: e.NODE_ENV === "development",
    isTest: e.NODE_ENV === "test",
    isProduction: e.NODE_ENV === "production",
    port: e.PORT,
    logLevel: e.LOG_LEVEL ?? (e.NODE_ENV === "development" ? "debug" : "info"),
    mongo: Object.freeze({ appUri: e.APP_MONGO_URI }),
    jwt: Object.freeze({ secret: e.JWT_SECRET, refreshSecret: e.JWT_REFRESH_SECRET }),
    cors: Object.freeze({ origins: e.CORS_ORIGINS }),
    redisUrl: e.REDIS_URL,
    sentryDsn: e.SENTRY_DSN,
    bodyLimit: "100kb",
  });
};

let config;
try {
  config = loadConfig();
} catch (error) {
  // Tests assert on the error; anywhere else an invalid environment stops the boot with a readable message.
  if (process.env.NODE_ENV === "test") throw error;
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

export default config;
```

`src/lib/codes.js`:

```js
// The one registry of machine-readable error codes. `status` is the default HTTP status; `meaning` documents when the
// code is used. Every code passed to AppError must be a key here (AppError throws on an unknown code in development
// and tests), and the OpenAPI error enum can be generated from these keys.

export const CODES = Object.freeze({
  VALIDATION_ERROR: { status: 400, meaning: "Schema failure; errors: [{ field, message }]" },
  INVALID_JSON: { status: 400, meaning: "Request body is not valid JSON" },
  UNAUTHENTICATED: { status: 401, meaning: "Missing or invalid token" },
  FORBIDDEN: { status: 403, meaning: "Authenticated, but not allowed to do this" },
  NOT_FOUND: { status: 404, meaning: "Unknown route or missing resource" },
  ALREADY_CLAIMED: { status: 409, meaning: "Achievement reward already claimed or still locked" },
  PAYLOAD_TOO_LARGE: { status: 413, meaning: "Body over the limit" },
  RATE_LIMITED: { status: 429, meaning: "Too many requests" },
  INTERNAL_ERROR: { status: 500, meaning: "Unexpected error; details hidden outside development" },
  UNAVAILABLE: { status: 503, meaning: "A database or another dependency is unreachable" },
});

/**
 * Whether a code is registered.
 * @param {string} code
 * @returns {boolean}
 */
export const isKnownCode = (code) => Object.hasOwn(CODES, code);

/**
 * The default HTTP status of a registered code.
 * @param {string} code
 * @returns {number|undefined}
 */
export const codeStatus = (code) => CODES[code]?.status;
```

`src/lib/errors.js`:

```js
import config from "../config.js";
import { codeStatus, isKnownCode } from "./codes.js";

// Operational errors carry a stable machine-readable `code` (lib/codes.js) and an HTTP status. The central error
// handler turns them into { success: false, code, message, requestId, errors? }.

export class AppError extends Error {
  /**
   * Builds an operational error with a registered code; the status defaults to the code's status.
   * @param {string} code stable code from lib/codes.js, e.g. "VALIDATION_ERROR"
   * @param {string} message human-readable, safe to show to a client
   * @param {number} [status] defaults to the code's status in lib/codes.js
   * @param {{ errors?: Array<{ field: string, message: string }>, cause?: unknown, data?: object }} [options]
   * @throws {Error} when the code is not registered (development and tests only)
   */
  constructor(code, message, status = codeStatus(code), { errors, cause, data } = {}) {
    // In development and tests an unregistered code is a programming error; in production it must not crash a 4xx.
    if (!isKnownCode(code) && (config.isDevelopment || config.isTest)) {
      throw new Error(`AppError: code "${code}" is not in lib/codes.js`);
    }
    super(message, cause ? { cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.status = status ?? 500;
    this.errors = errors;
    this.data = data; // optional caller-facing detail, sent only below 500
    this.isOperational = true;
  }
}

/**
 * Whether an error is an operational one (an `AppError` or anything flagged `isOperational`).
 * @param {unknown} err
 * @returns {boolean}
 */
export const isAppError = (err) => err instanceof AppError || err?.isOperational === true;

/**
 * A 400 VALIDATION_ERROR from a Zod error.
 * @param {import("zod").ZodError} zodError
 * @param {string} [message]
 * @returns {AppError}
 */
export const validationError = (zodError, message = "Validation failed.") =>
  new AppError("VALIDATION_ERROR", message, 400, {
    errors: zodError.issues.map((issue) => ({ field: issue.path.join(".") || "(root)", message: issue.message })),
  });

/**
 * A 401 UNAUTHENTICATED.
 * @param {string} [message]
 * @returns {AppError}
 */
export const unauthenticated = (message = "Authentication required.") => new AppError("UNAUTHENTICATED", message, 401);

/**
 * A 403 FORBIDDEN.
 * @param {string} [message]
 * @returns {AppError}
 */
export const forbidden = (message = "You do not have access to this resource.") =>
  new AppError("FORBIDDEN", message, 403);

/**
 * A 404 NOT_FOUND.
 * @param {string} [message]
 * @returns {AppError}
 */
export const notFound = (message = "Not found.") => new AppError("NOT_FOUND", message, 404);
```

`src/lib/logger.js`:

```js
import pino from "pino";
import pinoHttp from "pino-http";
import config from "../config.js";

// Structured JSON logs. Never log tokens, passwords or e-mails: every path below is replaced by "[Redacted]".
export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "*.password",
  "*.email",
  "*.accessToken",
  "*.refreshToken",
  "password",
  "email",
  "accessToken",
  "refreshToken",
];

const logger = pino({
  level: config.logLevel,
  redact: { paths: REDACT_PATHS, censor: "[Redacted]" },
  base: { service: "my-api", env: config.env },
});

/**
 * Request fields a log line may carry: id, method and the path without its query string (no headers, no IP).
 * @param {import("http").IncomingMessage & { id?: string }} req
 * @returns {{ id: string|undefined, method: string, path: string }}
 */
export const serializeRequest = (req) => ({ id: req.id, method: req.method, path: (req.url || "").split("?")[0] });

// One line per request with the request id set by requestId.middleware.js; probes are not logged.
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.requestId,
  serializers: { req: serializeRequest, res: (res) => ({ statusCode: res.statusCode }) },
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  autoLogging: { ignore: (req) => req.url === "/health" || req.url === "/ready" },
});

export default logger;
```

`src/db/index.js`:

```js
import mongoose from "mongoose";
import config from "../config.js";
import logger from "../lib/logger.js";

// Named connections, never the default mongoose connection. Without a URI (tests only) the connection is created
// unopened so tests/helpers/db.js can `openUri()` it against an in-memory replica set.
const connect = (uri) => (uri ? mongoose.createConnection(uri) : mongoose.createConnection());

const appConnection = connect(config.mongo.appUri);

appConnection.on("connected", () => logger.info({ db: "app" }, "mongo.connected"));
appConnection.on("error", (err) => logger.error({ db: "app", err: { message: err.message } }, "mongo.error"));

export { appConnection };
```

`src/lib/transaction.js`:

```js
import { appConnection } from "../db/index.js";

// One way to run a MongoDB transaction. The driver retries `fn` on a transient error, so `fn` must be safe to run
// again; side effects (queue, mail, push) belong after the commit, never inside `fn`. The session is always ended.

/**
 * Runs `fn(session)` inside a transaction and returns what its last attempt returned.
 * @template T
 * @param {(session: import("mongoose").ClientSession) => Promise<T>} fn pass `session` to every read and write
 * @param {{ connection?: import("mongoose").Connection }} [options] defaults to the App DB
 * @returns {Promise<T>}
 * @throws {unknown} whatever `fn` threw (the transaction is aborted first), or the commit error
 */
export const withTransaction = async (fn, { connection = appConnection } = {}) => {
  const session = await connection.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};
```

`src/middlewares/requestId.middleware.js`:

```js
import { randomUUID } from "node:crypto";

const SAFE_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Every request gets an id: the caller's `X-Request-Id` when it looks sane, else a UUID. It is returned as the
 * `X-Request-Id` header and as `requestId` in every response body.
 * @param {import("express").Request} req sets `req.requestId` and `req.id`
 * @param {import("express").Response} res sets the `X-Request-Id` header
 * @param {import("express").NextFunction} next
 * @returns {void}
 */
export const requestId = (req, res, next) => {
  const incoming = req.headers["x-request-id"];
  const id = typeof incoming === "string" && SAFE_ID.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  req.id = id;
  res.setHeader("X-Request-Id", id);
  next();
};
```

`src/middlewares/validate.middleware.js`:

```js
import { validationError } from "../lib/errors.js";

/**
 * Middleware factory that parses one request part with a Zod schema at the edge. On success the parsed, stripped
 * value is stored in `req.validated[part]`; on failure the error handler answers 400 VALIDATION_ERROR.
 * @param {import("zod").ZodType} schema
 * @param {"body"|"query"|"params"} [part] which part of the request to parse
 * @returns {import("express").RequestHandler}
 */
export const validate =
  (schema, part = "body") =>
  (req, res, next) => {
    const result = schema.safeParse(req[part] ?? {});
    if (!result.success) return next(validationError(result.error));
    req.validated = { ...(req.validated ?? {}), [part]: result.data };
    return next();
  };
```

`src/middlewares/error.middleware.js`:

```js
import { ZodError } from "zod";
import config from "../config.js";
import { isAppError } from "../lib/errors.js";
import logger from "../lib/logger.js";

/**
 * Sends the error envelope; `errors` is added when defined and `data` only below 500.
 * @param {import("express").Response} res
 * @param {number} status
 * @param {{ code: string, message: string, requestId?: string, errors?: unknown[], data?: object }} body
 * @returns {import("express").Response}
 */
const envelope = (res, status, { code, message, requestId, errors, data }) =>
  res.status(status).json({
    success: false,
    code,
    message,
    requestId,
    ...(errors !== undefined ? { errors } : {}),
    ...(data !== undefined && status < 500 ? { data } : {}),
  });

/**
 * Unknown routes answer with the envelope instead of the Express HTML page.
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @returns {import("express").Response} a 404 NOT_FOUND envelope
 */
export const notFoundHandler = (req, res) =>
  envelope(res, 404, { code: "NOT_FOUND", message: "Not found.", requestId: req.requestId });

/**
 * The one central error handler: maps errors to { success: false, code, message, requestId, errors? }, hides details
 * of 5xx errors outside development, and logs with the request id.
 * @param {unknown} err
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 * @returns {void|import("express").Response}
 */
export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err); // Express convention: let the default handler close the socket
  const requestId = req.requestId;
  const log = req.log ?? logger;

  if (isAppError(err)) {
    const status = err.status ?? 500;
    if (status >= 500) log.error({ err, requestId }, "operational error");
    else log.warn({ code: err.code, status, requestId }, "request failed");
    return envelope(res, status, {
      code: err.code,
      message: status >= 500 && !config.isDevelopment ? "Internal Server Error" : err.message,
      requestId,
      errors: status >= 500 ? undefined : err.errors,
      data: err.data,
    });
  }
  if (err instanceof ZodError) {
    const errors = err.issues.map((i) => ({ field: i.path.join(".") || "(root)", message: i.message }));
    return envelope(res, 400, { code: "VALIDATION_ERROR", message: "Validation failed.", requestId, errors });
  }
  if (err?.type === "entity.too.large") {
    return envelope(res, 413, { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large.", requestId });
  }
  if (err?.type === "entity.parse.failed") {
    return envelope(res, 400, { code: "INVALID_JSON", message: "Request body is not valid JSON.", requestId });
  }

  log.error({ err, requestId }, "unhandled error");
  return envelope(res, 500, {
    code: "INTERNAL_ERROR",
    message: config.isDevelopment ? String(err?.message ?? err) : "Internal Server Error",
    requestId,
  });
};
```

`src/middlewares/auth.middleware.js`:

```js
import jwt from "jsonwebtoken";
import config from "../config.js";
import { unauthenticated } from "../lib/errors.js";
import User from "../models/user.model.js";

// Bearer authentication. The token's `sub` names the user; the row is re-read on every request so a deleted or
// blocked account loses access at once. Identity never comes from the body.

const USER_PROJECTION = { name: 1, type: 1, coins: 1 };

/**
 * The bearer token of the Authorization header.
 * @param {import("express").Request} req
 * @returns {string|null} null when the header is absent or malformed
 */
export const bearerOf = (req) => {
  const header = req.headers.authorization;
  return typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() || null : null;
};

/**
 * Requires a valid access token and sets `req.user` (a lean user row).
 * @param {import("express").Request} req
 * @param {import("express").Response} _res
 * @param {import("express").NextFunction} next
 * @returns {Promise<void>} passes 401 UNAUTHENTICATED to the error handler on any failure
 */
export const authenticate = async (req, _res, next) => {
  try {
    const token = bearerOf(req);
    if (!token) return next(unauthenticated());
    const payload = jwt.verify(token, config.jwt.secret);
    const user = await User.findById(payload.sub, USER_PROJECTION).lean();
    if (!user) return next(unauthenticated());
    req.user = user;
    return next();
  } catch {
    return next(unauthenticated());
  }
};
```

`src/middlewares/rateLimiter.middleware.js`:

```js
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { AppError } from "../lib/errors.js";

// Rate limiters. Every route gets one from the `limiters` registry; it runs after `authenticate` (so it can count per
// user) and before validation (so malformed requests count too). The default store is in memory: with more than one
// instance, give `createLimiter` a shared Redis store that fails open.

const MINUTE = 60 * 1000;

/**
 * Builds a limiter that answers 429 RATE_LIMITED through the error handler.
 * @param {{ windowMs: number, max: number, by?: "user"|"ip" }} options `by: "user"` falls back to the IP for guests
 * @returns {import("express").RequestHandler}
 */
export const createLimiter = ({ windowMs, max, by = "user" }) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => (by === "user" && req.user?._id ? `u:${req.user._id}` : `ip:${ipKeyGenerator(req.ip)}`),
    handler: (_req, _res, next) => next(new AppError("RATE_LIMITED", "Too many requests. Try again later.")),
  });

/** Every route's limiter, by name. */
export const limiters = Object.freeze({
  achievementsRead: createLimiter({ windowMs: MINUTE, max: 60 }),
  achievementClaim: createLimiter({ windowMs: MINUTE, max: 10 }),
});
```

`src/middlewares/cacheControl.middleware.js`:

```js
export const PRIVATE_NO_STORE = "private, no-store";

/**
 * `private, no-store` on every answer of a per-user route, errors included. Mount it first so 401/429 carry it too.
 * @param {import("express").Request} _req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 * @returns {void}
 */
export const noStore = (_req, res, next) => {
  res.setHeader("Cache-Control", PRIVATE_NO_STORE);
  next();
};
```

`src/app.js`:

```js
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import config from "./config.js";
import { appConnection } from "./db/index.js";
import { httpLogger } from "./lib/logger.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import { requestId } from "./middlewares/requestId.middleware.js";
import routes from "./routes/index.js";

// The Express app. Exported without listening so tests can drive it with Supertest; src/index.js listens.
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Request id first so every later log line and error body carries it.
app.use(requestId);
app.use(httpLogger);
app.use(compression({ threshold: 1024 }));
app.use(helmet());
// Provider webhooks that verify a signature over the raw body mount here, before CORS and express.json.

// Browser origins outside the allow-list get no CORS headers; mobile and server-to-server calls send no Origin.
app.use(
  cors({
    origin: (origin, callback) => callback(null, Boolean(origin) && config.cors.origins.includes(origin)),
    credentials: true,
    exposedHeaders: ["X-Request-Id", "RateLimit", "RateLimit-Policy", "Retry-After"],
  })
);
app.use(cookieParser());
app.use(express.json({ limit: config.bodyLimit }));

// Probes: /health answers while the process lives; /ready also needs the database.
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
app.get("/ready", (_req, res) => {
  const ready = appConnection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "unavailable" });
});

app.use("/api", routes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
```

`src/index.js`:

```js
import app from "./app.js";
import config from "./config.js";
import { appConnection } from "./db/index.js";
import logger from "./lib/logger.js";

// Process entry. Unknown state → log and exit; the platform restarts the process.
process.on("unhandledRejection", (reason) => {
  logger.fatal({ err: reason }, "unhandledRejection");
  process.exit(1);
});
process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "uncaughtException");
  process.exit(1);
});

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, "server listening");
});

// Graceful shutdown: stop accepting, finish in-flight requests, close connections; force the exit after 10 s.
const shutdown = (signal) => {
  logger.info({ signal }, "server.shutdown");
  const forceExit = setTimeout(() => process.exit(1), 10_000).unref();
  server.close(async () => {
    await Promise.allSettled([appConnection.close()]);
    clearTimeout(forceExit);
    process.exit(0);
  });
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

`src/routes/index.js`:

```js
import express from "express";
import v2Routes from "./v2/index.js";

// Everything under /api. New endpoints live under /api/v2; frozen legacy routers, if any, mount beside it.
const router = express.Router();

router.use("/v2", v2Routes);

export default router;
```


---

## 2. Models

One model per file on a named connection; enums exported and frozen; indexes after the schema.

`src/models/user.model.js`:

```js
import { Schema } from "mongoose";
import { appConnection } from "../db/index.js";

// `users`: one row per account. Passwords are stored as bcrypt hashes and never selected by default.

export const USER_TYPES = Object.freeze(["student", "parent", "teacher"]);

const userSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true, required: true }, // unique, see the index below
    passwordHash: { type: String, select: false }, // bcrypt; absent for social sign-in
    type: { type: String, enum: USER_TYPES, default: "student" },
    coins: {
      type: Number,
      default: 0,
      min: 0,
      validate: { validator: Number.isInteger, message: "coins must be a whole number" },
    },
  },
  { timestamps: true, collection: "users" }
);

userSchema.index({ email: 1 }, { unique: true });

const User = appConnection.model("User", userSchema);

export default User;
```

`src/models/achievement.model.js`:

```js
import { Schema, Types } from "mongoose";
import { appConnection } from "../db/index.js";

// `achievements`: one row per user per achievement key. Unlocked by the progress code, claimed once by the user;
// `claimedAt` is the reward guard (set once, never cleared).

export const ACHIEVEMENT_KEYS = Object.freeze(["first_set", "ten_sets", "week_streak"]);

const achievementSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", required: true }, // the owner
    key: { type: String, enum: ACHIEVEMENT_KEYS, required: true },
    unlockedAt: { type: Date, default: null }, // null while locked
    claimedAt: { type: Date, default: null }, // set by the one successful claim
    rewardCoins: {
      type: Number,
      default: 0,
      min: 0,
      validate: { validator: Number.isInteger, message: "rewardCoins must be a whole number" },
    },
  },
  { timestamps: true, collection: "achievements" }
);

achievementSchema.index({ userId: 1, key: 1 }, { unique: true });
achievementSchema.index({ claimedAt: 1, unlockedAt: 1 }); // the expiry job's scan

const Achievement = appConnection.model("Achievement", achievementSchema);

export default Achievement;
```


---

## 3. Request schema

Zod 4; messages written for end users; unknown keys stripped.

`src/schemas/achievement.schema.js`:

```js
import { z } from "zod";

// Requests of the achievement routes. Unknown keys are stripped, never rejected, so older clients keep working.

const OBJECT_ID = /^[a-f0-9]{24}$/;

/** The query of GET /api/v2/users/me/achievements: an optional filter, `all` by default. */
export const achievementListQuerySchema = z.object({
  status: z.enum(["all", "claimable"], { error: "Choose all or claimable." }).default("all"),
});

/** The params of POST /api/v2/achievements/:id/claim: a 24-hex id (anything else is a 400, never a cast 500). */
export const achievementParamsSchema = z.object({
  id: z.string().regex(OBJECT_ID, { error: "Unknown achievement." }),
});
```


---

## 4. Service folder

Pure rules, the service (reads, the transactional write, the log line after the commit), and the folder's public API.

`src/services/achievement/achievement.rules.js`:

```js
// Pure achievement rules: no I/O, no clock, no models. Callers pass the rows and the time.

/**
 * Whether an achievement can be claimed: unlocked and not claimed yet.
 * @param {{ unlockedAt?: Date|null, claimedAt?: Date|null } | null | undefined} achievement
 * @returns {boolean}
 */
export const isClaimable = (achievement) => Boolean(achievement?.unlockedAt) && !achievement?.claimedAt;

/**
 * Display order: claimable first, then claimed, then locked; inside a group the most recent unlock first.
 * @param {Array<{ unlockedAt?: Date|null, claimedAt?: Date|null }>} achievements
 * @returns {Array<object>} a new, sorted array
 */
export const sortForDisplay = (achievements) => {
  const group = (a) => (isClaimable(a) ? 0 : a.unlockedAt ? 1 : 2);
  const unlockedTime = (a) => (a.unlockedAt instanceof Date ? a.unlockedAt.getTime() : 0);
  return [...achievements].sort((a, b) => group(a) - group(b) || unlockedTime(b) - unlockedTime(a));
};
```

`src/services/achievement/achievement.service.js`:

```js
import { AppError, notFound } from "../../lib/errors.js";
import logger from "../../lib/logger.js";
import { withTransaction } from "../../lib/transaction.js";
import Achievement from "../../models/achievement.model.js";
import User from "../../models/user.model.js";
import { isClaimable, sortForDisplay } from "./achievement.rules.js";

// Achievement services: the list read and the one-time reward claim. Callers pass plain values, never `req`/`res`,
// so jobs and other domains can call them too.

const FIELDS = { key: 1, unlockedAt: 1, claimedAt: 1, rewardCoins: 1 };

/**
 * The API shape of one achievement row.
 * @param {{ _id: unknown, key: string, unlockedAt: Date|null, claimedAt: Date|null, rewardCoins: number }} row
 * @returns {{ id: string, key: string, unlockedAt: Date|null, claimedAt: Date|null, rewardCoins: number,
 *   claimable: boolean }}
 */
export const toAchievementView = (row) => ({
  id: String(row._id),
  key: row.key,
  unlockedAt: row.unlockedAt,
  claimedAt: row.claimedAt,
  rewardCoins: row.rewardCoins,
  claimable: isClaimable(row),
});

/**
 * The subject's achievements in display order.
 * @param {{ _id: unknown }} subject the signed-in user
 * @param {{ status?: "all"|"claimable" }} [options]
 * @returns {Promise<Array<ReturnType<typeof toAchievementView>>>}
 */
export const listAchievements = async (subject, { status = "all" } = {}) => {
  const rows = await Achievement.find({ userId: subject._id }, FIELDS).lean();
  const visible = status === "claimable" ? rows.filter(isClaimable) : rows;
  return sortForDisplay(visible).map(toAchievementView);
};

/**
 * Claims an unlocked achievement once and credits its coins in the same transaction.
 * @param {{ _id: unknown }} subject the signed-in user
 * @param {string} achievementId a 24-hex id (validated by the route)
 * @param {{ now?: Date, requestId?: string }} [options]
 * @returns {Promise<{ id: string, claimedAt: Date, coinsAdded: number }>}
 * @throws {AppError} NOT_FOUND for an unknown or foreign id; ALREADY_CLAIMED when claimed or still locked
 */
export const claimAchievement = async (subject, achievementId, { now = new Date(), requestId } = {}) => {
  const result = await withTransaction(async (session) => {
    const row = await Achievement.findOne({ _id: achievementId, userId: subject._id }, FIELDS).session(session).lean();
    if (!row) throw notFound("Achievement not found.");
    if (!isClaimable(row)) throw new AppError("ALREADY_CLAIMED", "This reward is not available.");

    // Conditional write: a concurrent claim conflicts here, and the loser sees `modifiedCount: 0` on its retry.
    const { modifiedCount } = await Achievement.updateOne(
      { _id: row._id, claimedAt: null },
      { $set: { claimedAt: now } },
      { session }
    );
    if (modifiedCount !== 1) throw new AppError("ALREADY_CLAIMED", "This reward is not available.");
    await User.updateOne({ _id: subject._id }, { $inc: { coins: row.rewardCoins } }, { session, runValidators: true });
    return { id: String(row._id), key: row.key, claimedAt: now, coinsAdded: row.rewardCoins };
  });

  // After the commit: an aborted attempt never logs a claim. No user id or e-mail in the line.
  logger.info({ event: "achievement.claimed", key: result.key, requestId }, "achievement");
  return { id: result.id, claimedAt: result.claimedAt, coinsAdded: result.coinsAdded };
};
```

`src/services/achievement/index.js`:

```js
// The achievement domain's in-process API: other domains, jobs and controllers import from here, never from the
// files inside the folder.
export { isClaimable } from "./achievement.rules.js";
export { claimAchievement, listAchievements } from "./achievement.service.js";
```


---

## 5. Controller

Thin: validated input → one service call → envelope; errors go to `next`.

`src/controllers/v2/achievement.controller.js`:

```js
import { claimAchievement, listAchievements } from "../../services/achievement/index.js";

// v2 achievement controllers: thin. Validated input in, one service call, the envelope out. The subject is always the
// token holder; nothing in the request can name another user.

/**
 * GET /api/v2/users/me/achievements: the caller's achievements, claimable first.
 * @param {import("express").Request} req `validated.query` is the parsed `achievementListQuerySchema`
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 * @returns {Promise<void>}
 */
export const getMyAchievements = async (req, res, next) => {
  try {
    const achievements = await listAchievements(req.user, { status: req.validated.query.status });
    return res.status(200).json({ success: true, requestId: req.requestId, data: { achievements } });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/v2/achievements/:id/claim: claims the reward once and credits its coins.
 * @param {import("express").Request} req `validated.params.id` is a 24-hex id
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 * @returns {Promise<void>}
 */
export const postClaimAchievement = async (req, res, next) => {
  try {
    const claim = await claimAchievement(req.user, req.validated.params.id, { requestId: req.requestId });
    return res.status(200).json({ success: true, requestId: req.requestId, data: { claim } });
  } catch (error) {
    return next(error);
  }
};
```


---

## 6. Route and mount

The middleware chain in the reference order, then one commented mount line per router.

`src/routes/v2/achievement.route.js`:

```js
import express from "express";
import { getMyAchievements, postClaimAchievement } from "../../controllers/v2/achievement.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { noStore } from "../../middlewares/cacheControl.middleware.js";
import { limiters } from "../../middlewares/rateLimiter.middleware.js";
import { validate } from "../../middlewares/validate.middleware.js";
import { achievementListQuerySchema, achievementParamsSchema } from "../../schemas/achievement.schema.js";

// Achievement routes. Chain: noStore → authenticate → limiter → validate → controller. Per-user answers are never
// cached; the limiter runs before validation so a malformed request still counts.

/** Mounted under /api/v2/users/me: GET /achievements. */
export const myAchievementRoutes = express.Router();
myAchievementRoutes.get(
  "/achievements",
  noStore,
  authenticate,
  limiters.achievementsRead,
  validate(achievementListQuerySchema, "query"),
  getMyAchievements
);

/** Mounted under /api/v2/achievements: POST /:id/claim. */
const router = express.Router();
router.post(
  "/:id/claim",
  noStore,
  authenticate,
  limiters.achievementClaim,
  validate(achievementParamsSchema, "params"),
  postClaimAchievement
);

export default router;
```

`src/routes/v2/index.js`:

```js
import express from "express";
import achievementRoutes, { myAchievementRoutes } from "./achievement.route.js";

// Every v2 router, one commented line per mount: who added it and which endpoints it serves.
const router = express.Router();

// achievements: GET /users/me/achievements
router.use("/users/me", myAchievementRoutes);
// achievements: POST /achievements/:id/claim
router.use("/achievements", achievementRoutes);

export default router;
```


---

## 7. API docs

Typed OpenAPI objects merged into the spec (`swaggerJsdoc({ definition: { …, paths: { ...achievementDocs.paths },
components: { schemas: { ...achievementDocs.schemas } } }, apis: [] })`). Document every status the route can send.

`src/docs/v2/achievement.docs.js`:

```js
// OpenAPI for the achievement routes (src/routes/v2/achievement.route.js), merged into the spec by
// src/config/swagger.config.js. Every documented status is one the route can really send.

const json = (schema) => ({ "application/json": { schema } });
const error = (description) => ({ description, content: json({ $ref: "#/components/schemas/ErrorEnvelope" }) });
const ok = (dataSchema) => ({
  description: "OK",
  content: json({
    type: "object",
    required: ["success", "requestId", "data"],
    properties: { success: { type: "boolean", enum: [true] }, requestId: { type: "string" }, data: dataSchema },
  }),
});

/** Paths and component schemas of the achievement routes. */
export const achievementDocs = {
  paths: {
    "/api/v2/users/me/achievements": {
      get: {
        tags: ["Achievements v2"],
        operationId: "listMyAchievements",
        description: "The caller's achievements, claimable first.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["all", "claimable"], default: "all" } },
        ],
        responses: {
          200: ok({
            type: "object",
            properties: { achievements: { type: "array", items: { $ref: "#/components/schemas/Achievement" } } },
          }),
          400: error("VALIDATION_ERROR"),
          401: error("UNAUTHENTICATED"),
          429: error("RATE_LIMITED"),
        },
      },
    },
    "/api/v2/achievements/{id}/claim": {
      post: {
        tags: ["Achievements v2"],
        operationId: "claimAchievement",
        description: "Claims an unlocked achievement once and credits its coins.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[a-f0-9]{24}$" } }],
        responses: {
          200: ok({ type: "object", properties: { claim: { $ref: "#/components/schemas/AchievementClaim" } } }),
          400: error("VALIDATION_ERROR"),
          401: error("UNAUTHENTICATED"),
          404: error("NOT_FOUND"),
          409: error("ALREADY_CLAIMED"),
          429: error("RATE_LIMITED"),
        },
      },
    },
  },
  schemas: {
    Achievement: {
      type: "object",
      required: ["id", "key", "unlockedAt", "claimedAt", "rewardCoins", "claimable"],
      properties: {
        id: { type: "string" },
        key: { type: "string" },
        unlockedAt: { type: "string", format: "date-time", nullable: true },
        claimedAt: { type: "string", format: "date-time", nullable: true },
        rewardCoins: { type: "integer", minimum: 0 },
        claimable: { type: "boolean" },
      },
    },
    AchievementClaim: {
      type: "object",
      required: ["id", "claimedAt", "coinsAdded"],
      properties: {
        id: { type: "string" },
        claimedAt: { type: "string", format: "date-time" },
        coinsAdded: { type: "integer", minimum: 0 },
      },
    },
  },
};
```


---

## 8. Background job and registry

One handler per file, safe to repeat, batched by `_id`, counts-only logging; the registry maps `domain:action` names
to handlers. The worker process (`src/worker.js`) and queue helper (`enqueue` that returns null when Redis is down)
follow architecture.md §7.

`src/jobs/achievementExpire.job.js`:

```js
import logger from "../lib/logger.js";
import Achievement from "../models/achievement.model.js";

// `achievement:expire` (daily): a reward unlocked more than 90 days ago and never claimed drops to 0 coins. Safe to
// repeat, reads in `_id` batches, logs counts only (no user ids).

export const EXPIRE_AFTER_DAYS = 90;
export const BATCH = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Expires old unclaimed rewards in batches.
 * @param {import("bullmq").Job} job the queue job (only its id is used, for the log line)
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ expired: number }>}
 */
const achievementExpireJob = async (job, { now = new Date() } = {}) => {
  const cutoff = new Date(now.getTime() - EXPIRE_AFTER_DAYS * DAY_MS);
  let expired = 0;
  let after = null;
  for (;;) {
    const rows = await Achievement.find(
      {
        ...(after ? { _id: { $gt: after } } : {}),
        claimedAt: null,
        rewardCoins: { $gt: 0 },
        unlockedAt: { $ne: null, $lte: cutoff },
      },
      { _id: 1 }
    )
      .sort({ _id: 1 })
      .limit(BATCH)
      .lean();
    if (!rows.length) break;
    const { modifiedCount } = await Achievement.updateMany(
      { _id: { $in: rows.map((row) => row._id) }, claimedAt: null },
      { $set: { rewardCoins: 0 } }
    );
    expired += modifiedCount;
    after = rows.at(-1)._id;
  }
  logger.info({ job: job?.id, expired }, "achievement.expire.done");
  return { expired };
};

export default achievementExpireJob;
```

`src/jobs/index.js`:

```js
import achievementExpireJob from "./achievementExpire.job.js";

// Job registry: name → handler. The API only enqueues by name; the worker process runs the handler. An unknown name
// fails the job without retries.

/**
 * Every job name the worker handles (`domain:action`).
 * @type {Readonly<Record<string, string>>}
 */
export const JOB_NAMES = Object.freeze({
  ACHIEVEMENT_EXPIRE: "achievement:expire",
});

const HANDLERS = Object.freeze({
  [JOB_NAMES.ACHIEVEMENT_EXPIRE]: achievementExpireJob,
});

/**
 * The handler registered for a job name.
 * @param {string} name
 * @returns {((job: import("bullmq").Job) => Promise<unknown>) | null} null for an unknown name
 */
export const getJobHandler = (name) => HANDLERS[name] ?? null;
```


---

## 9. Tests

Setup, helpers and factories once; then per feature a pure-rules test, a route test through the real app with
ESM-mocked auth and service (no database), and an integration test against an in-memory replica set.
Run with `node --experimental-vm-modules node_modules/.bin/jest --ci <paths>`.

`tests/setup.js`:

```js
import { faker } from "@faker-js/faker";

// Runs before every test file (jest.config.js setupFilesAfterEnv). Test-only env defaults: placeholders, never real
// secrets. A file may override them before importing src/ (config.js reads process.env on import).
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ??= "test-jwt-secret";
process.env.JWT_REFRESH_SECRET ??= "test-jwt-refresh-secret";
process.env.LOG_LEVEL ??= "silent";

// Seeded so a failing test reproduces.
faker.seed(123);
```

`tests/helpers/db.js`:

```js
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { appConnection } from "../../src/db/index.js";

// One in-memory replica set per test file: transactions need a replica set. Use as
// beforeAll(startDb, DB_START_TIMEOUT_MS); afterEach(clearDb); afterAll(stopDb).

export const DB_START_TIMEOUT_MS = 120000; // the first run downloads the mongod binary

let replSet = null;

export const startDb = async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await appConnection.openUri(replSet.getUri("app"));
  await Promise.all(Object.values(appConnection.models).map((model) => model.init())); // unique indexes exist
};

export const clearDb = async () => {
  const collections = await appConnection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
};

export const stopDb = async () => {
  await appConnection.close();
  await replSet?.stop();
};
```

`tests/helpers/auth.js`:

```js
import jwt from "jsonwebtoken";

// Auth helpers for Supertest calls: real tokens signed with the test JWT_SECRET (tests/setup.js).
export const tokenFor = (user) => jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { expiresIn: "15m" });

export const authHeaders = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });
```

`tests/factories/index.js`:

```js
import { faker } from "@faker-js/faker";
import Achievement from "../../src/models/achievement.model.js";
import User from "../../src/models/user.model.js";

// Factories: `buildX()` returns a plain object, `createX()` saves it. Generated names and example.com e-mails only;
// every default can be overridden: createAchievement(user, { unlockedAt: null }).

let seq = 0;
const next = () => (seq += 1);

export const buildUser = (overrides = {}) => ({
  name: faker.person.firstName(),
  email: `user${next()}-${faker.string.alphanumeric(6).toLowerCase()}@example.com`,
  type: "student",
  coins: 0,
  ...overrides,
});

export const createUser = async (overrides = {}) => User.create(buildUser(overrides));

export const buildAchievement = (user, overrides = {}) => ({
  userId: user._id,
  key: "first_set",
  unlockedAt: new Date("2026-01-01T00:00:00Z"),
  claimedAt: null,
  rewardCoins: 10,
  ...overrides,
});

export const createAchievement = async (user, overrides = {}) => Achievement.create(buildAchievement(user, overrides));
```

`tests/unit/achievement/achievement.rules.test.js`:

```js
import { isClaimable, sortForDisplay } from "../../../src/services/achievement/achievement.rules.js";

// Pure rules: no database, no mocks.
const day = (d) => new Date(`2026-01-${String(d).padStart(2, "0")}T00:00:00Z`);

describe("isClaimable", () => {
  it("is true for an unlocked, unclaimed achievement", () => {
    expect(isClaimable({ unlockedAt: day(1), claimedAt: null })).toBe(true);
  });

  it.each([
    ["locked", { unlockedAt: null, claimedAt: null }],
    ["already claimed", { unlockedAt: day(1), claimedAt: day(2) }],
    ["missing", undefined],
  ])("is false when %s", (_label, achievement) => {
    expect(isClaimable(achievement)).toBe(false);
  });
});

describe("sortForDisplay", () => {
  it("puts claimable first, then claimed, then locked; newest unlock first inside a group", () => {
    const locked = { id: "locked", unlockedAt: null, claimedAt: null };
    const claimed = { id: "claimed", unlockedAt: day(3), claimedAt: day(4) };
    const older = { id: "older", unlockedAt: day(1), claimedAt: null };
    const newer = { id: "newer", unlockedAt: day(5), claimedAt: null };

    expect(sortForDisplay([locked, claimed, older, newer]).map((a) => a.id)).toEqual([
      "newer",
      "older",
      "claimed",
      "locked",
    ]);
  });

  it("returns a new array and leaves the input untouched", () => {
    const input = [{ unlockedAt: null }, { unlockedAt: day(1) }];
    const output = sortForDisplay(input);
    expect(output).not.toBe(input);
    expect(input[0].unlockedAt).toBeNull();
  });
});
```

`tests/unit/achievement/achievementRoutes.test.js`:

```js
import { jest } from "@jest/globals";
import request from "supertest";

// The achievement route chain through the real app (validation, envelope, error handler, cache header) with
// authentication and the service mocked: no database. ESM mocks are declared before the dynamic imports.
const USER = { _id: "64b000000000000000000001", type: "student" };
const listAchievements = jest.fn();
const claimAchievement = jest.fn();

jest.unstable_mockModule("../../../src/middlewares/auth.middleware.js", () => ({
  authenticate: (req, _res, next) => {
    req.user = USER;
    next();
  },
  bearerOf: jest.fn(),
}));
jest.unstable_mockModule("../../../src/services/achievement/index.js", () => ({
  listAchievements,
  claimAchievement,
  isClaimable: jest.fn(),
}));

const { default: app } = await import("../../../src/app.js");
const { AppError } = await import("../../../src/lib/errors.js");

afterEach(() => jest.clearAllMocks());

describe("GET /api/v2/users/me/achievements", () => {
  it("answers the envelope with the service result and never lets it be cached", async () => {
    listAchievements.mockResolvedValue([{ id: "a1", key: "first_set", claimable: true }]);

    const res = await request(app).get("/api/v2/users/me/achievements").expect(200);

    expect(res.body).toEqual({
      success: true,
      requestId: expect.any(String),
      data: { achievements: [{ id: "a1", key: "first_set", claimable: true }] },
    });
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(listAchievements).toHaveBeenCalledWith(USER, { status: "all" });
  });

  it("refuses an unknown status filter with 400 VALIDATION_ERROR and field errors", async () => {
    const res = await request(app).get("/api/v2/users/me/achievements?status=locked").expect(400);

    expect(res.body).toMatchObject({
      success: false,
      code: "VALIDATION_ERROR",
      errors: [{ field: "status", message: "Choose all or claimable." }],
    });
    expect(listAchievements).not.toHaveBeenCalled();
  });
});

describe("POST /api/v2/achievements/:id/claim", () => {
  const id = "64b0000000000000000000aa";

  it("passes the validated id to the service", async () => {
    claimAchievement.mockResolvedValue({ id, claimedAt: "2026-01-02T00:00:00.000Z", coinsAdded: 10 });

    const res = await request(app).post(`/api/v2/achievements/${id}/claim`).expect(200);

    expect(res.body.data.claim.coinsAdded).toBe(10);
    expect(claimAchievement).toHaveBeenCalledWith(USER, id, { requestId: res.body.requestId });
  });

  it("maps an AppError to its registered status and code", async () => {
    claimAchievement.mockRejectedValue(new AppError("ALREADY_CLAIMED", "This reward is not available."));

    const res = await request(app).post(`/api/v2/achievements/${id}/claim`).expect(409);

    expect(res.body).toEqual({
      success: false,
      code: "ALREADY_CLAIMED",
      message: "This reward is not available.",
      requestId: expect.any(String),
    });
  });

  it("answers 400 for a malformed id before the service runs", async () => {
    await request(app).post("/api/v2/achievements/not-an-id/claim").expect(400);
    expect(claimAchievement).not.toHaveBeenCalled();
  });
});
```

`tests/integration/achievement/achievement.int.test.js`:

```js
import request from "supertest";

// The achievement routes with the real app and an in-memory MongoDB replica set: the claim transaction, the reward
// guard and the per-user scope.
const { default: app } = await import("../../../src/app.js");
const { default: Achievement } = await import("../../../src/models/achievement.model.js");
const { default: User } = await import("../../../src/models/user.model.js");
const { createAchievement, createUser } = await import("../../factories/index.js");
const { authHeaders } = await import("../../helpers/auth.js");
const { clearDb, DB_START_TIMEOUT_MS, startDb, stopDb } = await import("../../helpers/db.js");

beforeAll(startDb, DB_START_TIMEOUT_MS);
afterEach(clearDb);
afterAll(stopDb);

const claim = (user, id) => request(app).post(`/api/v2/achievements/${id}/claim`).set(authHeaders(user));

describe("POST /api/v2/achievements/:id/claim", () => {
  it("claims once, credits the coins, and refuses a second claim with 409 ALREADY_CLAIMED", async () => {
    const user = await createUser({ coins: 5 });
    const achievement = await createAchievement(user, { rewardCoins: 10 });

    const first = await claim(user, achievement._id).expect(200);
    expect(first.body.data.claim).toMatchObject({ id: String(achievement._id), coinsAdded: 10 });
    expect((await User.findById(user._id).lean()).coins).toBe(15);

    const second = await claim(user, achievement._id).expect(409);
    expect(second.body.code).toBe("ALREADY_CLAIMED");
    expect((await User.findById(user._id).lean()).coins).toBe(15);
  });

  it("answers 404 for another user's achievement and changes nothing", async () => {
    const owner = await createUser();
    const other = await createUser();
    const achievement = await createAchievement(owner);

    await claim(other, achievement._id).expect(404);
    expect((await Achievement.findById(achievement._id).lean()).claimedAt).toBeNull();
  });

  it("answers 401 without a token", async () => {
    await request(app).post("/api/v2/achievements/64b0000000000000000000aa/claim").expect(401);
  });
});
```
