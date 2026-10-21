/**
 * `preflight mcp`: hand-rolled MCP server over stdio (newline-delimited JSON-RPC 2.0, no deps).
 * Supports legacy `initialize` clients (2024-11-05 … 2025-11-25) and modern per-request clients
 * (2026-07-28, `server/discover`). Logs go to stderr only; stdout carries protocol frames.
 */
import { resolve } from "node:path";
import { compileLegalDocs } from "../compilers/legal-compiler";
import { buildRepoContext } from "../context/builder";
import { changedScope } from "../context/changed";
import { loadConfig } from "../context/config";
import type { Pillar } from "../context/types";
import { runAudit, VERSION } from "../engine";
import { type Feature, FeatureLockedError, requireFeature } from "../entitlements";
import { renderCompact } from "../reporters/compact";

export const LEGACY_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export const MODERN_VERSIONS = ["2026-07-28"];
const SERVER_INFO = { name: "preflight", version: VERSION };
const INSTRUCTIONS =
  "Preflight audits AI-generated repos for launch blockers. Call run_readiness_audit first: it returns one compact line per finding with a FIX hint (pass format: verbose for full evidence and fix prompts, changedOnly=true after edits). sync_stack_legal_docs previews (or applies) privacy/EULA updates. run_active_pentest probes a locally running dev server only.";

type Json = Record<string, any>;
interface ToolDef {
  name: string;
  description: string;
  feature: Feature;
  inputSchema: Json;
  run: (args: Json, root: string) => Promise<{ text: string; structured?: Json }>;
}

const PILLARS: Pillar[] = ["SECURITY", "PRIVACY", "LEGAL", "FINOPS_OPS"];
const pathArg = { path: { type: "string", description: "Repo root (defaults to the server's working directory)" } };

export const TOOLS: ToolDef[] = [
  {
    name: "run_readiness_audit",
    description:
      "Run Preflight's 37 static launch-readiness rules (security, privacy, legal, FinOps) and return the score, blockers and findings with agent fix prompts.",
    feature: "scan",
    inputSchema: {
      type: "object",
      properties: {
        ...pathArg,
        strict: { type: "boolean", description: "Treat HIGH findings as blockers" },
        pillars: { type: "array", items: { enum: PILLARS } },
        format: {
          enum: ["compact", "verbose"],
          description: "compact (default): one line per finding, no structuredContent. verbose: full prompts, evidence and impact.",
        },
        changedOnly: { type: "boolean", description: "Scan only files changed since HEAD (plus untracked); skips repo-wide absence rules" },
      },
      additionalProperties: false,
    },
    async run(args, root) {
      const config = { strict: args.strict === true || undefined };
      const scope = args.changedOnly === true ? changedScope(root, loadConfig(root, config)) : null;
      const ctx = await buildRepoContext(root, { config, ...(scope ? { only: scope.only } : {}) });
      const report = await runAudit(ctx, scope ? { changedFiles: scope.changed } : {});
      const findings = args.pillars?.length ? report.findings.filter((f) => args.pillars.includes(f.pillar)) : report.findings;
      // Compact is the agent default (~70% fewer bytes per finding); structuredContent would undo the saving.
      if (args.format !== "verbose") return { text: `${renderCompact(report, findings, 50)}(format: "verbose" for full evidence, impact and fix prompts)` };
      const lines = findings
        .slice(0, 50)
        .map((f) => `- [${f.severity}${f.blocking ? " BLOCKER" : ""}] ${f.ruleId} ${f.file}:${f.line}: ${f.title}\n  fix: ${f.agentRemediationPrompt}`);
      const text = `Score ${report.score}/100 · ${report.status} · ${report.blockers} blocker(s) · ${findings.length} finding(s)\n${lines.join("\n")}${findings.length > 50 ? `\n…${findings.length - 50} more (see structuredContent)` : ""}`;
      const { graph: _g, ...rest } = report;
      return { text, structured: { ...rest, findings } };
    },
  },
  {
    name: "sync_stack_legal_docs",
    description:
      "Compile privacy policy / EULA / terms from the detected stack. Dry-run by default (returns unified diffs); pass apply=true to write. Templates are not legal advice.",
    feature: "legal",
    inputSchema: { type: "object", properties: { ...pathArg, apply: { type: "boolean" } }, additionalProperties: false },
    async run(args, root) {
      const ctx = await buildRepoContext(root, { config: { offline: true } });
      const { manifest, changes } = compileLegalDocs(ctx, { apply: args.apply === true });
      const head = `Legal manifest v${manifest.version} (stack ${manifest.stackHash}), ${manifest.subprocessors.length} sub-processors. ${changes.length ? (args.apply ? "Wrote" : "Would change") : "No changes"}: ${changes.map((c) => c.path).join(", ")}`;
      return {
        text: `${head}\n\n${args.apply ? "" : changes.map((c) => c.diff).join("\n")}\nNot legal advice: have a lawyer review.`,
        structured: { manifest: { ...manifest, documents: undefined }, changes: changes.map(({ path, diff }) => ({ path, diff })) },
      };
    },
  },
  {
    name: "run_active_pentest",
    description: "Run Preflight's non-destructive live probes (PT-01..PT-06) against a locally running dev server (localhost only).",
    feature: "attack",
    inputSchema: {
      type: "object",
      properties: { ...pathArg, target: { type: "string", description: "e.g. http://localhost:3000" } },
      required: ["target"],
      additionalProperties: false,
    },
    async run(args, root) {
      const { runActivePentest } = await import("../pentest/runner");
      const ctx = await buildRepoContext(root, { config: { offline: true } });
      const results = await runActivePentest(ctx, { target: args.target });
      const text = results.map((r) => `- ${r.probeId} ${r.status}: ${r.summary}`).join("\n");
      return { text, structured: { results: results.map(({ traces: _t, ...r }) => r) } };
    },
  },
];

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
  }
}

