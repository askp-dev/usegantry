/** Shared pipeline for `gantry check` and `gantry roast`: fetch (or local path) → static scan (offline unless `--online`) → summary. */
import { buildRepoContext } from "../context/builder";
import type { AuditReport } from "../context/types";
import { runAudit } from "../engine";
import { type Fetch, fetchSnapshot, parseTarget, type RepoTarget, resolveToken } from "./fetch";
import type { RepoRef } from "./summary";

/** `online` (`--online`) allows the name-only lookups (DEP-01/02 advisories, LEG-01 registry); never code, scripts or probes. */
export async function scanTarget(
  input: string,
  opts: { fetchImpl?: Fetch; online?: boolean } = {},
): Promise<{ report: AuditReport; repo: RepoRef; target: RepoTarget }> {
  const target = parseTarget(input);
  const offline = !opts.online;
  if (target.kind === "local") {
    const report = await runAudit(await buildRepoContext(target.path!, { config: { offline } }));
    return { report, repo: { owner: "", name: target.name, sha: report.repo.gitCommitSha || undefined }, target };
  }
  const snap = await fetchSnapshot(target, { token: resolveToken(), fetchImpl: opts.fetchImpl });
  try {
    // Static only (offline unless --online): never the pentester, never installs or scripts from the downloaded repo.
    const report = await runAudit(await buildRepoContext(snap.dir, { config: { offline } }));
    report.repo.name = target.name;
    report.repo.rootDir = "";
    report.repo.gitCommitSha = snap.sha;
    return { report, repo: { owner: target.owner, name: target.name, ref: target.ref, sha: snap.sha }, target };
  } finally {
    snap.cleanup();
  }
}
