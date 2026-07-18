import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@finpilot/core": `${root}packages/core/src/index.ts`,
      "@finpilot/brokers": `${root}packages/brokers/src/index.ts`
    }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: { reporter: ["text", "json-summary"] }
  }
});
