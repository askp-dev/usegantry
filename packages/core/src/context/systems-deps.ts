/** Go (`go.mod` / `go.sum`) and Rust (`Cargo.toml` / `Cargo.lock`) dependency parsers. Keys: `go:<module>`, `cargo:<crate>`. */
import type { Dependency } from "./types";

type DepMap = Map<string, Dependency>;

function upsert(into: DepMap, eco: "go" | "cargo", name: string, version: string, extra: Partial<Dependency>) {
  const key = `${eco}:${name}`;
  const existing = into.get(key);
  if (existing) Object.assign(existing, { version, ...extra, isDirect: existing.isDirect || !!extra.isDirect });
  else into.set(key, { name, version, isDirect: false, existsInRegistry: true, ecosystem: eco, ...extra });
}

/** go.mod: `require` lines (single or block). `// indirect` → transitive. Local `replace` targets → isLocal. */
export function parseGoMod(rel: string, text: string, into: DepMap) {
  const lines = text.split("\n");
  const local = new Set<string>();
  for (const m of text.matchAll(/^\s*(?:replace\s+)?(\S+)(?:\s+v\S+)?\s+=>\s+(\.{1,2}\/\S*|\/\S*)/gm)) local.add(m[1]);
  let inRequire = false;
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (/^require\s*\($/.test(line)) {
      inRequire = true;
      continue;
    }
    if (inRequire && line === ")") {
      inRequire = false;
      continue;
    }
    const m = (inRequire ? line : line.match(/^require\s+(.*)$/)?.[1])?.match(/^(\S+)\s+(v\S+)(.*)$/);
    if (!m) continue;
    upsert(into, "go", m[1], m[2], {
      isDirect: !/\/\/\s*indirect/.test(m[3]),
      declaredIn: rel,
      declaredLine: i + 1,
      ...(local.has(m[1]) ? { isLocal: true } : {}),
    });
  }
}

/** go.sum: adds checksummed modules go.mod didn't list (older modules / pruned graphs). */
export function parseGoSum(text: string, into: DepMap) {
  for (const m of text.matchAll(/^(\S+)\s+(v[^\s/]+)\s+h1:/gm)) if (!into.has(`go:${m[1]}`)) upsert(into, "go", m[1], m[2], {});
}

const CARGO_DEP_SECTION = /^\[(?:workspace\.)?(?:target\.[^\]]+\.)?(dev-|build-)?dependencies\]$/;

/** Cargo.toml: `[dependencies]`, `[dev-dependencies]`, `[build-dependencies]`, `[target.*.dependencies]`, `[workspace.dependencies]`, `[dependencies.x]`. */
export function parseCargoToml(rel: string, text: string, into: DepMap) {
  let section: { isDev: boolean } | null = null;
  let tableDep: { name: string; line: number; isDev: boolean; body: string[] } | null = null;
  const flushTable = () => {
    if (tableDep) addCargo(rel, tableDep.name, tableDep.body.join(" "), tableDep.line, tableDep.isDev, into);
    tableDep = null;
  };
  for (const [i, raw] of text.split("\n").entries()) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (line.startsWith("[")) {
      flushTable();
      const sec = line.match(CARGO_DEP_SECTION);
      const tbl = line.match(/^\[(?:target\.[^\]]+\.)?(dev-|build-)?dependencies\.([\w-]+)\]$/);
      section = sec ? { isDev: sec[1] === "dev-" } : null;
      if (tbl) tableDep = { name: tbl[2], line: i + 1, isDev: tbl[1] === "dev-", body: [] };
      continue;
    }
    if (tableDep) {
      tableDep.body.push(line);
      continue;
    }
    const m = section && line.match(/^([\w-]+)\s*=\s*(.+)$/);
    if (m && section) addCargo(rel, m[1], m[2], i + 1, section.isDev, into);
  }
  flushTable();
}

function addCargo(rel: string, key: string, spec: string, line: number, isDev: boolean, into: DepMap) {
  const name = spec.match(/\bpackage\s*=\s*"([^"]+)"/)?.[1] ?? key;
  const version = spec.match(/^"([^"]+)"/)?.[1] ?? spec.match(/\bversion\s*=\s*"([^"]+)"/)?.[1] ?? "*";
  const isLocal = /\b(?:path|git)\s*=/.test(spec) || /\bworkspace\s*=\s*true/.test(spec);
  upsert(into, "cargo", name, version, { isDirect: true, isDev, declaredIn: rel, declaredLine: line, ...(isLocal ? { isLocal: true } : {}) });
}

/** Cargo.lock `[[package]]` tables; workspace members (no `source`) are skipped. */
export function parseCargoLock(text: string, into: DepMap) {
  for (const block of text.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const name = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    const version = block.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    if (!name || !version || !/^source\s*=/m.test(block)) continue;
    upsert(into, "cargo", name, version, {});
  }
}
