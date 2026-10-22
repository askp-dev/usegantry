/** Agent chat commands per host IDE. Pure (no `vscode` import) so the bun tests can cover it. */

/** Command IDs whose name suggests an AI chat/agent entry point (`gantry.debugAgentCommands` lists these). */
export const AGENT_COMMAND_RE = /chat|agent|cascade|composer|codex|claude|antigravity/i;

/** Known command ID prefix → the agent it opens (toast wording). */
const AGENTS: Array<[RegExp, string]> = [
  [/^(composer|aichat)\./, "Cursor"],
  [/^windsurf\.|cascade/i, "Cascade"],
  [/^antigravity\./, "the Antigravity agent"],
  [/^chatgpt\./, "Codex"],
  [/^claude-vscode\./, "Claude Code"],
  [/^workbench\.action\.chat\./, "VS Code Chat"],
];

/** The agent a command opens, or the host's native agent when nothing ran (`vscode.env.appName`). */
export function agentLabel(cmd: string | undefined, appName: string): string {
  const hit = cmd && AGENTS.find(([re]) => re.test(cmd));
  if (hit) return hit[1];
  if (/cursor/i.test(appName)) return "Cursor";
  if (/windsurf|devin/i.test(appName)) return "Cascade";
  if (/antigravity/i.test(appName)) return "the Antigravity agent";
  return "your AI agent";
}

/** First configured command the host actually has (the prompt is already on the clipboard either way). */
export const pickAgentCommand = (configured: readonly string[], available: ReadonlySet<string>) => configured.find((c) => available.has(c));
