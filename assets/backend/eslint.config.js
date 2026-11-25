// Reference ESLint flat config for Node servers (copied from the reference API). Copy to the project root as
// eslint.config.js. Needs: eslint ^9, @eslint/js ^9, globals, eslint-plugin-jsdoc. See
// references/backend/development-rules.md §1 for what each rule means when writing code.
import pluginJs from "@eslint/js";
import globals from "globals";
import jsdoc from "eslint-plugin-jsdoc";

export default [
  {
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "_$",
          argsIgnorePattern: "_$",
        },
      ],
    },
  },
  {
    files: ["tests/**/*.test.js"],
    languageOptions: {
      globals: globals.jest,
    },
  },
  pluginJs.configs.recommended,
  {
    ...jsdoc.configs["flat/recommended"],
    files: ["src/**/*.js"],
    rules: {
      // Start from the plugin defaults, raised from "warn" to "error".
      ...Object.fromEntries(
        Object.entries(jsdoc.configs["flat/recommended"].rules).map(([k, v]) => [
          k,
          Array.isArray(v) ? ["error", ...v.slice(1)] : v === "off" || v === 0 ? v : "error",
        ])
      ),
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: { FunctionDeclaration: true, ArrowFunctionExpression: true, FunctionExpression: true },
        },
      ],
      "jsdoc/require-description": "error",
      "jsdoc/require-throws": "error",
      "jsdoc/require-param": "error",
      "jsdoc/require-param-type": "error",
      "jsdoc/require-returns": "error",
      "jsdoc/require-returns-type": "error",
      "jsdoc/check-param-names": "error",
      "jsdoc/check-types": "error",
      // Noisy rules that do not fit the codebase
      "jsdoc/require-param-description": "off",
      "jsdoc/require-returns-description": "off",
      "jsdoc/require-property-description": "off",
      "jsdoc/tag-lines": "off",
      "jsdoc/no-undefined-types": "off",
      "jsdoc/check-tag-names": ["error", { definedTags: ["swagger", "openapi"] }],
      "jsdoc/require-yields": "off",
      "jsdoc/reject-function-type": "off",
      "jsdoc/reject-any-type": "off",
      "jsdoc/require-throws-type": "off",
      "jsdoc/multiline-blocks": "off",
      "jsdoc/no-defaults": "off",
    },
  },
];
