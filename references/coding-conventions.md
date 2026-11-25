# Coding conventions

Labels: **[config]** enforced by config · **[code]** consistently demonstrated in source · **[inferred]** chosen where the reference was inconsistent or silent.
Full skeletons live in `code-templates.md`; this file explains the rules behind them.

## Contents

1. Language and modules
2. Formatting
3. Identifier naming
4. Imports
5. Components
6. Hooks
7. Styling (React Native / NativeWind)
8. Client state (Redux Toolkit)
9. Server state (RTK Query)
10. Async code and error handling
11. Navigation
12. Internationalisation
13. Comments and JSDoc
14. Patterns in the reference not to copy
15. Testing

---

## 1. Language and modules

- JavaScript with JSX, ES modules, no TypeScript source (0 `.ts`/`.tsx` files; `typescript` is installed only for tooling). Types are documented with JSDoc. [code]
- In a TypeScript target, keep TypeScript: turn JSDoc `@param {type}` information into TS types and keep the JSDoc descriptions. [inferred]
- Config files that Node loads directly (`eslint.config.js`, `babel.config.js`, `metro.config.js`, `tailwind.config.js`) use CommonJS `require`/`module.exports`. [code]
- Modern syntax is used freely: optional chaining (`data?.data?.items`), nullish coalescing (`??`), object spread, optional catch binding (`catch {}`), exponent operator. [code]

## 2. Formatting

Prettier owns formatting; ESLint reports any deviation as an error (`prettier/prettier: error`). [config]

| Option | Value |
|---|---|
| `printWidth` | 120 (JSON files: 520, so JSON objects stay on one line where possible) |
| `tabWidth` | 2 spaces |
| `singleQuote` | false - double quotes everywhere, including JSX attributes |
| `semi` | true (Prettier default) |
| `trailingComma` | `"es5"` |
| `bracketSameLine` | true - the `>` of a multi-line JSX opening tag stays on the last attribute line |
| `arrowParens` | `"always"` (default) - `(item) => item.id` |
| plugin | `prettier-plugin-tailwindcss` - sorts `className` utilities |

Never hand-format against these settings; write code, then run Prettier on the files you touched.

## 3. Identifier naming

| Kind | Style | Examples from the reference pattern |
|---|---|---|
| Variables, functions, props | camelCase | `lastPlayedItem`, `getResponsiveFontSize` |
| Components | PascalCase | `ThemedText`, `AchievementList` |
| Module-level constants and maps | UPPER_SNAKE_CASE | `MAX_RETRIES`, `BASE_DELAY`, `IS_TABLET`, `EVENT_NAME_MAP` |
| Event handlers defined in a component | `handle<Action>` | `handleContinue`, `handleBack`, `handleUpdateData` [code: 85] |
| Callback props | `on<Event>` | `onPress`, `onClose`, `onUpdateData`, `onSuccess` [code: 239 uses] |
| Booleans | `is`/`has`/`show`/`should` prefix | `isLoading`, `hasFetched`, `showBlurView`, `shouldRetry` [code] |
| Refs | `<thing>Ref` | `bottomSheetRef`, `listRef` |
| Redux actions | `set<Thing>`, `update<Thing>`, `change<Thing>`, `reset<Thing>`, `clear<Thing>` | `updateLeaderboardQuery`, `resetAllInteraction` |
| Hook return values | object with named fields; booleans first-class | `{ categories, isLoading, isFetching }` |

## 4. Imports

[code: 253 of 271 files with 2+ imports follow this order exactly]

1. A single block at the top of the file, no blank lines between imports.
2. External packages first (`@scope/pkg` and `pkg`), then relative paths (`../`, `./`).
3. Inside each group, sort alphabetically by module path, case-insensitive. Side-effect imports
   (`import "react-native-reanimated";`, `import "../global.css";`) keep their sorted position.
4. Sort named specifiers alphabetically, case-insensitive: `import { FlatList, StyleSheet, View } from "react-native";`,
   `import { router, Stack, useFocusEffect } from "expo-router";`. [code: 380/380 multi-specifier imports]
