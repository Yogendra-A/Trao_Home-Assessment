import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    env: {
      ALLOW_IN_MEMORY_FALLBACK: "true",
    },
  },
});
