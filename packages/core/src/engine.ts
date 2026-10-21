/** Audit engine: runs static rules in parallel, applies suppression + scoring, builds the data-flow graph. */
import { basename } from "node:path";
import { type BuildOptions, buildRepoContext } from "./context/builder";
import type { AuditReport, DataFlowGraph, DataFlowNode, Finding, Pillar, PillarScore, RepoContext, RuleDefinition, Severity } from "./context/types";
import { requireFeature } from "./entitlements";
import { isBlocking, isSuppressed } from "./rules/helpers";
import { ALL_STATIC_RULES } from "./rules/index";
import { assertProfiles, profileSeverity } from "./rules/profiles";

export const VERSION = "0.1.0";
export const RULESET_VERSION = "2026.10.0";
export const PENALTY: Record<Severity, number> = { CRITICAL: 25, HIGH: 10, MEDIUM: 4 };
const PILLARS: Pillar[] = ["SECURITY", "PRIVACY", "LEGAL", "FINOPS_OPS"];
const SEV_ORDER: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };

export interface AuditOptions {
  strict?: boolean;
  /** Restrict to these rule ids (IDE incremental scans / MCP). */
  ruleIds?: string[];
  rules?: readonly RuleDefinition[];
  /** Partial scan: report findings on these files only and skip `scope: "repo"` rules (they'd fire on every subset). */
  changedFiles?: string[];
}

export const scoreOf = (fs: Finding[]) => Math.max(0, 100 - fs.reduce((s, f) => s + PENALTY[f.severity], 0));

export function statusOf(score: number, blockers: number): AuditReport["status"] {
  if (blockers > 0) return "LAUNCH_BLOCKED";
  return score >= 90 ? "LAUNCH_READY" : "NEEDS_REVIEW";
}

export async function runAudit(ctx: RepoContext, opts: AuditOptions = {}): Promise<AuditReport> {
  const t0 = performance.now();
  const strict = opts.strict ?? ctx.config.strict;
  const changed = opts.changedFiles && new Set(opts.changedFiles);
  // Profile-only rules (e.g. SOV-01 under `airgap`) run when their profile is active or they're requested by id.
  const profiles = ctx.config.profiles ?? [];
  assertProfiles(profiles);
  const active = (r: RuleDefinition) => !r.profiles || !!opts.ruleIds?.includes(r.id) || r.profiles.some((p) => profiles.includes(p));
  const rules = (opts.rules ?? ALL_STATIC_RULES).filter((r) => (!opts.ruleIds || opts.ruleIds.includes(r.id)) && !(changed && r.scope === "repo") && active(r));
  // Compliance packs are agency-tier, whether enabled by profile or by requesting a profile rule's id.
  if (profiles.length || rules.some((r) => r.profiles)) requireFeature("profiles");
  const timings: Record<string, number> = { ...ctx.timings };
  const errors: NonNullable<AuditReport["errors"]> = [];
  const results = await Promise.all(
    rules.map(async (r) => {
      const t = performance.now();
      try {
        return await r.run(ctx);
      } catch (e) {
        errors.push({ ruleId: r.id, message: e instanceof Error ? e.message : String(e) });
        return [];
      } finally {
        timings[`rule:${r.id}`] = Math.round((performance.now() - t) * 100) / 100;
      }
    }),
  );
  const seen = new Set<string>();
  let suppressed = 0;
  const findings: Finding[] = [];
  for (const f of results.flat()) {
    if (changed && !changed.has(f.file)) continue;
    if (f.fingerprint && seen.has(f.fingerprint)) continue;
    if (f.fingerprint) seen.add(f.fingerprint);
    if (isSuppressed(ctx, f)) {
      suppressed++;
      continue;
    }
    const severity = profileSeverity(f.ruleId, f.severity, profiles);
    findings.push({ ...f, severity, blocking: isBlocking(severity, strict) });
  }
  findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.ruleId.localeCompare(b.ruleId) || a.file.localeCompare(b.file) || a.line - b.line);
  const blockers = findings.filter((f) => f.blocking).length;
  const score = scoreOf(findings);
  const pillars: PillarScore[] = PILLARS.map((p) => {
    const fs = findings.filter((f) => f.pillar === p);
    const n = (s: Severity) => fs.filter((f) => f.severity === s).length;
    return { pillar: p, score: scoreOf(fs), critical: n("CRITICAL"), high: n("HIGH"), medium: n("MEDIUM") };
  });
  timings.rules = Math.round((performance.now() - t0) * 100) / 100;
  const s = ctx.stack;
  return {
    tool: { name: "preflight", version: VERSION, rulesetVersion: RULESET_VERSION },
    rulesRun: rules.map((r) => r.id),
    repo: {
      name: (ctx.packageJson?.name as string | undefined) ?? basename(ctx.rootDir),
      rootDir: ctx.rootDir,
      framework: ctx.framework,
      frameworkVersion: s.frameworkVersion,
      gitCommitSha: ctx.gitCommitSha,
      stack: [
        ctx.framework,
        s.supabase && "supabase",
        s.prisma && "prisma",
        s.drizzle && "drizzle",
        s.sqlalchemy && "sqlalchemy",
        s.stripe && "stripe",
        s.genAi && "genai",
        s.deployTarget,
      ].filter((x): x is string => !!x && x !== "unknown"),
    },
    generatedAt: new Date().toISOString(),
    durationMs: Math.round((ctx.timings.total ?? 0) + timings.rules),
    timings,
    score,
    status: statusOf(score, blockers),
    blockers,
    pillars,
    findings,
    suppressed,
    graph: buildGraph(ctx, findings),
    stats: {
      files: ctx.files.all.length,
      routes: ctx.routes.length,
      tables: ctx.dbTables.size,
      dependencies: ctx.dependencies.size,
      subprocessors: ctx.detectedSubprocessors.length,
    },
    ...(errors.length ? { errors } : {}),
  };
}

