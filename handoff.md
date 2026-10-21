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
| 2. 37 static rules, scoring, compilers, CLI | ✅ Done: 110 tests pass, typecheck clean, clean fixture 100/100 with 0 findings, 500-file cold scan ≈0.3–0.4 s |
| 3. MCP server, pentest runner, `init` | ✅ Done: 143 tests pass, typecheck + biome clean, live probes verified against a local vuln/safe target |
| 4. Svelte UI, ui-server, VS Code extension | ✅ Done: 155 tests pass, typecheck (core + ext + svelte-check) clean, UI builds to `packages/core/dist/ui-assets`, both UIs checked in a browser |
| 5. Tests, perf benchmark, final verification | ✅ Done: 158 tests pass, typecheck + biome clean, `bun run bench` ≈0.29 s median (SLA 3 s), compiled binary smoke-tested, `.vsix` packaged, lite UI screenshotted, README written |
| 6. Agent loop: compact output, `--changed-only`, agent hooks | ✅ Done: 168 tests pass, typecheck + biome clean (touched files), bench 276 ms median, compact = −70% bytes/finding (measured), changed-only scan ≈33 ms in-process / ≈80 ms CLI wall on the vuln fixture |
| 7. Agent-config auditor (MCP-01/02) + safe-harbor bundle | ✅ Done: 185 tests pass, typecheck + biome clean (touched files), bench 277 ms median, vuln fixture 39/39 rules, clean fixture 100/100 with 0 findings |

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

### Sprint 2 files (`packages/core/`)
| Path | Purpose |
|---|---|
| `src/rules/helpers.ts` | `defineRule(meta, (ctx, emit) => …)`, `makeFinding` (blocking: CRITICAL always, HIGH with strict; sha1 `fingerprint`), `isSuppressed` (`preflight-ignore <IDS>` on the same or previous line, in any comment syntax, plus `config.ignoreRules`), `taintedVars(ci,a,b,extra,sourceRe)` (user input, or auth-derived when given `AUTH_*`), `routeBody`, `isWebhookRoute`, `openingTags` (brace-aware JSX/HTML tag scanner), `isGitIgnored`, `redact`/`redactUrl` (secrets never printed in full), `isPaidVendor`, `USER_INPUT_RE`, `USER_TABLE_RE`. |
| `src/rules/{security,privacy,legal,finops-ops}/*.ts` | The 37 rules, with names and exports exactly per the registry. Each file has its regex vocabulary at the top, then a single `defineRule`; remediation prompts include `file:line`. |
| `src/rules/index.ts` | `ALL_STATIC_RULES`, copied verbatim from RULES_SPEC 109–199. |
| `src/workers/git-entropy.worker.ts` | Bun Worker: `git log -p -50 --unified=0`, SECRET_PATTERNS on `+` lines. Exports `scanDiff` for tests. The SEC-06 main side caps it at 1.5 s + 0.3 s and only starts it if `<root>/.git` exists. |
| `src/engine.ts` | `runAudit(ctx, {strict, ruleIds, rules})`: rules run in `Promise.all` with per-rule error isolation (→ `report.errors`), fingerprint dedupe, suppression, sorting, scoring (−25/−10/−4, floor 0, per pillar), status, and per-rule timings (`timings["rule:SEC-01"]`). `audit(root, opts)` = build + run. `buildGraph` builds the 4-column graph: `page:<file>`, `route:<METHOD> <url>`, `table:<name>`, `vendor:<id>`. Findings attach via `nodeRef`, or by file and line range for routes. |
| `src/compilers/legal-compiler.ts` + `legal-templates.ts` + `diff.ts` | `buildLegalManifest`, `compileLegalDocs(ctx,{apply})` → `{manifest, changes[{path,before,after,diff}]}`, `patchDocument` (rewrites only inside `<!-- PREFLIGHT:AUTO:X -->` and appends missing blocks), `renderBlock`, `docStackHash`, and `readLegalVersion`. Writes `src/lib/legal-version.ts` if the repo has `src/`, otherwise `lib/legal-version.ts`. `unifiedDiff` is an LCS line diff for `/api/legal/preview`. |
| `src/compilers/checklist-writer.ts` | `READINESS_CHECKLIST.md`: only the `PREFLIGHT:AUTO:CHECKLIST` block is rewritten. |
| `src/compilers/cert-generator.ts` + `pdf.ts` | Ed25519-signed certificate (see quirk 8). `generateCertificate(report,{outDir, allowBlocked, secret?, keyPath?})` throws `CertificateBlockedError` on blockers. `verifyCertificate(fragment, pubKey)`. Hand-rolled 1-page PDF 1.4 writer (Helvetica/Courier, correct xref). |
| `src/compilers/vendor-pack.ts` | CycloneDX 1.5 `SBOM.json` (purls, licenses, sub-processors as `services`) and `DATA_FLOW.mermaid` (RoPA, from the graph). |
| `src/reporters/{pretty,sarif}.ts` | Terminal output (honours NO_COLOR/TTY) and SARIF 2.1.0 (`security-severity`, `partialFingerprints`). |
| `src/bin/cli.ts` | `scan` (`--json --sarif --strict --offline --write-checklist --verbose`), `legal [--apply]`, and `cert [--allow-blocked]` (also writes the vendor pack). `attack`/`ui`/`init`/`mcp` delegate to `src/{pentest/runner,server/ui-server,init,bin/mcp}.ts` → `main({path, flags})` and exit 2 if missing. Exit 1 on blockers. |
| `src/index.ts` | Public API barrel. |
| `test/{rules,helpers,engine,compilers,cli}.test.ts` | 110 tests: every rule fires on vulnerable-saas (expected file + evidence) **and** is silent on clean-saas. Also unit tests, compilers on temp copies, CLI exit codes, and the **SLA test** (cold CLI scan of 503 files with git history, asserted < 3000 ms). |