/** Pure request handler (transport-agnostic, unit-testable). Returns undefined for notifications. */
export async function handle(msg: Json, root: string): Promise<Json | undefined> {
  const isNotification = msg.id === undefined || msg.id === null;
  const reply = (result: Json) => (isNotification ? undefined : { jsonrpc: "2.0", id: msg.id, result });
  const fail = (e: RpcError) =>
    isNotification ? undefined : { jsonrpc: "2.0", id: msg.id, error: { code: e.code, message: e.message, ...(e.data !== undefined ? { data: e.data } : {}) } };
  try {
    if (msg.jsonrpc !== "2.0" || typeof msg.method !== "string") throw new RpcError(-32600, "Invalid Request");
    const p = msg.params ?? {};
    const modern = p._meta?.["io.modelcontextprotocol/protocolVersion"];
    if (modern && ![...MODERN_VERSIONS, ...LEGACY_VERSIONS].includes(modern))
      throw new RpcError(-32022, "Unsupported protocol version", { supported: [...MODERN_VERSIONS, ...LEGACY_VERSIONS], requested: modern });
    const done = (r: Json) => reply(modern && MODERN_VERSIONS.includes(modern) ? { resultType: "complete", ...r } : r);
    switch (msg.method) {
      case "initialize": {
        const asked = String(p.protocolVersion ?? "");
        return reply({
          protocolVersion: LEGACY_VERSIONS.includes(asked) ? asked : LEGACY_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        });
      }
      case "server/discover":
        return reply({
          resultType: "complete",
          supportedVersions: [...MODERN_VERSIONS, ...LEGACY_VERSIONS],
          capabilities: { tools: { listChanged: false } },
          _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO },
          instructions: INSTRUCTIONS,
        });
      case "notifications/initialized":
      case "notifications/cancelled":
        return undefined;
      case "ping":
        return done({});
      case "tools/list":
        return done({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      case "tools/call": {
        const tool = TOOLS.find((t) => t.name === p.name);
        if (!tool) throw new RpcError(-32602, `Unknown tool: ${p.name}`);
        const args = (p.arguments ?? {}) as Json;
        if (typeof args !== "object" || Array.isArray(args)) throw new RpcError(-32602, "arguments must be an object");
        try {
          requireFeature(tool.feature);
          const out = await tool.run(args, resolve(root, typeof args.path === "string" ? args.path : "."));
          return done({ content: [{ type: "text", text: out.text }], ...(out.structured ? { structuredContent: out.structured } : {}), isError: false });
        } catch (e) {
          // Tool execution errors are reported in-band so the model can see and react to them.
          const message = e instanceof FeatureLockedError ? e.message : `${tool.name} failed: ${e instanceof Error ? e.message : String(e)}`;
          return done({ content: [{ type: "text", text: message }], isError: true });
        }
      }
      default:
        throw new RpcError(-32601, `Method not found: ${msg.method}`);
    }
  } catch (e) {
    return fail(e instanceof RpcError ? e : new RpcError(-32603, e instanceof Error ? e.message : String(e)));
  }
}

export async function main({ path }: { path: string; flags?: Json }): Promise<number> {
  requireFeature("mcp");
  const log = (...a: unknown[]) => console.error("[preflight-mcp]", ...a);
  log(`ready (root ${path})`);
  const write = (o: Json | undefined) => o && process.stdout.write(`${JSON.stringify(o)}\n`);
  let buf = "";
  const pending: Promise<void>[] = [];
  for await (const chunk of process.stdin) {
    buf += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      nl = buf.indexOf("\n");
      if (!line) continue;
      let msg: Json;
      try {
        msg = JSON.parse(line);
      } catch {
        write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        continue;
      }
      // Requests run concurrently; responses are matched by id.
      pending.push(
        handle(msg, path).then(
          (o) => void write(o),
          (e) => log("handler crashed", e),
        ),
      );
    }
  }
  await Promise.all(pending);
  return 0;
}
