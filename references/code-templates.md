# Code templates

Skeletons that follow every rule in `coding-conventions.md` and pass the reference ESLint + Prettier config.
They use the example domain **achievement** (folders `features/achievement/`, `components/Achievements/`).
Copy the one you need, rename consistently (file, folder, identifiers, tag type, i18n keys, testIDs), and fix the
relative import depth for the real location. Paths assume the reference layout (root-level folders); map them
onto the target project's folders when they differ.

## Contents

1. Base primitives for a new project
2. Screen and layouts
3. Section component with private children
4. Memoised list item
5. Data hook (query + derived data)
6. Action hook (mutation + errors + analytics)
7. RTK Query endpoints
8. Base API slice (new projects)
9. Redux slice and store registration
10. Imperative UI service (Provider + Content + Service)
11. i18n keys
12. Tests
13. Maestro flow

---

## 1. Base primitives for a new project

Create these only if the target project has no equivalent.

`constants/constants.js` - breakpoint flags shared with Tailwind's `md` (720) and `lg` (1024):

```js
import { Dimensions } from "react-native";
const { width } = Dimensions.get("window");

export const IS_MOBILE = width < 720;
export const IS_MEDIUM_TAB = width >= 720 && width < 1024;
export const IS_LARGE_TAB = width >= 1024;
export const IS_TABLET = IS_MEDIUM_TAB || IS_LARGE_TAB;
```

`hooks/useGetScaleRatio.js`:

```js
import { Dimensions } from "react-native";

const getScaleRatio = (width) => {
  if (width >= 1024) return 1.75;
  if (width >= 720) return 1.35;
  return 1;
};

/**
 * Scales font and icon sizes for tablets so layouts keep their proportions.
 * @returns {{getResponsiveFontSize: function(number): number, sizeIncrementRatio: number}}
 */
const useGetScaleRatio = () => {
  const width = Dimensions.get("window").width;
  const sizeIncrementRatio = getScaleRatio(width);

  const getResponsiveFontSize = (size) => size * sizeIncrementRatio;

  return { getResponsiveFontSize, sizeIncrementRatio };
};

export default useGetScaleRatio;
```

`components/Common/ThemedText.jsx` - fonts are registered under semantic family names in the fonts hook
(`useFonts({ DefaultRegular: Poppins_400Regular, ... })`) so the typeface can change in one place:

```jsx
import { Text } from "react-native";
import { COLORS } from "../../constants/styles";
import useGetScaleRatio from "../../hooks/useGetScaleRatio";

const FONT_FAMILY = {
  400: "DefaultRegular",
  500: "DefaultMedium",
  600: "DefaultSemibold",
  700: "DefaultBold",
};

/**
 * Text with the app font, responsive size and a sensible line height.
 * @param {object} props
 * @param {object} props.children
 * @param {string} [props.color]
 * @param {400|500|600|700} [props.weight]
 * @param {number} [props.size] - Phone size in px; scaled up on tablets.
 * @param {string} [props.className]
 * @param {object} [props.style]
 * @param {number} [props.numberOfLines]
 */
const ThemedText = ({
  children,
  color = COLORS.dark,
  weight = 400,
  size = 14,
  className = "",
  style = {},
  numberOfLines = 1,
  ...props
}) => {
  const { sizeIncrementRatio, getResponsiveFontSize } = useGetScaleRatio();
  const hasLineHeightClass = className.includes("leading-");

  const textStyle = {
    fontFamily: FONT_FAMILY[weight] ?? FONT_FAMILY[400],
    fontSize: getResponsiveFontSize(size),
    color,
    ...(!hasLineHeightClass && { lineHeight: size * sizeIncrementRatio * 1.4 }),
    ...style,
  };

  return (
    <Text {...props} numberOfLines={numberOfLines} ellipsizeMode="tail" className={className} style={textStyle}>
      {children}
    </Text>
  );
};

export default ThemedText;
```

`utils/cn.js`:

```js
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const cn = (...inputs) => twMerge(clsx(inputs));

export default cn;
```

## 2. Screen and layouts

`app/(app)/achievements.jsx` - screens only wire things together:

