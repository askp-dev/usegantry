# Gantry — Claude Code guide

Bun ≥1.2 TypeScript monorepo: a static readiness scanner, legal compiler, FinOps guard and active pentester for AI-generated repos. Build progress and next steps are in `handoff.md`.

## Token budget rules (follow strictly)
- **Never read whole spec files.** Read only the line range you need, using the map below (`Read` with offset/limit). Use `Grep` for a single rule ID (e.g. `SEC-08`) instead of opening RULES_SPEC.md.
- **Don't read** `data/subprocessor-map.json` (76 KB), `data/known-packages.sqlite`, `data/seed/*.txt`, lockfiles or `node_modules/`. Query them with `bun -e` or `grep` and print only what you need.
- **The site is `site/`** (SvelteKit 3 static + Tailwind v4, built to DESIGN.md). Its data comes from real scans (`bun run data`); see `site/README.md`. SvelteKit 3: config lives in `vite.config.ts`, use `#lib/…` (with `.ts` extensions) and `resolve()` from `$app/paths`.
- Once you've read a file this session, don't re-read it; rely on your edits.
- Truncate command output: `bun test <file> --bail 2>&1 | tail -40`, `bun run typecheck 2>&1 | head -40`.
- Use the Explore subagent only for broad multi-file searches. Use Grep/Glob for anything targeted.
- Write each rule as one small file. Don't paste large code blocks into chat; write them to disk.
- Work **one sprint per session**. When a sprint is done, update `handoff.md` §2 and §5, commit, and tell the user to `/clear` before the next sprint.

## Plugins & MCP
- **Ponytail** (plugin, on by default) keeps code minimal. Its ladder: reuse existing code, then the stdlib, then a one-liner. It must never remove validation, error handling or security checks, and in this repo the detection logic *is* the product, so rule coverage beats brevity. Run `/ponytail-review` on the diff before each sprint commit.
- **Context7** (MCP) fetches current docs for Bun, Svelte 5 runes, Tailwind v4, the VS Code extension API and the MCP spec. Use it instead of web searches or guessing APIs, and ask for a narrow `topic` to keep responses small.

## Spec line map (read ranges, not files)
| Need | File : lines |
|---|---|
| Data contracts (already implemented in `packages/core/src/context/types.ts`) | SPEC.md 68–172 |
| Exact algorithms for SEC-01 / SEC-03 / SEC-07 / FIN-01 / PAY-02 | SPEC.md 173–221 |
| UI server REST + WS protocol | SPEC.md 222–232 |
| Scoring & blocking matrix (+ partial scans, network rules, profile-only rules) | RULES_SPEC.md 3–18 |
| Security rules SEC-01..12 + MCP-01..02 + VEC-01..02 + CACHE-01 + BAAS-01..03 + EDGE-02 + IAC-01..02 + CLIENT-01..02 + PY-01/03/04 + SYS-02 + DEP-01..03 | RULES_SPEC.md 21–57 |
| Privacy rules PRIV-01..07 + VEC-03 + EDGE-01 + SOV-01 | RULES_SPEC.md 60–74 |
| Legal rules LEG-01..06 | RULES_SPEC.md 77–87 |
| FIN / PAY / OPS / A11Y / SEO / CACHE-02 / PY-02 / SYS-01 / SYS-03 rules | RULES_SPEC.md 90–110 |
| Compliance profile packs HIPAA-01..03 + PCI-01..03 + LGL-01..03 + AIA-01 | RULES_SPEC.md 113–127 |
| Pentest probes PT-01..06 | RULES_SPEC.md 130–154 |
| Rule registry (`rules/index.ts`) | RULES_SPEC.md 157–342 |
| Design principles + banned AI-look tropes | DESIGN.md 1–34 |
| Design tokens / contrast / typography / motion | DESIGN.md 35–124 |
| UI components (header, go/no-go board, tag, findings, schematic, Range, legal, budget, title block) | DESIGN.md 125–210 |
| Certificate, roast card, badge, CLI, site, voice, implementation plan | DESIGN.md 211–262 |
| Handoff: status / quirks / remaining work | handoff.md 25–50 / 374–537 / 538–615 |

## Architecture essentials (no need to rediscover)
- Rules take `RepoContext` from `buildRepoContext(root)` in `packages/core/src/context/builder.ts`.
- Use `ctx.getCode(rel)`, which returns a `CodeIndex` (`code-index.ts`). Pattern-match on `.masked` (strings/comments blanked); read literals from `.noComments`. It provides `calls()`, `args()`, `objectEntries()`, `functions()`, `enclosingFunction()`, `imports()` and `snippet()`. Don't require `@ast-grep/napi`: it's optional and `getAst()` throws if it's missing. The Sprint 9 spike kept it optional (outcome B, handoff quirk 37).
- ORM/DDL sources go through the `SchemaAdapter` registry (`context/adapters.ts`): to support a new ORM, add one adapter. Vector-DB and cache client calls are pre-collected, lazily, in `ctx.dataQueries` (`context/data-queries.ts`).
- Go/Rust (Sprint 14) is the one place ast-grep is used: `context/systems-lang.ts` lazily loads the optional grammars, `ctx.getAst()` parses `.go`/`.rs`, and SYS rules get handler nodes from `sysHandlers()` (it throws `RuleSkipped` → `report.notices` when the grammars are missing). Body-level TS route rules iterate `scriptRoutes(ctx)`, not `ctx.routes`.
- Shared regexes live in `context/patterns.ts`; vendor/package lookups in `context/knowledge.ts`. Reuse them; don't duplicate them.
- `ctx.dbTables` keys are lowercase, so compare table names case-insensitively. PyPI deps are keyed `pypi:<name>`.
- `RouteNode.hasAuthGuard` only means an auth call appears. SEC-07 must check order (auth before first mutation) and enforcement itself.
- Zero runtime dependencies in `packages/core`: hand-rolled MCP JSON-RPC, no zod. Svelte/Tailwind/Vite are allowed only in `packages/ui`, and the VS Code API only in `packages/vscode-ext`.
- Hard SLA: a cold scan of 500 files in under 3,000 ms. Keep rules single-pass and lazy.

## Commands
- `bun install` installs deps (once).
- `bun test packages/core/test` runs tests (target one file while iterating).
- `bun run scan fixtures/vulnerable-saas` runs the CLI (once the CLI exists).
- `bun run typecheck` type-checks; `bunx biome check --write <files>` lints and formats.
- `bun run bench` runs the perf SLA check (Sprint 5).

## Conventions
- Rule file names and export names must match the registry in RULES_SPEC.md 157–342 exactly.
- Every finding needs `evidence` (a snippet), plain-English `impact`, and a surgical `agentRemediationPrompt`. Add `autoFixPatch` only when the fix is deterministic.
- Each rule gets a test asserting it fires on `fixtures/vulnerable-saas`. Every rule must also pass on `fixtures/clean-saas` (create it in Sprint 2) with no findings.
- Commit after each sprint with message `feat(sprint-N): …`.
