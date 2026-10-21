import { PII_FIELD_NAMES, PII_RECORD } from "../../context/patterns";
import { defineRule } from "../helpers";
import { callText } from "./data-helpers";

const CONTAINER = /\b(?:payload|metadata|metadatas|properties|fields|meta)\s*[:=]\s*([[{])/g;
const PII = new RegExp(
  `(?:^|[\\s{,])["']?(?:${PII_FIELD_NAMES})["']?\\s*[:,}]|\\.(?:${PII_FIELD_NAMES})\\b|JSON\\.stringify\\(\\s*${PII_RECORD}\\b|\\.\\.\\.\\s*${PII_RECORD}\\b|\\*\\*\\s*${PII_RECORD}\\b`,
);
const ANON = /anonymi[sz]e|pseudonym|redact|hash|encrypt|maskPII|stripPII|scrub/i;

/** Inner text of the bracket opened at `open`, quote-unaware (callText is noComments, so strings are intact but rarely contain brackets). */
function region(text: string, open: number): string {
  const close = text[open] === "{" ? "}" : "]";
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === text[open]) depth++;
    else if (text[i] === close && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

export const vec03MetadataPii = defineRule(
  { id: "VEC-03", pillar: "PRIVACY", severity: "HIGH", title: "Unredacted PII in Vector Embedding Metadata" },
  (ctx, emit) => {
    for (const q of ctx.dataQueries) {
      if (q.kind !== "vector" || q.op !== "upsert") continue;
      const ci = ctx.getCode(q.file);
      const text = callText(ci, q);
      for (const m of text.matchAll(CONTAINER)) {
        const meta = region(text, m.index + m[0].length - 1);
        const pii = PII.exec(meta);
        if (!pii || ANON.test(meta)) continue;
        const field = pii[0].replace(/^[\s{,."'*]+|["'\s:,}]+$/g, "");
        emit({
          file: q.file,
          line: q.line,
          evidence: `${ci.snippet(q.start, { after: 0 })}\n… ${m[0].trim()} … ${pii[0].trim()} …`,
          impact: `\`${field}\` is stored in plain text in the ${q.vendor} ${m[0].split(/[:=]/)[0].trim()}. Vector stores sit outside the primary DB's encryption, RLS and deletion cascade, so this copy survives GDPR erasure requests and leaks with any search result.`,
          agentRemediationPrompt: `In ${q.file}:${q.line}, keep only opaque ids and non-personal fields in the vector ${m[0].split(/[:=]/)[0].trim()} (e.g. \`{ doc_id, org_id }\`), drop \`${field}\`, and join PII back from the primary DB after retrieval. Delete points by \`user_id\` in the account-deletion flow.`,
        });
        break;
      }
    }
  },
);
