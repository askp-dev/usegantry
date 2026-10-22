import { AUTH_ASSERTION_RE, DB_MUTATION_RE, PAID_SDK_CALL_RE } from "../../context/patterns";
import { defineRule, type Emit, isWebhookRoute, MUTATING_METHODS, routeBody } from "../helpers";
import { eachRoute, type SysRouteFacts } from "../systems/route-facts";

/** Auth helpers that throw / redirect on failure by convention, so the call itself enforces. */
const SELF_ENFORCING =
  /\b(?:require\w*|auth\.protect|getUserOrThrow|assert\w*|ensureAuth\w*|verifyToken|verifyIdToken|verifyJwt|jwtVerify|jwt\.verify|checkAuth|authorize|withAuth|withApiAuthRequired|protectedProcedure|authedProcedure|privateProcedure|adminProcedure|passport\.authenticate|Depends\s*\(\s*get_current\w*|login_required|jwt_required)\b/;
/** A failure branch: `if (!session) return/throw/redirect…`, `?? redirect()`, `|| notFound()`, Python `if not user: raise`. */
const ENFORCE =
  /\bif\s*\(?[^\n]*\)?\s*\{?\s*(?:return\b|throw\b|redirect\s*\(|notFound\s*\(|unauthorized\s*\(|forbidden\s*\(|error\s*\(\s*40[13]|abort\s*\(|raise\b)|(?:\?\?|\|\|)\s*(?:redirect|notFound|unauthorized|forbidden)\s*\(|(?:\?\?|\|\|)\s*\(?\s*throw\b|\bif\s+not\s+\w+[^\n]*:\s*\n?\s*raise\b/;

export const sec07UnauthActions = defineRule(
  { id: "SEC-07", pillar: "SECURITY", severity: "CRITICAL", title: "Unauthenticated Server Action or Mutation Route" },
  (ctx, emit) =>
    eachRoute(
      ctx,
      (r) => {
        if (!MUTATING_METHODS.has(r.method) || isWebhookRoute(ctx, r)) return;
        const { ci, a, b, fn } = routeBody(ctx, r);
        const body = ci.slice(a, b, "masked");
        const mut = [DB_MUTATION_RE, PAID_SDK_CALL_RE].map((re) => body.search(re)).filter((i) => i >= 0);
        if (!mut.length) return;
        const firstMut = Math.min(...mut);
        const authIdx = body.search(AUTH_ASSERTION_RE);
        const params = fn ? ci.slice(fn.paramsStart, fn.paramsEnd + 1, "masked") : "";
        // Guard applied outside the body (middleware matcher, withAuth wrapper, FastAPI Depends): trust it.
        if (authIdx < 0 && r.hasAuthGuard) return;
        if (SELF_ENFORCING.test(params) || (fn?.wrapper && SELF_ENFORCING.test(fn.wrapper))) return;

        let problem: string | null = null;
        if (authIdx < 0) problem = "no auth assertion anywhere in the handler";
        else if (authIdx > firstMut) problem = "the auth check runs after the first mutation";
        else {
          const authStmt = body.slice(authIdx, body.indexOf("\n", authIdx) + 1 || undefined);
          const between = ci.slice(a + authIdx, a + firstMut, "noComments");
          if (!SELF_ENFORCING.test(authStmt) && !ENFORCE.test(between)) problem = "the auth result is never checked (no throw/return/redirect on failure)";
        }
        if (!problem) return;
        const pos = a + firstMut;
        const name = r.handlerName ?? r.method;
        emit({
          file: r.file,
          line: ci.lineOf(pos),
          nodeRef: `route:${r.method} ${r.urlPath}`,
          evidence: `${r.method === "SERVER_ACTION" ? `server action ${name}()` : `${r.method} ${r.urlPath}`}: ${problem}\n${ci.snippet(pos, { after: 0 })}`,
          impact: `${r.method === "SERVER_ACTION" ? `Server action \`${name}\` is a public POST endpoint` : `\`${r.method} ${r.urlPath}\` is public`} and it writes data or calls a paid API without enforcing a session (${problem}). Anyone on the internet can invoke it.`,
          agentRemediationPrompt: `In ${r.file}, at the very top of \`${name}\` (line ${ci.lineOf(a)}), call the project's canonical session helper (e.g. \`const session = await auth();\`) and immediately \`if (!session?.user) ${r.method === "SERVER_ACTION" ? 'throw new Error("Unauthorized")' : 'return new Response("Unauthorized", { status: 401 })'};\` before any database or SDK call. Then scope the mutation to \`session.user.id\`.`,
        });
      },
      (f) => sysCheck(f, emit),
    ),
);

/** Go/Rust: same ordering + enforcement questions, answered by the route facts. */
function sysCheck(f: SysRouteFacts, emit: Emit) {
  const r = f.route;
  if (!MUTATING_METHODS.has(r.method) || f.webhook) return;
  const mut = [f.firstMutation, f.paidCall].filter((s) => !!s).sort((a, b) => a.at - b.at)[0];
  if (!mut || (!f.auth && r.hasAuthGuard)) return;
  const problem = !f.auth
    ? "no auth assertion anywhere in the handler"
    : f.auth.at > mut.at
      ? "the auth check runs after the first mutation"
      : !f.auth.enforced
        ? "the auth result is never checked (no early return / abort on failure)"
        : null;
  if (!problem) return;
  const name = r.handlerName ?? "handler";
  emit({
    file: r.file,
    line: mut.line,
    nodeRef: `route:${r.method} ${r.urlPath}`,
    evidence: `${r.method} ${r.urlPath}: ${problem}\n${mut.evidence}`,
    impact: `\`${r.method} ${r.urlPath}\` is public and it writes data or calls a paid API without enforcing a session (${problem}). Anyone on the internet can invoke it.`,
    agentRemediationPrompt:
      r.language === "go"
        ? `In ${r.file}, put \`${r.urlPath}\` behind the project's auth middleware (\`group.Use(AuthRequired())\`), or at the top of \`${name}\` (line ${r.line}) read the user (\`u, ok := c.Get("user")\`) and \`if !ok { c.AbortWithStatus(http.StatusUnauthorized); return }\` before any database or SDK call. Then scope the write to that user's id.`
        : `In ${r.file}, add the project's auth extractor as a parameter of \`${name}\` (line ${r.line}), e.g. \`user: AuthUser\` whose \`FromRequestParts\` rejects with 401, or return \`StatusCode::UNAUTHORIZED\` before any database or SDK call. Then scope the write to \`user.id\`.`,
  });
}
