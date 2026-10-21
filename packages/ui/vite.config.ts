import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Built into core so `gantry ui` (and the compiled binary) can serve it without the UI package.
export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  base: "./",
  build: { outDir: "../core/dist/ui-assets", emptyOutDir: true },
  server: { proxy: { "/api": "http://127.0.0.1:4400", "/ws": { target: "ws://127.0.0.1:4400", ws: true } } },
});
