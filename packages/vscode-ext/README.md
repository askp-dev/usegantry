# Gantry for VS Code

Runs the Gantry readiness scanner on your workspace and shows its findings as diagnostics.

- **Diagnostics and status bar.** Findings appear in the Problems panel. The status bar shows the readiness score. The scan runs again 1.5 s after you save.
- **Fix with AI Agent.** A CodeLens above each finding copies its remediation prompt to the clipboard and opens your AI agent's chat, if one is installed.
- **Mission Control sidebar.** The Readiness view shows the score, pillar breakdown and data-flow graph.

## Requirements

You need the `gantry` CLI on your `PATH`. Otherwise, set `gantry.command`, e.g. `["bun", "/path/to/packages/core/src/bin/cli.ts"]`. This setting is machine-scoped, so a workspace can't override it. The extension is disabled in untrusted workspaces.