```jsx
import { useTranslation } from "react-i18next";
import AchievementList from "../../components/Achievements/AchievementList/AchievementList";
import Header from "../../components/Common/Header";
import ThemedSafeAreaView from "../../components/Common/ThemedSafeAreaView";

/** Achievements screen: page header plus the user's achievement list */
const Achievements = () => {
  const { t } = useTranslation("pages");

  return (
    <ThemedSafeAreaView className="flex-1 bg-light">
      <Header title={t("achievements.title")} />
      <AchievementList />
    </ThemedSafeAreaView>
  );
};

export default Achievements;
```

Register it where the group layout lists its screens (`app/(app)/_layout.jsx`):

```jsx
<Stack.Screen name="achievements" options={{ headerShown: false }} />
```

A new nested stack, `app/(app)/achievements/_layout.jsx` (then the screen above becomes `achievements/index.jsx`):

```jsx
import { Stack } from "expo-router";

/** Stack for the achievements section */
const AchievementsLayout = () => {
  return (
    <Stack initialRouteName="index" screenOptions={{ headerShown: false, animation: "none" }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
};

export default AchievementsLayout;
```

Reading params in `app/(app)/achievements/[id].jsx`: `const { id } = useLocalSearchParams();`
Navigating: `` router.push(`/achievements/${id}`) ``; back: `router.canGoBack() ? router.back() : router.replace("(app)")`.

## 3. Section component with private children

`components/Achievements/AchievementList/AchievementList.jsx`:

```jsx
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, StyleSheet, View } from "react-native";
import useAchievements from "../../../hooks/useAchievements";
import useClaimAchievement from "../../../hooks/useClaimAchievement";
import PageLoader from "../../Common/PageLoader";
import ThemedText from "../../Common/ThemedText";
import AchievementItem from "./components/AchievementItem";

/** Lists unlocked achievements first; tapping an unlocked one claims its reward */
const AchievementList = () => {
  const { t } = useTranslation("pages");
  const { achievements, unlockedCount, isLoading } = useAchievements();
  const { claim } = useClaimAchievement();

  const renderItem = useCallback(({ item }) => <AchievementItem item={item} onPress={claim} />, [claim]);

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <View testID="achievement-list" className="flex-1 gap-3 px-5 md:px-6 lg:px-8">
      <ThemedText size={18} weight={600}>
        {t("achievements.unlocked_count", { count: unlockedCount })}
      </ThemedText>
      <FlatList
        data={achievements}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

export default AchievementList;

const styles = StyleSheet.create({
  list: {
    gap: 12,
    paddingBottom: 24,
  },
});
```

## 4. Memoised list item

`components/Achievements/AchievementList/components/AchievementItem.jsx`:

```jsx
import { memo } from "react";
import { Pressable, StyleSheet } from "react-native";
import { SHADOWS } from "../../../../constants/styles";
import cn from "../../../../utils/cn";
import ThemedText from "../../../Common/ThemedText";

/**
 * One achievement row; dimmed and inert while locked.
 * @param {object} props
 * @param {object} props.item - Achievement from the API.
 * @param {function(string): void} [props.onPress] - Receives the achievement id.
 */
const AchievementItem = ({ item, onPress = () => {} }) => {
  const isLocked = !item.unlockedAt;

  return (
    <Pressable
      testID={`achievement-item-${item._id}`}
      disabled={isLocked}
      onPress={() => onPress(item._id)}
      style={styles.card}
      className={cn(
        "flex-row items-center gap-3 rounded-xl border border-gray-light bg-white p-4 md:rounded-2xl lg:p-5",
        isLocked && "opacity-50"
      )}>
      <ThemedText size={16} weight={500} className="flex-1">
        {item.title}
      </ThemedText>
    </Pressable>
  );
};

export default memo(AchievementItem);

const styles = StyleSheet.create({
  card: {
    boxShadow: SHADOWS.gray,
  },
});
```

## 5. Data hook (query + derived data)

`hooks/useAchievements.js`:

