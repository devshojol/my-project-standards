# my-project-standards

A [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) skill that makes Claude build, extend,
refactor, and review projects using my development standards: folder structure, naming, imports, layering, state and
data patterns, validation, errors, logging, configuration, JSDoc, ESLint + Prettier, and testing.

It has two profiles, each extracted from a production codebase:

| Profile | Applied to | Extracted from |
|---|---|---|
| **frontend** | React Native / Expo, React web (Vite, CRA), Next.js UI | **Gonit** app: Expo SDK 57, React Native 0.86, React 19, JavaScript + JSDoc, expo-router, Redux Toolkit + RTK Query, NativeWind, i18next, Jest + React Native Testing Library, Maestro |
| **backend** | Node.js servers and APIs (Express; Fastify/Koa/Nest by adaptation) | **gonit-api**: Node ES modules, Express 4, Mongoose 8 on MongoDB replica sets, Zod 4, pino, Redis + BullMQ, Jest 30 + Supertest, OpenAPI + Spectral |

Claude picks the profile from the target project (`scripts/inspect-project.mjs` suggests one): a Node server follows
the gonit-api structure, a React or Next.js frontend follows the Gonit app structure. The skill contains no
application source code, credentials, or environment values - only conventions, reference configs, and generic,
tested code templates.

## What it does

When the skill is active, Claude:

1. **Chooses the profile** (frontend, backend, or both in a monorepo / Next.js app with server handlers).
2. **Inspects the target first** - package manager, framework, configs, scripts, folder layout, naming signals, env
   variable names (never values), docs, and git state.
3. **Builds a standards map** - which conventions to adopt, adapt, or defer to the project's own rules.
4. **Places and names files** using the profile's layout, or maps it onto the project's existing folders.
5. **Generates code from templates** that pass the reference ESLint + Prettier configs.
6. **Merges configuration instead of overwriting it**, and avoids unnecessary dependencies.
7. **Verifies** with a conventions checker, lint, Prettier, type-check, and non-interactive tests.
8. **Reports** what was applied, what was adapted, what passed, and what couldn't be checked.

## Standards captured

### Frontend (Gonit app)

| Area | Highlights | Source |
|---|---|---|
| Structure | Root-level `app/` (expo-router), `components/<Domain>/`, `features/<domain>/{<domain>Api,<domain>Slice}.js`, `hooks/use*.js`, `utils/`, `constants/`, `context/`, `providers/`, `store/`, `i18n/`, `__tests__/` mirroring source | code |
| Naming | kebab-case routes, PascalCase components, `use*` hooks, camelCase modules, UPPER_SNAKE constants, snake_case i18n keys, kebab-case `testID`s | code |
| Formatting | Prettier: 120 cols, 2 spaces, double quotes, `es5` trailing commas, `bracketSameLine`, Tailwind class sorting | config |
| Linting | ESLint 9 flat: `eslint-config-expo` (React Compiler rules), Prettier as error, JSDoc, `i18next/no-literal-string`, `max-lines` 120, `no-console` | config |
| Patterns | Arrow components with defaulted props, `memo` list items, RTK Query via one `apiSlice`, merge/reset reducers, NativeWind + `StyleSheet` for shadows | code |

### Backend (gonit-api)

| Area | Highlights | Source |
|---|---|---|
| Structure | `src/{routes/v2,controllers/v2,services/<domain>/,models,schemas,middlewares,lib,utils,constants,config,jobs,docs}`, `src/config.js`, `src/app.js` + `src/index.js` + `src/worker.js`, `tests/{unit,integration,db,…}`, numbered migration scripts | code |
| Naming | `<camelName>.<role>.js` (route, controller, service, model, schema, middleware, job, rules, reader, …), `domain:action` job names, `domain.action` log events, kebab-case URL paths | code |
| Layering | Route chain → thin controller → service (rules, transactions) → model/lib; services never touch `req`/`res` | code |
| API | `/api/v2`, envelope `{ success, requestId, data }` / `{ success: false, code, message, requestId, errors? }`, error-code registry, cursor pagination, rate limit per route, `private, no-store` | code + config |
| Config | One Zod-validated `config.js` is the only reader of `process.env`; documented `.env.example` | config (test-enforced) |
| Quality | ESLint flat with strict JSDoc as errors on `src/`, Prettier 120 cols, Jest ESM with in-memory replica set, OpenAPI checked by Spectral and in tests | config |

Every rule in `references/` is labelled **[config]**, **[code]**, or **[inferred]**, and each profile lists the
inconsistencies found in its reference project together with the rule chosen for new code.

## Repository layout

