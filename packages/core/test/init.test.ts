import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initProject, MCP_SERVER, upsertBlock } from "../src/init";

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