```js
import { useMemo } from "react";
import { useSelector } from "react-redux";
import { useGetAchievementsQuery } from "../features/achievement/achievementApi";

/**
 * Loads achievements for the selected grade, unlocked ones first.
 * @returns {{achievements: object[], unlockedCount: number, isLoading: boolean, isError: boolean, refetch: function(): void}}
 */
const useAchievements = () => {
  const grade = useSelector((state) => state.profile.grade);
  const { data, isLoading, isFetching, isError, refetch } = useGetAchievementsQuery({ grade }, { skip: !grade });

  const achievements = useMemo(() => {
    const items = data?.data?.achievements ?? [];
    return [...items].sort((a, b) => Number(Boolean(b.unlockedAt)) - Number(Boolean(a.unlockedAt)));
  }, [data]);

  const unlockedCount = achievements.filter((item) => item.unlockedAt).length;

  return { achievements, unlockedCount, isLoading: isLoading || isFetching, isError, refetch };
};

export default useAchievements;
```

## 6. Action hook (mutation + errors + analytics)

`hooks/useClaimAchievement.js`:

```js
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { showAlert } from "../context/alert/AlertService";
import { useClaimAchievementMutation } from "../features/achievement/achievementApi";
import handleEvent from "../utils/analytics";

/**
 * Claims an unlocked achievement and reports failures through the global alert.
 * @returns {{claim: function(string): Promise<boolean>, isClaiming: boolean}}
 */
const useClaimAchievement = () => {
  const { t } = useTranslation("common");
  const [claimAchievement, { isLoading: isClaiming }] = useClaimAchievementMutation();

  const claim = useCallback(
    async (id) => {
      try {
        const result = await claimAchievement(id).unwrap();
        if (result?.success) {
          handleEvent("achievement_claimed", { achievement_id: id });
        }
        return Boolean(result?.success);
      } catch (error) {
        showAlert(error?.data?.message ?? t("alerts.error.generic"));
        return false;
      }
    },
    [claimAchievement, t]
  );

  return { claim, isClaiming };
};

export default useClaimAchievement;
```

## 7. RTK Query endpoints

`features/achievement/achievementApi.js` (and add `"Achievement"` to `tagTypes` in `features/api/apiSlice.js`):

```js
import { apiSlice } from "../api/apiSlice";

const achievementApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAchievements: builder.query({
      query: (params) => ({
        url: "achievements",
        method: "GET",
        params,
      }),
      providesTags: ["Achievement"],
    }),
    claimAchievement: builder.mutation({
      query: (id) => ({
        url: `achievements/${id}/claim`,
        method: "POST",
      }),
      invalidatesTags: ["Achievement"],
    }),
  }),
});

export const { useGetAchievementsQuery, useClaimAchievementMutation } = achievementApi;
```

## 8. Base API slice (new projects)

`features/api/apiSlice.js` - one `createApi` for the whole app. Add single-flight token refresh only if the
backend issues refresh tokens (see architecture.md §6).

```js
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { logout } from "../auth/authSlice";

const baseQuery = fetchBaseQuery({
  baseUrl: process.env.EXPO_PUBLIC_API_URL,
  prepareHeaders: (headers, { getState }) => {
    const accessToken = getState()?.auth?.accessToken;
    if (accessToken && !headers.get("Authorization")) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
    return headers;
  },
});

const baseQueryWithReauth = async (args, api, extraOptions) => {
  const result = await baseQuery(args, api, extraOptions);
  if (result?.error?.status === 401) {
    api.dispatch(logout());
  }
  return result;
};

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  endpoints: () => ({}),
  tagTypes: ["Achievement"],
});
```

## 9. Redux slice and store registration

`features/achievement/achievementSlice.js` - only for client state the server doesn't own:

```js
import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  filter: "all",
  selectedId: null,
};

const achievementSlice = createSlice({
  name: "achievement",
  initialState,
  reducers: {
    updateAchievement: (state, action) => {
      Object.assign(state, action.payload);
    },
    resetAchievement: () => initialState,
  },
});

export const { updateAchievement, resetAchievement } = achievementSlice.actions;
export default achievementSlice.reducer;
```

