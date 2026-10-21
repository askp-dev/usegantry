import { buildLegalManifest, docStackHash } from "../../compilers/legal-compiler";
import { defineRule, lineAt } from "../helpers";

const LEGAL_SUFFIX = /,?\s*(Inc\.?|LLC|Ltd\.?|Limited|GmbH|S\.?A\.?S?|B\.V\.|AB|Corp(oration)?\.?|PBC|Co\.|Pty|plc|AG|ApS|Oy|SE)\.?$/i;

export const leg04SubprocessorDrift = defineRule(
  { id: "LEG-04", pillar: "LEGAL", severity: "HIGH", title: "Sub-Processor Drift (Code SDKs vs. Privacy Policy)", scope: "repo" },
  (ctx, emit) => {
    const manifest = buildLegalManifest(ctx);
    if (!manifest.subprocessors.length) return;
    const policyPath = ctx.files.legalDocs.find((f) => /privacy/i.test(f));
    const fix =
      "Run `gantry legal --sync` (compileLegalDocs) to regenerate the Sub-processor and PII tables in the privacy policy and bump CURRENT_LEGAL_VERSION, then review the diff.";
    if (!policyPath) {
      emit({
        file: "package.json",
        line: 1,
        evidence: `no privacy policy found; ${manifest.subprocessors.length} sub-processors detected: ${manifest.subprocessors.map((s) => s.entityName).join(", ")}`,
        impact:
          "Personal data flows to third parties that no privacy policy discloses. That breaches GDPR Art. 13/28 and CCPA notice rules, and app stores and payment providers reject apps without one.",
        agentRemediationPrompt: fix,
      });
      return;
    }
    const text = ctx.getText(policyPath);
    const lower = text.toLowerCase();
    for (const s of manifest.subprocessors) {
      const names = [s.entityName, s.entityName.replace(LEGAL_SUFFIX, ""), s.id.replace(/-/g, " ")]
        .map((n) => n.trim().toLowerCase())
        .filter((n) => n.length >= 3);
      if (names.some((n) => lower.includes(n))) continue;
      emit({
        file: policyPath,
        line: 1,
        nodeRef: `vendor:${s.id}`,
        evidence: `${s.entityName} (${s.category}, detected via ${s.detectedVia ?? s.pkg}) is not listed in ${policyPath}`,
        impact: `Your code sends ${s.dataProcessed.join(", ") || "user data"} to ${s.entityName} (${s.jurisdiction}), but the privacy policy doesn't disclose it. That's sub-processor drift, a GDPR Art. 28 transparency violation.`,
        agentRemediationPrompt: fix,
      });
    }
    const recorded = docStackHash(text);
    if (recorded && recorded !== manifest.stackHash) {
      const at = text.indexOf("GANTRY:AUTO:VERSION_META");
      emit({
        file: policyPath,
        line: lineAt(text, at),
        evidence: `VERSION_META stack hash ${recorded} ≠ current stack hash ${manifest.stackHash}`,
        impact: "The policy was compiled for a different set of vendors, data categories or clauses than the code now uses.",
        agentRemediationPrompt: fix,
      });
    }
  },
);
