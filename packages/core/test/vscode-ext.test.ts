import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import manifest from "../../vscode-ext/package.json";
import { AGENT_COMMAND_RE, agentLabel, pickAgentCommand } from "../../vscode-ext/src/agents";
import { runScan } from "../../vscode-ext/src/scan";

// The extension shells out to the CLI; exercise that bridge exactly as VS Code would.
const CLI = ["bun", resolve("packages/core/src/bin/cli.ts")];

describe("vscode-ext scan bridge", () => {
  test("parses the report even though blockers make the CLI exit 1", async () => {
    const report = await runScan(CLI, resolve("fixtures/vulnerable-saas"));
    expect(report.status).toBe("LAUNCH_BLOCKED");
    expect(report.findings.every((f) => f.file && f.line >= 1 && f.agentRemediationPrompt)).toBe(true);
  });
  test("clean fixture yields zero findings", async () => {
    const report = await runScan(CLI, resolve("fixtures/clean-saas"));
    expect(report.findings).toEqual([]);
    expect(report.status).toBe("LAUNCH_READY");
  });
  test("surfaces a missing binary as an error instead of hanging", async () => {
    await expect(runScan(["gantry-does-not-exist-xyz"], resolve("fixtures/clean-saas"))).rejects.toThrow();
  });
});

describe("vscode-ext agent routing", () => {
  test("labels by the command that ran, else by the host IDE", () => {
    expect(agentLabel("antigravity.sendPromptToAgentPanel", "Antigravity IDE")).toBe("the Antigravity agent");
    expect(agentLabel("chatgpt.openSidebar", "Visual Studio Code")).toBe("Codex");
    expect(agentLabel("workbench.action.chat.open", "Visual Studio Code")).toBe("VS Code Chat");
    expect(agentLabel(undefined, "Windsurf")).toBe("Cascade");
    expect(agentLabel(undefined, "Cursor")).toBe("Cursor");
    expect(agentLabel(undefined, "Visual Studio Code")).toBe("your AI agent");
  });
  test("first configured command the host has wins; defaults ship host agents before VS Code chat", () => {
    const defaults: string[] = manifest.contributes.configuration.properties["gantry.agentCommands"].default;
    expect(pickAgentCommand(defaults, new Set(["workbench.action.chat.open", "antigravity.sendPromptToAgentPanel"]))).toBe(
      "antigravity.sendPromptToAgentPanel",
    );
    expect(pickAgentCommand(defaults, new Set(["x"]))).toBeUndefined();
    expect(defaults.at(-1)).toBe("workbench.action.chat.open");
    expect(manifest.contributes.configuration.properties["gantry.agentCommands"].scope).toBe("machine");
    expect(manifest.contributes.commands.map((c: { command: string }) => c.command)).toContain("gantry.debugAgentCommands");
    expect(AGENT_COMMAND_RE.test("antigravity.sendPromptToAgentPanel") && !AGENT_COMMAND_RE.test("editor.action.format")).toBe(true);
  });
});
