# my-project-standards

A [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) skill that makes Claude build, extend,
refactor, and review projects using my development standards: folder structure, naming, import order,
component/hook/state patterns, styling, i18n, JSDoc, ESLint + Prettier configuration, and testing.

The standards were extracted from **Gonit**, a production Expo / React Native app (Expo SDK 57, React Native
0.86, React 19, JavaScript + JSDoc, expo-router, Redux Toolkit + RTK Query, NativeWind, i18next, Jest + React
Native Testing Library, Maestro). The skill contains no application source code, credentials, or environment
values - only the conventions, reference configs, and generic code templates.

## What it does

When the skill is active, Claude:

1. **Inspects the target project first** - package manager, framework, language, lint/format/type configs,
   scripts, folder layout, naming signals, env variable names (never values), docs, and git state.
2. **Builds a standards map** - which conventions to adopt, adapt, or defer to the project's own rules.
3. **Places and names files** using the reference layout (or maps it onto the project's existing folders).
4. **Generates code from templates** that already pass the reference ESLint + Prettier config.
5. **Merges configuration instead of overwriting it**, and avoids unnecessary dependencies.
6. **Verifies** with a conventions checker, lint, Prettier, type-check, and non-interactive tests.
7. **Reports** what was applied, what was adapted, what passed, and what couldn't be checked.

It works for new projects and existing ones, and adapts the portable parts (naming, structure-by-domain,
imports, formatting, error handling, i18n, testing, lint discipline) to other stacks such as Next.js, Vite React,
TypeScript projects, and Node backends without forcing React Native technologies onto them.

## Standards captured

| Area | Highlights | Source |
|---|---|---|
| Structure | Root-level `app/` (expo-router), `components/<Domain>/`, `features/<domain>/{<domain>Api,<domain>Slice}.js`, `hooks/use*.js`, `utils/`, `constants/`, `context/`, `providers/`, `store/`, `i18n/`, `__tests__/` mirroring source | code |
| Naming | kebab-case routes, PascalCase components, `use*` hooks, camelCase modules, UPPER_SNAKE constants, snake_case i18n keys and analytics events, kebab-case `testID`s | code |
| Formatting | Prettier: 120 cols, 2 spaces, double quotes, `trailingComma: es5`, `bracketSameLine`, Tailwind class sorting | config |
| Linting | ESLint 9 flat config: `eslint-config-expo` (incl. React Compiler rules), Prettier as error, JSDoc, `i18next/no-literal-string` as error, `max-lines` 120, `no-console` | config |
| Components | Arrow functions, defaulted destructured props, JSDoc, `memo` for list items, `StyleSheet` for shadows, NativeWind classes with `md:`/`lg:` | code |
| State | Redux Toolkit slices with merge/reset reducers; RTK Query via one `apiSlice` + `injectEndpoints`, tags; no thunks | code |
| Async/errors | `async/await`, `try/catch/finally`, `.unwrap()`, global alert service, safe-default storage wrappers | code |
| Testing | Jest (`jest-expo`) + RNTL in `__tests__/`, behaviour-grouped `describe`s, Maestro flows by `testID` | config + code |
| Env | `EXPO_PUBLIC_*` for public runtime config, unprefixed secrets in git-ignored `.env`, `.env.example` | config + inferred |

Every rule in `references/` is labelled **[config]** (enforced by a config file), **[code]** (consistently
demonstrated in source), or **[inferred]** (chosen where the source was inconsistent), and the known
inconsistencies of the reference project are listed together with the rule chosen for new code.

## Repository layout

```
my-project-standards/
├── SKILL.md                         # entry point: when to use, workflow, core rules, guardrails
├── README.md
├── references/
│   ├── project-structure.md         # layout, placement table, naming, feature recipe, bootstrapping
│   ├── coding-conventions.md        # naming, imports, components, hooks, state, data, errors, i18n, JSDoc, tests
│   ├── architecture.md              # stack, layers, bootstrap, routing, state, networking, porting
│   ├── development-rules.md         # ESLint, Prettier, Babel/Metro/Tailwind, scripts, env, git, checklist
│   └── code-templates.md            # copy-ready skeletons for screens, components, hooks, API, slices, tests
├── assets/
│   ├── eslint.config.js             # reference ESLint flat config (Expo)
│   └── prettierrc.json              # reference Prettier config (save as .prettierrc)
└── scripts/
    ├── inspect-project.mjs          # read-only project summary
    └── check-conventions.mjs        # naming/placement/import/size/secret checks ESLint doesn't cover
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

Restart Claude Code (or start a new session) so it picks up the skill. Check that it is listed by asking
"What skills are available?" or by typing `/` and looking for `my-project-standards`.

## Use

Claude loads the skill automatically when a request matches its description - for example starting a project,
adding a screen/component/hook/endpoint/slice, setting up ESLint or Prettier, or asking to follow your conventions.

To invoke it explicitly, type the skill name as a slash command followed by the task:

```
/my-project-standards add an Achievements screen that lists unlocked badges from GET /achievements
```

or mention it in plain language:

```
Use my-project-standards to review the files changed on this branch.
```

### Examples

```text
> /my-project-standards create a new Expo app called "habit-coach" with tabs for Today, History and Settings

> Add a "Notifications" inbox to this app: list from GET /notifications, mark-as-read mutation,
  badge count on the Home header. Follow my standards.

> This is a Next.js 15 project. Use my-project-standards to add an i18n-ready pricing page and
  align the ESLint/Prettier setup with my rules without breaking the existing config.

> /my-project-standards review src/features/cart against my conventions and list violations only

> Set up ESLint and Prettier in this Vite React repo the way I usually do.
```

### Running the scripts yourself

```bash
node ~/.claude/skills/my-project-standards/scripts/inspect-project.mjs .
node ~/.claude/skills/my-project-standards/scripts/check-conventions.mjs --changed
node ~/.claude/skills/my-project-standards/scripts/check-conventions.mjs app components hooks features --json
```

`check-conventions.mjs` exits with code 1 when it finds errors (possible secrets, duplicate slice names), or on
warnings too with `--strict`, so it can run in CI.

## Updating the skill when your standards change

1. Edit the rule in the matching reference file and keep its evidence label honest
   (**[config]** only if a config file enforces it).
2. If a config changed, update `assets/eslint.config.js` / `assets/prettierrc.json` and
   `references/development-rules.md` together.
3. If a pattern changed, update the skeleton in `references/code-templates.md` and the short rule list in
   `SKILL.md` step 5 - keep `SKILL.md` short and push detail into `references/`.
4. If you add a naming or placement rule that ESLint can't enforce, add a check to `scripts/check-conventions.mjs`.
5. Validate: run `node scripts/check-conventions.mjs` against a project that follows the standards, and lint the
   templates with your real ESLint config (paste them into a scratch project and run `npx eslint . && npx prettier --check .`).
6. To re-extract from scratch, ask Claude in your reference project: *"Re-analyse this project and update the
   my-project-standards skill; show me which rules changed."*
7. Commit with a clear message and push; everyone who installed via `git clone` updates with `git pull`.

## Publish and reuse from GitHub

```bash
cd my-project-standards
git init
git add .
git commit -m "Initial release of my-project-standards skill"
git branch -M main
gh repo create my-project-standards --private --source=. --remote=origin --push
# or, without the GitHub CLI:
# git remote add origin https://github.com/<your-github-user>/my-project-standards.git
# git push -u origin main
git tag v1.0.0 && git push origin v1.0.0
```

Install on another machine with the `git clone` command above, and update later with
`git -C ~/.claude/skills/my-project-standards pull`. Add a `LICENSE` file before making the repository public.

## Limitations

- The reference project is a mobile app; backend and web conventions are limited to portable principles.
- The checks in `check-conventions.mjs` are heuristics (no full parser). Treat warnings as prompts to look, and
  rely on ESLint/Prettier for anything they already enforce.
- Library versions in the references reflect Expo SDK 57; check the current Expo/Next docs when bootstrapping.
