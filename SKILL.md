---
name: my-project-standards
description: Build, extend, refactor, or review JavaScript/React projects using the user's own development standards, extracted from a production Expo + React Native app - folder layout, file and folder naming, import ordering, component/hook/Redux Toolkit/RTK Query patterns, NativeWind/Tailwind styling, i18n, JSDoc, ESLint flat config + Prettier rules, and Jest testing. Use this skill whenever the user asks to start a new React, React Native/Expo, or Next.js project, add a feature, screen, route, component, hook, API endpoint, Redux slice, or test, set up or align ESLint/Prettier, or says things like "follow my conventions", "use my standards", "match my project structure", or "review this against my rules" - even if they don't name the skill.
---

# My Project Standards

This skill makes Claude create and change code the way the user builds it. The standards were extracted
from a production **Expo SDK 57 / React Native 0.86 / React 19** app written in **JavaScript + JSDoc**, using
**expo-router**, **Redux Toolkit + RTK Query**, **NativeWind (Tailwind)**, **i18next**, **Jest + React Native
Testing Library**, and **Maestro** e2e flows.

Treat it as a standard to apply, not a template to copy. Reproduce the architecture and conventions that fit
the target project; never paste the reference project's whole tree or its product-specific integrations into
another project.

## What is in this skill

| File | Read it when |
|---|---|
| `references/project-structure.md` | Deciding where a file goes, naming files/folders, bootstrapping a new project, adding a feature end-to-end |
| `references/coding-conventions.md` | Before writing or reviewing any code (naming, imports, components, hooks, state, data fetching, errors, i18n, JSDoc, tests) |
| `references/architecture.md` | The change touches app bootstrap, routing, global state, networking, cross-cutting services, or you are porting to another framework |
| `references/development-rules.md` | Touching ESLint, Prettier, Babel/Metro/Tailwind, package.json, env vars, test setup, CI commands, or git workflow |
| `references/code-templates.md` | Generating any new file - copy the matching skeleton and rename |
| `assets/eslint.config.js`, `assets/prettierrc.json` | Setting up lint/format in a new Expo project (verbatim reference configs) |
| `scripts/inspect-project.mjs` | Step 2 - read-only summary of a target project |
| `scripts/check-conventions.mjs` | Step 7 - checks naming, placement, imports, size, and secrets that ESLint does not cover |

Both scripts are zero-dependency Node (>= 18) and read-only. Run them with the skill's base directory, e.g.
`node <skill-base-dir>/scripts/inspect-project.mjs .` (the base directory is shown when this skill loads).

## Evidence labels

Rules in the references carry a label so you know how hard to hold them:

- **[config]** - enforced by a config file in the reference project (ESLint, Prettier, Tailwind, Babel, Jest).
- **[code]** - consistently demonstrated in the reference source (ratios are given where measured).
- **[inferred]** - chosen where the reference was inconsistent or silent; follow unless the target project clearly does otherwise.

## Workflow

### 1. Classify the task

- **A - New project.** Establish the reference structure and tooling, adapted to the requested framework.
- **B - Existing project, same family** (Expo/React Native, or React + Redux Toolkit). Apply conventions directly to new and touched code.
- **C - Existing project, different stack** (Next.js, Vite React, TypeScript-first, Node backend, non-React). Apply only the portable principles; keep the project's framework choices.
- **D - Review/audit only.** Report findings against these standards; edit nothing unless asked.

### 2. Inspect the target before changing anything

1. Run `node <skill-base-dir>/scripts/inspect-project.mjs <project-root>`. It reports package manager,
   framework, language, lint/format/type configs, scripts, directory map, env variable *names*, and git state.
2. Read in full every config you might touch: `eslint.config.*` / `.eslintrc*`, `.prettierrc*`, `tsconfig.json` /
   `jsconfig.json` (path aliases), `babel.config.js`, `tailwind.config.js`, the `jest` block in package.json.
3. Read project guidance if present: `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`.
4. Open 2-3 representative files for each layer you will touch (a screen, a component, a hook, an API module,
   a slice, a test). Base decisions on file contents, never on file names alone.
