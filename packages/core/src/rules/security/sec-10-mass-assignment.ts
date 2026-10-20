import { defineRule, paramNames, refersTo, taintedVars, USER_INPUT_RE } from "../helpers";

const ORM_WRITE = /\b(?:prisma|db|tx|ctx\.(?:db|prisma))\.\w+\.(?:create|update|upsert|createMany|updateMany)/;
const RAW_WRITE = /\.(?:values|set|insert|update|upsert)/;

export const sec10MassAssignment = defineRule(
  { id: "SEC-10", pillar: "SECURITY", severity: "HIGH", title: "ORM Mass Assignment / Over-Posting Vulnerability" },
  (ctx, emit) => {
    for (const file of ctx.files.serverRoutesAndActions) {
      const ci = ctx.getCode(file);
      if (ci.lang !== "js") continue;
      const isActionFile = ci.hasTopDirective("use server");
      const taintCache = new Map<number, Set<string>>();
      const taintAt = (pos: number) => {
        const fn = ci.outerFunction(pos) ?? ci.enclosingFunction(pos);
        const key = fn?.bodyStart ?? -1;
        if (!taintCache.has(key)) {
          const actionParams = fn && (isActionFile || ci.bodyHasDirective(fn.bodyStart, "use server")) ? paramNames(ci, fn) : [];
          taintCache.set(key, taintedVars(ci, fn?.bodyStart ?? 0, fn?.bodyEnd ?? ci.text.length, actionParams));
        }
        return taintCache.get(key)!;
      };
      const isRaw = (expr: string, pos: number) => {
        const e = expr.trim();
        if (e.startsWith("{")) return /^\{\s*\.\.\.\s*([\w$.]+)/.test(e) && refersTo(e.replace(/^\{\s*\.\.\./, ""), taintAt(pos));
        return (USER_INPUT_RE.test(e) || refersTo(e, taintAt(pos))) && !/\.(?:parse|safeParse|pick)\s*\(/.test(e);
      };
      const report = (pos: number, expr: string) =>
        emit({
          file,
          line: ci.lineOf(pos),
          evidence: ci.snippet(pos, { after: 0 }),
          impact: `The raw request payload (\`${expr.trim().slice(0, 60)}\`) goes straight into an ORM write, so a user can add \`role: "admin"\`, \`plan\`, \`credits\` or \`userId\` and overwrite fields they should never control.`,
          agentRemediationPrompt: `In ${file}:${ci.lineOf(pos)}, parse the input through an allowlisted schema first, e.g. \`const input = z.object({ title: z.string().max(200) }).parse(${expr.trim().slice(0, 40)})\` (or \`Schema.pick({ ... })\`), and pass only \`data: { title: input.title }\` with ownership fields set from the session.`,
        });

      for (const call of ci.calls(ORM_WRITE)) {
        const first = ci.args(call)[0];
        if (!first || ci.masked[first[0]] !== "{") continue;
        for (const key of ["data", "create", "update"]) {
          const e = ci.objectEntries(first[0]).find((x) => x.key === key);
          if (!e) continue;
          const expr = e.shorthand ? e.key : ci.slice(e.valueStart, e.valueEnd, "noComments");
          if (isRaw(expr, call.start)) {
            report(call.start, expr);
            break;
          }
        }
      }
      // Drizzle `.values(body)` / `.set(body)`, Supabase `.insert(body)` / `.update(body)`
      for (const call of ci.calls(RAW_WRITE)) {
        if (ORM_WRITE.test(call.callee)) continue;
        const before = ci.masked.slice(Math.max(0, call.start - 200), call.start);
        if (!/\b(?:db|tx)\.(?:insert|update)\s*\(|\.from\s*\([^)]*\)\s*$/.test(before)) continue;
        const arg = ci.args(call)[0];
        if (!arg) continue;
        const expr = ci.slice(arg[0], arg[1], "noComments");
        if (isRaw(expr, call.start)) report(call.start, expr);
      }
    }
  },
);
