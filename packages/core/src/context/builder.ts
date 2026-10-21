/**
 * Single-pass repository indexer → RepoContext.
 *
 * One directory walk (with a hard skip-list so node_modules/.git never get traversed), Bun.Glob
 * matchers for categorisation, lazily-read + memoised file text, lazily-built CodeIndex per file,
 * and an optional lazily-loaded @ast-grep/napi SgRoot cache.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { collectSchema } from "./adapters";
import { CodeIndex, detectLang } from "./code-index";
import { loadConfig } from "./config";
import { collectDataQueries } from "./data-queries";
import { lookupKnownPackage, type VendorRecord, vendorForEnvKey, vendorForPackage } from "./knowledge";
import {
  enrichLicensesFromNodeModules,
  parseBunLock,
  parsePackageJson,
  parsePackageLock,
  parsePnpmLock,
  parsePoetryLock,
  parsePyproject,
  parseRequirementsTxt,
  parseYarnLock,
} from "./lockfile-parser";
import { GENAI_PACKAGES } from "./patterns";
import { extractRoutes, type MiddlewareGuard } from "./routes";
import type { Dependency, DetectedSubprocessor, EnvEntry, PreflightConfig, RepoContext, SgRoot } from "./types";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".vercel",
  ".netlify",
  ".output",
  ".cache",
  ".parcel-cache",
  "dist",
  "build",
  "out",
  "coverage",
  ".nyc_output",
  "venv",
  ".venv",
  "env",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "target",
  "vendor",
  ".idea",
  ".vscode-test",
  ".expo",
  ".wrangler",
  "storybook-static",
  ".preflight",
  "Pods",
  ".gradle",
  ".terraform",
]);
const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|avif|ico|icns|svgz|bmp|tiff?|psd|mp3|mp4|mov|webm|wav|ogg|flac|m4a|pdf|zip|gz|tgz|bz2|xz|7z|rar|jar|war|woff2?|ttf|otf|eot|exe|dll|so|dylib|bin|wasm|node|sqlite3?|db|lockb|pyc|class|o|a|DS_Store)$/i;
const MAX_FILE_BYTES = 1_500_000;

export interface BuildOptions {
  config?: Partial<PreflightConfig>;
  /** Restrict to these files (relative) — used by the IDE save watcher for incremental scans */
  only?: string[];
  maxFiles?: number;
}

function walk(root: string, ignore: Array<InstanceType<typeof Bun.Glob>>, maxFiles: number): string[] {
  const out: string[] = [];
  const stack = [""];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(join(root, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        if (ignore.some((g) => g.match(rel) || g.match(rel + "/"))) continue;
        stack.push(rel);
      } else if (e.isFile() || e.isSymbolicLink()) {
        if (BINARY_EXT.test(e.name)) continue;
        if (ignore.some((g) => g.match(rel))) continue;
        out.push(rel);
        if (out.length >= maxFiles) return out.sort();
      }
    }
  }
  return out.sort();
}

function readGitSha(root: string): string {
  try {
    let gitDir = join(root, ".git");
    if (statSync(gitDir).isFile()) {
      const m = readFileSync(gitDir, "utf8").match(/gitdir:\s*(.+)/);
      if (m) gitDir = join(root, m[1].trim());
    }
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref:")) return head.slice(0, 40);
    const ref = head.slice(4).trim();
    const refPath = join(gitDir, ref);
    if (existsSync(refPath)) return readFileSync(refPath, "utf8").trim();
    const packed = join(gitDir, "packed-refs");
    if (existsSync(packed)) {
      const line = readFileSync(packed, "utf8")
        .split("\n")
        .find((l) => l.endsWith(" " + ref));
      if (line) return line.split(" ")[0];
    }
  } catch {}
  return "0000000";
}

