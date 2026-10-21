import { AUTH_ASSERTION_RE, DB_MUTATION_RE, PAID_SDK_CALL_RE } from "../../context/patterns";
import { defineRule, isWebhookRoute, MUTATING_METHODS, routeBody, scriptRoutes } from "../helpers";

/** Auth helpers that throw / redirect on failure by convention, so the call itself enforces. */
const SELF_ENFORCING =
  /\b(?:require\w*|auth\.protect|getUserOrThrow|assert\w*|ensureAuth\w*|verifyToken|verifyIdToken|verifyJwt|jwtVerify|jwt\.verify|checkAuth|authorize|withAuth|withApiAuthRequired|protectedProcedure|authedProcedure|privateProcedure|adminProcedure|passport\.authenticate|Depends\s*\(\s*get_current\w*|login_required|jwt_required)\b/;
/** A failure branch: `if (!session) return/throw/redirect…`, `?? redirect()`, `|| notFound()`, Python `if not user: raise`. */
const ENFORCE =
  /\bif\s*\(?[^\n]*\)?\s*\{?\s*(?:return\b|throw\b|redirect\s*\(|notFound\s*\(|unauthorized\s*\(|forbidden\s*\(|error\s*\(\s*40[13]|abort\s*\(|raise\b)|(?:\?\?|\|\|)\s*(?:redirect|notFound|unauthorized|forbidden)\s*\(|(?:\?\?|\|\|)\s*\(?\s*throw\b|\bif\s+not\s+\w+[^\n]*:\s*\n?\s*raise\b/;

export const sec07UnauthActions = defineRule(
  { id: "SEC-07", pillar: "SECURITY", severity: "CRITICAL", title: "Unauthenticated Server Action or Mutation Route" },
  (ctx, emit) => {
    for (const r of scriptRoutes(ctx)) {
      if (!MUTATING_METHODS.has(r.method) || isWebhookRoute(ctx, r)) continue;
      const { ci, a, b, fn } = routeBody(ctx, r);
      const body = ci.slice(a, b, "masked");
      const mut = [DB_MUTATION_RE, PAID_SDK_CALL_RE].map((re) => body.search(re)).filter((i) => i >= 0);
      if (!mut.length) continue;
      const firstMut = Math.min(...mut);
      const authIdx = body.search(AUTH_ASSERTION_RE);
      const params = fn ? ci.slice(fn.paramsStart, fn.paramsEnd + 1, "masked") : "";
      // Guard applied outside the body (middleware matcher, withAuth wrapper, FastAPI Depends): trust it.
      if (authIdx < 0 && r.hasAuthGuard) continue;
      if (SELF_ENFORCING.test(params) || (fn?.wrapper && SELF_ENFORCING.test(fn.wrapper))) continue;

      let problem: string | null = null;
      if (authIdx < 0) problem = "no auth assertion anywhere in the handler";
      else if (authIdx > firstMut) problem = "the auth check runs after the first mutation";
      else {
        const authStmt = body.slice(authIdx, body.indexOf("\n", authIdx) + 1 || undefined);
        const between = ci.slice(a + authIdx, a + firstMut, "noComments");
        if (!SELF_ENFORCING.test(authStmt) && !ENFORCE.test(between)) problem = "the auth result is never checked (no throw/return/redirect on failure)";
      }
      if (!problem) continue;
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
    }
  },
);
