import { DB_MUTATION_RE } from "../../context/patterns";
import { defineRule, isWebhookRoute, routeBody } from "../helpers";

const IDEMPOTENT =
  /\bevent\.id\b|\bevt\.id\b|\beventId\b|\bevent_id\b|idempoten|processed_?webhook|webhook_?events|webhookEvent|svix-id|webhook-id|ON\s+CONFLICT|onConflictDoNothing|skipDuplicates|\.upsert\s*\(/i;

export const pay01WebhookIdempotency = defineRule(
  { id: "PAY-01", pillar: "FINOPS_OPS", severity: "HIGH", title: "Non-Idempotent Webhook Event Processing (Double-Grant Bug)" },
  (ctx, emit) => {
    for (const r of ctx.routes) {
      if (!isWebhookRoute(ctx, r)) continue;
      const { ci, a, b } = routeBody(ctx, r);
      const masked = ci.slice(a, b, "masked");
      const at = masked.search(DB_MUTATION_RE);
      if (at < 0 || IDEMPOTENT.test(ci.slice(a, b, "noComments"))) continue;
      emit({
        file: r.file,
        line: ci.lineOf(a + at),
        nodeRef: `route:${r.method} ${r.urlPath}`,
        evidence: ci.snippet(a + at, { after: 0 }),
        impact:
          "Payment providers retry webhooks (on timeouts, 5xx, deploys), so the same event is delivered more than once. Without an event-id check, each retry grants credits or a subscription again.",
        agentRemediationPrompt: `In ${r.file}, after verifying the signature and before fulfillment, record the event atomically: create table \`processed_webhook_events (event_id text primary key, processed_at timestamptz default now())\`, then \`INSERT ... ON CONFLICT (event_id) DO NOTHING RETURNING event_id\` (Prisma: \`create\` inside try/catch on P2002). If no row was inserted, \`return Response.json({ received: true })\` without re-processing. Run the insert and fulfillment in one transaction.`,
      });
    }
  },
);
