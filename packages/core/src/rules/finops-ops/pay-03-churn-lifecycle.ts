import { defineRule, lineAt } from "../helpers";

const PROVIDERS: Array<{ name: string; start: RegExp; required: string[] }> = [
  {
    name: "Stripe",
    start: /["'](checkout\.session\.completed|customer\.subscription\.created)["']/,
    required: ["customer\\.subscription\\.deleted", "invoice\\.payment_failed"],
  },
  {
    name: "Lemon Squeezy",
    start: /["'](subscription_created|order_created)["']/,
    required: ["subscription_expired|subscription_cancelled", "subscription_payment_failed"],
  },
  {
    name: "Paddle",
    start: /["'](subscription\.created|transaction\.completed)["']/,
    required: ["subscription\\.canceled", "transaction\\.payment_failed|subscription\\.past_due"],
  },
];

export const pay03ChurnLifecycle = defineRule(
  { id: "PAY-03", pillar: "FINOPS_OPS", severity: "MEDIUM", title: "Incomplete Subscription Lifecycle Handling (Churn Leak)" },
  (ctx, emit) => {
    const files = ctx.files.serverRoutesAndActions;
    for (const p of PROVIDERS) {
      const starts = files.map((f) => [f, ctx.getCode(f).noComments] as const).filter(([, t]) => p.start.test(t));
      if (!starts.length) continue;
      const all = files.map((f) => ctx.getCode(f).noComments).join("\n");
      const missing = p.required.filter((ev) => !new RegExp(`["'](?:${ev})["']`).test(all));
      if (!missing.length) continue;
      const [file, text] = starts[0];
      const m = p.start.exec(text)!;
      emit({
        file,
        line: lineAt(text, m.index),
        evidence: `handles ${m[1]} but not: ${missing.map((x) => x.split("|")[0].replace(/\\/g, "")).join(", ")}`,
        impact: `Access is granted on ${m[1]} but never revoked. Users who cancel or whose card fails keep paid features forever: silent revenue leakage that grows every month.`,
        agentRemediationPrompt: `In ${file}, add ${p.name} webhook branches for ${missing.map((x) => `\`${x.split("|")[0].replace(/\\/g, "")}\``).join(", ")}${p.name === "Stripe" ? " and `customer.subscription.updated`" : ""} that set the user's \`plan\`/\`subscription_status\` from the event (downgrade to free on deletion, mark \`past_due\` and restrict access on payment failure).`,
      });
    }
  },
);
