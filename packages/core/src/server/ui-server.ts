import { existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Server, ServerWebSocket } from "bun";
import { CertificateBlockedError, generateCertificate } from "../compilers/cert-generator";
import { compileLegalDocs } from "../compilers/legal-compiler";
import { LEGAL_DISCLAIMER } from "../compilers/legal-templates";
import { buildDataFlowMermaid, writeVendorPack } from "../compilers/vendor-pack";
import { buildRepoContext } from "../context/builder";
import type { PentestEvent } from "../context/types";
import { runAudit } from "../engine";
import { FeatureLockedError } from "../entitlements";
import { runActivePentest } from "../pentest/runner";
import liteUiText from "./lite-ui.html" with { type: "text" };

export const DEFAULT_PORT = 4400;
const DEFAULT_ASSETS = fileURLToPath(new URL("../../dist/ui-assets/", import.meta.url));
const MAX_BODY = 64 * 1024;
// `type: "text"` yields the file as a string; Bun's typings still describe the HTML-bundle form.
const liteUi = liteUiText as unknown as string;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

export interface UiServerOptions {
  root: string;
  port?: number;
  /** Directory with the compiled Svelte SPA; falls back to the embedded lite UI when it has no index.html. */
  assetsDir?: string;
  /** Static scans skip the live registry check by default so `/api/report` stays well under the 1.1 s budget. */
  offline?: boolean;
}

interface WsData {
  running: boolean;
}

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
};
const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; frame-ancestors 'none'";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: SECURITY_HEADERS });
const fail = (status: number, error: string) => json({ error }, status);

/**
 * The server can write legal docs and certificates into the repo, so it only answers requests that are
 * provably from its own page: the Host header must be loopback on our port (blocks DNS rebinding) and any
 * Origin must be our own origin (blocks cross-site POSTs and WebSocket hijacking).
 */
export function isTrustedRequest(req: Request, port: number): boolean {
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!allowed.includes(req.headers.get("host") ?? "")) return false;
  const origin = req.headers.get("origin");
  if (origin === null) return req.method === "GET" && req.headers.get("upgrade") === null;
  return allowed.some((h) => origin === `http://${h}`);
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) return null;
  const text = await req.text();
  if (text.length > MAX_BODY) return null;
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length < 4096 ? v : undefined);

function serveStatic(assetsDir: string | null, pathname: string): Response {
  if (!assetsDir) return new Response(liteUi, { headers: { ...SECURITY_HEADERS, "content-type": MIME[".html"], "content-security-policy": CSP } });
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  const abs = join(assetsDir, rel);
  const inside = abs === assetsDir || abs.startsWith(assetsDir.endsWith(sep) ? assetsDir : assetsDir + sep);
  const file = inside && existsSync(abs) && statSync(abs).isFile() ? abs : join(assetsDir, "index.html");
  return new Response(Bun.file(file), {
    headers: { ...SECURITY_HEADERS, "content-type": MIME[extname(file)] ?? "application/octet-stream", "content-security-policy": CSP },
  });
}

export function startUiServer(opts: UiServerOptions): Server<WsData> {
  const { root } = opts;
  const offline = opts.offline ?? true;
  const assets = opts.assetsDir ?? DEFAULT_ASSETS;
  const assetsDir = existsSync(join(assets, "index.html")) ? normalize(assets) : null;
  const ctxOf = () => buildRepoContext(root, { config: { offline: offline || undefined } });

  async function api(req: Request, pathname: string): Promise<Response> {
    if (pathname === "/api/report") {
      if (req.method !== "GET") return fail(405, "GET only");
      const report = await runAudit(await ctxOf());
      return json({ report, mermaid: buildDataFlowMermaid(report) });
    }
    if (req.method !== "POST") return fail(405, "POST only");
    const body = await readJson(req);
    if (!body) return fail(415, "Expected a JSON object body with Content-Type: application/json");
    switch (pathname) {
      case "/api/legal/preview":
      case "/api/legal/apply": {
        const apply = pathname.endsWith("apply");
        const { manifest, changes } = compileLegalDocs(await ctxOf(), { apply });
        return json({
          manifest,
          applied: apply,
          changes: changes.map((c) => ({ path: c.path, diff: c.diff })),
          disclaimer: LEGAL_DISCLAIMER,
        });
      }
      case "/api/cert/export": {
        const ctx = await ctxOf();
        const report = await runAudit(ctx);
        try {
          const cert = generateCertificate(report, { outDir: root, allowBlocked: body.allowBlocked === true });
          const files = [cert.html, cert.pdf, ...writeVendorPack(ctx, report, root)];
          return json({ files, url: cert.url, publicKey: cert.publicKey, blocked: report.blockers > 0 });
        } catch (e) {
          if (e instanceof CertificateBlockedError) return fail(409, e.message);
          throw e;
        }
      }
      default:
        return fail(404, "Unknown endpoint");
    }
  }

  async function pentest(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
    const send = (e: PentestEvent) => {
      if (ws.readyState === 1) ws.send(JSON.stringify(e));
    };
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return send({ type: "PENTEST_ERROR", message: "Messages must be JSON", at: Date.now() });
    }
    if (msg?.type !== "START") return send({ type: "PENTEST_ERROR", message: 'Send {"type":"START","target":"http://localhost:3000"}', at: Date.now() });
    if (ws.data.running) return send({ type: "PENTEST_ERROR", message: "A pentest is already running on this connection", at: Date.now() });
    ws.data.running = true;
    try {
      // Never pass allowRemote from the browser: the UI can only aim probes at loopback targets.
      await runActivePentest(await ctxOf(), {
        target: str(msg.target) ?? "http://localhost:3000",
        supabaseUrl: str(msg.supabaseUrl),
        anonKey: str(msg.anonKey),
        tenantBToken: str(msg.tenantToken),
        onEvent: send,
      });
    } catch (e) {
      send({ type: "PENTEST_ERROR", message: e instanceof Error ? e.message : String(e), at: Date.now() });
    } finally {
      ws.data.running = false;
    }
  }

  const server = Bun.serve<WsData, never>({
    hostname: "127.0.0.1",
    port: opts.port ?? DEFAULT_PORT,
    maxRequestBodySize: MAX_BODY,
    async fetch(req, srv) {
      const { pathname } = new URL(req.url);
      if (!isTrustedRequest(req, srv.port ?? 0)) return fail(403, "Gantry UI only accepts same-origin requests on 127.0.0.1/localhost");
      if (pathname === "/ws/pentest") {
        return srv.upgrade(req, { data: { running: false } }) ? undefined : fail(426, "WebSocket upgrade required");
      }
      if (!pathname.startsWith("/api/")) return req.method === "GET" ? serveStatic(assetsDir, pathname) : fail(405, "GET only");
      try {
        return await api(req, pathname);
      } catch (e) {
        if (e instanceof FeatureLockedError) return fail(402, e.message);
        return fail(500, e instanceof Error ? e.message : String(e));
      }
    },
    websocket: { message: pentest, maxPayloadLength: MAX_BODY },
  });
  return server;
}

export async function main({ path, flags }: { path: string; flags: Record<string, string | boolean> }): Promise<number> {
  const port = typeof flags.port === "string" ? Number(flags.port) : DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`ui: invalid --port ${flags.port}`);
    return 2;
  }
  const server = startUiServer({ root: path, port, offline: flags.online !== true });
  console.log(`Gantry Mission Control → http://127.0.0.1:${server.port}  (Ctrl+C to stop)`);
  await new Promise(() => {});
  return 0;
}
