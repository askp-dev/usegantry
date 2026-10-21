import { expect, test } from "bun:test";
import { buildRepoContext } from "../src/context/builder";
import type { RuleDefinition } from "../src/context/types";
import { audit, runAudit, scoreOf, statusOf } from "../src/engine";
import { makeFinding } from "../src/rules/helpers";

test("scoring: -25/-10/-4, floor 0", () => {
  const f = (severity: "CRITICAL" | "HIGH" | "MEDIUM") =>
    makeFinding({ id: "X", pillar: "SECURITY", severity, title: "" }, { file: "a", line: 1, evidence: severity, impact: "", agentRemediationPrompt: "" });
  expect(scoreOf([])).toBe(100);
  expect(scoreOf([f("CRITICAL")])).toBe(75);
  expect(scoreOf([f("HIGH"), f("MEDIUM")])).toBe(86);
  expect(scoreOf(Array.from({ length: 5 }, () => f("CRITICAL")))).toBe(0);
});

test("status matrix", () => {
  expect(statusOf(100, 0)).toBe("LAUNCH_READY");
  expect(statusOf(90, 0)).toBe("LAUNCH_READY");
  expect(statusOf(89, 0)).toBe("NEEDS_REVIEW");
  expect(statusOf(99, 1)).toBe("LAUNCH_BLOCKED");
});

test("vulnerable fixture: blocked, all pillars penalised, graph has 4 columns", async () => {
  const r = await audit("fixtures/vulnerable-saas", { config: { offline: true } });
  expect(r.status).toBe("LAUNCH_BLOCKED");
  expect(r.blockers).toBeGreaterThan(0);
  expect(new Set(r.findings.map((f) => f.ruleId)).size).toBe(39);
  expect(r.errors).toBeUndefined();
  for (const p of r.pillars) expect(p.score).toBeLessThan(100);
  expect(new Set(r.graph.nodes.map((n) => n.column))).toEqual(new Set(["entrypoint", "api", "database", "vendor"]));
  expect(r.graph.nodes.find((n) => n.id === "table:documents")).toMatchObject({ status: "block", badges: ["RLS OFF"] });
  expect(r.graph.nodes.find((n) => n.id === "vendor:openai")?.badges).toContain("LEG-04");
  expect(r.graph.edges.some((e) => e.from === "route:POST /api/chat" && e.to === "vendor:openai" && e.dashed)).toBe(true);
  expect(r.graph.edges.some((e) => e.from === "page:app/page.tsx" && e.to === "route:GET /api/posts")).toBe(true);
  // sorted CRITICAL → HIGH → MEDIUM
  const order = r.findings.map((f) => ["CRITICAL", "HIGH", "MEDIUM"].indexOf(f.severity));
  expect(order).toEqual([...order].sort((a, b) => a - b));
});

test("clean fixture: LAUNCH_READY, score ≥ 90, 0 findings", async () => {
  const r = await audit("fixtures/clean-saas", { config: { offline: true } });
  expect(r.findings).toEqual([]);
  expect(r.score).toBeGreaterThanOrEqual(90);
  expect(r.blockers).toBe(0);
  expect(r.status).toBe("LAUNCH_READY");
});

test("--strict turns HIGH findings into blockers", async () => {
  const ctx = await buildRepoContext("fixtures/vulnerable-saas", { config: { offline: true } });
  const loose = await runAudit(ctx, { ruleIds: ["SEC-09"] });
  const strict = await runAudit(ctx, { ruleIds: ["SEC-09"], strict: true });
  expect(loose.blockers).toBe(0);
  expect(strict.blockers).toBe(strict.findings.length);
  expect(strict.findings.length).toBeGreaterThan(0);
});

test("a throwing rule is isolated and reported", async () => {
  const ctx = await buildRepoContext("fixtures/clean-saas", { config: { offline: true } });
  const boom: RuleDefinition = {
    id: "BOOM-01",
    pillar: "SECURITY",
    severity: "HIGH",
    title: "boom",
    run: () => {
      throw new Error("kaput");
    },
  };
  const ok: RuleDefinition = {
    id: "OK-01",
    pillar: "SECURITY",
    severity: "MEDIUM",
    title: "ok",
    run: () => [makeFinding(ok, { file: "package.json", line: 1, evidence: "e", impact: "i", agentRemediationPrompt: "p" })],
  };
  const r = await runAudit(ctx, { rules: [boom, ok] });
  expect(r.errors).toEqual([{ ruleId: "BOOM-01", message: "kaput" }]);
  expect(r.findings.length).toBe(1);
  expect(r.score).toBe(96);
});
