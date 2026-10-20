import { defineRule } from "../helpers";

const FIELD = "credits|balance|tokens_remaining|tokensRemaining|quota|remaining_credits|remainingCredits|tokens";
const RMW = new RegExp(`\\b[\\w$]+(?:\\?\\.|\\.)(${FIELD})\\b\\s*-(?!-)|\\b(${FIELD})\\s*-=`);
const ATOMIC =
  /\bdecrement\s*:|\$transaction\s*\([^)]*isolationLevel\s*:\s*[\w.]*Serializable|isolationLevel\s*:\s*[\w.]*Serializable|FOR\s+UPDATE|\.rpc\s*\(|sql`[^`]*\b(?:credits|balance|quota)\s*=\s*\w+\s*-/i;

export const pay02CreditRace = defineRule(
  { id: "PAY-02", pillar: "FINOPS_OPS", severity: "HIGH", title: "Non-Atomic Credit / Balance Deduction Race Condition" },
  (ctx, emit) => {
    for (const file of ctx.files.serverRoutesAndActions) {
      const ci = ctx.getCode(file);
      if (ci.lang !== "js" || !new RegExp(FIELD, "i").test(ci.masked)) continue;
      for (const fn of ci.functions()) {
        if (ci.outerFunction(fn.bodyStart + 1) !== fn) continue; // outermost only
        const body = ci.slice(fn.bodyStart, fn.bodyEnd, "noComments");
        const sub = RMW.exec(ci.slice(fn.bodyStart, fn.bodyEnd, "masked"));
        if (!sub) continue;
        const field = sub[1] ?? sub[2];
        const after = body.slice(sub.index);
        if (!new RegExp(`\\.(?:update|updateMany|upsert)\\s*\\([\\s\\S]*\\b${field}\\b`).test(after) || ATOMIC.test(body)) continue;
        const pos = fn.bodyStart + sub.index;
        emit({
          file,
          line: ci.lineOf(pos),
          evidence: ci.snippet(pos, { after: 1 }),
          impact: `\`${field}\` is read into memory, decremented in JS, then written back. Two concurrent requests both read the same balance, so users can spend credits they don't have by firing requests in parallel.`,
          agentRemediationPrompt: `In ${file}:${ci.lineOf(pos)}, replace the read-modify-write with one atomic conditional update: Prisma \`const r = await prisma.user.updateMany({ where: { id: userId, ${field}: { gte: cost } }, data: { ${field}: { decrement: cost } } }); if (r.count === 0) return new Response("Insufficient ${field}", { status: 402 });\` or SQL \`UPDATE users SET ${field} = ${field} - $1 WHERE id = $2 AND ${field} >= $1 RETURNING ${field}\`.`,
        });
      }
    }
  },
);
