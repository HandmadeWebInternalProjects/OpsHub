import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Vitest is used for unit tests (PROJECT.md §2/§9). Tests import app modules
 * that validate `lib/env.ts` at load time, so we provide a minimal, valid env
 * here (the DB is never connected in these unit tests).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    env: {
      DATABASE_URL: "postgres://opshub:opshub@localhost:5432/opshub_test",
      NEXTAUTH_SECRET: "test-secret",
      ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      USE_MOCKS: "true",
      PLOI_WEBHOOK_SECRET: "test-webhook-secret",
      LOG_LEVEL: "silent",
    },
  },
});
