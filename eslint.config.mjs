import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import noUnsanitized from "eslint-plugin-no-unsanitized";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{ts,tsx}"],
    plugins: {
      "no-unsanitized": noUnsanitized,
    },
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-proto": "error",
      "no-script-url": "error",
      "react/jsx-no-script-url": "error",
      "react/jsx-no-target-blank": "error",
      "react/no-danger": "error",
      "no-unsanitized/property": "error",
      "no-unsanitized/method": "error",
    },
  },
  {
    files: [
      "app/components/TrailApp.tsx",
      "app/components/forms.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
