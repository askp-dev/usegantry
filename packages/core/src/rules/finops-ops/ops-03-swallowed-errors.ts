import { defineRule } from "../helpers";

const TELEMETRY =
  /\b(?:Sentry\.captureException|captureException|captureError|posthog\.capture\w*|reportError|bugsnag\.notify|Bugsnag\.notify|rollbar\.error|Rollbar\.error|newrelic\.noticeError|logger\.(?:error|fatal)|log\.error|Honeybadger\.notify|track(?:Error|Exception))\s*\(/;
const FAILS =
  /\bthrow\b|\bstatus\s*:\s*[45]\d\d\b|\b[45]\d\d\b|\bredirect\s*\(|\bnotFound\s*\(|\berror\s*\(\s*[45]\d\d|\bfail\s*\(|\bok\s*:\s*false\b|\bsuccess\s*:\s*false\b|\berror\s*:/;
const TRACKER_PKG = /^(@sentry\/|posthog-node|@bugsnag\/|rollbar|newrelic|@honeybadger-io\/|@highlight-run\/|dd-trace|@datadog\/)/;

export const ops03SwallowedErrors = defineRule(
  { id: "OPS-03", pillar: "FINOPS_OPS", severity: "MEDIUM", title: "Swallowed Exceptions in Critical Paths Without Telemetry" },
  (ctx, emit) => {
    const tracker = [...ctx.dependencies.values()].some((d) => d.isDirect && TRACKER_PKG.test(d.name));
    for (const file of ctx.files.serverRoutesAndActions) {
      const ci = ctx.getCode(file);
      const hits: Array<[number, string]> = [];
      if (ci.lang === "py") {
        for (const m of ci.findAll(/\bexcept\b[^:\n]*:\s*\n?\s*pass\b/g)) hits.push([m.index, "`except: pass` swallows the error"]);
      } else {
        for (const m of ci.findAll(/\bcatch\s*(?:\([^)]*\))?\s*\{/g)) {
          const open = m.index + m[0].length - 1;
          const close = ci.matchClose(open);
          if (close < 0) continue;
          const body = ci.slice(open + 1, close, "masked");
          if (!body.trim()) hits.push([m.index, "empty catch block"]);
          else if (!FAILS.test(body))
            hits.push([
              m.index,
              TELEMETRY.test(body) ? "error is reported but the handler still returns success" : "error is only logged and the handler returns success",
            ]);
          else if (tracker && !TELEMETRY.test(body) && !/\bthrow\b/.test(body))
            hits.push([m.index, "error returns a failure status but is never sent to the installed error tracker"]);
        }
      }
      for (const [pos, why] of hits) {
        emit({
          file,
          line: ci.lineOf(pos),
          evidence: `${ci.snippet(pos, { after: 2 })}\n// ${why}`,
          impact: `${why[0].toUpperCase()}${why.slice(1)}. Failed payments, writes or auth checks look successful to the client and are invisible to on-call, so data loss goes unnoticed.`,
          agentRemediationPrompt: `In ${file}:${ci.lineOf(pos)}, inside the catch: call \`Sentry.captureException(e)\` (or the project's error tracker), then return a structured failure, e.g. \`return Response.json({ error: "Internal error" }, { status: 500 })\` (or re-throw in server actions). Never return \`ok: true\` from a catch.`,
        });
      }
    }
  },
);
