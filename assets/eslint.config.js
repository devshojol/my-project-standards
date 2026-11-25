// Reference ESLint flat config for Expo / React Native projects (copied verbatim from the reference project).
// Copy to the project root as eslint.config.js. For non-Expo projects use the portable block in
// references/development-rules.md §1.4 instead of this file.
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");
const pluginJest = require("eslint-plugin-jest");
const i18next = require("eslint-plugin-i18next");
const jsdoc = require("eslint-plugin-jsdoc");

module.exports = defineConfig([
  { ignores: ["dist/**"] },

  expoConfig,
  eslintPluginPrettierRecommended,
  jsdoc.configs["flat/recommended"],

  {
    files: ["**/*.js", "**/*.jsx"],
    settings: {
      jsdoc: {
        mode: "jsdoc",
        tagNamePreference: {
          returns: "returns",
          augments: "extends",
        },
      },
    },
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
    plugins: {
      i18next,
    },
    rules: {
      "prettier/prettier": "error",
      "react-hooks/exhaustive-deps": "off",
      "no-console": "warn",
      "react/no-unescaped-entities": "off",
      "i18next/no-literal-string": "error",
      "max-lines": ["warn", { max: 120, skipComments: true, skipBlankLines: true }],
    },
  },

  {
    files: ["**/*.spec.js", "**/*.test.js", "jest.setup.js"],
    plugins: { jest: pluginJest },
    languageOptions: {
      globals: pluginJest.environments.globals.globals,
    },
    rules: {
      "max-lines": "off",
    },
  },
]);
