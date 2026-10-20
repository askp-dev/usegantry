import { defineRule } from "../helpers";

const TRACKERS: Array<{ re: RegExp; arg?: RegExp; name: string; ok: RegExp }> = [
  { re: /\bposthog\.init/, name: "PostHog", ok: /opt_out_capturing_by_default\s*:\s*true|cookieless_mode|persistence\s*:\s*["']memory["']/ },
  { re: /\bgtag/, arg: /^\(\s*["']config/, name: "Google Analytics (gtag)", ok: /analytics_storage\s*["']?\s*:\s*["']denied/ },
  { re: /\bfbq/, arg: /^\(\s*["']init/, name: "Meta Pixel", ok: /fbq\s*\(\s*["']consent["']\s*,\s*["']revoke/ },
  { re: /\b(?:Hotjar\.init|hotjar\.initialize)/, name: "Hotjar", ok: /$^/ },
  {
    re: /\b(?:mixpanel\.init|amplitude\.init|LogRocket\.init|clarity\.init|FullStory\.init|heap\.load)/,
    name: "analytics/session replay",
    ok: /opt_out_tracking_by_default\s*:\s*true|optOut\s*:\s*true/,
  },
  { re: /\bSentry\.replayIntegration|\bnew\s+Sentry\.Replay|\breplayIntegration/, name: "Sentry Session Replay", ok: /maskAllInputs\s*:\s*true/ },
];
const CONSENT = /consent|cookieBanner|cookie_banner|hasOptedIn|optedIn|gdprAccepted|cookiesAccepted|acceptedCookies/i;

export const priv04ConsentGate = defineRule(
  { id: "PRIV-04", pillar: "PRIVACY", severity: "HIGH", title: "Ungated Analytics, Pixel & Session Replay SDKs" },
  (ctx, emit) => {
    const targets = ctx.files.all.filter(
      (f) =>
        ctx.files.frontendComponents.includes(f) ||
        /(^|\/)(index|app)\.html$|(^|\/)(instrumentation-client|sentry\.client\.config|providers?)\.[tj]sx?$/.test(f),
    );
    for (const file of targets) {
      const ci = ctx.getCode(file);
      for (const t of TRACKERS) {
        // calls() matches on masked text; string args (gtag("config"), fbq("init")) are read from noComments.
        for (const call of ci.calls(t.re)) {
          const argText = ci.slice(call.openParen, call.closeParen + 1, "noComments");
          if (t.arg && !t.arg.test(argText)) continue;
          const fn = ci.enclosingFunction(call.start);
          const scope = ci.slice(fn?.bodyStart ?? Math.max(0, call.start - 600), call.closeParen + 1, "noComments");
          if (t.ok.test(argText) || CONSENT.test(scope)) continue;
          emit({
            file,
            line: call.line,
            evidence: ci.snippet(call.start, { after: 0 }),
            impact: `${t.name} starts on page load before the visitor consents. Under GDPR/ePrivacy and CPRA that's unlawful tracking, and replay SDKs can record typed passwords and card numbers.`,
            agentRemediationPrompt:
              t.name === "Sentry Session Replay"
                ? `In ${file}:${call.line}, pass \`{ maskAllInputs: true, maskAllText: true, blockAllMedia: true }\` to the replay integration and only add it after consent.`
                : `In ${file}:${call.line}, initialize ${t.name} only after consent: read a consent state (e.g. \`const consent = useConsent()\`) and call init inside \`if (consent.analytics)\`, or init with \`opt_out_capturing_by_default: true\` and call \`posthog.opt_in_capturing()\` from the cookie banner's Accept handler.`,
          });
        }
      }
    }
  },
);
