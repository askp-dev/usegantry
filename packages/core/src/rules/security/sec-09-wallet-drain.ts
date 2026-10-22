import { PAID_SDK_CALL_RE, RATE_LIMIT_RE } from "../../context/patterns";
import { defineRule, type Emit, isPaidVendor, isWebhookRoute, routeBody } from "../helpers";
import { eachRoute, type SysRouteFacts } from "../systems/route-facts";

const INPUT_CAP =
  /\bmax_?tokens\b|\bmaxTokens\b|\bmax_output_tokens\b|\bmaxOutputTokens\b|\.max\s*\(\s*\d|\.slice\s*\(\s*0\s*,|\.substring\s*\(\s*0\s*,|\.length\s*>=?\s*(?:\d{3,}|[A-Z_]{3,})|max_length\s*=|maxLength\b/;

export const sec09WalletDrain = defineRule(
  { id: "SEC-09", pillar: "SECURITY", severity: "HIGH", title: "Unthrottled Paid API / LLM Endpoint (Wallet-Drain Vector)" },
  (ctx, emit) =>
    eachRoute(
      ctx,
      (r) => {
        if (r.method === "GET" && !r.externalSdksCalled.some(isPaidVendor)) return;
        if (isWebhookRoute(ctx, r)) return;
        const { ci, a, b } = routeBody(ctx, r);
        const body = ci.slice(a, b, "masked");
        const callAt = body.search(PAID_SDK_CALL_RE);
        if (!r.externalSdksCalled.some(isPaidVendor) && callAt < 0) return;
        const fileText = ci.masked;
        const limited = r.hasRateLimit || RATE_LIMIT_RE.test(fileText);
        const capped = INPUT_CAP.test(fileText);
        if (limited && capped) return;
        const missing = [!limited && "rate limiting", !capped && "input-length / max_tokens caps"].filter(Boolean).join(" and ");
        const pos = a + Math.max(0, callAt);
        emit({
          file: r.file,
          line: ci.lineOf(pos),
          nodeRef: `route:${r.method} ${r.urlPath}`,
          evidence: `${r.method} ${r.urlPath} → ${r.externalSdksCalled.join(", ") || "paid SDK"} (missing ${missing})\n${ci.snippet(pos, { after: 0 })}`,
          impact: `\`${r.urlPath}\` spends money per request with no ${missing}. One script looping on it can burn through your API credits in hours.`,
          agentRemediationPrompt: `In ${r.file}, before the paid call: (1) add per-user/IP rate limiting, e.g. \`const { success } = await ratelimit.limit(session?.user.id ?? ip); if (!success) return new Response("Too many requests", { status: 429 });\` using @upstash/ratelimit; (2) validate the prompt with \`z.string().max(4000)\` and pass \`max_tokens: 1024\` (or \`maxTokens\`) to the model call.`,
        });
      },
      (f) => sysCheck(f, emit),
    ),
);

/** Go/Rust: a paid SDK call with no rate limiter or no input / max-token cap. */
function sysCheck(f: SysRouteFacts, emit: Emit) {
  const r = f.route;
  const paidVendor = r.externalSdksCalled.some(isPaidVendor);
  if ((r.method === "GET" && !paidVendor) || f.webhook) return;
  if (!paidVendor && !f.paidCall) return;
  if (f.rateLimited && f.inputCapped) return;
  const missing = [!f.rateLimited && "rate limiting", !f.inputCapped && "input-length / max_tokens caps"].filter(Boolean).join(" and ");
  emit({
    file: r.file,
    line: f.paidCall?.line ?? r.line,
    nodeRef: `route:${r.method} ${r.urlPath}`,
    evidence: `${r.method} ${r.urlPath} → ${r.externalSdksCalled.join(", ") || "paid SDK"} (missing ${missing})\n${f.paidCall?.evidence ?? ""}`.trim(),
    impact: `\`${r.urlPath}\` spends money per request with no ${missing}. One script looping on it can burn through your API credits in hours.`,
    agentRemediationPrompt:
      r.language === "go"
        ? `In ${r.file}, before the paid call: (1) rate-limit per user/IP with \`golang.org/x/time/rate\` (a \`rate.NewLimiter\` per key; \`if !lim.Allow() { c.AbortWithStatus(http.StatusTooManyRequests); return }\`) or tollbooth middleware; (2) cap the body with \`http.MaxBytesReader\`, reject prompts over a fixed length, and set \`MaxTokens: 1024\` on the request.`
        : `In ${r.file}, before the paid call: (1) add \`tower_governor::GovernorLayer\` (Axum) or \`actix_governor::Governor\` (Actix) to this route; (2) add \`DefaultBodyLimit::max(64 * 1024)\`, reject prompts over a fixed length, and set \`.max_tokens(1024u32)\` on the request.`,
  });
}
