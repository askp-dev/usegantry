import { defineRule } from "../helpers";
import { firstArg, isAuthedAt, isConstantKey } from "./data-helpers";

export const cache01GlobalKeys = defineRule(
  { id: "CACHE-01", pillar: "SECURITY", severity: "HIGH", title: "Global Cache Key in an Authenticated Route (Tenant Cache Poisoning)" },
  (ctx, emit) => {
    for (const q of ctx.dataQueries) {
      if (q.kind !== "cache" || q.op !== "write") continue;
      const ci = ctx.getCode(q.file);
      const key = firstArg(ci, q);
      // explicitly global/public keys are a deliberate choice
      if (!isConstantKey(key) || /global|public/i.test(key) || !isAuthedAt(ctx, ci, q.file, q.start)) continue;
      emit({
        file: q.file,
        line: q.line,
        evidence: ci.snippet(q.start, { after: 0 }),
        impact: `\`${q.method}(${key})\` runs inside an authenticated handler but the key has no tenant or user component, so whatever one customer's request caches is served to every other customer that reads ${key}.`,
        agentRemediationPrompt: `In ${q.file}:${q.line}, prefix the key with the session's tenant, e.g. \`tenant:\${session.orgId}:${key.replace(/^['"`]|['"`]$/g, "")}\` (and the matching reads). If the value really is identical for everyone, rename it with a \`global:\` prefix to mark that as intentional.`,
      });
    }
  },
);
