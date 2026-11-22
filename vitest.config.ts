import { defineConfig } from "vitest/config"

// Tests run in plain Node: the core crypto uses only WebCrypto.
export default defineConfig({
  test: { include: ["src/**/*.test.ts", "worker/**/*.test.ts", "e2e/**/*.test.ts"], testTimeout: 30_000, environment: "node" },
})
