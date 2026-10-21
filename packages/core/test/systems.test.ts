import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildRepoContext } from "../src/context/builder";
import { parseCargoLock, parseCargoToml, parseGoMod, parseGoSum } from "../src/context/systems-deps";
import { sysLangOf, sysLangUnavailable } from "../src/context/systems-lang";
import type { Dependency } from "../src/context/types";
import { runAudit } from "../src/engine";
import { renderCompact } from "../src/reporters/compact";
import { defineRule, RuleSkipped } from "../src/rules/helpers";
import { sys02RequestUnwrap } from "../src/rules/systems/sys-02-request-unwrap";
import { sys03DetachedContext } from "../src/rules/systems/sys-03-detached-context";

const HAS_SYS = !sysLangUnavailable("go") && !sysLangUnavailable("rust");
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
function repo(files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), "preflight-sys-"));
  dirs.push(d);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(d, rel)), { recursive: true });
    writeFileSync(join(d, rel), text);
  }
  return d;
}
const ctxOf = (files: Record<string, string>) => buildRepoContext(repo(files), { config: { offline: true } });
const routesOf = async (files: Record<string, string>) =>
  (await ctxOf(files)).routes.map((r) => `${r.method} ${r.urlPath} ${r.handlerName ?? "(inline)"}${r.hasAuthGuard ? " auth" : ""}`).sort();

describe("Go/Rust dependency parsers", () => {
  test("go.mod: direct vs // indirect, local replace; go.sum adds unlisted modules only", () => {
    const m = new Map<string, Dependency>();
    parseGoMod(
      "go.mod",
      "module x\n\nrequire github.com/a/b v1.2.3\nrequire (\n\tgithub.com/c/d v0.1.0 // indirect\n\texample.com/local v0.0.0\n)\nreplace example.com/local => ../local\n",
      m,
    );
    parseGoSum("github.com/a/b v1.0.0 h1:x=\ngithub.com/e/f v2.0.0+incompatible h1:y=\ngithub.com/e/f v2.0.0+incompatible/go.mod h1:z=\n", m);
    expect([...m.values()].map((d) => `${d.name}@${d.version}${d.isDirect ? "*" : ""}${d.isLocal ? "L" : ""}`)).toEqual([
      "github.com/a/b@v1.2.3*",
      "github.com/c/d@v0.1.0",
      "example.com/local@v0.0.0*L",
      "github.com/e/f@v2.0.0+incompatible",
    ]);
    expect(m.get("go:github.com/a/b")?.declaredLine).toBe(3);
  });

  test("Cargo.toml sections, renames, path/workspace deps; Cargo.lock pins and skips members", () => {
    const m = new Map<string, Dependency>();
    parseCargoToml(
      "Cargo.toml",
      '[package]\nname = "app"\n\n[dependencies]\naxum = "0.7"\nmy_serde = { package = "serde", version = "1" } # renamed\nlocal = { path = "../local" }\n\n[dependencies.tokio]\nversion = "1.38"\nfeatures = ["full"]\n\n[target.\'cfg(unix)\'.dev-dependencies]\nnix = "0.29"\n',
      m,
    );
    parseCargoLock('[[package]]\nname = "axum"\nversion = "0.7.5"\nsource = "registry+x"\n\n[[package]]\nname = "app"\nversion = "0.1.0"\n', m);
    expect([...m.values()].map((d) => `${d.name}@${d.version}${d.isDirect ? "*" : ""}${d.isDev ? "D" : ""}${d.isLocal ? "L" : ""}`)).toEqual([
      "axum@0.7.5*",
      "serde@1*",
      "local@**L",
      "tokio@1.38*",
      "nix@0.29*D",
    ]);
  });

  test("tests, vendor/ and target/ aren't analysed", () => {
    expect([sysLangOf("a_test.go"), sysLangOf("vendor/x/y.go"), sysLangOf("target/debug/build.rs"), sysLangOf("cmd/main.go")]).toEqual([
      null,
      null,
      null,
      "go",
    ]);
  });
});

