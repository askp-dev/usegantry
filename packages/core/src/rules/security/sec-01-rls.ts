import { defineRule, lineAt } from "../helpers";

const PERMISSIVE = /^\s*\(?\s*(true|1\s*=\s*1)\s*\)?\s*$/i;
// raw_user_meta_data / jwt() -> 'user_metadata' are writable by the user via supabase.auth.updateUser()
const CLIENT_META = /raw_user_meta_data|['"]user_metadata['"]|\buser_metadata\b/i;

export const sec01Rls = defineRule(
  { id: "SEC-01", pillar: "SECURITY", severity: "CRITICAL", title: "Missing or Permissive Row-Level Security (RLS)" },
  (ctx, emit) => {
    // PostgREST only exposes the DB when Supabase is in the stack.
    if (!ctx.stack.supabase) return;
    const sqlText = ctx.files.sqlMigrations.map((f) => ctx.getText(f)).join("\n");
    for (const t of ctx.dbTables.values()) {
      if (t.name.startsWith("auth.") || t.name.startsWith("storage.")) continue;
      const fix = (why: string) =>
        `In ${t.file}, ${why}. Write a new migration: \`alter table public.${t.name} enable row level security;\` then add owner-scoped policies per command, e.g. \`create policy "owner_${t.name}" on public.${t.name} for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);\` (use the table's real owner column).`;
      let rls = t.rlsEnabled;
      if (!rls && t.source !== "sql") {
        const n = t.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        rls = new RegExp(`alter\\s+table\\s+(?:only\\s+)?(?:"?public"?\\.)?"?${n}"?\\s+enable\\s+row\\s+level\\s+security`, "i").test(sqlText);
      }
      if (!rls) {
        emit({
          file: t.file,
          line: t.line,
          nodeRef: `table:${t.name}`,
          evidence: `table ${t.name} (${t.source ?? "sql"}): no \`ENABLE ROW LEVEL SECURITY\` found`,
          impact: `Anyone holding the public anon key can read and write every row in \`${t.name}\` through the Supabase REST API.`,
          agentRemediationPrompt: fix(`table \`${t.name}\` has RLS disabled`),
        });
        continue;
      }
      if (t.source === "sql" && t.policies.length === 0) {
        emit({
          file: t.file,
          line: t.line,
          nodeRef: `table:${t.name}`,
          evidence: `table ${t.name}: RLS enabled with 0 policies`,
          impact: `RLS is on but no policy exists, so every client query on \`${t.name}\` silently returns nothing. Teams usually "fix" this by switching RLS off or adding \`using (true)\`.`,
          agentRemediationPrompt: fix(`table \`${t.name}\` has RLS enabled but zero policies`),
        });
      }
      for (const p of t.policies) {
        const permissive = p.command !== "SELECT" && (PERMISSIVE.test(p.usingExpr) || PERMISSIVE.test(p.checkExpr));
        const meta = CLIENT_META.test(p.usingExpr) || CLIENT_META.test(p.checkExpr);
        if (!permissive && !meta) continue;
        const text = ctx.getText(t.file);
        const at = text.indexOf(p.name);
        emit({
          file: t.file,
          line: at >= 0 ? lineAt(text, at) : t.line,
          nodeRef: `table:${t.name}`,
          evidence: `policy "${p.name}" on ${t.name} for ${p.command} using (${p.usingExpr})${p.checkExpr ? ` with check (${p.checkExpr})` : ""}`,
          impact: permissive
            ? `Policy "${p.name}" allows any caller to ${p.command} any row of \`${t.name}\`, which defeats RLS.`
            : `Policy "${p.name}" trusts user_metadata, which any signed-in user can change with supabase.auth.updateUser(), so they can grant themselves access.`,
          agentRemediationPrompt: permissive
            ? `In ${t.file}, replace policy "${p.name}" so the using/with check expressions compare the owner column to \`(select auth.uid())\` instead of \`true\`.`
            : `In ${t.file}, rewrite policy "${p.name}" to read authorization from \`auth.jwt() -> 'app_metadata'\` (server-only, set via service role) or a role table keyed by \`auth.uid()\`, never from user_metadata/raw_user_meta_data.`,
        });
      }
    }
  },
);
