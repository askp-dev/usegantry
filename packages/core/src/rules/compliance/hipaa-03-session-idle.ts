import type { CodeIndex } from "../../context/code-index";
import type { RepoContext } from "../../context/types";
import { defineRule } from "../helpers";
import { evalProduct } from "./compliance-helpers";

/** 15 minutes: the common HIPAA automatic-logoff (§164.312(a)(2)(iii)) benchmark. */
const LIMIT_S = 900;

/** Session factories: key holding the lifetime, its unit, and the library default when it's omitted. */
const JS_SESSIONS: Array<{ src: RegExp; call: RegExp; key: string; unit: number; dflt: string }> = [
  {
    src: /^(?:next-auth|@auth\/)/,
    call: /\b(?:NextAuth|SvelteKitAuth|ExpressAuth|QwikAuth|SolidAuth)/,
    key: "maxAge",
    unit: 1,
    dflt: "30 days (Auth.js default)",
  },
  { src: /^better-auth/, call: /\bbetterAuth/, key: "expiresIn", unit: 1, dflt: "7 days (better-auth default)" },
  {
    src: /^express-session$/,
    call: /(?<![.\w])(?:session|expressSession)/,
    key: "maxAge",
    unit: 0.001,
    dflt: "no cookie expiry; the store keeps it for a day (express-session default)",
  },
  {
    src: /^iron-session/,
    call: /\b(?:getIronSession|withIronSessionApiRoute|withIronSessionSsr|sealData)/,
    key: "ttl",
    unit: 1,
    dflt: "14 days (iron-session default)",
  },
];

type Hit = { file: string; line: number; evidence: string; seconds?: number; dflt?: string };

/** Value of `key: <expr>` inside [a, b), resolving one level of `const NAME = <expr>`. */
function lifetime(ci: CodeIndex, a: number, b: number, key: string): { pos: number; seconds?: number } | undefined {
  const m = ci.findAll(new RegExp(`\\b${key}\\s*:\\s*([^,}\\n]+)`), "masked", a, b)[0];
  if (!m) return undefined;
  const expr = ci.slice(m.index + m[0].length - m[1].length, m.index + m[0].length, "noComments").trim();
  let n = evalProduct(expr);
  if (n === undefined && /^[A-Za-z_$][\w$]*$/.test(expr)) {
    const def = new RegExp(`\\b(?:const|let|var)\\s+${expr}\\s*=\\s*([^;\\n]+)`).exec(ci.noComments);
    if (def) n = evalProduct(def[1]);
  }
  return { pos: m.index, seconds: n };
}

function jsHits(ctx: RepoContext): Hit[] {
  const out: Hit[] = [];
  for (const file of ctx.files.all) {
    if (!/\.[cm]?[jt]sx?$/.test(file) || /(^|\/)(test|tests|__tests__)\/|\.test\./.test(file)) continue;
    const ci = ctx.getCode(file);
    const sources = ci.imports().map((i) => i.source);
    for (const s of JS_SESSIONS) {
      if (!sources.some((src) => s.src.test(src))) continue;
      for (const call of ci.calls(s.call)) {
        // Options are often a named object elsewhere in the file (`sessionOptions`), so fall back to the whole file.
        const v = lifetime(ci, call.openParen, call.closeParen, s.key) ?? lifetime(ci, 0, ci.masked.length, s.key);
        const line = v ? ci.lineOf(v.pos) : call.line;
        if (v && v.seconds === undefined) continue; // computed elsewhere: can't judge, don't guess
        out.push({ file, line, evidence: ci.snippet(line, { isLine: true }), seconds: v?.seconds && v.seconds * s.unit, dflt: v ? undefined : s.dflt });
      }
    }
  }
  return out;
}

/** Django SESSION_COOKIE_AGE / Flask PERMANENT_SESSION_LIFETIME and Supabase `[auth.sessions] inactivity_timeout`. */
function configHits(ctx: RepoContext): Hit[] {
  const out: Hit[] = [];
  for (const file of ctx.glob("**/settings*.py")) {
    const text = ctx.getText(file);
    if (!/django/i.test(text)) continue;
    const m = /^SESSION_COOKIE_AGE\s*=\s*(.+)$/m.exec(text);
    const line = m ? text.slice(0, m.index).split("\n").length : 1;
    if (m && evalProduct(m[1].replace(/#.*/, "")) === undefined) continue;
    out.push({
      file,
      line,
      evidence: m ? m[0] : "SESSION_COOKIE_AGE not set",
      seconds: m ? evalProduct(m[1].replace(/#.*/, "")) : undefined,
      dflt: m ? undefined : "2 weeks (Django default)",
    });
  }
  for (const file of ctx.glob("**/*.py")) {
    const text = ctx.getText(file);
    const m = /PERMANENT_SESSION_LIFETIME[^=\n]*=\s*timedelta\(\s*(days|hours|minutes|seconds)\s*=\s*([\d.]+)/.exec(text);
    if (!m) continue;
    const mult = { days: 86400, hours: 3600, minutes: 60, seconds: 1 }[m[1] as "days"];
    out.push({ file, line: text.slice(0, m.index).split("\n").length, evidence: m[0], seconds: Number(m[2]) * mult });
  }
  if (ctx.hasFile("supabase/config.toml")) {
    const text = ctx.getText("supabase/config.toml");
    const m = /^\s*inactivity_timeout\s*=\s*"(\d+)([smh])"/m.exec(text);
    const line = m ? text.slice(0, m.index).split("\n").length + 1 : 1;
    out.push({
      file: "supabase/config.toml",
      line,
      evidence: m ? m[0].trim() : "[auth.sessions] inactivity_timeout not set",
      seconds: m ? Number(m[1]) * { s: 1, m: 60, h: 3600 }[m[2] as "s"] : undefined,
      dflt: m ? undefined : "never (Supabase default: no inactivity timeout)",
    });
  }
  return out;
}

const human = (s: number) => (s >= 86400 ? `${+(s / 86400).toFixed(1)} days` : s >= 3600 ? `${+(s / 3600).toFixed(1)} hours` : `${Math.round(s / 60)} minutes`);

export const hipaa03SessionIdle = defineRule(
  { id: "HIPAA-03", pillar: "SECURITY", severity: "HIGH", title: "Session Idle Timeout Longer Than 15 Minutes (HIPAA Automatic Logoff)", profiles: ["hipaa"] },
  (ctx, emit) => {
    for (const h of [...jsHits(ctx), ...configHits(ctx)]) {
      if (h.seconds !== undefined && h.seconds <= LIMIT_S) continue;
      const life = h.seconds !== undefined ? human(h.seconds) : h.dflt;
      emit({
        file: h.file,
        line: h.line,
        evidence: h.evidence,
        impact: `Sessions here stay valid for ${life}. On a shared clinic workstation or a lost phone, anyone who picks it up can read PHI long after the user walked away; HIPAA's automatic-logoff safeguard expects about 15 minutes of inactivity.`,
        agentRemediationPrompt: `In ${h.file}:${h.line}, cap the idle session lifetime at 15 minutes (900 s; express-session \`cookie.maxAge\` is in ms: 900000) and keep it rolling so active users aren't logged out (Auth.js \`updateAge\`, express-session \`rolling: true\`, Supabase \`inactivity_timeout = "15m"\`).`,
      });
    }
  },
);
