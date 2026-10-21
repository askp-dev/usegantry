import { vendorById } from "../../context/knowledge";
import { defineRule } from "../helpers";
import { isAiVendor, vendorSite } from "./compliance-helpers";

export const lgl03AiRetention = defineRule(
  {
    id: "LGL-03",
    pillar: "LEGAL",
    severity: "HIGH",
    title: "Privileged Content Sent to an AI Provider Without Zero Retention",
    scope: "repo",
    profiles: ["legal-privilege"],
  },
  (ctx, emit) => {
    for (const s of ctx.detectedSubprocessors) {
      const v = vendorById(s.id);
      if (!v || !isAiVendor(v) || (v.zdr === true && v.trainsOnData === false)) continue;
      const trains = v.trainsOnData === true;
      const why = trains
        ? "its default terms allow training on your inputs"
        : v.zdr === false
          ? "it offers no zero-data-retention option"
          : "Gantry can't confirm zero data retention or a no-training commitment";
      emit({
        ...vendorSite(ctx, s),
        severity: trains ? "CRITICAL" : "HIGH",
        impact: `${v.entityName} (${v.jurisdiction}) receives prompt content, and ${why}. Disclosing client confidences to a third party that keeps or learns from them can waive attorney-client privilege and breach confidentiality duties (ABA Model Rule 1.6).`,
        agentRemediationPrompt: trains
          ? `Remove ${v.entityName} from any path that sees client material, or replace it with a provider under a zero-retention, no-training agreement.`
          : `Get ${v.entityName}'s zero-data-retention / no-training terms in writing (${v.dpaUrl}) and enable them for this API key, or route privileged prompts to a provider that has them. Record it with a \`gantry-ignore LGL-03\` comment.`,
      });
    }
  },
);
