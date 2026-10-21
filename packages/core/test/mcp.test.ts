import { describe, expect, test } from "bun:test";
import { handle, LEGACY_VERSIONS, MODERN_VERSIONS, TOOLS } from "../src/bin/mcp";

const ROOT = process.cwd();
const req = (method: string, params?: unknown, id: number | string | null = 1) => handle({ jsonrpc: "2.0", id, method, params }, ROOT);

describe("MCP handshake", () => {
  test("initialize echoes a supported legacy version and advertises tools", async () => {
    const r: any = await req("initialize", { protocolVersion: "2025-06-18" });
    expect(r.result.protocolVersion).toBe("2025-06-18");
    expect(r.result.capabilities.tools).toBeDefined();
    expect(r.result.serverInfo.name).toBe("preflight");
  });
  test("initialize with an unknown version falls back to a supported one", async () => {
    const r: any = await req("initialize", { protocolVersion: "1999-01-01" });
    expect(LEGACY_VERSIONS).toContain(r.result.protocolVersion);
  });
  test("server/discover lists modern + legacy versions", async () => {
    const r: any = await req("server/discover");
    expect(r.result.supportedVersions).toEqual([...MODERN_VERSIONS, ...LEGACY_VERSIONS]);
    expect(r.result._meta["io.modelcontextprotocol/serverInfo"].name).toBe("preflight");
  });
  test("modern per-request protocolVersion yields resultType:complete", async () => {
    const r: any = await handle(
      { jsonrpc: "2.0", id: 9, method: "ping", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } } },
      ROOT,
    );
    expect(r.result.resultType).toBe("complete");
  });
  test("unsupported modern version → -32022 with supported list", async () => {
    const r: any = await handle(
      { jsonrpc: "2.0", id: 9, method: "ping", params: { _meta: { "io.modelcontextprotocol/protocolVersion": "1999-01-01" } } },
      ROOT,
    );
    expect(r.error.code).toBe(-32022);
    expect(r.error.data.supported).toContain("2026-07-28");
  });
});

describe("MCP protocol basics", () => {
  test("notifications get no reply", async () => {
    expect(await req("notifications/initialized", {}, null)).toBeUndefined();
    expect(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }, ROOT)).toBeUndefined();
  });
  test("unknown method → -32601", async () => {
    const r: any = await req("does/not/exist");
    expect(r.error.code).toBe(-32601);
  });
  test("bad jsonrpc → -32600", async () => {
    const r: any = await handle({ jsonrpc: "1.0", id: 1, method: "ping" }, ROOT);
    expect(r.error.code).toBe(-32600);
  });
  test("tools/list returns the three tools with input schemas", async () => {
    const r: any = await req("tools/list");
    expect(r.result.tools.map((t: any) => t.name).sort()).toEqual(["run_active_pentest", "run_readiness_audit", "sync_stack_legal_docs"]);
    for (const t of r.result.tools) expect(t.inputSchema.type).toBe("object");
    expect(TOOLS.length).toBe(3);
  });
});

describe("MCP tools/call", () => {
  test("run_readiness_audit returns findings and structuredContent", async () => {
    const r: any = await handle(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "run_readiness_audit", arguments: { path: "fixtures/vulnerable-saas" } } },
      ROOT,
    );
    expect(r.result.isError).toBe(false);
    expect(r.result.content[0].text).toContain("LAUNCH_BLOCKED");
    expect(r.result.structuredContent.findings.length).toBeGreaterThan(30);
    expect(r.result.structuredContent.graph).toBeUndefined();
  });
  test("run_readiness_audit on the clean fixture reports launch-ready", async () => {
    const r: any = await handle(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "run_readiness_audit", arguments: { path: "fixtures/clean-saas" } } },
      ROOT,
    );
    expect(r.result.content[0].text).toContain("LAUNCH_READY");
    expect(r.result.structuredContent.findings).toEqual([]);
  });
  test("sync_stack_legal_docs dry-run returns diffs and the lawyer disclaimer", async () => {
    const r: any = await handle(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "sync_stack_legal_docs", arguments: { path: "fixtures/vulnerable-saas" } } },
      ROOT,
    );
    expect(r.result.isError).toBe(false);
    expect(r.result.content[0].text).toContain("Not legal advice");
    expect(r.result.structuredContent.changes.length).toBeGreaterThan(0);
  });
  test("unknown tool → -32602", async () => {
    const r: any = await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "nope", arguments: {} } }, ROOT);
    expect(r.error.code).toBe(-32602);
  });
  test("tool errors are reported in-band (isError:true), not as JSON-RPC errors", async () => {
    const r: any = await handle(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "run_active_pentest", arguments: { target: "https://evil.example.com" } } },
      ROOT,
    );
    expect(r.error).toBeUndefined();
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/non-local/);
  });
});
