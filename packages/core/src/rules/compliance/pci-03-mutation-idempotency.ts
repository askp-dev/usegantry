import { vendorById } from "../../context/knowledge";
import { defineRule, isWebhookRoute, routeBody, scriptRoutes, snake } from "../helpers";
import { MONEY_TABLE_RE } from "./compliance-helpers";

const METHODS = new Set(["POST", "PUT", "PATCH", "SERVER_ACTION"]);
const IDEMPOTENT_RE = /idempoten|on\s+conflict\s*(?:\([^)]*\)\s*)?do\s+nothing/i;

export const pci03MutationIdempotency = defineRule(
  { id: "PCI-03", pillar: "FINOPS_OPS", severity: "HIGH", title: "Money-Moving Route Without an Idempotency Key", profiles: ["fintech-pci"] },
  (ctx, emit) => {
    for (const r of scriptRoutes(ctx)) {
      if (!METHODS.has(r.method) || isWebhookRoute(ctx, r)) continue; // webhooks: PAY-01
      const payVendor = r.externalSdksCalled.map(vendorById).find((v) => v && /^(?:Payments|Subscription Billing)/.test(v.category));
      const table = r.dbTablesAccessed.find((t) => MONEY_TABLE_RE.test(snake(t)));
      if (!payVendor && !table) continue;
      const { ci, a, b } = routeBody(ctx, r);
      if (IDEMPOTENT_RE.test(ci.slice(a, b, "noComments"))) continue;
      const what = payVendor ? `${payVendor.entityName} API` : `\`${table}\` table`;
      emit({
        file: r.file,
        line: r.line,
        evidence: ci.snippet(r.line, { isLine: true, after: 2 }),
        impact: `${r.method} ${r.urlPath} writes to the ${what} with no idempotency key. A network retry, a double-click or a client timeout replays it and the money moves twice.`,
        agentRemediationPrompt: `In ${r.file}:${r.line}, require an \`Idempotency-Key\` header, store it with a unique constraint alongside the result, return the stored result on a repeat, and forward it to the processor (Stripe: \`{ idempotencyKey }\` as the request options).`,
      });
    }
  },
);
