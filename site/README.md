# usegantry.app

The static site for Gantry, built to `DESIGN.md` (paper, ink, one orange; go/no-go board, remove-before-flight tags, title blocks). Chosen on 2026-10-21 over the Gemini and DeepSeek candidates.

## Run it

```bash
cd site && bun install
bun run dev        # regenerates data, then http://localhost:5173
bun run build      # static output in build/
bun run check      # svelte-check
bun run og         # macOS only: re-renders static/og.png (social preview) from the real scan
```

`static/og.png` is committed, because the WebKit renderer (`scripts/snapshot.swift`) only runs on macOS, not on the Cloudflare build. Re-run `bun run og` when the rule count or the sample board changes.

`bun run data` (part of `dev` and `build`) scans the repo's own fixtures with the real scanner and writes `src/lib/data/*.json`. Every number, finding, prompt and rule example on the site is genuine Gantry output from that build; nothing is hand-written. It also copies `../install.sh` to `static/`.

## Pages

| Route | What it is |
|---|---|
| `/` | Hero with install switcher and a real go/no-go board (before/after fixes toggle), the four stations, a real `gantry check` report, all 71 rules with a real finding + agent prompt each, setup (MCP / stop hook / GitHub), clearance explainer, roast teaser, licence |
| `/verify/` | Client-side Ed25519 check of `#<payload>.<signature>` against the central key. States: verified (sig OK **and** `issuer: gantry-ci`), self-signed, invalid, malformed, unsupported browser |
| `/roast/` | Builds the `gantry roast` command for a GitHub URL (same allowlist as the CLI) and renders a pasted/uploaded `roast --json` |
| `/docs/` | Install, commands, config, suppression, profiles, CI, agents/MCP, certificates, JSON, what leaves your machine |
| `/install.sh` | The real installer from the repo root |

## Deploy

Static files only. Either:

- **Cloudflare (Workers static assets, uses `site/wrangler.jsonc`)**: root directory `/`, build command `bun install && cd site && bun install && bun run build`, deploy command `cd site && npx wrangler deploy`. The root must be the repo root: the data step imports `packages/core` and scans `fixtures/`.
- **Cloudflare Pages (classic)**: same build command, output directory `site/build`.
- **GitHub Pages**: copy `deploy-pages.yml` to `.github/workflows/` (it isn't active by default, so it can't clash with the other candidates). `static/CNAME` is set to `usegantry.app`.

Keep `api.usegantry.app` (the signer Worker) on its own route either way.

## Where this deviates from WEBSITE_SPEC.md, and why

| Spec | This site | Reason |
|---|---|---|
| Obsidian/emerald/Inter/JetBrains tokens | `DESIGN.md` paper/ink/orange, Archivo + Public Sans + Martian Mono | The spec predates the rebrand; the old palette is on DESIGN.md's banned list |
| 43 rules, "<1.1 s", 37-rule free tier | 71 rules (from the registry), 0.3 s cold scan of 500 files (`bun run bench`) | Current facts |
| 6-card bento grid | Four-station strip | Bento grids are a banned trope; stations map 1:1 to the product's pillars |
| Animated hero terminal simulating `scan`/`legal`/`attack` | A real `gantry check` report and a real board, generated at build time | Real output beats a simulation and can't drift from the product |
| Pricing: $0 / $39 / $299 | "Free. MIT." | Everything is free at launch (handoff quirk 14); showing paid tiers that don't exist would mislead |
| `npx gantry cert`, `--apply`, `.vsix`, Windows exe, `install.ps1` | `bunx @usegantry/cli`, `clear`, `--sync`; Windows → bunx/WSL | Renamed commands; no Windows binary or published extension yet |
| `/verify` shows "verified" on any valid signature | Verified only with `issuer: gantry-ci`; invalid certs never show a CLEARED stamp | Self-signed certs must not pass as Verified; a screenshot of a tampered cert mustn't look cleared |
| Roast input box on the landing page | `/roast` builds the command and renders JSON | There's no hosted roast endpoint (local CLI only, by decision) |

## Not done yet

- Console (dark) theme follows the OS setting; there's no toggle.
- Fonts are self-hosted via `@fontsource`; consider subsetting to Latin only to shave weight.
