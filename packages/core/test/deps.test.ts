import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSbom } from "../src/compilers/vendor-pack";
import { compareVersions, firstFix, loadAdvisories } from "../src/context/advisories";
import { buildRepoContext } from "../src/context/builder";
import { cvss3BaseScore } from "../src/context/cvss";
import type { GantryConfig } from "../src/context/types";
import { runAudit } from "../src/engine";
import { installAdvisoryStub } from "./advisory-stub";

const DEP = ["DEP-01", "DEP-02", "DEP-03"];
const roots: string[] = [];
let stub: ReturnType<typeof installAdvisoryStub> | undefined;
afterEach(() => {
  stub?.restore();
  stub = undefined;
});
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const lockEntry = (version: string, extra: Record<string, unknown> = {}) => ({
  version,
  resolved: "https://registry.npmjs.org/x/-/x.tgz",
  license: "MIT",
  ...extra,
});

/** A temp npm repo: `deps` are direct runtime deps (exact versions), `lock` adds/overrides package-lock entries. */
function repo(deps: Record<string, string>, lock: Record<string, any> = {}, files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "gantry-dep-"));
  roots.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "t", version: "1.0.0", dependencies: deps }, null, 2));
  const packages: Record<string, any> = { "": { name: "t", dependencies: deps } };
  for (const [n, v] of Object.entries(deps)) if (/^\d/.test(v)) packages[`node_modules/${n}`] = lockEntry(v);
  for (const [n, e] of Object.entries(lock)) packages[`node_modules/${n}`] = e;
  writeFileSync(join(root, "package-lock.json"), JSON.stringify({ name: "t", lockfileVersion: 3, packages }, null, 2));
  for (const [f, t] of Object.entries(files)) writeFileSync(join(root, f), t);
  return root;
}

const scan = async (root: string, config: Partial<GantryConfig> = {}) =>
  runAudit(await buildRepoContext(root, { config: { offline: false, ...config } }), { ruleIds: DEP });

describe("privacy: only public package names + versions leave the machine", () => {
  test("private-looking names are never sent", async () => {
    stub = installAdvisoryStub();
    const root = repo(
      { lodash: "4.17.20", "@acme-internal/billing": "2.0.0", "corp-auth": "1.2.3", "ui-kit": "file:../ui-kit", "forked-lib": "github:me/forked-lib" },
      { "mirror-only": lockEntry("1.0.0", { resolved: "https://npm.corp.example/mirror-only/-/mirror-only-1.0.0.tgz" }) },
    );
    writeFileSync(join(root, "gantry.config.json"), JSON.stringify({ privatePackages: ["corp-*"] }));
    const r = await scan(root);
    const sent = stub.sentNames();
    expect(sent).toContain("lodash");
    for (const n of ["@acme-internal/billing", "corp-auth", "ui-kit", "forked-lib", "mirror-only"]) expect(sent).not.toContain(n);
    // Only names + versions: the OSV body is exactly {package:{name,ecosystem},version} per query.
    const body = JSON.parse(stub.calls.find((c) => c.url.endsWith("/querybatch"))!.body!);
    expect(Object.keys(body.queries[0]).sort()).toEqual(["package", "version"]);
    expect(r.notices?.find((n) => n.ruleIds.includes("DEP-01") && n.kind === "info")?.message).toMatch(/^5 private-looking packages were not sent/);
    // Every request is bounded by a timeout signal.
    expect(stub.calls.every((c) => c.signal instanceof AbortSignal)).toBe(true);
  });
});

