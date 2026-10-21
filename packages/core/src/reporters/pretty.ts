import type { AuditReport, Severity } from "../context/types";

const useColor = !!process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
export const color = { red: c("31"), amber: c("33"), green: c("32"), dim: c("2"), bold: c("1"), indigo: c("35"), cyan: c("36") };
const SEV: Record<Severity, (s: string) => string> = { CRITICAL: color.red, HIGH: color.amber, MEDIUM: color.cyan };

export function renderPretty(r: AuditReport, opts: { verbose?: boolean } = {}): string {
  const out: string[] = [];
  const statusColor = r.status === "LAUNCH_READY" ? color.green : r.status === "LAUNCH_BLOCKED" ? color.red : color.amber;
  out.push("", `${color.bold("Preflight")} ${color.dim(`v${r.tool.version}`)}  ${r.repo.name} ${color.dim(`(${r.repo.stack.join(" · ")})`)}`);
  out.push(
    color.dim(
      `${r.stats.files} files · ${r.stats.routes} routes · ${r.stats.tables} tables · ${r.stats.dependencies} deps · ${r.stats.subprocessors} vendors · ${r.durationMs} ms`,
    ),
    "",
  );
  let lastRule = "";
  for (const f of r.findings) {
    if (f.ruleId !== lastRule) {
      out.push(`${SEV[f.severity](f.severity.padEnd(8))} ${color.bold(f.ruleId)} ${f.title}${f.blocking ? color.red(" ⛔ blocker") : ""}`);
      lastRule = f.ruleId;
    }
    out.push(`  ${color.dim("→")} ${f.file}:${f.line}  ${f.evidence.split("\n")[0].slice(0, 110)}`);
    if (opts.verbose) out.push(`    ${color.dim(f.impact)}`, `    ${color.indigo("fix:")} ${f.agentRemediationPrompt}`);
  }
  if (r.findings.length) out.push("");
  out.push(
    r.pillars
      .map((p) => {
        const col = p.critical ? color.red : p.high || p.medium ? color.amber : color.green;
        return `${p.pillar.padEnd(10)} ${col(String(p.score).padStart(3))}  ${color.dim(`${p.critical}C ${p.high}H ${p.medium}M`)}`;
      })
      .join("\n"),
  );
  out.push(
    "",
    `${color.bold("Score")} ${statusColor(color.bold(`${r.score}/100`))}  ${statusColor(r.status)}  ${r.blockers} blocker(s)${r.suppressed ? color.dim(`  ${r.suppressed} suppressed`) : ""}`,
  );
  for (const n of r.notices ?? []) out.push(color.dim(`ℹ ${n.ruleIds.join(", ")} skipped: ${n.message}`));
  if (r.errors?.length) out.push(color.amber(`⚠ ${r.errors.length} rule(s) errored: ${r.errors.map((e) => `${e.ruleId} (${e.message})`).join(", ")}`));
  if (!opts.verbose && r.findings.length) out.push(color.dim("Run with --verbose for impact and agent fix prompts, or --json / --sarif for machine output."));
  return `${out.join("\n")}\n`;
}
