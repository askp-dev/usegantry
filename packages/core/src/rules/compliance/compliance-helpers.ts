/** Shared lookups for the compliance profile packs (hipaa, fintech-pci, legal-privilege, eu-ai-act). */
import type { VendorRecord } from "../../context/knowledge";
import type { DetectedSubprocessor, RepoContext, TableSchema } from "../../context/types";
import { snake } from "../helpers";

/** Clinical columns: a table holding any of these is PHI (identifiers alone are ordinary PII). */
export const PHI_COLUMN_RE =
  /(?:^|_)(?:diagnos[ie]s|icd(?:_?10)?|medical|medications?|prescriptions?|allerg(?:y|ies)|treatments?|conditions?|symptoms?|lab_?results?|mrn|health|clinical|vitals?|immunizations?|procedures?|insurance_(?:id|member|policy)|npi)(?:_|$)/i;
export const PHI_TABLE_RE = /(?:^|_)(?:patients?|encounters?|appointments?|medical_records?|prescriptions?|diagnos[ie]s|lab_results?|health_records?)(?:_|$)/i;
export const AUDIT_TABLE_RE = /(?:^|_)(?:audit|access_logs?|phi_access|activity_logs?)(?:_|$)/i;

/** Money columns (snake-cased name). `credits` counts: app credits are a balance. */
export const MONEY_COLUMN_RE =
  /(?:^|_)(?:amount|price|balance|total|subtotal|cost|fee|fees|money|credits?|debit|payout|refund|tax|salary|wage|revenue|charge|principal|interest|cents)(?:_|$)/i;
export const FLOAT_TYPE_RE = /^(?:float\d?|real|double(?:\s+precision)?|double_?precision)\b/i;
export const LEDGER_TABLE_RE = /(?:^|_)(?:ledgers?|ledger_entr(?:y|ies)|journal(?:_entr(?:y|ies))?|postings?|transactions?|balance_history)(?:_|$)/i;

/** Tables whose writes move money (PCI-03). */
export const MONEY_TABLE_RE =
  /(?:^|_)(?:ledgers?|payments?|transfers?|payouts?|charges?|orders?|invoices?|wallets?|balances?|transactions?|refunds?|withdrawals?|deposits?)(?:_|$)/i;

export const LEGAL_HOLD_RE = /(?:^|_)(?:legal_?hold|litigation_?hold|retention_?hold|preserv(?:e|ed|ation))(?:_|$)/i;
export const PRIVILEGED_TABLE_RE =
  /(?:^|_)(?:matters?|cases?|documents?|evidence|exhibits?|communications?|correspondences?|privileged|depositions?|filings?|briefs?|memos?|emails?)(?:_|$)/i;

export const tableKey = (t: TableSchema) => snake(t.name);
export const isAiVendor = (v: Pick<VendorRecord, "category">) => /^AI\b/.test(v.category);

/** Where a detected vendor shows up: its manifest line or env key, falling back to the first manifest found. */
export function vendorSite(ctx: RepoContext, s: DetectedSubprocessor): { file: string; line: number; evidence: string } {
  const [, via = s.pkg] = /^(?:package|env|pypi):(.+)$/.exec(s.detectedVia ?? "") ?? [];
  const files = ["package.json", ...ctx.glob("**/requirements*.txt"), ...ctx.glob("**/pyproject.toml"), ...ctx.glob("**/Pipfile"), ...ctx.files.envFiles];
  for (const file of files) {
    if (!ctx.hasFile(file)) continue;
    const lines = ctx.getText(file).split("\n");
    const i = lines.findIndex((l) => l.includes(`"${via}"`) || new RegExp(`^\\s*${via.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\b`, "i").test(l));
    if (i >= 0) return { file, line: i + 1, evidence: lines[i].trim() };
  }
  return { file: "package.json", line: 1, evidence: `${s.entityName} (detected via ${s.detectedVia ?? s.pkg})` };
}

/** Evaluate `30 * 24 * 60 * 60`-style integer products; undefined for anything else. */
export function evalProduct(expr: string): number | undefined {
  const parts = expr
    .replace(/_/g, "")
    .split("*")
    .map((p) => p.trim());
  if (!parts.every((p) => /^\d+(?:\.\d+)?$/.test(p))) return undefined;
  return parts.reduce((a, p) => a * Number(p), 1);
}
