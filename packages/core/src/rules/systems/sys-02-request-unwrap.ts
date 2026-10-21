import type { SgNode } from "../../context/types";
import { defineRule } from "../helpers";
import { evidenceOf, lineOf, sysHandlers } from "./sys-helpers";

/** Extractors holding server state, not request data. */
const STATE_EXTRACTOR = /^(?:[\w:]*::)?(?:State|Extension|Data)\s*</;

/** Identifiers bound by a pattern (`Json(p)`, `Path((a, b))`, `mut x`); a tuple-struct pattern's own type name is skipped. */
function boundNames(pattern: SgNode | null): string[] {
  if (!pattern) return [];
  const typeName = pattern.kind() === "tuple_struct_pattern" ? pattern.field("type") : null;
  const ids = pattern.kind() === "identifier" ? [pattern] : pattern.findAll({ rule: { kind: "identifier" } });
  return ids.filter((n) => !typeName || n.range().start.index !== typeName.range().start.index).map((n) => n.text());
}

export const sys02RequestUnwrap = defineRule(
  { id: "SYS-02", pillar: "SECURITY", severity: "HIGH", title: "Panic on Request-Derived Value (.unwrap()/.expect() in Axum/Actix Handler)", scope: "repo" },
  (ctx, emit) => {
    for (const { route, fn } of sysHandlers(ctx, "rust")) {
      const tainted = new Set<string>();
      const params =
        fn
          .field("parameters")
          ?.children()
          .filter((p) => p.isNamed()) ?? [];
      for (const p of params) {
        if (p.kind() === "self_parameter" || STATE_EXTRACTOR.test(p.field("type")?.text() ?? "")) continue;
        for (const n of boundNames(p.kind() === "identifier" ? p : p.field("pattern"))) tainted.add(n);
      }
      if (!tainted.size) continue;
      const mentions = (text: string) => [...tainted].some((t) => new RegExp(`\\b${t}\\b`).test(text));
      // One forward pass: `let x = <expr using a tainted name>` taints x (also `if let` / `while let`).
      for (const l of fn.findAll({ rule: { any: [{ kind: "let_declaration" }, { kind: "let_condition" }] } }))
        if (mentions(l.field("value")?.text() ?? "")) for (const n of boundNames(l.field("pattern"))) tainted.add(n);

      const reported = new Set<number>();
      for (const call of fn.findAll({ rule: { kind: "call_expression" } })) {
        const f = call.field("function");
        const method = f?.kind() === "field_expression" ? f.field("field")?.text() : undefined;
        if (method !== "unwrap" && method !== "expect") continue;
        const recv = f?.field("value")?.text() ?? "";
        if (!mentions(recv) || reported.has(lineOf(call))) continue;
        reported.add(lineOf(call)); // chained `.unwrap().to_str().unwrap()` → one finding
        emit({
          file: route.file,
          line: lineOf(call),
          nodeRef: `route:${route.method} ${route.urlPath}`,
          evidence: evidenceOf(call),
          impact: `\`.${method}()\` on a value derived from the request in the ${route.method} ${route.urlPath} handler panics on malformed input (bad id, missing header, invalid JSON field). Any client can trigger it: the connection is dropped with no response, a held \`Mutex\` is poisoned for every later request, and with \`panic = "abort"\` the whole server process dies (remote DoS).`,
          agentRemediationPrompt: `In ${route.file}:${lineOf(call)}, replace \`.${method}(…)\` with \`?\` and return a client error: map the failure to \`(StatusCode::BAD_REQUEST, msg)\` (Axum, via an \`AppError: IntoResponse\`) or \`actix_web::error::ErrorBadRequest\` (Actix), e.g. \`.ok_or(AppError::BadRequest("id"))?\` / \`.map_err(|_| ErrorBadRequest("invalid id"))?\`. Prefer typed extractors (\`Path<u64>\`, \`Json<T>\`) so invalid input is rejected before the handler runs.`,
        });
      }
    }
  },
);
