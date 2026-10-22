/** Shared DEP-01/02/03 plumbing: where a package is imported, which lockfile pins it, how to reinstall. */
import type { Dependency, RepoContext } from "../../context/types";
import { lineAt } from "../helpers";

export const LOCKFILES: Record<NonNullable<Dependency["ecosystem"]>, string[]> = {
  npm: ["package-lock.json", "bun.lock", "pnpm-lock.yaml", "yarn.lock", "npm-shrinkwrap.json"],
  pypi: ["uv.lock", "poetry.lock", "Pipfile.lock"],
  go: ["go.sum"],
  cargo: ["Cargo.lock"],
};

/** PyPI distribution → import name, where they differ (lowercased, `-` → `_` covers the rest). */
const PY_IMPORT: Record<string, string> = {
  pyyaml: "yaml",
  pillow: "PIL",
  beautifulsoup4: "bs4",
  "scikit-learn": "sklearn",
  "python-dateutil": "dateutil",
  "opencv-python": "cv2",
  "psycopg2-binary": "psycopg2",
  "python-jose": "jose",
  pyjwt: "jwt",
  protobuf: "google",
};

export type Site = { file: string; line: number };
const memo = new WeakMap<RepoContext, Map<string, Site>>();

/** First import site per ctx.dependencies key (lazy; one pass over code files, only when a rule needs it). */
export function importSites(ctx: RepoContext): Map<string, Site> {
  const hit = memo.get(ctx);
  if (hit) return hit;
  const sites = new Map<string, Site>();
  const byName = new Map<string, string>(); // import root → dep key
  for (const [key, d] of ctx.dependencies) {
    const eco = d.ecosystem ?? "npm";
    if (eco === "npm") byName.set(`npm:${d.name}`, key);
    else if (eco === "pypi") byName.set(`py:${PY_IMPORT[d.name.toLowerCase()] ?? d.name.toLowerCase().replace(/-/g, "_")}`, key);
    else if (eco === "cargo") byName.set(`rs:${d.name.replace(/-/g, "_")}`, key);
  }
  const goMods = [...ctx.dependencies].filter(([, d]) => d.ecosystem === "go").sort((a, b) => b[1].name.length - a[1].name.length);
  const add = (k: string | undefined, file: string, line: number) => k && !sites.has(k) && sites.set(k, { file, line });
  for (const f of ctx.files.all) {
    if (/\.(m?[jt]sx?|cjs|svelte|vue)$/.test(f) || f.endsWith(".py")) {
      const py = f.endsWith(".py");
      for (const i of ctx.getCode(f).imports()) {
        if (i.typeOnly || i.source.startsWith(".")) continue;
        const root = py
          ? `py:${i.source.split(".")[0]}`
          : `npm:${i.source.startsWith("@") ? i.source.split("/").slice(0, 2).join("/") : i.source.split("/")[0]}`;
        add(byName.get(root), f, i.line);
      }
    } else if (f.endsWith(".go") && goMods.length) {
      const t = ctx.getText(f);
      for (const m of t.matchAll(/^\s*(?:import\s+)?(?:[\w.]+\s+)?"([^"]+)"/gm)) {
        const mod = goMods.find(([, d]) => m[1] === d.name || m[1].startsWith(`${d.name}/`));
        if (mod) add(mod[0], f, lineAt(t, m.index));
      }
    } else if (f.endsWith(".rs")) {
      const t = ctx.getText(f);
      for (const m of t.matchAll(/^\s*(?:pub\s+)?(?:use|extern\s+crate)\s+([A-Za-z_]\w*)/gm)) add(byName.get(`rs:${m[1]}`), f, lineAt(t, m.index));
    }
  }
  memo.set(ctx, sites);
  return sites;
}

/** The lockfile that pins `d`, and the line of its entry (falls back to the manifest). */
export function lockLine(ctx: RepoContext, d: Dependency): Site & { lockfile?: string } {
  for (const lf of LOCKFILES[d.ecosystem ?? "npm"]) {
    const file = ctx.files.all.find((f) => f === lf || f.endsWith(`/${lf}`));
    if (!file) continue;
    const t = ctx.getText(file);
    const i = [`node_modules/${d.name}"`, `"${d.name}@`, `\n${d.name}@`, `/${d.name}@`, `name = "${d.name}"`, `"${d.name.toLowerCase()}"`, `${d.name} `]
      .map((n) => t.indexOf(n))
      .find((i) => i >= 0);
    if (i !== undefined) return { file, line: lineAt(t, i + 1), lockfile: file };
  }
  return { file: d.declaredIn ?? "package.json", line: d.declaredLine ?? 1 };
}

/** The reinstall command for the package manager that owns the lockfile. */
export function reinstallHint(d: Dependency, lockfile = "", fix = "<fixed version>"): string {
  const n = d.name;
  if (d.ecosystem === "go") return `\`go get ${n}@v${fix.replace(/^v/, "")} && go mod tidy\``;
  if (d.ecosystem === "cargo") return `\`cargo update -p ${n} --precise ${fix}\``;
  if (d.ecosystem === "pypi")
    return lockfile.endsWith("uv.lock")
      ? `\`uv lock --upgrade-package ${n}\``
      : lockfile.endsWith("poetry.lock")
        ? `\`poetry update ${n}\``
        : lockfile.endsWith("Pipfile.lock")
          ? `\`pipenv update ${n}\``
          : `\`pip install -r requirements.txt\``;
  if (lockfile.endsWith("bun.lock")) return "`bun install`";
  if (lockfile.endsWith("pnpm-lock.yaml")) return "`pnpm install`";
  if (lockfile.endsWith("yarn.lock")) return "`yarn install`";
  return "`npm install`";
}
