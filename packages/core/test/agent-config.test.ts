// biome-ignore-all lint/suspicious/noTemplateCurlyInString: MCP configs use literal `${VAR}` references; that is what these tests feed in.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildRepoContext } from "../src/context/builder";
import { initProject } from "../src/init";
import { mcp01HardcodedCreds } from "../src/rules/agent/mcp-01-hardcoded-creds";
import { mcp02UnpinnedServers, serverPackage } from "../src/rules/agent/mcp-02-unpinned-servers";
import { parseJsonc, stringLeaves } from "../src/rules/agent/mcp-config";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
function repo(files: Record<string, string>): string {
  const d = mkdtempSync(join(tmpdir(), "gantry-mcp-"));
  dirs.push(d);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(d, rel)), { recursive: true });
    writeFileSync(join(d, rel), text);
  }
  return d;
}
const run = async (root: string, rule = mcp01HardcodedCreds, offline = true) => rule.run(await buildRepoContext(root, { config: { offline } }));
const KEY = "Zk8vQ2pLm7RtX4wNb9YcF3hJ"; // 24 chars, high entropy, matches no vendor pattern

describe("parsing", () => {
  test("JSONC: comments and trailing commas stripped, `//` inside strings kept", () => {
    expect(parseJsonc('{ // c\n "u": "https://x.dev/a", /* b */ "a": [1, 2,], }')).toEqual({ u: "https://x.dev/a", a: [1, 2] });
    expect(parseJsonc("{ nope")).toBeNull();
  });
  test("string leaves bind flag values, --k=v and URL query params to a name", () => {
    const leaves = stringLeaves({ args: ["--api-key", "A", "--token=B", "pos"], url: "https://h.dev/sse?key=C" });
    expect(leaves.map((l) => [l.path, l.key, l.value])).toEqual([
      ["args[0]", null, "--api-key"],
      ["args[1]", "api-key", "A"],
      ["args[2]", "token", "B"],
      ["args[3]", null, "pos"],
      ["url", "url", "https://h.dev/sse?key=C"],
      ["url?key", "key", "C"],
    ]);
  });
  test("serverPackage resolves npx / bunx / pnpm dlx / uvx launch lines", () => {
    expect(serverPackage("npx", ["-y", "@scope/srv@1.2.3", "--flag"])).toEqual({ eco: "npm", spec: "@scope/srv@1.2.3", name: "@scope/srv", version: "1.2.3" });
    expect(serverPackage("cmd", ["/c", "npx", "-y", "srv"])?.name).toBe("srv");
    expect(serverPackage("C:\\nodejs\\npx.cmd", ["--yes", "srv@latest"])?.version).toBe("latest");
    expect(serverPackage("npx", ["-p", "real-pkg@2.0.0", "bin-name"])?.spec).toBe("real-pkg@2.0.0");
    expect(serverPackage("pnpm", ["dlx", "srv"])?.name).toBe("srv");
    expect(serverPackage("bunx srv@1.0.0", [])?.version).toBe("1.0.0");
    expect(serverPackage("uvx", ["--python", "3.12", "mcp-server-git==0.6.2"])).toEqual({
      eco: "pypi",
      spec: "mcp-server-git==0.6.2",
      name: "mcp-server-git",
      version: "0.6.2",
    });
    expect(serverPackage("uvx", ["--from", "pkg[cli]==1.0", "cmd"])?.version).toBe("1.0");
    expect(serverPackage("uv", ["tool", "run", "pkg"])?.name).toBe("pkg");
    expect(serverPackage("node", ["server.js"])).toBeNull();
    expect(serverPackage("gantry", ["mcp"])).toBeNull();
  });
});

