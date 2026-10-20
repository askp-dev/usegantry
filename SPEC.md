## 1. Product Vision & System Boundaries

- **Product Name:** Preflight AI (`preflight`)
- **Core Mission:** A sub-3-second static readiness scanner, dynamic legal/EULA compiler, FinOps burn guard, and AST-guided active pentester for AI-generated software repositories.
- **Runtime & Distribution:** Single-process **Bun (`>= 1.2`)** TypeScript workspace compiled to a standalone binary (`bun build --compile`) and distributed via `npx preflight` / `bunx preflight` + a lightweight VS Code / Cursor Extension wrapper.
- **Hard Performance SLA:** Cold-start full static scan across 500 files must complete in **less than 3,000ms** (Target: **850ms–1,400ms**). Zero external Python, Java, or Go binary dependencies required.

---

## 2. Monorepo Directory Topology

```text
preflight-ai/
├── package.json                        # Bun workspace root
├── tsconfig.json
├── bunfig.toml
├── SPEC.md                             # Master architectural specification
├── DESIGN.md                           # UI/UX tokens, layout, and component rules
├── data/
│   ├── known-packages.sqlite           # Read-only Top 50k npm/PyPI metadata + SPDX licenses
│   └── subprocessor-map.json           # 250+ SDK -> Legal Entity, DPA URL, GDPR Category map
├── packages/
│   ├── core/                           # CLI, MCP Server, AST Engine, Pentester, Legal Compiler
│   │   ├── src/
│   │   │   ├── bin/
│   │   │   │   ├── cli.ts              # Entrypoint: `preflight scan | attack | legal | cert | ui | init`
│   │   │   │   └── mcp.ts              # Entrypoint: `preflight mcp` (Stdio MCP Server)
│   │   │   ├── context/
│   │   │   │   ├── types.ts            # RepoContext, Finding, AuditReport, LegalManifest types
│   │   │   │   ├── builder.ts          # Single-pass Bun.Glob + lazy @ast-grep/napi cache
│   │   │   │   ├── sql-parser.ts       # DDL tokenizer for Supabase/Postgres RLS & Views
│   │   │   │   ├── schema-parser.ts    # Prisma, Drizzle, SQLAlchemy model normalizer
│   │   │   │   └── lockfile-parser.ts  # Streaming parser for bun.lock, pnpm-lock, package-lock
│   │   │   ├── rules/
│   │   │   │   ├── index.ts            # Rule registry (Security, Privacy, Legal, FinOps, Payment, Ops)
│   │   │   │   ├── security/           # SEC-01 to SEC-12
│   │   │   │   ├── privacy/            # PRIV-01 to PRIV-07
│   │   │   │   ├── legal/              # LEG-01 to LEG-06
│   │   │   │   └── finops-ops/         # FIN-01 to FIN-03, PAY-01 to PAY-03, OPS-01 to OPS-04
│   │   │   ├── pentest/
│   │   │   │   └── runner.ts           # Active probes PT-01 to PT-06 with WebSocket event emitter
│   │   │   ├── compilers/
│   │   │   │   ├── legal-compiler.ts   # Non-destructive <!-- PREFLIGHT:AUTO --> markdown patcher
│   │   │   │   ├── checklist-writer.ts # Living READINESS_CHECKLIST.md updater
│   │   │   │   ├── cert-generator.ts   # HMAC-SHA256 signed HTML/PDF Launch Certificate
│   │   │   │   └── vendor-pack.ts      # CycloneDX SBOM.json + Mermaid RoPA Data-Flow generator
│   │   │   ├── server/
│   │   │   │   └── ui-server.ts        # Embedded `Bun.serve()` localhost:4400 API + WS server
│   │   │   └── workers/
│   │   │       └── git-entropy.worker.ts # Background thread scanning last 50 commits for secrets
│   ├── ui/                             # Shared Svelte 5 + Tailwind v4 UI (Mission Control + Webview)
│   │   ├── src/
│   │   │   ├── lib/
│   │   │   │   ├── components/         # Gauge, PillarCard, FindingRow, LegalDiff, DataFlowGraph
│   │   │   │   └── stores/             # Reactive audit state & WebSocket pentest stream
│   │   │   └── routes/                 # 4-Tab SPA compiled into `packages/core/dist/ui-assets`
│   └── vscode-ext/                     # VS Code / Cursor / Windsurf Extension
│       ├── package.json
│       └── src/
│           ├── extension.ts            # Diagnostics, StatusBar, Save Watcher, Agent Bridge
│           ├── codelens-provider.ts    # Inline "Fix with AI Agent" & "Sync Legal" lenses
│           └── sidebar-provider.ts     # WebviewViewProvider hosting compiled Svelte sidebar

```

