import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      // Fully static: every route is prerendered, so GitHub Pages / Cloudflare Pages can serve it as files.
      adapter: adapter({ pages: "build", assets: "build", fallback: "404.html" }),
    }),
  ],
});
