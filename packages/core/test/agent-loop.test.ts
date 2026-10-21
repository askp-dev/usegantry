import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { buildRepoContext } from "../src/context/builder";
import { changedScope, gitChangedFiles } from "../src/context/changed";
import type { Finding } from "../src/context/types";
import { audit, runAudit } from "../src/engine";
import { BASELINE, runHook, writeBaseline } from "../src/hooks";
import { CLAUDE_HOOKS, CURSOR_HOOKS, initProject } from "../src/init";
import { compactLine, renderCompact } from "../src/reporters/compact";
import { ALL_STATIC_RULES } from "../src/rules/index";

const VULN = resolve(import.meta.dir, "../../../fixtures/vulnerable-saas");
const tmps: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "pf-agent-"));
  tmps.push(d);
  return d;
};
afterAll(() => {
  for (const d of tmps) rmSync(d, { recursive: true, force: true });
});
const git = (root: string, ...args: string[]) =>
  Bun.spawnSync(["git", "-C", root, "-c", "user.email=t@example.test", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], {
    stdout: "ignore",
    stderr: "ignore",
  }).exitCode;

const REPO_SCOPE = ["OPS-01", "OPS-04", "SEO-01", "LEG-03", "LEG-04", "LEG-05", "LEG-06", "PRIV-02", "PRIV-06", "PRIV-07", "HIPAA-01", "HIPAA-02", "LGL-03", "AIA-01"];

describe("compact reporter", () => {
  const f: Finding = {
    ruleId: "SEC-01",
    pillar: "SECURITY",
    severity: "CRITICAL",
    blocking: true,
    title: "Missing or Permissive Row-Level Security (RLS)",
    file: "supabase/migrations/01_init.sql",
    line: 14,
    evidence: "create table invoices (...)",
    impact: "Anyone with the anon key can read every invoice.",
    agentRemediationPrompt: "In supabase/migrations/01_init.sql:14, add `ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;` plus an owner policy.",
  };
  test("line format snapshot", () => {
    expect(renderCompact({ score: 75, blockers: 1, findings: [f] })).toBe(
      "SCORE:75/100|BLOCKED:true\n[CRIT][SEC-01] supabase/migrations/01_init.sql:14 | Missing or Permissive Row-Level Security | FIX:Add `ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;` plus an owner policy.\n",
    );
    expect(compactLine({ ...f, severity: "HIGH" })).toStartWith("[HIGH!][SEC-01]");
    expect(renderCompact({ score: 100, blockers: 0, findings: [] })).toBe("SCORE:100/100|BLOCKED:false\n");
  });
  test("long fixes are capped at a word boundary", () => {
    const line = compactLine({ ...f, agentRemediationPrompt: `${"word ".repeat(80)}end` });
    expect(line.split("FIX:")[1].length).toBeLessThanOrEqual(161);
    expect(line.endsWith("word…")).toBe(true);
  });
  test("bytes per finding vs verbose JSON on the vuln fixture (measured, not assumed)", async () => {
    const r = await audit(VULN, { config: { offline: true } });
    const compact = r.findings.reduce((s, x) => s + compactLine(x).length + 1, 0);
    const verbose = r.findings.reduce((s, x) => s + JSON.stringify(x).length, 0);
    const reduction = 1 - compact / verbose;
    console.log(
      `compact: ${Math.round(compact / r.findings.length)} B/finding vs verbose ${Math.round(verbose / r.findings.length)} B (−${(reduction * 100).toFixed(1)}%)`,
    );
    expect(reduction).toBeGreaterThanOrEqual(0.65);
  });
});

describe("repo-scope registry tags", () => {
  test("absence rules are tagged scope: repo", () => {
    expect(
      ALL_STATIC_RULES.filter((r) => r.scope === "repo")
        .map((r) => r.id)
        .sort(),
    ).toEqual([...REPO_SCOPE].sort());
  });
});

