# Backend development rules (Node server)

Labels: **[config]** enforced by config or by an automated test · **[code]** consistently demonstrated in source ·
**[inferred]** chosen where the reference was inconsistent or silent.

## Contents

1. ESLint
2. Prettier
3. package.json and scripts
4. Environment variables and secrets
5. Testing
6. API documentation checks
7. Git workflow
8. Verification checklist

---

## 1. ESLint [config]

ESLint 9 flat config, ES module syntax. Verbatim file: `assets/backend/eslint.config.js`. The reference source tree
passes it with **0 errors and 0 warnings** (1,487 files), so new code must too.

| Layer | Purpose |
|---|---|
| `languageOptions.globals: globals.node` | Node globals |
| `no-unused-vars: error` with `varsIgnorePattern: "_$"`, `argsIgnorePattern: "_$"` | Unused names must end in `_` (`omitted_`, `next_`) |
| `files: ["tests/**/*.test.js"]` → `globals.jest` | Jest globals in tests |
| `@eslint/js` recommended | Core correctness rules |
| `eslint-plugin-jsdoc` flat/recommended on `src/**/*.js`, **every rule raised to error** | Documentation is part of the definition of done |

JSDoc rules that matter when writing code:

| Rule | Setting | Meaning |
|---|---|---|
| `jsdoc/require-jsdoc` | error, `publicOnly: true`, FunctionDeclaration + ArrowFunctionExpression + FunctionExpression | Every **exported** function, arrow or not, has a JSDoc block |
| `jsdoc/require-description` | error | The block starts with a sentence |
| `jsdoc/require-param`, `require-param-type`, `check-param-names` | error | Every parameter (and destructured option) documented with a type, names matching |
| `jsdoc/require-returns`, `require-returns-type` | error | `@returns {type}` on every documented function, including `void` / `Promise<void>` |
| `jsdoc/require-throws` | error | `@throws` when the function contains `throw` |
| `jsdoc/check-types` | error | Lowercase primitives (`object`, `string`), `Array<T>` or `T[]` |
| `jsdoc/check-tag-names` | error, plus `swagger`, `openapi` | Only standard tags |
| `require-param-description`, `require-returns-description`, `require-property-description`, `tag-lines`, `no-undefined-types`, `reject-any-type`, `reject-function-type`, `require-throws-type`, `multiline-blocks`, `no-defaults`, `require-yields` | off | Types such as `{import("express").Request}`, `{*}`, `{Function}` are accepted |

Dev dependencies: `eslint ^9`, `@eslint/js ^9`, `globals`, `eslint-plugin-jsdoc ^63`.

Merging into an existing server's config: keep its entries, append the jsdoc block scoped to `src/**/*.js`, add the
`_$` unused-vars pattern only if it doesn't conflict with an existing setting, and never weaken a rule the project
already enforces. TypeScript servers: add `typescript-eslint` and use `jsdoc.configs["flat/recommended-typescript"]`
(types live in TS; the description/params/returns discipline stays). A legacy `.eslintrc` stays legacy unless asked.

## 2. Prettier [config]

Verbatim file: `assets/backend/prettierrc.json` (save as `.prettierrc`):

```json
{ "printWidth": 120, "tabWidth": 2, "singleQuote": false, "semi": true, "trailingComma": "es5" }
```

Check with `npx prettier --check src tests` (`npm run format:check`). Format only the files you change; the reference
has a handful of unformatted files, and reformatting them is a separate chore.

## 3. package.json and scripts [config]

- `"type": "module"`, `"main": "src/index.js"`, npm with `package-lock.json` committed.
- Jest runs under native ESM, so every test script goes through `node --experimental-vm-modules node_modules/.bin/jest`.

| Script | Command | Automation note |
|---|---|---|
| `start` | `node src/index.js` | Long-running - never during verification |
| `dev` | `nodemon src/index.js` | Watch mode - never during verification |
| `worker` / `worker:dev` | `node src/worker.js` / `nodemon src/worker.js` | Long-running |
| `test` | `node --experimental-vm-modules node_modules/.bin/jest` | Safe; exits |
| `test:unit` | same + `--testPathIgnorePatterns tests/integration tests/db tests/child-safety \.perf\.test\.js$` | Fast, no database |
| `test:int` / `test:db` / `test:safety` | jest on `tests/integration tests/infra` / `tests/db` / `tests/child-safety` | Need the in-memory Mongo binary |
| `test:perf` | jest `--runInBand` on `*.perf.test.js` | Run alone |
| `test:coverage` | jest `--coverage` | Enforces the coverage threshold |
| `test:watch` | jest `--watch` | Never during verification |
| `lint` | `eslint .` | Safe |
| `format:check` | `prettier --check src tests` | Safe |
| `lint:openapi` | build the spec, then `spectral lint build/openapi.json --fail-severity warn` | Safe |

For a single file: `node --experimental-vm-modules node_modules/.bin/jest tests/unit/<domain>/<file>.test.js`.

## 4. Environment variables and secrets

- `src/config.js` is the only reader of `process.env` (a test scans `src/` for violations). It loads `.env` through
  `config/dotenv.config.js`, validates with Zod, and exits with a readable message on any invalid value. [config]
- `.env.example` is committed and documents every variable with a comment: purpose, default, what happens when unset,
  and which process needs it. Real values never appear in it. [code]
