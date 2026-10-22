import { type SysLang, sysLangOf, sysLangUnavailable } from "../../context/systems-lang";
import type { RepoContext, RouteNode, SgNode } from "../../context/types";
import { RuleSkipped } from "../helpers";

const HANDLER_KINDS: Record<SysLang, string[]> = {
  go: ["function_declaration", "method_declaration", "func_literal"],
  rust: ["function_item", "closure_expression"],
};

/**
 * Route handlers of one language as AST nodes (deduped when several routes share a handler).
 * Throws `RuleSkipped` when the repo has such sources but the grammar can't load, so the engine
 * reports a notice instead of a false clean.
 */
export function sysHandlers(ctx: RepoContext, lang: SysLang): Array<{ route: RouteNode; fn: SgNode }> {
  if (!ctx.files.all.some((f) => sysLangOf(f) === lang)) return [];
  const why = sysLangUnavailable(lang);
  if (why) throw new RuleSkipped(why);
  const seen = new Set<string>();
  const out: Array<{ route: RouteNode; fn: SgNode }> = [];
  for (const route of ctx.routes) {
    const key = `${route.file}:${route.bodyStart}`;
    if (route.language !== lang || seen.has(key)) continue;
    seen.add(key);
    const fn = handlerNode(ctx, route, lang);
    if (fn) out.push({ route, fn });
  }
  return out;
}

/** The handler function node of a Go/Rust route (callers must have checked the grammar). */
export function handlerNode(ctx: RepoContext, route: RouteNode, lang: SysLang): SgNode | undefined {
  const root = ctx.getAst(route.file).root();
  return HANDLER_KINDS[lang].flatMap((kind) => root.findAll({ rule: { kind } })).find((n) => n.range().start.index === route.bodyStart);
}

export const lineOf = (n: SgNode) => n.range().start.line + 1;
export const evidenceOf = (n: SgNode) => n.text().split("\n")[0].trim().slice(0, 160);

/** True when `n` sits inside a node of one of `kinds` that is itself inside `stop` (the handler). */
export function insideKind(n: SgNode, kinds: RegExp, stop: SgNode): boolean {
  const end = stop.range().start.index;
  for (let p = n.parent(); p && p.range().start.index >= end; p = p.parent()) {
    if (p.range().start.index === end && p.kind() === stop.kind()) return false;
    if (kinds.test(p.kind())) return true;
  }
  return false;
}
