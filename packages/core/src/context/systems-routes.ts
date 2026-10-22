/**
 * Go (Gin / Echo / Fiber / chi / net/http) and Rust (Axum / Actix) route extraction on ast-grep.
 * `bodyStart`/`bodyEnd` span the whole handler function (params included) so rules can read the
 * request parameter, and `file`/`line` point at the handler, which may live in another file.
 */
import { vendorForPackage } from "./knowledge";
import type { SysLang } from "./systems-lang";
import type { HttpMethod, RouteNode, SgNode, SgRoot } from "./types";

const GO_VERB = /^(GET|POST|PUT|PATCH|DELETE|Get|Post|Put|Patch|Delete|Any|All|Handle|HandleFunc)$/;
const RUST_VERB = /^(get|post|put|patch|delete|any)$/;
/** Middleware / extractor names that suggest an auth or rate-limit guard on the route. */
const AUTH_MW = /auth|jwt|session|protect|require_?user|guard|bearer|login/i;
// Not bare "limit": `DefaultBodyLimit` / `ConcurrencyLimitLayer` cap size or concurrency, not request rate.
const RATE_MW = /rate.?limit|throttl|governor|limiter|tollbooth|httprate/i;
const SQL_RE = /^\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH|UPSERT|MERGE|REPLACE)\b/i;
export const STRING_KINDS: Record<SysLang, string[]> = {
  go: ["interpreted_string_literal", "raw_string_literal"],
  rust: ["string_literal", "raw_string_literal"],
};

interface Handler {
  file: string;
  node: SgNode;
}

