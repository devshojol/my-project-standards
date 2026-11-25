# Development rules

Labels: **[config]** enforced by config · **[code]** consistently demonstrated in source · **[inferred]** chosen where the reference was inconsistent or silent.

## Contents

1. ESLint
2. Prettier
3. Babel, Metro, Tailwind, NativeWind
4. Package manager and scripts
5. Environment variables
6. Testing setup
7. Git workflow
8. Verification checklist

---

## 1. ESLint

### 1.1 Reference configuration [config]

ESLint 9 flat config, CommonJS. The verbatim file is `assets/eslint.config.js`. Layers, in order:

| Layer | Purpose |
|---|---|
| `{ ignores: ["dist/**"] }` | Skip build output |
| `eslint-config-expo/flat` | Core JS, React, React Hooks (including React Compiler rules), import plugin, Expo rules, RN globals |
| `eslint-plugin-prettier/recommended` | Runs Prettier as a rule and turns off conflicting stylistic rules |
| `jsdoc.configs["flat/recommended"]` | Validates JSDoc blocks |
| JS/JSX block | jsdoc settings and the `require-jsdoc` policy below |
| Global rules block | Project rules below |
| Test block (`**/*.spec.js`, `**/*.test.js`, `jest.setup.js`) | Jest globals, `max-lines` off |

Project-specific rules:

| Rule | Setting | Meaning for new code |
|---|---|---|
| `prettier/prettier` | error | Formatting drift fails lint |
| `i18next/no-literal-string` | error | No raw text inside JSX; use `t()` |
| `max-lines` | warn, 120, skip comments and blank lines | Split large files |
| `no-console` | warn | No stray logging |
| `react-hooks/exhaustive-deps` | off | Still write complete deps (coding-conventions.md §6) |
| `react/no-unescaped-entities` | off | Apostrophes in JSX allowed (but text should come from `t()` anyway) |
| `jsdoc/require-jsdoc` | warn for FunctionDeclaration, FunctionExpression, MethodDefinition, ClassDeclaration; not arrow functions | Prefer arrow functions; document anyway |
| `jsdoc/require-param-description`, `jsdoc/require-returns-description`, `jsdoc/require-returns` | off | Types required, prose optional |
| jsdoc settings | `mode: "jsdoc"`, `tagNamePreference: { returns: "returns", augments: "extends" }` | Use `@returns`, `@extends` |

Rules inherited from `eslint-config-expo` that matter most in practice:

- React Compiler rules as **errors**: `react-hooks/set-state-in-effect`, `react-hooks/refs`, `react-hooks/immutability`,
  `react-hooks/purity`, `react-hooks/preserve-manual-memoization`.
- `no-unused-vars` (warn) with caught errors allowed only when prefixed `_`.
- `import/*` resolution rules - relative paths must resolve.

Baseline in the reference at extraction time: 38 errors and 33 warnings, almost all from the React Compiler
rules introduced by the SDK 57 config. New code must add zero errors; leave pre-existing ones unless the task
is about them.

### 1.2 Dev dependencies [config]

```
eslint ^9  eslint-config-expo (SDK-matched)  eslint-config-prettier ^10  eslint-plugin-prettier ^5
eslint-plugin-jsdoc ^62  eslint-plugin-i18next ^6  eslint-plugin-jest ^29  prettier ^3  prettier-plugin-tailwindcss ^0.6
```

Expo: `npx expo lint` installs `eslint` and `eslint-config-expo` on first run; then
`npm install --save-dev prettier eslint-plugin-prettier eslint-config-prettier eslint-plugin-jsdoc eslint-plugin-i18next eslint-plugin-jest prettier-plugin-tailwindcss`.

### 1.3 Merging into an existing ESLint config

1. Read the whole file. Identify flat (`eslint.config.*`) vs legacy (`.eslintrc*`, `eslintConfig` in package.json), CJS vs ESM.
2. Keep every existing entry. Append only the missing pieces from §1.4.
3. Never weaken a rule the project already enforces (if it has `react-hooks/exhaustive-deps` on, keep it on).
4. Skip `i18next/no-literal-string` unless the project uses (or is adopting) i18n - otherwise every JSX string errors.
5. Adding `prettier/prettier` to a project that wasn't Prettier-formatted will flag every file. Ask first, or
   scope the new rules to new folders with a `files` glob.
6. Legacy `.eslintrc` projects: add the equivalent `extends`/`plugins`/`rules`; don't migrate to flat config unless asked.
7. Run lint before and after; report the difference.

