import { defineRule } from "../helpers";

const MAX_LIMIT = 500;

export const fin03UnboundedQuery = defineRule(
  { id: "FIN-03", pillar: "FINOPS_OPS", severity: "MEDIUM", title: "Unbounded Database Scan (SELECT * / Missing Pagination)" },
  (ctx, emit) => {
    for (const file of ctx.files.serverRoutesAndActions) {
      const ci = ctx.getCode(file);
      const report = (pos: number, what: string) =>
        emit({
          file,
          line: ci.lineOf(pos),
          evidence: ci.snippet(pos, { after: 0 }),
          impact: `${what}. As the table grows, every request reads the whole table: slow responses, timeouts, and DB egress/compute bills that scale with your data, not your traffic.`,
          agentRemediationPrompt: `In ${file}:${ci.lineOf(pos)}, paginate: Prisma \`take: Math.min(input.limit ?? 50, 100), skip\`/cursor; Supabase \`.range(from, from + 49)\` or \`.limit(50)\`; Drizzle/SQL \`.limit(50)\` / \`LIMIT $1\`. Select only needed columns.`,
        });
      for (const call of ci.calls(/\.\s*findMany/)) {
        const first = ci.args(call)[0];
        const entries = first && ci.masked[first[0]] === "{" ? ci.objectEntries(first[0]) : [];
        if (first && ci.masked[first[0]] !== "{") continue; // args passed as a variable
        const take = entries.find((e) => e.key === "take");
        const n = take ? Number(/^\s*(\d+)\s*$/.exec(ci.slice(take.valueStart, take.valueEnd, "masked"))?.[1] ?? 0) : 0;
        if (!take) report(call.start, "`findMany` has no `take` limit");
        else if (n > MAX_LIMIT) report(call.start, `\`findMany\` takes ${n} rows (> ${MAX_LIMIT})`);
      }
      // Supabase `.from(x).select(...)` and Drizzle `db.select().from(x)` without .limit/.range/.single
      for (const call of ci.calls(/\.\s*from\s*\([^)]*\)\s*\.\s*select|\b(?:db|tx)\s*\.\s*select\s*\([^)]*\)\s*\.\s*from/)) {
        const rest = ci.masked.slice(call.closeParen + 1, call.closeParen + 600).split(/;|\n\s*\n/)[0];
        if (
          /\.\s*(?:limit|range|single|maybeSingle)\s*\(/.test(rest) ||
          /count\s*:\s*["']exact["']\s*,\s*head\s*:\s*true/.test(ci.slice(call.openParen, call.closeParen, "noComments"))
        )
          continue;
        report(call.start, "List query has no `.limit()` / `.range()`");
      }
      // Raw SQL strings
      for (const call of ci.calls(/\$queryRaw(?:Unsafe)?|\b(?:db|pool|client|sql)\s*\.\s*(?:query|execute)/)) {
        const arg = ci.args(call)[0];
        const s = arg ? ci.slice(arg[0], arg[1], "noComments") : "";
        if (/\bselect\b[\s\S]*\bfrom\b/i.test(s) && !/\blimit\b|\bcount\s*\(|\bwhere\s+["\w.]*\bid\s*=/i.test(s))
          report(call.start, "Raw `SELECT` has no `LIMIT`");
      }
    }
  },
);
