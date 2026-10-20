# Preflight AI — Build Handoff

_Handoff written 2026-10-20 by Claude (Cowork). Picking up: Claude Code._

Source of truth for requirements: `SPEC.md`, `DESIGN.md`, `RULES_SPEC.md` (repo root). `WEBSITE_SPEC.md` is **out of scope** for this build (not requested).

The user's answers before the build started:
- **Scope:** all 4 sprints (context builder, 37 static rules + compilers + CLI, MCP + pentest + init, Svelte UI + VS Code extension).
- **Location:** monorepo at the **repo root** (next to the spec files), matching SPEC §2.

---

## 1. Environment constraints (read first)

- **No package registry access** in either the cloud sandbox or the user's local VM when this was built (npm/PyPI/bun.sh returned 403/DNS failures). Nothing has been `bun install`ed. Nothing under `node_modules/` exists.
- So the core is being built **zero-dependency**:
  - AST work runs on a home-grown structural indexer (`code-index.ts`). `@ast-grep/napi` is declared as an **optionalDependency** and `ctx.getAst()` lazily loads it if present. Rules should use `ctx.getCode()`.
  - The MCP server is meant to be **hand-rolled JSON-RPC 2.0 over stdio** (no `@modelcontextprotocol/server`), and validation uses small hand-written checks (no `zod`). If you have network, swapping in the official SDK and zod is fine.
  - The embedded knowledge DBs load through Bun import attributes (`with { type: "sqlite", embed: "true" }`, JSON import), so `bun build --compile` bundles them. Verified working on Bun 1.4.2.
- The Svelte 5 + Tailwind v4 UI and the VS Code extension **can't be compiled without installs**. The plan: write them to spec, and **also** ship an embedded no-build fallback page (`packages/core/src/server/lite-ui.html`, imported as text) so `preflight ui` works without a UI build.
- Bun is at `/root/.bun/bin/bun` in the cloud sandbox. The user's local VM has Node 22 and **no Bun**.

---

## 2. Status by sprint

| Sprint | Status |
|---|---|
| 0. Monorepo scaffold + data seeds | ✅ Done |
| 1. Context builder & parsers | ✅ Done and smoke-tested (see §4) |
| 2. 37 static rules, scoring, compilers, CLI | ⏳ Not started (next) |
| 3. MCP server, pentest runner, `init` | ⏳ Not started |
| 4. Svelte UI, ui-server, VS Code extension | ⏳ Not started |
| 5. Tests, perf benchmark, final verification | ⏳ Not started (fixture exists) |

---

## 3. Files created (all new — no pre-existing project files were modified)

The four spec files (`SPEC.md`, `DESIGN.md`, `RULES_SPEC.md`, `WEBSITE_SPEC.md`) were **read only, never changed**.

### Root
| Path | Purpose |
|---|---|
| `package.json` | Bun workspace root (`workspaces: packages/*`). Scripts: `scan`, `preflight`, `test`, `bench`, `seed:packages`, `build:ui`, `build:bin`, `build:ext`, `build`, `typecheck`. |
| `tsconfig.json` | Strict TS, `moduleResolution: bundler`, `types: ["bun"]`. |
| `bunfig.toml` | Install and test settings (test root `packages/core/test`). |
| `.gitignore` | Ignores node_modules, dist, binaries, `.preflight/`, extension out/vsix. |
| `handoff.md` | This file. |

### Data (`data/`)
| Path | Purpose |
|---|---|
| `data/seed/npm-top.txt` | 958 curated npm packages as `name|SPDX|fromMajor`. The third field is a version gate (e.g. `tinymce|GPL-2.0-or-later|7`). Copyleft entries are seeded so LEG-02 works without lockfile licenses. |
| `data/seed/pypi-top.txt` | 246 curated PyPI packages, same format. |
| `data/known-packages.sqlite` | **Generated.** 1,204 rows. Table `packages(ecosystem, name, rank, license, license_from_major, weekly_downloads, repo_url, created_at)` plus a `meta` table. |
| `data/subprocessor-map.json` | **Generated.** 144 vendors / 434 SDK package keys (SPEC asks for 250+). Each vendor has entityName, category, jurisdiction, privacyPolicyUrl, dpaUrl, dataProcessed, triggersClauses, `packages.{npm,pypi}` and `envKeys` (env-var prefixes). |

