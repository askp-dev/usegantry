/**
 * Route & server-action extraction for Next.js (app + pages router), SvelteKit, Express/Hono/
 * Fastify-style routers, and FastAPI/Flask. Produces RouteNode[] with auth / rate-limit /
 * webhook-verification flags, DB tables touched and external SDKs called.
 */
import type { CodeIndex, FnInfo } from "./code-index";
import { vendorForPackage } from "./knowledge";
import { AUTH_ASSERTION_RE, RATE_LIMIT_RE, WEBHOOK_VERIFY_RE } from "./patterns";
import type { HttpMethod, RouteNode } from "./types";

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export interface RouteExtractionInput {
  files: string[];
  getCode: (rel: string) => CodeIndex;
  hasFile: (rel: string) => boolean;
  prismaModels: Map<string, string>; // accessor -> table
  drizzleVars: Map<string, string>; // variable -> table
}

export interface MiddlewareGuard {
  file: string;
  all: boolean;
  include: RegExp[];
  exclude: RegExp[];
  rateLimited: boolean;
}

/** Convert Next/Clerk matcher strings to regexes (approximate path-to-regexp). */
function matcherToRegex(p: string): RegExp {
  if (p.includes("(?!")) return /.*/; // negative-lookahead catch-alls
  const src = p
    .replace(/[.+^${}|[\]\\]/g, (c) => (c === "(" || c === ")" ? c : "\\" + c))
    .replace(/\/:\w+\*/g, "(?:/.*)?")
    .replace(/\/:\w+\+/g, "/.+")
    .replace(/:\w+/g, "[^/]+")
    .replace(/\(\.\*\)/g, ".*");
  try {
    return new RegExp("^" + src + "$");
  } catch {
    return /.*/;
  }
}

