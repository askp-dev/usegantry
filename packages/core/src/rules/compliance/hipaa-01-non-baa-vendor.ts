import { vendorById } from "../../context/knowledge";
import { defineRule } from "../helpers";
import { vendorSite } from "./compliance-helpers";

/** Payment processing is exempt from HIPAA's business-associate rules (§1179). */
const EXEMPT = /^(?:Payments|Subscription Billing)/;

export const hipaa01NonBaaVendor = defineRule(
  {
    id: "HIPAA-01",
    pillar: "PRIVACY",
    severity: "CRITICAL",
    title: "Sub-processor Without a HIPAA Business Associate Agreement",
    scope: "repo",
    profiles: ["hipaa"],
  },
  (ctx, emit) => {
    for (const s of ctx.detectedSubprocessors) {
      const v = vendorById(s.id);
      if (!v || v.baa === true || EXEMPT.test(v.category)) continue;
      const refuses = v.baa === false;
      emit({
        ...vendorSite(ctx, s),
        severity: refuses ? "CRITICAL" : "HIGH",
        impact: refuses
          ? `${v.entityName} (${v.category}) does not sign a HIPAA Business Associate Agreement. Any PHI that reaches it (an email body, an event property, a log line) is an impermissible disclosure and a reportable breach.`
          : `Gantry can't confirm that ${v.entityName} (${v.category}) signs a HIPAA Business Associate Agreement. Without a signed BAA, sending it PHI is an impermissible disclosure.`,
        agentRemediationPrompt: refuses
          ? `Replace ${v.entityName} with a vendor that signs a BAA (e.g. AWS SES or Twilio for messaging, PostHog with a BAA for analytics), or prove no PHI ever reaches it and add a \`gantry-ignore HIPAA-01\` comment explaining why.`
          : `Confirm ${v.entityName} offers a BAA on your plan and sign it (${v.dpaUrl}); if it doesn't, replace it or strip PHI before every call. Record the decision with a \`gantry-ignore HIPAA-01\` comment.`,
      });
    }
  },
);
