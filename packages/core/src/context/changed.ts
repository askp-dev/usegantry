/**
 * `scan --changed-only`: the uncommitted file set (git diff vs HEAD + untracked), plus the "anchor" files
 * that rules need for cross-file facts (deps, schemas, migrations, env, middleware, configs).
 * Anchors are parsed for context only: the engine reports findings on changed files alone.
 */

import { listRepoFiles } from "./builder";
import { loadConfig } from "./config";
import type { PreflightConfig } from "./types";

const CODE_EXT = /\.(m|c)?(t|j)sx?$|\.svelte$|\.vue$|\.py$/;
/** Code files that hold cross-file facts: auth middleware, ORM schemas/models, framework configs. */
const CODE_ANCHOR = /(^|\/)(middleware|hooks\.server)\.(m|c)?[jt]s$|schema|models?\b|(^|\/)db(\/|\.)|(^|\/)[\w.-]*config\.(m|c)?[jt]s$/i;

const isContextAnchor = (rel: string) => !CODE_EXT.test(rel) || CODE_ANCHOR.test(rel);

function git(root: string, args: string[]): string[] | null {
  const r = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "ignore" });
  if (r.exitCode !== 0) return null;
  return r.stdout.toString().split("\n").filter(Boolean);
}

/** Paths relative to `root` changed since HEAD (staged, unstaged, untracked). null = not a git work tree. */
export function gitChangedFiles(root: string): string[] | null {
  if (!git(root, ["rev-parse", "--is-inside-work-tree"])) return null;
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard"]) ?? [];
  // No commits yet: everything tracked counts as changed.
  const diff = git(root, ["diff", "--name-only", "--relative", "HEAD"]) ?? git(root, ["ls-files"]) ?? [];
  return [...new Set([...diff, ...untracked])];
}

export interface ChangedScope {
  /** Files to build the context from (`BuildOptions.only`). */
  only: string[];
  /** Files findings may be reported on (`AuditOptions.changedFiles`). */
  changed: string[];
}

/** null when `root` isn't in a git work tree (callers fall back to a full scan). */
export function changedScope(root: string, config: PreflightConfig = loadConfig(root)): ChangedScope | null {
  const changed = gitChangedFiles(root);
  if (!changed) return null;
  const all = listRepoFiles(root, config);
  const set = new Set(changed);
  // Intersecting with the walk drops deleted files, skip dirs and ignorePaths.
  const kept = all.filter((f) => set.has(f));
  return { only: [...kept, ...all.filter((f) => !set.has(f) && isContextAnchor(f))], changed: kept };
}
