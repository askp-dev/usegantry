/**
 * Dependency resolution across manifests and lockfiles:
 *   package.json, bun.lock (text JSONC), package-lock.json (v2/v3), pnpm-lock.yaml, yarn.lock,
 *   requirements*.txt, pyproject.toml (PEP 621 + Poetry), poetry.lock, uv.lock, Pipfile.lock
 *
 * Produces a single Map<name, Dependency>. Direct deps come from manifests; transitive deps
 * and resolved versions come from lockfiles. License data comes from (in priority order):
 * package-lock "license" fields → node_modules/<pkg>/package.json → known-packages seed DB.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Dependency } from "./types";

type DepMap = Map<string, Dependency>;

function lineOfKey(text: string, key: string): number {
  const idx = text.indexOf(`"${key}"`);
  if (idx === -1) return 1;
  let n = 1;
  for (let k = 0; k < idx; k++) if (text.charCodeAt(k) === 10) n++;
  return n;
}

function isLocalVersion(v: string): boolean {
  return /^(workspace:|file:|link:|portal:|git\+|git:|github:|https?:|\.{0,2}\/)/.test(v);
}

export function parsePackageJson(relPath: string, text: string, into: DepMap) {
  let pj: any;
  try {
    pj = JSON.parse(text);
  } catch {
    return null;
  }
  const add = (obj: Record<string, string> | undefined, isDev: boolean) => {
    for (const [name, version] of Object.entries(obj ?? {})) {
      const prev = into.get(name);
      if (prev && !prev.isDev && isDev) continue;
      into.set(name, {
        name,
        version: String(version),
        isDirect: true,
        existsInRegistry: true,
        ecosystem: "npm",
        isDev,
        declaredIn: relPath,
        declaredLine: lineOfKey(text, name),
        isLocal: isLocalVersion(String(version)),
      });
    }
  };
  add(pj.dependencies, false);
  add(pj.optionalDependencies, false);
  add(pj.peerDependencies, false);
  add(pj.devDependencies, true);
  return pj;
}

function upsertTransitive(into: DepMap, name: string, version: string, extra: Partial<Dependency> = {}) {
  const existing = into.get(name);
  if (existing) {
    if (!existing.version || /^[\^~<>=*]|latest/.test(existing.version)) existing.version = version || existing.version;
    if (extra.spdxLicense && !existing.spdxLicense) existing.spdxLicense = extra.spdxLicense;
    if (extra.isDev === false && existing.isDev && !existing.isDirect) existing.isDev = false;
    return;
  }
  into.set(name, { name, version, isDirect: false, existsInRegistry: true, ecosystem: "npm", isDev: extra.isDev ?? false, ...extra });
}

export function parsePackageLock(text: string, into: DepMap) {
  let lock: any;
  try {
    lock = JSON.parse(text);
  } catch {
    return;
  }
  if (lock.packages) {
    for (const [key, meta] of Object.entries<any>(lock.packages)) {
      if (!key) continue;
      const idx = key.lastIndexOf("node_modules/");
      if (idx === -1) continue;
      const name = key.slice(idx + "node_modules/".length);
      const lic =
        typeof meta.license === "string" ? meta.license : Array.isArray(meta.licenses) ? meta.licenses.map((l: any) => l.type ?? l).join(" OR ") : undefined;
      upsertTransitive(into, name, meta.version ?? "", { spdxLicense: lic, isDev: !!meta.dev });
    }
  } else if (lock.dependencies) {
    const walk = (deps: Record<string, any>) => {
      for (const [name, meta] of Object.entries<any>(deps)) {
        upsertTransitive(into, name, meta.version ?? "", { isDev: !!meta.dev });
        if (meta.dependencies) walk(meta.dependencies);
      }
    };
    walk(lock.dependencies);
  }
}

/** bun.lock is JSONC (trailing commas). packages: { name: ["name@version", registry, {deps}, integrity] } */
export function parseBunLock(text: string, into: DepMap) {
  let lock: any;
  try {
    lock = JSON.parse(text.replace(/,(\s*[}\]])/g, "$1"));
  } catch {
    return;
  }
  for (const [key, entry] of Object.entries<any>(lock.packages ?? {})) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
    const spec: string = entry[0];
    const at = spec.lastIndexOf("@");
    if (at <= 0) continue;
    const name = spec.slice(0, at);
    const version = spec.slice(at + 1);
    // nested keys like "parent/child" denote hoisting conflicts; use resolved name
    upsertTransitive(into, name || key, version);
  }
}

export function parsePnpmLock(text: string, into: DepMap) {
  // v6:  /name@1.2.3:   or  /@scope/name@1.2.3(peer):    v9:  name@1.2.3:  under "packages:"
  const pkgSection = text.split(/^packages:\s*$/m)[1] ?? "";
  const section = pkgSection.split(/^\S[^\n]*:\s*$/m)[0] ?? pkgSection;
  for (const m of section.matchAll(/^ {2}['"]?\/?((?:@[^/@\s]+\/)?[^@\s'"/(]+)@([^\s:'"(]+)[^\n]*:\s*$/gm)) {
    const block = section.slice(m.index! + m[0].length, section.indexOf("\n  ", m.index! + m[0].length + 1) + 1 || undefined);
    upsertTransitive(into, m[1], m[2], { isDev: /\n\s+dev:\s*true/.test(block.slice(0, 400)) });
  }
}