describe.skipIf(!HAS_SYS)("Go/Rust route extraction", () => {
  test("Echo, Fiber, net/http 1.22 patterns, gin Handle, group middleware", async () => {
    expect(
      await routesOf({
        "go.mod": "module x\n\nrequire github.com/labstack/echo/v4 v4.12.0\n",
        "echo.go":
          'package main\nfunc main() {\n e := echo.New()\n admin := e.Group("/admin", middleware.JWT(secret))\n admin.DELETE("/users/:id", delUser)\n e.GET("/ping", func(c echo.Context) error { return nil })\n}\nfunc delUser(c echo.Context) error { return nil }\n',
        "fiber.go": 'package main\nfunc f() {\n app := fiber.New()\n v1 := app.Group("/v1")\n v1.Use(requireAuth)\n v1.Post("/items", h.CreateItem)\n}\n',
        "items.go": "package main\ntype H struct{}\nfunc (h *H) CreateItem(c *fiber.Ctx) error { return nil }\n",
        "mux.go":
          'package main\nfunc m() {\n mux := http.NewServeMux()\n mux.HandleFunc("PUT /things/{id}", put)\n r := gin.New()\n r.Handle("PATCH", "/g", put)\n}\nfunc put(w http.ResponseWriter, r *http.Request) {}\n',
      }),
    ).toEqual(["DELETE /admin/users/:id delUser auth", "GET /ping (inline)", "PATCH /g put", "POST /v1/items CreateItem auth", "PUT /things/{id} put"]);
  });

  test("Actix resource().route(web::x().to(h)) and .route(path, web::x().to(h)); Axum layers", async () => {
    expect(
      await routesOf({
        "Cargo.toml": '[dependencies]\nactix-web = "4"\n',
        "src/main.rs":
          'fn cfg() { App::new().service(web::resource("/r").route(web::get().to(idx))).route("/z", web::post().to(zz)); }\nfn ax() -> Router { Router::new().route("/me", get(me).layer(from_fn(require_auth))) }\nasync fn idx() {}\nasync fn zz() {}\nasync fn me() {}\n',
      }),
    ).toEqual(["GET /me me auth", "GET /r idx", "POST /z zz"]);
  });

  test("SYS-02 ignores State/Data extractors and constants; SYS-03 skips detached goroutines", async () => {
    const rs = await ctxOf({
      "src/main.rs":
        'fn app() -> Router { Router::new().route("/a", get(a)) }\nasync fn a(State(s): State<App>, web_data: web::Data<Pool>) -> String { let n: u8 = "3".parse().unwrap(); s.m.lock().unwrap().to_string() }\n',
    });
    expect(await sys02RequestUnwrap.run(rs)).toEqual([]);
    const go = await ctxOf({
      "main.go": 'package main\nfunc main() { r := gin.New(); r.POST("/a", a) }\nfunc a(c *gin.Context) {\n go func() { audit(context.Background()) }()\n}\n',
    });
    expect(await sys03DetachedContext.run(go)).toEqual([]);
  });
});

describe("skipped rules", () => {
  test("RuleSkipped → one deduped notice, absent from rulesRun, visible in compact output", async () => {
    const ctx = await ctxOf({ "main.go": "package main\n" });
    const skip = (id: string) =>
      defineRule({ id, pillar: "FINOPS_OPS", severity: "HIGH", title: id }, () => {
        throw new RuleSkipped("Go analysis needs the optional grammars: missing");
      });
    const report = await runAudit(ctx, { rules: [skip("SYS-01"), skip("SYS-03")] });
    expect(report.notices).toEqual([{ ruleIds: ["SYS-01", "SYS-03"], message: "Go analysis needs the optional grammars: missing" }]);
    expect(report.rulesRun).toEqual([]);
    expect(report.errors).toBeUndefined();
    expect(renderCompact(report)).toContain("[INFO][SYS-01,SYS-03] SKIPPED | Go analysis needs the optional grammars");
  });
});

test("without the grammars (PREFLIGHT_NO_NAPI=1) a Go repo gets a notice, never a false clean", () => {
  const p = Bun.spawnSync(["bun", "run", "src/bin/cli.ts", "scan", "../../fixtures/vulnerable-go", "--json", "--offline"], {
    cwd: join(import.meta.dir, ".."),
    env: { ...process.env, PREFLIGHT_NO_NAPI: "1" },
  });
  const report = JSON.parse(p.stdout.toString());
  expect(report.notices).toHaveLength(1);
  expect(report.notices[0].ruleIds).toEqual(["SYS-01", "SYS-03"]);
  expect(report.notices[0].message).toContain("@ast-grep/lang-go");
  expect(report.rulesRun).not.toContain("SYS-01");
  expect(report.findings.some((f: { ruleId: string }) => f.ruleId.startsWith("SYS-"))).toBe(false);
  expect(report.stats.routes).toBe(0);
});
