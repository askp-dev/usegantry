import { DOCKERFILE_RE } from "../../context/dockerfile";
import type { Dependency } from "../../context/types";
import { defineRule } from "../helpers";
import { COMPOSE_RE } from "./infra-helpers";

type Beacon = {
  deps: string[];
  what: string;
  /** Opt-out or self-host evidence anywhere in config/code. */
  optOut: RegExp;
  fix: string;
};

const SELF_HOSTED = (keys: string, saas: string) => new RegExp(`(?:${keys})\\W{1,4}["'\`]?https?://(?![^"'\`\\s]*${saas})`, "i");

const BEACONS: Beacon[] = [
  {
    deps: ["next"],
    what: "Next.js CLI telemetry (anonymous usage events to telemetry.nextjs.org on every build/dev run)",
    optOut: /NEXT_TELEMETRY_DISABLED\W{1,4}["']?(?:1|true)\b|next\s+telemetry\s+disable/i,
    fix: "set `NEXT_TELEMETRY_DISABLED=1` in the build environment (Dockerfile `ENV`, CI env and `.env.example`)",
  },
  {
    deps: ["chromadb", "pypi:chromadb"],
    what: "Chroma's anonymized PostHog telemetry",
    optOut: /ANONYMIZED_TELEMETRY\W{1,4}["']?(?:false|0)\b|anonymized_telemetry\s*=\s*False/i,
    fix: "set `ANONYMIZED_TELEMETRY=False` for the Chroma server and client (or `Settings(anonymized_telemetry=False)`)",
  },
  {
    deps: ["pypi:gradio"],
    what: "Gradio analytics",
    optOut: /GRADIO_ANALYTICS_ENABLED\W{1,4}["']?(?:false|0)\b|analytics_enabled\s*=\s*False/i,
    fix: "set `GRADIO_ANALYTICS_ENABLED=False` or pass `analytics_enabled=False`",
  },
  {
    deps: ["pypi:streamlit"],
    what: "Streamlit usage statistics",
    optOut: /gatherUsageStats\s*=\s*false|STREAMLIT_BROWSER_GATHER_USAGE_STATS\W{1,4}["']?(?:false|0)\b/i,
    fix: "set `[browser] gatherUsageStats = false` in `.streamlit/config.toml`",
  },
  {
    deps: ["posthog-js", "posthog-node", "posthog-react-native", "pypi:posthog"],
    what: "PostHog product analytics",
    optOut: SELF_HOSTED("api_host|apiHost|host", "posthog\\.com"),
    fix: "point PostHog at a self-hosted instance (`api_host`) or remove it for air-gapped builds",
  },
  {
    deps: ["@sentry/nextjs", "@sentry/node", "@sentry/react", "@sentry/browser", "@sentry/sveltekit", "pypi:sentry-sdk"],
    what: "Sentry error reporting (stack traces, request data and breadcrumbs)",
    optOut: SELF_HOSTED("dsn|SENTRY_DSN", "sentry\\.io"),
    fix: "use a self-hosted Sentry/GlitchTip DSN, or disable Sentry in the air-gapped build",
  },
  {
    deps: [
      "@vercel/analytics",
      "@vercel/speed-insights",
      "@segment/analytics-next",
      "@segment/analytics-node",
      "mixpanel",
      "mixpanel-browser",
      "@amplitude/analytics-browser",
      "@datadog/browser-rum",
      "logrocket",
      "@fullstory/browser",
    ],
    what: "third-party product analytics",
    optOut: /(?!)/,
    fix: "remove the SDK from the air-gapped build, or replace it with a self-hosted analytics endpoint",
  },
];

const TRACING_ENV = /^(?:LANGCHAIN_TRACING_V2|LANGSMITH_TRACING(?:_V2)?|LANGCHAIN_TRACING)$/;
const MARKUP = /\.(?:html?|[cm]?[jt]sx|svelte|vue|astro|css|scss|less)$/;
const REMOTE_ASSET =
  /<(?:script|Script)\b[^>]*?\bsrc\s*=\s*\{?\s*["'`]((?:https?:)?\/\/[^"'`]+)|<link\b(?=[^>]*\brel\s*=\s*["'](?:stylesheet|preload|modulepreload)["'])[^>]*?\bhref\s*=\s*["']((?:https?:)?\/\/[^"']+)|@import\s+(?:url\()?\s*["']?((?:https?:)?\/\/[^"')\s]+)/g;

export const sov01TelemetryBeacons = defineRule(
  { id: "SOV-01", pillar: "PRIVACY", severity: "HIGH", title: "Telemetry / Phone-Home Beacon in an Air-Gapped Build", profiles: ["airgap"] },
  (ctx, emit) => {
    // Opt-outs can live in env files, Dockerfiles, compose, package scripts, framework config or code.
    const corpus = ctx.files.all
      .filter(
        (f) =>
          ctx.files.envFiles.includes(f) ||
          DOCKERFILE_RE.test(f) ||
          COMPOSE_RE.test(f) ||
          /(?:^|\/)(?:package\.json|\.npmrc|config\.toml|[\w.-]*\.config\.[cm]?[jt]s|.*\.ya?ml)$/.test(f) ||
          /\.(?:[cm]?[jt]sx?|py)$/.test(f),
      )
      .map((f) => ctx.getText(f))
      .join("\n");
    const depLine = (d: Dependency) => ({ file: d.declaredIn ?? "package.json", line: d.declaredLine ?? 1 });

    // 1. SDKs and frameworks that phone home by default
    for (const b of BEACONS) {
      const deps = b.deps.map((n) => ctx.dependencies.get(n)).filter((d): d is Dependency => !!d && d.isDirect !== false);
      if (!deps.length || b.optOut.test(corpus)) continue;
      for (const d of deps) {
        const { file, line } = depLine(d);
        emit({
          file,
          line,
          evidence: `${d.name}@${d.version}`,
          impact: `\`${d.name}\` ships ${b.what}, which sends data to the vendor's cloud by default. In an air-gapped or sovereign deployment this is an unapproved egress path: it leaks usage and environment metadata, fails noisily behind a deny-all firewall, and breaks a "no data leaves the network" commitment.`,
          agentRemediationPrompt: `In ${file}:${line}, ${b.fix}. Then add an egress deny-list check to CI so new beacons are caught.`,
        });
      }
    }
    // 2. LangSmith tracing ships every prompt and completion to LangChain's cloud
    for (const e of ctx.env) {
      if (!TRACING_ENV.test(e.key) || !/^["']?true["']?$/i.test(e.value)) continue;
      if (ctx.env.some((x) => /^LANG(?:CHAIN|SMITH)_ENDPOINT$/.test(x.key) && x.value && !/smith\.langchain\.com/.test(x.value))) continue;
      emit({
        file: e.file,
        line: e.line,
        evidence: `${e.key}=${e.value}`,
        impact:
          "LangSmith tracing uploads every prompt, retrieved document, tool call and completion to api.smith.langchain.com. In an air-gapped deployment that is a full copy of user data leaving the network.",
        agentRemediationPrompt: `In ${e.file}:${e.line}, set \`${e.key}=false\` for the air-gapped build, or point \`LANGSMITH_ENDPOINT\` at a self-hosted LangSmith.`,
      });
    }
    // 3. Remote fonts, scripts and stylesheets loaded at runtime (or fetched at build time by next/font/google)
    for (const file of ctx.files.all) {
      if (!MARKUP.test(file) && !/\.[cm]?[jt]s$/.test(file)) continue;
      const text = ctx.getText(file);
      const seen = new Set<string>();
      if (/\.[cm]?[jt]sx?$/.test(file) && /from\s+["']next\/font\/google["']/.test(text)) {
        const at = ctx.getCode(file).lineOf(text.search(/from\s+["']next\/font\/google["']/));
        emit({
          file,
          line: at,
          severity: "MEDIUM",
          evidence: ctx.getCode(file).lineText(at).trim(),
          impact:
            "`next/font/google` downloads font files from fonts.gstatic.com at build time, so an air-gapped build fails (or silently falls back) and the build host reaches out to Google.",
          agentRemediationPrompt: `In ${file}:${at}, vendor the font files into the repo and switch to \`next/font/local\` (\`localFont({ src: "./fonts/…woff2" })\`).`,
        });
      }
      if (!MARKUP.test(file)) continue;
      for (const m of text.matchAll(REMOTE_ASSET)) {
        const url = m[1] ?? m[2] ?? m[3];
        const host = url.replace(/^(?:https?:)?\/\//, "").split(/[/?#]/)[0];
        if (seen.has(host)) continue;
        seen.add(host);
        const line = text.slice(0, m.index).split("\n").length;
        emit({
          file,
          line,
          evidence: m[0].slice(0, 200),
          impact: `This page loads code or styles from \`${host}\` at runtime. Every visit sends the user's IP, user agent and referrer to that third party (Google Fonts has been ruled a GDPR violation for exactly this), and in an air-gapped network the asset never loads.`,
          agentRemediationPrompt: `In ${file}:${line}, download the asset from ${host} into \`public/\` (or install the npm package / \`@fontsource/*\`) and reference it by a relative path.`,
        });
      }
    }
  },
);
