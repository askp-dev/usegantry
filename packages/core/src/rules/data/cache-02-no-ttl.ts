import { defineRule } from "../helpers";
import { firstArg, isConstantKey } from "./data-helpers";

const TTL_OPTION = /\b(?:ex|px|exat|pxat|keepttl|ttl|expiration|expire_?in)\b/i;
const EXPIRE_CALL = /\.(?:p?expire(?:at)?|expireAt)\s*\(/;

export const cache02NoTtl = defineRule(
  { id: "CACHE-02", pillar: "FINOPS_OPS", severity: "MEDIUM", title: "Cache Write on a Dynamic Key Without a TTL" },
  (ctx, emit) => {
    for (const q of ctx.dataQueries) {
      if (q.kind !== "cache" || q.op !== "write" || /^p?setex$/.test(q.method)) continue;
      const ci = ctx.getCode(q.file);
      const key = firstArg(ci, q);
      // a constant key is one entry, so it can't grow without bound
      if (!key || isConstantKey(key)) continue;
      const args = ci.splitTopLevel(q.openParen + 1, q.closeParen);
      if (args.slice(2).some(([a, b]) => TTL_OPTION.test(ci.slice(a, b, "noComments")))) continue;
      const fn = ci.outerFunction(q.start) ?? ci.enclosingFunction(q.start);
      if (EXPIRE_CALL.test(ci.slice(q.start, fn?.bodyEnd ?? ci.text.length, "masked"))) continue;
      emit({
        file: q.file,
        line: q.line,
        evidence: ci.snippet(q.start, { after: 0 }),
        impact: `\`${q.method}\` writes a per-request key (\`${key.slice(0, 60)}\`) that never expires. The keyspace grows with every user and request until the cache hits its memory cap, which means evictions, OOM errors or an ever-growing Redis bill.`,
        agentRemediationPrompt:
          q.method === "set"
            ? `In ${q.file}:${q.line}, give the write a TTL: \`set(key, value, { ex: 3600 })\` (node-redis \`{ EX: 3600 }\`, ioredis \`"EX", 3600\`, Python \`ex=3600\`).`
            : `In ${q.file}:${q.line}, follow \`${q.method}\` with \`expire(key, 3600)\` in the same pipeline/transaction so the key can't outlive its purpose.`,
      });
    }
  },
);
