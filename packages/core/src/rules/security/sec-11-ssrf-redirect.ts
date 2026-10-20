import { defineRule, paramNames, refersTo, taintedVars, USER_INPUT_RE } from "../helpers";

const FETCHERS =
  /(?<![\w.])(?:fetch|axios(?:\.(?:get|post|put|request|head))?|got(?:\.\w+)?|ky(?:\.\w+)?|undici\.request|request|httpx\.(?:get|post|AsyncClient\(\)\.get)|requests\.(?:get|post|head)|urllib\.request\.urlopen)/;
const REDIRECTS = /(?<![\w.])(?:redirect|permanentRedirect|NextResponse\.redirect|Response\.redirect|res\.redirect|reply\.redirect|RedirectResponse)/;
const SSRF_GUARD =
  /127\.0\.0\.1|169\.254|\blocalhost\b|isPrivate|private_?ip|ipaddr|ssrf|allow_?list|allowedHosts|ALLOWED_(?:HOSTS|ORIGINS|DOMAINS)|\.hostname\s*(?:===|!==|in\b)|\.hostname\)|\.host\s*(?:===|!==)/i;
const REDIRECT_GUARD = /startsWith\s*\(\s*["'`]\/["'`]\s*\)|isRelative|isSafeRedirect|safeRedirect|allowedRedirects|ALLOWED_REDIRECT/;

export const sec11SsrfRedirect = defineRule(
  { id: "SEC-11", pillar: "SECURITY", severity: "HIGH", title: "Server-Side Request Forgery (SSRF) & Open Redirect" },
  (ctx, emit) => {
    for (const file of ctx.files.serverRoutesAndActions) {
      const ci = ctx.getCode(file);
      const check = (re: RegExp, kind: "ssrf" | "redirect") => {
        for (const call of ci.calls(re)) {
          const arg = ci.args(call)[0];
          if (!arg) continue;
          const expr = ci.slice(arg[0], arg[1], "noComments").trim();
          // new URL("/path", req.url) and plain string literals are safe.
          if (/^["'`][^$]*["'`]$/.test(expr) || /^new URL\s*\(\s*["'`]\//.test(expr)) continue;
          const fn = ci.outerFunction(call.start) ?? ci.enclosingFunction(call.start);
          const a = fn?.bodyStart ?? 0;
          const b = fn?.bodyEnd ?? ci.text.length;
          const extra = fn && ci.hasTopDirective("use server") ? paramNames(ci, fn) : [];
          const tainted = taintedVars(ci, a, b, extra);
          if (!USER_INPUT_RE.test(expr) && !refersTo(expr, tainted)) continue;
          const body = ci.slice(a, b, "noComments");
          if ((kind === "ssrf" ? SSRF_GUARD : REDIRECT_GUARD).test(body)) continue;
          emit({
            file,
            line: call.line,
            evidence: ci.snippet(call.start, { after: 0 }),
            impact:
              kind === "ssrf"
                ? `The server fetches a user-supplied URL (\`${expr.slice(0, 60)}\`). Attackers can reach internal services or cloud metadata (169.254.169.254) and steal credentials.`
                : `\`${call.callee}()\` sends users to a URL taken from the request (\`${expr.slice(0, 60)}\`), an open redirect used in phishing and OAuth token theft.`,
            agentRemediationPrompt:
              kind === "ssrf"
                ? `In ${file}:${call.line}, parse the URL with \`new URL(x)\`, require \`protocol === "https:"\`, check \`hostname\` against an explicit ALLOWED_HOSTS set, and reject private/loopback/link-local IPs after DNS resolution (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, ::1) before fetching.`
                : `In ${file}:${call.line}, only redirect to relative paths: \`const dest = x && x.startsWith("/") && !x.startsWith("//") ? x : "/";\` then \`${call.callee}(dest)\`.`,
          });
        }
      };
      check(FETCHERS, "ssrf");
      check(REDIRECTS, "redirect");
    }
  },
);
