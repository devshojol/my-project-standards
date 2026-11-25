---
name: my-project-standards
description: Build, extend, refactor, or review projects using the user's own development standards, extracted from two production codebases - a React Native/Expo app (frontend profile, also used for React and Next.js) and a Node.js/Express API (backend profile). Covers folder layout, naming, imports, component/hook/Redux Toolkit/RTK Query patterns, Express route/controller/service/model layering, Zod validation, error envelopes, logging, config, JSDoc, ESLint + Prettier, and Jest tests. Use it whenever the user asks to start or extend a React, React Native/Expo, Next.js, or Node/Express project - a screen, component, hook, slice, API endpoint, route, controller, service, Mongoose model, middleware, background job, or test - to set up ESLint/Prettier, or says "follow my conventions", "use my standards", "match my project structure", "build it like Gonit", or "review this against my rules", even if they don't name the skill.
---

# My Project Standards

This skill makes Claude create and change code the way the user builds it. It carries two profiles, each extracted
from a production codebase:

| Profile | Use for | Reference codebase | Rules |
|---|---|---|---|
| **frontend** | React Native / Expo apps, React web apps (Vite, CRA), Next.js UI | Expo SDK 57, React Native 0.86, React 19, JavaScript + JSDoc, expo-router, Redux Toolkit + RTK Query, NativeWind, i18next, Jest + RNTL, Maestro | `references/*.md` (top level) |
| **backend** | Node.js servers and APIs (Express by default; Fastify, Koa, Nest by adaptation) | Node ES modules, Express 4, Mongoose 8 on replica sets, Zod 4, pino, Redis + BullMQ, Jest 30 + Supertest | `references/backend/` |

Treat both as standards to apply, not trees to copy. Reproduce the architecture and conventions that fit the target
project; never paste a reference project's whole structure or its product-specific integrations into another project.

## What is in this skill

Frontend files sit at the top of `references/` and `assets/`; backend files in `references/backend/` and `assets/backend/`.

| File (frontend · backend) | Read it when |
|---|---|
| `references/project-structure.md` · `references/backend/project-structure.md` | Deciding where a file goes, naming files and folders, bootstrapping, adding a feature end-to-end |
| `references/coding-conventions.md` · `references/backend/coding-conventions.md` | Before writing or reviewing code |
| `references/architecture.md` · `references/backend/architecture.md` | The change touches bootstrap, routing, state/data flow, cross-cutting services, or you are porting to another framework |
| `references/development-rules.md` · `references/backend/development-rules.md` | Touching ESLint, Prettier, package.json, env vars, test setup, CI commands, or git workflow |
| `references/code-templates.md` · `references/backend/code-templates.md` | Generating any new file - copy the matching skeleton and rename |
| `assets/eslint.config.js`, `assets/prettierrc.json` | Frontend configs for a new Expo project |
| `assets/backend/` | `eslint.config.js`, `prettierrc.json`, `jest.config.js`, `env.example` for a new Node server |
| `scripts/inspect-project.mjs` | Step 3 - read-only summary of the target, including the suggested profile |
| `scripts/check-conventions.mjs` | Step 8 - naming, placement, imports, layer rules and secrets that ESLint doesn't cover (`--profile=auto` by default) |

Both scripts are zero-dependency Node (>= 18) and read-only. Run them with the skill's base directory, e.g.
`node <skill-base-dir>/scripts/inspect-project.mjs .` (the base directory is shown when this skill loads).

## Evidence labels

- **[config]** - enforced by a config file or an automated test in the reference (ESLint, Prettier, Jest, a test that scans the source).
- **[code]** - consistently demonstrated in the reference source (ratios are given where measured).
- **[inferred]** - chosen where the reference was inconsistent or silent; follow unless the target clearly does otherwise.

## Workflow

### 1. Choose the profile

| Target | Profile |
|---|---|
| Expo / React Native, React (Vite, CRA), Next.js pages and components | frontend |
| Node server: Express, Fastify, Koa, Nest, a worker, a CLI that shares server code | backend |
| Next.js route handlers / server actions with real business logic | frontend for the UI; backend rules (validation, envelope, error codes, service layer, config) for the handlers |
| Monorepo with an app and an API | Per package: frontend for the app, backend for the API |
| Neither (Vue, Svelte, Python, …) | Only the portable rules: naming, structure by domain, Prettier settings, JSDoc discipline, error handling, tests |

`inspect-project.mjs` prints a suggested profile; confirm it against the user's request.

### 2. Classify the task

- **A - New project.** Establish the profile's structure and tooling.
- **B - Existing project, same family.** Apply the conventions to new and touched code.
- **C - Existing project, different stack or style.** Apply the portable principles; keep the project's framework choices.
- **D - Review/audit only.** Report findings against the standards; edit nothing unless asked.

### 3. Inspect the target before changing anything

1. Run `node <skill-base-dir>/scripts/inspect-project.mjs <project-root>`: package manager, framework, suggested
   profile, language, configs, scripts (watch-mode ones flagged), directory map, naming signals, env variable
   *names* (never values), docs, and git state.