### Scripts (`scripts/`)
| Path | Purpose |
|---|---|
| `scripts/gen_subprocessors.py` | Source table that regenerates `data/subprocessor-map.json`. Edit the `V` list, then run `python3 scripts/gen_subprocessors.py`. |
| `scripts/build-known-packages.ts` | Builds the sqlite file from the seeds. `--refresh` pulls downloads, licenses and repo URLs from the registries; `--top-npm N` expands to the npm top-N. Both flags need network. |

### Core package (`packages/core/`)
| Path | Purpose |
|---|---|
| `packages/core/package.json` | `@preflight/core`. `bin: preflight → src/bin/cli.ts`; `build` = `bun build --compile --minify ./src/bin/cli.ts --outfile ./dist/preflight`; optionalDependency `@ast-grep/napi`. |
| `packages/core/src/globals.d.ts` | Ambient module types for `*.sqlite`, `*.html`, `*.md`, `*.mermaid` imports. |
| `packages/core/src/context/types.ts` | **All SPEC §3 contracts, verbatim**, plus extensions: `RuleDefinition`, `AuditReport`, `PillarScore`, `DataFlowGraph`/`DataFlowNode`, `LegalManifest`/`LegalClause`, `PreflightConfig`, `Dependency`, `EnvEntry`, `SqlView`/`SqlFunction`/`StorageBucket`/`StoragePolicy`, `PentestEvent`/`ProbeResult`/`HttpTrace`. `RepoContext` adds `getCode`, `glob`, `hasFile`, `packageJson`, `env`, `sql`, `stack`, `config`, `timings`. `SgRoot`/`SgNode` are declared structurally. |
| `packages/core/src/context/code-index.ts` | Zero-dep structural index. Three position-preserving views (`text`, `noComments`, `masked`) for JS/TS/TSX, Python and Svelte/Vue/HTML `<script>`. Provides `matchClose`/`matchOpen`, `calls(re)`, `args`, `objectEntries`, `functions()` (declarations, arrows incl. `withAuth(async…)` wrappers, methods, Python defs + decorators), `enclosingFunction`, `imports()`, `hasTopDirective`, `bodyHasDirective`, `snippet`, `lineOf`. Also exports `levenshtein` (Damerau/OSA with early exit) and `shannonEntropy`. |
| `packages/core/src/context/sql-parser.ts` | Statement splitter (handles quotes, `$$`, comments). Parses CREATE/ALTER/DROP TABLE (columns, FKs, ON DELETE), ENABLE/DISABLE RLS, CREATE/DROP POLICY (cmd, USING, WITH CHECK, roles), views (+`security_invoker`, ALTER VIEW), functions (SECURITY DEFINER, search_path, auth checks, trigger, REVOKE), `storage.buckets` inserts/updates, `storage.objects` policies, and `supabase/config.toml` buckets. Exports `PII_COLUMN_RE` and `ENCRYPTED_COLUMN_RE`. |
| `packages/core/src/context/schema-parser.ts` | Prisma (`@@map`, `@map`, `@relation onDelete`), Drizzle (`pgTable`/`sqliteTable`/`mysqlTable`, `.references(() => x.id, {onDelete})`, `pgPolicy`, `.enableRLS()`) and SQLAlchemy (`__tablename__`, `Column`/`mapped_column`, `ForeignKey(ondelete=)`). `prismaModelMap()` maps accessor → table. |
| `packages/core/src/context/lockfile-parser.ts` | package.json (deps/dev/peer/optional, with line numbers), package-lock v1–v3 (incl. licenses), bun.lock (JSONC), pnpm-lock, yarn.lock, requirements*.txt, pyproject (PEP 621 + Poetry), poetry.lock. Also license enrichment from `node_modules/*/package.json`. **PyPI deps are keyed `pypi:<name>`**; npm deps use the bare name. |
| `packages/core/src/context/knowledge.ts` | Embedded DB accessors: `lookupKnownPackage`, `topPackages`, `knownPackageCount`, `VENDORS`, `vendorForPackage`, `vendorForEnvKey` (longest prefix wins), `vendorById`. |
| `packages/core/src/context/patterns.ts` | Shared regex vocabularies: `AUTH_ASSERTION_RE`, `DB_MUTATION_RE`, `PAID_SDK_CALL_RE`, `GENAI_PACKAGES`, `LLM_CALL_RE`, `RATE_LIMIT_RE`, `WEBHOOK_VERIFY_RE`, `SESSION_SCOPE_KEYS`, `SECRET_NAME_RE`, `PUBLIC_ENV_PREFIX_RE`, `PRIVATE_VALUE_RE`, `SECRET_PATTERNS` (35 vendor regexes for SEC-06), `PLACEHOLDER_RE`. |
| `packages/core/src/context/routes.ts` | Extracts routes from Next app routes and `export {h as POST}`, pages/api (method sniffing), server actions (file-level and inline `"use server"`), SvelteKit `+server`, `+page.server` actions and `load`, Express/Hono-style `app.post(path, mw, handler)` with `app.use` guards, and FastAPI/Flask decorators with `Depends(get_current_user)`. Also handles middleware guard detection (Next `middleware.ts`, `createRouteMatcher`, `config.matcher`, SvelteKit `hooks.server`), `dbTablesAccessed`, and `externalSdksCalled`, which follows local imports up to 2 hops (`@/`, `~/`, `$lib/`, relative). |
| `packages/core/src/context/config.ts` | `loadConfig()` reads `preflight.config.json`, `.preflightrc(.json)` or the `package.json#preflight` key. Defaults are in `DEFAULT_CONFIG`. It infers open-source mode from a copyleft root license and fills productName/companyName/contactEmail from package.json. |
| `packages/core/src/context/builder.ts` | `buildRepoContext(rootDir, {config, only, maxFiles})`. Does a single walk with a hard skip-list and binary filter, keeps lazy text, CodeIndex and ast-grep caches, and categorises files (server/frontend/sql/env/legal). It then builds deps (manifests → lockfiles → node_modules → seed DB, version-gated), env parsing, SQL+ORM table merge (SQL is authoritative for RLS), stack flags (supabase/prisma/drizzle/sqlalchemy/stripe/genAi/deployTarget), routes, sub-processors (from direct prod deps plus env keys) and the git SHA (read from `.git` with no subprocess), with per-phase `timings`. Internal extras hang off `ctx` as `(ctx as any).middleware`, `.prismaModels` and `.drizzleVars`. Exports `parseEnvFile`. |

