import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseToml } from "../src/context/toml";
import { VERSION } from "../src/engine";
import { ANTIGRAVITY_HOOKS, CODEX_HOOKS, detectAgents, initProject, MCP_SERVER, parseAgents, upsertBlock, WINDSURF_HOOKS } from "../src/init";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "gantry-init-"));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const read = (root: string, rel: string) => readFileSync(join(root, rel), "utf8");

describe("upsertBlock", () => {
  test("appends when absent, replaces in place when present, preserves surrounding text", () => {
    const first = upsertBlock("# My rules\n\nKeep me.", "BODY-1");
    expect(first).toContain("Keep me.");
    expect(first).toContain("<!-- GANTRY:BEGIN -->\nBODY-1\n<!-- GANTRY:END -->");
    const second = upsertBlock(`${first}\n\nAlso keep this tail.`, "BODY-2");
    expect(second).toContain("BODY-2");
    expect(second).not.toContain("BODY-1");
    expect(second).toContain("Keep me.");
    expect(second).toContain("Also keep this tail.");
    expect((second.match(/GANTRY:BEGIN/g) ?? []).length).toBe(1);
  });
});

describe("initProject", () => {
  test("CI workflow is written only with the flag", () => {
    const noCi = initProject(tmp());
    expect(noCi.find((a) => a.path === ".github/workflows/gantry.yml")).toBeUndefined();
    const withCi = initProject(tmp(), { ci: true });
    expect(withCi.find((a) => a.path === ".github/workflows/gantry.yml")?.action).toBe("created");
  });

  test("fresh repo creates all guardrail files", () => {
    const root = tmp();
    const paths = initProject(root, { ci: true });
    const created = new Set(paths.filter((a) => a.action === "created").map((a) => a.path));
    expect(created.has(".cursor/rules/gantry.mdc")).toBe(true);
    expect(created.has(".github/workflows/gantry.yml")).toBe(true);
    expect(read(root, ".cursor/rules/gantry.mdc")).toContain("gantry scan");
    expect(JSON.parse(read(root, ".mcp.json")).mcpServers.gantry).toEqual(MCP_SERVER);
    expect(read(root, ".github/workflows/gantry.yml")).toContain("gantry scan --sarif");
    // Daily advisory re-check: issue-only (no contents: write), pinned to this release.
    const adv = read(root, ".github/workflows/gantry-advisories.yml");
    expect(adv).toContain("gantry scan . --only DEP-01,DEP-02 --json");
    expect(adv).toContain(`GANTRY_VERSION: "${VERSION}"`);
    expect(adv).not.toMatch(/contents:\s*write|git push|git commit/);
  });

  test("idempotent: a second run changes nothing", () => {
    const root = tmp();
    initProject(root, { ci: true });
    const second = initProject(root, { ci: true });
    expect(second.every((a) => a.action === "unchanged" || a.action === "skipped")).toBe(true);
  });

  test("preserves existing CLAUDE.md content and merges MCP servers", () => {
    const root = tmp();
    writeFileSync(join(root, "CLAUDE.md"), "# Project\n\nExisting house rules.\n");
    writeFileSync(join(root, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    initProject(root);
    const claude = read(root, "CLAUDE.md");
    expect(claude).toContain("Existing house rules.");
    expect(claude).toContain("GANTRY:BEGIN");
    const mcp = JSON.parse(read(root, ".mcp.json"));
    expect(mcp.mcpServers.other).toEqual({ command: "x" });
    expect(mcp.mcpServers.gantry).toEqual(MCP_SERVER);
  });

  test("never clobbers an existing gantry config or invalid-JSON mcp file", () => {
    const root = tmp();
    writeFileSync(join(root, "gantry.config.json"), `{"mode":"open-source","companyName":"Mine"}`);
    writeFileSync(join(root, ".mcp.json"), "{ not json");
    const actions = initProject(root);
    expect(JSON.parse(read(root, "gantry.config.json")).companyName).toBe("Mine");
    expect(actions.find((a) => a.path === "gantry.config.json")?.action).toBe("skipped");
    expect(read(root, ".mcp.json")).toBe("{ not json");
    expect(actions.find((a) => a.path === ".mcp.json")?.reason).toMatch(/not valid JSON/);
  });
});

describe("init --agent", () => {
  const settled = (as: { action: string }[]) => as.every((a) => ["unchanged", "skipped", "manual"].includes(a.action));
  test("detects agents from existing dirs, defaults to claude + cursor, rejects typos", () => {
    expect(detectAgents(tmp())).toEqual(["claude", "cursor"]);
    const root = tmp();
    mkdirSync(join(root, ".windsurf"));
    writeFileSync(join(root, "AGENTS.md"), "# agents\n");
    expect(detectAgents(root)).toEqual(["windsurf", "codex"]);
    expect(parseAgents(root, "all")).toHaveLength(5);
    expect(parseAgents(root, "Codex, cursor")).toEqual(["codex", "cursor"]);
    expect(() => parseAgents(root, "claud")).toThrow(/unknown --agent claud/);
  });

  test("all agents: rules, MCP, hooks; user-level Windsurf MCP printed, not written; idempotent", () => {
    const root = tmp();
    writeFileSync(join(root, "AGENTS.md"), "# House rules\n\nKeep me.\n");
    mkdirSync(join(root, ".codex"));
    writeFileSync(join(root, ".codex/config.toml"), 'model = "o3"\n\n[mcp_servers.other]\ncommand = "x"\n');
    const first = initProject(root, { agents: ["windsurf", "antigravity", "codex"], preCommit: true });
    const by = Object.fromEntries(first.map((a) => [a.path, a]));
    expect(by["~/.config/devin/mcp_config.json"].action).toBe("manual");
    expect(by["~/.config/devin/mcp_config.json"].reason).toContain('"gantry":{"command":"gantry","args":["mcp"]}');
    expect(by[".codex/config.toml"].reason).toMatch(/trust/);
    expect(existsSync(join(root, ".cursor"))).toBe(false); // only the requested agents

    expect(read(root, ".windsurf/rules/gantry.md")).toStartWith("---\ntrigger: always_on\n");
    expect(read(root, ".agents/rules/gantry.md")).toContain("gantry scan");
    expect(read(root, "AGENTS.md")).toContain("Keep me.");
    expect(read(root, "AGENTS.md")).toContain("GANTRY:BEGIN");

    const toml = parseToml(read(root, ".codex/config.toml"))!;
    expect(toml.model).toBe("o3");
    expect(toml.mcp_servers).toEqual({ other: { command: "x" }, gantry: MCP_SERVER });
    expect(JSON.parse(read(root, ".agents/mcp_config.json")).mcpServers.gantry).toEqual(MCP_SERVER);

    expect(JSON.parse(read(root, ".windsurf/hooks.json")).hooks).toEqual({
      post_cascade_response: [{ command: WINDSURF_HOOKS.stop, show_output: true }],
      pre_run_command: [{ command: WINDSURF_HOOKS.preCommit, show_output: true }],
    });
    expect(JSON.parse(read(root, ".agents/hooks.json"))).toEqual({
      "gantry-stop": { Stop: [{ hooks: [{ type: "command", command: ANTIGRAVITY_HOOKS.stop }] }] },
      "gantry-pre-commit": { PreToolUse: [{ matcher: "run_command", hooks: [{ type: "command", command: ANTIGRAVITY_HOOKS.preCommit }] }] },
    });
    const codex = JSON.parse(read(root, ".codex/hooks.json")).hooks;
    expect(codex.Stop).toEqual([{ hooks: [{ type: "command", command: CODEX_HOOKS.stop }] }]);
    expect(codex.PreToolUse[0].matcher).toBe("Bash");

    expect(settled(initProject(root, { agents: ["windsurf", "antigravity", "codex"], preCommit: true }))).toBe(true);
  });

  test("Devin Desktop dir wins over legacy .windsurf; unreadable TOML is left untouched", () => {
    const root = tmp();
    mkdirSync(join(root, ".devin"));
    mkdirSync(join(root, ".codex"));
    writeFileSync(join(root, ".codex/config.toml"), "not = [toml");
    const a = initProject(root, { agents: ["windsurf", "codex"] });
    expect(existsSync(join(root, ".devin/rules/gantry.md"))).toBe(true);
    expect(existsSync(join(root, ".devin/hooks.json"))).toBe(true);
    expect(existsSync(join(root, ".windsurf"))).toBe(false);
    expect(a.find((x) => x.path === ".codex/config.toml")?.action).toBe("skipped");
    expect(read(root, ".codex/config.toml")).toBe("not = [toml");
  });
});
