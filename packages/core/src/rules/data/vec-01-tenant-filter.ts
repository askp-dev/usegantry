import { defineRule } from "../helpers";
import { callText, isMultiUser } from "./data-helpers";

/** A tenant/user key (`org_id`, `userId`, `p_org_id`) in the filter, a per-tenant namespace/collection, or a tenant column in the SQL. */
const TENANT_SCOPE =
  /(?<![a-z0-9])(?:tenant|org(?:anization)?|user|owner|workspace|account|team|customer|company|project)[_-]?id\b|(?<![a-z0-9])tenant\b|\bnamespace\s*(?:\(|:|=)\s*(?!['"`])/i;

export const vec01TenantFilter = defineRule(
  { id: "VEC-01", pillar: "SECURITY", severity: "CRITICAL", title: "Vector Search Without a Tenant Filter (Cross-Tenant RAG Leakage)" },
  (ctx, emit) => {
    if (!isMultiUser(ctx)) return;
    for (const q of ctx.dataQueries) {
      if (q.kind !== "vector" || q.op !== "search") continue;
      const ci = ctx.getCode(q.file);
      if (TENANT_SCOPE.test(callText(ci, q))) continue;
      const fix =
        q.vendor === "pgvector"
          ? "add `AND org_id = $orgId` (or a `p_org_id` argument used in the SQL function's WHERE clause) bound from the session, never from the request"
          : q.vendor === "pinecone"
            ? "query a per-tenant namespace (`index.namespace(session.orgId).query(...)`) or pass `filter: { org_id: { $eq: session.orgId } }`"
            : 'pass a filter on the tenant key taken from the session, e.g. `filter: { must: [{ key: "org_id", match: { value: session.orgId } }] }` (Qdrant) / `filter: { org_id: session.orgId }` (LangChain), and store `org_id` on every point at upsert time';
      emit({
        file: q.file,
        line: q.line,
        evidence: ci.snippet(q.start, { after: 2 }),
        impact: `This ${q.vendor} similarity search has no tenant or user filter. In a multi-user app, one user's RAG prompt can retrieve another customer's private documents and the LLM will quote them back.`,
        agentRemediationPrompt: `In ${q.file}:${q.line}, scope the \`${q.method}\` call to the caller's tenant: ${fix}.`,
      });
    }
  },
);
