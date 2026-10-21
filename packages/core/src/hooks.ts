/**
 * `preflight hook <stop|pre-commit> --agent <claude|cursor>`: agent lifecycle hooks installed by `preflight init`.
 * Runs a changed-only scan and blocks only on **new** blocking findings (not in `.preflight/baseline.json`),
 * so pre-existing debt never traps the agent. Fails open on internal errors: a crashing scanner must not brick the agent.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { buildRepoContext } from "./context/builder";
import { changedScope } from "./context/changed";
import { loadConfig } from "./context/config";
import type { AuditReport, Finding } from "./context/types";
import { runAudit } from "./engine";
import { renderCompact } from "./reporters/compact";

export const BASELINE = ".preflight/baseline.json";
/** Cursor's stop hook has no `stop_hook_active`; cap our own auto follow-ups (Cursor's default cap is 5). */
const CURSOR_MAX_FOLLOWUPS = 3;
/** `git commit`, also with global options (`git -C dir commit`, `git -c k=v commit`). */
const COMMIT_RE = /(^|[;&|(]\s*|\s)git\s+(-\S+(\s+[^-\s]\S*)?\s+)*commit\b/;

type Json = Record<string, any>;

function readBaseline(root: string): Set<string> {
  try {
    return new Set(JSON.parse(readFileSync(join(root, BASELINE), "utf8")).fingerprints ?? []);
  } catch {
    return new Set();
  }
}

export function writeBaseline(root: string, report: Pick<AuditReport, "findings">): void {
  const fingerprints = [...new Set(report.findings.filter((f) => f.blocking && f.fingerprint).map((f) => f.fingerprint!))].sort();
  mkdirSync(dirname(join(root, BASELINE)), { recursive: true });
  writeFileSync(
    join(root, BASELINE),
    `${JSON.stringify({ note: "Blocking findings accepted when `preflight init` ran. Agent hooks only block on findings not listed here.", fingerprints }, null, 2)}\n`,
  );
}

/** Changed-only scan (full scan outside git), filtered to blocking findings missing from the baseline. */
async function newBlockers(root: string): Promise<{ report: AuditReport; findings: Finding[] }> {
  const config = loadConfig(root, { offline: true });
  const scope = changedScope(root, config);
  const ctx = await buildRepoContext(root, { config: { offline: true }, ...(scope ? { only: scope.only } : {}) });
  const report = await runAudit(ctx, scope ? { changedFiles: scope.changed } : {});
  const base = readBaseline(root);
  return { report, findings: report.findings.filter((f) => f.blocking && !(f.fingerprint && base.has(f.fingerprint))) };
}

const message = (report: AuditReport, fs: Finding[]) =>
  `Preflight found ${fs.length} new launch blocker(s) in your changes. Fix them before finishing (don't weaken auth/RLS/validation; suppress a confirmed false positive with \`// preflight-ignore <RULE-ID>\`):\n${renderCompact(report, fs)}`;

/** Cursor treats invalid or schema-mismatched JSON as a block, so every Cursor exit prints a valid "go ahead". */
const cursorAllow = (event: string) => JSON.stringify(event === "stop" ? {} : { permission: "allow" });

export interface HookResult {
  code: number;
  stdout?: string;
  stderr?: string;
}

/** Pure hook decision (stdin JSON in, exit code + streams out) so tests don't spawn processes. */
export async function runHook(event: string, agent: string, input: Json, root: string): Promise<HookResult> {
  const cursor = agent === "cursor";
  if (event === "stop") {
    // Claude Code: stop_hook_active = we already blocked once this turn; let it stop (no infinite loop).
    if (!cursor && input.stop_hook_active) return { code: 0 };
    if (cursor && (input.status !== "completed" || Number(input.loop_count ?? 0) >= CURSOR_MAX_FOLLOWUPS)) return { code: 0, stdout: "{}" };
  } else if (event === "pre-commit") {
    const cmd = String((cursor ? input.command : input.tool_input?.command) ?? "");
    if (!COMMIT_RE.test(cmd)) return { code: 0, stdout: cursor ? cursorAllow(event) : undefined };
  } else return { code: 2, stderr: `unknown hook event "${event}" (expected stop | pre-commit)` };

  const { report, findings } = await newBlockers(root);
  if (!findings.length) return { code: 0, stdout: cursor ? cursorAllow(event) : undefined };
  const msg = message(report, findings);
  if (!cursor) return { code: 2, stderr: msg };
  return {
    code: 0,
    stdout: JSON.stringify(
      event === "stop"
        ? { followup_message: msg }
        : { permission: "deny", user_message: `Preflight blocked the commit: ${findings.length} new launch blocker(s).`, agent_message: msg },
    ),
  };
}

export async function main({ path, flags, event = "" }: { path: string; flags: Record<string, string | boolean>; event?: string }): Promise<number> {
  const agent = flags.agent === "cursor" ? "cursor" : "claude";
  let input: Json = {};
  try {
    const raw = await Bun.stdin.text();
    if (raw.trim()) input = JSON.parse(raw);
  } catch {
    // No/invalid stdin: treat as an empty event.
  }
  const root = resolve(path);
  let res: HookResult;
  try {
    res = existsSync(root) ? await runHook(event, agent, input, root) : { code: 0, stdout: agent === "cursor" ? cursorAllow(event) : undefined };
  } catch (e) {
    res = {
      code: 0,
      stderr: `preflight hook skipped: ${e instanceof Error ? e.message : String(e)}`,
      stdout: agent === "cursor" ? cursorAllow(event) : undefined,
    };
  }
  if (res.stdout) process.stdout.write(`${res.stdout}\n`);
  if (res.stderr) process.stderr.write(`${res.stderr}\n`);
  return res.code;
}
