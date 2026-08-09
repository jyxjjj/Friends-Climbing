import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    setupFiles: ["./tests/unit/setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: "istanbul",
      include: [
        "app/lib/security.ts",
        "app/lib/validation.ts",
        "app/lib/domain.ts",
        "app/lib/drafts.ts",
        "app/lib/export-core.ts",
        "app/lib/request-user.ts",
      ],
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage/unit",
      thresholds: {
        lines: 99,
        functions: 100,
        statements: 98,
        branches: 94,
      },
    },
  },
});
