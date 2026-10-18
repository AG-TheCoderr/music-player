import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // The test helpers are not part of the application bundle, so the fast refresh rule does
    // not apply to them.
    files: ["scripts/**/*.{ts,tsx,mjs}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // The shadcn primitives export their variant helpers next to the component, which is the
    // convention of that library and not something we want to change.
    files: ["src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // Supabase Edge Functions run on Deno and are not part of the Vite build.
    files: ["supabase/functions/**/*.ts"],
    languageOptions: {
      globals: { ...globals.deno },
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "prefer-const": "off",
    },
  }
);
