#!/usr/bin/env bun
/**
 * Builds data/known-packages.sqlite from the curated seed lists in data/seed/.
 *
 *   bun run scripts/build-known-packages.ts            # offline build from seeds
 *   bun run scripts/build-known-packages.ts --refresh  # also pull weekly downloads, licenses,
 *                                                      # repo URLs & creation dates from the
 *                                                      # npm / PyPI registries (needs network)
 *   bun run scripts/build-known-packages.ts --top-npm 50000 --refresh
 *                                                      # expand to the npm top-N via the
 *                                                      # npms.io search API (needs network)
 */
import { Database } from "bun:sqlite";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const out = join(root, "data", "known-packages.sqlite");
const args = process.argv.slice(2);
const refresh = args.includes("--refresh");
const topIdx = args.indexOf("--top-npm");
const topN = topIdx >= 0 ? Number(args[topIdx + 1]) : 0;

interface Row {
  ecosystem: "npm" | "pypi";
  name: string;
  rank: number;
  license: string | null;
  licenseFromMajor: number | null;
  weeklyDownloads: number | null;
  repoUrl: string | null;
  createdAt: string | null;
}

function readSeed(file: string, ecosystem: Row["ecosystem"]): Row[] {
  const rows: Row[] = [];
  let rank = 0;
  for (const raw of readFileSync(join(root, "data", "seed", file), "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [name, license, fromMajor] = line.split("|");
    rows.push({
      ecosystem,
      name: ecosystem === "pypi" ? name.toLowerCase() : name,
      rank: ++rank,
      license: license || null,
      licenseFromMajor: fromMajor ? Number(fromMajor) : null,
      weeklyDownloads: null,
      repoUrl: null,
      createdAt: null,
    });
  }
  return rows;
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function enrich(rows: Row[]) {
  const queue = [...rows];
  let done = 0;
  const worker = async () => {
    while (queue.length) {
      const row = queue.shift()!;
      if (row.ecosystem === "npm") {
        const meta = await fetchJson(`https://registry.npmjs.org/${row.name.replace("/", "%2f")}`);
        if (meta) {
          const latest = meta["dist-tags"]?.latest;
          const lic = meta.versions?.[latest]?.license ?? meta.license;
          if (!row.license && typeof lic === "string") row.license = lic;
          const repo = meta.repository?.url ?? meta.versions?.[latest]?.repository?.url;
          if (repo) row.repoUrl = String(repo).replace(/^git\+/, "");
          row.createdAt = meta.time?.created ?? null;
        }
        const dl = await fetchJson(`https://api.npmjs.org/downloads/point/last-week/${row.name}`);
        if (dl?.downloads != null) row.weeklyDownloads = dl.downloads;
      } else {
        const meta = await fetchJson(`https://pypi.org/pypi/${row.name}/json`);
        if (meta) {
          if (!row.license && meta.info?.license && meta.info.license.length < 40) row.license = meta.info.license;
          row.repoUrl = meta.info?.project_urls?.Source ?? meta.info?.home_page ?? null;
        }
      }
      if (++done % 100 === 0) console.log(`  enriched ${done}/${rows.length}`);
    }
  };
  await Promise.all(Array.from({ length: 16 }, worker));
}

async function expandNpmTop(rows: Row[], n: number) {
  const have = new Set(rows.filter((r) => r.ecosystem === "npm").map((r) => r.name));
  let rank = rows.filter((r) => r.ecosystem === "npm").length;
  for (let from = 0; from < n && from < 50_000; from += 250) {
    const res = await fetchJson(`https://registry.npmjs.org/-/v1/search?text=not:insecure&popularity=1.0&quality=0&maintenance=0&size=250&from=${from}`);
    const objs = res?.objects ?? [];
    if (!objs.length) break;
    for (const o of objs) {
      const name = o.package?.name;
      if (!name || have.has(name)) continue;
      have.add(name);
      rows.push({ ecosystem: "npm", name, rank: ++rank, license: o.package?.license ?? null, licenseFromMajor: null, weeklyDownloads: o.downloads?.weekly ?? null, repoUrl: o.package?.links?.repository ?? null, createdAt: null });
    }
    console.log(`  npm top: ${have.size}`);
  }
}

const rows = [...readSeed("npm-top.txt", "npm"), ...readSeed("pypi-top.txt", "pypi")];
if (topN) await expandNpmTop(rows, topN);
if (refresh) {
  console.log(`Refreshing ${rows.length} packages from registries…`);
  await enrich(rows);
}

if (existsSync(out)) rmSync(out);
const db = new Database(out);
db.run(`CREATE TABLE packages (
  ecosystem TEXT NOT NULL,
  name TEXT NOT NULL,
  rank INTEGER NOT NULL,
  license TEXT,
  license_from_major INTEGER,
  weekly_downloads INTEGER,
  repo_url TEXT,
  created_at TEXT,
  PRIMARY KEY (ecosystem, name)
) WITHOUT ROWID`);
db.run(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)`);
const ins = db.prepare(`INSERT OR IGNORE INTO packages VALUES (?,?,?,?,?,?,?,?)`);
db.transaction(() => {
  for (const r of rows) ins.run(r.ecosystem, r.name, r.rank, r.license, r.licenseFromMajor, r.weeklyDownloads, r.repoUrl, r.createdAt);
})();
db.run(`INSERT INTO meta VALUES ('built_at', ?), ('refreshed', ?), ('count', ?)`, [new Date().toISOString(), String(refresh), String(rows.length)]);
db.run("VACUUM");
db.close();
console.log(`Wrote ${out} (${rows.length} packages${refresh ? ", registry-enriched" : ", offline seed"})`);