### Sprint 3 files (`packages/core/`)
| Path | Purpose |
|---|---|
| `src/bin/mcp.ts` | Hand-rolled MCP server over stdio (newline-delimited JSON-RPC 2.0, no deps). `handle(msg, root)` is the pure, transport-agnostic request handler (returns `undefined` for notifications) — tests call it directly; `main()` is the stdin/stdout loop. Supports legacy `initialize` clients (2024-11-05 … 2025-11-25) **and** modern per-request clients (2026-07-28 `server/discover`, `_meta` protocolVersion → `resultType: "complete"`, `-32022` on bad version). Tools: `run_readiness_audit`, `sync_stack_legal_docs`, `run_active_pentest`. Tool failures are in-band (`isError: true`), not JSON-RPC errors. Each tool goes through `requireFeature()`. |
| `src/init.ts` | `initProject(root, {ci})` → `InitAction[]`. Non-destructive: `upsertBlock()` rewrites only the `<!-- PREFLIGHT:BEGIN/END -->` block in `.cursor/rules/preflight.mdc` and `CLAUDE.md`; `.mcp.json`/`.cursor/mcp.json` are JSON-merged (preflight server added, others kept); `preflight.config.json`, an existing workflow, and invalid-JSON mcp files are **skipped**, never overwritten. CI workflow only with `--ci`. |
| `src/pentest/http.ts` | `assertSafeTarget()` (localhost/loopback/`.localhost` only unless `allowRemote`), `tracedFetch()` (returns an `HttpTrace` with a redacted `curl`, never throws — timeouts/network errors become `trace.error`), `dummySupabaseJwt()` (well-formed HS256 token with the canary `sub`, for horizontal-access probing), `CANARY_UUID`. |
| `src/pentest/runner.ts` | `runActivePentest(ctx, {target, supabaseUrl?, anonKey?, tenantBToken?, allowRemote?, onEvent?})` → `ProbeResult[]`, emitting `PROBE_START`/`HTTP_TRACE`/`PROBE_RESULT`/`PENTEST_COMPLETE`. Probes PT-01..PT-06, all non-destructive (reads, canary ids, forged-sig webhooks, a 20-request burst). Gated by `requireFeature("attack")`. `main()` prints a table and exits 1 if any probe is EXPLOITED, 2 on a guard/usage error. |
| `test/fixtures/pentest-target.ts` | `startTargetServer("vuln" \| "safe")` — a `node:http` server on an ephemeral port serving matching vulnerable/hardened routes, so the probe tests assert both EXPLOITED and BLOCKED. Not shipped. |
| `test/{mcp,init,pentest}.test.ts` | 33 new tests: MCP handshake/versioning/tools, non-destructive init + idempotency, and live probes against the local target. |

### Sprint 4 files
| File | Purpose |
|---|---|
| `packages/core/src/server/ui-server.ts` | `Bun.serve` on 127.0.0.1:4400: `GET /api/report`, `POST /api/legal/{preview,apply}`, `POST /api/cert/export`, `ws /ws/pentest`. Serves `dist/ui-assets` (SPA fallback, traversal-safe) or the embedded lite UI. Exports `startUiServer`, `isTrustedRequest`, `main`. |
| `packages/core/src/server/lite-ui.html` | No-build fallback (vanilla JS, all 4 tabs, DESIGN tokens; every value is HTML-escaped). Imported `with { type: "text" }`. |
| `packages/ui/` | Svelte 5 runes + Tailwind v4 (`@theme` = DESIGN tokens) + Vite 8. `src/lib/components/`: ReadinessHeaderBar, ArchitectureDataFlowGraph (SVG swimlanes, click-to-filter), FindingList/FindingRow, LivePentestConsole, LegalDiffStudio, Gauge, PillarCard, BurnSimulator. `src/lib/stores/{audit,pentest}.svelte.ts`. `bun run build:ui` → `packages/core/dist/ui-assets`. Types are re-exported from core's `types.ts`. |
| `packages/vscode-ext/` | `src/extension.ts` (diagnostics, status-bar score, 1.5 s debounced scan-on-save, "Fix with AI Agent"), `src/codelens-provider.ts`, `src/sidebar-provider.ts` (compiled UI from `media/ui` with a strict CSP, else inline HTML), `src/scan.ts` (spawns `preflight scan --json --offline`), `scripts/build.ts` (Bun bundle → `dist/extension.js`, copies UI build into `media/ui`). |
| `test/ui-server.test.ts`, `test/vscode-ext.test.ts` | 12 new tests: origin/host guard, every endpoint, legal apply idempotency, cert 409-when-blocked, live WS pentest stream + remote-target refusal, asset serving/traversal, and the extension's CLI bridge on both fixtures. |

### Sprint 5 files
| File | Purpose |
|---|---|
| `scripts/bench.ts` | `bun run bench [--runs=5]`. Builds the 503-file synthetic repo (`makeSlaRepo`) and runs N cold CLI scans (`coldScan`). Prints min/median/max wall time and the builder phase timings. Exits 1 if the slowest run is ≥ 3000 ms. `test/cli.test.ts` imports the same helpers, so test and bench can't drift. |
| `packages/core/src/workers/git-history.ts` | `scanGitHistory()` + `scanDiff()` + `GitSecretHit`, split out of the worker. `git-entropy.worker.ts` is now a thin `onmessage` wrapper around it. |
| `test/leg01-registry.test.ts` | Stubbed-`fetch` tests for LEG-01's live registry path (closes quirk 7): npm/PyPI 404s, packages under 30 days old with < 500 weekly downloads, scoped-name encoding and the timeout signal. Old packages, new-but-popular packages and network failures are not flagged, and offline mode makes 0 fetches. |
| `test/compile.test.ts` | Runs `bun build --compile` into a tmpdir. Checks `--version`, all 37 rules firing on the vulnerable fixture, 0 findings on the clean fixture, a git-history secret caught by SEC-06, and that `attack` is bundled. |
| `packages/vscode-ext/{.vscodeignore,README.md}` + `package` script | `bun run --cwd packages/vscode-ext package` builds and runs `vsce package` (→ `preflight-ai-0.1.0.vsix`, 9 files, ~34 KB, gitignored). |
| `README.md`, `docs/screenshots/lite-ui.png` | Project README. The screenshot is the lite UI served by the compiled binary on the vuln fixture (headless Chromium, 1440×1000). |

### Empty directories still to fill
`packages/core/src/util`, `packages/ui/src/routes` (unused: the UI is a single-page tab app, no router).

