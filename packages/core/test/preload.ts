import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Inherited by CLI/MCP subprocesses too. Tests that exercise the network rules pass `offline: false` with a stubbed fetch.
process.env.GANTRY_OFFLINE = "1";
process.env.GANTRY_ADVISORY_CACHE = mkdtempSync(join(tmpdir(), "gantry-test-adv-"));
