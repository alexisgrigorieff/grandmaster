import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // These React Compiler rules flag deliberate patterns here: effects that
      // sync with timers/Realtime, and the 3D/2D boards reading layout refs while
      // dragging. Keep them visible as warnings rather than blocking errors.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Signing out does a full reload on purpose (drops every Realtime channel).
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
  {
    files: ["tests/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "test-results/**", "playwright-report/**"]),
]);

export default eslintConfig;
