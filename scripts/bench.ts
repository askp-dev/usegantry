// Perf SLA benchmark: cold CLI scan of a 500+ file repo with git history must finish in < 3000 ms.
// Usage: bun run bench [--runs=5]
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const SLA_MS = 3000;
const REPO = join(import.meta.dir, "..");
const FIXTURE = join(REPO, "fixtures/vulnerable-saas");
const CLI = join(REPO, "packages/core/src/bin/cli.ts");

/** Copies the vulnerable fixture and adds 160 × (route, page, action) so the repo has 500+ files, then commits it. */
export function makeSlaRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "preflight-sla-"));
  cpSync(FIXTURE, root, { recursive: true });
  const route = readFileSync(join(FIXTURE, "app/api/posts/route.ts"), "utf8");
  const page = readFileSync(join(FIXTURE, "app/page.tsx"), "utf8");
  const action = readFileSync(join(FIXTURE, "app/actions.ts"), "utf8");
  for (let i = 0; i < 160; i++) {
    mkdirSync(join(root, `app/api/gen${i}`), { recursive: true });
    writeFileSync(join(root, `app/api/gen${i}/route.ts`), route);
    mkdirSync(join(root, `app/gen${i}`), { recursive: true });
    writeFileSync(join(root, `app/gen${i}/page.tsx`), page);
    writeFileSync(join(root, `app/gen${i}/actions.ts`), action);
  }
  const git = (...a: string[]) =>
    execFileSync("git", ["-C", root, "-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...a], { stdio: "ignore" });
  git("init", "-q");
  git("add", ".");
  git("commit", "-qm", "init");
  return root;
}

/** One cold scan in a fresh `bun` process; returns wall time and the parsed report. */
export function coldScan(root: string) {
  const t0 = performance.now();
  const p = Bun.spawnSync(["bun", CLI, "scan", root, "--offline", "--json"], { env: { ...process.env, NO_COLOR: "1" } });
  const wallMs = performance.now() - t0;
  const out = p.stdout.toString();
  if (!out.trim().startsWith("{")) throw new Error(`scan produced no JSON (exit ${p.exitCode}): ${p.stderr.toString().slice(0, 500)}`);
  return { wallMs, report: JSON.parse(out) };
}

if (import.meta.main) {
  const runs = Math.max(1, Number(process.argv.find((a) => a.startsWith("--runs="))?.slice(7) ?? 5) || 5);
  const root = makeSlaRepo();
  try {
    const walls: number[] = [];
    let last: ReturnType<typeof coldScan>["report"];
    for (let i = 0; i < runs; i++) {
      const { wallMs, report } = coldScan(root);
      walls.push(wallMs);
      last = report;
      console.log(`run ${i + 1}: wall ${Math.round(wallMs)} ms, engine ${report.durationMs} ms`);
    }
    const sorted = [...walls].sort((a, b) => a - b);
    const t = last.timings as Record<string, number>;
    const phases = Object.entries(t)
      .filter(([k]) => !k.startsWith("rule:")) // rules run concurrently, so per-rule times overlap
      .map(([k, v]) => `${k} ${v} ms`);
    console.log(`\nfiles ${last.stats.files}, findings ${last.findings.length}`);
    console.log(
      `wall min ${Math.round(sorted[0])} / median ${Math.round(sorted[sorted.length >> 1])} / max ${Math.round(sorted.at(-1) ?? 0)} ms (SLA ${SLA_MS} ms)`,
    );
    console.log(`phases: ${phases.join(", ")}`);
    if (last.stats.files < 500 || (sorted.at(-1) ?? 0) >= SLA_MS) {
      console.error("SLA FAILED");
      process.exitCode = 1;
    } else console.log("SLA OK");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
