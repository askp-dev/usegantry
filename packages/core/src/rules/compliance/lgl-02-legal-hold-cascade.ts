import { defineRule, snake } from "../helpers";
import { LEGAL_HOLD_RE, PRIVILEGED_TABLE_RE, tableKey } from "./compliance-helpers";

export const lgl02LegalHoldCascade = defineRule(
  { id: "LGL-02", pillar: "LEGAL", severity: "CRITICAL", title: "Cascade Delete Can Destroy Records Under Legal Hold", profiles: ["legal-privilege"] },
  (ctx, emit) => {
    for (const t of ctx.dbTables.values()) {
      const hold = t.columns.find((c) => LEGAL_HOLD_RE.test(snake(c.name)));
      if (!hold && !PRIVILEGED_TABLE_RE.test(tableKey(t))) continue;
      for (const c of t.columns) {
        if (!c.foreignKeyTable || !c.onDeleteCascade) continue;
        emit({
          file: t.file,
          line: c.line ?? t.line,
          severity: hold ? "CRITICAL" : "HIGH",
          evidence: `${t.name}.${c.name} → ${c.foreignKeyTable} ON DELETE CASCADE${hold ? ` (and ${t.name}.${hold.name} exists)` : ` (${t.name} has no legal-hold flag)`}`,
          impact: hold
            ? `Deleting a ${c.foreignKeyTable} row silently deletes every ${t.name} row with it, including ones flagged \`${hold.name}\`. The database bypasses the hold check, which is spoliation of evidence under a litigation hold.`
            : `${t.name} looks like privileged or case material, and deleting its ${c.foreignKeyTable} cascades straight through it. There's no legal-hold flag to stop that, so records under a preservation duty can be destroyed by one delete.`,
          agentRemediationPrompt: `Change ${t.name}.${c.name} to \`onDelete: Restrict\` (\`ON DELETE RESTRICT\`)${hold ? "" : ` and add a \`legalHold Boolean @default(false)\` column`}. Delete through a service that refuses while any row is on hold and soft-deletes (\`deletedAt\`) for the retention period.`,
        });
      }
    }
  },
);
