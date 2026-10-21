import { callText } from "../data/data-helpers";
import { defineRule } from "../helpers";

/** A matter/client/case key in the filter, namespace or collection: user/org scoping alone doesn't build an ethical wall. */
const MATTER_SCOPE = /(?<![a-z0-9])(?:matter|client|case|engagement)[_-]?(?:id|ids|ns|namespace|key|slug)\b|(?<![a-z0-9])matter\b/i;

export const lgl01MatterNamespace = defineRule(
  {
    id: "LGL-01",
    pillar: "SECURITY",
    severity: "CRITICAL",
    title: "Vector Search Not Scoped to a Matter (Privilege / Ethical-Wall Leak)",
    profiles: ["legal-privilege"],
  },
  (ctx, emit) => {
    // Unlike VEC-01 this fires in single-user apps too: one lawyer's account still spans matters that must stay walled off.
    for (const q of ctx.dataQueries) {
      if (q.kind !== "vector" || q.op !== "search") continue;
      const ci = ctx.getCode(q.file);
      if (MATTER_SCOPE.test(callText(ci, q))) continue;
      emit({
        file: q.file,
        line: q.line,
        evidence: ci.snippet(q.start, { after: 2 }),
        impact: `This ${q.vendor} similarity search isn't scoped to a matter. RAG answers for one client can quote privileged documents from another client's matter, which breaches the ethical wall and can waive privilege.`,
        agentRemediationPrompt: `In ${q.file}:${q.line}, scope \`${q.method}\` to the current matter: a per-matter namespace/collection (\`index.namespace(matterId)\`) or a filter on \`matter_id\` that the server checks against the caller's matter assignments. Store \`matter_id\` on every vector at upsert time.`,
      });
    }
  },
);