### Empty directories created (scaffold for remaining sprints)
`packages/core/src/{bin,pentest,compilers,server,workers,util}`, `packages/core/src/rules/{security,privacy,legal,finops-ops}`, `packages/core/test`, `packages/ui/src/lib/{components,stores}`, `packages/ui/src/routes`, `packages/vscode-ext/src`.

### Test fixture (`fixtures/vulnerable-saas/`), deliberately insecure
This is a Next 15 + Supabase + Prisma + Stripe + OpenAI app, seeded to trigger most rules:
- `package.json` includes the typosquat `axois` (LEG-01) and `ffmpeg-static` (GPL-3.0, LEG-02).
- `.env.local` has `NEXT_PUBLIC_OPENAI_API_KEY=sk-proj…` (SEC-05) and a live Stripe key plus a DB URL on port :5432 (SEC-06/OPS-02).
- `.env.example` is incomplete (OPS-04), `.gitignore` doesn't cover `.env`, and there's a `vercel.json`.
- `next.config.js` has no security headers (PRIV-07).
- `supabase/migrations/20240101000000_init.sql`:
  - `using(true)` UPDATE policy and `raw_user_meta_data` (SEC-01)
  - `documents` with no RLS, plus an FK without cascade (PRIV-02)
  - `integrations` with RLS enabled but 0 policies, and plaintext `access_token` (PRIV-03)
  - a view without `security_invoker` and a definer function without `search_path` (SEC-02)
  - a public `user-uploads` bucket with an anon insert policy (SEC-04)
  - no `accepted_terms_at` (LEG-03)
