This **Contributor & LLM Rule-Authoring Guide (`CONTRIBUTING_RULES.md`)** is designed for two audiences simultaneously: **human open-source contributors** and **AI coding agents (Claude Code, Cursor, OpenCode, Gemini)**.

By standardizing every rule around a strict, stateless contract, contributors can add a new security, privacy, FinOps, or legal check in **under 50 lines of TypeScript** without ever touching filesystem I/O or degrading the `<3s` scan SLA.

---

# `CONTRIBUTING_RULES.md` — Extending Preflight AI with New Rules & Probes

## 1. The 4 Architectural Laws for Rule Authors

Every PR or LLM-generated rule is enforced against four hard constraints in CI:

1. **Zero Direct Disk or Network I/O (`No fs / No fetch`):** Rules must **never** call `fs.readFileSync`, `Bun.file()`, or `fetch()` (except `LEG-01` and `PT-*`). Always read from the pre-indexed `ctx: RepoContext` (`ctx.getCode(file)`, `ctx.getText(file)`, `ctx.dbTables`, `ctx.dataQueries`, `ctx.dependencies`).
2. **Execution Budget (`< 15ms` per static rule):** A single static rule evaluated across 500 cached files must finish in **less than 15ms**. Use `CodeIndex` structural lookups (`calls`/`args`/`objectEntries`) rather than catastrophic backtracking regexes.
3. **Zero Style Noise (Exploitability / Liability Threshold):** Never submit linter/formatting rules (e.g., unused variables, naming conventions). Every rule must map directly to a **data breach**, **cloud wallet-drain**, **malware/license infection**, **payment race condition**, or **legal/EULA liability**.
4. **Actionable Agent Prompts:** Every emitted `Finding` must include a deterministic `agentRemediationPrompt` that tells an AI coding agent *what file to edit, which line to change, and the exact code pattern to apply*.

---

## 2. Anatomy of a Static Rule (Copy-Paste Template)

All static rules live in `packages/core/src/rules/<pillar>/<rule-id>-<slug>.ts`. Build them with `defineRule()` from `rules/helpers.ts`, which fills in `ruleId`, `pillar`, `blocking`, `fingerprint` and the evidence cap for you. The default tool is the built-in **`CodeIndex`** (`ctx.getCode(file)`). It needs zero dependencies, covers TS/JS/Svelte/Vue and Python, and works in the standalone binary. `@ast-grep/napi` is optional (see §3).

### Template: a `CodeIndex` rule (`packages/core/src/rules/finops-ops/fin-04-unbounded-file-upload.ts`)

