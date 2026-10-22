import { lookupTargets, pool, readCache, type Target, TTL_MS, writeCache } from "../../context/advisories";
import { defineRule, RuleSkipped } from "../helpers";
import { lockLine } from "./dep-helpers";

const DAY = 86_400_000;
const RELEASE_TIMEOUT_MS = 1500;
const DEPS_DEV = "https://api.deps.dev/v3/systems";
const SYSTEM = { npm: "NPM", go: "GO", cargo: "CARGO" } as const;
const COMPROMISED = /compromis|malicious|malware|hijack|backdoor|security incident|unauthori[sz]ed publish/i;

/** Publish date + "pulled" signals for one resolved version. null = couldn't tell. */
type Release = { published?: number; gone?: boolean; compromised?: string };

async function releaseInfo(t: Target, signal: AbortSignal): Promise<Release | null> {
  const get = (url: string) => fetch(url, { signal, headers: { accept: "application/json" } });
  try {
    if (t.eco === "pypi") {
      const r = await get(`https://pypi.org/pypi/${encodeURIComponent(t.dep.name)}/${encodeURIComponent(t.version)}/json`);
      if (r.status === 404) return { gone: true };
      if (!r.ok) return null;
      const j: any = await r.json();
      const ts = (j.urls ?? []).map((u: any) => Date.parse(u.upload_time_iso_8601 ?? u.upload_time)).filter(Number.isFinite);
      return {
        ...(ts.length ? { published: Math.min(...ts) } : {}),
        ...(j.info?.yanked ? { compromised: `yanked: ${j.info.yanked_reason || "no reason given"}` } : {}),
      };
    }
    const r = await get(`${DEPS_DEV}/${SYSTEM[t.eco]}/packages/${encodeURIComponent(t.dep.name)}/versions/${encodeURIComponent(t.version)}`);
    if (r.status === 404 && t.eco === "npm") {
      // deps.dev lags brand-new releases by hours; the registry knows whether the version still exists.
      const reg = await get(`https://registry.npmjs.org/${t.dep.name.replace("/", "%2F")}/${encodeURIComponent(t.version)}`);
      return reg.status === 404 ? { gone: true } : reg.ok ? { published: Date.now() } : null;
    }
    if (!r.ok) return null;
    const j: any = await r.json();
    const published = Date.parse(j.publishedAt);
    return {
      ...(Number.isFinite(published) ? { published } : {}),
      ...(j.isDeprecated && COMPROMISED.test(j.deprecatedReason ?? "") ? { compromised: `deprecated: ${j.deprecatedReason}` } : {}),
    };
  } catch {
    return null;
  }
}

type Entry = { at: number } & Release;

export const dep02TooNewRelease = defineRule(
  { id: "DEP-02", pillar: "SECURITY", severity: "HIGH", title: "Too-New Release (Inside the Minimum Release Age)", scope: "repo" },
  async (ctx, emit) => {
    const { targets } = lookupTargets(ctx);
    if (!targets.length) {
      if (ctx.dependencies.size) throw new RuleSkipped("Release ages not checked: no lockfile pins exact public versions");
      return;
    }
    const minDays = ctx.config.minReleaseAgeDays ?? 7;
    const now = Date.now();
    const cache = readCache<Record<string, Entry>>(ctx.rootDir, "releases", {});
    const key = (t: Target) => `${t.eco}:${t.dep.name}@${t.version}`;
    // Old releases only get older, so their dates are reused for good; young or pulled ones refresh daily.
    const settled = (e?: Entry) => !!e && ((e.published !== undefined && now - e.published >= minDays * DAY && !e.compromised) || now - e.at < TTL_MS);
    if (!ctx.config.offline) {
      const need = targets.filter((t) => !settled(cache[key(t)]));
      const signal = AbortSignal.timeout(RELEASE_TIMEOUT_MS);
      await pool(need, 24, async (t) => {
        const r = await releaseInfo(t, signal);
        if (r) cache[key(t)] = { at: now, ...r };
      });
      if (need.length) writeCache(ctx.rootDir, "releases", cache);
    }
    let missing = 0;
    for (const t of targets) {
      const e = cache[key(t)];
      if (!e) {
        missing++;
        continue;
      }
      const ageDays = e.published !== undefined ? (now - e.published) / DAY : undefined;
      const young = ageDays !== undefined && ageDays < minDays;
      if (!young && !e.gone) continue;
      const pulled = e.gone ? "doesn't exist on the registry (unpublished, often after a compromise, or never published)" : e.compromised;
      const lock = lockLine(ctx, t.dep);
      const age = ageDays === undefined ? "" : ageDays < 1 ? "less than a day ago" : `${Math.round(ageDays)} day${Math.round(ageDays) === 1 ? "" : "s"} ago`;
      emit({
        severity: pulled ? "CRITICAL" : "HIGH",
        file: lock.file,
        line: lock.line,
        nodeRef: `dep:${t.dep.name}`,
        evidence: `${t.dep.name}@${t.version} (${lock.lockfile ?? "manifest"})${age ? ` · published ${age}` : ""}${pulled ? ` · ${pulled}` : ""}`,
        impact: pulled
          ? `The pinned \`${t.dep.name}@${t.version}\` ${pulled}. Installing it again can run an attacker's install script on every developer laptop and CI runner.`
          : `\`${t.dep.name}@${t.version}\` was published ${age}, inside the ${minDays}-day window when hijacked-maintainer releases are usually caught and pulled. Supply-chain worms spread through exactly these fresh versions.`,
        agentRemediationPrompt: `${e.gone ? `Check where \`${t.dep.name}@${t.version}\` came from (a lockfile can't pin a version the registry never served). ` : ""}Pin \`${t.dep.name}\` to the previous release published more than ${minDays} days ago, reinstall so ${lock.lockfile ?? "the lockfile"} updates, and set a minimum release age so it can't recur: pnpm \`minimumReleaseAge: ${minDays * 1440}\` (pnpm-workspace.yaml), bun \`[install] minimumReleaseAge = ${minDays * 86400}\` (bunfig.toml), yarn \`npmMinimalAgeGate: ${minDays * 1440}\` (.yarnrc.yml), npm >= 11.10 \`min-release-age=${minDays}\` (.npmrc), uv \`exclude-newer\` (pyproject.toml).${pulled ? " Then check CI logs and developer machines for the install script's activity and rotate any secrets they could read." : ""}`,
      });
    }
    if (missing === targets.length)
      throw new RuleSkipped(
        ctx.config.offline
          ? "Release ages not checked: --offline and no cache in .gantry/advisories (run one scan online)"
          : "Release ages not checked: the package registries didn't answer in time",
      );
    if (missing) throw new RuleSkipped(`Release ages incomplete: ${missing} of ${targets.length} packages had no publish date yet (re-run to finish)`);
  },
);