### Clean fixture (`fixtures/clean-saas/`), the false-positive guard
It's the same stack as vulnerable-saas, done right: owner-scoped RLS (including `ALTER … ENABLE RLS` for the Prisma tables), a `security_invoker` view, a definer fn with `search_path=''` + `auth.uid()`, and a private bucket. It has `requireUser()` before every mutation, owner-scoped `deleteMany`, a Zod-parsed body, rate limit + `max()` + `maxTokens`/`maxSteps`/`abortSignal`, a signature-verified, idempotent webhook with the full lifecycle, an atomic credit decrement, `/api/health` with `SELECT 1`/503, and account delete + export routes. It also has security headers, `src/env.ts`, a complete `.env.example`, consent-gated PostHog, DOMPurify, accessible markup, metadata/robots/sitemap, and `/privacy`, `/terms`, `/eula` linked from the footer. `legal/*.md` + `src/lib/legal-version.ts` were **generated by `preflight legal --apply`**. If you change detected vendors, PII or clauses, re-run it, or LEG-04 fires on the stale hash.

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
- **Sprint 2 (2026-10-20):**
  - `bun test packages/core/test` gives 110 pass / 0 fail, and `bun run typecheck` is clean.
  - Biome is clean on all Sprint 2 files.
  - `bun run scan fixtures/vulnerable-saas --offline` scores 0, LAUNCH_BLOCKED, with 74 findings across all 37 rules in ≈30 ms (exit 1).
  - `fixtures/clean-saas` scores 100, LAUNCH_READY, with 0 findings (exit 0).
  - SLA: cold CLI scan of 503 files + git history takes 0.3–0.4 s wall.
- **Sprint 7 (2026-10-21):** `bun test packages/core/test` = 185 pass / 0 fail; `bun run typecheck` clean; biome clean on touched files. `bun run bench`: 507 files, median 277 ms. CLI: vuln fixture fires 39/39 rules (MCP-01 ×4 across `.mcp.json`/`.cursor`/`.vscode`/`.claude`, MCP-02 ×3 incl. a CRITICAL typosquat), SEC-06 reports nothing on agent configs (no double count), clean fixture 100/100 with 0 findings. `preflight legal fixtures/clean-saas --apply` wrote `public/ai.txt`, refused the `.example` contact and deferred robots to `app/robots.ts`.
- **Sprint 6 (2026-10-21):** `bun test packages/core/test` = 168 pass / 0 fail; `bun run typecheck` clean; biome clean on touched files. `bun run bench`: 503 files, median 276 ms. CLI e2e: `init` on a git copy of the vuln fixture wrote `.claude/settings.json`, `.cursor/hooks.json` and `.preflight/baseline.json`; copying a vulnerable route then made `preflight hook stop --agent claude` exit 2 with 2 compact blockers (≈80 ms wall). `stop_hook_active: true` → exit 0. Cursor hooks print valid JSON.
- **Sprint 5 (2026-10-20):** `bun test packages/core/test` = 158 pass / 0 fail; `bun run typecheck` clean; biome clean on touched files. `bun run bench`: 503 files, wall min 282 / median 284 / max 344 ms. Compiled binary: vuln fixture 37/37 rules, clean fixture 0 findings, git-history leak found, `init`/`mcp` (initialize + tools/list)/`attack` refusal/`ui` all work.
- **Sprint 4 (2026-10-20):** `bun test packages/core/test` = 155 pass / 0 fail; `bun run typecheck` (now core + vscode-ext + svelte-check) clean; biome clean on touched files. `/api/report` on the vuln fixture ≈45 ms. Svelte UI and lite UI both rendered against a temp copy of the vuln fixture in a browser (matrix graph, legal diff). SLA test ~0.46 s.
- **Sprint 3 (2026-10-20):** `bun test packages/core/test` = 143 pass / 0 fail; typecheck + biome clean. MCP verified over real stdio (`initialize` + `tools/list`). `preflight init` is non-destructive and idempotent. `preflight attack` exits 2 on a non-local target; against a local vuln target PT-02/03/04/05/06 report EXPLOITED and against a hardened target everything is BLOCKED/SKIPPED. SLA still ~0.3 s.

### Sprint 6 files
| File | Purpose |
|---|---|
| `packages/core/src/reporters/compact.ts` | `renderCompact()` / `compactLine()` / `compactFix()`. PRE_EXPANSION §1 format: `SCORE:x/100\|BLOCKED:bool` then `[CRIT\|HIGH\|MED][RULE] file:line \| title (parentheticals dropped) \| FIX:<prompt>`. `!` after the tag means a non-critical finding that blocks (strict mode). Used by `scan --compact`, the MCP default and the hooks. |
| `packages/core/src/context/changed.ts` | `gitChangedFiles()` (`git diff --name-only --relative HEAD` + `ls-files --others --exclude-standard`, or every tracked file before the first commit) and `changedScope()` → `{ only, changed }`. `only` = changed files ∩ walk, plus *context anchors* (every non-code file, and middleware/schema/model/db/config code files) so cross-file facts survive. `null` outside git. |
| `packages/core/src/hooks.ts` | `preflight hook <stop\|pre-commit> [path] --agent claude\|cursor`. `runHook()` is pure for tests. `newBlockers()` = changed-only scan, blocking findings minus `.preflight/baseline.json`. Claude: exit 2 + compact on stderr; honours `stop_hook_active`. Cursor: always valid JSON on stdout (`{followup_message}` for stop, capped at loop_count 3; `{permission: "allow"\|"deny", user_message, agent_message}` for `beforeShellExecution`). Fails open on internal errors. |
| `init.ts` (extended) | Merges a Claude `.claude/settings.json` `Stop` hook and a `.cursor/hooks.json` `stop` hook (`version: 1`). `--pre-commit` adds Claude `PreToolUse` (matcher `Bash`) and Cursor `beforeShellExecution` (matcher `git.*commit`). `--no-hooks` skips hooks and the baseline. `initBaseline()` writes `.preflight/baseline.json` once (full offline scan). Shared `mergeJson()` now also drives the `.mcp.json` merge. |
| `engine.ts` `AuditOptions.changedFiles`, `RuleDefinition.scope`, `RepoContext.partial`, `listRepoFiles()` | Partial-scan plumbing: drop `scope: "repo"` rules, keep findings on changed files only; `partial` = built with `only` (SEC-06 skips git history). |
| `test/agent-loop.test.ts` | Compact snapshot + measured byte reduction, repo-scope registry tags, changed-only file set in a temp git repo, hook decisions for both agents, and init hook merge idempotency. |