`store/store.js`:

```js
import { configureStore } from "@reduxjs/toolkit";
import achievementReducer from "../features/achievement/achievementSlice";
import { apiSlice } from "../features/api/apiSlice";
import authReducer from "../features/auth/authSlice";

export const store = configureStore({
  reducer: {
    achievement: achievementReducer,
    auth: authReducer,

    [apiSlice.reducerPath]: apiSlice.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(apiSlice.middleware),
});
```

Middleware that reacts to an action (`store/middleware.js`):

```js
import { updateAchievement } from "../features/achievement/achievementSlice";
import { saveAchievementToAsyncStorage } from "../utils/asyncStore";

export const persistAchievementMiddleware = (store) => (next) => (action) => {
  const result = next(action);
  if (action.type === updateAchievement.type) {
    // Fire-and-forget so the UI thread isn't blocked by storage I/O
    saveAchievementToAsyncStorage(store.getState().achievement);
  }
  return result;
};
```

## 10. Imperative UI service (Provider + Content + Service)

Lets any module - hooks, middleware, utils - open global UI without prop drilling or React Context.

`context/toast/ToastService.js`:

```js
let showToastFn;

export const setToastFn = (fn) => {
  showToastFn = fn;
};

export const showToast = (message) => {
  if (showToastFn) {
    showToastFn(message);
  }
};
```

`context/toast/ToastProvider.jsx` (mount it inside `providers/AppProviders.jsx`):

```jsx
import { useCallback, useEffect, useState } from "react";
import ToastContent from "./ToastContent";
import { setToastFn } from "./ToastService";

/**
 * Renders the app plus the global toast, and lets showToast() open it from anywhere.
 * @param {object} props
 * @param {object} props.children
 */
export const ToastProvider = ({ children }) => {
  const [message, setMessage] = useState("");

  const hideToast = useCallback(() => setMessage(""), []);

  useEffect(() => {
    setToastFn(setMessage);
  }, []);

  return (
    <>
      {children}
      <ToastContent visible={Boolean(message)} message={message} onClose={hideToast} />
    </>
  );
};
```

`context/toast/ToastContent.jsx`:

```jsx
import { Pressable } from "react-native";
import ThemedText from "../../components/Common/ThemedText";

/**
 * Bottom toast; tapping it dismisses it.
 * @param {object} props
 * @param {boolean} props.visible
 * @param {string} props.message - Already translated.
 * @param {function(): void} props.onClose
 */
const ToastContent = ({ visible, message, onClose }) => {
  if (!visible) {
    return null;
  }

  return (
    <Pressable testID="toast" onPress={onClose} className="absolute bottom-10 left-5 right-5 rounded-xl bg-dark p-4">
      <ThemedText color="white" numberOfLines={2}>
        {message}
      </ThemedText>
    </Pressable>
  );
};

export default ToastContent;
```

## 11. i18n keys

Add to **every** locale (`i18n/locales/<lang>/pages.json`; shared strings go in `common.json`):

```json
{
  "achievements": {
    "title": "Achievements",
    "unlocked_count": "Unlocked: {{count}}",
    "empty": {
      "title": "No achievements yet",
      "subtitle": "Finish a lesson to earn your first badge"
    }
  }
}
```

Usage: `t("achievements.title")` with `useTranslation("pages")`, or `t("buttons.submit", { ns: "common" })`.

## 12. Tests

Paths mirror the source tree under `__tests__/`.

`__tests__/components/Achievements/AchievementList/components/AchievementItem.test.js`:

