/** Stubbed OSV / CISA KEV / deps.dev / PyPI for DEP-01/02 tests (recorded responses; never the network). */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DAY = 86_400_000;
const FIX = join(import.meta.dir, "fixtures/advisories");
const VULNS: Record<string, any> = JSON.parse(readFileSync(join(FIX, "osv-vulns.json"), "utf8"));
const KEV = JSON.parse(readFileSync(join(FIX, "kev.json"), "utf8"));

/** Recorded `querybatch` answers (2026-10-22), keyed `<OSV ecosystem>:<name>@<version>`. */
const OSV_HITS: Record<string, string[]> = {
  "npm:jquery@3.4.1": ["GHSA-gxr4-xjj5-5px2", "GHSA-jpcq-cgw6-v4j6"],
  "PyPI:pyyaml@5.3": ["GHSA-8q59-q68h-6hv4"],
  "npm:lodash@4.17.20": ["GHSA-29mw-wpgm-hmr9", "GHSA-35jh-r3h4-6jhm", "GHSA-f23m-r3pf-42rh", "GHSA-r5fr-rjxr-66jc", "GHSA-xxjr-mmjv-4gpg"],
};

export interface StubOptions {
  /** Days since publish per `name@version` (default 400 days). */
  ages?: Record<string, number>;
  /** `name@version` that 404 everywhere (unpublished). */
  gone?: string[];
  /** `name@version` → deprecation message (npm) / yank reason (PyPI). */
  deprecated?: Record<string, string>;
  failOsv?: boolean;
  failKev?: boolean;
  failRegistry?: boolean;
  hits?: Record<string, string[]>;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function installAdvisoryStub(opts: StubOptions = {}) {
  const realFetch = globalThis.fetch;
  const prevCache = process.env.GANTRY_ADVISORY_CACHE;
  const cacheDir = mkdtempSync(join(tmpdir(), "gantry-adv-"));
  process.env.GANTRY_ADVISORY_CACHE = cacheDir;
  const calls: Array<{ url: string; body?: string; signal?: AbortSignal | null }> = [];
  const hits = { ...OSV_HITS, ...opts.hits };
  const age = (nv: string) => opts.ages?.[nv] ?? 400;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined, signal: init?.signal });
    if (url === "https://api.osv.dev/v1/querybatch") {
      if (opts.failOsv) throw new TypeError("network down");
      const { queries } = JSON.parse(String(init?.body));
      return json({
        results: queries.map((q: any) => ({
          vulns: (hits[`${q.package.ecosystem}:${q.package.name}@${q.version}`] ?? []).map((id) => ({ id, modified: "2026-10-01T00:00:00Z" })),
        })),
      });
    }
    let m = url.match(/^https:\/\/api\.osv\.dev\/v1\/vulns\/(.+)$/);
    if (m) return VULNS[decodeURIComponent(m[1])] ? json(VULNS[decodeURIComponent(m[1])]) : json({ code: 5, message: "Bug not found." }, 404);
    if (url.includes("known_exploited_vulnerabilities.json")) {
      if (opts.failKev) throw new TypeError("network down");
      return json(KEV);
    }
    if (opts.failRegistry && /deps\.dev|pypi\.org|registry\.npmjs\.org/.test(url)) throw new TypeError("network down");
    m = url.match(/^https:\/\/api\.deps\.dev\/v3\/systems\/(\w+)\/packages\/([^/]+)\/versions\/([^/]+)$/);
    if (m) {
      const nv = `${decodeURIComponent(m[2])}@${decodeURIComponent(m[3])}`;
      if (opts.gone?.includes(nv)) return json({ code: 5, message: "version not found" }, 404);
      const dep = opts.deprecated?.[nv];
      return json({ publishedAt: new Date(Date.now() - age(nv) * DAY).toISOString(), isDeprecated: !!dep, ...(dep ? { deprecatedReason: dep } : {}) });
    }
    m = url.match(/^https:\/\/registry\.npmjs\.org\/(.+)\/([^/]+)$/);
    if (m) return opts.gone?.includes(`${decodeURIComponent(m[1])}@${m[2]}`) ? json({ error: "not found" }, 404) : json({ version: m[2] });
    m = url.match(/^https:\/\/pypi\.org\/pypi\/([^/]+)\/([^/]+)\/json$/);
    if (m) {
      const nv = `${decodeURIComponent(m[1])}@${decodeURIComponent(m[2])}`;
      if (opts.gone?.includes(nv)) return json({ message: "Not Found" }, 404);
      const y = opts.deprecated?.[nv];
      return json({ info: { yanked: !!y, yanked_reason: y ?? null }, urls: [{ upload_time_iso_8601: new Date(Date.now() - age(nv) * DAY).toISOString() }] });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return {
    calls,
    cacheDir,
    /** Every package name that left the machine, from querybatch bodies and registry URLs. */
    sentNames(): string[] {
      const out: string[] = [];
      for (const c of calls) {
        if (c.body) for (const q of JSON.parse(c.body).queries ?? []) out.push(q.package.name);
        const m = c.url.match(/packages\/([^/]+)\/versions|pypi\.org\/pypi\/([^/]+)\/|registry\.npmjs\.org\/(.+)\/[^/]+$/);
        if (m) out.push(decodeURIComponent(m[1] ?? m[2] ?? m[3]));
      }
      return out;
    },
    restore() {
      globalThis.fetch = realFetch;
      if (prevCache === undefined) delete process.env.GANTRY_ADVISORY_CACHE;
      else process.env.GANTRY_ADVISORY_CACHE = prevCache;
      rmSync(cacheDir, { recursive: true, force: true });
    },
  };
}