```typescript
import { defineRule } from "../helpers";

export const fin04UnboundedFileUpload = defineRule(
  { id: "FIN-04", pillar: "FINOPS_OPS", severity: "HIGH", title: "Unbounded File Upload Without Size Cap" },
  (ctx, emit) => {
    for (const file of ctx.files.serverRoutesAndActions) {
      const ci = ctx.getCode(file); // cached; `.masked` = strings/comments blanked, `.noComments` keeps literals
      if (!ci.masked.includes("formData")) continue; // cheap pre-check before structural work
      for (const call of ci.calls(/\.formData$/)) {
        const fn = ci.enclosingFunction(call.start);
        const body = ci.slice(fn?.bodyStart ?? 0, fn?.bodyEnd ?? ci.text.length);
        if (/\.size\s*[<>]=?|maxFileSize|MAX_UPLOAD_SIZE|content-length/i.test(body)) continue;
        const line = ci.lineOf(call.start);
        emit({
          file,
          line,
          evidence: ci.snippet(call.start),
          impact: "Attackers can upload multi-gigabyte payloads, causing OOM crashes and storage egress bills.",
          agentRemediationPrompt: `In ${file}:${line}, check the File's \`.size\` (e.g. \`if (file.size > 10 * 1024 * 1024) return new Response("Payload Too Large", { status: 413 })\`) before reading or uploading it.`,
        });
      }
    }
  },
);
```

`CodeIndex` API: `calls(re)` (call sites whose callee matches), `args(call)` (top-level argument ranges), `objectEntries(pos)` (keys/values of an object literal, including shorthand and spreads), `functions()`, `enclosingFunction(pos)` / `outerFunction(pos)`, `imports()`, `lineOf(pos)`, `snippet(pos)`. Taint helpers (`taintedVars`, `refersTo`, `USER_INPUT_RE`) and route helpers (`routeBody`, `isWebhookRoute`) live in `rules/helpers.ts`. Vector/cache client calls are pre-collected in `ctx.dataQueries`.

---

## 3. Optional: `@ast-grep/napi` (accelerator, not a requirement)

The Sprint 9 spike (handoff quirk 37) kept ast-grep **optional**. The core `.node` addon embeds in `bun build --compile` for the host target. The dynamic grammars (`@ast-grep/lang-python`, `@ast-grep/lang-go`, …) do not: they resolve an absolute `node_modules` path at runtime, so the standalone binary crashes without them. Rules may use `ctx.getAst(file)` only when they:

1. wrap the call in `try/catch` (it throws when napi isn't installed) and skip with an info notice, or fall back to `CodeIndex`; and
2. target a language `CodeIndex` can't index (Go, Rust), or need a deterministic rewrite for `autoFixPatch`.

| Pattern Syntax | Meaning | Example Pattern |
| --- | --- | --- |
| **`$META`** | Matches any **single** AST node. | `fetch($URL)` matches `fetch(req.body.target)` |
| **`$$$MULTI`** | Matches **zero or more** nodes. | `prisma.$MODEL.update({ $$$ARGS })` |
| **`$_`** | Anonymous wildcard. | `console.log($$$_)` |
| **`inside` / `has`** | Relational constraints. | `{ pattern: "fetch($URL)", inside: { pattern: "useEffect($$$)" } }` |

Dynamic languages need napi ≥ 0.51 (0.36 panics with `IncompatibleVersion(15)` on the current grammars). Register all of them in **one** `registerDynamicLanguage({ go, python })` call, because later calls are ignored. Go grammars use `µ` as the metavariable char.

### Common Recipes by Target Layer:

* **Database tables & policies (no AST needed):** iterate `ctx.dbTables`. SQL migrations, Prisma, Drizzle and SQLAlchemy are normalized into `TableSchema` objects by the `SchemaAdapter` registry (`context/adapters.ts`). To support a new ORM, add one adapter there.
* **Dependencies & licenses (no AST needed):** iterate `ctx.dependencies`. Lockfiles are already resolved in memory.
* **New third-party sub-processor (zero code):** add an entry to `data/subprocessor-map.json`.

---

## 4. How to Add a New Active Pentest Probe (`PT-*`)

Active probes live in `packages/core/src/pentest/probes/` and execute against a live local/staging URL (`http://localhost:3000`). Every probe **must** be non-destructive (use dry-run headers, rolled-back transactions, or read-only canary payloads).

```typescript
import type { ActiveProbeDefinition, RepoContext, Finding } from "../../context/types";

export const pt07GraphqlIntrospection: ActiveProbeDefinition = {
  id: "PT-07",
  title: "Production GraphQL Schema Introspection & Batching Abuse",
  severity: "HIGH",

  async execute(ctx: RepoContext, targetUrl: string, emitEvent): Promise<Finding[]> {
    // 1. Only run if a GraphQL route was discovered in the AST
    const gqlRoute = ctx.routes.find((r) => r.urlPath.includes("/graphql"));
    if (!gqlRoute) return [];

    const url = `${targetUrl}${gqlRoute.urlPath}`;
    emitEvent({ type: "PROBE_START", probeId: "PT-07", target: url });

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ __schema { types { name } } }" }),
      signal: AbortSignal.timeout(3000),
    });

    const body = await res.text();
    if (res.status === 200 && body.includes("__schema")) {
      return [
        {
          ruleId: "PT-07",
          pillar: "SECURITY",
          severity: "HIGH",
          blocking: false,
          title: `[LIVE EXPLOIT] Unauthenticated GraphQL introspection enabled on '${gqlRoute.urlPath}'`,
          file: gqlRoute.file,
          line: gqlRoute.line,
          evidence: `POST ${url} returned full __schema type list (HTTP 200).`,
          impact: "Attackers can dump your entire internal API schema, mutations, and hidden fields.",
          agentRemediationPrompt: `Disable GraphQL introspection in production inside '${gqlRoute.file}' and enforce query depth limiting.`,
        },
      ];
    }

    return [];
  },
};

```