2. Read in full every config you might touch (ESLint, Prettier, tsconfig/jsconfig, Babel, Tailwind, Jest).
3. Read project guidance if present: `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`.
4. Open 2-3 representative files per layer you will touch. Base decisions on file contents, never on names alone.
5. Record a lint baseline so you can separate new problems from pre-existing ones.
6. Note uncommitted changes in `git status`; don't overwrite or take credit for them.

Then form a short **standards map** for the areas you will touch, marking each **adopt** (target has nothing or
already matches), **adapt** (target has an equivalent; use it with these conventions), or **defer** (target
explicitly differs; keep it). For larger tasks, state the map before editing.

### 4. Resolve conflicts with this precedence

1. Explicit instructions from the user in the current conversation.
2. The target project's enforced configs and written guidelines.
3. The target project's dominant existing pattern in the area being changed (roughly 70%+ of comparable files).
4. This skill: **[config]**, then **[code]**, then **[inferred]**.
5. The framework's official conventions.

When the target wins, say so in one line of the report. Apply these standards to code you create or touch; don't
rewrite working code elsewhere unless the user asks for a migration.

### 5. Plan placement and names

Use the placement table in the profile's `project-structure.md` §2 (`references/` for frontend,
`references/backend/` for backend). Quick reference:

| Frontend need | Location | | Backend need | Location |
|---|---|---|---|---|
| Screen / route | `app/<group>/<route>.jsx` (kebab-case) | | Endpoint | `src/routes/v2/<domain>.route.js` + mount line in `routes/v2/index.js` |
| Domain UI | `components/<Domain>/<Name>.jsx` | | HTTP adapter | `src/controllers/v2/<domain>.controller.js` |
| Shared primitive | `components/Common/<Name>.jsx` | | Business logic | `src/services/<domain>.service.js` or `src/services/<domain>/` |
| Hook | `hooks/use<Name>.js` | | Request schema | `src/schemas/<domain>.schema.js` (Zod) |
| Endpoints (client) | `features/<domain>/<domain>Api.js` | | Collection | `src/models/<name>.model.js` |
| Client state | `features/<domain>/<domain>Slice.js` | | Error code | `src/lib/codes.js` |
| Copy text | `i18n/locales/<lang>/<ns>.json` | | Env var | `src/config.js` + `.env.example` |
| Test | `__tests__/<source path>/<Name>.test.js` | | Test | `tests/unit/<domain>/…test.js`, `tests/integration/<domain>/…int.test.js` |

If the target already uses other folder names for these roles, map each role onto the existing folder instead of
creating a parallel structure. Create folders only when a file needs them.

### 6. Generate code

Copy the matching skeleton from the profile's `code-templates.md` (`references/code-templates.md` or
`references/backend/code-templates.md`), rename consistently, and fill it in.

**Frontend core rules**

1. Components are arrow functions with props destructured and defaulted in the signature, a JSDoc line above, `export default Name` (or `memo(Name)` for list items) after the body. No PropTypes. [code]
2. Imports: one block, packages first, then relative; alphabetical; named specifiers sorted; no extensions on relative imports; no `import React`. [code: 93%]
3. Prettier: 120 columns, 2 spaces, double quotes, `trailingComma: "es5"`, `bracketSameLine`, Tailwind class sorting. [config]
4. At most 120 non-blank, non-comment lines per file; split before disabling `max-lines`. [config]
5. `.jsx` only for files with JSX. [inferred]
6. Every user-visible string through `t()`; snake_case nested keys in every locale. [config]
7. Server data through RTK Query hooks (`apiSlice.injectEndpoints`); client state in slices (`update*` merges, `reset*` returns `initialState`); multi-step logic in hooks. [code]
8. `async/await`, `try/catch`, `.unwrap()` in `try`, loading reset in `finally`, user-facing errors through the alert service. [code]
9. React Compiler-safe hooks: no `setState` in effects (derive), no ref reads in render, no hook-value mutation, no impure calls in render. [config]
10. NativeWind/Tailwind classes with `md:`/`lg:` variants; `StyleSheet` below the export for shadows; themed text component; `cn()` for conditional classes. [code]
11. Kebab-case `testID`s; JSDoc that documents every destructured prop once a block exists; no `console.log`; no hardcoded hosts/keys. [config + code]

**Backend core rules**

