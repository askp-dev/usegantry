import { defineRule } from "../helpers";

export const sec02ViewsRpc = defineRule(
  { id: "SEC-02", pillar: "SECURITY", severity: "HIGH", title: "RLS Bypass via Postgres Views & SECURITY DEFINER RPCs" },
  (ctx, emit) => {
    for (const v of ctx.sql.views) {
      if (v.securityInvoker || /^(auth|storage|extensions|private)\./.test(v.name)) continue;
      emit({
        file: v.file,
        line: v.line,
        evidence: v.statement.split("\n").slice(0, 3).join("\n"),
        impact: `View \`${v.name}\` runs as its owner (usually postgres), so it bypasses RLS on every table it reads. Any client can query the rows it exposes.`,
        agentRemediationPrompt: `In ${v.file}:${v.line}, recreate view \`${v.name}\` as \`create or replace view ${v.name} with (security_invoker = true) as ...\` so RLS of the querying user applies (Postgres 15+), or revoke select from anon/authenticated.`,
      });
    }
    for (const f of ctx.sql.functions) {
      if (!f.securityDefiner) continue;
      const issues: string[] = [];
      if (!f.hasSearchPath) issues.push("no `SET search_path = ''`");
      if (!f.hasAuthCheck && !f.returnsTrigger && !f.executeRevoked)
        issues.push("no `auth.uid()` caller check and EXECUTE not revoked from anon/authenticated");
      if (!issues.length) continue;
      emit({
        file: f.file,
        line: f.line,
        evidence: `${f.statement.split("\n").slice(0, 2).join("\n")}\n-- ${issues.join("; ")}`,
        impact: `SECURITY DEFINER function \`${f.name}\` runs with owner privileges and is callable via \`supabase.rpc('${f.name}')\`. Issues: ${issues.join("; ")}. Callers can bypass RLS or hijack the search_path.`,
        agentRemediationPrompt: `In ${f.file}:${f.line}, add \`set search_path = ''\` to function \`${f.name}\`, schema-qualify every object it touches, and at the top of the body add \`if auth.uid() is null or auth.uid() <> <owner arg> then raise exception 'forbidden'; end if;\`. If it's internal only, add \`revoke execute on function ${f.name} from public, anon, authenticated;\`.`,
      });
    }
  },
);