### Sprint 7 files
| File | Purpose |
|---|---|
| `packages/core/src/rules/agent/mcp-config.ts` | `AGENT_CONFIG_RE` (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.claude/settings*.json`), `parseJsonc()` (string-aware comment + trailing-comma strip), `agentConfigs()` (committed only: git-ignored files skipped), `stringLeaves()` (binds each string to its key, preceding `--flag`, `--flag=` or URL query param), `ENV_REF_RE`. |
| `rules/agent/mcp-01-hardcoded-creds.ts` | MCP-01 (CRITICAL). Strips `${…}`/`$VAR`/`%VAR%` refs, then SEC-06 `SECRET_PATTERNS` on every leaf + entropy ≥3.5 on secret-named keys. Fix prompt is per client (`${VAR}` Claude, `${env:VAR}` Cursor, `${input:id}` + `password: true` VS Code). |
| `rules/agent/mcp-02-unpinned-servers.ts` | MCP-02 (HIGH; CRITICAL for typosquat / registry 404). `serverPackage()` resolves `npx`/`bunx`/`pnpx`/`pnpm|yarn|bun dlx`/`npm exec`/`uvx`/`uv tool run`/`pipx run` (+ `cmd /c`, `-p`/`--from`, value flags). Reuses LEG-01 `nearestTopPackage` + now-exported `registryInfo`. |
| `context/knowledge.ts` `OFFICIAL_MCP_SERVERS` | Curated official MCP server packages (the seed DB has only `@modelcontextprotocol/sdk`/`server`). Counts as "known" and as a typosquat target. |
| `context/patterns.ts` `SECRET_PLACEHOLDER_RE` | Moved from SEC-06 so MCP-01 shares it. SEC-06 now skips `AGENT_CONFIG_RE` files (MCP-01 owns them). |
| `packages/core/src/compilers/safe-harbor.ts` | `compileSafeHarbor(ctx, {apply, now})` → `{ changes, skipped }`. `SECURITY.md`, `<public|static>/.well-known/security.txt` (Contact + Expires 330 d, Canonical if `siteUrl`), `robots.txt` (`*` = `Allow: /` only; GPTBot/CCBot/ClaudeBot/Google-Extended disallowed on app prefixes), `ai.txt`. `securityContact()` refuses empty/placeholder contacts. |
| `legal-compiler.ts` `writeChanges()` | Diff + optional write loop, shared by the legal and safe-harbor compilers. |
| `init.ts` `initSafeHarbor()`, `cli.ts legal` | Wiring: `preflight legal [--apply]` diffs/writes the bundle and prints skips; `init` applies it (non-destructive). `init` config template gains `securityContact` and `siteUrl`. |
| `test/agent-config.test.ts`, `test/safe-harbor.test.ts` | Parsing, ref vs literal, git-ignored skip, runner parsing, stubbed-fetch 404, `init` output passes both rules; RFC 9116 fields, robots groups, SEO-01 satisfied, idempotency, no overwrite, robots-route deferral, init. |
| Fixtures | vuln: `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json` (JSONC), `.claude/settings.json` with literals + unpinned/typosquat servers. clean: `.mcp.json` + `.vscode/mcp.json` using refs, pinned known servers, and the generated `public/ai.txt`. |

### Known quirks to address
1. `RouteNode.hasAuthGuard` is true when an auth call **appears** in the body (e.g. `renamePost` calls `getSession()` but never checks it). SEC-07 must do the **ordering/enforcement** check itself: auth call before the first mutation, plus a throw/return/redirect on failure. Don't rely only on `hasAuthGuard`.
2. Table keys in `ctx.dbTables` are lowercased (`post`), while `route.dbTablesAccessed` uses the Prisma table name as declared (`Post`). Compare case-insensitively.
3. `walk()` sorts files and caps at 20k. `ignorePaths` uses Bun.Glob patterns from config.
4. Seed licenses are version-gated only through `license_from_major`. Lockfile/node_modules licenses always win.
5. **Option name clash.** `BuildOptions.only` means *files* (incremental scans), while `AuditOptions.ruleIds` means *rule IDs*. `audit(root, opts)` passes the same object to both, so never reuse `only` for rules: it silently scanned zero files once.
6. **The seed DB is small:** ~958 npm + 246 PyPI packages, with no `repo_url`/downloads/`created_at`. LEG-01 treats seed membership as trusted and skips the Levenshtein check for those packages. Unknown packages that aren't typosquats go to the live registry check (1.2 s timeout), which is skipped `--offline`, so they're left unverified rather than flagged. Run `seed:packages` with network to grow it to 50k.
7. The test suite always uses `offline: true` (no network). Sprint 5 covers the LEG-01 registry path with a stubbed `fetch` (`test/leg01-registry.test.ts`).
8. **Cert signing (spec conflict resolved toward the safer option):** the handoff said HMAC-SHA256, but WEBSITE_SPEC's static `/verify` page checks `crypto.subtle.verify("Ed25519", PUBLIC_KEY, …)`, and HMAC can't be verified publicly without leaking the secret. So certs use **Ed25519 over canonical JSON**.
   - Key: `PREFLIGHT_CERT_SECRET` → seed = sha256(secret), which is deterministic for CI. Otherwise a generated `~/.preflight/cert.key` (PKCS8 PEM, 0600).
   - URL: `${PREFLIGHT_VERIFY_BASE ?? "https://preflight-ai.dev"}/verify#<b64url payload>.<b64url sig>`. **The default domain is a placeholder.** Set the real one, and publish the public key the verify page trusts, when the website ships.
9. **Interpretations, all on the stricter side:**
   - SEC-01 also flags `auth.jwt()->'user_metadata'`. Prisma/Drizzle tables in Supabase projects must have `ALTER TABLE … ENABLE ROW LEVEL SECURITY` in a migration.
   - SEC-09 fires if *either* the rate limit or the input/max_tokens cap is missing.
   - PAY-02 doesn't count a plain `$transaction` as safe. It needs `decrement`, Serializable, `FOR UPDATE` or an `rpc`.
   - OPS-02 flags any non-local Postgres URL on :5432 (including the Supabase session pooler) on serverless targets.
   - LEG-03 needs a non-prechecked checkbox *and* a `CURRENT_LEGAL_VERSION` reference in code.
   - SEC-04's bucket-name regex and PRIV-06's export-route regex were truncated in RULES_SPEC (markdown pipes), so I chose broad regexes (see the rule files).
10. **Deliberate skips:**
    - SEC-03 skips files that verify a webhook signature, because their ids come from a signed event (SEC-08 covers unverified webhooks).
    - SEC-07 skips webhook routes (SEC-08 owns them) and trusts `hasAuthGuard` only when no auth call appears in the body (middleware, wrapper or `Depends`).
    - SEC-06 skips git-ignored `.env*` files, because that's where secrets belong.
11. **`bun build --compile` (resolved in Sprint 5).**
    - `delegate()` now uses a static map of lazy `import()`s, so `attack`, `ui`, `init` and `mcp` are bundled (before this, the binary had only 64 modules and those subcommands were missing).
    - The git worker can't go in as a second entrypoint: on Bun 1.2.10, multiple entrypoints break the embedded `known-packages.sqlite` path (`Cannot find module '/$bunfs/root/../known-packages-*.sqlite'`, even with `--root`). Instead, SEC-06 checks whether the worker file is on disk. If it isn't (as in a compiled binary), SEC-06 runs the same `scanGitHistory()` in-process instead of silently skipping history, which is what used to happen. Revisit when Bun fixes multi-entry assets.
    - The binary also has no `dist/ui-assets`, so `preflight ui` serves the embedded lite UI.
    - `bun build --compile` leaves a 57 MB `.*.bun-build` temp copy of bun in the cwd. These are gitignored now, and `compile.test.ts` builds with `cwd` set to its tmpdir.
12. **Biome.** Sprint 1's `context/*.ts` files carry ~20 pre-existing lint findings (useTemplate, noAssignInExpressions). `biome check --write packages/core` reformats all of them, so run biome only on the files you touch.
14. **Feature tiers: everything is free at launch.** `src/entitlements.ts` maps features to the WEBSITE_SPEC §6 tiers. `resolveTier()` currently always returns `"agency"`, so nothing is locked.
    - Already gated through `requireFeature()`: `compileLegalDocs` (pro), `generateCertificate` and `writeVendorPack` (agency), and `preflight attack` (pro).
    - Done in Sprint 3: `requireFeature("mcp")` in `bin/mcp.ts`, `requireFeature("attack")` in `pentest/runner.ts` (and per-tool in the MCP `tools/call`), `requireFeature("init")` in `init.ts`. Sprint 4: `requireFeature("ide")` at the top of the VS Code extension's `activate()`.
    - To turn on paid tiers later, replace only the body of `resolveTier()` with real license verification. Don't add an env-var override, because that becomes a free bypass.
15. **MCP is hand-rolled, dual-era (stricter/safer reading of an ambiguous spec).** The handoff just said "JSON-RPC 2.0 … `initialize`, `tools/list`, `tools/call`". Context7 showed the 2026-07-28 revision replaced the `initialize` handshake with per-request `_meta` + `server/discover`. To avoid breaking either kind of client I support both: legacy `initialize` echoes the client's version if known (else the newest legacy one), and modern requests carrying `_meta.protocolVersion` get `resultType: "complete"` and a `-32022` on an unsupported version. If you only ever target one client, this can be simplified. `handle()` is pure so it's unit-tested without spawning a process.
16. **Pentester safety: localhost-only by default.** `assertSafeTarget()` rejects any non-loopback host unless `allowRemote` (CLI `--allow-remote`, never set implicitly). Every probe is non-destructive: GET/OPTIONS, `{}`-body writes, forged-signature webhooks, canary UUIDs, and a 20-request burst — nothing deletes or persists real data. `tracedFetch` redacts auth headers in the `curl` string and PT-06 redacts any secret it finds (a test asserts no full `sk_live_` ever appears in a finding).
17. **PT-02 EXPLOITED criterion.** Per RULES_SPEC, only 2xx (write ran) or 500 (crashed mid-side-effect) counts as exploited; 401/403/404/**429**/400/redirect are all treated as a rejection. The 429 case matters: a rate-limited endpoint is not an unauthenticated-write finding.
18. **PT-01 needs Supabase creds.** It's SKIPPED unless `SUPABASE_URL` + anon key are in `.env` or passed via `--supabase-url`/`--anon-key`. PT-03 uses `--tenant-token` if given, otherwise a `dummySupabaseJwt()` (which fails real signature checks by design — that asymmetry is the probe).
19. **Live probes depend on `ctx.routes`.** The pentester only fires at routes the static scan discovered, so an app whose routes the builder can't see won't be probed. Point `attack` at the repo root (not just the URL) so the context is accurate.
20. **ui-server request guard (stricter reading).** SPEC §5 only says "local". Because the server writes `legal/*.md` and certificates, every request must carry `Host: 127.0.0.1|localhost:<port>` (blocks DNS rebinding), every POST/WS must carry a matching `Origin` (blocks cross-site POSTs and WebSocket hijacking), and POST bodies must be `application/json` (forces a CORS preflight). Consequence: `curl -X POST` without `-H 'Origin: http://127.0.0.1:4400'` gets 403. Bodies are capped at 64 KB.
21. **UI pentests are loopback-only.** The WS handler never forwards `allowRemote`, so `--allow-remote` is CLI-only. Default target `http://localhost:3000`; one run at a time per socket; errors arrive as `PENTEST_ERROR`.
22. **`/api/cert/export` refuses while blocked** (409) unless the body has `allowBlocked: true`; both UIs ask for confirmation before retrying with it. It also writes the vendor pack (SBOM, DATA_FLOW.mermaid). `/api/report` scans offline by default (`preflight ui --online` to enable the LEG-01 registry check) to stay inside the 1.1 s budget.
23. **VS Code extension safety.** `preflight.command` and `preflight.agentCommands` are `"scope": "machine"`, so a cloned repo's `.vscode/settings.json` can't swap the scanner binary or trigger arbitrary commands, and `untrustedWorkspaces.supported` is false. The agent command IDs (`composer.startComposerPrompt`, `aichat.newchataction`, `claude-vscode.editor.open`) are best-effort guesses: the prompt is always copied to the clipboard first, and only an installed command is run.
24. **Webview mode.** Inside VS Code the Svelte app gets the report via `postMessage` (it posts `{type:"ready"}` first) and has no server, so the pentest and legal tabs show "run `preflight ui`" and the header's Export Certificate fails with a toast. The extension isn't packaged (`.vsix`) or run in an Extension Development Host yet: only typechecked, bundled, and its CLI bridge tested.
25. **Toolchain versions installed this sprint:** svelte 5.57, @sveltejs/vite-plugin-svelte 7.3, vite 8.3, tailwindcss + @tailwindcss/vite 4.3, svelte-check 4.7, TypeScript pinned to ~5.9 in `packages/ui` (TS 7 came in by default and svelte-check targets 5.x), @types/vscode ~1.90. `bun.lock` updated. `cli.ts` became mode 755 via bun's workspace bin link.
26. **VS Code extension: packaged, but not run in an Extension Development Host.** This Mac has no VS Code or Cursor (`code`/`cursor` aren't on PATH), and downloading a VS Code build for `@vscode/test-electron` was out of scope. The `.vsix` contains only `dist/extension.js`, `media/` and the manifest. It's packaged with `--skip-license --allow-missing-repository` because the repo has no LICENSE or repository URL yet. **Add both before publishing.** The EDH smoke test is still open.
27. **Lite UI layout nits (seen in the screenshot at 1440 px):** the header's "Fix All in Agent" button is clipped at the top, and the "ENTRYPOINTS" lane label crowds the "ARCHITECTURE DATA FLOW" title. Cosmetic only, not fixed.
28. **Playwright on this Mac.** There's no `/opt/pw-browsers` (that's the cloud sandbox). The cached `~/Library/Caches/ms-playwright/chromium_headless_shell-1248/.../chrome-headless-shell --headless --screenshot=… --virtual-time-budget=5000 <url>` works without installing the Playwright package.
29. Engine per-rule timings (`timings["rule:*"]`) overlap because rules run under `Promise.all`, so `bench` prints only the builder phases plus the `rules` total.
30. **Compact is −70%, not "~80–82%".** Measured on the vuln fixture: 241 B/finding compact vs 810 B verbose JSON (single-line). The roadmap's 80% figure assumed dropping most of the fix. I didn't take that route: `FIX:` keeps the prompt (minus the `In file:line,` lead-in) up to 160 chars at a word boundary, because a first-sentence cut dropped the actual fix on SEC-01 (its prompt states the problem first). The test asserts ≥65%. MCP compact also omits `structuredContent`, so the saving per call is much larger than per finding. Agents pass `format: "verbose"` for evidence, impact and full prompts.
31. **Changed-only accuracy vs speed.** Anchors are a path heuristic (`changed.ts` `CODE_ANCHOR`). A changed route whose auth wrapper lives in an unrelated, unchanged helper file could false-positive. Drizzle tables in a file not named schema/model/db are missed as context. `scope: "repo"` set (stricter choice: anything whose verdict can flip because of an unchanged file): OPS-01, OPS-04, SEO-01, LEG-03, LEG-04, LEG-05, LEG-06, PRIV-02, PRIV-06, PRIV-07. LEG-01/02 still fire when `package.json` is itself changed. `--write-checklist` is ignored with `--changed-only` (it would overwrite the checklist with a subset).
32. **Hook semantics (interpretations).** "New" means not in `.preflight/baseline.json`, which `init` snapshots once and never overwrites. Delete it to re-baseline. With no baseline, every blocking finding in changed files counts as new. Hooks fail open (exit 0 + stderr note) if the scanner throws, so a Preflight bug can't trap the agent. Claude hook commands pass `"$CLAUDE_PROJECT_DIR"` as the path (`resolve("")` = cwd if it's unset). `preflight` must be on PATH, the same assumption as `.mcp.json`. The `git commit` regex also matches things like `git log --grep commit`, which just runs one extra scan.
33. **MCP-01 interpretations (stricter).** Vendor regexes run on *every* string in a config (e.g. `"command": "TOKEN=ghp_… npx"`), not just `env`/`headers`/`args`; entropy checks run on any secret-named key, flag value or URL query param. Git-ignored configs are skipped for MCP-01 *and* SEC-06, matching SEC-06's `.env` policy. URL- or path-shaped values are never entropy-flagged.
34. **MCP-02 "known" = seed DB ∪ `OFFICIAL_MCP_SERVERS`.** The seed has no MCP servers, so without the curated list every official server would fail. Pinned-but-unknown still fires (HIGH): "unpinned **or** not in seed". `@latest`/ranges count as unpinned; git/URL specs are always flagged; local paths are skipped. Our own `init` writes `command: "preflight"` (no runner), so it passes.
35. **Safe-harbor choices.** The contact comes from `securityContact`, then `contactEmail`, then the `package.json` author email. Reserved/placeholder domains (`example.*`, `.example`, `.test`, `.invalid`, `localhost`, `you@yourcompany…`) are refused, so the clean fixture (`northwind.example`) gets no SECURITY.md/security.txt by design. `Expires` is reused while >30 days remain, which keeps re-runs idempotent. Files are only created, or updated while they still carry the "Generated by Preflight safe-harbor" marker. A Next/SvelteKit robots *route* means robots.txt is skipped with instructions instead of a conflicting static file. The `*` group never has a Disallow, so search is never blocked. App prefixes = API routes + pages whose first segment/route group looks like an app shell or whose page/layout calls an auth assertion. Only the four bots named in the roadmap are blocked.
36. `writeChanges()` is now shared, but the MCP `compile_legal` tool and the UI legal studio still call only `compileLegalDocs` (no safe-harbor). That's out of this sprint's wiring scope.
13. `/ponytail-review` wasn't available as a skill in the Sprint 2 session. I did the review by hand instead: removed dead helpers, reused `lineAt`, and dropped a redundant regex. Sprint 4: same (by hand) — removed an unused `findingKey` export, de-exported `toDiagnostic`, and dropped the unused `mermaid` field from the UI audit store. Sprint 3: same (by-hand review) — de-exported two file-local consts (`PROBE_TIMEOUT_MS`, `RpcError`), removed an unused `blockedStatus`/`isRedirectToLogin` pair, and cut unused test imports. Sprint 5: same (by hand). Removed the now-dead `existsSync` import and the "not available in this build" branch from `cli.ts`, dropped the misleading per-rule timings from `bench`, and replaced six duplicated SLA-setup lines in `cli.test.ts` with the shared bench helpers. Nothing that affects detection was removed. Sprint 6: same (by hand). Dropped a redundant `Set` in `changedScope`, de-exported `isContextAnchor`/`compactFix`/`readBaseline`/`newBlockers`, and folded the `.mcp.json` merge into the shared `mergeJson()`. Sprint 7: same (by hand). De-exported `SAFE_HARBOR_MARK`, `appPrefixes`, `SafeHarborResult` and `ServerPackage`, dropped a redundant `apikey` alternative, and factored the duplicated write loop into `writeChanges()`.