```
my-project-standards/
├── SKILL.md                    # entry point: profile choice, workflow, core rules, guardrails
├── README.md
├── references/                 # frontend profile: React / React Native / Next.js (Gonit app)
│   ├── project-structure.md
│   ├── coding-conventions.md
│   ├── architecture.md
│   ├── development-rules.md
│   ├── code-templates.md
│   └── backend/                # backend profile: Node servers (gonit-api)
│       ├── project-structure.md
│       ├── coding-conventions.md
│       ├── architecture.md
│       ├── development-rules.md
│       └── code-templates.md
├── assets/
│   ├── eslint.config.js        # frontend (Expo)
│   ├── prettierrc.json         # frontend
│   └── backend/                # eslint.config.js, prettierrc.json, jest.config.js, env.example
└── scripts/
    ├── inspect-project.mjs     # read-only project summary + suggested profile
    └── check-conventions.mjs   # profile-aware naming/layer/import/secret checks
```

Both scripts are zero-dependency Node (>= 18) and never modify files.

## Install

**Personal skill (available in every project):**

```bash
git clone https://github.com/<your-github-user>/my-project-standards.git ~/.claude/skills/my-project-standards
```

**Project skill (shared with everyone who works in one repository):**

```bash
mkdir -p .claude/skills
git clone https://github.com/<your-github-user>/my-project-standards.git .claude/skills/my-project-standards
rm -rf .claude/skills/my-project-standards/.git   # vendor it, or add it as a git submodule instead
```

**From a local copy** (while developing the skill):

```bash
mkdir -p ~/.claude/skills
ln -s "$(pwd)/my-project-standards" ~/.claude/skills/my-project-standards
```

Restart Claude Code (or start a new session) so it picks up the skill. Type `/` and look for
`my-project-standards` to check that it is listed.

## Use

Claude loads the skill automatically when a request matches its description - starting a project, adding a screen,
component, hook, endpoint, route, service, model, or job, setting up ESLint or Prettier, or asking to follow your
conventions. To invoke it explicitly, type the skill name as a slash command followed by the task, or mention it.

### Examples

```text
> /my-project-standards create a Node API called "habit-api" with users, JWT auth and a habits endpoint

> Add POST /api/v2/habits/:id/check-in to this Express server: validate the body, update the streak in a
  transaction, rate limit it, document it, and write unit + integration tests. Follow my standards.

> /my-project-standards create a new Expo app called "habit-coach" with tabs for Today, History and Settings

> Add a "Notifications" inbox to this app: list from GET /notifications, mark-as-read mutation,
  badge count on the Home header.

> This is a Next.js 15 project with route handlers. Use my-project-standards for the pages and the handlers.

> /my-project-standards review src/services against my backend conventions and list violations only
```

### Running the scripts yourself

```bash
node ~/.claude/skills/my-project-standards/scripts/inspect-project.mjs .
node ~/.claude/skills/my-project-standards/scripts/check-conventions.mjs --changed
node ~/.claude/skills/my-project-standards/scripts/check-conventions.mjs src tests --profile=backend --json
```

`check-conventions.mjs` exits with code 1 on errors (possible secrets, missing `.js` extensions in Node ES modules,
duplicate Redux slice names), or on warnings too with `--strict`, so it can run in CI.

## Updating the skill when your standards change

1. Edit the rule in the matching file (`references/` for frontend, `references/backend/` for backend) and keep its evidence label honest
   (**[config]** only if a config file or a test enforces it).
2. If a config changed, update `assets/` (frontend) or `assets/backend/` and the profile's `development-rules.md` together.
3. If a pattern changed, update the skeleton in the profile's `code-templates.md` and the core rule list in
   `SKILL.md` step 6 - keep `SKILL.md` short and push detail into `references/`.
4. If you add a naming, placement, or layer rule ESLint can't enforce, add a check to `scripts/check-conventions.mjs`.
5. Validate: run `node scripts/check-conventions.mjs` against a project that follows the standards, and lint the
   templates with the real ESLint config (paste them into a scratch project and run `npx eslint . && npx prettier --check .`).
6. To re-extract, ask Claude in the reference project: *"Re-analyse this project and update the my-project-standards
   skill (frontend|backend profile); show me which rules changed."*
7. Commit and push; everyone who installed via `git clone` updates with `git pull`.

## Publish and reuse from GitHub

First publish:

```bash
cd my-project-standards
git init
git add .
git commit -m "Initial release of my-project-standards skill"
git branch -M main
gh repo create my-project-standards --private --source=. --remote=origin --push
git tag v1.0.0 && git push origin v1.0.0
```

Later releases:

```bash
git add -A
git commit -m "feat: add backend profile (Node/Express standards)"
git push
git tag v2.0.0 && git push origin v2.0.0
```

Update an installed copy with `git -C ~/.claude/skills/my-project-standards pull`. Add a `LICENSE` file before making
the repository public.

## Limitations

- The checks in `check-conventions.mjs` are heuristics (no full parser). Treat warnings as prompts to look, and rely
  on ESLint/Prettier for what they already enforce.
- Backend integration tests need the `mongodb-memory-server` binary download; where that is blocked, only unit and
  route tests run.
- Versions in the references reflect Expo SDK 57 and the reference API's dependencies at extraction time; check the
  current framework docs when bootstrapping.
