import { afterAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// `bun build --compile` smoke test (quirk 11): every subcommand is bundled, embedded data loads,
// and SEC-06 still scans git history without the worker file on disk.
const dir = mkdtempSync(join(tmpdir(), "gantry-bin-"));
const BIN = join(dir, "gantry");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const run = (...args: string[]) => {
  const p = Bun.spawnSync([BIN, ...args], { cwd: dir, env: { ...process.env, NO_COLOR: "1" } });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
};
const scan = (root: string) => JSON.parse(run("scan", root, "--offline", "--json").out);

test("compiled binary scans both fixtures, finds history secrets and bundles subcommands", () => {
  // cwd = tmpdir: bun leaves a `.*.bun-build` temp copy of itself in the cwd.
  const b = Bun.spawnSync(["bun", "build", "--compile", join(import.meta.dir, "../src/bin/cli.ts"), "--outfile", BIN], { cwd: dir });
  expect(b.exitCode).toBe(0);
  expect(run("--version").out.trim()).toMatch(/^\d+\.\d+\.\d+/);

  const vuln = scan(join(import.meta.dir, "../../../fixtures/vulnerable-saas"));
  expect(vuln.errors).toBeUndefined();
  expect(new Set(vuln.findings.map((f: { ruleId: string }) => f.ruleId)).size).toBeGreaterThanOrEqual(39);
  expect(scan(join(import.meta.dir, "../../../fixtures/clean-saas")).findings).toEqual([]);

  const repo = join(dir, "hist");
  const git = (...a: string[]) =>
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...a], { cwd: repo, stdio: "ignore" });
  mkdirSync(repo);
  git("init", "-q");
  writeFileSync(join(repo, "leak.ts"), `const k = "sk_live_${"51HxQabcdEFGHijklMNOP"}qrstUVWXyz0123456789abcd";\n`);
  git("add", ".");
  git("commit", "-qm", "leak");
  writeFileSync(join(repo, "leak.ts"), "const k = process.env.K;\n");
  git("commit", "-qam", "fix");
  const sec06 = scan(repo).findings.filter((f: { ruleId: string }) => f.ruleId === "SEC-06");
  expect(sec06.map((f: { evidence: string }) => f.evidence).join()).toContain("added in commit");

  // Delegated subcommands are bundled (they used to be resolved from disk at runtime).
  const attack = run("attack", repo, "--target", "https://example.com");
  expect(attack.code).toBe(2);
  expect(attack.err).toContain("Refusing");
}, 30_000);