---

## 5. Remaining work (in order)

### Sprint 2 ✅ done: 37 rules, engine/scoring/graph, legal/checklist/cert/vendor-pack compilers, CLI and SARIF (see §3 'Sprint 2 files' and quirks 5–13).

### Sprint 3 ✅ done: dual-era stdio MCP server (`bin/mcp.ts`), non-destructive active pentester PT-01..PT-06 (`pentest/`), and `preflight init` (see §3 "Sprint 3 files" and quirks 15–19).

### Sprint 4 ✅ done: `ui-server` (REST + WS, lite-UI fallback), Svelte 5/Tailwind v4 Mission Control in `packages/ui`, and the VS Code extension (see §3 "Sprint 4 files" and quirks 20–25).

### Sprint 5 ✅ done: `bun run bench`, LEG-01 stubbed-fetch test, `bun build --compile` fixes and smoke test, `.vsix` packaging, lite-UI screenshot, README (see §3 "Sprint 5 files" and quirks 11, 26–29). Still open: Extension Development Host smoke test (quirk 26), LICENSE and repository URL, real verify domain (quirk 8).

### Expansion sprints 6–14 (planned 2026-10-21 from PRE_EXPANSION_ROADMAP.md + EXPANSION_ROADMAP.md)

How each sprint starts: add the new rule IDs to the RULES_SPEC registry (lines 105–200) and the scoring/blocking matrix (lines 3–12) **before** writing code. Every new rule needs a positive case in `fixtures/vulnerable-saas` (or a new sibling fixture) and must stay silent on `fixtures/clean-saas`. The 500-file cold scan SLA (<3 s, currently ~0.3 s) is re-checked with `bun run bench` at the end of every sprint.