- `prisma/schema.prisma` has User `@@map("users")` and a Post relation without `onDelete`.
- `app/layout.tsx` calls `posthog.init` ungated (PRIV-04) and has no OpenGraph metadata (SEO-01).
- `app/page.tsx` has a `useEffect` loop with `[docs]` (FIN-01), `div onClick`, `img` with no alt, unlabeled input (A11Y-01) and `dangerouslySetInnerHTML` (SEC-12).
- `app/signup.tsx` has a `defaultChecked` terms checkbox (LEG-03).
- `app/actions.ts` has `deletePost` (SEC-03 + SEC-07), `updateProfile` doing mass assignment from formData (SEC-10), and `renamePost`, which calls `getSession()` but never enforces it.
- `app/api/chat/route.ts` has no rate limit (SEC-09), logs the request body (PRIV-01), puts `user.email` and `JSON.stringify(user)` in the prompt (PRIV-05), and calls `streamText` with tools and no `maxSteps`/abort (FIN-02).
- `app/api/webhook/route.ts` uses `req.json()` with no signature check (SEC-08), has no idempotency (PAY-01) and handles only `checkout.session.completed` (PAY-03).
- `app/api/credits/route.ts` does a read-modify-write on credits (PAY-02).
- `app/api/proxy/route.ts` has SSRF via `fetch(searchParams.get("url"))` and an open `redirect()` (SEC-11).
- `app/api/posts/route.ts` has an unbounded `findMany` (FIN-03), `$queryRawUnsafe` with interpolation (SEC-12), a swallowed catch returning ok (OPS-03), and `create({ data: body })` (SEC-10).
- `app/api/posts/[id]/route.ts` is authed but deletes by id only (SEC-03).
- `components/Markdown.tsx` has `dangerouslySetInnerHTML`.
- `legal/privacy-policy.md` lists only Stripe and contains `[COMPANY NAME]` and TODO (LEG-04/LEG-05).
- Missing on purpose: `/api/health` (OPS-01), robots/sitemap (SEO-01), account deletion (PRIV-02), data export (PRIV-06), `/terms` and `/privacy` routes (LEG-05), `legal/eula.md` (LEG-06), `src/env.ts` (OPS-04).

---

## 4. Verification done so far

- `CodeIndex`: tested on mixed TSX (template literals with `${}`, regex literals, JSX apostrophes, `withAuth(async…)` wrappers, object-literal actions, methods, `useEffect` arrows) and on Python FastAPI defs and decorators. All extracted correctly.
- `sql-parser`: tested on a Supabase-style migration. It extracted tables/columns/FKs/ON DELETE, RLS flags, policies with USING/CHECK, views, definer functions, buckets (multi-row VALUES) and storage policies correctly.
- `buildRepoContext("fixtures/vulnerable-saas")` finished in **~20 ms** total and returned:
  - framework `nextjs` 15.1.0
  - stack: supabase, prisma, stripe, genAi, deployTarget `vercel`
  - 10 routes with the expected auth flags; `/api/chat` → `openai` and `/api/webhook` → `stripe` were correctly resolved through `@/lib/*` imports
  - tables: profiles, documents, integrations, users, post
  - subprocessors: supabase, stripe, openai, posthog, resend
  - `ffmpeg-static` license `GPL-3.0-or-later` from the seed DB
