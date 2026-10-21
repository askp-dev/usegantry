import { cpSync, existsSync, rmSync } from "node:fs";

// Bundle for VS Code's Node host; `vscode` is provided at runtime.
const res = await Bun.build({ entrypoints: ["src/extension.ts"], outdir: "dist", target: "node", format: "cjs", external: ["vscode"], minify: true });
if (!res.success) {
  for (const l of res.logs) console.error(l);
  process.exit(1);
}
// Ship the compiled Svelte UI for the sidebar when it has been built (`bun run build:ui`).
const ui = "../core/dist/ui-assets";
rmSync("media/ui", { recursive: true, force: true });
if (existsSync(`${ui}/index.html`)) cpSync(ui, "media/ui", { recursive: true });
console.log(`built dist/extension.js${existsSync("media/ui") ? " + media/ui" : " (no UI build; sidebar uses inline HTML)"}`);
