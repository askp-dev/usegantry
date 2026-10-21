import { defineRule } from "../helpers";
import { evidenceOf, insideKind, lineOf, sysHandlers } from "./sys-helpers";

/** Request-scoped context per framework, matched against the handler's parameter list. */
const REQUEST_CTX: Array<[RegExp, (p: string) => string]> = [
  [/(\w+)\s+\*gin\.Context/, (p) => `${p}.Request.Context()`],
  [/(\w+)\s+echo\.Context/, (p) => `${p}.Request().Context()`],
  [/(\w+)\s+\*fiber\.Ctx/, (p) => `${p}.UserContext()`],
  [/(\w+)\s+\*http\.Request/, (p) => `${p}.Context()`],
];

export const sys03DetachedContext = defineRule(
  { id: "SYS-03", pillar: "FINOPS_OPS", severity: "HIGH", title: "context.Background() in a Go Handler That Has a Request Context", scope: "repo" },
  (ctx, emit) => {
    for (const { route, fn } of sysHandlers(ctx, "go")) {
      const params = fn.field("parameters")?.text() ?? "";
      const hit = REQUEST_CTX.map(([re, expr]) => {
        const m = params.match(re);
        return m ? expr(m[1]) : null;
      }).find(Boolean);
      if (!hit) continue;
      for (const call of fn.findAll({ rule: { kind: "call_expression" } })) {
        const name = call.field("function")?.text();
        if (name !== "context.Background" && name !== "context.TODO") continue;
        // Detached background work legitimately outlives the request.
        if (insideKind(call, /^go_statement$/, fn)) continue;
        emit({
          file: route.file,
          line: lineOf(call),
          nodeRef: `route:${route.method} ${route.urlPath}`,
          evidence: evidenceOf(call.parent()?.parent() ?? call),
          impact: `The ${route.method} ${route.urlPath} handler uses \`${name}()\` instead of the request context (\`${hit}\`). DB queries and outbound HTTP calls keep running after the client disconnects or the server's timeout fires, so slow queries pile up, connection pools drain, and retries from impatient clients multiply load. Request-scoped deadlines, cancellation and tracing values are lost.`,
          agentRemediationPrompt: `In ${route.file}:${lineOf(call)}, replace \`${name}()\` with \`${hit}\` (wrap it in \`context.WithTimeout(${hit}, …)\` if you need a tighter deadline) and pass it to every \`QueryContext\`/\`ExecContext\`/\`http.NewRequestWithContext\` call. Use \`context.WithoutCancel(${hit})\` only for work that must finish after the response, inside a bounded worker.`,
        });
      }
    }
  },
);
