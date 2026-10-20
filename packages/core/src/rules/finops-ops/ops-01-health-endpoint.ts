import { defineRule, routeBody } from "../helpers";

const HEALTH_URL = /\/(?:api\/)?(?:health|healthz|healthcheck|readyz|livez|ready|status|ping)$/i;
const DB_PING = /SELECT\s+1|\$queryRaw|\.ping\s*\(|\bdb\.execute\s*\(|\.from\s*\(|\.rpc\s*\(|\bcount\s*\(|\$executeRaw|\.raw\s*\(|\bsql`/i;

export const ops01HealthEndpoint = defineRule(
  { id: "OPS-01", pillar: "FINOPS_OPS", severity: "MEDIUM", title: "Missing /api/health Readiness & DB Liveness Probe" },
  (ctx, emit) => {
    if (!ctx.routes.length) return;
    const health = ctx.routes.find((r) => r.method === "GET" && HEALTH_URL.test(r.urlPath));
    const fix =
      'Scaffold `app/api/health/route.ts` (or the framework equivalent) exporting `GET` that runs `SELECT 1` against the database with a 2-second timeout (`Promise.race`), returns `200 { status: "ok" }` on success and `503 { status: "degraded" }` on failure, sets `Cache-Control: no-store`, and is excluded from auth middleware.';
    if (!health) {
      emit({
        file: ctx.routes[0].file,
        line: 1,
        evidence: `no GET /api/health or /healthz among ${ctx.routes.length} routes`,
        impact: "Uptime monitors and load balancers can't tell when the app or its database is down, so outages are discovered by customers instead of alerts.",
        agentRemediationPrompt: fix,
      });
      return;
    }
    const { ci, a, b } = routeBody(ctx, health);
    const body = ci.slice(a, b, "noComments");
    const issues = [!DB_PING.test(body) && "no database ping", !/\b503\b/.test(body) && "never returns 503"].filter(Boolean);
    if (!issues.length) return;
    emit({
      file: health.file,
      line: health.line,
      nodeRef: `route:${health.method} ${health.urlPath}`,
      evidence: `${health.urlPath}: ${issues.join(", ")}`,
      impact: `The health endpoint reports healthy even when the database is unreachable (${issues.join(", ")}), so monitors stay green during real outages.`,
      agentRemediationPrompt: fix,
    });
  },
);