describe("DEP-01", () => {
  test("offline without a cache is a notice, never a pass; online fills the cache; offline then reuses it", async () => {
    stub = installAdvisoryStub();
    const root = repo({ jquery: "3.4.1" }, {}, { "app.ts": 'import $ from "jquery";\n$("#x").show();\n' });
    const off = await scan(root, { offline: true });
    expect(off.rulesRun).not.toContain("DEP-01");
    expect(off.notices?.find((n) => n.ruleIds.includes("DEP-01"))?.message).toContain("--offline and no cache");
    expect(off.findings.filter((f) => f.ruleId === "DEP-01")).toEqual([]);
    expect(stub.calls).toHaveLength(0);

    const on = await scan(root);
    const f = on.findings.find((f) => f.ruleId === "DEP-01")!;
    expect(f.severity).toBe("CRITICAL");
    expect(f.evidence).toContain("imported at app.ts:1");
    expect(f.agentRemediationPrompt).toContain("Bump `jquery` to >=3.5.0 in package.json");
    expect(f.autoFixPatch).toBeUndefined();
    expect(on.advisoriesAsOf).toMatch(/^\d{4}-\d\d-\d\dT/);
    // The non-KEV CVSS 6.9 jQuery advisory is a count, not a finding.
    expect(on.notices?.find((n) => n.kind === "info" && n.ruleIds.includes("DEP-01"))?.message).toStartWith("1 lower-severity advisories");

    const calls = stub.calls.length;
    const cached = await scan(root, { offline: true });
    expect(stub.calls.length).toBe(calls);
    expect(cached.rulesRun).toContain("DEP-01");
    expect(cached.findings.find((f) => f.ruleId === "DEP-01")?.severity).toBe("CRITICAL");
    expect(cached.advisoriesAsOf).toBe(on.advisoriesAsOf);
  });

  test("KEV but transitive and not imported is HIGH; an unreachable OSV is a notice", async () => {
    stub = installAdvisoryStub();
    const root = repo({ "some-widget": "1.0.0" }, { jquery: lockEntry("3.4.1") });
    const r = await scan(root);
    const f = r.findings.find((f) => f.ruleId === "DEP-01")!;
    expect(f.severity).toBe("HIGH");
    expect(f.file).toBe("package-lock.json");
    expect(f.evidence).toContain("transitive dependency");
    stub.restore();

    stub = installAdvisoryStub({ failOsv: true });
    const down = await scan(repo({ jquery: "3.4.1" }));
    expect(down.rulesRun).not.toContain("DEP-01");
    expect(down.notices?.find((n) => n.ruleIds.includes("DEP-01"))?.message).toContain("OSV.dev didn't answer");
  });

  test("without KEV, findings are CVSS-only and the rule is not certified as run", async () => {
    stub = installAdvisoryStub({ failKev: true });
    const r = await scan(repo({ lodash: "4.17.20", jquery: "3.4.1" }));
    expect(r.findings.filter((f) => f.ruleId === "DEP-01").map((f) => f.evidence.split("@")[0])).toEqual(["lodash"]);
    expect(r.rulesRun).not.toContain("DEP-01");
    expect(r.notices?.some((n) => n.message.includes("CISA KEV catalogue was unreachable"))).toBe(true);
  });

  test("ignoreAdvisories needs a reason and an unexpired date; manifest comments name an id", async () => {
    stub = installAdvisoryStub();
    const root = repo({ lodash: "4.17.20" });
    const cfg = (expires: string, reason = "template() never sees user input") =>
      writeFileSync(
        join(root, "gantry.config.json"),
        JSON.stringify({
          ignoreAdvisories: [
            { id: "CVE-2026-4800", reason, expires },
            { id: "GHSA-35jh-r3h4-6jhm", reason, expires },
          ],
        }),
      );
    cfg("2999-01-01");
    expect((await scan(root)).findings.filter((f) => f.ruleId === "DEP-01")).toEqual([]);
    cfg("2020-01-01");
    const expired = await scan(root);
    expect(expired.findings.some((f) => f.ruleId === "DEP-01")).toBe(true);
    expect(expired.notices?.some((n) => n.message.includes("expired on 2020-01-01"))).toBe(true);
    cfg("2999-01-01", "");
    expect((await scan(root)).findings.some((f) => f.ruleId === "DEP-01")).toBe(true);

    // A Python manifest comment must name the id and give a reason; a bare `gantry-ignore DEP-01` silences nothing.
    const py = mkdtempSync(join(tmpdir(), "gantry-dep-py-"));
    roots.push(py);
    writeFileSync(join(py, "requirements.txt"), "# gantry-ignore DEP-01\npyyaml==5.3\n");
    const bare = (await scan(py)).findings.find((f) => f.ruleId === "DEP-01");
    expect(bare?.severity).toBe("HIGH");
    expect(bare?.agentRemediationPrompt).toContain(">=5.4 in requirements.txt");
    writeFileSync(join(py, "requirements.txt"), "# gantry-ignore DEP-01 CVE-2020-14343 we only safe_load our own config\npyyaml==5.3\n");
    expect((await scan(py)).findings.some((f) => f.ruleId === "DEP-01")).toBe(false);
  });
});

