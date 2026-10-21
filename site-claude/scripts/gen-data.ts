// Build-time data for the site: real scans of the repo's own fixtures, so every number, finding and
// prompt on the page is genuine Gantry output (nothing hand-written). Run with `bun run data`.
import { copyFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toRoast } from "../../packages/core/src/check/card";
import { scrubSecrets, toCheck, toRoastInput } from "../../packages/core/src/check/summary";
import { CENTRAL_PUBLIC_KEY } from "../../packages/core/src/compilers/cert-generator";
import { buildRepoContext } from "../../packages/core/src/context/builder";
import type { AuditReport, Finding } from "../../packages/core/src/context/types";
import { RULESET_VERSION, runAudit, VERSION } from "../../packages/core/src/engine";
import { ALL_STATIC_RULES } from "../../packages/core/src/rules/index";

const ROOT = join(import.meta.dir, "../..");
const OUT = join(import.meta.dir, "../src/lib/data");
const PROFILES = ["hipaa", "fintech-pci", "legal-privilege", "eu-ai-act", "airgap"];
mkdirSync(OUT, { recursive: true });

const scan = async (dir: string, profiles: string[] = []) =>
  runAudit(await buildRepoContext(join(ROOT, "fixtures", dir), { config: { offline: true, profiles } }));

// One real example per rule, from whichever vulnerable fixture triggers it first.
const examples = new Map<string, { fixture: string; f: Finding }>();
const fixtures = readdirSync(join(ROOT, "fixtures")).filter((d) => d.startsWith("vulnerable-"));
for (const fx of fixtures) {
  const r = await scan(fx, PROFILES);
  for (const f of r.findings) if (!examples.has(f.ruleId)) examples.set(f.ruleId, { fixture: fx, f });
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const rules = ALL_STATIC_RULES.map((r) => {
  const ex = examples.get(r.id);
  return {
    id: r.id,
    pillar: r.pillar,
    severity: r.severity,
    title: r.title,
    profiles: r.profiles ?? [],
    example: ex && {
      fixture: ex.fixture,
      file: ex.f.file,
      line: ex.f.line,
      evidence: clip(scrubSecrets(ex.f.evidence), 600),
      impact: scrubSecrets(ex.f.impact),
      prompt: scrubSecrets(ex.f.agentRemediationPrompt),
      patch: ex.f.autoFixPatch ? clip(scrubSecrets(ex.f.autoFixPatch.replacementText), 600) : undefined,
    },
  };
});

const PILLAR_ORDER = ["SECURITY", "PRIVACY", "LEGAL", "FINOPS_OPS"];
const pillarOf = new Map(ALL_STATIC_RULES.map((r) => [r.id, r.pillar]));
const order = (id: string) => PILLAR_ORDER.indexOf(pillarOf.get(id) ?? "FINOPS_OPS");

// Before/after pair for the hero: the vulnerable fixture and its fixed twin, timed end to end (context + rules).
async function sample(dir: string) {
  const t0 = performance.now();
  const r: AuditReport = await scan(dir);
  const wallMs = Math.round(performance.now() - t0);
  const repo = { owner: "acme", name: dir };
  return {
    check: toCheck(r, repo),
    roast: toRoast(toRoastInput(r, repo), r.generatedAt),
    pillars: r.pillars,
    stats: r.stats,
    findings: r.findings.length,
    blockers: r.blockers,
    // Distinct blocking rules, security first (the order stations are polled in).
    blockerIds: [...new Set(r.findings.filter((f) => f.blocking).map((f) => f.ruleId))].sort(
      (a, b) => order(a) - order(b) || a.localeCompare(b, "en", { numeric: true }),
    ),
    wallMs,
  };
}
const before = await sample("vulnerable-saas");
const after = await sample("clean-saas");

const pillarCounts: Record<string, number> = {};
for (const r of ALL_STATIC_RULES) pillarCounts[r.pillar] = (pillarCounts[r.pillar] ?? 0) + 1;

const write = (name: string, v: unknown) => writeFileSync(join(OUT, name), `${JSON.stringify(v, null, 2)}\n`);
write("rules.json", rules);
write("sample.json", { before, after });
write("meta.json", {
  version: VERSION,
  rulesetVersion: RULESET_VERSION,
  ruleCount: ALL_STATIC_RULES.length,
  profileRuleCount: ALL_STATIC_RULES.filter((r) => r.profiles?.length).length,
  pillarCounts,
  examples: examples.size,
  centralPublicKey: CENTRAL_PUBLIC_KEY,
  probes: 6,
});
copyFileSync(join(ROOT, "install.sh"), join(import.meta.dir, "../static/install.sh"));
console.log(`site data: ${rules.length} rules (${examples.size} with real examples), before ${before.check.score}/100 (${before.findings} findings, ${before.wallMs} ms), after ${after.check.score}/100`);
