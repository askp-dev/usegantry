/**
 * Extension Development Host smoke test (closes handoff quirk 26).
 * `bun run test:edh` downloads VS Code stable; set `GANTRY_EDH_EXECUTABLE` to run a fork instead
 * (e.g. "/Applications/Antigravity IDE.app/Contents/MacOS/Electron"). `GANTRY_EDH_OUT` saves the result JSON.
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runTests } from "@vscode/test-electron";

const ext = resolve(import.meta.dir, "..");
const repo = resolve(ext, "../..");
const tmp = mkdtempSync(join(tmpdir(), "gantry-edh-"));
const workspace = join(tmp, "vulnerable-saas");
cpSync(join(repo, "fixtures/vulnerable-saas"), workspace, { recursive: true });
// Fresh profile: trust off (the extension refuses untrusted workspaces), scanner = this checkout's CLI.
mkdirSync(join(tmp, "user/User"), { recursive: true });
writeFileSync(
  join(tmp, "user/User/settings.json"),
  JSON.stringify({
    "security.workspace.trust.enabled": false,
    "gantry.command": [process.execPath, join(repo, "packages/core/src/bin/cli.ts")],
    "gantry.scanOnSave": false,
  }),
);

let code = 0;
try {
  await runTests({
    ...(process.env.GANTRY_EDH_EXECUTABLE ? { vscodeExecutablePath: process.env.GANTRY_EDH_EXECUTABLE } : {}),
    extensionDevelopmentPath: ext,
    extensionTestsPath: join(ext, "test/suite.cjs"),
    launchArgs: [
      workspace,
      "--disable-extensions",
      "--user-data-dir",
      join(tmp, "user"),
      "--extensions-dir",
      join(tmp, "extensions"),
      "--skip-welcome",
      "--skip-release-notes",
    ],
    extensionTestsEnv: { GANTRY_OFFLINE: "1", ...(process.env.GANTRY_EDH_OUT ? { GANTRY_EDH_OUT: resolve(process.env.GANTRY_EDH_OUT) } : {}) },
  });
} catch (e) {
  console.error(`EDH smoke test failed: ${e instanceof Error ? e.message : e}`);
  code = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(code);
