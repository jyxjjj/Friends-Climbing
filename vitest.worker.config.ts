import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const migrationsPath = fileURLToPath(new URL("./drizzle", import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      remoteBindings: false,
      wrangler: { configPath: "./wrangler.test.jsonc" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(migrationsPath),
        },
      },
    })),
  ],
  test: {
    include: ["tests/worker/**/*.test.ts"],
    exclude: ["tests/worker/fixture-worker.ts"],
    setupFiles: ["./tests/worker/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    restoreMocks: true,
  },
});
