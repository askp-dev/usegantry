import { PRIVATE_VALUE_RE, PUBLIC_ENV_PREFIX_RE, SECRET_NAME_RE } from "../../context/patterns";
import { defineRule, redact } from "../helpers";

function isServiceRoleJwt(v: string): boolean {
  if (!v.startsWith("eyJ")) return false;
  try {
    const payload = JSON.parse(Buffer.from(v.split(".")[1] ?? "", "base64url").toString("utf8"));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

export const sec05PublicEnv = defineRule(
  { id: "SEC-05", pillar: "SECURITY", severity: "CRITICAL", title: "Secret / Private Key Exposed via Public Env Prefix" },
  (ctx, emit) => {
    const seen = new Set<string>();
    const fix = (key: string, bare: string) =>
      `Rename \`${key}\` to \`${bare}\` in every .env file and in code, move all usages into a server-only module (add \`import "server-only";\` at its top) or a server route, rotate the exposed key, and delete the public variable from your hosting provider.`;
    for (const e of ctx.env) {
      const m = PUBLIC_ENV_PREFIX_RE.exec(e.key);
      if (!m || seen.has(e.key)) continue;
      const bare = e.key.slice(m[0].length);
      const byName = SECRET_NAME_RE.test(bare);
      const byValue = !!e.value && (PRIVATE_VALUE_RE.test(e.value) || isServiceRoleJwt(e.value));
      if (!byName && !byValue) continue;
      seen.add(e.key);
      emit({
        file: e.file,
        line: e.line,
        evidence: `${e.key}=${e.value ? redact(e.value) : ""}`,
        impact: `\`${m[0]}\` variables are inlined into the browser bundle. ${byValue ? "The value is a live private key" : `\`${bare}\` names a secret`}, which anyone visiting the site can extract from DevTools and use against your account.`,
        agentRemediationPrompt: fix(e.key, bare),
      });
    }
    const codeRe = /\b(?:process\.env|import\.meta\.env)\.((?:NEXT_PUBLIC_|VITE_|PUBLIC_|EXPO_PUBLIC_|REACT_APP_|NUXT_PUBLIC_)\w+)/g;
    for (const file of ctx.files.all) {
      if (!/\.(m|c)?[tj]sx?$|\.svelte$|\.vue$/.test(file)) continue;
      const ci = ctx.getCode(file);
      for (const m of ci.findAll(codeRe, "masked")) {
        const key = m[1];
        const bare = key.replace(PUBLIC_ENV_PREFIX_RE, "");
        if (seen.has(key) || !SECRET_NAME_RE.test(bare)) continue;
        seen.add(key);
        emit({
          file,
          line: ci.lineOf(m.index),
          evidence: ci.snippet(m.index, { after: 0 }),
          impact: `Code reads secret \`${key}\` through a public prefix, so the bundler ships its value to every browser.`,
          agentRemediationPrompt: fix(key, bare),
        });
      }
    }
  },
);
