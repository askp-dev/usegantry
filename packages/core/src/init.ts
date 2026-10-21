/**
 * `preflight init`: wires Preflight into the repo's agents and CI without clobbering anything.
 * Marker blocks are replaced in place, JSON configs are merged, existing user files are never overwritten.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileSafeHarbor } from "./compilers/safe-harbor";
import { buildRepoContext } from "./context/builder";
import { CONFIG_FILES } from "./context/config";
import { audit } from "./engine";
import { requireFeature } from "./entitlements";
import { BASELINE, writeBaseline } from "./hooks";

export type InitAction = { path: string; action: "created" | "updated" | "unchanged" | "skipped"; reason?: string };

const BEGIN = "<!-- PREFLIGHT:BEGIN -->";
const END = "<!-- PREFLIGHT:END -->";
export const MCP_SERVER = { command: "preflight", args: ["mcp"] };
// Claude Code runs hooks via the shell; $CLAUDE_PROJECT_DIR keeps the scan rooted even after the agent `cd`s.
export const CLAUDE_HOOKS = {
  stop: 'preflight hook stop --agent claude "$CLAUDE_PROJECT_DIR"',
  preCommit: 'preflight hook pre-commit --agent claude "$CLAUDE_PROJECT_DIR"',
};
export const CURSOR_HOOKS = { stop: "preflight hook stop --agent cursor", preCommit: "preflight hook pre-commit --agent cursor" };

const AGENT_GUIDE = `## Preflight launch-readiness checks
- Before declaring a feature done, run \`preflight scan\` (or the \`run_readiness_audit\` MCP tool) and fix every CRITICAL finding.
- Apply each finding's \`agentRemediationPrompt\` surgically; don't weaken auth, RLS, validation or webhook signature checks to make a finding disappear.
- Suppress a confirmed false positive only with \`// preflight-ignore <RULE-ID>\` plus a one-line justification.
- After adding or removing a third-party SDK, run \`preflight legal\` and review the diff before \`--apply\` (templates are not legal advice).
- Only run \`preflight attack\` against your local dev server.`;

const CURSOR_RULE = `---
description: Preflight launch-readiness guardrails
alwaysApply: true
---
${BEGIN}
${AGENT_GUIDE}
${END}
`;

const WORKFLOW = `name: preflight
on: [pull_request]
permissions:
  contents: read
  security-events: write
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 50 }
      - uses: oven-sh/setup-bun@v2
      - run: bunx preflight scan --sarif > preflight.sarif || true
      - uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: preflight.sarif }
      - run: bunx preflight scan
`;

/** Replace the marker block in place, or append it (an unchanged result means nothing to write). */
export function upsertBlock(existing: string, body: string): string {
  const block = `${BEGIN}\n${body}\n${END}`;
  const i = existing.indexOf(BEGIN);
  const j = existing.indexOf(END);
  if (i >= 0 && j > i) return existing.slice(0, i) + block + existing.slice(j + END.length);
  return existing.trim() ? `${existing.trimEnd()}\n\n${block}\n` : `${block}\n`;
}

/**
 * Append `entry` to `json.hooks[event]` unless a hook already runs `command` (idempotent, keeps the user's own hooks).
 * A malformed `hooks` / event value is left as-is rather than overwritten.
 */
function addHook(json: Record<string, any>, event: string, entry: Record<string, unknown>, command: string): boolean {
  if (json.hooks === undefined) json.hooks = {};
  const hooks = json.hooks;
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) return false;
  if (hooks[event] === undefined) hooks[event] = [];
  const list = hooks[event];
  if (!Array.isArray(list) || JSON.stringify(list).includes(JSON.stringify(command))) return false;
  list.push(entry);
  return true;
}

