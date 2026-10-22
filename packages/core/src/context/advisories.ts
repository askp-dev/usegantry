/**
 * Advisory lookups for DEP-01 (and the privacy filter + cache DEP-02 shares).
 * One OSV.dev `querybatch` per scan for every resolved public {ecosystem, name, version}, `vulns/{id}` only for
 * ids we haven't cached, joined with the CISA KEV catalogue. Only package names + versions leave the machine.
 * Cache: `.gantry/advisories/` (24 h TTL; offline scans use it at any age).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cvss3BaseScore } from "./cvss";
import { lookupKnownPackage } from "./knowledge";
import type { Dependency, RepoContext } from "./types";

const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch";
const OSV_VULN_URL = "https://api.osv.dev/v1/vulns/";
const KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const ADVISORY_TIMEOUT_MS = 1500;
/** The KEV feed is ~2 MB and cached for a day, so it gets a longer budget than the batch query. */
const KEV_TIMEOUT_MS = 3000;
export const TTL_MS = 86_400_000;
const CACHE_DIR = ".gantry/advisories";

const OSV_ECO: Record<NonNullable<Dependency["ecosystem"]>, string> = { npm: "npm", pypi: "PyPI", go: "Go", cargo: "crates.io" };

export interface Target {
  key: string; // ctx.dependencies key
  dep: Dependency;
  eco: NonNullable<Dependency["ecosystem"]>;
  version: string;
}

export interface Advisory {
  id: string;
  aliases: string[];
  summary: string;
  cvss?: number;
  /** GHSA label (LOW/MODERATE/HIGH/CRITICAL) when there's no v3 vector. */
  label?: string;
  /** Fixed versions for this package (all ranges). */
  fixed: string[];
  kev: boolean;
}

export interface AdvisoryResult {
  /** Advisories per ctx.dependencies key (only packages with at least one). */
  byKey: Map<string, Advisory[]>;
  targets: Target[];
  /** Packages withheld from the lookup because they look private. */
  withheld: number;
  /** Targets with no data (offline without cache, or a failed lookup). */
  missing: number;
  kevAvailable: boolean;
  /** Oldest fetch time of the data used (ISO). */
  asOf?: string;
}

/** OSV ids PyPI names by display case (`PyYAML`); compare normalised (PEP 503). */
const pkgId = (eco: string, name: string) => `${eco}:${eco === "PyPI" ? name.toLowerCase().replace(/[-_.]+/g, "-") : name}`;

// ── privacy filter ───────────────────────────────────────────────────────────
const globRe = (p: string) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);

