import { defineRule, lineAt } from "../helpers";

const BUILTIN =
  /^(NODE_ENV|NEXT_RUNTIME|NEXT_PHASE|VERCEL(_\w+)?|CI|HOME|PWD|PATH|TZ|PORT|HOST(NAME)?|npm_\w+|DEBUG|LANG|SHELL|USER|TMPDIR|BUN_\w+|NETLIFY|CF_PAGES\w*|AWS_REGION|AWS_LAMBDA_\w+|MODE|DEV|PROD|SSR|BASE_URL|PYTHONPATH|NODE_OPTIONS)$/;
const REFS = [
  /\bprocess\.env\.([A-Z_][A-Z0-9_]*)/g,
  /\bprocess\.env\[\s*["']([A-Z_][A-Z0-9_]*)["']\s*\]/g,
  /\bimport\.meta\.env\.([A-Z_][A-Z0-9_]*)/g,
  /\bos\.environ(?:\.get\(\s*|\[\s*)["']([A-Z_][A-Z0-9_]*)["']/g,
  /\bos\.getenv\(\s*["']([A-Z_][A-Z0-9_]*)["']/g,
  /\bDeno\.env\.get\(\s*["']([A-Z_][A-Z0-9_]*)["']/g,
];
const EXAMPLE = /(^|\/)\.env\.(example|sample|template|dist|defaults)$/;
const SCHEMA_FILE = /(^|\/)(src\/)?(lib\/)?env(\/index)?\.(m?[tj]s)$|(^|\/)env\.mjs$/;

export const ops04EnvValidator = defineRule(
  { id: "OPS-04", pillar: "FINOPS_OPS", severity: "MEDIUM", title: "Unvalidated Runtime Environment Variables (Startup Drift)", scope: "repo" },
  (ctx, emit) => {
    const used = new Map<string, string>(); // key -> first "file:line"
    for (const f of ctx.files.all) {
      if (!/\.(m|c)?[tj]sx?$|\.py$|\.svelte$|\.vue$/.test(f) || /\.(test|spec|d)\.[tj]sx?$/.test(f)) continue;
      const nc = ctx.getCode(f).noComments;
      for (const re of REFS) for (const m of nc.matchAll(re)) if (!BUILTIN.test(m[1]) && !used.has(m[1])) used.set(m[1], `${f}:${lineAt(nc, m.index!)}`);
    }
    for (const f of ctx.files.all.filter((x) => x.endsWith("schema.prisma")))
      for (const m of ctx.getText(f).matchAll(/env\(\s*"([A-Z_][A-Z0-9_]*)"\s*\)/g)) if (!used.has(m[1])) used.set(m[1], f);
    if (!used.size) return;
    const example = ctx.files.all.find((f) => EXAMPLE.test(f));
    const documented = new Set(ctx.env.filter((e) => e.file === example).map((e) => e.key));
    const missing = [...used.keys()].filter((k) => !documented.has(k)).sort();
    if (!example || missing.length) {
      const target = example ?? ".env.example";
      const exText = example ? ctx.getText(example) : "";
      const lines = exText ? exText.replace(/\n$/, "").split("\n").length : 0;
      emit({
        file: target,
        line: Math.max(1, lines),
        evidence: missing.map((k) => `${k}  (used at ${used.get(k)})`).join("\n"),
        impact: `${missing.length} env var(s) used in code aren't documented in ${target}. New environments (preview deploys, teammates, CI) boot with them undefined and fail at runtime instead of at startup.`,
        agentRemediationPrompt: `Append ${missing.join(", ")} to ${target} with empty or placeholder values (never real secrets).`,
        // Appending empty keys is deterministic and safe.
        autoFixPatch: { startLine: lines + 1, endLine: lines, replacementText: `${missing.map((k) => `${k}=`).join("\n")}\n` },
      });
    }
    const hasSchema =
      ctx.files.all.some((f) => SCHEMA_FILE.test(f)) ||
      ctx.files.all.some(
        (f) =>
          /\.(m?[tj]s)$/.test(f) &&
          /\bcreateEnv\s*\(|\.(?:safeParse|parse)\s*\(\s*process\.env\s*\)|class\s+\w*Settings\s*\(\s*BaseSettings/.test(ctx.getText(f)),
      );
    if (!hasSchema)
      emit({
        file: example ?? "package.json",
        line: 1,
        evidence: `${used.size} env vars referenced, no boot-time schema (src/env.ts, createEnv, z.object().parse(process.env))`,
        impact:
          "Missing or malformed env vars (a typo'd key, an empty secret) aren't caught at boot, so they surface as 500s, or worse, as auth checks running against `undefined`.",
        agentRemediationPrompt: `Create \`src/env.ts\` with \`import { z } from "zod"; export const env = z.object({ ${[...used.keys()]
          .slice(0, 6)
          .map((k) => `${k}: z.string().min(1)`)
          .join(
            ", ",
          )}${used.size > 6 ? ", ..." : ""} }).parse(process.env);\` (or @t3-oss/env-nextjs createEnv with server/client split), import it once at startup, and replace direct \`process.env.X\` reads with \`env.X\`.`,
      });
  },
);