5. Relative imports only; no path aliases in the reference. Use aliases only if the target project already does.
6. No file extensions on JS/JSX relative imports (`../hooks/useIsPro`). Asset and data imports keep theirs
   (`.svg`, `.json`, `.css`).
7. No `import React from "react"` - the automatic JSX runtime is in use; import only the hooks you need.
8. SVGs are imported as components: `import BackIcon from "../../assets/icons/backIcon.svg";`.

```js
import { router } from "expo-router";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, View } from "react-native";
import { useDispatch, useSelector } from "react-redux";
import BackIcon from "../../assets/icons/backIcon.svg";
import ThemedText from "../../components/Common/ThemedText";
import { useGetAchievementsQuery } from "../../features/achievement/achievementApi";
import useIsPro from "../../hooks/useIsPro";
import handleEvent from "../../utils/analytics";
```

## 5. Components

- Arrow function assigned to a PascalCase `const`; props destructured in the signature with defaults;
  `export default Name;` after the component. [code: 237 vs 3 `export default function`]
- `export default memo(Name)` for list items and pure presentational components rendered many times. [code: 13 files]
- No PropTypes. Document props with JSDoc when they are not self-explanatory. [code]
- Spread remaining props (`...props`) onto the root element only for thin wrappers around a primitive
  (e.g. a themed `Text`). [code]
- One component per file; tiny private helpers in the same file are fine. Pure helpers that need tests are
  exported as **named** exports beside the default export (`export const calculateProgress = ...`). [code]
- Screens in `app/` stay thin: read params and store, call hooks, compose components, handle navigation. [code]
- A section that grows children gets its own folder with a `components/` subfolder (see project-structure.md). [code]
- Keep each file within 120 effective lines [config]; extract a child component or a hook first.
- Static arrays/objects (options, demo data) go at module level above the component, not inside it. [code]
- Order inside a component: selectors and store hooks → RTK Query hooks → local state and refs → derived values
  (`useMemo`) → effects → handlers (`handle*`) → early returns (loading/empty/error) → JSX. [inferred from the cleaner files]
- Conditional rendering: `cond && <X />` for optional pieces, ternaries for either/or, early `return` for loading states. [code]
- Lists: `FlatList` with `keyExtractor`, `renderItem` wrapped in `useCallback` when it closes over props, and memoised item components. [code]
- `testID` on interactive elements and on anything a test asserts, kebab-case (`back-button`, `list-item-${item._id}`). [code: 178 of 195 static testIDs are kebab-case]
- Small touch targets get `hitSlop`; tab buttons get `accessibilityLabel` from `t()`. [code]

## 6. Hooks

- One hook per file in `hooks/`, named `use<Name>`, default export. [code]
- Signature takes an options object when there are 2+ inputs: `useSwitchToProfile({ parentBirthYear, onSuccess } = {})`. [code]
- Return an object with named fields (`{ exhausted, resetRetries }`), or a single value when there is only one (`useIsPro` returns a boolean). [code]
- Module-level tuning constants in UPPER_SNAKE_CASE above the hook (`MAX_RETRIES`, `BASE_DELAY`). [code]
- Wrap returned callbacks in `useCallback` when consumers may put them in dependency arrays. [code]
- Hooks orchestrate: RTK Query hooks + `useSelector` + `dispatch` + analytics + navigation. Components call one hook instead of repeating the steps. [code]
- `react-hooks/exhaustive-deps` is turned off in the reference [config], but write complete dependency arrays
  anyway, as the newer hooks do; it keeps the code correct under the React Compiler rules that are on. [inferred]
