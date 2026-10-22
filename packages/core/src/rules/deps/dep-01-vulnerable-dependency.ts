import { type Advisory, compareVersions, firstFix, loadAdvisories } from "../../context/advisories";
import type { Dependency, RepoContext, Severity } from "../../context/types";
import { defineRule, RuleSkipped } from "../helpers";
import { importSites, lockLine, reinstallHint } from "./dep-helpers";

const LABEL_SCORE: Record<string, number> = { CRITICAL: 9, HIGH: 7.5, MODERATE: 5, MEDIUM: 5, LOW: 2 };
const score = (a: Advisory) => a.cvss ?? LABEL_SCORE[a.label ?? ""] ?? 0;
const cve = (a: Advisory) => a.aliases.find((x) => x.startsWith("CVE-"));
const name = (a: Advisory) => [a.id, cve(a)].filter(Boolean).join(" / ");

/** `gantry-ignore DEP-01 <id> <reason>` comments in the manifest, plus unexpired `ignoreAdvisories` entries. */
function ignoredIds(ctx: RepoContext, d: Dependency, info: { notices: string[] }): Set<string> {
  const ids = new Set<string>();
  const today = new Date().toISOString().slice(0, 10);
  for (const e of ctx.config.ignoreAdvisories ?? []) {
    if (e.package && e.package !== d.name) continue;
    if (!e.reason?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(e.expires ?? "")) {
      const m = `ignoreAdvisories entry ${e.id} needs a reason and an expires date (YYYY-MM-DD); not applied`;
      if (!info.notices.includes(m)) info.notices.push(m);
    } else if (e.expires < today) {
      const m = `ignoreAdvisories entry ${e.id} expired on ${e.expires}; not applied`;
      if (!info.notices.includes(m)) info.notices.push(m);
    } else ids.add(e.id);
  }
  if (d.declaredIn) for (const m of ctx.getText(d.declaredIn).matchAll(/(?:gantry|preflight)-ignore\s+DEP-01\s+([\w.:-]+)\s+(\S[^\n]*)/g)) ids.add(m[1]);
  return ids;
}

export const dep01VulnerableDependency = defineRule(
  { id: "DEP-01", pillar: "SECURITY", severity: "HIGH", title: "Vulnerable Dependency That Matters", scope: "repo" },
  async (ctx, emit, info) => {
    const res = await loadAdvisories(ctx);
    if (res.asOf) info.advisoriesAsOf = res.asOf;
    if (res.withheld)
      info.notices.push(
        `${res.withheld} private-looking package${res.withheld === 1 ? " was" : "s were"} not sent for advisory lookup (local/git deps, unknown scoped names, privatePackages)`,
      );
    if (!res.targets.length) {
      // Nothing resolvable isn't a pass when there are dependencies (DEP-03 flags the missing lockfile).
      if (ctx.dependencies.size) throw new RuleSkipped("Dependency advisories not checked: no lockfile pins exact public versions");
      return;
    }
    if (res.missing === res.targets.length)
      throw new RuleSkipped(
        ctx.config.offline
          ? "Dependency advisories not checked: --offline and no cache in .gantry/advisories (run one scan online)"
          : "Dependency advisories not checked: OSV.dev didn't answer in time (re-run, or check network access to api.osv.dev)",
      );
    const sites = res.byKey.size ? importSites(ctx) : new Map();
    let low = 0;
    for (const [key, advs] of res.byKey) {
      const d = ctx.dependencies.get(key)!;
      const ignored = ignoredIds(ctx, d, info);
      const live = advs.filter((a) => ![a.id, ...a.aliases].some((x) => ignored.has(x)));
      const site = sites.get(key);
      const reachable = !!site || (d.isDirect && !d.isDev);
      const sevOf = (a: Advisory): Severity | null =>
        a.kev ? (reachable ? "CRITICAL" : "HIGH") : score(a) >= 7 && firstFix(d.version, a.fixed) ? "HIGH" : null;
      const matter = live.filter((a) => sevOf(a)).sort((a, b) => Number(b.kev) - Number(a.kev) || score(b) - score(a));
      low += live.length - matter.length;
      if (!matter.length) continue;
      const severity: Severity = matter.some((a) => sevOf(a) === "CRITICAL") ? "CRITICAL" : "HIGH";
      const fixes = matter.map((a) => firstFix(d.version, a.fixed));
      const fix = fixes.filter((f): f is string => !!f).reduce<string | undefined>((m, f) => (!m || compareVersions(f, m) > 0 ? f : m), undefined);
      const unfixed = matter.filter((_, i) => !fixes[i]).map(name);
      const lock = lockLine(ctx, d);
      const top = matter[0];
      const exploited = matter.filter((a) => a.kev);
      const manifest =
        d.declaredIn ?? (d.ecosystem === "pypi" ? "pyproject.toml" : d.ecosystem === "go" ? "go.mod" : d.ecosystem === "cargo" ? "Cargo.toml" : "package.json");
      emit({
        severity,
        file: d.isDirect && d.declaredIn ? d.declaredIn : lock.file,
        line: d.isDirect && d.declaredIn ? (d.declaredLine ?? 1) : lock.line,
        nodeRef: `dep:${d.name}`,
        evidence: [
          `${d.name}@${d.version} (${lock.lockfile ? `${lock.lockfile}:${lock.line}` : "manifest"})`,
          site ? `imported at ${site.file}:${site.line}` : d.isDirect ? "direct dependency" : "transitive dependency",
          matter.map((a) => `${name(a)}${a.kev ? " (CISA KEV: exploited in the wild)" : ` (CVSS ${score(a)})`}`).join(", "),
        ].join(" · "),
        impact: `${exploited.length ? `Attackers are already exploiting ${exploited.map(name).join(", ")} in the wild (CISA KEV), and ` : ""}\`${d.name}\` ${d.version} ${reachable ? `is ${site ? "imported by your code" : "a direct runtime dependency"}` : "is pulled in transitively"}: ${top.summary || name(top)}.${matter.length > 1 ? ` ${matter.length - 1} more serious advisor${matter.length > 2 ? "ies" : "y"} on this version.` : ""}${unfixed.length ? ` No fixed release yet for ${unfixed.join(", ")}.` : ""}`,
        agentRemediationPrompt: fix
          ? `Bump \`${d.name}\` to >=${fix} in ${manifest}${d.isDirect ? "" : " (it's transitive: bump or override the parent that pulls it in)"}, reinstall with ${reinstallHint(d, lock.lockfile, fix)} so the lockfile updates, then run the tests.${unfixed.length ? ` ${unfixed.join(", ")} has no fix yet: check whether your code reaches the vulnerable API.` : ""}`
          : `No fixed \`${d.name}\` release exists for ${unfixed.join(", ")}. Replace or remove \`${d.name}\`${site ? ` (used in ${site.file})` : ""}, or add a dated \`ignoreAdvisories\` entry in gantry.config.json if the vulnerable code path is unreachable.`,
      });
    }
    if (low) info.notices.push(`${low} lower-severity advisories, none known-exploited or CVSS >= 7 with a fix (not shown)`);
    if (!res.kevAvailable && res.byKey.size)
      throw new RuleSkipped("Known-exploited status not checked: the CISA KEV catalogue was unreachable (findings above are CVSS-only)");
    if (res.missing)
      throw new RuleSkipped(
        `Dependency advisories incomplete: ${res.missing} of ${res.targets.length} packages had no advisory data (offline cache miss or OSV.dev timeout)`,
      );
  },
);
