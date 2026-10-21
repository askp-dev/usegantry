import type { CallSite, CodeIndex, FnInfo } from "../../context/code-index";
import type { RepoContext } from "../../context/types";

const PY_TEST_RE = /(?:^|\/)(?:tests?|__tests__)\/|(?:^|\/)(?:test_[^/]*|[^/]*_test|conftest)\.py$/;

/** Non-test Python files whose raw text matches `prefilter` (cheap gate before lexing). */
export function pyFiles(ctx: RepoContext, prefilter: RegExp): string[] {
  return ctx.files.all.filter((f) => f.endsWith(".py") && !PY_TEST_RE.test(f) && prefilter.test(ctx.getText(f)));
}

const bindingCache = new WeakMap<CodeIndex, Map<string, string>>();

/**
 * Local name → fully qualified name, from `import a.b as x`, `import a.b`, `from a.b import c as d`.
 * Unlike `CodeIndex.imports()`, aliases are kept, so `import pickle as pk; pk.loads()` resolves.
 */
export function pyBindings(ci: CodeIndex): Map<string, string> {
  let out = bindingCache.get(ci);
  if (out) return out;
  out = new Map();
  for (const m of ci.findAll(/^[ \t]*import[ \t]+([\w. \t,]+)/gm, "noComments"))
    for (const part of m[1].split(",")) {
      const [mod, alias] = part.trim().split(/\s+as\s+/);
      if (mod) out.set(alias ?? mod.split(".")[0], alias ? mod : mod.split(".")[0]);
    }
  for (const m of ci.findAll(/^[ \t]*from[ \t]+([\w.]+)[ \t]+import[ \t]+(?:\(([\w\s,]+)\)|([\w \t,]+))/gm, "noComments"))
    for (const part of (m[2] ?? m[3]).split(",")) {
      const [name, alias] = part.trim().split(/\s+as\s+/);
      if (name) out.set(alias ?? name, `${m[1]}.${name}`);
    }
  bindingCache.set(ci, out);
  return out;
}

/** `pk.loads` → `pickle.loads` when `import pickle as pk`; unknown heads are returned as written. */
export function qualify(ci: CodeIndex, callee: string): string {
  const name = callee.replace(/\s+/g, "");
  const dot = name.indexOf(".");
  const head = dot === -1 ? name : name.slice(0, dot);
  const q = pyBindings(ci).get(head);
  return q ? q + (dot === -1 ? "" : name.slice(dot)) : name;
}

/** Calls whose qualified callee matches `target` (anchored by the caller), in [from, to). */
export function pyCalls(ci: CodeIndex, target: RegExp, from = 0, to?: number): Array<CallSite & { qname: string }> {
  return ci
    .calls(/(?<![\w.])[A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)*/, from, to)
    .map((c) => ({ ...c, qname: qualify(ci, c.callee) }))
    .filter((c) => target.test(c.qname));
}

/** Keyword argument value text (`weights_only=True` → `True`) at the call's top level, or undefined. */
export function kwarg(ci: CodeIndex, call: CallSite, name: string): string | undefined {
  for (const [a, b] of ci.args(call)) {
    const m = ci.slice(a, b, "noComments").match(new RegExp(`^${name}\\s*=\\s*([\\s\\S]+)$`));
    if (m) return m[1].trim();
  }
  return undefined;
}

const ROUTE_DECORATOR_RE = /^@[\w.]+\.(?:get|post|put|patch|delete|options|head|route|api_route|websocket)\s*\(/;
export const isRouteHandler = (fn: FnInfo) => (fn.decorators ?? []).some((d) => ROUTE_DECORATOR_RE.test(d));

/** Imports a web / chat-UI framework, so code in the file serves untrusted users. */
const WEB_FRAMEWORK_RE = /^(?:fastapi|starlette|flask|quart|django|sanic|litestar|aiohttp|streamlit|gradio|chainlit|slack_bolt|discord|telegram)\b/;
export const servesUsers = (ci: CodeIndex) => [...pyBindings(ci).values()].some((q) => WEB_FRAMEWORK_RE.test(q));