- React Compiler rules that are errors [config]: `set-state-in-effect`, `refs`, `immutability`, `purity`,
  `preserve-manual-memoization`. In practice:
  - Derive values during render (`const progress = calc(a, b)` or `useMemo`) instead of `useEffect(() => setX(calc(a, b)))`.
  - Reset state on a key change by giving the component a `key`, not by setting state in an effect.
  - Read and write refs only in handlers and effects.
  - Reanimated shared values: use `sv.set(value)` / `sv.get()` rather than assigning `sv.value` when the lint rule flags it.
  - Keep `Math.random()`, `Date.now()` and similar out of render; compute them in handlers, effects, or a lazy `useState(() => ...)` initialiser.

## 7. Styling (React Native / NativeWind)

- NativeWind `className` for layout, spacing, colour, radius, borders, with `md:` (>= 720 px) and `lg:` (>= 1024 px) variants for tablets. [code: 955 className uses] [config: `screens.md = 720px`]
- Colours and fonts come from theme tokens (`bg-primary`, `text-dark`, `border-gray-light`, `font-theme-bold`); arbitrary values (`h-[58px]`) only for one-off measurements. [code]
- `StyleSheet.create` at the bottom of the file, after the export, for what classes can't express: `boxShadow`,
  `textShadow*`, values computed from screen width. [code: 43 files]
- Inline `style={{ ... }}` only for values computed at render time. [code]
- Conditional classes: `cn(...)` from `utils/cn.js` (`clsx` + `tailwind-merge`) so later classes override earlier ones. The reference often concatenates template strings; `cn` is the safer form for new code. [inferred]
- Text goes through the themed text component (`<ThemedText size={16} weight={600} color={COLORS.dark}>`),
  which maps weight to font family and scales size per breakpoint. Don't use raw `Text` in feature code. [code]
- Pixel sizes for icons and fonts scale with `useGetScaleRatio().getResponsiveFontSize(n)` (ratios 1 / 1.35 / 1.75). [code]
- Breakpoint booleans (`IS_MOBILE`, `IS_MEDIUM_TAB`, `IS_LARGE_TAB`, `IS_TABLET`) come from `constants/constants.js` for logic that classes can't express (column counts, list gaps). [code]
- Keep `constants/styles.js` tokens (`COLORS`, `SHADOWS`) and the `tailwind.config.js` theme in sync. [code]
- Tailwind's `content` globs cover `app/` and `components/` only [config]; keep `className` strings in those folders (hooks and utils shouldn't build class names).

## 8. Client state (Redux Toolkit)

- One slice per domain in `features/<domain>/<domain>Slice.js`. [code]
- `const initialState = { ... }` at the top; every field present with a neutral default (`null`, `""`, `[]`, `false`). [code]
- Reducers: `update<Thing>: (state, action) => { Object.assign(state, action.payload); }` for partial merges;
  `reset<Thing>: () => initialState` to clear; narrow setters for nested objects (`Object.assign(state.query, action.payload)`). [code]
- Export action creators as named exports and the reducer as the default export. [code]
- Slice `name` equals the store key; register the reducer in `store/store.js`. [inferred - see project-structure.md §7]
- No `createAsyncThunk` in the reference: async work lives in RTK Query endpoints or in hooks. [code: 0 uses]
- Read state with inline selectors: `useSelector((state) => state.profile.grade)`. When selecting several
  fields at once, return an object and pass `shallowEqual`. [code]
- Side effects that must follow certain actions (persisting a slice to AsyncStorage, clearing everything on
  logout) live in `store/middleware.js`, written as `(store) => (next) => (action) => { ... }`, comparing
  `action.type === someAction.type`. [code]
- Tokens and the user object live in `expo-secure-store`; non-sensitive cached state in AsyncStorage through
  `utils/asyncStore.js` helpers. [code]

## 9. Server state (RTK Query)

- A single `createApi` in `features/api/apiSlice.js` with `reducerPath: "api"`, the base query, `endpoints: () => ({})`,
  and every `tagTypes` entry. Domain modules call `apiSlice.injectEndpoints`. [code: 11 modules]
