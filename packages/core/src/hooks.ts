/**
 * `gantry hook <stop|pre-commit> --agent <claude|cursor|windsurf|antigravity|codex>`: agent lifecycle hooks installed by `gantry init`.
 * Runs a changed-only scan and blocks only on **new** blocking findings (not in `.gantry/baseline.json`),
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

export const BASELINE = ".gantry/baseline.json";
/** Pre-rename location, still read for one release. */
const LEGACY_BASELINE = ".preflight/baseline.json";
/** Cursor / Antigravity stop hooks have no `stop_hook_active`; cap our own auto follow-ups (Cursor's default cap is 5). */
const MAX_FOLLOWUPS = 3;
/** `git commit`, also with global options (`git -C dir commit`, `git -c k=v commit`). */
const COMMIT_RE = /(^|[;&|(]\s*|\s)git\s+(-\S+(\s+[^-\s]\S*)?\s+)*commit\b/;

type Json = Record<string, any>;

function readBaseline(root: string): Set<string> {
  for (const rel of [BASELINE, LEGACY_BASELINE]) {
    try {
      return new Set(JSON.parse(readFileSync(join(root, rel), "utf8")).fingerprints ?? []);
    } catch {}
  }
  return new Set();
}

export function writeBaseline(root: string, report: Pick<AuditReport, "findings">): void {
  const fingerprints = [...new Set(report.findings.filter((f) => f.blocking && f.fingerprint).map((f) => f.fingerprint!))].sort();
  mkdirSync(dirname(join(root, BASELINE)), { recursive: true });
  writeFileSync(
    join(root, BASELINE),
    `${JSON.stringify({ note: "Blocking findings accepted when `gantry init` ran. Agent hooks only block on findings not listed here.", fingerprints }, null, 2)}\n`,
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
  `Gantry found ${fs.length} new launch blocker(s) in your changes. Fix them before finishing (don't weaken auth/RLS/validation; suppress a confirmed false positive with \`// gantry-ignore <RULE-ID>\`):\n${renderCompact(report, fs)}`;

/** Cursor treats invalid or schema-mismatched JSON as a block, so every Cursor exit prints a valid "go ahead". */
const cursorAllow = (event: string) => JSON.stringify(event === "stop" ? {} : { permission: "allow" });

export interface HookResult {
  code: number;
  stdout?: string;
  stderr?: string;
}

const HOOK_AGENTS = ["claude", "cursor", "windsurf", "antigravity", "codex"] as const;
type HookAgent = (typeof HOOK_AGENTS)[number];

/**
 * Per-agent hook I/O contract (vendor docs, 2026-10):
 * - Claude Code / Codex: `stop_hook_active` loop guard, shell command in `tool_input.command`, block = exit 2 + stderr.
 * - Cursor: JSON on stdout for every exit (`followup_message` / `permission`), loop guard `loop_count`.
 * - Windsurf (Devin Desktop): command in `tool_info.command_line`, block = exit 2 + stderr. Its stop event
 *   (`post_cascade_response`) can't block, so the stop hook only reports (stdout, shown via `show_output`).
 * - Antigravity: JSON on stdout. Stop continues with `{decision:"continue"}`, only once fully idle after a model stop,
 *   capped by `executionNum`; `run_command` args in `toolCall.args.CommandLine`, deny = `{decision:"deny"}`.
 */
interface Contract {
  /** True = let the agent stop without scanning (loop guard, aborted turn). */
  skipStop(input: Json): boolean;
  command(input: Json): unknown;
  allow?: (event: string) => string;
  block(event: string, msg: string, n: number): HookResult;
}
const exit2: Contract["block"] = (_e, msg) => ({ code: 2, stderr: msg });
const CONTRACTS: Record<HookAgent, Contract> = {
  claude: { skipStop: (i) => !!i.stop_hook_active, command: (i) => i.tool_input?.command, block: exit2 },
  codex: { skipStop: (i) => !!i.stop_hook_active, command: (i) => i.tool_input?.command, block: exit2 },
  cursor: {
    skipStop: (i) => i.status !== "completed" || Number(i.loop_count ?? 0) >= MAX_FOLLOWUPS,
    command: (i) => i.command,
    allow: cursorAllow,
    block: (event, msg, n) => ({
      code: 0,
      stdout: JSON.stringify(
        event === "stop"
          ? { followup_message: msg }
          : { permission: "deny", user_message: `Gantry blocked the commit: ${n} new launch blocker(s).`, agent_message: msg },
      ),
    }),
  },
  windsurf: {
    skipStop: () => false,
    command: (i) => i.tool_info?.command_line,
    block: (event, msg) => (event === "stop" ? { code: 0, stdout: msg } : { code: 2, stderr: msg }),
  },
  antigravity: {
    skipStop: (i) => i.fullyIdle === false || (i.terminationReason ?? "model_stop") !== "model_stop" || Number(i.executionNum ?? 0) > MAX_FOLLOWUPS,
    command: (i) => i.toolCall?.args?.CommandLine,
    allow: () => "{}",
    block: (event, msg) => ({ code: 0, stdout: JSON.stringify({ decision: event === "stop" ? "continue" : "deny", reason: msg }) }),
  },
};

const hookAgent = (v: unknown): HookAgent => (HOOK_AGENTS.includes(v as HookAgent) ? (v as HookAgent) : "claude");

/** Pure hook decision (stdin JSON in, exit code + streams out) so tests don't spawn processes. */
export async function runHook(event: string, agent: string, input: Json, root: string): Promise<HookResult> {
  const c = CONTRACTS[hookAgent(agent)];
  const allow = (): HookResult => ({ code: 0, stdout: c.allow?.(event) });
  if (event === "stop") {
    if (c.skipStop(input)) return allow();
  } else if (event === "pre-commit") {
    if (!COMMIT_RE.test(String(c.command(input) ?? ""))) return allow();
  } else return { code: 2, stderr: `unknown hook event "${event}" (expected stop | pre-commit)` };

  const { report, findings } = await newBlockers(root);
  if (!findings.length) return allow();
  return c.block(event, message(report, findings), findings.length);
}

export async function main({ path, flags, event = "" }: { path: string; flags: Record<string, string | boolean>; event?: string }): Promise<number> {
  const agent = hookAgent(flags.agent);
  const allow = CONTRACTS[agent].allow?.(event);
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
    res = existsSync(root) ? await runHook(event, agent, input, root) : { code: 0, stdout: allow };
  } catch (e) {
    res = { code: 0, stderr: `gantry hook skipped: ${e instanceof Error ? e.message : String(e)}`, stdout: allow };
  }
  if (res.stdout) process.stdout.write(`${res.stdout}\n`);
  if (res.stderr) process.stderr.write(`${res.stderr}\n`);
  return res.code;
}