describe("DEP-02", () => {
  test("fresh releases are HIGH; unpublished or compromised ones are CRITICAL; old ones pass", async () => {
    stub = installAdvisoryStub({
      ages: { "fresh-lib@2.0.0": 1, "hijacked@1.0.1": 2 },
      gone: ["pulled-lib@3.1.4"],
      deprecated: { "hijacked@1.0.1": "This version was published by a compromised maintainer account" },
    });
    const r = await scan(repo({ "fresh-lib": "2.0.0", hijacked: "1.0.1", "pulled-lib": "3.1.4", "old-lib": "1.0.0" }));
    const dep2 = Object.fromEntries(r.findings.filter((f) => f.ruleId === "DEP-02").map((f) => [f.evidence.split("@")[0], f]));
    expect(Object.keys(dep2).sort()).toEqual(["fresh-lib", "hijacked", "pulled-lib"]);
    expect(dep2["fresh-lib"].severity).toBe("HIGH");
    expect(dep2["fresh-lib"].evidence).toContain("published 1 day ago");
    expect(dep2.hijacked.severity).toBe("CRITICAL");
    expect(dep2["pulled-lib"].severity).toBe("CRITICAL");
    expect(dep2["pulled-lib"].evidence).toContain("doesn't exist on the registry");
    expect(dep2["fresh-lib"].agentRemediationPrompt).toContain("min-release-age=7");
  });

  test("minReleaseAgeDays is configurable and registry failures are notices", async () => {
    stub = installAdvisoryStub({ ages: { "fresh-lib@2.0.0": 10 } });
    const root = repo({ "fresh-lib": "2.0.0" });
    expect((await scan(root)).findings.some((f) => f.ruleId === "DEP-02")).toBe(false);
    stub.restore();
    stub = installAdvisoryStub({ ages: { "fresh-lib@2.0.0": 10 } });
    expect((await scan(root, { minReleaseAgeDays: 14 })).findings.some((f) => f.ruleId === "DEP-02")).toBe(true);
    stub.restore();
    stub = installAdvisoryStub({ failRegistry: true });
    const down = await scan(repo({ "fresh-lib": "2.0.0" }));
    expect(down.rulesRun).not.toContain("DEP-02");
    expect(down.notices?.find((n) => n.ruleIds.includes("DEP-02"))?.message).toContain("didn't answer");
  });
});

describe("DEP-03", () => {
  test("pnpm/bun/yarn lockfiles are checked for sync; Cargo git deps need a rev", async () => {
    const root = mkdtempSync(join(tmpdir(), "gantry-dep3-"));
    roots.push(root);
    writeFileSync(join(root, "package.json"), JSON.stringify({ dependencies: { next: "^15.5.0", ghost: "^1.0.0" } }));
    writeFileSync(
      join(root, "pnpm-lock.yaml"),
      "lockfileVersion: '9.0'\n\nimporters:\n  .:\n    dependencies:\n      next:\n        specifier: ^15.5.0\n        version: 15.5.0\n      ghost:\n        specifier: ^1.0.0\n\npackages:\n\n  next@15.5.0:\n    resolution: {integrity: sha512-x}\n",
    );
    writeFileSync(
      join(root, "Cargo.toml"),
      '[package]\nname = "svc"\n\n[[bin]]\nname = "svc"\n\n[dependencies]\nfork = { git = "https://github.com/me/fork", branch = "main" }\npinned = { git = "https://github.com/me/p", rev = "0123456789abcdef0123456789abcdef01234567" }\n',
    );
    writeFileSync(join(root, "Cargo.lock"), "version = 3\n");
    const r = await runAudit(await buildRepoContext(root, { config: { offline: true } }), { ruleIds: ["DEP-03"] });
    const ev = r.findings.map((f) => f.evidence);
    expect(ev.some((e) => e.includes("pnpm-lock.yaml has no entry for ghost"))).toBe(true);
    expect(ev.some((e) => e.includes("next"))).toBe(false);
    expect(ev.some((e) => e.startsWith("fork ="))).toBe(true);
    expect(ev.some((e) => e.startsWith("pinned ="))).toBe(false);
  });
});

