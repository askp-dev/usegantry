/**
 * `gantry init`: wires Gantry into the repo's agents and CI without clobbering anything.
 * Marker blocks are replaced in place, JSON configs are merged, existing user files are never overwritten.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compileSafeHarbor } from "./compilers/safe-harbor";
import { buildRepoContext } from "./context/builder";
import { CONFIG_FILES } from "./context/config";
import { parseToml } from "./context/toml";
import { audit } from "./engine";
import { requireFeature } from "./entitlements";
import { BASELINE, writeBaseline } from "./hooks";
import ADVISORIES_WORKFLOW from "./templates/gantry-advisories.yml" with { type: "text" };

/** `manual` = user-level config Gantry won't write into `$HOME`; `reason` carries the snippet to paste. */
export type InitAction = { path: string; action: "created" | "updated" | "unchanged" | "skipped" | "manual"; reason?: string };

export const INIT_AGENTS = ["claude", "cursor", "windsurf", "antigravity", "codex"] as const;
export type InitAgent = (typeof INIT_AGENTS)[number];

const BEGIN = "<!-- GANTRY:BEGIN -->";
const END = "<!-- GANTRY:END -->";
export const MCP_SERVER = { command: "gantry", args: ["mcp"] };
// Claude Code runs hooks via the shell; $CLAUDE_PROJECT_DIR keeps the scan rooted even after the agent `cd`s.
export const CLAUDE_HOOKS = {
  stop: 'gantry hook stop --agent claude "$CLAUDE_PROJECT_DIR"',
  preCommit: 'gantry hook pre-commit --agent claude "$CLAUDE_PROJECT_DIR"',
};
export const CURSOR_HOOKS = { stop: "gantry hook stop --agent cursor", preCommit: "gantry hook pre-commit --agent cursor" };
// Windsurf runs hooks in the workspace root; Antigravity's hook cwd is undocumented but its agent runs in the workspace.
export const WINDSURF_HOOKS = { stop: "gantry hook stop --agent windsurf", preCommit: "gantry hook pre-commit --agent windsurf" };
export const ANTIGRAVITY_HOOKS = { stop: "gantry hook stop --agent antigravity", preCommit: "gantry hook pre-commit --agent antigravity" };
// Codex runs hooks in the session cwd (may be a subdirectory); its docs resolve the repo root with git.
const CODEX_ROOT = '"$(git rev-parse --show-toplevel 2>/dev/null || pwd)"';
export const CODEX_HOOKS = { stop: `gantry hook stop --agent codex ${CODEX_ROOT}`, preCommit: `gantry hook pre-commit --agent codex ${CODEX_ROOT}` };
const CODEX_MCP = `[mcp_servers.gantry]\ncommand = "${MCP_SERVER.command}"\nargs = ${JSON.stringify(MCP_SERVER.args)}\n`;

const AGENT_GUIDE = `## Gantry launch-readiness checks
- Before declaring a feature done, run \`gantry scan\` (or the \`run_readiness_audit\` MCP tool) and fix every CRITICAL finding.
- Apply each finding's \`agentRemediationPrompt\` surgically; don't weaken auth, RLS, validation or webhook signature checks to make a finding disappear.
- Suppress a confirmed false positive only with \`// gantry-ignore <RULE-ID>\` plus a one-line justification.
- After adding or removing a third-party SDK, run \`gantry legal\` and review the diff before \`--sync\` (templates are not legal advice).
- Only run \`gantry attack\` against your local dev server.`;

const CURSOR_RULE = `---
description: Gantry launch-readiness guardrails
alwaysApply: true
---
${BEGIN}
${AGENT_GUIDE}
${END}
`;

/** Windsurf / Antigravity workspace rules: one Markdown file, `trigger` frontmatter required by Antigravity. */
const ALWAYS_ON_RULE = `---
trigger: always_on
description: Gantry launch-readiness guardrails
---
${BEGIN}
${AGENT_GUIDE}
${END}
`;

/** Agents whose config dirs already exist; claude + cursor when none do (the pre-`--agent` default). */
export function detectAgents(root: string): InitAgent[] {
  const has = (...rels: string[]) => rels.some((r) => existsSync(join(root, r)));
  const found = INIT_AGENTS.filter(
    (a) =>
      ({
        claude: has(".claude", "CLAUDE.md", ".mcp.json"),
        cursor: has(".cursor", ".cursorrules"),
        windsurf: has(".windsurf", ".devin", ".windsurfrules"),
        antigravity: has(".agents", ".agent"),
        codex: has(".codex", "AGENTS.md"),
      })[a],
  );
  return found.length ? found : ["claude", "cursor"];
}