/** Build context + run all rules. */
export async function audit(rootDir: string, opts: AuditOptions & BuildOptions = {}): Promise<AuditReport> {
  const ctx = await buildRepoContext(rootDir, opts);
  return runAudit(ctx, opts);
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const worst = (fs: Finding[]): DataFlowNode["status"] => (fs.some((f) => f.severity === "CRITICAL") ? "block" : fs.length ? "warn" : "ok");

/** 4-column swimlane (DESIGN Component 2): entrypoints → API/actions → tables → vendors. */
export function buildGraph(ctx: RepoContext, findings: Finding[]): DataFlowGraph {
  const nodes: DataFlowNode[] = [];
  const edges: DataFlowGraph["edges"] = [];
  const node = (n: Omit<DataFlowNode, "status" | "ruleIds">, fs: Finding[]) => {
    const ruleIds = [...new Set(fs.map((f) => f.ruleId))].sort();
    nodes.push({ ...n, status: worst(fs), ruleIds });
  };
  const byRef = (id: string) => findings.filter((f) => f.nodeRef === id);

  const pages = ctx.files.frontendComponents.filter((f) =>
    /(^|\/)(page|\+page|index)\.\w+$|(^|\/)pages\/(?!_|api\/)[^/]+\.\w+$|sign-?up|login|register|onboard/i.test(f),
  );
  for (const f of pages) {
    const fs = findings.filter((x) => x.file === f);
    node(
      {
        id: `page:${f}`,
        column: "entrypoint",
        label: f.replace(/^(src\/)?(app|pages|routes)\//, "/").replace(/\/?(page|\+page|index)\.\w+$/, "") || "/",
        sublabel: f,
        badges: fs.some((x) => x.ruleId === "LEG-03") ? ["LEG-03"] : [],
      },
      fs,
    );
  }
  for (const r of ctx.routes) {
    const id = `route:${r.method} ${r.urlPath}`;
    const ci = ctx.getCode(r.file);
    const [l0, l1] = [ci.lineOf(r.bodyStart ?? 0), ci.lineOf(r.bodyEnd ?? ci.text.length)];
    const fs = findings.filter((f) => f.nodeRef === id || (!f.nodeRef && f.file === r.file && f.line >= l0 - 1 && f.line <= l1));
    node(
      {
        id,
        column: "api",
        label: r.method === "SERVER_ACTION" ? `action ${r.handlerName}()` : `${r.method} ${r.urlPath}`,
        sublabel: r.file,
        badges: [r.hasAuthGuard ? "AUTH" : "NO AUTH", ...(r.hasRateLimit ? ["RATE LIMIT"] : [])],
      },
      fs,
    );
    // page → route when the page references the action name or the URL (dynamic [segments] = wildcard)
    const urlRe = new RegExp(
      `["'\`]${r.urlPath
        .split(/\[[^\]]+\]/)
        .map(esc)
        .join("[^\"'`/]+")}(?![\\w-])`,
    );
    for (const p of pages) {
      const t = ctx.getText(p);
      if (r.method === "SERVER_ACTION" ? !!r.handlerName && t.includes(r.handlerName) : urlRe.test(t)) edges.push({ from: `page:${p}`, to: id, status: "ok" });
    }
  }
  for (const t of ctx.dbTables.values()) {
    const id = `table:${t.name}`;
    const fs = byRef(id);
    node({ id, column: "database", label: t.name, sublabel: t.source, badges: ctx.stack.supabase ? [t.rlsEnabled ? "RLS ON" : "RLS OFF"] : [] }, fs);
  }
  for (const v of ctx.detectedSubprocessors) {
    const id = `vendor:${v.id}`;
    if (nodes.some((n) => n.id === id)) continue;
    node({ id, column: "vendor", label: v.entityName, sublabel: v.category, badges: byRef(id).length ? ["LEG-04"] : [] }, byRef(id));
  }
  const status = (id: string) => nodes.find((n) => n.id === id)?.status;
  for (const r of ctx.routes) {
    const from = `route:${r.method} ${r.urlPath}`;
    for (const t of r.dbTablesAccessed) {
      const to = `table:${ctx.dbTables.get(t.toLowerCase())?.name ?? t}`;
      const s = status(to);
      if (s) edges.push({ from, to, status: s });
    }
    for (const v of r.externalSdksCalled) {
      const to = `vendor:${v}`;
      const s = status(to);
      if (s) edges.push({ from, to, status: s === "ok" ? "ok" : "warn", dashed: true });
    }
  }
  const seen = new Set<string>();
  return { nodes, edges: edges.filter((e) => !seen.has(`${e.from}>${e.to}`) && !!seen.add(`${e.from}>${e.to}`)) };
}
