## 1. Aesthetic Direction & Design Philosophy

- **Archetype:** **"Tactical Pre-Flight Avionics"** — combines the high-density precision of **Linear** and **Raycast** with the cryptographic trust aesthetic of **Stripe** and **Vercel**.
- **Core UX Rule:** Zero decorative fluff. Every pixel communicates **Pass**, **Block**, **Blast Radius**, or **1-Click Agent Remediation**.
- **Dark-First Native Palette:** Built to blend seamlessly into Cursor's default dark theme and developer terminals.

---

## 2. Design Tokens (Tailwind v4 / CSS Variables)

```css
:root {
  /* Surface Hierarchy (Obsidian Carbon) */
  --bg-canvas: #090a0f; /* Deepest background */
  --bg-surface-1: #11131c; /* Cards, Sidebar panels */
  --bg-surface-2: #181b26; /* Hover states, Code blocks, Table headers */
  --bg-glass: rgba(17, 19, 28, 0.82);

  /* Borders & Hairlines */
  --border-subtle: #222634; /* 1px solid structural grid */
  --border-focus: #3b82f6;

  /* Typography Hierarchy */
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;

  /* Semantic Status & Severity Tokens */
  --status-ready: #10b981; /* Emerald 500 — Score >= 90 & 0 Blockers */
  --status-ready-bg: rgba(16, 185, 129, 0.12);
  --status-warn: #f59e0b; /* Amber 500 — HIGH severity / Score 60-89 */
  --status-warn-bg: rgba(245, 158, 11, 0.12);
  --status-block: #ef4444; /* Red 500 — CRITICAL Launch Blocker */
  --status-block-bg: rgba(239, 68, 68, 0.14);
  --accent-agent: #6366f1; /* Indigo 500 — AI Agent Auto-Fix CTA */

  /* Typography Stack */
  --font-sans: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", ui-monospace, monospace;
}
```

### Typography Scale & Formatting Rules

- **Score Display:** `font-mono`, `36px` (`2.25rem`), `font-weight: 800`, `letter-spacing: -0.04em`, `tabular-nums`.
- **Section / Pillar Headers:** `font-sans`, `11px` (`0.6875rem`), `font-weight: 700`, `uppercase`, `letter-spacing: 0.08em`, `color: var(--text-secondary)`.
- **Rule IDs & File Paths (`SEC-01`, `api/webhook/route.ts:42`):** Always `font-mono`, `12px`, `tabular-nums`.

---

## 3. Component Specifications (`packages/ui/src/lib/components/`)

### Component 1: `<ReadinessHeaderBar/>`

- **Layout:** Fixed top `56px` bar with `1px solid var(--border-subtle)` bottom border.
- **Left Cluster:** Gantry Shield Logo + Repo Name (`font-mono bold`) + Framework Badge (`Next.js 15`, `Supabase`) + Git Commit Pill (`a8f3c21`).
- **Center Cluster:** Segmented 4-Tab Switcher:

1. `Readiness Matrix`
2. `Live Pentest Console`
3. `Legal & EULA Studio`
4. `FinOps & Burn Simulator`

- **Right Cluster:**
- Live Readiness Pill (`LAUNCH BLOCKED • 65/100` in `--status-block-bg` or `LAUNCH READY • 100/100` in `--status-ready-bg`).
- Primary Action Button (`--accent-agent`): `✨ Fix All in Agent (⌘⇧F)`.
- Secondary Action Button: `📄 Export Certificate`.

### Component 2: `<ArchitectureDataFlowGraph/>` (Tab 1 Left Pane)

- **Purpose:** Visualizes the `RepoContext` without requiring the user to read raw AST logs.
- **Layout:** 4-Column Horizontal Swimlane Graph rendered via SVG/Canvas:
- **Column 1 (Entrypoints):** Client Pages & Forms (shows Clickwrap `LEG-03` badge).
- **Column 2 (API & Server Actions):** Route nodes (`POST /api/chat`, `POST /api/webhook`). Colored border indicates Auth (`SEC-07`) and Rate-Limit (`SEC-09`) status.
- **Column 3 (Database Tables):** Postgres/Supabase tables (`users`, `invoices`). Badge shows `RLS ON` (Green) or `RLS OFF` (Flashing Red `SEC-01`).
- **Column 4 (External Sub-Processors):** Connected third-party vendors (`Stripe`, `OpenAI`, `PostHog`). Dashed line turns Amber if missing from `/legal/privacy-policy.md` (`LEG-04`).