/** `--agent claude,codex` / `--agent all` / absent (detect). Unknown names throw so a typo never silently wires nothing. */
export function parseAgents(root: string, flag: string | boolean | undefined): InitAgent[] {
  if (typeof flag !== "string") return detectAgents(root);
  const names = flag.split(",").map((s) => s.trim().toLowerCase());
  if (names.includes("all")) return [...INIT_AGENTS];
  const bad = names.filter((n) => !INIT_AGENTS.includes(n as InitAgent));
  if (bad.length) throw new Error(`unknown --agent ${bad.join(", ")} (expected ${INIT_AGENTS.join(" | ")} | all)`);
  return names as InitAgent[];
}

const WORKFLOW = `name: gantry
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
      - run: bunx gantry scan --sarif > gantry.sarif || true
      - uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: gantry.sarif }
      - run: bunx gantry scan
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

export function initProject(root: string, opts: { ci?: boolean; hooks?: boolean; preCommit?: boolean; agents?: readonly InitAgent[] } = {}): InitAction[] {
  requireFeature("init");
  const agents = new Set(opts.agents ?? detectAgents(root));
  const hooks = opts.hooks !== false;
  const out: InitAction[] = [];
  const put = (rel: string, next: string, prev: string | null, reason?: string) => {
    if (prev === next) return out.push({ path: rel, action: "unchanged" });
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), next);
    out.push({ path: rel, action: prev === null ? "created" : "updated", ...(reason ? { reason } : {}) });
  };
  const read = (rel: string) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : null);
  /** A rule file Gantry owns (created whole) or a user file it upserts its marker block into. */
  const ruleFile = (rel: string, fresh?: string) => {
    const prev = read(rel);
    put(rel, prev === null && fresh ? fresh : upsertBlock(prev ?? "", AGENT_GUIDE), prev);
  };

  /** Merge into a JSON config; `apply` returns false when Gantry is already wired (nothing to write). */
  const mergeJson = (rel: string, apply: (json: any) => boolean, reason?: string) => {
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
    put(rel, `${JSON.stringify(json, null, 2)}\n`, prev, reason);
  };
  const addMcp = (json: any) => {
    if (json.mcpServers?.gantry) return false;
    json.mcpServers = { ...(json.mcpServers ?? {}), gantry: MCP_SERVER };
    return true;
  };

  if (agents.has("cursor")) ruleFile(".cursor/rules/gantry.mdc", CURSOR_RULE);
  if (agents.has("claude")) ruleFile("CLAUDE.md");
  if (agents.has("codex")) ruleFile("AGENTS.md");
  // Windsurf is now Devin Desktop: `.devin/` wins when present, `.windsurf/` is read by both old and new builds.
  const ws = existsSync(join(root, ".devin")) ? ".devin" : ".windsurf";
  if (agents.has("windsurf")) ruleFile(`${ws}/rules/gantry.md`, ALWAYS_ON_RULE);
  if (agents.has("antigravity")) ruleFile(".agents/rules/gantry.md", ALWAYS_ON_RULE);

  if (CONFIG_FILES.some((f) => existsSync(join(root, f))))
    out.push({ path: CONFIG_FILES.find((f) => existsSync(join(root, f)))!, action: "skipped", reason: "config already exists" });
  else
    put(
      "gantry.config.json",
      `${JSON.stringify({ mode: "commercial", companyName: "", contactEmail: "", securityContact: "", siteUrl: "", jurisdiction: "US-DE", legalDir: "legal", ignoreRules: [], ignorePaths: [] }, null, 2)}\n`,
      null,
    );

  if (agents.has("claude")) mergeJson(".mcp.json", addMcp);
  if (agents.has("cursor")) mergeJson(".cursor/mcp.json", addMcp);
  if (agents.has("antigravity")) mergeJson(".agents/mcp_config.json", addMcp);
  if (agents.has("windsurf"))
    out.push({
      path: "~/.config/devin/mcp_config.json",
      action: "manual",
      reason: `Windsurf/Devin MCP config is user-level only (legacy ~/.codeium/windsurf/mcp_config.json); add: ${JSON.stringify({ mcpServers: { gantry: MCP_SERVER } })}`,
    });
  if (agents.has("codex")) {
    const rel = ".codex/config.toml";
    const prev = read(rel);
    const toml = prev === null ? {} : parseToml(prev);
    const servers = toml?.mcp_servers as Record<string, unknown> | undefined;
    if (!toml) out.push({ path: rel, action: "skipped", reason: "existing file is not TOML Gantry can read; left untouched" });
    else if (servers?.gantry) out.push({ path: rel, action: "unchanged" });
    else put(rel, prev?.trim() ? `${prev.trimEnd()}\n\n${CODEX_MCP}` : CODEX_MCP, prev, "Codex loads project config only once you trust the project");
  }

  if (hooks) {
    const hook = (command: string, extra: Record<string, unknown> = {}) => ({ ...extra, hooks: [{ type: "command", command }] });
    if (agents.has("claude"))
      mergeJson(".claude/settings.json", (json) => {
        let changed = addHook(json, "Stop", hook(CLAUDE_HOOKS.stop), CLAUDE_HOOKS.stop);
        if (opts.preCommit) changed = addHook(json, "PreToolUse", hook(CLAUDE_HOOKS.preCommit, { matcher: "Bash" }), CLAUDE_HOOKS.preCommit) || changed;
        return changed;
      });
    if (agents.has("cursor"))
      mergeJson(".cursor/hooks.json", (json) => {
        json.version ??= 1;
        let changed = addHook(json, "stop", { command: CURSOR_HOOKS.stop }, CURSOR_HOOKS.stop);
        if (opts.preCommit)
          changed = addHook(json, "beforeShellExecution", { command: CURSOR_HOOKS.preCommit, matcher: "git.*commit" }, CURSOR_HOOKS.preCommit) || changed;
        return changed;
      });
    if (agents.has("windsurf"))
      mergeJson(`${ws}/hooks.json`, (json) => {
        // post_cascade_response can't block: the stop hook reports, `show_output` surfaces it in Cascade.
        let changed = addHook(json, "post_cascade_response", { command: WINDSURF_HOOKS.stop, show_output: true }, WINDSURF_HOOKS.stop);
        if (opts.preCommit)
          changed = addHook(json, "pre_run_command", { command: WINDSURF_HOOKS.preCommit, show_output: true }, WINDSURF_HOOKS.preCommit) || changed;
        return changed;
      });
    if (agents.has("antigravity"))
      // Antigravity keys hooks by name at the top level: { "<name>": { "<Event>": [matcher groups] } }.
      mergeJson(".agents/hooks.json", (json) => {
        let changed = false;
        const named = (name: string, event: string, entry: Record<string, unknown>) => {
          if (JSON.stringify(json).includes(JSON.stringify((entry.hooks as Array<{ command: string }>)[0].command))) return;
          json[name] = { [event]: [entry] };
          changed = true;
        };
        named("gantry-stop", "Stop", hook(ANTIGRAVITY_HOOKS.stop));
        if (opts.preCommit) named("gantry-pre-commit", "PreToolUse", hook(ANTIGRAVITY_HOOKS.preCommit, { matcher: "run_command" }));
        return changed;
      });
    if (agents.has("codex"))
      mergeJson(
        ".codex/hooks.json",
        (json) => {
          let changed = addHook(json, "Stop", hook(CODEX_HOOKS.stop), CODEX_HOOKS.stop);
          if (opts.preCommit) changed = addHook(json, "PreToolUse", hook(CODEX_HOOKS.preCommit, { matcher: "Bash" }), CODEX_HOOKS.preCommit) || changed;
          return changed;
        },
        "Codex loads project hooks only once you trust the project",
      );
  }

  if (opts.ci)
    for (const [wf, body] of [
      [".github/workflows/gantry.yml", WORKFLOW],
      // Daily DEP-01/02 re-check: one issue, never a commit.
      [".github/workflows/gantry-advisories.yml", ADVISORIES_WORKFLOW],
    ] as const) {
      if (read(wf) !== null) out.push({ path: wf, action: "skipped", reason: "workflow already exists" });
      else put(wf, body, null);
    }
  return out;
}

/** Snapshot today's blocking findings so agent hooks only block on new ones. Never overwrites an existing baseline. */
export async function initBaseline(root: string): Promise<InitAction> {
  if (existsSync(join(root, BASELINE))) return { path: BASELINE, action: "unchanged" };
  writeBaseline(root, await audit(root, { config: { offline: true } }));
  return { path: BASELINE, action: "created" };
}

/** SECURITY.md, security.txt, robots.txt and ai.txt. Creates or refreshes only files Gantry generated. */
export async function initSafeHarbor(root: string): Promise<InitAction[]> {
  const { changes, skipped } = compileSafeHarbor(await buildRepoContext(root, { config: { offline: true } }), { apply: true });
  return [
    ...changes.map((c): InitAction => ({ path: c.path, action: c.before ? "updated" : "created" })),
    ...skipped.map((s): InitAction => ({ path: s.path, action: "skipped", reason: s.reason })),
  ];
}

export async function main({ path, flags }: { path: string; flags: Record<string, string | boolean> }): Promise<number> {
  const hooks = flags["no-hooks"] !== true;
  let agents: InitAgent[];
  try {
    agents = parseAgents(path, flags.agent);
  } catch (e) {
    console.error(`gantry init: ${(e as Error).message}`);
    return 2;
  }
  const actions = initProject(path, { ci: flags.ci === true, hooks, preCommit: flags["pre-commit"] === true, agents });
  actions.push(...(await initSafeHarbor(path)));
  if (hooks) actions.push(await initBaseline(path));
  for (const a of actions) console.log(`${a.action.padEnd(9)} ${a.path}${a.reason ? `  (${a.reason})` : ""}`);
  return 0;
}