- Quick checks: run from the repo root with Bun ≥ 1.2:
  ```bash
  bun -e 'import {buildRepoContext} from "./packages/core/src/context/builder.ts"; const c=await buildRepoContext("fixtures/vulnerable-saas"); console.log(c.timings, c.routes.map(r=>[r.method,r.urlPath,r.hasAuthGuard]))'
  bun run scripts/build-known-packages.ts   # regenerates data/known-packages.sqlite
  ```
- `tsc --noEmit` has **not** been run (no `@types/bun` installed). Run `bun install && bun run typecheck` once network is available and fix any type errors.

### Known quirks to address
1. `RouteNode.hasAuthGuard` is true when an auth call **appears** in the body (e.g. `renamePost` calls `getSession()` but never checks it). SEC-07 must do the **ordering/enforcement** check itself: auth call before the first mutation, plus a throw/return/redirect on failure. Don't rely only on `hasAuthGuard`.
2. Table keys in `ctx.dbTables` are lowercased (`post`), while `route.dbTablesAccessed` uses the Prisma table name as declared (`Post`). Compare case-insensitively.
3. `walk()` sorts files and caps at 20k. `ignorePaths` uses Bun.Glob patterns from config.
4. Seed licenses are version-gated only through `license_from_major`. Lockfile/node_modules licenses always win.

---

## 5. Remaining work (in order)

### Sprint 2: rules, scoring, compilers, CLI
1. **`packages/core/src/rules/helpers.ts`**
   - `makeFinding(rule, partial)` sets pillar/severity/blocking (CRITICAL → blocking; HIGH → blocking only with `--strict`) and a fingerprint (`sha1(rule+file+normalized evidence)`).
   - Snippet helper.
   - Inline suppression: `// preflight-ignore SEC-03` on the same or previous line, plus `config.ignoreRules`.