### 1.4 Portable rule block for non-Expo projects [config, extracted]

Append after the project's own base config (for example `eslint-config-next`, or the Vite template's config).
Use `import` syntax instead of `require` when package.json has `"type": "module"`.

```js
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");
const i18next = require("eslint-plugin-i18next");
const jsdoc = require("eslint-plugin-jsdoc");

const standards = [
  eslintPluginPrettierRecommended,
  jsdoc.configs["flat/recommended"], // TypeScript projects: jsdoc.configs["flat/recommended-typescript"]
  {
    files: ["**/*.js", "**/*.jsx"],
    settings: { jsdoc: { mode: "jsdoc", tagNamePreference: { returns: "returns", augments: "extends" } } },
    rules: {
      "jsdoc/require-jsdoc": [
        "warn",
        {
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: false,
            FunctionExpression: true,
          },
          checkConstructors: false,
        },
      ],
      "jsdoc/require-param-description": "off",
      "jsdoc/require-returns-description": "off",
      "jsdoc/require-returns": "off",
    },
  },
  {
    plugins: { i18next },
    rules: {
      "prettier/prettier": "error",
      "no-console": "warn",
      "i18next/no-literal-string": "error",
      "max-lines": ["warn", { max: 120, skipComments: true, skipBlankLines: true }],
    },
  },
];

module.exports = [...baseConfig, ...standards]; // keep the project's existing export shape
```

Add the test override from the reference (Jest globals via `eslint-plugin-jest`, `max-lines` off for tests) if the
project uses Jest. React projects without the React Compiler rules get no `react-hooks/*` changes from this block.

## 2. Prettier [config]

Verbatim file: `assets/prettierrc.json` (save as `.prettierrc`).

```json
{
  "printWidth": 120,
  "tabWidth": 2,
  "singleQuote": false,
  "bracketSameLine": true,
  "trailingComma": "es5",
  "plugins": ["prettier-plugin-tailwindcss"],
  "overrides": [{ "files": "*.json", "options": { "printWidth": 520 } }]
}
```

- Drop `prettier-plugin-tailwindcss` from `plugins` in projects without Tailwind/NativeWind.
- Every source file in the reference passes `prettier --check`; keep it that way: format only files you change.
- No `.prettierignore` in the reference; generated folders (`ios/`, `android/`, `.expo/`, `dist/`) are git-ignored.
- In an existing project with its own Prettier config, keep the project's options.

## 3. Babel, Metro, Tailwind, NativeWind [config]

`babel.config.js` - NativeWind's JSX import source is disabled under Jest so tests render plain components
(the JSDoc block is an addition: without it `jsdoc/require-jsdoc` warns on this function expression):

```js
/**
 * Babel config: NativeWind JSX transform everywhere except under Jest.
 * @param {object} api
 * @returns {object}
 */
module.exports = function (api) {
  api.cache(true);

  const isTest = process.env.NODE_ENV === "test";

  return {
    presets: [
      ["babel-preset-expo", isTest ? {} : { jsxImportSource: "nativewind" }],
      !isTest && "nativewind/babel",
    ].filter(Boolean),
    plugins: ["react-native-reanimated/plugin"],
  };
};
```

`metro.config.js` - start from Expo's default config (the reference wraps it with Sentry's
`getSentryExpoConfig`), apply `withNativeWind(config, { input: "./global.css", inlineRem: 16 })`, and enable SVG
imports by setting `babelTransformerPath: require.resolve("react-native-svg-transformer/expo")`, removing `svg`
from `assetExts` and adding it to `sourceExts`.