export const unquote = (s: string) => s.replace(/^r?#*"|"#*$|^`|`$/g, "");
const toMethod = (verb: string): HttpMethod => {
  const v = verb.toUpperCase();
  return v === "POST" || v === "PUT" || v === "PATCH" || v === "DELETE" || v === "GET" ? v : "GET";
};
const joinPath = (prefix: string, p: string) => (prefix + (p.startsWith("/") || !p ? p : `/${p}`)).replace(/\/{2,}/g, "/") || "/";

export function extractSystemsRoutes(files: Array<{ rel: string; lang: SysLang }>, getAst: (rel: string) => SgRoot): RouteNode[] {
  const routes: RouteNode[] = [];
  const roots = files.map((f) => ({ ...f, root: getAst(f.rel).root() }));
  const vendorsOf = new Map<string, string[]>();
  const fileVendors = (file: string) => {
    if (!vendorsOf.has(file)) {
      const f = roots.find((r) => r.rel === file);
      vendorsOf.set(file, f ? importedVendors(f.lang, f.root) : []);
    }
    return vendorsOf.get(file) ?? [];
  };
  // name → declarations across files of the same language (handlers are often in a `handlers/` package)
  const decls = new Map<string, Handler[]>();
  const declIndex = (lang: SysLang) => {
    const key = `#${lang}`;
    if (!decls.has(key)) {
      decls.set(key, []);
      const kinds = lang === "go" ? ["function_declaration", "method_declaration"] : ["function_item"];
      for (const f of roots.filter((r) => r.lang === lang))
        for (const kind of kinds)
          for (const n of f.root.findAll({ rule: { kind } })) {
            const name = n.field("name")?.text();
            if (!name) continue;
            const k = `${lang}:${name}`;
            decls.set(k, [...(decls.get(k) ?? []), { file: f.rel, node: n }]);
          }
    }
  };
  const resolve = (lang: SysLang, file: string, ref: SgNode): Handler | null => {
    if (ref.kind() === "func_literal" || ref.kind() === "closure_expression") return { file, node: ref };
    declIndex(lang);
    const name = ref.text().split(/[.:]+/).pop() ?? "";
    const cands = decls.get(`${lang}:${name}`) ?? [];
    return cands.find((c) => c.file === file) ?? cands[0] ?? null;
  };
  const push = (lang: SysLang, h: Handler | null, method: HttpMethod, urlPath: string, guards: string) => {
    if (!h) return;
    const r = h.node.range();
    const name = h.node.field("name")?.text();
    routes.push({
      file: h.file,
      line: r.start.line + 1,
      urlPath,
      method,
      hasAuthGuard: AUTH_MW.test(guards),
      hasRateLimit: RATE_MW.test(guards),
      hasWebhookVerification: false,
      dbTablesAccessed: tablesIn(lang, h.node),
      externalSdksCalled: fileVendors(h.file),
      ...(name ? { handlerName: name } : {}),
      bodyStart: r.start.index,
      bodyEnd: r.end.index,
      language: lang,
    });
  };

  for (const f of roots) {
    if (f.lang === "go") goRoutes(f.root, (h, m, p, g) => push("go", resolve("go", f.rel, h), m, p, g));
    else
      rustRoutes(
        f.root,
        (h, m, p, g) => push("rust", resolve("rust", f.rel, h), m, p, g),
        (fn, m, p) => push("rust", { file: f.rel, node: fn }, m, p, ""),
      );
  }
  return routes;
}

/** Vendors imported by a file: Go import paths, Rust `use` / `extern crate` roots (file-level, like the TS path). */
function importedVendors(lang: SysLang, root: SgNode): string[] {
  const pkgs =
    lang === "go"
      ? root.findAll({ rule: { kind: "import_spec" } }).map((s) => unquote(s.field("path")?.text() ?? ""))
      : [...root.text().matchAll(/^\s*(?:pub\s+)?(?:use|extern\s+crate)\s+:{0,2}(\w+)/gm)].map((m) => m[1]);
  const ids = pkgs.map((p) => vendorForPackage(p, lang === "go" ? "go" : "cargo")?.id).filter((id): id is string => !!id);
  return [...new Set(ids)];
}

/** Tables a handler touches: SQL string literals, GORM `Model(&X{})` / `Create(&X{})` / `Table("x")`, diesel `x::table`, sea-orm `x::Entity`. */
function tablesIn(lang: SysLang, fn: SgNode): string[] {
  const out = new Set<string>();
  for (const lit of STRING_KINDS[lang].flatMap((kind) => fn.findAll({ rule: { kind } }))) {
    const sql = unquote(lit.text());
    if (!SQL_RE.test(sql)) continue;
    for (const m of sql.matchAll(/\b(?:INTO|UPDATE|FROM|JOIN)\s+["`]?([A-Za-z_][\w.]*)/gi)) out.add(m[1].split(".").pop() ?? m[1]);
  }
  const text = fn.text();
  for (const m of text.matchAll(
    /\.(?:Model|Create|Save|Delete|Find|First)\(\s*&\s*(?:\[\])?(?:\w+\.)?([A-Z]\w*)\s*\{|\.Table\(\s*"(\w+)"|\b(\w+)::(?:table|Entity|ActiveModel)\b/g,
  ))
    out.add(m[1] ?? m[2] ?? m[3]);
  return [...out];
}

type Emit = (handlerRef: SgNode, method: HttpMethod, path: string, guards: string) => void;

function goRoutes(root: SgNode, emit: Emit) {
  // Group prefixes and group-level middleware: `api := r.Group("/api", mw)`, `api.Use(AuthRequired())`.
  const prefix = new Map<string, { path: string; guards: string }>();
  const groupOf = (recv: string) => prefix.get(recv) ?? { path: "", guards: "" };
  for (const decl of root.findAll({ rule: { kind: "short_var_declaration" } })) {
    const call = decl
      .field("right")
      ?.children()
      .find((c) => c.kind() === "call_expression");
    const fn = call?.field("function");
    if (!call || fn?.kind() !== "selector_expression" || !/^(Group|Route)$/.test(fn.field("field")?.text() ?? "")) continue;
    const args =
      call
        .field("arguments")
        ?.children()
        .filter((c) => c.isNamed()) ?? [];
    if (!args[0] || !/string_literal/.test(args[0].kind())) continue;
    const parent = groupOf(fn.field("operand")?.text() ?? "");
    const v = decl.field("left")?.text().split(",")[0].trim() ?? "";
    prefix.set(v, {
      path: joinPath(parent.path, unquote(args[0].text())),
      guards:
        parent.guards +
        args
          .slice(1)
          .map((a) => a.text())
          .join(" "),
    });
  }
  for (const use of root.findAll({ rule: { kind: "call_expression" } })) {
    const fn = use.field("function");
    if (fn?.kind() !== "selector_expression" || fn.field("field")?.text() !== "Use") continue;
    const recv = fn.field("operand")?.text() ?? "";
    const g = groupOf(recv);
    prefix.set(recv, { path: g.path, guards: `${g.guards} ${use.field("arguments")?.text() ?? ""}` });
  }
  for (const call of root.findAll({ rule: { kind: "call_expression" } })) {
    const fn = call.field("function");
    const verb = fn?.kind() === "selector_expression" ? (fn.field("field")?.text() ?? "") : "";
    if (!GO_VERB.test(verb)) continue;
    const args =
      call
        .field("arguments")
        ?.children()
        .filter((c) => c.isNamed()) ?? [];
    let i = 0;
    let method = verb;
    // gin `r.Handle("POST", "/x", h)`
    if (verb === "Handle" && args.length >= 3 && /string_literal/.test(args[1]?.kind() ?? "")) {
      method = unquote(args[0].text());
      i = 1;
    }
    if (!args[i] || !/string_literal/.test(args[i].kind()) || args.length < i + 2) continue;
    let path = unquote(args[i].text());
    // Go 1.22 mux patterns: `mux.HandleFunc("POST /items/{id}", h)`
    const pat = path.match(/^([A-Z]+)\s+(\/.*)$/);
    if (pat) [, method, path] = pat;
    if (!path.startsWith("/")) continue;
    const g = groupOf(fn?.field("operand")?.text() ?? "");
    const guards = `${g.guards} ${args
      .slice(i + 1, -1)
      .map((a) => a.text())
      .join(" ")}`;
    emit(args[args.length - 1], toMethod(method), joinPath(g.path, path), guards);
  }
}

function rustRoutes(root: SgNode, emit: Emit, emitFn: (fn: SgNode, method: HttpMethod, path: string) => void) {
  // Actix attribute macros: #[get("/x")] async fn h(...)
  for (const fn of root.findAll({ rule: { kind: "function_item" } })) {
    for (let a = fn.prev(); a?.kind() === "attribute_item"; a = a.prev()) {
      const m = a.text().match(/^#\[(?:actix_web::)?(get|post|put|patch|delete)\(\s*"([^"]+)"/);
      if (m) emitFn(fn, toMethod(m[1]), m[2]);
    }
  }
  for (const call of root.findAll({ rule: { kind: "call_expression" } })) {
    const fn = call.field("function");
    const field = fn?.kind() === "field_expression" ? (fn.field("field")?.text() ?? "") : "";
    const args =
      call
        .field("arguments")
        ?.children()
        .filter((c) => c.isNamed()) ?? [];
    if (field === "route" && args.length === 2 && args[0].kind() === "string_literal") {
      const path = unquote(args[0].text());
      // Axum layers apply to routes added before them: on the method router, or later in the builder chain.
      let guards = args[1].text().match(/\.(?:layer|route_layer)\([\s\S]*$/)?.[0] ?? "";
      for (let c = call; c.parent()?.kind() === "field_expression"; ) {
        const outer = c.parent()?.parent();
        if (outer?.kind() !== "call_expression") break;
        if (/^(?:layer|route_layer|wrap)$/.test(c.parent()?.field("field")?.text() ?? "")) guards += ` ${outer.field("arguments")?.text() ?? ""}`;
        c = outer;
      }
      // Axum `get(h).post(h2)` method routers, or Actix `web::post().to(h)`
      for (const c of args[1].findAll({ rule: { kind: "call_expression" } })) {
        const cf = c.field("function");
        const name = cf?.kind() === "field_expression" ? cf.field("field")?.text() : cf?.text().split("::").pop();
        const cargs =
          c
            .field("arguments")
            ?.children()
            .filter((x) => x.isNamed()) ?? [];
        if (cargs.length !== 1) continue;
        if (name && RUST_VERB.test(name)) emit(cargs[0], toMethod(name), path, guards);
        else if (name === "to") emit(cargs[0], toMethod(cf?.text().match(/web::(\w+)\(\)/)?.[1] ?? "get"), path, guards);
      }
    } else if (field === "to" && args.length === 1) {
      // Actix `web::resource("/r").route(web::get().to(h))`
      const verb = fn?.text().match(/web::(get|post|put|patch|delete)\(\)/)?.[1];
      const outer = call.parent()?.parent();
      const single =
        outer
          ?.field("arguments")
          ?.children()
          .filter((c) => c.isNamed()).length === 1;
      const res =
        single &&
        outer
          ?.field("function")
          ?.text()
          .match(/resource\(\s*"([^"]+)"\s*\)[^"]*$/)?.[1];
      if (verb && res) emit(args[0], toMethod(verb), res, "");
    }
  }
}