---

## 5. Mandatory TDD Fixture Contract (`bun test`)

Every rule **must** ship with a positive (vulnerable) and negative (safe/remediated) unit test using our in-memory `createMockRepoContext()` helper in `packages/core/tests/rules/`. Tests must run in **under 50ms**.

```typescript
import { describe, expect, test } from "bun:test";
import { createMockRepoContext } from "../helpers/mock-context";
import { fin04UnboundedFileUpload } from "../../src/rules/finops-ops/fin-04-unbounded-file-upload";

describe("FIN-04: Unbounded File Upload", () => {
  test("FLAGS server action parsing formData() without file.size check", async () => {
    const ctx = await createMockRepoContext({
      "src/app/actions/upload.ts": `
        "use server";
        export async function uploadAvatar(req: Request) {
          const form = await req.formData();
          const file = form.get("file") as File;
          await supabase.storage.from("avatars").upload("test.png", file);
        }
      `,
    });

    const findings = await fin04UnboundedFileUpload.evaluate(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("FIN-04");
    expect(findings[0].line).toBe(4);
  });

  test("PASSES when file.size cap is enforced before upload", async () => {
    const ctx = await createMockRepoContext({
      "src/app/actions/upload.ts": `
        "use server";
        export async function uploadAvatar(req: Request) {
          const form = await req.formData();
          const file = form.get("file") as File;
          if (file.size > 5 * 1024 * 1024) throw new Error("File too large");
          await supabase.storage.from("avatars").upload("test.png", file);
        }
      `,
    });

    const findings = await fin04UnboundedFileUpload.evaluate(ctx);
    expect(findings).toHaveLength(0);
  });
});

```

---

## 6. Drop-In Meta-Prompt for LLMs (`AGENTS.md` / `CLAUDE.md` Rule Generator)

When you want **Claude Code**, **Cursor**, **OpenCode**, or **Gemini** to generate a batch of new rules for Preflight autonomously, paste this exact system prompt into the agent:

```markdown
# SYSTEM PROMPT: Preflight AI Rule Authoring Agent

You are building a new deterministic rule for Preflight AI (`packages/core/src/rules/`).
Follow this exact 4-step checklist:

1. **Create the Rule File:**
   Create `packages/core/src/rules/<pillar>/<id>-<slug>.ts` exporting a `RuleDefinition` built with `defineRule()`.
   - NEVER import `fs`, `path`, or `child_process`. Read ONLY from `ctx: RepoContext`.
   - Always perform a fast `ctx.getText(file).includes(...)` check before structural work with `ctx.getCode(file)` (`calls`/`args`/`objectEntries`) to keep execution under 5ms. Use `ctx.getAst(file)` only for Go/Rust or rewrites, inside `try/catch` (it's optional).
   - Ensure `agentRemediationPrompt` names the exact file, line, and code fix required.

2. **Register the Rule:**
   Import and append your rule to `ALL_STATIC_RULES` in `packages/core/src/rules/index.ts`.

3. **Update Documentation Catalog:**
   Add the rule metadata, vulnerable code snippet, and remediated snippet to `apps/web/src/lib/data/rules-catalog.json`.

4. **Write & Run the Unit Test:**
   Create `packages/core/tests/rules/<id>.test.ts` with at least 1 vulnerable fixture and 1 safe fixture using `createMockRepoContext()`.
   Run `bun test packages/core/tests/rules/<id>.test.ts` and verify it passes in <50ms.

```