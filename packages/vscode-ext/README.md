# Gantry for VS Code

Runs the Gantry readiness scanner on your workspace and shows its findings as diagnostics.

- **Diagnostics and status bar.** Findings appear in the Problems panel. The status bar shows the readiness score. The scan runs again 1.5 s after you save.
- **Fix with AI Agent.** A CodeLens above each finding copies its remediation prompt to the clipboard and opens your AI agent's chat, if one is installed.
- **Mission Control sidebar.** The Readiness view shows the score, pillar breakdown and data-flow graph.

## Requirements

You need the `gantry` CLI on your `PATH`. Otherwise, set `gantry.command`, e.g. `["bun", "/path/to/packages/core/src/bin/cli.ts"]`. This setting is machine-scoped, so a workspace can't override it. The extension is disabled in untrusted workspaces.

## Editors

One `.vsix` is published to the VS Code Marketplace and to Open VSX. Cursor, Windsurf and Antigravity IDE install from Open VSX. **Fix with AI Agent** copies the prompt, then runs the first `gantry.agentCommands` entry the IDE has: Cursor's composer, `antigravity.sendPromptToAgentPanel`, Claude Code, Codex (`chatgpt.openSidebar`), and finally VS Code's built-in chat (prefilled, not sent). Run **Gantry (Developer): List Agent Chat Commands** to list your IDE's chat command IDs.

To wire the agent side (rules, MCP, hooks), run `gantry init --agent <claude|cursor|windsurf|antigravity|codex|all>`.

## Smoke test

`bun run test:edh` launches an Extension Development Host. It activates the extension, scans `fixtures/vulnerable-saas` and checks diagnostics, the Fix-with-Agent CodeLens, the clipboard prompt, the sidebar and the agent command list. CI runs it against VS Code stable. To run it against a fork, set `GANTRY_EDH_EXECUTABLE`, e.g. `"/Applications/Antigravity IDE.app/Contents/MacOS/Electron"`.

For IDEs that can't run the harness, use this manual checklist:

1. Install the `.vsix` (Extensions → … → Install from VSIX), open `fixtures/vulnerable-saas` and trust it.
2. **Gantry: Scan Workspace.** Problems shows Gantry diagnostics and the status bar shows a score.
3. Open `app/api/chat/route.ts`. You see the rule CodeLens and **✨ Fix with AI Agent**.
4. Click Fix with AI Agent. The prompt is on the clipboard, and the toast names the IDE's agent.
5. The Gantry activity-bar view renders the Readiness sidebar.
6. Run **Gantry (Developer): List Agent Chat Commands** and record the agent's command ID in `handoff.md`.

| IDE | Version | Result |
|---|---|---|
| VS Code | 1.142.0 | ✅ EDH harness, 2026-10-22: 98 diagnostics in 30 files, CodeLens, clipboard, sidebar; fix → `workbench.action.chat.open` |
| Antigravity IDE | 2.5.5 (VS Code 1.107.0) | ✅ EDH harness, 2026-10-22: same results; fix → `antigravity.sendPromptToAgentPanel`; gallery is Open VSX |
| Cursor | — | ⏳ not installed on the build machine; run the checklist |
| Windsurf (Devin Desktop) | — | ⏳ not installed on the build machine; run the checklist and record the Cascade command ID |
