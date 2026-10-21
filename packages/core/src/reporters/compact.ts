/**
 * Token-lean agent format (PRE_EXPANSION §1): one line per finding, the MCP default.
 *   SCORE:65/100|BLOCKED:true
 *   [CRIT][SEC-01] supabase/migrations/01_init.sql:14 | Missing or Permissive RLS | FIX:Add `ALTER TABLE …`
 * The fix is `agentRemediationPrompt` capped at a word boundary; agents ask for `format: "verbose"` for the rest.
 */
import type { AuditReport, Finding, Severity } from "../context/types";

const TAG: Record<Severity, string> = { CRITICAL: "CRIT", HIGH: "HIGH", MEDIUM: "MED" };
const FIX_MAX = 160;

/** The prompt minus the redundant "In file:line," lead-in, capped at a word boundary. Not sentence-split: some prompts state the problem first and the fix second. */
function compactFix(f: Finding): string {
  let s = f.agentRemediationPrompt.replace(/\s+/g, " ").trim();
  s = s.replace(/^In [^\s,]+,\s*/, "");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (s.length <= FIX_MAX) return s;
  const cut = s.slice(0, FIX_MAX);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : FIX_MAX)}…`;
}

export function compactLine(f: Finding): string {
  // "!" marks a non-critical finding that blocks (strict mode).
  const tag = `${TAG[f.severity]}${f.blocking && f.severity !== "CRITICAL" ? "!" : ""}`;
  return `[${tag}][${f.ruleId}] ${f.file}:${f.line} | ${f.title.replace(/\s*\([^)]*\)/g, "")} | FIX:${compactFix(f)}`;
}

export function renderCompact(report: Pick<AuditReport, "score" | "blockers" | "findings" | "notices">, findings = report.findings, max = Infinity): string {
  const lines = findings.slice(0, max).map(compactLine);
  if (findings.length > max) lines.push(`…${findings.length - max} more`);
  // Skipped rules must never read as a clean pass.
  for (const n of report.notices ?? []) lines.push(`[INFO][${n.ruleIds.join(",")}] SKIPPED | ${n.message.split(":")[0]}`);
  return `SCORE:${report.score}/100|BLOCKED:${report.blockers > 0}\n${lines.join("\n")}${lines.length ? "\n" : ""}`;
}