export function parseEnvFile(rel: string, text: string): EnvEntry[] {
  const out: EnvEntry[] = [];
  text.split("\n").forEach((raw, i) => {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/);
    if (!m) return;
    let v = m[2].trim();
    if (/^["']/.test(v)) v = v.replace(/^(["'])(.*)\1.*$/, "$2");
    else v = v.replace(/\s+#.*$/, "");
    out.push({ key: m[1], value: v, file: rel, line: i + 1 });
  });
  return out;
}

const SERVER_PATH_RE =
  /(^|\/)(app\/(.+\/)?route\.(m?[tj]sx?)$|pages\/api\/|src\/routes\/(.+\/)?\+(server|page\.server|layout\.server)\.(m?[tj]s)$|hooks\.server\.(m?[tj]s)$|(src\/)?lib\/server\/|server\/|api\/|actions?(\.|\/)|middleware\.(m?[tj]s)$|routers?\/|trpc\/|functions\/|supabase\/functions\/)/;

/** Every scannable file, with the same skip dirs and `ignorePaths` as a full build. */
export function listRepoFiles(rootDir: string, config = loadConfig(rootDir), maxFiles = 20000): string[] {
  return walk(
    rootDir,
    config.ignorePaths.map((p) => new Bun.Glob(p)),
    maxFiles,
  );
}

export async function buildRepoContext(rootDir: string, opts: BuildOptions = {}): Promise<RepoContext> {
  const t0 = performance.now();
  const timings: Record<string, number> = {};
  const mark = (k: string, since: number) => (timings[k] = Math.round((performance.now() - since) * 100) / 100);

  const config = loadConfig(rootDir, opts.config);
  const ignoreGlobs = config.ignorePaths.map((p) => new Bun.Glob(p));
  const tWalk = performance.now();
  const all = opts.only ?? walk(rootDir, ignoreGlobs, opts.maxFiles ?? 20000);
  const fileSet = new Set(all);
  mark("walk", tWalk);

  // ── lazy caches ───────────────────────────────────────────────────────────
  const textCache = new Map<string, string>();
  const codeCache = new Map<string, CodeIndex>();
  const astCache = new Map<string, SgRoot>();
  const getText = (rel: string): string => {
    let t = textCache.get(rel);
    if (t === undefined) {
      try {
        const p = join(rootDir, rel);
        const st = statSync(p);
        t = st.size > MAX_FILE_BYTES ? "" : readFileSync(p, "utf8");
      } catch {
        t = "";
      }
      textCache.set(rel, t);
    }
    return t;
  };
  const getCode = (rel: string): CodeIndex => {
    let c = codeCache.get(rel);
    if (!c) {
      c = new CodeIndex(getText(rel), rel);
      codeCache.set(rel, c);
    }
    return c;
  };
  let astGrep: any | null | undefined;
  const getAst = (rel: string): SgRoot => {
    const hit = astCache.get(rel);
    if (hit) return hit;
    if (astGrep === undefined) {
      try {
        astGrep = require("@ast-grep/napi");
      } catch {
        astGrep = null;
      }
    }
    if (!astGrep) throw new Error("@ast-grep/napi is not installed — use ctx.getCode() (built-in structural index) instead.");
    const lang = /\.tsx$/.test(rel)
      ? astGrep.Lang.Tsx
      : /\.(m|c)?tsx?$/.test(rel)
        ? astGrep.Lang.TypeScript
        : /\.jsx?$/.test(rel)
          ? astGrep.Lang.JavaScript
          : astGrep.Lang.TypeScript;
    const root = astGrep.parse(lang, getText(rel)) as SgRoot;
    astCache.set(rel, root);
    return root;
  };
  const hasFile = (rel: string) => fileSet.has(rel);
  const globCache = new Map<string, string[]>();
  const glob = (pattern: string) => {
    let r = globCache.get(pattern);
    if (!r) {
      const g = new Bun.Glob(pattern);
      r = all.filter((f) => g.match(f));
      globCache.set(pattern, r);
    }
    return r;
  };

  // ── categorise ────────────────────────────────────────────────────────────
  const tCat = performance.now();
  const codeExt = /\.(m|c)?(t|j)sx?$|\.svelte$|\.vue$|\.py$/;
  const envFiles = all.filter((f) => /^\.env(\..+)?$/.test(basename(f)) || /(^|\/)\.env(\.[\w-]+)?$/.test(f));
  const sqlMigrations = all.filter((f) => f.endsWith(".sql"));
  const legalDocs = all.filter(
    (f) =>
      (f.startsWith(config.legalDir + "/") && /\.(md|mdx|txt|html)$/.test(f)) ||
      /(^|\/)(privacy[-_ ]?policy|privacy|terms(-of-(service|use))?|tos|eula|dpa|cookie[-_]policy)\.(md|mdx)$/i.test(f),
  );
  const serverRoutesAndActions: string[] = [];
  const frontendComponents: string[] = [];
  for (const f of all) {
    if (!codeExt.test(f) || /\.(test|spec|stories|d)\.(m|c)?[tj]sx?$/.test(f) || /(^|\/)(__tests__|tests?|e2e|cypress|fixtures?|__mocks__)\//.test(f)) continue;
    const lang = detectLang(f);
    let isServer = SERVER_PATH_RE.test(f) && lang !== "svelte" && lang !== "vue";
    if (!isServer && (lang === "js" || lang === "py")) {
      const t = getText(f);
      if (
        lang === "js" &&
        (t.includes("use server") ||
          /\b(app|router|server)\.(get|post|put|patch|delete)\s*\(\s*['"`]/.test(t) ||
          /\b(publicProcedure|protectedProcedure)\b/.test(t))
      )
        isServer = true;
      if (lang === "py" && /@\w+\.(get|post|put|patch|delete|route)\s*\(|FastAPI\(|Flask\(|APIRouter\(/.test(t)) isServer = true;
    }
    if (isServer) serverRoutesAndActions.push(f);
    if (/\.(tsx|jsx|svelte|vue)$/.test(f) && !/\+(server|page\.server|layout\.server)\./.test(f) && !/(^|\/)route\.(m?[tj]sx?)$/.test(f))
      frontendComponents.push(f);
  }
  mark("categorize", tCat);

  // ── package.json, deps, lockfiles ────────────────────────────────────────
  const tDeps = performance.now();
  const dependencies = new Map<string, Dependency>();
  let packageJson: Record<string, any> | null = null;
  if (hasFile("package.json")) packageJson = parsePackageJson("package.json", getText("package.json"), dependencies);
  // workspace packages (monorepos): include their direct deps
  for (const f of all) {
    if (f !== "package.json" && /(^|\/)package\.json$/.test(f) && f.split("/").length <= 3 && !f.includes("fixtures/")) {
      parsePackageJson(f, getText(f), dependencies);
    }
  }
  const lockOrder: Array<[string, (t: string, m: Map<string, Dependency>) => void]> = [
    ["package-lock.json", parsePackageLock],
    ["bun.lock", parseBunLock],
    ["pnpm-lock.yaml", parsePnpmLock],
    ["yarn.lock", parseYarnLock],
    ["poetry.lock", parsePoetryLock],
  ];
  for (const [lf, fn] of lockOrder) if (hasFile(lf)) fn(getText(lf), dependencies);
  for (const f of all.filter((f) => /(^|\/)requirements[\w.-]*\.txt$/.test(f))) parseRequirementsTxt(f, getText(f), dependencies);
  if (hasFile("pyproject.toml")) parsePyproject("pyproject.toml", getText("pyproject.toml"), dependencies);
  enrichLicensesFromNodeModules(rootDir, dependencies);
  // fill from embedded seed DB (version-aware)
  for (const d of dependencies.values()) {
    if (d.spdxLicense) continue;
    const k = lookupKnownPackage(d.ecosystem ?? "npm", d.name);
    if (!k?.license) continue;
    const major = Number(
      String((d as any).installedVersion ?? d.version)
        .replace(/^[^\d]*/, "")
        .split(".")[0],
    );
    if (k.license_from_major && Number.isFinite(major) && major < k.license_from_major) continue;
    d.spdxLicense = k.license;
    (d as any).licenseSource = "seed";
  }
  mark("dependencies", tDeps);

  // ── env ───────────────────────────────────────────────────────────────────
  const env: EnvEntry[] = [];
  for (const f of envFiles) env.push(...parseEnvFile(f, getText(f)));

  // ── schema: SQL + ORMs ────────────────────────────────────────────────────
  const tDb = performance.now();
  const { sql: sqlRes, dbTables, prismaModels, drizzleVars } = collectSchema(all, sqlMigrations, getText, hasFile);
  mark("schema", tDb);

  // ── stack detection ───────────────────────────────────────────────────────
  const depNames = new Set([...dependencies.values()].filter((d) => d.isDirect).map((d) => d.name));
  const hasDep = (re: RegExp) => [...depNames].some((n) => re.test(n));
  let framework: RepoContext["framework"] = "unknown";
  let frameworkVersion: string | undefined;
  if (depNames.has("next")) {
    framework = "nextjs";
    frameworkVersion = dependencies.get("next")?.version.replace(/^[^\d]*/, "");
  } else if (depNames.has("@sveltejs/kit")) {
    framework = "sveltekit";
    frameworkVersion = dependencies.get("@sveltejs/kit")?.version.replace(/^[^\d]*/, "");
  } else if (dependencies.has("pypi:fastapi")) framework = "fastapi";
  else if (hasDep(/^(express|hono|fastify|koa|@nestjs\/core|elysia)$/)) framework = "express";
  const envKeys = new Set(env.map((e) => e.key));
  let deployTarget: PreflightConfig["deployTarget"] = config.deployTarget;
  if (!deployTarget) {
    if (hasFile("vercel.json") || all.some((f) => f.startsWith(".vercel/")) || hasDep(/^@vercel\//)) deployTarget = "vercel";
    else if (
      hasFile("wrangler.toml") ||
      hasFile("wrangler.jsonc") ||
      hasFile("wrangler.json") ||
      hasDep(/^@opennextjs\/cloudflare$|^@cloudflare\/next-on-pages$/)
    )
      deployTarget = "cloudflare";
    else if (hasFile("netlify.toml")) deployTarget = "netlify";
    else if (hasFile("serverless.yml") || hasFile("serverless.ts") || hasFile("template.yaml") || hasFile("sst.config.ts")) deployTarget = "aws-lambda";
    else if (hasFile("Dockerfile") || hasFile("fly.toml") || hasFile("railway.json") || hasFile("render.yaml")) deployTarget = "node";
    else deployTarget = framework === "nextjs" ? "vercel" : "unknown";
  }
  const stack: RepoContext["stack"] = {
    supabase:
      hasDep(/^@supabase\//) || all.some((f) => f.startsWith("supabase/")) || [...envKeys].some((k) => /SUPABASE/.test(k)) || dependencies.has("pypi:supabase"),
    prisma: hasDep(/^(@prisma\/client|prisma)$/) || all.some((f) => f.endsWith(".prisma")),
    drizzle: hasDep(/^drizzle-orm$/),
    sqlalchemy: dependencies.has("pypi:sqlalchemy") || dependencies.has("pypi:sqlmodel"),
    stripe: hasDep(/^(stripe|@stripe\/)/) || dependencies.has("pypi:stripe"),
    genAi: hasDep(GENAI_PACKAGES) || [...dependencies.values()].some((d) => d.isDirect && d.ecosystem === "pypi" && GENAI_PACKAGES.test(d.name)),
    deployTarget,
    frameworkVersion,
  };

  // ── routes ────────────────────────────────────────────────────────────────
  const tRoutes = performance.now();
  const { routes, middleware } = extractRoutes({ files: serverRoutesAndActions, getCode, hasFile, prismaModels, drizzleVars });
  mark("routes", tRoutes);

  // ── sub-processors ────────────────────────────────────────────────────────
  const subs = new Map<string, DetectedSubprocessor>();
  const addVendor = (v: VendorRecord, pkg: string, via: string) => {
    if (subs.has(v.id)) return;
    subs.set(v.id, {
      id: v.id,
      pkg,
      entityName: v.entityName,
      category: v.category,
      dataProcessed: v.dataProcessed,
      jurisdiction: v.jurisdiction,
      privacyPolicyUrl: v.privacyPolicyUrl,
      dpaUrl: v.dpaUrl,
      triggersClauses: v.triggersClauses,
      detectedVia: via,
    });
  };
  for (const d of dependencies.values()) {
    if (!d.isDirect || d.isDev) continue;
    const v = vendorForPackage(d.name, d.ecosystem ?? "npm");
    if (v) addVendor(v, d.name, `package:${d.name}`);
  }
  for (const e of env) {
    if (
      !e.file.endsWith(".example") &&
      !e.file.endsWith(".sample") &&
      !e.file.endsWith(".template") &&
      !/\.env(\.local|\.production|\.development)?$/.test(e.file)
    )
      continue;
    const v = vendorForEnvKey(e.key);
    if (v) addVendor(v, v.packages.npm[0] ?? v.packages.pypi[0] ?? v.id, `env:${e.key}`);
  }

  const ctx: RepoContext = {
    rootDir,
    framework,
    gitCommitSha: readGitSha(rootDir),
    files: { all, serverRoutesAndActions, frontendComponents, sqlMigrations, envFiles, legalDocs },
    getAst,
    getText,
    dbTables,
    routes,
    dependencies,
    detectedSubprocessors: [...subs.values()],
    getCode,
    glob,
    hasFile,
    packageJson,
    env,
    sql: { views: sqlRes.views, functions: sqlRes.functions, buckets: sqlRes.buckets, storagePolicies: sqlRes.storagePolicies },
    stack,
    config,
    timings,
    partial: !!opts.only,
    get dataQueries() {
      // lazy: only built when a VEC/CACHE rule asks, then cached on the context
      const v = collectDataQueries(all, getCode, hasFile);
      Object.defineProperty(this, "dataQueries", { value: v });
      return v;
    },
  };
  (ctx as any).middleware = middleware as MiddlewareGuard | null;
  (ctx as any).prismaModels = prismaModels;
  (ctx as any).drizzleVars = drizzleVars;
  mark("total", t0);
  return ctx;
}

export function relPath(root: string, abs: string) {
  return relative(root, abs).split(sep).join("/");
}
