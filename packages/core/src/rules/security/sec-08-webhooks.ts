import { WEBHOOK_VERIFY_RE } from "../../context/patterns";
import { defineRule, type Emit, isWebhookRoute, routeBody } from "../helpers";
import { eachRoute, type SysRouteFacts } from "../systems/route-facts";

export const sec08Webhooks = defineRule(
  { id: "SEC-08", pillar: "SECURITY", severity: "CRITICAL", title: "Unverified Payment or Auth Webhook Handler" },
  (ctx, emit) =>
    eachRoute(
      ctx,
      (r) => {
        if (!isWebhookRoute(ctx, r)) return;
        const { ci, a, b } = routeBody(ctx, r);
        const body = ci.slice(a, b, "noComments");
        const verified = r.hasWebhookVerification || WEBHOOK_VERIFY_RE.test(body);
        // Verifying a re-serialized JSON body always fails or gets "fixed" by skipping verification.
        const reserialized = verified && /constructEvent\w*\s*\(\s*JSON\.stringify|verify\w*\s*\(\s*JSON\.stringify/.test(body);
        if (verified && !reserialized) return;
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
      },
      (f) => sysCheck(f, emit),
    ),
);

/** Go/Rust: a webhook route with no signature-verification call. */
function sysCheck(f: SysRouteFacts, emit: Emit) {
  const r = f.route;
  if (!f.webhook || f.webhookVerified) return;
  emit({
    file: r.file,
    line: r.line,
    nodeRef: `route:${r.method} ${r.urlPath}`,
    evidence: `${r.method} ${r.urlPath}: no signature verification in ${r.handlerName ?? "the handler"}`,
    impact: `\`${r.urlPath}\` trusts the request body with no signature check. Anyone can POST a forged \`checkout.session.completed\` event and grant themselves paid access or credits.`,
    agentRemediationPrompt:
      r.language === "go"
        ? `In ${r.file}, read the raw body (\`payload, _ := io.ReadAll(http.MaxBytesReader(w, r.Body, 65536))\`) and verify it before any logic: \`event, err := webhook.ConstructEvent(payload, r.Header.Get("Stripe-Signature"), os.Getenv("STRIPE_WEBHOOK_SECRET"))\` (stripe-go), or \`hmac.Equal\` over an HMAC of the raw bytes for other providers. On error, respond 400 and return.`
        : `In ${r.file}, take the raw body (\`body: Bytes\`) and verify it before any logic: \`let event = Webhook::construct_event(std::str::from_utf8(&body)?, sig, &secret)?;\` (async-stripe), or \`mac.verify_slice(&sig_bytes)\` (hmac crate) for other providers. On error, return \`StatusCode::BAD_REQUEST\`.`,
  });
}