describe("MCP-01", () => {
  test("references are never flagged, literals are", async () => {
    const root = repo({
      ".mcp.json": JSON.stringify({
        mcpServers: {
          ok: { command: "x", env: { API_KEY: "${API_KEY}", TOKEN: "${TOKEN:-fallback}" }, headers: { Authorization: "Bearer ${T}" } },
          cursor: { url: "https://h.dev/sse?api_key=${env:K}", env: { OPENAI_MODEL: "gpt-4o-mini-2024-07-18", BASE_URL: "https://api.openai.com/v1" } },
          bad: { command: "x", env: { SERVICE_TOKEN: KEY }, url: `https://h.dev/sse?api_key=${KEY}x` },
        },
      }),
    });
    const fs = await run(root);
    expect(fs.map((f) => f.evidence.split(":")[0]).sort()).toEqual(["mcpServers.bad.env.SERVICE_TOKEN", "mcpServers.bad.url?api_key"]);
    expect(fs.every((f) => !f.evidence.includes(KEY))).toBe(true);
    expect(fs[0].agentRemediationPrompt).toContain("${SERVICE_TOKEN}");
  });
  test("git-ignored configs are skipped; SEC-06-style vendor keys caught anywhere in a server", async () => {
    const pat = `ghp_${"a1B2c3D4e5".repeat(3)}a1B2c3`;
    const root = repo({
      ".gitignore": ".claude/settings.local.json\n",
      ".claude/settings.local.json": JSON.stringify({ env: { GITHUB_TOKEN: pat } }),
      ".cursor/mcp.json": JSON.stringify({ mcpServers: { gh: { command: `GITHUB_TOKEN=${pat} npx`, args: ["-y", "x"] } } }),
    });
    const fs = await run(root);
    expect(fs.map((f) => f.file)).toEqual([".cursor/mcp.json"]);
    expect(fs[0].evidence).toContain("GitHub Personal Access Token");
    expect(fs[0].agentRemediationPrompt).toContain("${env:");
  });
});

describe("MCP-02", () => {
  test("pinned + known passes; unpinned, unknown and look-alikes fire", async () => {
    const root = repo({
      ".mcp.json": JSON.stringify({
        mcpServers: {
          pinned: { command: "npx", args: ["-y", "@playwright/mcp@0.0.41"] },
          floating: { command: "npx", args: ["-y", "@playwright/mcp@latest"] },
          unknown: { command: "npx", args: ["-y", "qq-random-mcp-thing@1.0.0"] },
          squat: { command: "npx", args: ["-y", "@playwright/mpc@1.0.0"] },
          git: { command: "npx", args: ["-y", "github:someone/server"] },
          local: { command: "node", args: ["./server.js"] },
        },
      }),
    });
    const fs = await run(root, mcp02UnpinnedServers);
    const by = Object.fromEntries(fs.map((f) => [f.nodeRef, f]));
    expect(Object.keys(by).sort()).toEqual(["mcp:floating", "mcp:git", "mcp:squat", "mcp:unknown"]);
    expect(by["mcp:floating"].evidence).toContain("`@latest` floats");
    expect(by["mcp:unknown"].evidence).toContain("isn't in the verified package seed");
    expect(by["mcp:squat"].severity).toBe("CRITICAL");
    expect(by["mcp:squat"].agentRemediationPrompt).toContain("@playwright/mcp");
    expect(by["mcp:git"].evidence).toContain("git/URL source");
  });
  test("online: an unknown server that 404s on the registry is CRITICAL", async () => {
    const root = repo({ ".mcp.json": JSON.stringify({ mcpServers: { ghost: { command: "npx", args: ["-y", "qq-ghost-mcp-zz@1.0.0"] } } }) });
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    try {
      const [f] = await run(root, mcp02UnpinnedServers, false);
      expect(f.severity).toBe("CRITICAL");
      expect(f.evidence).toContain("404");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
  test("our own `init` output passes MCP-01 and MCP-02", async () => {
    const root = repo({ "package.json": JSON.stringify({ name: "t" }) });
    initProject(root, { preCommit: true });
    expect(await run(root)).toEqual([]);
    expect(await run(root, mcp02UnpinnedServers)).toEqual([]);
  });
});
