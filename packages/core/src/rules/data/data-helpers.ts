/** Shared plumbing for VEC-* / CACHE-* rules over `ctx.dataQueries`. */
import type { CodeIndex } from "../../context/code-index";
import { AUTH_ASSERTION_RE } from "../../context/patterns";
import type { DataQuery, RepoContext } from "../../context/types";

const AUTH_DEPS =
  /^(?:next-auth|@auth\/[\w-]+|@clerk\/[\w-]+|@supabase\/ssr|@supabase\/auth-helpers-[\w-]+|lucia|better-auth|@kinde-oss\/[\w-]+|@workos-inc\/[\w-]+|firebase-admin|passport|express-session|iron-session|fastapi-users|flask-login|django|djangorestframework|authlib|python-jose|pyjwt)$/;
const multiUser = new WeakMap<RepoContext, boolean>();

/** Does the app have end users at all (an auth library, Supabase, or a guarded route/middleware)? */
export function isMultiUser(ctx: RepoContext): boolean {
  let v = multiUser.get(ctx);
  if (v === undefined) {
    v =
      ctx.stack.supabase ||
      [...ctx.dependencies.values()].some((d) => d.isDirect && AUTH_DEPS.test(d.name)) ||
      ctx.routes.some((r) => r.hasAuthGuard) ||
      !!(ctx as any).middleware;
    multiUser.set(ctx, v);
  }
  return v;
}

/** Is `pos` inside an auth-guarded route, or inside a function that asserts a session? */
export function isAuthedAt(ctx: RepoContext, ci: CodeIndex, file: string, pos: number): boolean {
  if (ctx.routes.some((r) => r.file === file && r.hasAuthGuard && (r.bodyStart ?? 0) <= pos && pos <= (r.bodyEnd ?? Infinity))) return true;
  const fn = ci.outerFunction(pos) ?? ci.enclosingFunction(pos);
  return !!fn && AUTH_ASSERTION_RE.test(ci.slice(fn.bodyStart, fn.bodyEnd, "masked"));
}

/**
 * The call's arguments (noComments) plus its receiver chain (`index.namespace(orgId).query`). Bare identifiers
 * passed as an argument or object value (`query(opts)`, `{ filter }`) are widened back to their last assignment
 * in the same function, so a filter built a few lines earlier still counts.
 */
export function callText(ci: CodeIndex, q: DataQuery): string {
  const span = ci.slice(q.start, q.closeParen + 1, "noComments");
  const masked = ci.slice(q.openParen, q.closeParen + 1, "masked");
  const fn = ci.enclosingFunction(q.start);
  const from = fn?.bodyStart ?? 0;
  const before = ci.masked.slice(from, q.start);
  const extra: string[] = [];
  for (const m of masked.matchAll(/(?:^|[(,{:])\s*([A-Za-z_$][\w$]*)\s*(?=[,)}])/g)) {
    const at = [...before.matchAll(new RegExp(`(?<![\\w$.])${m[1].replace(/\$/g, "\\$")}\\s*(?::[^=;\\n]*)?=(?![=>])`, "g"))].pop();
    if (at) extra.push(ci.slice(from + at.index, q.start, "noComments"));
  }
  return [span, ...extra].join("\n");
}

/** First argument as written (noComments), trimmed. */
export function firstArg(ci: CodeIndex, q: DataQuery): string {
  const a = ci.splitTopLevel(q.openParen + 1, q.closeParen)[0];
  return a ? ci.slice(a[0], a[1], "noComments").trim() : "";
}

/** A cache key with no interpolation: `"stats"`, `'stats'`, `` `stats` ``. Python f-strings and concatenation are dynamic. */
export const isConstantKey = (k: string) => /^(['"])[^'"\n]*\1$/.test(k) || /^`[^`$]*`$/.test(k);