- `.gitignore`: `.env`, `.env.local`, `.env.*` with `!.env.example`; `service-account*.json`, `*.p8`, `*.pem`;
  `coverage/`, `build/`. [config]
- Secret scanning (gitleaks) runs on the repository; a deliberate false positive goes in `.gitleaksignore`. [config]
- Secrets that are JSON documents or keys are passed as base64 or one-line values in env, never as files in the repo. [code]
- When inspecting a project, read variable **names** only; never print, copy, or commit values.

## 5. Testing

### 5.1 Configuration [config]

`assets/backend/jest.config.js` (from the reference, with its project-specific coverage numbers removed):

- `testEnvironment: "node"`, `transform: {}` (native ESM, no Babel), `testMatch: ["**/tests/**/*.test.js"]`
- `*.perf.test.js` ignored by default (timing tests run alone)
- `setupFilesAfterEnv: ["<rootDir>/tests/setup.js"]`, `testTimeout: 30000`
- `collectCoverageFrom: ["src/**/*.js", "!src/docs/**", "!src/index.js"]`, `coverageReporters: ["text-summary", "lcov"]`
- A coverage **ratchet**: `coverageThreshold` set to the measured baseline; a change may not lower it.

### 5.2 Layout and naming [code]

| Folder | Holds | Suffix |
|---|---|---|
| `tests/unit/<domain>/` | Pure rules, services with mocked modules | `.test.js`, `.rules.test.js`, `.service.test.js` |
| `tests/integration/<domain>/` | The real app over Supertest, in-memory Mongo replica set, mocked Redis | `.int.test.js` |
| `tests/db/` | Indexes, constraints, transactions | `.db.test.js` |
| `tests/child-safety/` (or `security/`) | Data-protection guarantees | `.safety.test.js` |
| `tests/infra/` | Config, error envelope, logger redaction, request id, health, OpenAPI | `.test.js` |
| `tests/jobs/`, `tests/scripts/`, `tests/middlewares/` | Job handlers, migrations, middleware units | `.test.js` |
| `tests/helpers/`, `tests/factories/`, `tests/fixtures/` | Shared test code and data | - |

### 5.3 Patterns [code]

- `tests/setup.js` sets test-only env defaults with `??=` (placeholders, never real secrets), lowers the bcrypt cost,
  seeds faker (`faker.seed(123)`), and blocks real calls to third-party hosts.
- ESM mocking: `jest.unstable_mockModule(path, factory)` **before** a dynamic `await import(...)` of the module under
  test; `import { jest } from "@jest/globals"` for the `jest` object (describe/it/expect are globals).
- Integration suites: `beforeAll(startDb, DB_START_TIMEOUT_MS)`, `afterEach(clearDb)`, `afterAll(stopDb)` from
  `tests/helpers/db.js` (a `MongoMemoryReplSet`); the app is imported after env setup; requests through
  `supertest(app)`; auth through helpers (`authHeaders(user)`, `actingAs(parent, child)`).
- Factories: `buildX(overrides)` returns a plain object, `createX(overrides)` saves it; generated names,
  `example.com` e-mails, no real personal data.
- External HTTP mocked with `nock`, Redis with `ioredis-mock`, S3 with `aws-sdk-client-mock`.
- Assertions check the whole envelope (`toEqual({ success: true, requestId: expect.any(String), data: … })`) and
  headers (`Cache-Control`).
- Integration suites validate every response of a documented operation against the OpenAPI spec.
- Test titles start with the test-plan id when one exists (`"IT-019: …"`); otherwise a behaviour sentence.
- Every bug fix gets a test that fails without the fix.

## 6. API documentation checks [config]

- Every v2 operation has typed docs in `src/docs/v2/<domain>.docs.js`, merged into the generated spec.
- `.spectral.yaml` extends `spectral:oas` and raises to error: `operation-tags`, `operation-operationId`,
  `operation-description`, `operation-success-response`, `oas3-unused-component`, `info-contact`, `info-description`.
- Swagger UI is served at `/api-docs` behind basic auth and is off in production without credentials.

## 7. Git workflow [code]

- Branches: `develop` (integration) → `master` (release); work on `feature/<module>-<ticket>-<slug>`,
  `fix/<module>-<slug>`, `chore/<slug>`, `test/<slug>`; merged through pull requests.
- Commits follow Conventional Commits with the module as scope and the ticket in the subject:
  `feat(practice): BE-020 topic levels and recent sets`, `fix(auth): …`, `test(auth): …`, `chore(auth): …`;
  review follow-ups say so (`fix(practice): BE-022 review fixes`).
- Only commit or push when the user asks.

## 8. Verification checklist

- [ ] `npx eslint <changed files>` (or `npm run lint`): 0 errors, 0 warnings.
- [ ] `npx prettier --check <changed files>`.
- [ ] Unit tests for new rules/services; integration test for each new route (status, envelope, auth, validation, limits).
- [ ] `node --experimental-vm-modules node_modules/.bin/jest <paths>` passes; report DB suites as not run when the
      in-memory Mongo binary can't be downloaded.
- [ ] New error codes registered; new env vars in `config.js` and `.env.example`.
- [ ] No `process.env` outside `config.js`, no `console.*`, no personal data in logs or job payloads.
- [ ] Docs updated for new or changed operations; `npm run lint:openapi` when available.
- [ ] Rate limit on every new route; `noStore` on per-user answers.
- [ ] `check-conventions.mjs` clean of errors.
