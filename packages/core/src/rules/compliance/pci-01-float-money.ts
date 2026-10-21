import { defineRule, snake } from "../helpers";
import { FLOAT_TYPE_RE, LEDGER_TABLE_RE, MONEY_COLUMN_RE, tableKey } from "./compliance-helpers";

export const pci01FloatMoney = defineRule(
  { id: "PCI-01", pillar: "FINOPS_OPS", severity: "HIGH", title: "Money Stored in a Binary Floating-Point Column", profiles: ["fintech-pci"] },
  (ctx, emit) => {
    for (const t of ctx.dbTables.values()) {
      const ledger = LEDGER_TABLE_RE.test(tableKey(t));
      for (const c of t.columns) {
        if (!FLOAT_TYPE_RE.test(c.type) || !MONEY_COLUMN_RE.test(snake(c.name))) continue;
        emit({
          file: t.file,
          line: c.line ?? t.line,
          severity: ledger ? "CRITICAL" : "HIGH",
          evidence: `${t.name}.${c.name}: ${c.type}`,
          impact: `${t.name}.${c.name} stores money as a binary float, so 0.1 + 0.2 ≠ 0.3. Rounding drift accumulates across sums, interest and currency conversion, and ${ledger ? "a ledger that doesn't balance to the cent fails reconciliation and audit" : "totals, refunds and reconciliation stop matching your payment processor"}.`,
          agentRemediationPrompt: `Change ${t.name}.${c.name} to an exact type: integer minor units (\`Int\`/\`BigInt\` cents) or \`Decimal @db.Decimal(19, 4)\` / \`numeric(19,4)\`. Write a migration that casts existing values with ROUND(), and use a decimal library (not JS \`number\`) for arithmetic on it.`,
        });
      }
    }
  },
);
