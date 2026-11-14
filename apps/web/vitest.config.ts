import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for the web app's own code (not Next.js pages, which need a browser).
export default defineConfig({
  resolve: {
    // tsconfig's "@/*" path, so tests can import and mock modules the way the app does.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