export function detectMiddlewareGuard(input: RouteExtractionInput): MiddlewareGuard | null {
  const cands = ["middleware.ts", "middleware.js", "src/middleware.ts", "src/middleware.js", "src/hooks.server.ts", "src/hooks.server.js"];
  for (const f of cands) {
    if (!input.hasFile(f)) continue;
    const ci = input.getCode(f);
    const m = ci.masked;
    const nc = ci.noComments;
    const enforces =
      /\bprotect\s*\(|NextResponse\.redirect|redirect\s*\(|status\s*:\s*40[13]|new\s+Response\s*\([^)]*40[13]|withAuth\b|error\s*\(\s*40[13]|throw\s+redirect/.test(m) || /next-auth\/middleware/.test(nc);
    const authy = AUTH_ASSERTION_RE.test(m) || /clerkMiddleware|authMiddleware|next-auth\/middleware|updateSession|createServerClient|withAuth|getToken/.test(nc);
    if (!(enforces && authy)) continue;
    const g: MiddlewareGuard = { file: f, all: false, include: [], exclude: [], rateLimited: RATE_LIMIT_RE.test(m) };
    // createRouteMatcher([...]) for protected / public routes
    const protectedM = nc.match(/(?:isProtectedRoute|protectedRoutes?)\s*=\s*createRouteMatcher\(\s*\[([^\]]*)\]/);
    const publicM = nc.match(/(?:isPublicRoute|publicRoutes?)\s*=\s*createRouteMatcher\(\s*\[([^\]]*)\]/);
    const strs = (s: string) => [...s.matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]);
    if (protectedM) g.include.push(...strs(protectedM[1]).map(matcherToRegex));
    else if (publicM) {
      g.all = true;
      g.exclude.push(...strs(publicM[1]).map(matcherToRegex));
    } else {
      // pathname.startsWith('/api') checks in hooks / middleware
      const starts = [...nc.matchAll(/pathname\.startsWith\(\s*['"]([^'"]+)['"]\s*\)/g)].map((x) => x[1]);
      if (starts.length) g.include.push(...starts.map((s) => new RegExp("^" + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
      else g.all = true;
    }
    // config.matcher narrows everything
    const matcher = nc.match(/matcher\s*:\s*(\[[^\]]*\]|['"][^'"]+['"])/);
    if (matcher) {
      const ms = strs(matcher[1]);
      if (ms.length && !ms.some((x) => x.includes("(?!"))) {
        const mr = ms.map(matcherToRegex);
        if (g.all) {
          g.all = false;
          g.include.push(...mr);
        } else g.include = g.include.filter((r) => mr.some(() => true));
      }
    }
    return g;
  }
  return null;
}

export function guardCovers(g: MiddlewareGuard | null, url: string): boolean {
  if (!g) return false;
  if (g.exclude.some((r) => r.test(url))) return false;
  if (g.all) return true;
  return g.include.some((r) => r.test(url));
}

function nextAppUrl(rel: string): string {
  let p = rel.replace(/^src\//, "").replace(/^app\//, "/");
  p = p.replace(/\/route\.(m?[tj]sx?)$/, "").replace(/\/page\.(m?[tj]sx?)$/, "");
  p = p
    .split("/")
    .filter((seg) => !/^\(.*\)$/.test(seg) && !seg.startsWith("@"))
    .join("/");
  return p === "" ? "/" : p.startsWith("/") ? p : "/" + p;
}
function nextPagesApiUrl(rel: string): string {
  let p = rel.replace(/^src\//, "").replace(/^pages/, "").replace(/\.(m?[tj]sx?)$/, "");
  p = p.replace(/\/index$/, "");
  return p || "/";
}
function svelteKitUrl(rel: string): string {
  let p = rel.replace(/^src\/routes/, "").replace(/\/\+(server|page\.server|layout\.server)\.(m?[tj]s)$/, "");
  p = p
    .split("/")
    .filter((seg) => !/^\(.*\)$/.test(seg))
    .join("/");
  return p || "/";
}

export function classifyRouteFile(rel: string): "next-app-route" | "next-pages-api" | "sveltekit-server" | "sveltekit-page-server" | null {
  if (/(^|\/)app\/(.+\/)?route\.(m?[tj]sx?)$/.test(rel)) return "next-app-route";
  if (/(^|\/)pages\/api\/.+\.(m?[tj]sx?)$/.test(rel)) return "next-pages-api";
  if (/(^|\/)src\/routes\/(.+\/)?\+server\.(m?[tj]s)$/.test(rel)) return "sveltekit-server";
  if (/(^|\/)src\/routes\/(.+\/)?\+(page|layout)\.server\.(m?[tj]s)$/.test(rel)) return "sveltekit-page-server";
  return null;
}

/** Resolve a local import specifier to a repo-relative file. */
export function resolveLocalImport(fromRel: string, spec: string, hasFile: (r: string) => boolean): string | null {
  let base: string | null = null;
  if (spec.startsWith("./") || spec.startsWith("../")) {
    const dir = fromRel.split("/").slice(0, -1);
    for (const part of spec.split("/")) {
      if (part === ".") continue;
      if (part === "..") dir.pop();
      else dir.push(part);
    }
    base = dir.join("/");
  } else if (spec.startsWith("@/") || spec.startsWith("~/")) {
    for (const prefix of ["src/", "", "app/"]) {
      const b = prefix + spec.slice(2);
      if (tryExt(b, hasFile)) return tryExt(b, hasFile);
    }
    return null;
  } else if (spec.startsWith("$lib/")) base = "src/lib/" + spec.slice(5);
  else return null;
  return tryExt(base, hasFile);
}
function tryExt(base: string, hasFile: (r: string) => boolean): string | null {
  if (hasFile(base)) return base;
  for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".svelte.ts", "/index.ts", "/index.tsx", "/index.js"]) if (hasFile(base + ext)) return base + ext;
  return null;
}

/** Vendor ids reachable from a file's imports (one hop through local modules). */
export function vendorsForFile(rel: string, input: RouteExtractionInput, memo = new Map<string, Set<string>>(), depth = 0): Set<string> {
  if (memo.has(rel)) return memo.get(rel)!;
  const out = new Set<string>();
  memo.set(rel, out);
  const ci = input.getCode(rel);
  for (const imp of ci.imports()) {
    if (imp.typeOnly) continue;
    const eco = ci.lang === "py" ? "pypi" : "npm";
    const pkgName = eco === "pypi" ? imp.source.split(".")[0].replace(/_/g, "-") : imp.source.startsWith("@") ? imp.source.split("/").slice(0, 2).join("/") : imp.source.split("/")[0];
    const v = vendorForPackage(imp.source, eco) ?? vendorForPackage(pkgName, eco);
    if (v) out.add(v.id);
    else if (depth < 2) {
      const local = resolveLocalImport(rel, imp.source, input.hasFile);
      if (local) for (const id of vendorsForFile(local, input, memo, depth + 1)) out.add(id);
    }
  }
  return out;
}

export function tablesAccessed(ci: CodeIndex, a: number, b: number, input: RouteExtractionInput): string[] {
  const out = new Set<string>();
  const body = ci.masked.slice(a, b);
  const nc = ci.noComments.slice(a, b);
  for (const m of body.matchAll(/\b(?:prisma|db|tx|ctx\.db|ctx\.prisma)\.([a-z]\w*)\.\w+\s*\(/g)) {
    const t = input.prismaModels.get(m[1]);
    if (t) out.add(t);
  }
  for (const m of nc.matchAll(/\.from\(\s*['"`]([\w.]+)['"`]\s*\)/g)) out.add(m[1].split(".").pop()!);
  for (const m of body.matchAll(/\b(?:db|tx)\.(?:insert|update|delete)\(\s*([\w$]+)\s*\)|\.from\(\s*([\w$]+)\s*\)|db\.query\.([\w$]+)\./g)) {
    const v = m[1] ?? m[2] ?? m[3];
    const t = input.drizzleVars.get(v);
    if (t) out.add(t);
  }
  for (const m of body.matchAll(/\b(?:session|db)\.query\(\s*([A-Z]\w*)\s*\)/g)) out.add(m[1].toLowerCase());
  return [...out];
}

function makeRoute(rel: string, ci: CodeIndex, fn: FnInfo, method: HttpMethod, urlPath: string, input: RouteExtractionInput, vendorIds: Set<string>, extraGuardText = ""): RouteNode {
  const body = ci.masked.slice(fn.paramsStart, fn.bodyEnd + 1);
  const bodyNc = ci.noComments.slice(fn.bodyStart, fn.bodyEnd + 1);
  const usedVendors = [...vendorIds].filter(() => true);
  return {
    file: rel,
    line: fn.line,
    urlPath,
    method,
    hasAuthGuard: AUTH_ASSERTION_RE.test(body) || (!!fn.wrapper && /auth|protect|session|user/i.test(fn.wrapper)) || AUTH_ASSERTION_RE.test(extraGuardText),
    hasRateLimit: RATE_LIMIT_RE.test(body) || RATE_LIMIT_RE.test(extraGuardText) || (!!fn.wrapper && /rate|limit|throttle/i.test(fn.wrapper)),
    hasWebhookVerification: WEBHOOK_VERIFY_RE.test(bodyNc),
    dbTablesAccessed: tablesAccessed(ci, fn.bodyStart, fn.bodyEnd + 1, input),
    externalSdksCalled: usedVendors,
    handlerName: fn.name ?? undefined,
    bodyStart: fn.bodyStart,
    bodyEnd: fn.bodyEnd,
    language: ci.lang === "py" ? "py" : "ts",
  };
}

export function extractRoutes(input: RouteExtractionInput): { routes: RouteNode[]; middleware: MiddlewareGuard | null } {
  const routes: RouteNode[] = [];
  const middleware = detectMiddlewareGuard(input);
  const vendorMemo = new Map<string, Set<string>>();

  for (const rel of input.files) {
    const kind = classifyRouteFile(rel);
    let ci: CodeIndex;
    try {
      ci = input.getCode(rel);
    } catch {
      continue;
    }
    if (ci.lang !== "js" && ci.lang !== "py") continue;
    const fns = ci.functions();
    const vendors = () => vendorsForFile(rel, input, vendorMemo);

    if (kind === "next-app-route" || kind === "sveltekit-server") {
      const url = kind === "next-app-route" ? nextAppUrl(rel) : svelteKitUrl(rel);
      for (const fn of fns) {
        if (!fn.exported || !fn.name || !HTTP_METHODS.has(fn.name)) continue;
        const r = makeRoute(rel, ci, fn, fn.name as HttpMethod, url, input, vendors());
        if (!r.hasAuthGuard && guardCovers(middleware, url)) r.hasAuthGuard = true;
        if (!r.hasRateLimit && middleware?.rateLimited && guardCovers(middleware, url)) r.hasRateLimit = true;
        routes.push(r);
      }
      // `export const { GET, POST } = handlers` (next-auth) — skip; `export { handler as GET, handler as POST }`
      for (const m of ci.findAll(/export\s*\{([^}]*)\}/g)) {
        for (const part of m[1].split(",")) {
          const [local, exported] = part.trim().split(/\s+as\s+/).map((x) => x?.trim());
          if (!exported || !HTTP_METHODS.has(exported)) continue;
          const fn = fns.find((f) => f.name === local);
          if (fn) routes.push(makeRoute(rel, ci, fn, exported as HttpMethod, url, input, vendors()));
        }
      }
      continue;
    }

    if (kind === "next-pages-api") {
      const url = nextPagesApiUrl(rel);
      const fn = fns.find((f) => f.isDefaultExport) ?? fns.find((f) => f.exported);
      if (!fn) continue;
      const body = ci.noComments.slice(fn.bodyStart, fn.bodyEnd);
      const methods = [...new Set([...body.matchAll(/method\s*[!=]==?\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/g)].map((x) => x[1]))];
      const ms: HttpMethod[] = methods.length ? (methods as HttpMethod[]) : /req\.body|create\(|update\(|insert\(|delete\(/.test(body) ? ["POST"] : ["GET"];
      for (const meth of ms) {
        const r = makeRoute(rel, ci, fn, meth, url, input, vendors());
        if (!r.hasAuthGuard && guardCovers(middleware, url)) r.hasAuthGuard = true;
        routes.push(r);
      }
      continue;
    }

    if (kind === "sveltekit-page-server") {
      const url = svelteKitUrl(rel);
      const am = ci.findAll(/export\s+const\s+actions\s*(?::\s*[\w.<>]+\s*)?=\s*\{/g)[0];
      if (am) {
        const open = am.index + am[0].length - 1;
        for (const e of ci.objectEntries(open)) {
          const fn = fns.find((f) => f.bodyStart >= e.start && f.bodyStart <= e.end);
          if (fn) {
            const r = makeRoute(rel, ci, { ...fn, name: e.key }, "SERVER_ACTION", `${url}?/${e.key}`, input, vendors());
            if (!r.hasAuthGuard && guardCovers(middleware, url)) r.hasAuthGuard = true;
            routes.push(r);
          }
        }
      }
      const load = fns.find((f) => f.exported && f.name === "load");
      if (load) {
        const r = makeRoute(rel, ci, load, "GET", url, input, vendors());
        if (!r.hasAuthGuard && guardCovers(middleware, url)) r.hasAuthGuard = true;
        routes.push(r);
      }
      continue;
    }

    // Next.js server actions: top-level "use server" files or inline directives
    if (ci.lang === "js" && ci.text.includes("use server")) {
      const fileLevel = ci.hasTopDirective("use server");
      for (const fn of fns) {
        const inline = !fn.expressionBody && ci.bodyHasDirective(fn.bodyStart, "use server");
        if (!(inline || (fileLevel && fn.exported && fn.name))) continue;
        const r = makeRoute(rel, ci, fn, "SERVER_ACTION", `action:${fn.name ?? "anonymous"}`, input, vendors());
        routes.push(r);
      }
      continue;
    }

    // Express / Hono / Fastify style: app.post("/x", mw, handler)
    if (ci.lang === "js" && /\b(app|router|server|api|route|\w+Router)\s*\.\s*(get|post|put|patch|delete|all)\s*\(/.test(ci.masked)) {
      const fileUseGuards: Array<{ pos: number; prefix: string }> = [];
      for (const call of ci.calls(/\b(?:app|router|server|api|\w+Router)\s*\.\s*use/)) {
        const argText = ci.masked.slice(call.openParen, call.closeParen);
        if (AUTH_ASSERTION_RE.test(argText) || /auth|requireUser|protect|session|jwt|passport/i.test(argText)) {
          const prefix = ci.noComments.slice(call.openParen + 1, call.closeParen).match(/^\s*['"]([^'"]+)['"]/)?.[1] ?? "";
          fileUseGuards.push({ pos: call.start, prefix });
        }
      }
      const rateUse = ci.calls(/\b(?:app|router|server)\s*\.\s*use/).some((c) => RATE_LIMIT_RE.test(ci.masked.slice(c.openParen, c.closeParen)) || /limiter|rateLimit/i.test(ci.masked.slice(c.openParen, c.closeParen)));
      for (const call of ci.calls(/\b(?:app|router|server|api|route|\w+Router)\s*\.\s*(?:get|post|put|patch|delete|all)/)) {
        const method = call.callee.split(".").pop()!.trim().toUpperCase();
        const args = ci.args(call);
        if (!args.length) continue;
        const pathLit = ci.noComments.slice(args[0][0], args[0][1]).match(/^['"`]([^'"`]+)['"`]$/)?.[1];
        if (!pathLit) continue;
        const last = args[args.length - 1];
        let fn = fns.find((f) => f.paramsStart >= last[0] && f.paramsStart <= last[1]);
        if (!fn) {
          const ident = ci.masked.slice(last[0], last[1]).trim();
          fn = fns.find((f) => f.name === ident);
        }
        if (!fn) continue;
        const mwText = args.slice(1, -1).map(([a, b]) => ci.masked.slice(a, b)).join(" ");
        const guarded = fileUseGuards.some((g) => g.pos < call.start && (!g.prefix || pathLit.startsWith(g.prefix)));
        const r = makeRoute(rel, ci, fn, (method === "ALL" ? "POST" : method) as HttpMethod, pathLit, input, vendors(), mwText);
        if (guarded || /auth|protect|requireUser|session|jwt|passport/i.test(mwText)) r.hasAuthGuard = true;
        if (rateUse || /limit|throttle/i.test(mwText)) r.hasRateLimit = true;
        r.line = call.line;
        routes.push(r);
      }
      continue;
    }

    // FastAPI / Flask
    if (ci.lang === "py") {
      for (const fn of fns) {
        const dec = (fn.decorators ?? []).find((d) => /^@\w+\.(get|post|put|patch|delete|route|api_route)\s*\(/.test(d));
        if (!dec) continue;
        const dm = dec.match(/^@\w+\.(get|post|put|patch|delete|route|api_route)\s*\(\s*['"]([^'"]*)['"]/);
        if (!dm) continue;
        let methods: string[] = [dm[1].toUpperCase()];
        if (dm[1] === "route" || dm[1] === "api_route") {
          const mm = dec.match(/methods\s*=\s*\[([^\]]*)\]/);
          methods = mm ? [...mm[1].matchAll(/['"](\w+)['"]/g)].map((x) => x[1].toUpperCase()) : ["GET"];
        }
        const params = ci.masked.slice(fn.paramsStart, fn.paramsEnd + 1);
        const decText = (fn.decorators ?? []).join(" ");
        for (const meth of methods) {
          if (!HTTP_METHODS.has(meth)) continue;
          const r = makeRoute(rel, ci, fn, meth as HttpMethod, dm[2], input, vendors(), decText);
          if (/Depends\s*\(\s*(get_current\w*|current_user|auth\w*|require\w*|verify\w*)|Security\s*\(/.test(params) || /login_required|jwt_required|requires_auth|auth_required/.test(decText)) r.hasAuthGuard = true;
          if (/@limiter\.limit|RateLimiter|rate_limit/.test(decText)) r.hasRateLimit = true;
          routes.push(r);
        }
      }
    }
  }
  return { routes, middleware };
}
