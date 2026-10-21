/**
 * `preflight init`: wires Preflight into the repo's agents and CI without clobbering anything.
 * Marker blocks are replaced in place, JSON configs are merged, existing user files are never overwritten.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONFIG_FILES } from "./context/config";
import { requireFeature } from "./entitlements";

export type InitAction = { path: string; action: "created" | "updated" | "unchanged" | "skipped"; reason?: string };

const BEGIN = "<!-- PREFLIGHT:BEGIN -->";
const END = "<!-- PREFLIGHT:END -->";
export const MCP_SERVER = { command: "preflight", args: ["mcp"] };

const AGENT_GUIDE = `## Preflight launch-readiness checks
- Before declaring a feature done, run \`preflight scan\` (or the \`run_readiness_audit\` MCP tool) and fix every CRITICAL finding.
- Apply each finding's \`agentRemediationPrompt\` surgically; don't weaken auth, RLS, validation or webhook signature checks to make a finding disappear.
- Suppress a confirmed false positive only with \`// preflight-ignore <RULE-ID>\` plus a one-line justification.
- After adding or removing a third-party SDK, run \`preflight legal\` and review the diff before \`--apply\` (templates are not legal advice).
- Only run \`preflight attack\` against your local dev server.`;

const CURSOR_RULE = `---
description: Preflight launch-readiness guardrails
alwaysApply: true
---
${BEGIN}
${AGENT_GUIDE}
${END}
`;

const WORKFLOW = `name: preflight
on: [pull_request]
permissions:
  contents: read
  security-events: write
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 50 }
      - uses: oven-sh/setup-bun@v2
      - run: bunx preflight scan --sarif > preflight.sarif || true
      - uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: preflight.sarif }
      - run: bunx preflight scan
`;

/** Replace the marker block in place, or append it (an unchanged result means nothing to write). */
export function upsertBlock(existing: string, body: string): string {
  const block = `${BEGIN}\n${body}\n${END}`;
  const i = existing.indexOf(BEGIN);
  const j = existing.indexOf(END);
  if (i >= 0 && j > i) return existing.slice(0, i) + block + existing.slice(j + END.length);
  return existing.trim() ? `${existing.trimEnd()}\n\n${block}\n` : `${block}\n`;
}

export function initProject(root: string, opts: { ci?: boolean } = {}): InitAction[] {
  requireFeature("init");
  const out: InitAction[] = [];
  const put = (rel: string, next: string, prev: string | null) => {
    if (prev === next) return out.push({ path: rel, action: "unchanged" });
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), next);
    out.push({ path: rel, action: prev === null ? "created" : "updated" });
  };
  const read = (rel: string) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), "utf8") : null);

  const rule = ".cursor/rules/preflight.mdc";
  const prevRule = read(rule);
  put(rule, prevRule === null ? CURSOR_RULE : upsertBlock(prevRule, AGENT_GUIDE), prevRule);

  const claude = read("CLAUDE.md");
  put("CLAUDE.md", upsertBlock(claude ?? "", AGENT_GUIDE), claude);

  if (CONFIG_FILES.some((f) => existsSync(join(root, f))))
    out.push({ path: CONFIG_FILES.find((f) => existsSync(join(root, f)))!, action: "skipped", reason: "config already exists" });
  else
    put(
      "preflight.config.json",
      `${JSON.stringify({ mode: "commercial", companyName: "", contactEmail: "", jurisdiction: "US-DE", legalDir: "legal", ignoreRules: [], ignorePaths: [] }, null, 2)}\n`,
      null,
    );

  for (const rel of [".mcp.json", ".cursor/mcp.json"]) {
    const prev = read(rel);
    let json: any = {};
    if (prev !== null) {
      try {
        json = JSON.parse(prev);
      } catch {
        out.push({ path: rel, action: "skipped", reason: "existing file is not valid JSON; left untouched" });
        continue;
      }
    }
    if (json.mcpServers?.preflight) {
      out.push({ path: rel, action: "unchanged" });
      continue;
    }
    json.mcpServers = { ...(json.mcpServers ?? {}), preflight: MCP_SERVER };
    put(rel, `${JSON.stringify(json, null, 2)}\n`, prev);
  }

  if (opts.ci) {
    const wf = ".github/workflows/preflight.yml";
    if (read(wf) !== null) out.push({ path: wf, action: "skipped", reason: "workflow already exists" });
    else put(wf, WORKFLOW, null);
  }
  return out;
}

export async function main({ path, flags }: { path: string; flags: Record<string, string | boolean> }): Promise<number> {
  for (const a of initProject(path, { ci: flags.ci === true })) console.log(`${a.action.padEnd(9)} ${a.path}${a.reason ? `  (${a.reason})` : ""}`);
  return 0;
}
