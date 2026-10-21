import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
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