/** True when a package name must never be sent to a third-party lookup. */
function looksPrivate(ctx: RepoContext, d: Dependency, env = process.env): boolean {
  if (d.isLocal || d.privateRegistry) return true;
  if ((ctx.config.privatePackages ?? []).some((p) => globRe(p).test(d.name))) return true;
  // Scoped npm names we can't confirm as public (seed DB) may be an org's internal packages.
  if ((d.ecosystem ?? "npm") === "npm" && d.name.startsWith("@") && !lookupKnownPackage("npm", d.name)) return true;
  if (d.ecosystem === "go") {
    const pats = `${env.GOPRIVATE ?? ""},${env.GONOPROXY ?? ""},${env.GONOSUMDB ?? ""}`.split(",").filter(Boolean);
    if (pats.some((p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}(/|$)`).test(d.name))) return true;
  }
  return false;
}

/** A resolved, exact version (lockfile or `==` pin); ranges can't be looked up. */
function exactVersion(d: Dependency): string | null {
  const v = d.version.trim();
  if (d.ecosystem === "go") return /^v\d+\.\d+\.\d+\S*$/.test(v) ? v : null;
  return /^v?\d+(\.\d+){1,3}([-+.]?[\w.]+)?$/.test(v) && !/[\s^~<>=*|]/.test(v) ? v.replace(/^v/, "") : null;
}

/** Public lookup targets plus how many deps were withheld as private. */
export function lookupTargets(ctx: RepoContext): { targets: Target[]; withheld: number } {
  const targets: Target[] = [];
  let withheld = 0;
  for (const [key, d] of ctx.dependencies) {
    const version = exactVersion(d);
    if (!version && !d.isLocal) continue;
    if (looksPrivate(ctx, d)) {
      withheld++;
      continue;
    }
    if (version) targets.push({ key, dep: d, eco: d.ecosystem ?? "npm", version });
  }
  return { targets, withheld };
}

// ── cache ────────────────────────────────────────────────────────────────────
type Stamped<T> = { at: number } & T;
interface Cache {
  osv: Record<string, Stamped<{ ids: string[] }>>;
  vulns: Record<string, Stamped<{ v: Omit<Advisory, "kev"> & { pkgs: string[] } }>>;
  kev?: Stamped<{ ids: string[] }>;
}

/** `GANTRY_ADVISORY_CACHE` relocates the cache (tests, read-only checkouts, a shared CI cache). */
const cacheDir = (root: string) => process.env.GANTRY_ADVISORY_CACHE ?? join(root, CACHE_DIR);
const cacheFile = (root: string, name: string) => join(cacheDir(root), `${name}.json`);

export function readCache<T>(root: string, name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(cacheFile(root, name), "utf8"));
  } catch {
    return fallback;
  }
}

export function writeCache(root: string, name: string, data: unknown) {
  try {
    const dir = cacheDir(root);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    // Self-ignoring, so the cache never gets committed even without a root .gitignore entry.
    if (!existsSync(join(dir, ".gitignore"))) writeFileSync(join(dir, ".gitignore"), "*\n");
    writeFileSync(cacheFile(root, name), JSON.stringify(data));
  } catch {
    /* read-only checkout: just don't cache */
  }
}

const qkey = (t: Target) => `${t.eco}:${t.dep.name}@${t.version}`;
const fresh = (at: number | undefined, now: number) => at !== undefined && now - at < TTL_MS;

// ── network ──────────────────────────────────────────────────────────────────
async function getJson(url: string, signal: AbortSignal, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, { ...init, signal, headers: { accept: "application/json", ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

async function queryBatch(targets: Target[], signal: AbortSignal): Promise<string[][]> {
  const out: string[][] = [];
  for (let i = 0; i < targets.length; i += 1000) {
    const queries = targets.slice(i, i + 1000).map((t) => ({ package: { name: t.dep.name, ecosystem: OSV_ECO[t.eco] }, version: t.version }));
    const j = await getJson(OSV_BATCH_URL, signal, { method: "POST", body: JSON.stringify({ queries }), headers: { "content-type": "application/json" } });
    for (const r of j.results ?? []) out.push((r?.vulns ?? []).map((v: any) => String(v.id)));
  }
  return out;
}

/** Normalise an OSV record to what DEP-01 needs (keeps the cache small). */
function trimVuln(v: any): Omit<Advisory, "kev"> & { pkgs: string[] } {
  const v3 = (v.severity ?? []).find((s: any) => /^CVSS_V3/.test(s.type))?.score;
  const cvss = v3 ? cvss3BaseScore(v3) : null;
  const pkgs: string[] = [];
  const fixed: string[] = [];
  for (const a of v.affected ?? []) {
    const id = pkgId(String(a.package?.ecosystem), String(a.package?.name));
    pkgs.push(id);
    for (const r of a.ranges ?? []) for (const e of r.events ?? []) if (e.fixed) fixed.push(`${id}@${e.fixed}`);
  }
  return {
    id: String(v.id),
    aliases: (v.aliases ?? []).map(String),
    summary: String(v.summary ?? v.details ?? "")
      .split("\n")[0]
      .slice(0, 240),
    ...(cvss !== null ? { cvss } : {}),
    ...(v.database_specific?.severity ? { label: String(v.database_specific.severity).toUpperCase() } : {}),
    fixed,
    pkgs,
  };
}

export async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

// ── main entry ───────────────────────────────────────────────────────────────
const memo = new WeakMap<RepoContext, Promise<AdvisoryResult>>();

/** Memoized per context: DEP-01 and the SBOM share one lookup. */
export function loadAdvisories(ctx: RepoContext, now = Date.now()): Promise<AdvisoryResult> {
  const hit = memo.get(ctx);
  if (hit) return hit;
  const p = fetchAdvisories(ctx, now);
  memo.set(ctx, p);
  return p;
}

async function fetchAdvisories(ctx: RepoContext, now: number): Promise<AdvisoryResult> {
  const root = ctx.rootDir;
  const { targets, withheld } = lookupTargets(ctx);
  const cache: Cache = { osv: {}, vulns: {}, ...readCache<Partial<Cache>>(root, "osv", {}) };
  const online = !ctx.config.offline;
  let dirty = false;

  if (online && targets.length) {
    const stale = targets.filter((t) => !fresh(cache.osv[qkey(t)]?.at, now));
    const kevStale = !fresh(cache.kev?.at, now);
    const [ids, kev] = await Promise.all([
      stale.length ? queryBatch(stale, AbortSignal.timeout(ADVISORY_TIMEOUT_MS)).catch(() => null) : [],
      kevStale ? getJson(KEV_URL, AbortSignal.timeout(KEV_TIMEOUT_MS)).catch(() => null) : null,
    ]);
    if (ids && ids.length === stale.length) {
      stale.forEach((t, i) => {
        cache.osv[qkey(t)] = { at: now, ids: ids[i] };
      });
      dirty = true;
    }
    if (kev?.vulnerabilities) {
      cache.kev = { at: now, ids: kev.vulnerabilities.map((v: any) => String(v.cveID)) };
      dirty = true;
    }
    // Details only for ids we don't have (or that went stale).
    const need = [...new Set(targets.flatMap((t) => cache.osv[qkey(t)]?.ids ?? []))].filter((id) => !fresh(cache.vulns[id]?.at, now));
    const signal = AbortSignal.timeout(ADVISORY_TIMEOUT_MS);
    await pool(need, 16, async (id) => {
      try {
        cache.vulns[id] = { at: now, v: trimVuln(await getJson(OSV_VULN_URL + encodeURIComponent(id), signal)) };
        dirty = true;
      } catch {
        /* missing detail → counted as missing below */
      }
    });
    if (dirty) writeCache(root, "osv", cache);
  }

  const kevIds = new Set(cache.kev?.ids ?? []);
  const byKey = new Map<string, Advisory[]>();
  const used: number[] = [];
  let missing = 0;
  for (const t of targets) {
    const q = cache.osv[qkey(t)];
    if (!q) {
      missing++;
      continue;
    }
    used.push(q.at);
    const advs: Advisory[] = [];
    for (const id of q.ids) {
      const c = cache.vulns[id];
      if (!c) {
        missing++;
        break;
      }
      used.push(c.at);
      const me = pkgId(OSV_ECO[t.eco], t.dep.name);
      const { pkgs: _, ...v } = c.v;
      advs.push({
        ...v,
        fixed: v.fixed.filter((f) => f.startsWith(`${me}@`)).map((f) => f.slice(me.length + 1)),
        kev: [v.id, ...v.aliases].some((a) => kevIds.has(a)),
      });
    }
    if (advs.length) byKey.set(t.key, advs);
  }
  if (cache.kev && byKey.size) used.push(cache.kev.at);
  return {
    byKey,
    targets,
    withheld,
    missing,
    kevAvailable: !!cache.kev,
    ...(used.length ? { asOf: new Date(Math.min(...used)).toISOString() } : {}),
  };
}

// ── versions ─────────────────────────────────────────────────────────────────
const parts = (v: string) =>
  v
    .replace(/^v/, "")
    .split(/[-+]/)[0]
    .split(".")
    .map((x) => Number.parseInt(x, 10) || 0);
const pre = (v: string) => /-/.test(v.replace(/^v/, ""));

export function compareVersions(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return Number(pre(a)) - Number(pre(b)) ? (pre(a) ? -1 : 1) : 0;
}

/** First fixed version above `current`, preferring the same major (least disruptive bump). */
export function firstFix(current: string, fixed: string[]): string | undefined {
  const above = [...new Set(fixed)].filter((f) => compareVersions(f, current) > 0 && !pre(f)).sort(compareVersions);
  return above.find((f) => parts(f)[0] === parts(current)[0]) ?? above[0];
}
