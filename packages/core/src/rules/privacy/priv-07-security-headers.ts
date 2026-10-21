import { defineRule, lineAt } from "../helpers";

const CONFIG_FILES =
  /(^|\/)(next\.config\.(m?js|ts|cjs)|vercel\.json|netlify\.toml|_headers|Caddyfile|nginx\.conf|(src\/)?middleware\.[tj]s|src\/hooks\.server\.[tj]s|svelte\.config\.js|server\.[tj]s|app\.[tj]s|main\.py|firebase\.json|staticwebapp\.config\.json)$/;
const REQUIRED: Array<[string, RegExp]> = [
  ["Strict-Transport-Security", /Strict-Transport-Security|\bhsts\b/i],
  ["X-Content-Type-Options: nosniff", /X-Content-Type-Options|nosniff|noSniff/i],
  ["X-Frame-Options / CSP frame-ancestors", /X-Frame-Options|frame-ancestors|frameguard/i],
];

export const priv07SecurityHeaders = defineRule(
  { id: "PRIV-07", pillar: "PRIVACY", severity: "MEDIUM", title: "Missing HSTS, CSP, Frame & CORS Security Headers", scope: "repo" },
  (ctx, emit) => {
    if (ctx.framework === "unknown" && !ctx.files.frontendComponents.length) return;
    const files = ctx.files.all.filter((f) => CONFIG_FILES.test(f));
    const texts = files.map((f) => [f, ctx.getText(f)] as const);
    const all = texts.map(([, t]) => t).join("\n");
    const helmet = /\bhelmet\s*\(|secure_headers|SecureHeadersMiddleware|@fastify\/helmet/.test(all);
    const missing = helmet ? [] : REQUIRED.filter(([, re]) => !re.test(all)).map(([n]) => n);
    const target = files.find((f) => /next\.config|svelte\.config|vercel\.json|middleware/.test(f)) ?? files[0] ?? "package.json";
    if (missing.length) {
      emit({
        file: target,
        line: 1,
        evidence: `missing headers: ${missing.join(", ")} (checked ${files.join(", ") || "no header config files"})`,
        impact: `Without ${missing.join(", ")}, the app can be framed for clickjacking, downgraded to HTTP on hostile Wi-Fi, or MIME-sniffed into running uploaded files as scripts.`,
        agentRemediationPrompt: /next\.config/.test(target)
          ? `In ${target}, add \`async headers() { return [{ source: "/(.*)", headers: [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }, { key: "X-Content-Type-Options", value: "nosniff" }, { key: "X-Frame-Options", value: "DENY" }, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }, { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }] }]; }\` to the exported config.`
          : `Add Strict-Transport-Security (max-age=63072000; includeSubDomains), X-Content-Type-Options: nosniff, X-Frame-Options: DENY and a CSP with frame-ancestors 'none' to every response (framework headers config, middleware, or \`helmet()\` for Express).`,
      });
    }
    for (const [f, t] of texts) {
      const star =
        /Access-Control-Allow-Origin["']?\s*[:,=]\s*(?:value\s*:\s*)?["']\*["']|origin\s*:\s*(?:["']\*["']|true)\b|allow_origins\s*=\s*\[\s*["']\*["']/i.exec(
          t,
        );
      const creds = /Access-Control-Allow-Credentials["']?\s*[:,=]\s*(?:value\s*:\s*)?["']?true|credentials\s*:\s*true|allow_credentials\s*=\s*True/i.test(t);
      if (!star || !creds) continue;
      emit({
        file: f,
        line: lineAt(t, star.index),
        evidence: star[0],
        impact:
          "CORS allows any origin together with credentials, so any website can make authenticated requests as your logged-in users and read the responses.",
        agentRemediationPrompt: `In ${f}, replace the wildcard origin with an explicit allowlist, e.g. \`origin: [process.env.NEXT_PUBLIC_APP_URL]\`, and keep credentials only for those origins.`,
      });
    }
  },
);