- **Interactivity:** Clicking any node filters the right-hand `<FindingList/>` to issues affecting that exact route, table, or vendor.

### Component 3: `<LivePentestConsole/>` (Tab 2)

- **Layout:** Split-pane terminal & HTTP inspector.
- **Top Control Bar:** Target URL input (`http://localhost:3000`), Supabase URL/Anon Key auto-detected indicator, and a prominent **"🎯 Fire 6 Non-Destructive Exploit Probes"** button.
- **Left Pane (Probe Stream):** Real-time WebSocket feed of `PT-01` through `PT-06`. Each row displays:
- Status Pill (`[EXPLOITED - 200 OK]` in red or `[BLOCKED - 401]` in green)
- Probe ID & Name (`PT-04: Forged Stripe Webhook Signature`)
- Latency (`38ms`)

- **Right Pane (Request/Response Forensic Inspector):** Shows the exact forged `curl` command, request headers, response payload, and a 1-click **"🔧 Copy Exploit Proof + Fix Prompt to Cursor"** button.

### Component 4: `<LegalDiffStudio/>` (Tab 3)

- **Left Sidebar (260px):**
- Detected Sub-Processors checklist (auto-populated from `package.json` and `.env`).
- Active Legal Clauses toggles (`AI Output Disclaimer`, `No-Training API Clause`, `PCI Billing Delegation`, `GDPR Right-to-Erasure`).
- Jurisdiction selector (`Delaware, US`, `European Union (GDPR)`, `California (CCPA)`, `United Kingdom`).

- **Main Pane:** Unified Monaco/Shiki Markdown Diff Viewer showing `legal/privacy-policy.md`, `legal/eula.md`, and `src/lib/legal-version.ts` changes highlighted inside `<!-- GANTRY:AUTO -->` markers, with a **"Commit Legal Sync"** button.

---

## 4. AI Agent Implementation Plan (Step-by-Step Build Prompts)

To build this repository cleanly using **Cursor**, **Claude Code**, or **Antigravity**, execute the build in **4 deterministic sprints**:

1. **Initialize Workspace, SQLite Seed & Context Builder:** Target: packages/core/src/context/.
   Scaffold the Bun monorepo, install `@ast-grep/napi`, `@modelcontextprotocol/server`, and `zod`. Implement `context/builder.ts`, `sql-parser.ts`, `schema-parser.ts`, and `lockfile-parser.ts` so `bun run src/bin/cli.ts scan` indexes a repository into `RepoContext` in under 150ms.

2. **Implement the Static Rule Engine & Legal Compiler:** Target: packages/core/src/rules/ & compilers/.
   Implement the Security (`SEC-01`–`12`), Privacy (`PRIV-01`–`07`), Legal (`LEG-01`–`06`), and FinOps/Payment (`FIN-01`–`03`, `PAY-01`–`03`) rules against `RepoContext`. Wire up `legal-compiler.ts`, `checklist-writer.ts`, and `cert-generator.ts`.

3. **Wire the MCP Server & Active Pentest Runner:** Target: packages/core/src/bin/mcp.ts & pentest/.
   Expose `run_readiness_audit`, `sync_stack_legal_docs`, and `run_active_pentest` over MCP Stdio transport. Implement `pentest/runner.ts` (`PT-01` to `PT-06`) and the `npx gantry init` bootstrapper that drops `.cursor/rules/gantry.mdc` and `CLAUDE.md`.

4. **Build the Svelte 5 Mission Control UI & VS Code/Cursor Extension:** Target: packages/ui/ & packages/vscode-ext/.
   Build the 4-tab Svelte 5 interface using the `DESIGN.md` tokens, bundle its static output into `packages/core/src/server/ui-server.ts`, and compile the VS Code/Cursor extension (`extension.ts`, `codelens-provider.ts`, `sidebar-provider.ts`).
