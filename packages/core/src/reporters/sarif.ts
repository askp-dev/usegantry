/** SARIF 2.1.0 for GitHub code scanning (`preflight scan --sarif > preflight.sarif`). */
import type { AuditReport, Severity } from "../context/types";
import { ALL_STATIC_RULES } from "../rules/index";

const LEVEL: Record<Severity, "error" | "warning" | "note"> = { CRITICAL: "error", HIGH: "warning", MEDIUM: "note" };
const SECURITY_SEVERITY: Record<Severity, string> = { CRITICAL: "9.5", HIGH: "7.5", MEDIUM: "5.0" };

export function toSarif(report: AuditReport): Record<string, unknown> {
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "Preflight",
            version: report.tool.version,
            semanticVersion: report.tool.version,
            informationUri: "https://github.com/askthestoryteller/preflight",
            rules: ALL_STATIC_RULES.map((r) => ({
              id: r.id,
              name: r.id.replace("-", ""),
              shortDescription: { text: r.title },
              defaultConfiguration: { level: LEVEL[r.severity] },
              properties: { tags: [r.pillar.toLowerCase()], "security-severity": SECURITY_SEVERITY[r.severity] },
            })),
          },
        },
        results: report.findings.map((f) => ({
          ruleId: f.ruleId,
          level: LEVEL[f.severity],
          message: { text: `${f.title}: ${f.impact}` },
          locations: [{ physicalLocation: { artifactLocation: { uri: f.file }, region: { startLine: f.line } } }],
          partialFingerprints: { "preflight/v1": f.fingerprint ?? "" },
          properties: { severity: f.severity, blocking: f.blocking, evidence: f.evidence, remediation: f.agentRemediationPrompt },
        })),
      },
    ],
  };
}