- Endpoints return `{ url, method, body }` objects; queries `get<Thing>`, mutations named by verb. [code]
- `providesTags` on queries and `invalidatesTags` on mutations that change the same data. [code]
- Export the generated hooks in one destructuring statement at the end of the module. [code]
- Use `skip` to wait for prerequisites: `useGetThingQuery(arg, { skip: !grade })`. [code]
- Query strings: the reference builds them with a `buildQuery(params)` helper; `fetchBaseQuery`'s `params`
  option does the same job. Use whichever the target already uses; prefer `params` in new projects. [inferred]
- The API responds with an envelope `{ success, data, message }`; read with optional chaining
  (`data?.data?.items ?? []`) and check `result.success` after `.unwrap()`. [code]
- Show `isLoading || isFetching` as the loading state when a refetch should hide stale content. [code]

## 10. Async code and error handling

- `async/await` everywhere (172 uses vs 3 `.then`). Async IIFEs or inner `const run = async () => {}` inside effects. [code]
- `try { ... } catch (error) { ... } finally { setLoading(false); }` around awaited side effects. [code: 65 try blocks]
- Mutations: `const result = await mutate(args).unwrap();` inside `try`; handle `error?.data?.message` / `error?.message` in `catch`. [code]
- Surface failures to the user through the app's alert service (`showAlert(message)`) or `Alert.alert(title, message)`;
  messages come from `t()`. [code + inferred for i18n]
- Storage/device wrappers catch their own errors and return a safe default (`null`) so callers stay simple. [code]
- An intentionally ignored error uses `catch {}` with a comment saying why; unused caught variables must start
  with `_` (`no-unused-vars` allows only `/^_/`). [config]
- Fire-and-forget work (persisting state) is called without `await` and commented as such. [code]
- Retry transient failures with backoff via a hook (`useRetryWithBackoff`) rather than ad-hoc timers. [code]
- Critical bootstrap failures render an error/retry screen instead of continuing with default data. [code]
- Network-level concerns (auth headers, refresh, logout on 401, rate limits) belong in the base query, not in components. [code]

## 11. Navigation (expo-router)

- Imperative navigation with `router.push(path)` / `router.replace(path)` from `expo-router` [code: 66 uses];
  `<Link>` for simple text links. [code: 23]
- Back buttons: `router.canGoBack() ? router.back() : router.replace("(app)")` so deep-linked screens still have a way out. [code]
- Route params via `useLocalSearchParams()`, destructured: `const { courseId, skip } = useLocalSearchParams();`. [code]
- Layouts own navigation configuration: `Stack` with `screenOptions={{ headerShown: false, animation: "none" }}`,
  custom tab bars via `tabBar={(props) => <TabBar {...props} />}`. [code]
- Gate a section in its `_layout.jsx` (render a "please log in" modal when there is no user) instead of
  redirecting from every screen. [code]

## 12. Internationalisation

- `const { t } = useTranslation();` (default namespace `main`) or `useTranslation(["pages", "common"])` with
  `t("key", { ns: "common" })` for other namespaces. [code: 131 files]
- Namespaces: `main` (in-app copy, default), `common` (buttons, labels, alerts, tab names), `pages` (per-screen copy), `auth` (sign-in flows). [code]
- Keys are snake_case, nested by screen → section → element: `home.continue.button.start`. [code: 549/555]
- Interpolation with `{{name}}` placeholders and `t("key", { name })`. [code]
- JSX text literals are lint errors (`i18next/no-literal-string`) [config]. The rule doesn't see strings in plain JS
  (validation messages, `Alert.alert` titles), so route those through `t()` too. [inferred]
- Add every new key to every locale file in the same change. [inferred]

## 13. Comments and JSDoc

- `jsdoc/require-jsdoc` warns on function declarations, function expressions, methods, and classes (not arrow
  functions). `jsdoc/flat/recommended` validates any JSDoc you write. Descriptions for `@param`/`@returns` are
  optional; `@returns` is optional. [config]
- Write a one-line JSDoc for every component, hook and exported function, plus `@param`/`@returns` when the
  shape isn't obvious. Use lowercase `object`, `string`, `boolean`, `number`, and `function(): void` (not `Function`) for types. [code + config]
