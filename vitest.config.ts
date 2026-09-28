import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Unit tests for the conversion engine run in a jsdom environment so the
// DOM-template-based builders and Blob/DecompressionStream paths work in Node.
export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"]
  }
});