describe("--changed-only", () => {
  let root: string;
  let target: Finding;
  beforeAll(async () => {
    root = tmp();
    cpSync(VULN, root, { recursive: true });
    expect(git(root, "init", "-q")).toBe(0);
    git(root, "add", "-A");
    expect(git(root, "commit", "-qm", "init")).toBe(0);
    const full = await audit(root, { config: { offline: true } });
    target = full.findings.find((f) => f.severity === "CRITICAL" && /\.(t|j)sx?$/.test(f.file) && !REPO_SCOPE.includes(f.ruleId))!;
    expect(target).toBeDefined();
  });

  test("clean tree = nothing changed, no findings", async () => {
    expect(gitChangedFiles(root)).toEqual([]);
    const scope = changedScope(root)!;
    expect(scope.changed).toEqual([]);
    const report = await runAudit(await buildRepoContext(root, { config: { offline: true }, only: scope.only }), { changedFiles: scope.changed });
    expect(report.findings).toEqual([]);
  });

  test("file set = modified + untracked; findings only on those; repo rules skipped; fast", async () => {
    appendFileSync(join(root, target.file), "\n");
    mkdirSync(join(root, "lib/new"), { recursive: true });
    writeFileSync(join(root, "lib/new/untracked.ts"), "export const x = 1;\n");
    expect(gitChangedFiles(root)!.sort()).toEqual([target.file, "lib/new/untracked.ts"].sort());
    const t0 = performance.now();
    const scope = changedScope(root)!;
    const ctx = await buildRepoContext(root, { config: { offline: true }, only: scope.only });
    const report = await runAudit(ctx, { changedFiles: scope.changed });
    const ms = performance.now() - t0;
    console.log(`changed-only: ${scope.changed.length} changed, ${scope.only.length} parsed, ${ms.toFixed(0)} ms`);
    expect(ctx.partial).toBe(true);
    expect(scope.only).toContain("package.json"); // anchors keep cross-file facts
    expect(report.findings.length).toBeGreaterThan(0);
    for (const f of report.findings) expect(scope.changed).toContain(f.file);
    expect(report.findings.some((f) => REPO_SCOPE.includes(f.ruleId))).toBe(false);
    expect(report.findings.some((f) => f.fingerprint === target.fingerprint)).toBe(true);
    expect(ms).toBeLessThan(1000); // target <200 ms on a dev laptop; loose here for CI noise
  });

  test("hooks block only on new blockers and honour loop guards", async () => {
    writeBaseline(root, await audit(root, { config: { offline: true } }));
    expect(JSON.parse(readFileSync(join(root, BASELINE), "utf8")).fingerprints).toContain(target.fingerprint);
    // The touched file's blocker is pre-existing → baselined → no block.
    expect((await runHook("stop", "claude", {}, root)).code).toBe(0);

    // Introduce a new blocker: copy the vulnerable file to a new untracked path.
    const copy = target.file.replace(/(\.\w+)$/, "-copy$1");
    mkdirSync(dirname(join(root, copy)), { recursive: true });
    writeFileSync(join(root, copy), readFileSync(join(root, target.file)));
    const blocked = await runHook("stop", "claude", { hook_event_name: "Stop", stop_hook_active: false }, root);
    expect(blocked.code).toBe(2);
    expect(blocked.stderr).toContain("SCORE:");
    expect(blocked.stderr).toContain(`[${target.ruleId}] ${copy}:`);
    expect(blocked.stdout).toBeUndefined();

    expect(await runHook("stop", "claude", { stop_hook_active: true }, root)).toEqual({ code: 0 });

    const cur = await runHook("stop", "cursor", { status: "completed", loop_count: 0 }, root);
    expect(cur.code).toBe(0);
    expect(JSON.parse(cur.stdout!).followup_message).toContain(copy);
    expect(JSON.parse((await runHook("stop", "cursor", { status: "completed", loop_count: 3 }, root)).stdout!)).toEqual({});
    expect(JSON.parse((await runHook("stop", "cursor", { status: "aborted", loop_count: 0 }, root)).stdout!)).toEqual({});

    // pre-commit: only `git commit` is gated.
    expect((await runHook("pre-commit", "claude", { tool_name: "Bash", tool_input: { command: "git status" } }, root)).code).toBe(0);
    expect((await runHook("pre-commit", "claude", { tool_name: "Bash", tool_input: { command: "git add -A && git commit -m x" } }, root)).code).toBe(2);
    expect(JSON.parse((await runHook("pre-commit", "cursor", { command: "ls" }, root)).stdout!)).toEqual({ permission: "allow" });
    const deny = JSON.parse((await runHook("pre-commit", "cursor", { command: "git -c x=y commit -m x" }, root)).stdout!);
    expect(deny.permission).toBe("deny");
    expect(deny.agent_message).toContain(copy);
    expect((await runHook("bogus", "claude", {}, root)).code).toBe(2);
  });
});

