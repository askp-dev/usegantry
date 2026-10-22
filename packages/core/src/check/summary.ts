/**
 * Shared summary for `gantry check` / `gantry roast` (contracts: packages/core/schema/*.schema.json, docs/check-json.md).
 * `toCheck` is for the repo owner (files, lines, agent prompts). `toRoastInput` is the *only* thing the public
 * card sees: rule ids, scores and counts, so a path, route, table, secret or evidence string can't reach it.
 */

import { SECRET_PATTERNS } from "../context/patterns";
import type { AuditReport, Finding, Pillar, Severity } from "../context/types";
import { redact } from "../rules/helpers";

export const SCHEMA_VERSION = 1;

export interface RepoRef {
  owner: string;
  name: string;
  ref?: string;
  sha?: string;
}

export type CategoryId = "before-launch" | "soon" | "nice-to-have";
export const CATEGORY_LABEL: Record<CategoryId, string> = { "before-launch": "Fix before launch", soon: "Fix soon", "nice-to-have": "Nice to have" };

export interface TopFix {
  ruleId: string;
  severity: Severity;
  category: CategoryId;
  title: string;
  plainWhy: string;
  file: string;
  line: number;
  agentPrompt: string;
}

export interface CheckJson {
  schemaVersion: number;
  mode: "check";
  repo: { owner: string; name: string; ref: string | null; sha: string | null };
  score: number;
  status: AuditReport["status"];
  headline: string;
  summary: { critical: number; high: number; medium: number };
  topFixes: TopFix[];
  categories: Array<{ id: CategoryId; label: string; count: number }>;
  notices: string[];
  /** Age of the dependency-advisory data (DEP-01), when it ran: `--online`, or a local path with a cache. */
  advisoriesAsOf?: string;
  generatedAt: string;
}

export interface RoastInput {
  repo: { owner: string; name: string };
  score: number;
  status: AuditReport["status"];
  pillars: Array<{ pillar: Pillar; score: number }>;
  counts: { critical: number; high: number; medium: number };
  ruleIds: string[];
}

export const categoryOf = (f: Finding): CategoryId =>
  f.blocking || f.severity === "CRITICAL" ? "before-launch" : f.severity === "HIGH" ? "soon" : "nice-to-have";
const ORDER: Record<CategoryId, number> = { "before-launch": 0, soon: 1, "nice-to-have": 2 };
const SEV: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
/** Tie-break: security first, then privacy, legal, cost (an open database outranks a render loop). */
const PILLAR_RANK: Record<Pillar, number> = { SECURITY: 0, PRIVACY: 1, LEGAL: 2, FINOPS_OPS: 3 };

/** Defence in depth: rules already redact, but nothing shaped like a live key leaves via `check --json`. */
export function scrubSecrets(s: string): string {
  let out = s;
  for (const p of SECRET_PATTERNS) out = out.replace(new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : `${p.re.flags}g`), (m) => redact(m));
  return out;
}

const countOf = (r: AuditReport) => ({
  critical: r.findings.filter((f) => f.severity === "CRITICAL").length,
  high: r.findings.filter((f) => f.severity === "HIGH").length,
  medium: r.findings.filter((f) => f.severity === "MEDIUM").length,
});

export function headlineOf(r: AuditReport, cats: Record<CategoryId, number>): string {
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
  if (r.status === "LAUNCH_BLOCKED") return `Not ready to launch yet: fix ${n(cats["before-launch"], "issue")} marked "Fix before launch" first.`;
  if (r.status === "NEEDS_REVIEW") return `Close: nothing blocks launch, but ${n(cats.soon + cats["nice-to-have"], "issue")} could bite you soon.`;
  return "Ready to launch: no blocking issues found in this scan.";
}

export function toCheck(r: AuditReport, repo: RepoRef, opts: { maxFixes?: number } = {}): CheckJson {
  const cats: Record<CategoryId, number> = { "before-launch": 0, soon: 0, "nice-to-have": 0 };
  for (const f of r.findings) cats[categoryOf(f)]++;
  const sorted = [...r.findings].sort(
    (a, b) => ORDER[categoryOf(a)] - ORDER[categoryOf(b)] || SEV[a.severity] - SEV[b.severity] || PILLAR_RANK[a.pillar] - PILLAR_RANK[b.pillar],
  );
  const seen = new Set<string>();
  const topFixes: TopFix[] = [];
  for (const f of sorted) {
    if (seen.has(f.ruleId)) continue; // one fix per rule: the top list is about variety, counts cover the rest
    seen.add(f.ruleId);
    topFixes.push({
      ruleId: f.ruleId,
      severity: f.severity,
      category: categoryOf(f),
      title: scrubSecrets(f.title),
      plainWhy: scrubSecrets(f.impact),
      file: f.file,
      line: f.line,
      agentPrompt: scrubSecrets(f.agentRemediationPrompt),
    });
    if (topFixes.length >= (opts.maxFixes ?? 5)) break;
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    mode: "check",
    repo: { owner: repo.owner, name: repo.name, ref: repo.ref ?? null, sha: repo.sha ?? (r.repo.gitCommitSha || null) },
    score: r.score,
    status: r.status,
    headline: headlineOf(r, cats),
    summary: countOf(r),
    topFixes,
    categories: (Object.keys(cats) as CategoryId[]).map((id) => ({ id, label: CATEGORY_LABEL[id], count: cats[id] })),
    notices: [
      "Static analysis only: no code was run and nothing was probed. A clean result isn't a security guarantee.",
      ...(r.notices ?? []).map((n) => n.message),
      ...(r.suppressed ? [`${r.suppressed} finding(s) were suppressed by gantry-ignore comments or config.`] : []),
    ],
    ...(r.advisoriesAsOf ? { advisoriesAsOf: r.advisoriesAsOf } : {}),
    generatedAt: r.generatedAt,
  };
}

/** Distinct rule ids, worst severity first (then most findings), so the card leads with what matters most. */
function worstFirst(fs: Finding[]): string[] {
  const by = new Map<string, { sev: number; n: number }>();
  for (const f of fs) {
    const e = by.get(f.ruleId) ?? { sev: 9, n: 0 };
    by.set(f.ruleId, { sev: Math.min(e.sev, SEV[f.severity]), n: e.n + 1 });
  }
  return [...by].sort(([a, x], [b, y]) => x.sev - y.sev || y.n - x.n || a.localeCompare(b)).map(([id]) => id);
}

export function toRoastInput(r: AuditReport, repo: RepoRef): RoastInput {
  return {
    repo: { owner: repo.owner, name: repo.name },
    score: r.score,
    status: r.status,
    pillars: r.pillars.map((p) => ({ pillar: p.pillar, score: p.score })),
    counts: countOf(r),
    ruleIds: worstFirst(r.findings),
  };
}