5. Record a lint baseline (run the project's lint once) so you can separate new problems from pre-existing ones.
6. Note uncommitted changes in `git status`; don't overwrite or take credit for them.

Then form a short **standards map** for the areas you will touch - structure, naming, imports, styling, state,
data fetching, i18n, tests, lint - marking each **adopt** (target has nothing or already matches), **adapt**
(target has an equivalent; use it with these conventions), or **defer** (target explicitly differs; keep it).
For larger tasks, state the map in your reply before editing.

### 3. Resolve conflicts with this precedence

1. Explicit instructions from the user in the current conversation.
2. The target project's enforced configs (its ESLint/Prettier/tsconfig) and its written guidelines.
3. The target project's dominant existing pattern in the area being changed (roughly 70%+ of comparable files).
4. This skill: **[config]** rules, then **[code]**, then **[inferred]**.
5. The framework's official conventions.

When the target wins over this skill, say so in one line of the report (for example: "kept the project's
`src/` + `@/` alias imports instead of root-level relative imports"). Apply these standards to code you create
or touch; do not rewrite working code elsewhere just to match them unless the user asks for a migration.

### 4. Plan placement and names

Use the placement table in `references/project-structure.md` §2. Quick reference for a project shaped like
the reference (root-level folders, no `src/`):

| Need | Location | Name |
|---|---|---|
| Screen / route | `app/<group>/<route>.jsx` | kebab-case; `(group)`, `[param]`, `_layout.jsx`, `index.jsx` |
| Domain UI | `components/<Domain>/<Name>.jsx` | PascalCase folder + file |
| Section with private children | `components/<Domain>/<Section>/<Section>.jsx` + `components/` subfolder | |
| Shared primitive | `components/Common/<Name>.jsx` | |
| Hook | `hooks/use<Name>.js` | one hook per file, default export |
| Endpoints | `features/<domain>/<domain>Api.js` | camelCase domain |
| Client state | `features/<domain>/<domain>Slice.js` | slice `name` = store key = domain |
| Pure helper | `utils/<topic>.js` | camelCase, named exports |
| Constant | `constants/constants.js` | `UPPER_SNAKE_CASE` |
| Copy text | `i18n/locales/<lang>/<namespace>.json` | snake_case nested keys, every locale |
| Test | `__tests__/<source path>/<Name>.test.js` | mirrors the source path |

If the target already uses `src/`, aliases, or different folder names for these roles, map each role onto the
existing folder instead of creating a parallel structure. Create folders only when a file needs them.

### 5. Generate code

Copy the matching skeleton from `references/code-templates.md`, rename consistently, and fill it in. Core rules:

1. **Components** are arrow functions with props destructured and defaulted in the signature, a one-line JSDoc
   above, and `export default Name` (or `export default memo(Name)` for list items) after the body. No PropTypes. [code: 237 arrow vs 3 `export default function`]
2. **Imports**: one block, external packages first, then relative paths; each group sorted alphabetically by
   module path; named specifiers sorted; no extensions on relative JS imports; no `import React`. [code: 93% of files]
3. **Formatting**: Prettier, 120 columns, 2 spaces, double quotes, semicolons, `trailingComma: "es5"`,
   `bracketSameLine: true`, Tailwind classes auto-sorted. [config]
4. **File size**: at most 120 non-blank, non-comment lines. Split into child components or hooks before reaching for `eslint-disable max-lines`. [config: warn]
5. **Extensions**: `.jsx` only for files that contain JSX, `.js` otherwise; in an existing project follow the folder's majority. [inferred]
6. **Text**: every user-visible string goes through `t()` (react-i18next); keys are snake_case and nested by screen/feature; add each key to every locale. [config: error for JSX text]
7. **Server data** comes from RTK Query hooks generated by `apiSlice.injectEndpoints`; components never call `fetch` directly. [code]
8. **Client state**: global in Redux Toolkit slices (`update*` merges with `Object.assign`, `reset*` returns `initialState`); ephemeral UI state in `useState`; multi-step logic in a custom hook. [code]
9. **Async**: `async/await` (172 uses vs 3 `.then`), `try/catch` around awaited side effects, `.unwrap()` on mutations inside `try`, loading flags reset in `finally`, user-facing failure through the project's alert mechanism. Use `catch {}` or an `_`-prefixed name when the error is unused. [code + config]
10. **React Compiler-safe hooks**: no synchronous `setState` inside `useEffect` (derive the value during render or with `useMemo`), no ref reads during render, no mutation of values returned from hooks (Reanimated: `sv.set(v)`), no `Math.random()`/`Date.now()` during render. [config: error]
11. **Styling** (React Native): NativeWind `className` with theme tokens and `md:`/`lg:` variants; `StyleSheet.create` placed below the export for shadows and computed values; text through the project's themed text component; conditional classes via `cn()`. [code]
12. **Testability**: kebab-case `testID` on interactive and asserted elements; pure helpers exported as named exports so they can be unit-tested. [code]
13. **Comments**: JSDoc on components, hooks and exported functions (required by lint for function declarations/expressions). Once a JSDoc block sits on a function with parameters, document every parameter and destructured prop (`@param {object} props`, `@param {string} props.title`), or `jsdoc/require-param` warns. Inline comments explain *why*; cite the ticket key for non-obvious fixes. No empty JSDoc stubs, no commented-out code. [config + code]
14. **Logging**: no `console.log` in committed code; route errors to the monitoring/alert layer. Use `// eslint-disable-next-line no-console` only for deliberate diagnostics. [config: warn]
15. **Config and secrets**: no API hosts, client IDs, DSNs, or keys hardcoded in source; public runtime values via `EXPO_PUBLIC_*` (or the framework's public prefix), secrets unprefixed in an untracked `.env`. [inferred - corrects a weakness of the reference]
16. **Tests**: Jest + React Native Testing Library under `__tests__/`, `describe("<Name> Component")` with nested `describe` per behaviour, `jest.mock` at the top, `afterEach(() => jest.clearAllMocks())`. [code]

### 6. Change configuration only when the task needs it

- Never overwrite an existing config file. Read it fully, then merge the smallest compatible change and keep
  its existing plugins, rules, overrides and ignores. Show the user the diff for any config change.
- New Expo project: copy `assets/eslint.config.js` to `eslint.config.js` and `assets/prettierrc.json` to
  `.prettierrc`, then install the dev dependencies listed in `references/development-rules.md` §1.2.
- Other frameworks: keep the project's base preset and append the portable rule block from
  `references/development-rules.md` §1.4. Drop rules whose plugin is not installed.
- Add a dependency only when the task needs it and nothing installed already does the job. Prefer the
  reference's choices (`references/architecture.md` §1), use the project's package manager (`npx expo install`
  for Expo native modules), and list every added dependency in the report. Never switch package manager, state
  library, router, or styling system in an existing project without being asked.
- Env vars: add names (never values) to `.env.example`; never print, copy, or commit `.env` contents.

### 7. Verify

Run what exists, scoped to the files you changed where possible. Never run watch-mode or interactive commands
(`npm test` in the reference is `jest --watchAll`, and `expo start` never exits).

1. `node <skill-base-dir>/scripts/check-conventions.mjs --changed` (or pass file paths). Fix every `error`; fix or justify each `warn`.
2. Lint: the project's lint script, or `npx eslint <files>` (`npx expo lint` in Expo projects). Zero new errors.
3. Format: `npx prettier --check <files>`; use `--write` only on files you created or changed.
4. Types: `npx tsc --noEmit` when a `tsconfig.json` exists.
5. Tests: `npx jest --ci <related test paths>` (Vitest: `npx vitest run <paths>`). Add or update tests for new logic.
6. Build only when it is cheap and relevant (for example `next build`); skip native builds unless asked.

If a check cannot run (dependencies not installed, needs a simulator, no network), say so plainly. Never report
a check as passing when it did not run.

### 8. Report

End with this structure:

```
## Standards report
- Mode: <A/B/C/D> - <framework, language, package manager detected>
- Created: <files> | Modified: <files>
- Applied: <main conventions applied>
- Adapted or deferred: <where the target project's conventions won, and why>
- Checks: conventions <pass/n warnings> · lint <0 new errors (m pre-existing)> · prettier <ok> · types <ok/n.a.> · tests <x passed>
- Not run: <command> - <reason>
- Follow-ups: <pre-existing violations noticed but left alone, dependencies to install, open questions>
```

## Adapting to other stacks (summary)

- **TypeScript project**: keep TypeScript; translate JSDoc types into TS types; use `.ts`/`.tsx` with the same naming; use `jsdoc.configs["flat/recommended-typescript"]`.
- **React web (Vite / CRA)**: same layer folders under the project's source root; `react-router` routes instead of expo-router; Tailwind instead of NativeWind; `data-testid` instead of `testID`; Redux Toolkit + RTK Query only if the project uses Redux or the user agrees to add it.
- **Next.js**: routes stay in `app/` (`page.jsx`, `layout.jsx`); keep the reference's `components/`, `hooks/`, `features/`, `utils/` split; RTK Query only inside client components; respect the project's server-side data fetching.
- **Node / Express backend**: the reference has no backend code. Apply only formatting, naming, import order, async/error handling, JSDoc, env, and lint discipline; keep the backend's own layering.
- **Other frameworks (Vue, Svelte, ...)**: apply domain-based structure, naming, i18n discipline, testing, and lint/format rules; skip React-specific rules.

Details: `references/architecture.md` §8 and `references/project-structure.md` §5-6.

## Guardrails

- Don't recreate the reference project's tree; create a directory only when a file needs it.
- Don't overwrite configs, don't reformat files you didn't otherwise change, and don't fix unrelated
  pre-existing lint errors unless asked - list them under Follow-ups.
- Don't add product-specific integrations from the reference (payments, attribution, push, session replay)
  unless the user asks for that capability.
- Don't copy the reference project's anti-patterns listed in `references/coding-conventions.md` §14.