describe("init hooks", () => {
  test("merges Claude + Cursor hooks non-destructively and idempotently", () => {
    const root = tmp();
    const userHook = { matcher: "Edit", hooks: [{ type: "command", command: "biome format" }] };
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude/settings.json"), JSON.stringify({ permissions: { allow: ["Bash(ls)"] }, hooks: { PostToolUse: [userHook] } }));
    const first = initProject(root);
    expect(first.find((a) => a.path === ".claude/settings.json")?.action).toBe("updated");
    expect(first.find((a) => a.path === ".cursor/hooks.json")?.action).toBe("created");
    const settings = JSON.parse(readFileSync(join(root, ".claude/settings.json"), "utf8"));
    expect(settings.permissions.allow).toEqual(["Bash(ls)"]);
    expect(settings.hooks.PostToolUse).toEqual([userHook]);
    expect(settings.hooks.Stop).toEqual([{ hooks: [{ type: "command", command: CLAUDE_HOOKS.stop }] }]);
    expect(settings.hooks.PreToolUse).toBeUndefined(); // pre-commit hook is opt-in
    const cursor = JSON.parse(readFileSync(join(root, ".cursor/hooks.json"), "utf8"));
    expect(cursor).toEqual({ version: 1, hooks: { stop: [{ command: CURSOR_HOOKS.stop }] } });

    expect(initProject(root).every((a) => a.action === "unchanged" || a.action === "skipped")).toBe(true);

    const withCommit = initProject(root, { preCommit: true });
    expect(withCommit.find((a) => a.path === ".claude/settings.json")?.action).toBe("updated");
    const s2 = JSON.parse(readFileSync(join(root, ".claude/settings.json"), "utf8"));
    expect(s2.hooks.Stop.length).toBe(1);
    expect(s2.hooks.PreToolUse).toEqual([{ matcher: "Bash", hooks: [{ type: "command", command: CLAUDE_HOOKS.preCommit }] }]);
    expect(JSON.parse(readFileSync(join(root, ".cursor/hooks.json"), "utf8")).hooks.beforeShellExecution).toEqual([
      { command: CURSOR_HOOKS.preCommit, matcher: "git.*commit" },
    ]);
    expect(initProject(root, { preCommit: true }).every((a) => a.action === "unchanged" || a.action === "skipped")).toBe(true);
  });

  test("invalid JSON is left untouched; --no-hooks writes no hook files", () => {
    const root = tmp();
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude/settings.json"), "{ nope");
    const a = initProject(root);
    expect(a.find((x) => x.path === ".claude/settings.json")?.action).toBe("skipped");
    expect(readFileSync(join(root, ".claude/settings.json"), "utf8")).toBe("{ nope");
    const bare = tmp();
    expect(initProject(bare, { hooks: false }).some((x) => x.path.includes("hooks.json") || x.path.includes("settings.json"))).toBe(false);
  });
});
