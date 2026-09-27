import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Frontend bundler config. The Tauri CLI reuses this config for both
// `tauri dev` (expects port 1420) and `tauri build`.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true
  },
  build: {
    target: "es2021",
    minify: "esbuild",
    sourcemap: false,
    chunkSizeWarningLimit: 1500
  }
});