`tailwind.config.js` - shape of the reference (token names are the convention; values are brand-specific):

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        "theme-regular": ["<Font>_400Regular"],
        "theme-medium": ["<Font>_500Medium"],
        "theme-semibold": ["<Font>_600SemiBold"],
        "theme-bold": ["<Font>_700Bold"],
      },
      colors: {
        light: "<app background>",
        primary: "<brand>",
        dark: "<text/dark>",
        textColor: "<body text>",
        success: "<success>",
        support: "<accent>",
        danger: { DEFAULT: "<danger>", dark: "<danger dark>" },
        gray: { light: "<border>", dark: "<border dark>" },
      },
      screens: { md: "720px" },
    },
  },
  plugins: [],
  corePlugins: { preflight: false },
};
```

`global.css` contains only the three `@tailwind` directives; `nativewind-env.d.ts` references `nativewind/types`.

## 4. Package manager and scripts

- npm, pinned via `"packageManager": "npm@<version>"`, with `package-lock.json` committed. [config]
- `"private": true`; `"main": "expo-router/entry"`. [config]
- `"prepare": "npx patch-package"` applies patches from `patches/`. [config]
- In other projects, detect the package manager from the lockfile (`package-lock.json` → npm, `yarn.lock` → yarn,
  `pnpm-lock.yaml` → pnpm, `bun.lockb`/`bun.lock` → bun) and never mix them. [inferred]

Reference scripts [config]:

| Script | Command | Automation note |
|---|---|---|
| `start` | `expo start` | Interactive - never run during verification |
| `android` / `ios` / `web` | `expo run:android` / `expo run:ios` / `expo start --web` | Need devices/simulators |
| `test` | `jest --watchAll` | Never exits - use `npx jest --ci [paths]` |
| `lint` / `lint-fix` | `expo lint` / `expo lint --fix` | Safe to run |
| `prepare` | `npx patch-package` | Runs on install |
| `e2e:build` / `e2e:test` | `scripts/e2e.sh build` / `test` | Release build + Maestro across devices |

For new projects, keep these and add `"test:ci": "jest --ci"` and `"format": "prettier --write ."`. [inferred]

## 5. Environment variables

- `.env` and `.env*.local` are git-ignored. [config]
- Public runtime values use the `EXPO_PUBLIC_` prefix and are read with static access:
  `process.env.EXPO_PUBLIC_API_URL` (no destructuring, no computed keys - Expo inlines them at build time). [config + framework rule]
- Build-time secrets (for example the monitoring auth token used to upload source maps) have **no** public
  prefix so they never reach the bundle, and carry a `# DO NOT COMMIT` comment. [config]
- Commit a `.env.example` with variable names and placeholder values only. [inferred - missing in the reference]
- Don't hardcode API hosts, OAuth client IDs, DSNs, or keys in source (the reference does in a few places; don't copy). [inferred]
- Web equivalents: `NEXT_PUBLIC_*` (Next.js), `VITE_*` (Vite). Node servers follow `backend/development-rules.md` §4 (one Zod-validated `config.js`).
- When inspecting a project, read variable **names** only; never print or copy values.

## 6. Testing setup [config]

package.json `jest` block:

```json
"jest": {
  "preset": "jest-expo",
  "setupFilesAfterEnv": ["./jest.setup.js"],
  "transformIgnorePatterns": [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|nativewind|react-native-css-interop|@reduxjs/toolkit|react-redux|immer)"
  ]
}
```

`jest.setup.js` mocks native or noisy modules globally (Reanimated, worklets, AsyncStorage's official mock,
`@expo/vector-icons`, Firebase, `react-i18next` with `t: (key) => key`, the scale-ratio hook, `expo-blur`,
`expo-image`). Add a global mock there when a new native module breaks many suites; otherwise mock per test file.
A starter version is in `code-templates.md` §12.

E2E: Maestro flows in `.maestro/`, shared sub-flows in `.maestro/common/` and `.maestro/login/`, app id chosen per
platform from env, elements addressed by `testID`. A script builds release binaries and runs flows across a list
of simulators/emulators in batches. [code]

## 7. Git workflow [code]

- Branches: `master` (production), `develop` (integration), `feature/<TICKET>-<optional-slug>`, `release/v<x.y.z>`.
- Commit subject for ticket work: `<TICKET>: <what changed>` (e.g. `ABC-123: set user property on login`; the reference uses its Jira project key).
- Feature branches merge into `develop`; `release/v*` branches are merged back into `develop` after a release.
- No commit hooks (husky/commitlint) are configured; run lint and tests yourself before committing.
- Only commit or push when the user asks.

## 8. Verification checklist

Before reporting a change as done:

- [ ] Files are in the right folders with the right names (`check-conventions.mjs` clean of errors).
- [ ] Lint shows no new errors and no unjustified new warnings.
- [ ] `prettier --check` passes on changed files.
- [ ] Type check passes (TypeScript projects).
- [ ] New logic has tests; related suites pass with `--ci`.
- [ ] Every new user-visible string is a `t()` key present in every locale.
- [ ] New interactive elements have kebab-case `testID`s.
- [ ] No secrets, hosts, or IDs hardcoded; new env names added to `.env.example`.
- [ ] New dependencies justified and listed in the report.
- [ ] Config files merged, not overwritten.
