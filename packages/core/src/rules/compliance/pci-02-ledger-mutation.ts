import type { CodeIndex } from "../../context/code-index";
import { defineRule, snake } from "../helpers";
import { LEDGER_TABLE_RE } from "./compliance-helpers";

type Hit = { pos: number; table: string; op: string };

/** Prisma `prisma.ledgerEntry.update(`, Drizzle `db.delete(ledger)`, Supabase `.from("ledger").update(`, raw `UPDATE ledger …`. */
function ledgerWrites(ci: CodeIndex): Hit[] {
  const out: Hit[] = [];
  for (const m of ci.findAll(/\.(\w+)\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\s*\(/))
    if (LEDGER_TABLE_RE.test(snake(m[1]))) out.push({ pos: m.index, table: m[1], op: m[2] });
  for (const m of ci.findAll(/\b\w+\s*\.\s*(update|delete)\s*\(\s*(\w+)\s*\)/))
    if (LEDGER_TABLE_RE.test(snake(m[2]))) out.push({ pos: m.index, table: m[2], op: m[1] });
  for (const m of ci.findAll(/\.from\(\s*['"`](\w+)['"`]\s*\)\s*\.(update|delete|upsert)\s*\(/, "noComments"))
    if (LEDGER_TABLE_RE.test(snake(m[1]))) out.push({ pos: m.index, table: m[1], op: m[2] });
  for (const m of ci.findAll(/['"`][^'"`]*?\b(?:UPDATE\s+"?(\w+)"?\s+SET|DELETE\s+FROM\s+"?(\w+))\b/i, "noComments")) {
    const table = m[1] ?? m[2];
    if (LEDGER_TABLE_RE.test(snake(table))) out.push({ pos: m.index, table, op: m[1] ? "update" : "delete" });
  }
  return out;
}

export const pci02LedgerMutation = defineRule(
  { id: "PCI-02", pillar: "FINOPS_OPS", severity: "HIGH", title: "Ledger Rows Updated or Deleted In Place (Not Append-Only)", profiles: ["fintech-pci"] },
  (ctx, emit) => {
    for (const file of ctx.files.all) {
      if (!/\.(?:[cm]?[jt]sx?|py|svelte)$/.test(file) || /(^|\/)(test|tests|__tests__|seed)s?\/|\.test\.|seed\./.test(file)) continue;
      const ci = ctx.getCode(file);
      for (const h of ledgerWrites(ci)) {
        const del = /delete/i.test(h.op);
        const line = ci.lineOf(h.pos);
        emit({
          file,
          line,
          severity: del ? "CRITICAL" : "HIGH",
          evidence: ci.snippet(line, { isLine: true }),
          impact: `This ${del ? "deletes" : "rewrites"} rows in the \`${h.table}\` ledger. A financial ledger must be append-only: an in-place ${del ? "delete" : "edit"} destroys the audit trail, lets balances silently change, and fails PCI DSS / SOX-style reconciliation.`,
          agentRemediationPrompt: `In ${file}:${line}, never ${del ? "delete" : "update"} \`${h.table}\` rows. Insert a compensating (reversal) entry with a reference to the original instead, and revoke UPDATE/DELETE on the table from the app's database role (or add a trigger that raises on them).`,
        });
      }
    }
  },
);
