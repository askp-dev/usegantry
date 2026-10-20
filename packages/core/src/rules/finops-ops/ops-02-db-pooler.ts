import { defineRule, redactUrl } from "../helpers";

const SERVERLESS = new Set(["vercel", "cloudflare", "aws-lambda", "netlify"]);
const DB_KEYS = /^(DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL|SUPABASE_DB_URL|NEON_DATABASE_URL|DB_URL|PG_URL)$/;
const POOLED = /:6543\b|-pooler\.|pgbouncer=true|\bprisma:\/\/|prisma\+postgres:\/\/|accelerate\.prisma-data\.net|hyperdrive/i;

export const ops02DbPooler = defineRule(
  { id: "OPS-02", pillar: "FINOPS_OPS", severity: "HIGH", title: "Direct Postgres Port (5432) in Serverless Environment" },
  (ctx, emit) => {
    if (!SERVERLESS.has(ctx.stack.deployTarget ?? "")) return;
    const schema = ctx.files.all.find((f) => f.endsWith("schema.prisma"));
    const hasDirectUrl = !!schema && /\bdirectUrl\s*=/.test(ctx.getText(schema));
    for (const e of ctx.env) {
      if (!DB_KEYS.test(e.key) || !/^postgres(?:ql)?:\/\//.test(e.value)) continue;
      let host = "";
      let port = "5432";
      try {
        const u = new URL(e.value);
        host = u.hostname;
        port = u.port || "5432";
      } catch {
        continue;
      }
      if (/^(localhost|127\.0\.0\.1|db|postgres|host\.docker\.internal)$/.test(host)) continue;
      const pooled = POOLED.test(e.value);
      if (!pooled && port === "5432") {
        emit({
          file: e.file,
          line: e.line,
          evidence: `${e.key}=${redactUrl(e.value)}`,
          impact: `On ${ctx.stack.deployTarget}, every function instance opens its own Postgres connection on :5432. Under load you hit max_connections ("too many clients"), and the app goes down exactly when traffic spikes.`,
          agentRemediationPrompt: `Point \`${e.key}\` at the transaction pooler (Supabase: port 6543 + \`?pgbouncer=true&connection_limit=1\`; Neon: the \`-pooler\` host) and move the direct :5432 URL to \`DIRECT_URL\`, referenced as \`directUrl = env("DIRECT_URL")\` in the Prisma datasource for migrations.`,
        });
      } else if (pooled && schema && !hasDirectUrl && e.key === "DATABASE_URL") {
        emit({
          file: schema,
          line: 1,
          evidence: `${e.key} is pooled but ${schema} has no directUrl`,
          impact:
            "Prisma migrations through a transaction pooler fail or corrupt the migration lock (prepared statements and advisory locks don't survive PgBouncer).",
          agentRemediationPrompt: `In ${schema}, add \`directUrl = env("DIRECT_URL")\` to the datasource block and set DIRECT_URL to the :5432 connection string.`,
        });
      }
    }
  },
);
