import { afterAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "../src/bin/cli";

const CLI = join(import.meta.dir, "../src/bin/cli.ts");
const run = (...args: string[]) => {
  const p = Bun.spawnSync(["bun", CLI, ...args], { env: { ...process.env, NO_COLOR: "1", PREFLIGHT_CERT_SECRET: "cli-test-secret" } });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
};
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

test("arg parsing", () => {
  const a = parseArgs(["attack", "--target", "http://localhost:3000", "--strict", "--port=4401", "repo"]);
  expect(a.cmd).toBe("attack");
  expect(a.flags).toEqual({ target: "http://localhost:3000", strict: true, port: "4401" });
  expect(a.path.endsWith("/repo")).toBe(true);
});

test("scan exits 1 on blockers and 0 when launch-ready", () => {
  const bad = run("scan", "fixtures/vulnerable-saas", "--offline");
  expect(bad.code).toBe(1);
  expect(bad.out).toContain("LAUNCH_BLOCKED");
  const good = run("scan", "fixtures/clean-saas", "--offline");
  expect(good.code).toBe(0);
  expect(good.out).toContain("100/100");
});

test("--json and --sarif emit machine output", () => {
  const j = JSON.parse(run("scan", "fixtures/vulnerable-saas", "--offline", "--json").out);
  expect(j.findings.length).toBeGreaterThan(37);
  const s = JSON.parse(run("scan", "fixtures/vulnerable-saas", "--offline", "--sarif").out);
  expect(s.version).toBe("2.1.0");
});

test("cert, legal, checklist write their files", () => {
  const root = mkdtempSync(join(tmpdir(), "preflight-cli-"));
  dirs.push(root);
  cpSync("fixtures/clean-saas", root, { recursive: true });
  expect(run("cert", root, "--offline").code).toBe(0);
  for (const f of ["LAUNCH_CERTIFICATE.html", "LAUNCH_CERTIFICATE.pdf", "SBOM.json", "DATA_FLOW.mermaid"])
    expect(readFileSync(join(root, f)).length).toBeGreaterThan(100);
  const legal = run("legal", root);
  expect(legal.out).toContain("up to date");
  expect(legal.out).toContain("not legal advice");
  expect(run("scan", root, "--offline", "--write-checklist").code).toBe(0);
  expect(readFileSync(join(root, "READINESS_CHECKLIST.md"), "utf8")).toContain("- [x] **SEC-01**");
});

test("cert refuses on blockers; usage errors exit 2", () => {
  const root = mkdtempSync(join(tmpdir(), "preflight-cli-"));
  dirs.push(root);
  cpSync("fixtures/vulnerable-saas", root, { recursive: true });
  const r = run("cert", root, "--offline");
  expect(r.code).toBe(1);
  expect(r.err).toContain("Refusing");
  expect(run("attack").code).toBe(2);
  expect(run("bogus").code).toBe(2);
  expect(run("help").code).toBe(0);
});

test("SLA: cold scan of 500+ files with git history < 3000 ms", () => {
  const root = mkdtempSync(join(tmpdir(), "preflight-sla-"));
  dirs.push(root);
  cpSync("fixtures/vulnerable-saas", root, { recursive: true });
  const route = readFileSync("fixtures/vulnerable-saas/app/api/posts/route.ts", "utf8");
  const page = readFileSync("fixtures/vulnerable-saas/app/page.tsx", "utf8");
  const action = readFileSync("fixtures/vulnerable-saas/app/actions.ts", "utf8");
  for (let i = 0; i < 160; i++) {
    mkdirSync(join(root, `app/api/gen${i}`), { recursive: true });
    writeFileSync(join(root, `app/api/gen${i}/route.ts`), route);
    mkdirSync(join(root, `app/gen${i}`), { recursive: true });
    writeFileSync(join(root, `app/gen${i}/page.tsx`), page);
    writeFileSync(join(root, `app/gen${i}/actions.ts`), action);
  }
  const git = (...a: string[]) =>
    execFileSync("git", ["-C", root, "-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...a], { stdio: "ignore" });
  git("init", "-q");
  git("add", ".");
  git("commit", "-qm", "init");
  const t0 = performance.now();
  const r = run("scan", root, "--offline", "--json");
  const ms = performance.now() - t0;
  const report = JSON.parse(r.out);
  expect(report.stats.files).toBeGreaterThanOrEqual(500);
  expect(report.errors).toBeUndefined();
  expect(ms).toBeLessThan(3000);
  console.log(`SLA: ${report.stats.files} files, ${report.findings.length} findings, wall ${Math.round(ms)} ms (engine ${report.durationMs} ms)`);
}, 15_000);
