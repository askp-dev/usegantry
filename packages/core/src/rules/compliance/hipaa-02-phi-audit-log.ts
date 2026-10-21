import { defineRule, snake } from "../helpers";
import { AUDIT_TABLE_RE, PHI_COLUMN_RE, PHI_TABLE_RE, tableKey } from "./compliance-helpers";

const AUDIT_SQL_RE = /\bcreate\s+extension\s+(?:if\s+not\s+exists\s+)?"?pgaudit\b|\bcreate\s+(?:or\s+replace\s+)?trigger\s+\w*audit/i;

export const hipaa02PhiAuditLog = defineRule(
  {
    id: "HIPAA-02",
    pillar: "PRIVACY",
    severity: "HIGH",
    title: "PHI Tables Without an Access Audit Log (HIPAA Audit Controls)",
    scope: "repo",
    profiles: ["hipaa"],
  },
  (ctx, emit) => {
    const tables = [...ctx.dbTables.values()];
    if (tables.some((t) => AUDIT_TABLE_RE.test(tableKey(t)))) return;
    if (ctx.glob("**/*.sql").some((f) => AUDIT_SQL_RE.test(ctx.getText(f)))) return;
    for (const t of tables) {
      const phi = t.columns.filter((c) => PHI_COLUMN_RE.test(snake(c.name))).map((c) => c.name);
      if (!phi.length && !PHI_TABLE_RE.test(tableKey(t))) continue;
      emit({
        file: t.file,
        line: t.line,
        evidence: `${t.name} (${phi.length ? phi.join(", ") : "clinical table"}) — no audit_log / access_log table, audit trigger or pgaudit`,
        impact: `${t.name} holds protected health information, but nothing records who read or changed it. HIPAA's audit-controls standard requires that record, and without it you can't scope a breach or answer a patient's access-report request.`,
        agentRemediationPrompt: `Add an append-only \`AuditLog\` table (actorId, action, tableName, recordId, at, ip) and write a row from every handler that reads or mutates ${t.name}, or enable pgaudit / an audit trigger on it. Never store the PHI values themselves in the log.`,
      });
    }
  },
);