describe("CLI + SBOM", () => {
  const cli = (...args: string[]) => Bun.spawnSync(["bun", "run", "src/bin/cli.ts", ...args], { cwd: join(import.meta.dir, "..") });

  test("scan --only runs just the named rules; unknown ids are a usage error", () => {
    const p = cli("scan", "../../fixtures/vulnerable-nolock", "--only", "dep-03", "--json");
    const r = JSON.parse(p.stdout.toString());
    expect(r.rulesRun).toEqual(["DEP-03"]);
    expect(r.findings.every((f: { ruleId: string }) => f.ruleId === "DEP-03")).toBe(true);
    expect(p.exitCode).toBe(1); // missing lockfile on a deployable app is CRITICAL
    expect(cli("scan", "../../fixtures/vulnerable-nolock", "--only", "DEP-99").exitCode).toBe(2);
  });

  test("gantry sbom --out writes CycloneDX 1.6 with direct/transitive marks", () => {
    const dir = mkdtempSync(join(tmpdir(), "gantry-sbom-"));
    roots.push(dir);
    const out = join(dir, "sbom.cdx.json");
    expect(cli("sbom", "../../fixtures/vulnerable-saas", "--out", out, "--offline").exitCode).toBe(0);
    const doc = JSON.parse(require("node:fs").readFileSync(out, "utf8"));
    expect(doc.specVersion).toBe("1.6");
    expect(doc.components.find((c: any) => c.name === "jquery").properties).toEqual([{ name: "gantry:dependency", value: "direct" }]);
    expect(doc.dependencies[0].dependsOn).toContain("pkg:npm/jquery@3.4.1");
    expect(doc.vulnerabilities).toBeUndefined(); // offline, empty cache
  });

  test("vulnerabilities section from the advisory lookup (schema-checked shape)", async () => {
    stub = installAdvisoryStub();
    const root = mkdtempSync(join(tmpdir(), "gantry-sbomv-"));
    roots.push(root);
    cpSync("fixtures/vulnerable-saas", root, { recursive: true });
    const ctx = await buildRepoContext(root, { config: { offline: false } });
    const doc: any = buildSbom(ctx, new Date(), await loadAdvisories(ctx));
    const kev = doc.vulnerabilities.find((v: any) => v.id === "GHSA-jpcq-cgw6-v4j6");
    expect(kev.affects).toEqual([{ ref: "pkg:npm/jquery@3.4.1" }]);
    expect(kev.properties).toEqual([{ name: "gantry:cisa-kev", value: "true" }]);
    expect(kev.ratings[0]).toEqual({ score: 6.9, severity: "medium", method: "CVSSv3" });
    expect(kev.recommendation).toBe("Upgrade jquery to 3.5.0 or later.");
    expect(kev.references.map((r: any) => r.id)).toContain("CVE-2020-11023");
  });
});

test("CVSS v3 scores and version helpers", () => {
  expect(cvss3BaseScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")).toBe(9.8);
  expect(cvss3BaseScore("CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H")).toBe(7.2);
  expect(cvss3BaseScore("CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N")).toBeNull();
  expect(firstFix("4.17.20", ["4.17.21", "4.18.0", "5.0.1"])).toBe("4.17.21");
  expect(firstFix("1.9.0", ["2.0.1"])).toBe("2.0.1");
  expect(firstFix("3.5.0", ["3.5.0"])).toBeUndefined();
  expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
});