```jsx
import { fireEvent, render } from "@testing-library/react-native";
import AchievementItem from "../../../../../components/Achievements/AchievementList/components/AchievementItem";

describe("AchievementItem Component", () => {
  const unlocked = { _id: "a1", title: "First lesson", unlockedAt: "2026-01-01" };
  const locked = { _id: "a2", title: "Ten lessons", unlockedAt: null };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("rendering", () => {
    test("shows the achievement title", async () => {
      const { getByText } = await render(<AchievementItem item={unlocked} />);
      expect(getByText("First lesson")).toBeTruthy();
    });
  });

  describe("onPress behavior", () => {
    test("calls onPress with the achievement id", async () => {
      const onPress = jest.fn();
      const { getByTestId } = await render(<AchievementItem item={unlocked} onPress={onPress} />);

      await fireEvent.press(getByTestId("achievement-item-a1"));
      expect(onPress).toHaveBeenCalledWith("a1");
    });

    test("ignores presses while locked", async () => {
      const onPress = jest.fn();
      const { getByTestId } = await render(<AchievementItem item={locked} onPress={onPress} />);

      await fireEvent.press(getByTestId("achievement-item-a2"));
      expect(onPress).not.toHaveBeenCalled();
    });
  });
});
```

`__tests__/hooks/useAchievements.test.js`:

```js
import { renderHook } from "@testing-library/react-native";
import { useSelector } from "react-redux";
import { useGetAchievementsQuery } from "../../features/achievement/achievementApi";
import useAchievements from "../../hooks/useAchievements";

jest.mock("react-redux", () => ({
  useSelector: jest.fn(),
}));

jest.mock("../../features/achievement/achievementApi", () => ({
  useGetAchievementsQuery: jest.fn(),
}));

describe("useAchievements Hook", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("skips the request until a grade is selected", async () => {
    useSelector.mockReturnValue(null);
    useGetAchievementsQuery.mockReturnValue({ data: undefined, isLoading: false, isFetching: false });

    await renderHook(() => useAchievements());

    expect(useGetAchievementsQuery).toHaveBeenCalledWith({ grade: null }, { skip: true });
  });

  test("lists unlocked achievements first", async () => {
    useSelector.mockReturnValue(3);
    useGetAchievementsQuery.mockReturnValue({
      data: { data: { achievements: [{ _id: "a" }, { _id: "b", unlockedAt: "2026-01-01" }] } },
      isLoading: false,
      isFetching: false,
    });

    const { result } = await renderHook(() => useAchievements());

    expect(result.current.achievements.map((item) => item._id)).toEqual(["b", "a"]);
    expect(result.current.unlockedCount).toBe(1);
  });
});
```

`__tests__/features/achievement/achievementSlice.test.js`:

```js
import reducer, { resetAchievement, updateAchievement } from "../../../features/achievement/achievementSlice";

const initialState = { filter: "all", selectedId: null };

describe("achievementSlice", () => {
  // ─── Initial state ──────────────────────────────────────────────────────────

  it("returns the initial state", () => {
    expect(reducer(undefined, { type: "@@INIT" })).toEqual(initialState);
  });

  // ─── updateAchievement ──────────────────────────────────────────────────────

  it("merges a partial payload", () => {
    const state = reducer(initialState, updateAchievement({ selectedId: "a1" }));
    expect(state).toEqual({ filter: "all", selectedId: "a1" });
  });

  // ─── resetAchievement ───────────────────────────────────────────────────────

  it("resets to the initial state", () => {
    const state = reducer({ filter: "locked", selectedId: "a1" }, resetAchievement());
    expect(state).toEqual(initialState);
  });
});
```

Starter `jest.setup.js` for a new Expo project (extend with the reference-style manual mocks for Reanimated,
icons, and native SDKs when suites need them):

```js
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// Translations resolve to their keys so tests assert on stable identifiers
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: jest.fn() },
  }),
  Trans: ({ children }) => children,
  initReactI18next: { type: "3rdParty", init: jest.fn() },
}));

jest.mock("./hooks/useGetScaleRatio", () =>
  jest.fn(() => ({
    sizeIncrementRatio: 1,
    getResponsiveFontSize: (size) => size,
  }))
);
```

## 13. Maestro flow

`.maestro/achievements.yml` - drive elements by `testID`, reuse shared sub-flows:

```yaml
appId: "${maestro.platform == 'ios' ? IOS_APP_ID : ANDROID_APP_ID}"
---
- launchApp
- runFlow: "common/handleLaunchModals.yml"
- tapOn:
    id: "tab-button-settings"
- tapOn:
    id: "achievements-link"
- assertVisible:
    id: "achievement-list"
```