---

## 3. Core Data Contracts (`packages/core/src/context/types.ts`)

Every module in the system communicates strictly through these canonical interfaces:

```typescript
import type { SgRoot } from "@ast-grep/napi";

export type Pillar = "SECURITY" | "PRIVACY" | "LEGAL" | "FINOPS_OPS";
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM";

export interface Finding {
  ruleId: string; // e.g., "SEC-01", "LEG-04", "PT-04", "FIN-01"
  pillar: Pillar;
  severity: Severity;
  blocking: boolean; // True for CRITICAL findings; blocks CI and Launch Certificate
  title: string;
  file: string; // Relative path from repo root
  line: number; // 1-indexed line number
  evidence: string; // Offending code snippet or HTTP response proof
  impact: string; // Plain-English explanation of breach/cost/legal risk
  agentRemediationPrompt: string; // Surgical prompt injected into Cursor / Claude Code
  autoFixPatch?: {
    // Optional deterministic replacement
    startLine: number;
    endLine: number;
    replacementText: string;
  };
}

export interface TableSchema {
  name: string;
  file: string;
  line: number;
  rlsEnabled: boolean;
  policies: Array<{
    name: string;
    command: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "ALL";
    usingExpr: string;
    checkExpr: string;
  }>;
  columns: Array<{
    name: string;
    type: string;
    isPII: boolean;
    isEncrypted: boolean;
    foreignKeyTable?: string;
    onDeleteCascade: boolean;
  }>;
}

export interface RouteNode {
  file: string;
  line: number;
  urlPath: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "SERVER_ACTION";
  hasAuthGuard: boolean;
  hasRateLimit: boolean;
  hasWebhookVerification: boolean;
  dbTablesAccessed: string[];
  externalSdksCalled: string[];
}

export interface RepoContext {
  rootDir: string;
  framework: "nextjs" | "sveltekit" | "fastapi" | "express" | "unknown";
  gitCommitSha: string;
  files: {
    all: string[];
    serverRoutesAndActions: string[];
    frontendComponents: string[];
    sqlMigrations: string[];
    envFiles: string[];
    legalDocs: string[];
  };
  getAst: (relPath: string) => SgRoot;
  getText: (relPath: string) => string;
  dbTables: Map<string, TableSchema>;
  routes: RouteNode[];
  dependencies: Map<
    string,
    {
      name: string;
      version: string;
      isDirect: boolean;
      spdxLicense?: string;
      weeklyDownloads?: number;
      existsInRegistry: boolean;
    }
  >;
  detectedSubprocessors: Array<{
    id: string;
    pkg: string;
    entityName: string;
    category: string;
    dataProcessed: string[];
    jurisdiction: string;
    privacyPolicyUrl: string;
    dpaUrl: string;
    triggersClauses: string[];
  }>;
}
```

---

## 4. High-Precision AST & Schema Detection Algorithms (The Hardest Rules)

When implementing `packages/core/src/rules/`, use these exact deterministic patterns:

### A. `SEC-01`: Supabase / Postgres RLS & Policy Auditor (`sec-01-rls.ts`)

1. Iterate over `ctx.dbTables.values()`.
2. Flag `CRITICAL` if `table.rlsEnabled === false`.
3. Flag `CRITICAL` if `table.rlsEnabled === true` AND `table.policies.length === 0` (locked table trap) OR if any policy on `INSERT | UPDATE | DELETE | ALL` matches `/^\s*(true|1\s*=\s*1)\s*$/i` in `usingExpr` or `checkExpr`.
4. Flag `CRITICAL` if `usingExpr` or `checkExpr` references `raw_user_meta_data` (client-writable in `supabase.auth.updateUser()`) instead of `raw_app_meta_data` or `auth.uid()`.

### B. `SEC-03`: ORM IDOR / Unscoped Tenant Mutation (`sec-03-orm-idor.ts`)

1. Query AST across `ctx.files.serverRoutesAndActions` using `@ast-grep/napi` pattern:

- **Prisma:** `$CLIENT.$MODEL.$METHOD({ $$$ARGS })` where `$METHOD` matches `/^(update|delete|updateMany|deleteMany|findUnique)$/`.
- **Drizzle:** `$DB.$METHOD($TABLE).where($COND)` where `$METHOD` matches `/^(update|delete)$/`.

2. Inspect the `where` AST subtree:

- Extract all identifier names inside `where`.
- If `where` filters **only** by `id` (e.g., `where: { id: params.id }`) and does **not** include a session/tenant scope (`userId`, `user_id`, `orgId`, `organizationId`, `tenantId`, `ownerId`, `authorId`), emit `SEC-03 CRITICAL`.

### C. `SEC-07`: Unauthenticated Server Actions & API Mutations (`sec-07-unauth-actions.ts`)

1. Locate all Next.js functions inside files containing `"use server"` (or functions containing `"use server"` directive at top of body), plus `export async function POST|PUT|PATCH|DELETE` in route handlers.
2. Perform a single-pass subtree search on the function body before the first DB write or external SDK call:

- Check for presence of known auth assertions: `getUser`, `getSession`, `auth()`, `currentUser()`, `getServerSession`, `requireAuth`, `verifyToken`, `locals.user`, `Depends(get_current_user)`.

3. If a database mutation (`prisma.`, `db.insert`, `db.update`, `supabase.from`) or paid SDK call occurs at a statement index _prior_ to any auth assertion (or if no auth assertion exists), emit `SEC-07 CRITICAL`.

### D. `FIN-01`: React / Svelte Infinite Fetch & Render Loop (`fin-01-infinite-loop.ts`)

1. Match AST pattern `useEffect(($ARGS) => { $$$BODY }, [$$$DEPS])` in `.tsx`/`.jsx` and `$effect(() => { $$$BODY })` in `.svelte`.
2. Check if `$$$BODY` contains a network/DB call (`fetch(`, `axios.`, `supabase.`, `trpc.`, `useQuery`) AND calls a state setter `set$STATE($$$)` where the corresponding state variable `$STATE` (or an unmemoized object/array literal) is present inside `[$$$DEPS]`.
3. Emit `FIN-01 CRITICAL` ("Unbounded recursive network/API loop inside effect").

### E. `PAY-02`: Non-Atomic Credit / Balance Race Condition (`pay-02-credit-race.ts`)

1. Scan routes and actions for identifiers matching `/credits|balance|tokens_remaining|quota/i`.
2. Detect the Read-Modify-Write anti-pattern:

- A database read (`findUnique` / `select`) assigning a record `user`, followed by an arithmetic subtraction in JS/TS (`user.credits - $AMOUNT`), passed into an `update({ data: { credits: ... } })` without an interactive `$transaction` lock or atomic `{ decrement: $AMOUNT }` operator.

3. Emit `PAY-02 HIGH` and provide the Prisma `{ credits: { decrement: 1 } }, where: { id: userId, credits: { gte: 1 } }` or SQL `UPDATE ... SET credits = credits - 1 WHERE id = $1 AND credits >= 1` atomic patch.

---

## 5. Embedded Mission Control Server & WebSocket Protocol (`ui-server.ts`)

When the user runs `npx preflight ui`, `Bun.serve()` mounts the compiled Svelte 5 SPA and exposes a local REST + WebSocket API on `[http://127.0.0.1:4400](http://127.0.0.1:4400)`:

| Endpoint / Channel               | Method | Payload / Behavior                                                                                                                                          |
| -------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/report`                    | `GET`  | Runs `<1.1s` static scan and returns full `AuditReport` JSON + `DATA_FLOW.mermaid` string.                                                                  |
| `/api/legal/preview`             | `POST` | Returns unified git-style diff between current `/legal/*.md` files and freshly compiled `LegalManifest`.                                                    |
| `/api/legal/apply`               | `POST` | Writes updated `/legal/*.md` blocks and bumps `src/lib/legal-version.ts`.                                                                                   |
| `/api/cert/export`               | `POST` | Generates `LAUNCH_CERTIFICATE.html`, `LAUNCH_CERTIFICATE.pdf`, and `SBOM.json`.                                                                             |
| `ws://127.0.0.1:4400/ws/pentest` | `WS`   | Streams real-time probe events (`PROBE_START`, `HTTP_TRACE`, `PROBE_RESULT`, `PENTEST_COMPLETE`) as `runActivePentest()` executes against `localhost:3000`. |
