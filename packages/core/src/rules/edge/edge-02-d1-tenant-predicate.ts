import { defineRule } from "../helpers";

const TENANT_COL = /^(?:tenant|org(?:anization)?|user|owner|workspace|account|team|customer|company)_?id$/i;
/** D1 (`env.DB.prepare`) and libSQL (`client.execute` / `batch`) statement entry points. */
const STMT_CALL = /(?<![\w$])[\w$.]+\.(?:prepare|execute|batch|exec)/;
/** A wrapper that injects the tenant predicate (`tenantDb(orgId).prepare`, `scoped.execute`). */
const TENANT_HELPER = /tenant|scoped|forOrg|forUser|forTeam|withOrg/i;
const STRING_LIT = /(['"`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/g;
const TABLE_REF = /\b(?:from|join|update|delete\s+from)\s+["`[]?(\w+)/gi;

export const edge02D1TenantPredicate = defineRule(
  { id: "EDGE-02", pillar: "SECURITY", severity: "CRITICAL", title: "D1 / libSQL Query on a Tenant Table Without a Tenant Predicate" },
  (ctx, emit) => {
    const isEdgeDb =
      ctx.dependencies.has("@libsql/client") || ctx.files.all.some((f) => /(^|\/)wrangler\.(?:toml|jsonc?)$/.test(f) && /d1_databases/.test(ctx.getText(f)));
    if (!isEdgeDb) return;
    const tenantCols = new Map<string, string[]>();
    for (const t of ctx.dbTables.values()) {
      const cols = t.columns.map((c) => c.name).filter((n) => TENANT_COL.test(n));
      if (cols.length) tenantCols.set(t.name.toLowerCase(), cols);
    }
    if (!tenantCols.size) return;
    for (const file of ctx.files.all) {
      if (!/\.[cm]?[jt]sx?$/.test(file) || /\.(?:test|spec|d)\.[cm]?[jt]sx?$/.test(file)) continue;
      if (!/\.(?:prepare|execute|batch|exec)\s*\(/.test(ctx.getText(file))) continue;
      const ci = ctx.getCode(file);
      for (const call of ci.calls(STMT_CALL)) {
        if (TENANT_HELPER.test(call.callee)) continue;
        const arg = ci.args(call)[0];
        if (!arg) continue;
        for (const lit of ci.slice(arg[0], arg[1], "noComments").matchAll(STRING_LIT)) {
          const sql = lit[2];
          if (!/^\s*(?:select|update|delete|with)\b/i.test(sql)) continue;
          const where = sql.match(/\bwhere\b([\s\S]*)/i)?.[1] ?? "";
          const missing = [...sql.matchAll(TABLE_REF)]
            .map((m) => m[1].toLowerCase())
            .find((t) => tenantCols.has(t) && !tenantCols.get(t)!.some((c) => new RegExp(`\\b${c}\\b`, "i").test(where)));
          if (!missing) continue;
          const cols = tenantCols.get(missing)!;
          emit({
            file,
            line: call.line,
            evidence: ci.snippet(call.start, { after: 1 }),
            impact: `This statement reads or changes \`${missing}\`, which is scoped by \`${cols.join("`/`")}\`, but its WHERE clause never filters on it. D1/libSQL have no row-level security, so any user who can reach this code path can read or modify every tenant's rows by id.`,
            agentRemediationPrompt: `In ${file}:${call.line}, add \`AND ${cols[0]} = ?\` to the WHERE clause and bind it from the verified session (e.g. \`.bind(id, session.${cols[0].replace(/_(\w)/g, (_, c) => c.toUpperCase())})\`), never from the request body. Better: route all queries on \`${missing}\` through one helper that always appends the tenant predicate.`,
          });
          break;
        }
      }
    }
  },
);