export function parseYarnLock(text: string, into: DepMap) {
  for (const m of text.matchAll(/^"?((?:@[^@\s"]+\/)?[^@\s",]+)@[^\n]*:\n\s+version:?\s+"?([^"\n]+)"?/gm)) upsertTransitive(into, m[1], m[2]);
}

function normPy(name: string) {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

export function parseRequirementsTxt(relPath: string, text: string, into: DepMap) {
  const lines = text.split("\n");
  lines.forEach((raw, i) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line || line.startsWith("-")) return;
    const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*(?:([=<>!~]=?|===)\s*([^;\s,]+))?/);
    if (!m) return;
    const name = normPy(m[1]);
    into.set(`pypi:${name}`, {
      name,
      version: m[4] ?? "*",
      isDirect: true,
      existsInRegistry: true,
      ecosystem: "pypi",
      isDev: /dev|test/i.test(relPath),
      declaredIn: relPath,
      declaredLine: i + 1,
    });
  });
}

export function parsePyproject(relPath: string, text: string, into: DepMap) {
  const lines = text.split("\n");
  // PEP 621 dependencies = [ "x>=1", ... ]
  const dm = text.match(/^\s*dependencies\s*=\s*\[([\s\S]*?)\]/m);
  if (dm) {
    for (const s of dm[1].matchAll(/["']([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*([^"']*)["']/g)) {
      const name = normPy(s[1]);
      const lineIdx = lines.findIndex((l) => l.includes(`"${s[1]}`) || l.includes(`'${s[1]}`));
      into.set(`pypi:${name}`, {
        name,
        version: s[2].trim() || "*",
        isDirect: true,
        existsInRegistry: true,
        ecosystem: "pypi",
        isDev: false,
        declaredIn: relPath,
        declaredLine: lineIdx + 1,
      });
    }
  }
  // Poetry [tool.poetry.dependencies]
  const pm = text.match(/^\[tool\.poetry(?:\.group\.\w+)?\.dependencies\]\s*$([\s\S]*?)(?=^\[|$(?![\s\S]))/m);
  if (pm) {
    for (const s of pm[1].matchAll(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*=\s*(.+)$/gm)) {
      if (s[1].toLowerCase() === "python") continue;
      const name = normPy(s[1]);
      const lineIdx = lines.findIndex((l) => l.startsWith(s[1]));
      into.set(`pypi:${name}`, {
        name,
        version: s[2].replace(/["'{}]/g, "").trim(),
        isDirect: true,
        existsInRegistry: true,
        ecosystem: "pypi",
        isDev: false,
        declaredIn: relPath,
        declaredLine: lineIdx + 1,
      });
    }
  }
}

export function parsePoetryLock(text: string, into: DepMap) {
  for (const m of text.matchAll(/\[\[package\]\]\s*\nname\s*=\s*"([^"]+)"\s*\nversion\s*=\s*"([^"]+)"([\s\S]*?)(?=\n\[\[package\]\]|$)/g)) {
    const name = normPy(m[1]);
    const key = `pypi:${name}`;
    const existing = into.get(key);
    const isDev = /category\s*=\s*"dev"/.test(m[3]);
    if (existing) existing.version = m[2];
    else into.set(key, { name, version: m[2], isDirect: false, existsInRegistry: true, ecosystem: "pypi", isDev });
  }
}

function upsertPy(into: DepMap, rawName: string, version: string, isDev: boolean) {
  const name = normPy(rawName);
  const existing = into.get(`pypi:${name}`);
  if (existing) existing.version = version;
  else into.set(`pypi:${name}`, { name, version, isDirect: false, existsInRegistry: true, ecosystem: "pypi", isDev });
}

/** uv.lock (TOML `[[package]]` tables). The project itself (`source = { editable | virtual = "." }`) is skipped. */
export function parseUvLock(text: string, into: DepMap) {
  for (const block of text.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const name = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    const version = block.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    if (!name || /^source\s*=\s*\{[^}]*\b(?:editable|virtual)\s*=/m.test(block)) continue;
    upsertPy(into, name, version ?? "*", false);
  }
}

/** Pipfile.lock (JSON: `default` + `develop` sections, versions pinned as `==x.y.z`). */
export function parsePipfileLock(text: string, into: DepMap) {
  let lock: Record<string, Record<string, { version?: string }>>;
  try {
    lock = JSON.parse(text);
  } catch {
    return;
  }
  for (const [section, isDev] of [
    ["default", false],
    ["develop", true],
  ] as const) {
    for (const [name, meta] of Object.entries(lock?.[section] ?? {})) upsertPy(into, name, meta?.version?.replace(/^==/, "") ?? "*", isDev);
  }
}

/** Fill missing licenses from node_modules/<pkg>/package.json (bounded). */
export function enrichLicensesFromNodeModules(rootDir: string, deps: DepMap, limit = 4000) {
  const nm = join(rootDir, "node_modules");
  if (!existsSync(nm)) return;
  let n = 0;
  for (const d of deps.values()) {
    if (d.ecosystem !== "npm" || d.spdxLicense || d.isLocal) continue;
    if (++n > limit) break;
    const pj = join(nm, d.name, "package.json");
    try {
      const meta = JSON.parse(readFileSync(pj, "utf8"));
      const lic =
        typeof meta.license === "string"
          ? meta.license
          : (meta.license?.type ?? (Array.isArray(meta.licenses) ? meta.licenses.map((l: any) => l.type ?? l).join(" OR ") : undefined));
      if (lic) d.spdxLicense = lic;
      if (meta.version && !d.isDirect) d.version = meta.version;
      else if (meta.version) (d as any).installedVersion = meta.version;
    } catch {
      /* not installed */
    }
  }
}
