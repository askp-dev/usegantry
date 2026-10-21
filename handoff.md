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
| 3. MCP server, pentest runner, `init` | ⏳ Not started (next) |
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

### Empty directories still to fill
`packages/core/src/{pentest,server,util}`, `packages/ui/src/lib/{components,stores}`, `packages/ui/src/routes`, `packages/vscode-ext/src`.

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

### Known quirks to address
1. `RouteNode.hasAuthGuard` is true when an auth call **appears** in the body (e.g. `renamePost` calls `getSession()` but never checks it). SEC-07 must do the **ordering/enforcement** check itself: auth call before the first mutation, plus a throw/return/redirect on failure. Don't rely only on `hasAuthGuard`.
2. Table keys in `ctx.dbTables` are lowercased (`post`), while `route.dbTablesAccessed` uses the Prisma table name as declared (`Post`). Compare case-insensitively.
3. `walk()` sorts files and caps at 20k. `ignorePaths` uses Bun.Glob patterns from config.
4. Seed licenses are version-gated only through `license_from_major`. Lockfile/node_modules licenses always win.
5. **Option name clash.** `BuildOptions.only` means *files* (incremental scans), while `AuditOptions.ruleIds` means *rule IDs*. `audit(root, opts)` passes the same object to both, so never reuse `only` for rules: it silently scanned zero files once.
6. **The seed DB is small:** ~958 npm + 246 PyPI packages, with no `repo_url`/downloads/`created_at`. LEG-01 treats seed membership as trusted and skips the Levenshtein check for those packages. Unknown packages that aren't typosquats go to the live registry check (1.2 s timeout), which is skipped `--offline`, so they're left unverified rather than flagged. Run `seed:packages` with network to grow it to 50k.
7. The test suite always uses `offline: true` (no network). The LEG-01 registry path (404 / <30 days with <500 weekly downloads) has no automated test yet. Add a stubbed-`fetch` test in Sprint 5.
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
11. **`bun build --compile` (Sprint 5).** The git worker is loaded via `new URL("../../workers/git-entropy.worker.ts", import.meta.url)`, and the CLI's `delegate()` uses dynamic paths. Both need to be passed as extra entrypoints (or switched to static imports) for the compiled binary. If the worker fails to start, SEC-06 just skips history.
12. **Biome.** Sprint 1's `context/*.ts` files carry ~20 pre-existing lint findings (useTemplate, noAssignInExpressions). `biome check --write packages/core` reformats all of them, so run biome only on the files you touch.
14. **Feature tiers: everything is free at launch.** `src/entitlements.ts` maps features to the WEBSITE_SPEC §6 tiers. `resolveTier()` currently always returns `"agency"`, so nothing is locked.
    - Already gated through `requireFeature()`: `compileLegalDocs` (pro), `generateCertificate` and `writeVendorPack` (agency), and `preflight attack` (pro).
    - Sprint 3/4: call `requireFeature("attack")` in `pentest/runner.ts`, `"mcp"` in `bin/mcp.ts`, and `"ide"` in the VS Code extension.
    - To turn on paid tiers later, replace only the body of `resolveTier()` with real license verification. Don't add an env-var override, because that becomes a free bypass.
13. `/ponytail-review` wasn't available as a skill in the Sprint 2 session. I did the review by hand instead: removed dead helpers, reused `lineAt`, and dropped a redundant regex.

---

## 5. Remaining work (in order)

### Sprint 2 ✅ done: 37 rules, engine/scoring/graph, legal/checklist/cert/vendor-pack compilers, CLI and SARIF (see §3 'Sprint 2 files' and quirks 5–13).

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
- `scripts/bench.ts` (`bun run bench`): wrap the existing SLA test in `test/cli.test.ts` (503 files, cold CLI, currently ≈0.4 s) as a standalone script that prints timings. Also add a stubbed-fetch test for the LEG-01 registry path (quirk 7).
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