2. **37 rule files**, named exactly as in the RULES_SPEC registry. Each exports a `RuleDefinition`:
   - `security/sec-01-rls.ts` … `sec-12-sql-xss.ts`
   - `privacy/priv-01-pii-logs.ts` … `priv-07-security-headers.ts`
   - `legal/leg-01-slopsquatting.ts` … `leg-06-ai-disclaimer.ts`
   - `finops-ops/fin-01…`, `pay-01…03`, `ops-01…04`, `a11y-01-interactive-dom.ts`, `seo-01-launch-meta.ts`
   - Follow SPEC §4 for SEC-01/03/07, FIN-01 and PAY-02 exactly.
   - **SEC-01** applies only when `ctx.stack.supabase` is true (Postgres without PostgREST isn't exposed).
   - **LEG-01**: seed DB lookup, then a Levenshtein ≤1 check against `topPackages(eco,1000)`, only for names of length ≥4. Then an optional 1.2s-timeout registry lookup, skipped when `config.offline`; a 404 is CRITICAL, and so is `<30 days` old with `<500` weekly downloads. Skip `isLocal` deps.
   - **LEG-02**: only when `config.mode === "commercial"` and only prod deps. Parse SPDX `OR` expressions and pass if any option is permissive.
   - **SEC-06**: working tree scan with `SECRET_PATTERNS` plus entropy. Git history goes in `workers/git-entropy.worker.ts`: a Bun Worker running `git log -p -50`, with a timeout so the 3s SLA holds.
3. **`rules/index.ts`**: the exact registry from RULES_SPEC.md.
4. **`packages/core/src/engine.ts`** (or `audit.ts`): `runAudit(ctx, opts)` runs the rules in parallel (`Promise.all`) and isolates errors per rule. It applies scoring: start at 100, −25 CRITICAL, −10 HIGH, −4 MEDIUM, floor 0, with per-pillar scores. Status is `LAUNCH_READY` when score ≥ 90 and there are 0 blockers, `LAUNCH_BLOCKED` when there are any blockers, and `NEEDS_REVIEW` otherwise. It also builds the `DataFlowGraph` (4 columns per DESIGN Component 2) and returns `AuditReport`.
5. **Compilers** in `packages/core/src/compilers/`:
   - `legal-compiler.ts`:
     - `buildLegalManifest(ctx)` and `compileLegalDocs()`.
     - Non-destructive patching between `<!-- PREFLIGHT:AUTO:<BLOCK> -->` … `<!-- /PREFLIGHT:AUTO:<BLOCK> -->` markers. Blocks: SUBPROCESSORS, PII_TABLE, AI_SCHEDULE, NO_TRAINING, PCI, ERASURE, VERSION_META (holds the stack hash).
     - Templates for `legal/privacy-policy.md`, `legal/eula.md` and `legal/terms.md`.
     - Writes `src/lib/legal-version.ts` with `CURRENT_LEGAL_VERSION` and `LEGAL_STACK_HASH`.
     - A unified-diff function for `/api/legal/preview`.
     - Templates are not legal advice; say so in the CLI output and README.
   - `checklist-writer.ts`: `READINESS_CHECKLIST.md`, keeping user content outside the auto block.
   - `cert-generator.ts`: `LAUNCH_CERTIFICATE.html` styled with DESIGN tokens, and `LAUNCH_CERTIFICATE.pdf` from a hand-rolled minimal PDF 1.4 writer. HMAC-SHA256 signature over canonical JSON. The key comes from `PREFLIGHT_CERT_SECRET` or a generated `~/.preflight/cert.key`. Refuse to issue while there are blockers, unless `--allow-blocked` (then stamp it BLOCKED). Include a `/verify#payload.sig` URL (WEBSITE_SPEC).
   - `vendor-pack.ts`: CycloneDX 1.5 `SBOM.json` and `DATA_FLOW.mermaid` (RoPA).
6. **`packages/core/src/bin/cli.ts`**:
   - Subcommands: `scan [path] [--json] [--sarif] [--strict] [--offline] [--write-checklist]`, `attack --target`, `legal [--apply]`, `cert`, `ui [--port 4400]`, `init`, `mcp` (delegates to `mcp.ts`).
   - Pretty terminal output.
   - Exit code 1 when there are blockers, for CI.
7. **Tests** in `packages/core/test/`: one `bun test` per rule against `fixtures/vulnerable-saas`, plus a new `fixtures/clean-saas` that should score ≥90 with 0 blockers (false-positive guard).

### Sprint 3
- **`bin/mcp.ts`**: newline-delimited JSON-RPC 2.0 over stdio. Methods: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`. Tools: `run_readiness_audit {path?, strict?, pillars?}`, `sync_stack_legal_docs {path?, apply?}`, `run_active_pentest {target, path?}`. Log to stderr only.
- **`pentest/runner.ts`**: `runActivePentest(ctx, {target, supabaseUrl, anonKey, tenantBToken, onEvent})` covering PT-01..PT-06, all non-destructive (`Prefer: tx=rollback`, canary UUIDs, 20-request burst). Emit `PROBE_START`, `HTTP_TRACE`, `PROBE_RESULT`, `PENTEST_COMPLETE`, each trace carrying a `curl` string. **Allow only localhost/127.0.0.1 targets by default**; require an explicit flag for anything else. Test it against a local deliberately-vulnerable `Bun.serve` fixture.
- **`init`**: write `.cursor/rules/preflight.mdc`, a `CLAUDE.md` section between markers (append, never clobber), `preflight.config.json`, MCP registration (`.mcp.json`, `.cursor/mcp.json`) and an optional `.github/workflows/preflight.yml`.

### Sprint 4
- **`server/ui-server.ts`**: `Bun.serve` on `127.0.0.1:4400`, serving the SPEC §5 endpoints plus `ws /ws/pentest`. Serve `packages/core/dist/ui-assets` if it exists, otherwise the embedded `server/lite-ui.html` (vanilla JS, all 4 tabs, DESIGN tokens).
- **`packages/ui/`**: Svelte 5 runes + Tailwind v4 + Vite.
  - Components: `ReadinessHeaderBar`, `ArchitectureDataFlowGraph`, `FindingList`/`FindingRow`, `LivePentestConsole`, `LegalDiffStudio`, `Gauge`, `PillarCard`, FinOps/Burn Simulator tab.
  - Stores for the audit and the WS stream.
  - Build output goes to `packages/core/dist/ui-assets`.
  - Use DESIGN.md tokens exactly.
- **`packages/vscode-ext/`**: `extension.ts` (diagnostics from `preflight scan --json`, status bar score, debounced save watcher, "Fix with AI Agent" that copies the prompt and tries Cursor/Claude commands), `codelens-provider.ts`, and `sidebar-provider.ts` (webview loading the compiled UI, falling back to inline HTML).

### Sprint 5: verification
- `bun test`.
- `scripts/bench.ts`: generate a 500-file synthetic repo and assert the cold full scan finishes in **< 3000 ms** (target 850–1400 ms).
- Screenshot the lite UI with Playwright: Chromium is preinstalled in the cloud sandbox at `/opt/pw-browsers`.
- `bun build --compile` smoke test.
- Write the README.

---

## 6. Claude Code setup (added before Sprint 2)
- `CLAUDE.md`: token-budget rules and the spec line map. Read spec line ranges only, never whole files.
- `.claude/settings.json`: pre-approved bun/git commands; deny rules for big or irrelevant files (`data/*.json`, the sqlite DB, lockfiles, `preflight-web/`, `.env*`); `BASH_MAX_OUTPUT_LENGTH`; a PostToolUse hook that runs `.claude/hooks/format.sh` (silent Biome format).
- `.claude/commands/build-sprint.md`: the `/build-sprint N` slash command, which runs one sprint, updates this file and commits.
- Ponytail plugin, auto-enabled through `extraKnownMarketplaces` and `enabledPlugins` in `.claude/settings.json`. It needs `node` on PATH for its hooks.
- `.mcp.json`: the Context7 docs MCP server (`npx -y @upstash/context7-mcp`), auto-approved with `enableAllProjectMcpServers`.
- `.vscode/extensions.json` and `settings.json`, `biome.json`, `.editorconfig`. `@biomejs/biome` was added to devDependencies, along with `lint`/`format` scripts.

## 7. Where things live

- The working copy was built in the Cowork cloud sandbox at `/home/claude/pf/` and synced to the user's folder **`/Users/askpak/PreFlight/`**, at the repo root next to the spec files. Treat the user's folder as canonical from now on.
- **`preflight-web/`** is the marketing/docs/verify site from WEBSITE_SPEC.md, and **Gemini is building it**. It's a separate workstream: don't modify it. The only coupling is that the certificate verify URL (`/verify#payload.sig`) must match what that site expects.
- `_to_delete/preflight-build.tgz` is the transfer archive used for the sync. It's safe to delete.
- `PreFlight/` is its own git repo (`main`, initial commit `b28ca0e`), nested inside the unrelated repo at `/Users/askpak`. Always commit from `PreFlight/`. `preflight-web/` is left untracked on purpose (Gemini's workstream).
- Local toolchain (2026-10-20): Bun 1.2.10, Node 25. `bun install` done (Biome 2.5, TS 5.9). The optional `@ast-grep/napi` did install, but rules should still use `ctx.getCode()`. Typecheck is clean. `bunx biome check` still reports pre-existing style diagnostics (useTemplate, format) in Sprint 1 code; the PostToolUse hook fixes formatting as files are edited.
