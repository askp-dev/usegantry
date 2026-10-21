# Gantry

Gantry checks whether an AI-generated repo is ready to launch. It runs four tools in one CLI:

- a **static readiness scanner** with 37 rules across security, privacy, legal and FinOps/ops
- a **legal compiler** for privacy policy, terms and EULA, plus a sub-processor list
- a **FinOps burn guard**
- a **non-destructive active pentester** that only targets localhost by default

A cold scan of a 500-file repo takes about 0.3 s. The hard limit is 3 s, and `bun run bench` checks it.

![Mission Control (lite UI) on the vulnerable fixture](docs/screenshots/lite-ui.png)

## Quick start

You need Bun ≥ 1.2.

```bash
bun install
```

```bash
bun run scan fixtures/vulnerable-saas
```

To build a standalone binary at `packages/core/dist/gantry`:

```bash
bun run build:bin
```

## Commands

| Command | What it does |
|---|---|
| `gantry scan [path] [--json\|--sarif\|--compact] [--changed-only] [--strict] [--offline] [--write-checklist]` | Static audit. Exits 1 when there are launch blockers. `--compact` prints one token-lean line per finding; `--changed-only` scans uncommitted files only and skips repo-wide absence rules. |
| `gantry legal [path] [--sync]` | Compiles `legal/*.md` from the vendors, PII and clauses it detects. Shows a diff unless you pass `--apply`. |
| `gantry cert [path] [--allow-blocked]` | Signed readiness certificate (Ed25519) plus a vendor pack (SBOM, `DATA_FLOW.mermaid`). |
| `gantry attack --target http://localhost:3000 [path]` | Live probes PT-01..06 against routes the static scan found. Non-loopback targets need `--allow-remote`. |
| `gantry ui [path] [--port 4400] [--online]` | Mission Control at `http://127.0.0.1:4400`, with Readiness Matrix, Live Pentest, Legal Studio and Burn Simulator tabs. |
| `gantry init [path] [--ci] [--pre-commit] [--no-hooks]` | Adds the MCP config, `CLAUDE.md`/Cursor rules, `gantry.config.json`, Claude Code/Cursor stop hooks (opt-in `git commit` gate) and a `.gantry/baseline.json`, so the hooks block only on blockers introduced after init. It's non-destructive and safe to re-run. |
| `gantry hook <stop\|pre-commit> [path] --agent claude\|cursor` | The agent hook entry point (reads the hook event JSON on stdin). |
| `gantry mcp` | Stdio MCP server with the tools `run_readiness_audit`, `sync_stack_legal_docs` and `run_active_pentest`. |

Exit codes: `0` ok · `1` launch blockers · `2` usage or runtime error.

## Rules

| Pillar | Rules |
|---|---|
| Security | SEC-01 … SEC-12 (RLS, definer functions, IDOR, public buckets, leaked or historical secrets, auth ordering, webhook signatures, AI endpoint abuse, headers, XSS) |
| Privacy | PRIV-01 … PRIV-07 (erasure cascades, plaintext tokens, ungated analytics, data export) |
| Legal | LEG-01 … LEG-06 (slopsquatted packages, copyleft vs EULA, clickwrap, sub-processor drift, legal routes, AI disclaimer) |
| FinOps / Ops | FIN-01..03, PAY-01..03, OPS-01..04, A11Y-01, SEO-01 |

Scoring: CRITICAL costs −25 and always blocks. HIGH costs −10 and blocks only with `--strict`. MEDIUM costs −4. Every finding comes with evidence, a plain-English impact and a ready-to-paste `agentRemediationPrompt`.

To suppress a finding, put `// gantry-ignore SEC-03` on the line or the line above it, or add the rule to `ignoreRules` in `gantry.config.json`.

## Packages

| Path | Contents |
|---|---|
| `packages/core` | Context builder, rules, engine, compilers, pentester, MCP and UI servers, CLI. No runtime dependencies. |
| `packages/ui` | Svelte 5 + Tailwind v4 Mission Control. Build it with `bun run build:ui`. Without it, the server falls back to the embedded lite UI. |
| `packages/vscode-ext` | Diagnostics, CodeLens "Fix with AI Agent" and a sidebar. Package it with `bun run --cwd packages/vscode-ext package`. |
| `fixtures/vulnerable-saas`, `fixtures/clean-saas` | Every rule must fire on the first and stay silent on the second. |

## Development

```bash
bun test packages/core/test
```

```bash
bun run typecheck
```

```bash
bun run bench
```

Environment variables:

- `GANTRY_CERT_SECRET` makes certificate signing deterministic, which you want in CI.
- `GANTRY_VERIFY_BASE` sets the verify-page origin. The default is a placeholder.

See `handoff.md` for build status and known quirks.
