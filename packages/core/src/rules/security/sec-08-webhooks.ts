import { WEBHOOK_VERIFY_RE } from "../../context/patterns";
import { defineRule, isWebhookRoute, routeBody, scriptRoutes } from "../helpers";

export const sec08Webhooks = defineRule(
  { id: "SEC-08", pillar: "SECURITY", severity: "CRITICAL", title: "Unverified Payment or Auth Webhook Handler" },
  (ctx, emit) => {
    for (const r of scriptRoutes(ctx)) {
      if (!isWebhookRoute(ctx, r)) continue;
      const { ci, a, b } = routeBody(ctx, r);
      const body = ci.slice(a, b, "noComments");
      const verified = r.hasWebhookVerification || WEBHOOK_VERIFY_RE.test(body);
      // Verifying a re-serialized JSON body always fails or gets "fixed" by skipping verification.
      const reserialized = verified && /constructEvent\w*\s*\(\s*JSON\.stringify|verify\w*\s*\(\s*JSON\.stringify/.test(body);
      if (verified && !reserialized) continue;
      const at = body.search(/\b(?:req|request)\.json\s*\(|JSON\.stringify/);
      const pos = a + (at >= 0 ? at : 0);
      emit({
        file: r.file,
        line: ci.lineOf(pos),
        nodeRef: `route:${r.method} ${r.urlPath}`,
        evidence: ci.snippet(pos, { after: 1 }),
        impact: reserialized
          ? `\`${r.urlPath}\` verifies the signature over JSON.stringify(body) instead of the raw bytes, so verification is broken.`
          : `\`${r.urlPath}\` trusts the request body with no signature check. Anyone can POST a forged \`checkout.session.completed\` event and grant themselves paid access or credits.`,
        agentRemediationPrompt: `In ${r.file}, read the raw body with \`const payload = await req.text();\`, then verify it before any logic: \`event = stripe.webhooks.constructEvent(payload, req.headers.get("stripe-signature")!, process.env.STRIPE_WEBHOOK_SECRET!)\` (or \`new Webhook(secret).verify(payload, headers)\` for Svix/Clerk). Wrap it in try/catch and \`return new Response("Invalid signature", { status: 400 })\` on failure.`,
      });
    }
  },
);
