import { vendorById } from "../../context/knowledge";
import type { RouteNode } from "../../context/types";
import { defineRule, type Emit, isWebhookRoute, routeBody, snake } from "../helpers";
import { eachRoute, type SysRouteFacts } from "../systems/route-facts";
import { MONEY_TABLE_RE } from "./compliance-helpers";

const METHODS = new Set(["POST", "PUT", "PATCH", "SERVER_ACTION"]);
const IDEMPOTENT_RE = /idempoten|on\s+conflict\s*(?:\([^)]*\)\s*)?do\s+nothing/i;

export const pci03MutationIdempotency = defineRule(
  { id: "PCI-03", pillar: "FINOPS_OPS", severity: "HIGH", title: "Money-Moving Route Without an Idempotency Key", profiles: ["fintech-pci"] },
  (ctx, emit) =>
    eachRoute(
      ctx,
      (r) => {
        if (!METHODS.has(r.method) || isWebhookRoute(ctx, r)) return; // webhooks: PAY-01
        const what = moneyTarget(r);
        if (!what) return;
        const { ci, a, b } = routeBody(ctx, r);
        if (IDEMPOTENT_RE.test(ci.slice(a, b, "noComments"))) return;
        emit({
          file: r.file,
          line: r.line,
          evidence: ci.snippet(r.line, { isLine: true, after: 2 }),
          impact: `${r.method} ${r.urlPath} writes to the ${what} with no idempotency key. A network retry, a double-click or a client timeout replays it and the money moves twice.`,
          agentRemediationPrompt: `In ${r.file}:${r.line}, require an \`Idempotency-Key\` header, store it with a unique constraint alongside the result, return the stored result on a repeat, and forward it to the processor (Stripe: \`{ idempotencyKey }\` as the request options).`,
        });
      },
      (f) => sysCheck(f, emit),
    ),
);

/** "Stripe API" / "`transfers` table" when the route moves money, else null. */
function moneyTarget(r: RouteNode): string | null {
  const payVendor = r.externalSdksCalled.map(vendorById).find((v) => v && /^(?:Payments|Subscription Billing)/.test(v.category));
  const table = r.dbTablesAccessed.find((t) => MONEY_TABLE_RE.test(snake(t)));
  return payVendor ? `${payVendor.entityName} API` : table ? `\`${table}\` table` : null;
}

/** Go/Rust: a money-moving route with no idempotency key. */
function sysCheck(f: SysRouteFacts, emit: Emit) {
  const r = f.route;
  if (!METHODS.has(r.method) || f.webhook || f.idempotencyKey) return;
  const what = moneyTarget(r);
  if (!what) return;
  emit({
    file: r.file,
    line: r.line,
    evidence: `${r.method} ${r.urlPath} → ${what} with no idempotency key\n${f.firstMutation?.evidence ?? f.paidCall?.evidence ?? ""}`.trim(),
    impact: `${r.method} ${r.urlPath} writes to the ${what} with no idempotency key. A network retry, a double-click or a client timeout replays it and the money moves twice.`,
    agentRemediationPrompt: `In ${r.file}:${r.line}, require an \`Idempotency-Key\` header, store it with a unique constraint alongside the result (\`INSERT ... ON CONFLICT (idempotency_key) DO NOTHING\`), return the stored result on a repeat, and forward it to the processor (Stripe: the \`Idempotency-Key\` request header / \`params.SetIdempotencyKey\`).`,
  });
}
