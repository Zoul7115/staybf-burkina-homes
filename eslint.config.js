import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
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
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
            {
              // The admin client uses the service_role key and bypasses RLS.
              // It must only be imported in createServerFn handlers, never in
              // route components, hooks, or any module that runs in the browser.
              // If you need it in a server function, import directly:
              //   import { supabaseAdmin } from '@/lib/supabase/admin'
              // and add a comment explaining why admin access is required.
              name: "@/lib/supabase",
              importNames: ["supabaseAdmin"],
              message:
                "supabaseAdmin is not exported from the barrel. Import directly from '@/lib/supabase/admin' in a server-only context (createServerFn) and add a justification comment.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
);
