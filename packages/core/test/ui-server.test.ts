import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuditReport, PentestEvent } from "../src/context/types";
import { isTrustedRequest, startUiServer } from "../src/server/ui-server";
import { startTargetServer } from "./fixtures/pentest-target";

process.env.GANTRY_CERT_SECRET ??= "ui-server-test";

function copyFixture(name: string) {
  const d = mkdtempSync(join(tmpdir(), "gantry-ui-"));
  cpSync(`fixtures/${name}`, d, { recursive: true });
  return d;
}

describe("isTrustedRequest", () => {
  const req = (method: string, headers: Record<string, string>) => new Request("http://127.0.0.1:4400/api/report", { method, headers });
  test("accepts same-origin loopback requests", () => {
    expect(isTrustedRequest(req("GET", { host: "127.0.0.1:4400" }), 4400)).toBe(true);
    expect(isTrustedRequest(req("POST", { host: "localhost:4400", origin: "http://localhost:4400" }), 4400)).toBe(true);
  });
  test("rejects DNS rebinding, cross-site origins and origin-less writes", () => {
    expect(isTrustedRequest(req("GET", { host: "evil.example:4400" }), 4400)).toBe(false);
    expect(isTrustedRequest(req("POST", { host: "127.0.0.1:4400", origin: "https://evil.example" }), 4400)).toBe(false);
    expect(isTrustedRequest(req("POST", { host: "127.0.0.1:4400" }), 4400)).toBe(false);
    expect(isTrustedRequest(req("GET", { host: "127.0.0.1:4400", upgrade: "websocket" }), 4400)).toBe(false);
  });
});

describe("ui-server on the vulnerable fixture", () => {
  let root: string;
  let server: ReturnType<typeof startUiServer>;
  let base: string;
  const post = (path: string, body: unknown = {}) =>
    fetch(base + path, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify(body) });

  beforeAll(() => {
    root = copyFixture("vulnerable-saas");
    server = startUiServer({ root, port: 0, assetsDir: join(root, "no-ui-build") });
    base = `http://127.0.0.1:${server.port}`;
  });
  afterAll(() => {
    server.stop(true);
    rmSync(root, { recursive: true, force: true });
  });

  test("serves the embedded lite UI with a CSP when no build exists", async () => {
    const res = await fetch(`${base}/`);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    const html = await res.text();
    for (const tab of ["Readiness Matrix", "Live Pentest Console", "Legal &amp; EULA Studio", "FinOps &amp; Burn Simulator"]) expect(html).toContain(tab);
    expect(html).toContain("--status-block: #ef4444");
  });

  test("GET /api/report returns the AuditReport and mermaid graph", async () => {
    const t0 = performance.now();
    const res = await fetch(`${base}/api/report`);
    expect(performance.now() - t0).toBeLessThan(1100);
    const { report, mermaid } = (await res.json()) as { report: AuditReport; mermaid: string };
    expect(report.status).toBe("LAUNCH_BLOCKED");
    expect(report.findings.some((f) => f.ruleId === "SEC-08")).toBe(true);
    expect(mermaid).toContain("flowchart");
  });

  test("rejects cross-origin and non-JSON writes", async () => {
    const evil = await fetch(`${base}/api/legal/apply`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: "{}",
    });
    expect(evil.status).toBe(403);
    const form = await fetch(`${base}/api/legal/apply`, { method: "POST", headers: { "content-type": "text/plain", origin: base }, body: "{}" });
    expect(form.status).toBe(415);
    expect(existsSync(join(root, "legal/eula.md"))).toBe(false);
  });

  test("legal preview diffs without writing; apply writes and bumps the version", async () => {
    const preview = (await (await post("/api/legal/preview")).json()) as { changes: Array<{ path: string; diff: string }>; applied: boolean };
    expect(preview.applied).toBe(false);
    expect(preview.changes.map((c) => c.path)).toContain("legal/privacy-policy.md");
    expect(existsSync(join(root, "legal/eula.md"))).toBe(false);
    const applied = (await (await post("/api/legal/apply")).json()) as { changes: Array<{ path: string }> };
    expect(applied.changes.length).toBe(preview.changes.length);
    expect(readFileSync(join(root, "legal/eula.md"), "utf8")).toContain("GANTRY:AUTO");
    const again = (await (await post("/api/legal/preview")).json()) as { changes: unknown[] };
    expect(again.changes).toEqual([]);
  });

  test("cert export refuses while blocked unless allowBlocked", async () => {
    const refused = await post("/api/cert/export");
    expect(refused.status).toBe(409);
    const ok = (await (await post("/api/cert/export", { allowBlocked: true })).json()) as { files: string[]; blocked: boolean };
    expect(ok.blocked).toBe(true);
    expect(ok.files.some((f) => f.endsWith("LAUNCH_CERTIFICATE.pdf"))).toBe(true);
    expect(ok.files.some((f) => f.endsWith("SBOM.json"))).toBe(true);
  });

  test("ws /ws/pentest streams probe events and refuses remote targets", async () => {
    const target = await startTargetServer("vuln");
    const run = (body: unknown) =>
      new Promise<PentestEvent[]>((resolve, reject) => {
        const events: PentestEvent[] = [];
        const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws/pentest`, { headers: { origin: base } } as unknown as string[]);
        ws.onopen = () => ws.send(JSON.stringify(body));
        ws.onerror = reject;
        ws.onmessage = (m) => {
          const e = JSON.parse(String(m.data)) as PentestEvent;
          events.push(e);
          if (e.type === "PENTEST_COMPLETE" || e.type === "PENTEST_ERROR") {
            ws.close();
            resolve(events);
          }
        };
      });
    try {
      const events = await run({ type: "START", target: target.url });
      const types = new Set(events.map((e) => e.type));
      for (const t of ["PROBE_START", "HTTP_TRACE", "PROBE_RESULT", "PENTEST_COMPLETE"]) expect(types.has(t as PentestEvent["type"])).toBe(true);
      expect(events.at(-1)?.results?.some((r) => r.status === "EXPLOITED")).toBe(true);
      const remote = await run({ type: "START", target: "https://example.com" });
      expect(remote.at(-1)?.type).toBe("PENTEST_ERROR");
      expect(remote.at(-1)?.message).toMatch(/non-local/);
    } finally {
      target.close();
    }
  }, 20_000);
});

describe("ui-server with a compiled UI build", () => {
  test("serves built assets, SPA-falls back to index.html, and blocks traversal", async () => {
    const assets = mkdtempSync(join(tmpdir(), "gantry-assets-"));
    mkdirSync(join(assets, "assets"));
    writeFileSync(join(assets, "index.html"), "<!doctype html><title>spa</title>");
    writeFileSync(join(assets, "assets/app.js"), "console.log(1)");
    const server = startUiServer({ root: "fixtures/clean-saas", port: 0, assetsDir: assets });
    const base = `http://127.0.0.1:${server.port}`;
    try {
      expect(await (await fetch(`${base}/assets/app.js`)).text()).toBe("console.log(1)");
      expect((await fetch(`${base}/assets/app.js`)).headers.get("content-type")).toContain("javascript");
      expect(await (await fetch(`${base}/legal`)).text()).toContain("spa");
      expect(await (await fetch(`${base}/..%2f..%2fpackage.json`)).text()).toContain("spa");
      const { report } = (await (await fetch(`${base}/api/report`)).json()) as { report: AuditReport };
      expect(report.findings).toEqual([]);
    } finally {
      server.stop(true);
      rmSync(assets, { recursive: true, force: true });
    }
  });
});