Constraints that override the roadmaps:
- EXPANSION §2 overstates `@ast-grep/napi`: it only includes JS/TS/TSX/HTML/CSS, and every other language is a separate native `@ast-grep/lang-*` package loaded via `registerDynamicLanguage`. **Hybrid policy:** `CodeIndex` stays the always-on baseline (TS/JS + Python). napi is an optional accelerator behind `getAst()`, used for Go/Rust rules (which skip with an info notice when it's missing) and for deterministic rewrite-based `autoFixPatch`. The Sprint 9 spike decides whether it can become a real dependency.
- The landing-page "roast" input box lives in `preflight-web/` (Gemini). Here we only ship the CLI command and its JSON output.
- Anything that needs a hosted always-on service (daily canary SaaS, vendor DPA watcher) is out of scope. We ship the local command plus a scheduled GitHub Action template.

#### Sprint 6 ✅ done: `--compact` reporter (MCP default), `scan --changed-only` with `scope: "repo"` rule tags, and `preflight hook` + init-merged Claude/Cursor Stop (+ opt-in pre-commit) hooks with a baseline (see §3 "Sprint 6 files" and quirks 30–32).

#### Sprint 7 ✅ done: MCP-01 (hardcoded creds in agent/MCP configs) + MCP-02 (unpinned/unverified `npx`/`uvx` servers), and the safe-harbor compiler (SECURITY.md, security.txt, robots.txt, ai.txt) wired into `legal --apply` and `init` (see §3 "Sprint 7 files" and quirks 33–36).

#### Sprint 8: Distribution (badge, GitHub Action, roast) ⏸ deferred (2026-10-21)
- **Skipped for now at the user's request; blockers not yet written down.** Nothing in Sprints 9–14 depends on it. `preflight-web`'s roast box is waiting on `roast --json`. Ask the user for the blockers before resuming.
- **Prerequisite:** decide the real verify domain (quirk 8, still open). The badge links to `/verify#<cert>`.
- `preflight badge` writes `.preflight/badge.svg` (score + Verified only when there's a valid Ed25519 cert) and prints a README snippet.
- Composite `action.yml`: scan, SARIF upload, badge commit or artifact, and fail on LAUNCH_BLOCKED.
- `preflight roast <github-url>`:
  - Download a GitHub tarball into a temp dir. No `git clone`, no installs, no scripts. Static, `--offline` rules only, never the pentester.
  - Caps: 50 MB download, the existing 20k-file walk cap, and a timeout.
  - Output a "survival card" (terminal + SVG) plus `--json` for preflight-web.
  - Restrict the URL to `github.com/<owner>/<repo>` (no arbitrary hosts, which prevents SSRF).

#### Sprint 9: RepoContext v2 adapters + vector/cache rules
- **napi spike first (half a day, decision gate). Record the results as a quirk.**
  - Install `@ast-grep/napi` + `@ast-grep/lang-python` + `@ast-grep/lang-go`, registered in **one** `registerDynamicLanguage` call (repeated calls are ignored).
  - Check whether `bun build --compile` embeds the `.node` addon and the dynamic grammar libraries (compare quirk 11's SQLite embedding bug), and whether cross-target builds work.
  - Measure `bun run bench` with ASTs on.
  - Port one existing rule (e.g. SEC-10) to ast-grep and compare false positives on both fixtures.
  - Outcome A (it embeds cleanly, SLA holds): napi becomes a real dependency of `packages/core`. Update the "zero runtime deps" line in CLAUDE.md and keep CONTRIBUTING_RULES' ast-grep-first guidance.
  - Outcome B: stay hybrid, and rewrite CONTRIBUTING_RULES §2–3 to lead with `CodeIndex` (`calls/args/objectEntries/enclosingFunction`), with ast-grep as the optional path.
- Refactor `schema-parser.ts`/`sql-parser.ts` behind a minimal `SchemaAdapter` registry (`context/adapters.ts`), adding only what's needed (no `LanguageAdapter` yet). This is a pure refactor gate: all existing tests pass and the bench is unchanged.
- Add `ctx.dataQueries` (vector/cache client calls) from `CodeIndex.calls()`. Use the knowledge lookups for qdrant/pinecone/chroma/weaviate/milvus/pgvector/upstash/ioredis.
- Rules:
  - `VEC-01` search without a tenant filter: only on multi-user apps (auth present); false-positive risk is high, so seed the clean fixture with a correct filter.
  - `VEC-02` vector client without apiKey/TLS, or ports 6333/8000/19530 in config.
  - `VEC-03` PII keys in vector metadata (reuse PRIV-05 PII patterns).
  - `CACHE-01` global cache keys in authed routes.
  - `CACHE-02` `set` without TTL.

#### Sprint 10: BaaS + edge databases
- Convex: `convex/schema.ts` adapter. `BAAS-01` covers a public `mutation`/`query` without `ctx.auth.getUserIdentity()`, or an admin/webhook export that isn't `internal*`.
- Firestore: `firestore.rules` mini-parser. `BAAS-02` covers `{document=**}` with `request.auth != null` alone.
- Mongo/Mongoose: `BAAS-03` covers `find/findOne/updateOne(req.body | await req.json())` without a sanitizer or a schema parse (same taint shape as SEC-10).
- Edge: `EDGE-01` covers Turso embedded replica or local SQLite with PII tables and no `encryptionKey`. `EDGE-02` covers D1/libSQL queries on tenant tables without a tenant predicate or helper.
- New fixture sibling `fixtures/vulnerable-baas` (Convex + Firestore), so the Next/Supabase fixture doesn't get muddled.

#### Sprint 11: Infra + client configs
- Hand-rolled YAML subset reader for `docker-compose*.yml` (no deps). Dockerfile line scanner.
- `IAC-01` DB/cache/vector ports published on 0.0.0.0, with a deterministic `autoFixPatch` that changes them to `127.0.0.1:`.
- `IAC-02` no non-root `USER`, or `docker.sock` mounted into a web container.
- `SOV-01` telemetry/phone-home beacons (Next telemetry, Chroma/LangChain PostHog, Google Fonts, CDN scripts). It's **profile-only** (`--profile airgap`), because it would be noise for indie apps.
- `CLIENT-01` Tauri `tauri.conf.json` covers v1 `allowlist` all/`**` scopes and v2 `capabilities/*.json` (verify the v2 schema via docs).
- `CLIENT-02` Expo/RN covers tokens in `AsyncStorage.setItem` instead of `expo-secure-store`.

#### Sprint 12: Python rules
- `CodeIndex` already lexes Python and `lockfile-parser.ts` already reads requirements/pyproject/poetry.lock. Add `uv.lock` + `Pipfile.lock`.
- `PY-01` covers `pickle.loads`, `torch.load` without `weights_only=True`, and `yaml.load` without SafeLoader.
- `PY-02` covers blocking calls inside `async def` FastAPI routes.
- `PY-03` covers LangChain/LlamaIndex exec sinks (`PythonREPLTool`, `allow_dangerous_code=True`).
- `PY-04` covers mutable defaults and module-level per-request state.
- New fixture: `fixtures/vulnerable-fastapi` plus a clean twin.

#### Sprint 13: Compliance profiles (agency tier)
- `--profile hipaa|fintech-pci|legal-privilege|eu-ai-act|airgap`. These are extra rule packs plus stricter severities, gated through `requireFeature("profiles")` (agency). The gate goes in `entitlements.ts` only, with no env override (quirk 14).
- Data: add `baa` / `zdr` / `trainsOnData` fields to `subprocessor-map.json` with a script (don't hand-edit or read the 76 KB file).
- Checks per profile:
  - HIPAA: non-BAA vendors, PHI tables without an audit log, session idle >15 min.
  - Fintech: FLOAT/REAL money columns, DELETE/UPDATE on ledger tables, idempotency on mutation routes.
  - Legal: no tenant/matter namespace in vectors (VEC-01 at blocking severity), legal-hold flag vs cascade delete.
  - EU AI Act: `AI_INVENTORY.md` compiler (models, embedders, prompts, HITL routes) from `ctx` stack + subprocessors.

#### Sprint 14: Go/Rust services (napi-gated)
- `LanguageAdapter` for Go and Rust built on ast-grep: `go.sum`/`Cargo.lock` deps, plus Gin/Echo/Fiber and Axum/Actix route extraction into `ctx.routes`. Without napi, `ctx.routes` stays empty for these languages and the rules emit one info notice, never a false clean.
- Rules:
  - `SYS-01` unbounded `go func()`/`tokio::spawn` in handlers (no semaphore/`errgroup.SetLimit`/worker pool).
  - `SYS-02` `.unwrap()`/`.expect()` on request-derived values in Axum/Actix handlers.
  - `SYS-03` `context.Background()` for DB/HTTP calls inside handlers that have `r.Context()`/`c.Request.Context()`.
- Fixtures: `fixtures/vulnerable-go` and `fixtures/vulnerable-rust` with clean twins. Tests skip (not fail) when napi is absent, and one CI job runs with it installed.
- Prerequisite: spike outcome from Sprint 9. If the grammars can't embed in the compiled binary, document that Go/Rust coverage needs the npm install, not the standalone binary.

#### Parked (not scheduled)
- `preflight canary <url>`: a daily header/HSTS/CSP/TLS-expiry probe that reuses pentest safety, plus a scheduled Action template. This is a reasonable Sprint 14 if retention matters. The hosted version and the vendor DPA-change watcher need a server.
- `CLIENT-03` Godot/Unity multiplayer authority + asset licences: high false-positive risk, niche.
- Still-open Sprint 5 items: Extension Development Host smoke test (quirk 26), LICENSE, repository URL.

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
