import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { GantryConfig } from "./types";

export const DEFAULT_CONFIG: GantryConfig = {
  mode: "commercial",
  companyName: "",
  productName: "",
  contactEmail: "",
  jurisdiction: "US-DE",
  legalDir: "legal",
  strict: false,
  ignoreRules: [],
  ignorePaths: [],
  offline: false,
  deployTarget: undefined,
  clauses: { aiOutputDisclaimer: true, noTrainingApi: true, pciBillingDelegation: true, gdprErasure: true },
};

export const CONFIG_FILES = ["gantry.config.json", ".gantryrc.json", ".gantryrc"];

export function loadConfig(rootDir: string, overrides: Partial<GantryConfig> = {}): GantryConfig {
  let fileCfg: Partial<GantryConfig> = {};
  for (const f of CONFIG_FILES) {
    const p = join(rootDir, f);
    if (existsSync(p)) {
      try {
        fileCfg = JSON.parse(readFileSync(p, "utf8"));
      } catch {
        /* invalid config → defaults */
      }
      break;
    }
  }
  let pkg: any = null;
  try {
    pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8"));
  } catch {}
  const pkgCfg: Partial<GantryConfig> = pkg?.gantry ?? {};
  const cfg: GantryConfig = {
    ...DEFAULT_CONFIG,
    ...pkgCfg,
    ...fileCfg,
    ...stripUndefined(overrides),
    clauses: { ...DEFAULT_CONFIG.clauses, ...(pkgCfg.clauses ?? {}), ...(fileCfg.clauses ?? {}), ...(overrides.clauses ?? {}) },
  };
  // Infer open-source mode from a copyleft/permissive root license unless explicitly set
  if (!fileCfg.mode && !pkgCfg.mode && !overrides.mode && pkg?.license && !/UNLICENSED|SEE LICENSE|proprietary/i.test(pkg.license) && pkg.private !== true) {
    if (/^(AGPL|GPL|LGPL|MPL|EUPL|OSL)/i.test(pkg.license)) cfg.mode = "open-source";
  }
  if (!cfg.productName) cfg.productName = prettyName(pkg?.name ?? basename(rootDir));
  if (!cfg.companyName) cfg.companyName = typeof pkg?.author === "string" ? pkg.author.replace(/<.*>|\(.*\)/g, "").trim() : pkg?.author?.name ?? "";
  if (!cfg.contactEmail) cfg.contactEmail = (typeof pkg?.author === "string" ? pkg.author.match(/<([^>]+)>/)?.[1] : pkg?.author?.email) ?? "";
  return cfg;
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function prettyName(n: string) {
  return n
    .replace(/^@[^/]+\//, "")
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
