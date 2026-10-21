To turn **Preflight AI** from a great developer tool into a category-defining product with built-in viral loops, minimal token overhead, and enterprise pull, here are **7 final high-leverage additions** that round out the architecture, distribution, and business model.

---

## 1. "Caveman / Token-Lean" MCP Output Mode (`--compact`)

If a coding agent (Claude Code, Cursor, OpenCode) calls `run_readiness_audit` 5 times during a build session and receives a 4,000-token verbose JSON payload each time, it burns 20,000 tokens of context window and degrades the agent's reasoning.

* **The Feature:** Make the MCP server default to a **Token-Dense Compact Format** (~60 tokens per finding instead of ~400), while keeping verbose human explanations for the CLI/UI:
```text
SCORE:65/100|BLOCKED:true
[CRIT][SEC-01] supabase/migrations/01_init.sql:14 | table:invoices missing RLS | FIX:Add `ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;` + owner policy `auth.uid() = user_id`
[CRIT][LEG-02] package.json:22 | pkg:pdf-gpl (AGPL-3.0) conflicts w/ commercial EULA | FIX:Replace w/ `pdf-lib` (MIT)

```


* **Why It Matters:** Reduces agent token consumption by **~82%** during self-healing loops and allows small/fast sub-agent models (like Haiku or Flash) to apply fixes cleanly on the first try.

---

## 2. Claude Code / Cursor "Zero-Escape" Execution Hooks

Developers often forget to run `npx preflight scan` manually before committing. Both **Claude Code** (`.claude/settings.json` `Stop` / `PreToolUse` hooks) and **Cursor** (`.cursor/hooks.json`) support lifecycle hooks that execute shell commands automatically.

* **The Feature:** When a user runs `npx preflight init`, automatically configure a **Post-Task / Pre-Commit Agent Hook**:
* Whenever the coding agent finishes a task (or tries to run `git commit`), the hook runs `preflight scan --changed-only` in **~180ms**.
* If the agent just introduced an unauthenticated Server Action or leaked a public env variable, the hook **blocks the agent from stopping** and pipes the exact error back into the agent's stdin so it fixes its own mistake before the human even reviews the diff.



---

## 3. Viral Distribution Engine: Dynamic README Badges & `npx preflight roast`

Developer tools grow fastest when every user becomes a billboard. Two features create an immediate viral loop on GitHub and X:

1. **Cryptographic README Shield (`![Preflight 100/100](...)`):**
* When a repo passes all checks via the free GitHub Action, generate an SVG badge for their `README.md` (`Preflight Readiness: 100/100 • Verified`) that links directly to their static `/verify#...` attestation page.


2. **`npx preflight roast <github-url>` (The Viral Launch Hook):**
* A command (and a public input box on your landing page) that clones any public GitHub repo into memory, runs the 1-second scan, and outputs a shareable, tongue-in-cheek **"Vibe-Code Survival Card"** (e.g., *"Chances of surviving Hacker News front page: 12% — Exposed Supabase tables, 0 rate limits on OpenAI route, and an accidental GPL virus"*). Builders will post their before/after scores across X and Reddit.



---

## 4. "Shadow AI" & MCP Config Auditor (`MCP-01` & `MCP-02`)

Ironically, the biggest new attack vector in AI-generated projects is the developer's **own `.cursor/mcp.json`, `.claude.json`, or agent workspace config** committed or running locally.

* **`MCP-01` Hardcoded Credentials in `.mcp.json`:** Scans `.cursor/mcp.json` and `.vscode/mcp.json` tracked in git for hardcoded Postgres connection strings, GitHub PATs, or Supabase service keys passed inside `env: {}` blocks instead of variable references.
* **`MCP-02` Untrusted `npx -y` Supply-Chain Execution:** Flags unpinned `npx -y <unknown-package>` MCP servers that execute arbitrary remote code with full access to the developer's local SSH keys and `.env` files.

---

## 5. Automated "Safe-Harbor" Bundle (`SECURITY.md` + `llms.txt` + `ai.txt`)

Enterprise buyers, security researchers, and AI crawlers look for standard root-level governance files. `npx preflight init` can compile and maintain all three automatically:

1. **`/.well-known/security.txt` & `SECURITY.md`:** RFC 9116 compliant vulnerability disclosure policy with a 90-day safe-harbor clause (protects the founder legally if a white-hat researcher finds a bug, rather than the researcher dropping a 0-day on X).
2. **`/public/robots.txt` & `ai.txt` Scraping Guard:** Automatically configures crawler rules so third-party AI training bots (`GPTBot`, `CCBot`, `ClaudeBot`) are blocked from scraping private app routes while allowing search indexing on marketing pages.

---

## 6. Post-Deploy "Canary" Drift Monitor (Recurring SaaS Retention)

Why would a solo founder keep paying `$39/mo` *after* they launch their app? Because **production drifts even when code doesn't**:

* **Live Production Header & SSL/DNS Probe:** Checks the live domain (`[https://app.com](https://app.com)`) once a day to verify HSTS, CSP, TLS certs, and Supabase anon-key RLS policies haven't been accidentally toggled off in the cloud dashboard.
* **Sub-Processor Terms Monitor:** When a vendor in `subprocessor-map.json` (like OpenAI, Stripe, or PostHog) updates their DPA or sub-processor list, Preflight opens an automated PR bumping `/legal/privacy-policy.md` and `CURRENT_LEGAL_VERSION`.

---

## 7. Complete Master Feature & Monetization Architecture

| Layer | Feature Component | Target Persona | Role in Business |
| --- | --- | --- | --- |
| **Acquisition** | `npx preflight roast` + README Badges + 37-Rule Static CLI (`<1.1s`) | Indie Hackers, X/Reddit/HN Builders | **Viral Top-of-Funnel** (Zero CAC, high GitHub star velocity) |
| **Daily Habit** | Token-Lean MCP Server + Claude/Cursor `Stop` Hooks + `.cursor/rules` | Daily Cursor / Claude Code / OpenCode Users | **Zero-Churn Stickiness** (Embedded into every prompt loop) |
| **Pro Conversion ($39/mo)** | VS Code/Cursor Extension (`Cmd+Shift+F` Fix Bridge) + Dynamic Legal/EULA Compiler + 6-Probe Active Pentester (`preflight attack`) | Monetizing Micro-SaaS Founders & Solo Consultants | **Self-Serve MRR** (Replaces Termly + Snyk + basic DAST) |
| **B2B / Agency Expansion ($299/mo)** | Signed HTML/PDF Launch Certificates + B2B Vendor Pack (`SBOM.json`, `DATA_FLOW.mermaid`, CAIQ) + Industry Profiles (`--profile hipaa | legal | fintech`) | Dev Agencies, Fractional CTOs, Enterprise AI Consultancies | **High-LTV Expansion** (Agencies bill clients $2k+ for the certificate alone) |