- Once a function with parameters has a JSDoc block, `jsdoc/require-param` expects **every** parameter and every
  destructured prop to be documented. Document destructured props as `@param {object} props` +
  `@param {type} props.<name> - description`; optional props as `[props.<name>]`. A component without props needs
  only the description line. [config, verified]
- Type `children` as `{object}`: in `jsdoc` mode React types (`React.ReactNode`, `JSX.Element`) are reported as
  undefined, and `*`/`any` are rejected by `jsdoc/reject-any-type`. [config, verified]
- Tailwind's `/** @type {import('tailwindcss').Config} */` header triggers a `jsdoc/valid-types` warning in this
  mode; it's harmless (the reference keeps it). [config]
- Inline comments explain *why* (constraints, server behaviour, edge cases), not *what*. Cite the ticket key for
  non-obvious fixes (`// ... (ABC-123)` style). [code]
- File-level header comment only for screens or modules whose purpose isn't obvious from the name. [code]

## 14. Patterns in the reference not to copy

| Seen in the reference | Why not | Do instead |
|---|---|---|
| `useEffect(() => { setWidth(calc(a)); }, [a])` (22 lint errors) | Extra render, flagged by `set-state-in-effect` | Derive during render or `useMemo` |
| Assigning `sharedValue.value = ...` inside effects (8 errors) | Flagged by `react-hooks/immutability` | `sharedValue.set(...)` |
| `Math.random()` during render | Flagged by `react-hooks/purity` | Compute once in state initialiser or handler |
| API base URL chosen by editing a constant; client IDs and monitoring DSN in source | Secrets/config in git, risky releases | `EXPO_PUBLIC_*` env vars or app config |
| `console.log` in catch blocks (15 warnings) | Noise, `no-console` | Alert service or monitoring; deliberate logs with a disable comment |
| Empty `/** */` JSDoc stubs | Satisfies lint without documenting | Arrow function, or a real one-line description |
| Large blocks of commented-out code | Dead code; git keeps history | Delete it |
| Literal strings in JS (`"Please provide a message"`) | Untranslated | `t()` keys |
| Slice copy-pasted with the wrong `name` | Action type collisions | Slice `name` = store key |
| `.jsx` on files without JSX, `&` in folder names | Inconsistent tooling and paths | See project-structure.md §7 |

## 15. Testing

- Jest with the `jest-expo` preset and React Native Testing Library; `jest.setup.js` holds global mocks for
  native modules (Reanimated, worklets, vector icons, Firebase, blur, image, async storage), `react-i18next`
  (`t: (key) => key`), and the scale-ratio hook. [config + code]
- Tests live in `__tests__/` mirroring the source path; file name `<SourceName>.test.js`. [code]
- `describe("<Name> Component")`, `describe("<name> Hook")`, `describe("<name>Slice")`, with nested `describe`
  blocks per behaviour (`"rendering"`, `"onPress behavior"`, `"loading state"`). [code]
- `test(...)` or `it(...)` with behaviour-first names (`"calls onPress when pressed"`); `test.each` for tables. [code]
- `jest.mock(...)` calls at the top of the file; `afterEach(() => jest.clearAllMocks())`. [code]
- Components: `await render(<X />)`, query by text or `testID`, `await fireEvent.press(...)`. [code]
- Hooks: `renderHook`; mock `react-redux`'s `useSelector` with `mockReturnValueOnce` per selector call, and mock RTK Query hooks from the API module. [code]
- Timing logic: `jest.useFakeTimers()` + `act(async () => jest.advanceTimersByTime(ms))`. [code]
- Slices: call the reducer directly - `reducer(undefined, { type: "@@INIT" })` for the initial state, then each action. [code]
- Because the translation mock returns keys, assert on keys (`getByText("achievements.title")`) for translated text. [code]
- Shared helpers (`getStyleValue`, SVG/image mock factories) in `test-utils/helpers.js`. [code]
- Run non-interactively: `npx jest --ci <paths>`. [inferred - `npm test` is watch mode]
