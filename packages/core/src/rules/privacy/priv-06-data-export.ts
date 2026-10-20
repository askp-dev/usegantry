import { SESSION_SCOPE_KEYS } from "../../context/patterns";
import { defineRule, USER_TABLE_RE } from "../helpers";

const EXPORT_ROUTE = /export|download[\w-]*data|data[-_]?export|portability|takeout|my[-_]?data/i;

export const priv06DataExport = defineRule(
  { id: "PRIV-06", pillar: "PRIVACY", severity: "MEDIUM", title: "Missing User Data Portability Export (GDPR Art. 20)" },
  (ctx, emit) => {
    const userScoped = [...ctx.dbTables.values()].filter(
      (t) =>
        t.columns.some((c) => c.isPII) &&
        (USER_TABLE_RE.test(t.name) ||
          t.columns.some((c) => SESSION_SCOPE_KEYS.test(c.name) || (c.foreignKeyTable && USER_TABLE_RE.test(c.foreignKeyTable.replace(/^public\./, ""))))),
    );
    if (userScoped.length < 2) return;
    if (ctx.routes.some((r) => EXPORT_ROUTE.test(r.urlPath) || EXPORT_ROUTE.test(r.handlerName ?? ""))) return;
    const t = userScoped[0];
    emit({
      file: t.file,
      line: t.line,
      evidence: `${userScoped.length} user-scoped PII tables (${userScoped.map((x) => x.name).join(", ")}), no /export or data-download endpoint`,
      impact:
        "GDPR Art. 20 and CCPA give users a right to a machine-readable copy of their data. With no export endpoint, every request becomes manual work with a 30-day legal deadline.",
      agentRemediationPrompt: `Scaffold \`GET /api/user/export\` that requires the session, collects the user's rows from ${userScoped.map((x) => `\`${x.name}\``).join(", ")} (scoped by the session user id), and returns them as JSON with \`Content-Disposition: attachment; filename="my-data.json"\` and \`Cache-Control: no-store\`. Rate-limit it to 1 request per hour.`,
    });
  },
);