1. Node ES modules: `.js` on every relative import, `node:` builtins, named `export const` arrow functions; default exports only for app, routers, models, config, logger, job handlers. [config + code]
2. Layers: route (middleware chain) → controller (thin) → service (logic, transactions) → model/lib. Imports point downward only. [code]
3. Route chain order: `noStore` → `authenticate` → rate limiter → `requireFlag` → `validate(schema, part)` → controller; one commented mount line per router. [code]
4. Controllers: `async (req, res, next)` with `try/catch → next(error)`, read `req.validated[part]`, answer `{ success: true, requestId, data }` with an explicit status. [code]
5. Services take plain arguments (never `req`/`res`), throw `AppError(code, message)` with a code registered in `lib/codes.js`, use `withTransaction` for multi-document writes and log after the commit. [config + code]
6. Zod schemas in `src/schemas/`, user-facing messages, unknown keys stripped. [code]
7. One central error handler and the envelope `{ success: false, code, message, requestId, errors? }`; 5xx details hidden outside development. [code]
8. `src/config.js` is the only reader of `process.env` (Zod-validated, frozen); every variable documented in `.env.example`. [config]
9. pino logger only, structured `{ event: "domain.action" }` lines; never log tokens, e-mails, passwords, or child ids. [config + code]
10. Mongoose models on named connections, `{ timestamps: true, collection }`, frozen enums, indexes after the schema, `.lean()` reads with projections. [code]
11. Strict JSDoc on every exported function (description, typed `@param`s, `@returns`, `@throws`) - lint errors otherwise. [config]
12. Prettier: 120 columns, 2 spaces, double quotes, semicolons, `trailingComma: "es5"`. [config]
13. Tests: unit (pure rules, ESM mocks via `jest.unstable_mockModule` + dynamic import), integration through the real app with Supertest and an in-memory replica set; factories `buildX`/`createX`. [code]
14. Rate limit on every route; `private, no-store` on per-user answers; new endpoints only under `/api/v2`. [code]

### 7. Change configuration only when the task needs it

- Never overwrite an existing config. Read it fully, merge the smallest compatible change, keep its plugins,
  rules, overrides and ignores. Show the user the diff for any config change.
- New Expo project: `assets/eslint.config.js` → `eslint.config.js`, `assets/prettierrc.json` → `.prettierrc`
  (dev dependencies: `references/development-rules.md` §1.2).
- New Node server: `assets/backend/eslint.config.js`, `prettierrc.json` → `.prettierrc`, `jest.config.js`,
  `env.example` → `.env.example` (dependencies: `references/backend/code-templates.md` intro).
- Other stacks: keep the project's base preset and append the portable rule block from the profile's
  `development-rules.md` §1. Drop rules whose plugin is not installed.
- Add a dependency only when the task needs it and nothing installed does the job; use the project's package
  manager (`npx expo install` for Expo native modules); list every added dependency in the report. Never switch
  package manager, module system, state library, router, ORM, or styling system unasked.
- Env vars: add names (never values) to `.env.example`; never print, copy, or commit `.env` contents.

### 8. Verify

Run what exists, scoped to changed files where possible. Never run watch-mode or long-running commands
(`npm test` in the frontend reference is `jest --watchAll`; `npm run dev`, `npm start`, `expo start` never exit).

1. `node <skill-base-dir>/scripts/check-conventions.mjs --changed` (or pass paths). Fix every `error`; fix or justify each `warn`.
2. Lint: the project's lint script or `npx eslint <files>` (`npx expo lint` in Expo projects). Zero new errors.
3. Format: `npx prettier --check <files>`; `--write` only on files you created or changed.
4. Types: `npx tsc --noEmit` when a `tsconfig.json` exists.
5. Tests: frontend `npx jest --ci <paths>` (Vitest: `npx vitest run <paths>`); backend
   `node --experimental-vm-modules node_modules/.bin/jest --ci <paths>`. Add or update tests for new logic.
6. Backend smoke check when cheap: import the app in a test, or boot with a test env and hit `/health`.

If a check cannot run (dependencies missing, a simulator or database binary unavailable, no network), say so
plainly. Never report a check as passing when it did not run.

### 9. Report

```
## Standards report
- Profile and mode: <frontend|backend>, <A/B/C/D> - <framework, language, package manager>
- Created: <files> | Modified: <files>
- Applied: <main conventions applied>
- Adapted or deferred: <where the target's conventions won, and why>
- Checks: conventions <result> · lint <0 new errors (m pre-existing)> · prettier <ok> · types <ok/n.a.> · tests <x passed>
- Not run: <command> - <reason>
- Follow-ups: <pre-existing violations left alone, dependencies to install, open questions>
```

## Adapting to other stacks (summary)

- **TypeScript**: keep TypeScript; JSDoc types become TS types; same naming; `jsdoc.configs["flat/recommended-typescript"]`.
- **React web / Next.js**: frontend profile with `references/architecture.md` §8 (react-router or the App Router, Tailwind, `data-testid`, `VITE_*`/`NEXT_PUBLIC_*`).
- **Other Node frameworks, smaller services, other databases**: backend profile with `references/backend/architecture.md` §9 (what to keep, what to drop until needed).
- **Non-JavaScript stacks**: only the portable rules; say which ones you applied.

## Guardrails

- Don't recreate a reference project's tree; create a directory only when a file needs it.
- Don't overwrite configs, reformat untouched files, or fix unrelated pre-existing lint errors unless asked - list them under Follow-ups.
- Don't add product-specific integrations from the references (payments, attribution, push, analytics vendors, moderation) unless the user asks for that capability.
- Don't copy the anti-patterns listed in each profile's `coding-conventions.md` (frontend §14, backend §16).
- Never put secrets, credentials, service-account files, or real personal data in code, fixtures, logs, or commits.
