import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    coverage: { reporter: ["text", "html"] },
    setupFiles: [],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
