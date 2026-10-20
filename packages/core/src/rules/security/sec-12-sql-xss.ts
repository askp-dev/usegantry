import { defineRule, lineAt } from "../helpers";

const RAW_SQL =
  /\$(?:queryRawUnsafe|executeRawUnsafe)|\bsql\.raw|\b(?:db|pool|client|conn|connection|knex)\.(?:query|execute|raw)|\bcursor\.execute|\.execute|\bexecuteSql/;
const SANITIZED = /DOMPurify\.sanitize|\bsanitize\w*\s*\(|\bpurify\b|\bxss\s*\(|sanitizeHtml|escapeHtml|rehype-sanitize/;

export const sec12SqlXss = defineRule(
  { id: "SEC-12", pillar: "SECURITY", severity: "MEDIUM", title: "Raw SQL Injection & Unsanitized HTML/Markdown XSS" },
  (ctx, emit) => {
    for (const file of ctx.files.all) {
      const ci = /\.(m|c)?[tj]sx?$|\.py$|\.svelte$|\.vue$/.test(file) ? ctx.getCode(file) : null;
      if (!ci) continue;
      if (ctx.files.serverRoutesAndActions.includes(file) || !ctx.files.frontendComponents.includes(file)) {
        for (const call of ci.calls(RAW_SQL)) {
          const arg = ci.args(call)[0];
          if (!arg) continue;
          const raw = ci.slice(arg[0], arg[1], "noComments").trim();
          const interpolated =
            /^`[\s\S]*\$\{/.test(raw) ||
            /^f["']/.test(raw) ||
            /["'`]\s*\+\s*\w|\w\s*\+\s*["'`]/.test(raw) ||
            /["']\s*%\s*\(?\w/.test(raw) ||
            /\.format\s*\(/.test(raw);
          if (!interpolated || !/\b(select|insert|update|delete|where|from)\b/i.test(raw)) continue;
          emit({
            file,
            line: call.line,
            evidence: ci.snippet(call.start, { after: 0 }),
            impact: "User data is interpolated into a raw SQL string, so an attacker can inject SQL to dump or drop tables.",
            agentRemediationPrompt: `In ${file}:${call.line}, replace string interpolation with bound parameters: Prisma tagged \`prisma.$queryRaw\\\`... \${value}\\\`\` (never *Unsafe), Drizzle \`sql\\\`... \${value}\\\`\`, pg \`query("... $1", [value])\`, or Python \`cursor.execute("... %s", (value,))\`.`,
          });
        }
      }
      const html = ci.noComments;
      const sinks = [
        ...html.matchAll(/dangerouslySetInnerHTML\s*=\s*\{\{\s*__html\s*:\s*([^}]+?)\s*\}\}/g),
        ...html.matchAll(/\{@html\s+([^}]+)\}/g),
        ...html.matchAll(/v-html\s*=\s*"([^"]+)"/g),
      ];
      for (const m of sinks) {
        const expr = m[1].trim();
        if (/^["'`][^$]*["'`]$/.test(expr) || SANITIZED.test(expr)) continue;
        if (/^JSON\.stringify\(/.test(expr) && /<script[^>]*application\/ld\+json/.test(html.slice(Math.max(0, m.index! - 200), m.index!))) continue;
        const id = expr.match(/^[\w$]+/)?.[0];
        if (id && new RegExp(`\\b${id.replace(/\$/g, "\\$")}\\s*=\\s*(?:await\\s+)?[^;\\n]*(?:${SANITIZED.source})`).test(html)) continue;
        const line = lineAt(html, m.index!);
        emit({
          file,
          line,
          evidence: ci.snippet(line, { isLine: true, after: 0 }),
          impact: `\`${expr}\` is rendered as raw HTML. If it comes from the database, markdown or an LLM, an attacker can inject <script> and steal sessions (stored XSS).`,
          agentRemediationPrompt: `In ${file}:${line}, sanitize before rendering: \`import DOMPurify from "isomorphic-dompurify";\` and use \`DOMPurify.sanitize(${expr})\` (or render markdown via react-markdown with rehype-sanitize).`,
        });
      }
    }
  },
);