export function initProject(root: string, opts: { ci?: boolean; hooks?: boolean; preCommit?: boolean } = {}): InitAction[] {
  requireFeature("init");
  const out: InitAction[] = [];
  const put = (rel: string, next: string, prev: string | null) => {
    if (prev === next) return out.push({ path: rel, action: "unchanged" });
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), next);
    out.push({ path: rel, action: prev === null ? "created" : "updated" });
  };
  const read = (rel: string) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : null);

  const rule = ".cursor/rules/preflight.mdc";
  const prevRule = read(rule);
  put(rule, prevRule === null ? CURSOR_RULE : upsertBlock(prevRule, AGENT_GUIDE), prevRule);

  const claude = read("CLAUDE.md");
  put("CLAUDE.md", upsertBlock(claude ?? "", AGENT_GUIDE), claude);

  if (CONFIG_FILES.some((f) => existsSync(join(root, f))))
    out.push({ path: CONFIG_FILES.find((f) => existsSync(join(root, f)))!, action: "skipped", reason: "config already exists" });
  else
    put(
      "preflight.config.json",
      `${JSON.stringify({ mode: "commercial", companyName: "", contactEmail: "", securityContact: "", siteUrl: "", jurisdiction: "US-DE", legalDir: "legal", ignoreRules: [], ignorePaths: [] }, null, 2)}\n`,
      null,
    );

  /** Merge into a JSON config; `apply` returns false when Preflight is already wired (nothing to write). */
  const mergeJson = (rel: string, apply: (json: any) => boolean) => {
    const prev = read(rel);
    let json: any = {};
    if (prev !== null) {
      try {
        json = JSON.parse(prev);
      } catch {
        out.push({ path: rel, action: "skipped", reason: "existing file is not valid JSON; left untouched" });
        return;
      }
    }
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      out.push({ path: rel, action: "skipped", reason: "existing file is not a JSON object; left untouched" });
      return;
    }
    if (!apply(json)) return void out.push({ path: rel, action: "unchanged" });
    put(rel, `${JSON.stringify(json, null, 2)}\n`, prev);
  };

  for (const rel of [".mcp.json", ".cursor/mcp.json"])
    mergeJson(rel, (json) => {
      if (json.mcpServers?.preflight) return false;
      json.mcpServers = { ...(json.mcpServers ?? {}), preflight: MCP_SERVER };
      return true;
    });

  if (opts.hooks !== false) {
    mergeJson(".claude/settings.json", (json) => {
      let changed = addHook(json, "Stop", { hooks: [{ type: "command", command: CLAUDE_HOOKS.stop }] }, CLAUDE_HOOKS.stop);
      if (opts.preCommit)
        changed =
          addHook(json, "PreToolUse", { matcher: "Bash", hooks: [{ type: "command", command: CLAUDE_HOOKS.preCommit }] }, CLAUDE_HOOKS.preCommit) || changed;
      return changed;
    });
    mergeJson(".cursor/hooks.json", (json) => {
      json.version ??= 1;
      let changed = addHook(json, "stop", { command: CURSOR_HOOKS.stop }, CURSOR_HOOKS.stop);
      if (opts.preCommit)
        changed = addHook(json, "beforeShellExecution", { command: CURSOR_HOOKS.preCommit, matcher: "git.*commit" }, CURSOR_HOOKS.preCommit) || changed;
      return changed;
    });
  }

  if (opts.ci) {
    const wf = ".github/workflows/preflight.yml";
    if (read(wf) !== null) out.push({ path: wf, action: "skipped", reason: "workflow already exists" });
    else put(wf, WORKFLOW, null);
  }
  return out;
}

/** Snapshot today's blocking findings so agent hooks only block on new ones. Never overwrites an existing baseline. */
export async function initBaseline(root: string): Promise<InitAction> {
  if (existsSync(join(root, BASELINE))) return { path: BASELINE, action: "unchanged" };
  writeBaseline(root, await audit(root, { config: { offline: true } }));
  return { path: BASELINE, action: "created" };
}

/** SECURITY.md, security.txt, robots.txt and ai.txt. Creates or refreshes only files Preflight generated. */
export async function initSafeHarbor(root: string): Promise<InitAction[]> {
  const { changes, skipped } = compileSafeHarbor(await buildRepoContext(root, { config: { offline: true } }), { apply: true });
  return [
    ...changes.map((c): InitAction => ({ path: c.path, action: c.before ? "updated" : "created" })),
    ...skipped.map((s): InitAction => ({ path: s.path, action: "skipped", reason: s.reason })),
  ];
}

export async function main({ path, flags }: { path: string; flags: Record<string, string | boolean> }): Promise<number> {
  const hooks = flags["no-hooks"] !== true;
  const actions = initProject(path, { ci: flags.ci === true, hooks, preCommit: flags["pre-commit"] === true });
  actions.push(...(await initSafeHarbor(path)));
  if (hooks) actions.push(await initBaseline(path));
  for (const a of actions) console.log(`${a.action.padEnd(9)} ${a.path}${a.reason ? `  (${a.reason})` : ""}`);
  return 0;
}
