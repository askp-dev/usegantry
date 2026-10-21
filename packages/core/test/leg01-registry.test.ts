import { afterAll, afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRepoContext } from "../src/context/builder";
import { leg01Slopsquatting } from "../src/rules/legal/leg-01-slopsquatting";

// LEG-01's live-registry path (quirk 7) with a stubbed fetch: no network.
const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const NPM: Record<string, { created: string; weekly: number } | 404> = {
  "ghost-agent-sdkx": 404,
  "@qqacme/agent-kit": 404,
  "fresh-llm-helperx": { created: iso(3), weekly: 12 },
  "old-niche-libqq": { created: iso(800), weekly: 10 },
  "new-viral-libqq": { created: iso(3), weekly: 5_000 },
};
const PYPI: Record<string, string | 404> = { "pyghost-qqx": 404, "pyfresh-qqx": iso(5), "pyold-qqx": iso(900) };

const root = mkdtempSync(join(tmpdir(), "gantry-leg01-"));
writeFileSync(
  join(root, "package.json"),
  JSON.stringify({ name: "t", dependencies: Object.fromEntries([...Object.keys(NPM), "flaky-netlibqq"].map((n) => [n, "^1.0.0"])) }),
);
writeFileSync(join(root, "requirements.txt"), `${Object.keys(PYPI).join("==1.0\n")}==1.0\n`);

const realFetch = globalThis.fetch;
const calls: Array<{ url: string; signal?: AbortSignal | null }> = [];
afterEach(() => {
  globalThis.fetch = realFetch;
  calls.length = 0;
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

function stubFetch() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, signal: init?.signal });
    let m = url.match(/^https:\/\/registry\.npmjs\.org\/(.+)$/);
    if (m) {
      const name = decodeURIComponent(m[1]);
      if (name === "flaky-netlibqq") throw new TypeError("network down");
      const e = NPM[name];
      return e === 404 || !e ? json({ error: "Not found" }, 404) : json({ name, time: { created: e.created } });
    }
    m = url.match(/^https:\/\/api\.npmjs\.org\/downloads\/point\/last-week\/(.+)$/);
    if (m) {
      const e = NPM[m[1]];
      return e && e !== 404 ? json({ downloads: e.weekly }) : json({ error: "not found" }, 404);
    }
    m = url.match(/^https:\/\/pypi\.org\/pypi\/([^/]+)\/json$/);
    if (m) {
      const e = PYPI[m[1]];
      return e === 404 || !e ? json({ message: "Not Found" }, 404) : json({ releases: { "1.0": [{ upload_time_iso_8601: e }] } });
    }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
}

const flagged = async (offline: boolean) => {
  const ctx = await buildRepoContext(root, { config: { offline } });
  return (await leg01Slopsquatting.run(ctx)).map((f) => f.evidence);
};

test("LEG-01 flags 404s and brand-new low-download packages from the live registry", async () => {
  stubFetch();
  const ev = await flagged(false);
  const hit = (name: string) => ev.find((e) => e.startsWith(`"${name}"`));
  expect(hit("ghost-agent-sdkx")).toContain("does not exist on the registry (404)");
  expect(hit("@qqacme/agent-kit")).toContain("(404)");
  expect(hit("fresh-llm-helperx")).toContain("first published 3 days ago with 12 weekly downloads");
  expect(hit("pyghost-qqx")).toContain("(404)");
  expect(hit("pyfresh-qqx")).toContain("first published 5 days ago");
  // Old packages, new-but-popular packages and network failures are never findings.
  for (const n of ["old-niche-libqq", "new-viral-libqq", "flaky-netlibqq", "pyold-qqx"]) expect(hit(n)).toBeUndefined();
  expect(ev).toHaveLength(5);
  // Scoped names are encoded, and every request carries the timeout signal.
  expect(calls.some((c) => c.url === "https://registry.npmjs.org/@qqacme%2Fagent-kit")).toBe(true);
  expect(calls.every((c) => c.signal instanceof AbortSignal)).toBe(true);
});

test("LEG-01 makes no network calls offline", async () => {
  stubFetch();
  expect(await flagged(true)).toEqual([]);
  expect(calls).toHaveLength(0);
});
