import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { lookupKnownPackage } from "../../context/knowledge";
import type { RepoContext } from "../../context/types";
import { defineRule, type Emit, lineAt } from "../helpers";
import { LOCKFILES } from "./dep-helpers";

const FLOATING = /^(\*|latest|x|X|x\.x(\.x)?|\*\.\*(\.\*)?|)$/;
/** A dist-tag (`next`, `beta`, `canary`): floats like `latest`. Excludes protocols, paths and aliases. */
const DIST_TAG = /^[A-Za-z][\w-]*$/;
const GIT_OR_URL = /^(git\+|git:|github:|gitlab:|bitbucket:|https?:\/\/|[\w.-]+\/[\w.-]+(#.*)?$)/;
const SHA = /[0-9a-f]{40}/i;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const lineOf = (text: string, needle: string) => {
  const i = text.indexOf(needle);
  return i < 0 ? 1 : lineAt(text, i);
};

/** Apps that ship (framework, deploy config, start/build script, server entrypoint) need a lockfile most. */
function deployable(ctx: RepoContext): boolean {
  const s = ctx.packageJson?.scripts ?? {};
  return (
    ctx.framework !== "unknown" ||
    (!!ctx.stack.deployTarget && ctx.stack.deployTarget !== "unknown") ||
    !!(s.start || s.build) ||
    ["Dockerfile", "vercel.json", "wrangler.toml", "fly.toml", "netlify.toml", "Procfile", "main.go", "src/main.rs"].some((f) => ctx.hasFile(f))
  );
}

function npmManifest(ctx: RepoContext, rel: string, emit: Emit, critical: boolean) {
  let pj: any;
  const text = ctx.getText(rel);
  try {
    pj = JSON.parse(text);
  } catch {
    return;
  }
  const direct = { ...pj.dependencies, ...pj.optionalDependencies, ...pj.devDependencies } as Record<string, string>;
  const names = Object.keys(direct).filter((n) => !/^(workspace:|file:|link:|portal:)/.test(String(direct[n])));
  if (!names.length) return;
  const dir = dirname(rel) === "." ? "" : `${dirname(rel)}/`;
  // The package's own lockfile, else the workspace root's.
  const lock = [...LOCKFILES.npm.map((l) => `${dir}${l}`), ...LOCKFILES.npm].find((l) => ctx.hasFile(l));
  if (!lock) {
    emit({
      severity: critical ? "CRITICAL" : "HIGH",
      file: rel,
      line: 1,
      nodeRef: `manifest:${rel}`,
      evidence: `${rel} declares ${names.length} dependencies; no package-lock.json, bun.lock, pnpm-lock.yaml or yarn.lock is committed`,
      impact: `Every install resolves the newest versions that match the ranges, so a hijacked release published tonight ships in tomorrow's deploy with nobody noticing, and builds aren't reproducible.${critical ? " This app deploys, so production runs whatever the registry served at build time." : ""}`,
      agentRemediationPrompt: `Generate a lockfile for ${rel} with the project's package manager (\`npm install\`, \`pnpm install\`, \`bun install\` or \`yarn\`), commit it, and switch CI to a frozen install (\`npm ci\`, \`pnpm install --frozen-lockfile\`, \`bun install --frozen-lockfile\`, \`yarn install --immutable\`).`,
    });
  } else {
    const lt = ctx.getText(lock);
    // Resolved entries only: package-lock `node_modules/<n>`, bun.lock `"<n>": [`, pnpm/yarn `<n>@<version>` (not the root manifest copy).
    const entry = (n: string) =>
      /package-lock\.json$|npm-shrinkwrap\.json$/.test(lock)
        ? lt.includes(`node_modules/${n}"`)
        : lock.endsWith("bun.lock")
          ? lt.includes(`"${n}": [`)
          : new RegExp(`(?:^|[\\s"'/])${esc(n)}@`, "m").test(lt);
    const absent = names.filter((n) => !entry(n));
    if (absent.length)
      emit({
        file: rel,
        line: lineOf(text, `"${absent[0]}"`),
        nodeRef: `manifest:${rel}`,
        evidence: `${lock} has no entry for ${absent.slice(0, 5).join(", ")}${absent.length > 5 ? ` (+${absent.length - 5} more)` : ""} declared in ${rel}`,
        impact:
          "The lockfile is out of sync with the manifest, so frozen installs fail and regular installs resolve those packages fresh from the registry, unpinned.",
        agentRemediationPrompt: `Run the package manager's install in ${dir || "the repo root"} to bring ${lock} back in sync with ${rel}, commit both files, and use a frozen install in CI so drift fails the build.`,
      });
  }
  const runtime = { ...pj.dependencies, ...pj.optionalDependencies } as Record<string, string>;
  for (const [n, raw] of Object.entries(runtime)) {
    const v = String(raw).trim();
    const line = lineOf(text, `"${n}"`);
    if (FLOATING.test(v) || (DIST_TAG.test(v) && !GIT_OR_URL.test(v)))
      emit({
        file: rel,
        line,
        nodeRef: `dep:${n}`,
        evidence: `"${n}": "${v}"`,
        impact: `\`${n}\` accepts ${FLOATING.test(v) ? "any version" : `whatever the \`${v}\` tag points at`}, so a compromised or breaking release reaches production on the next install.`,
        agentRemediationPrompt: `In ${rel}, replace "${v}" for \`${n}\` with the exact version currently in the lockfile (or \`^<that version>\`), reinstall, and commit the lockfile.`,
      });
    else if (GIT_OR_URL.test(v) && !SHA.test(v))
      emit({
        file: rel,
        line,
        nodeRef: `dep:${n}`,
        evidence: `"${n}": "${v}"`,
        impact: `\`${n}\` installs from a ${/\.(tgz|tar\.gz)$/.test(v) ? "tarball URL" : "git ref"} that can be moved or replaced, bypassing the registry's immutability and integrity checks.`,
        agentRemediationPrompt: `Pin \`${n}\` in ${rel} to a full 40-character commit SHA (\`git+https://…#<sha>\`), or publish it to a registry and depend on an exact version.`,
      });
  }
}

/** requirements*.txt / pyproject.toml / Cargo.toml / go.mod: missing lock, floating specs, unpinned git deps. */
function otherManifests(ctx: RepoContext, emit: Emit, critical: boolean) {
  const pyLock = LOCKFILES.pypi.some((l) => ctx.hasFile(l));
  const missingLock = (rel: string, what: string, fix: string) =>
    emit({
      severity: critical ? "CRITICAL" : "HIGH",
      file: rel,
      line: 1,
      nodeRef: `manifest:${rel}`,
      evidence: `${rel} declares dependencies; no ${what} is committed`,
      impact: `Each install resolves whatever the registry serves that day, so builds aren't reproducible and a hijacked release ships unnoticed.${critical ? " This app deploys, so production runs it." : ""}`,
      agentRemediationPrompt: fix,
    });
  const req = ctx.files.all.filter((f) => /(^|\/)requirements[\w.-]*\.txt$/.test(f) && f.split("/").length <= 2);
  for (const rel of req) {
    const text = ctx.getText(rel);
    for (const m of text.matchAll(/^[ \t]*([A-Za-z0-9][\w.-]*)(\[[^\]]*\])?[ \t]*(@[^\n#]*)?([^\n#]*)/gm)) {
      const [, name, , url = "", spec = ""] = m;
      if (/^-/.test(name)) continue;
      const line = lineAt(text, m.index);
      if (url && /git\+|https?:/.test(url) && !SHA.test(url))
        emit({
          file: rel,
          line,
          nodeRef: `dep:pypi:${name}`,
          evidence: m[0].trim(),
          impact: `\`${name}\` installs from a moving git ref or URL, bypassing PyPI's immutability.`,
          agentRemediationPrompt: `Pin \`${name}\` in ${rel} to a full commit SHA (\`@ git+https://…@<sha>\`) or an exact PyPI version (\`==\`).`,
        });
      else if (!url && !pyLock && !/==/.test(spec))
        emit({
          file: rel,
          line,
          nodeRef: `dep:pypi:${name}`,
          evidence: m[0].trim(),
          impact: `\`${name}\` isn't pinned and there's no Python lockfile, so every install can pull a different (or hijacked) release.`,
          agentRemediationPrompt: `Pin \`${name}==<version>\` in ${rel} (\`pip freeze\`, \`pip-compile --generate-hashes\` or \`uv pip compile\`), or move to uv/poetry with a committed lockfile.`,
        });
    }
  }
  if (ctx.hasFile("pyproject.toml") && !pyLock && !req.length) {
    const text = ctx.getText("pyproject.toml");
    if (/^\s*dependencies\s*=\s*\[\s*["']/m.test(text) || /^\[tool\.poetry\.dependencies\]/m.test(text))
      missingLock(
        "pyproject.toml",
        "uv.lock, poetry.lock or Pipfile.lock",
        "Run `uv lock` (or `poetry lock`), commit the lockfile, and install with `uv sync --frozen` / `poetry install --no-root --sync` in CI.",
      );
  }
  for (const rel of ctx.files.all.filter((f) => (f === "go.mod" || f.endsWith("/go.mod")) && f.split("/").length <= 3)) {
    const dir = dirname(rel) === "." ? "" : `${dirname(rel)}/`;
    if (/^\s*require\b/m.test(ctx.getText(rel)) && !ctx.hasFile(`${dir}go.sum`) && !ctx.hasFile("go.sum"))
      missingLock(rel, "go.sum", `Run \`go mod tidy\` in ${dir || "the repo root"} and commit go.sum so module checksums are verified.`);
  }
  for (const rel of ctx.files.all.filter((f) => (f === "Cargo.toml" || f.endsWith("/Cargo.toml")) && f.split("/").length <= 3)) {
    const text = ctx.getText(rel);
    const dir = dirname(rel) === "." ? "" : `${dirname(rel)}/`;
    const isBin = /^\[\[bin\]\]/m.test(text) || ctx.hasFile(`${dir}src/main.rs`);
    if (isBin && /^\[(?:dev-)?dependencies\]/m.test(text) && !ctx.hasFile(`${dir}Cargo.lock`) && !ctx.hasFile("Cargo.lock"))
      missingLock(
        rel,
        "Cargo.lock",
        `Run \`cargo generate-lockfile\` in ${dir || "the repo root"}, commit Cargo.lock (binaries should), and build with \`--locked\`.`,
      );
    for (const m of text.matchAll(/^\s*([\w-]+)\s*=\s*\{[^}\n]*\bgit\s*=\s*"[^"]+"[^}\n]*\}/gm))
      if (!/\brev\s*=\s*"[0-9a-f]{40}"/i.test(m[0]))
        emit({
          file: rel,
          line: lineAt(text, m.index),
          nodeRef: `dep:cargo:${m[1]}`,
          evidence: m[0].trim(),
          impact: `\`${m[1]}\` builds from a git branch or tag that can be moved, bypassing crates.io immutability.`,
          agentRemediationPrompt: `Add \`rev = "<40-char commit sha>"\` to the \`${m[1]}\` entry in ${rel} (or depend on a published crates.io version), then \`cargo update -p ${m[1]}\`.`,
        });
  }
}

/** Install scripts on packages outside the seed list: lockfile flags, else node_modules for direct deps. */
function installScripts(ctx: RepoContext, emit: Emit) {
  for (const d of ctx.dependencies.values()) {
    if ((d.ecosystem ?? "npm") !== "npm" || d.isLocal || lookupKnownPackage("npm", d.name)) continue;
    let scripts = d.hasInstallScript;
    if (scripts === undefined && d.isDirect)
      try {
        const s = JSON.parse(readFileSync(join(ctx.rootDir, "node_modules", d.name, "package.json"), "utf8")).scripts ?? {};
        scripts = !!(s.preinstall || s.install || s.postinstall);
      } catch {}
    if (!scripts) continue;
    const lock = ["package-lock.json", "pnpm-lock.yaml"].find((l) => ctx.hasFile(l));
    const text = lock ? ctx.getText(lock) : "";
    emit({
      file: lock ?? d.declaredIn ?? "package.json",
      line: lock ? lineOf(text, text.includes(`node_modules/${d.name}"`) ? `node_modules/${d.name}"` : `${d.name}@`) : (d.declaredLine ?? 1),
      nodeRef: `dep:${d.name}`,
      evidence: `${d.name}@${d.version} runs an install script (${lock ? `${lock}: hasInstallScript` : "node_modules package.json"}) and isn't on the known-package list`,
      impact: `\`${d.name}\` executes code on every \`install\`, on developer laptops and CI runners, with access to env vars, SSH keys and tokens. Install scripts are how npm worms spread.`,
      agentRemediationPrompt: `Check whether \`${d.name}\` needs its install script. If not, install with \`--ignore-scripts\` (npm/yarn) or leave it out of pnpm \`onlyBuiltDependencies\` / bun \`trustedDependencies\`; if it does, review the script source and pin \`${d.name}\` to an exact version.`,
    });
  }
}

export const dep03InstallHygiene = defineRule(
  { id: "DEP-03", pillar: "SECURITY", severity: "HIGH", title: "Install Hygiene (Lockfile, Floating Ranges, Git Deps, Install Scripts)", scope: "repo" },
  (ctx, emit) => {
    const critical = deployable(ctx);
    for (const rel of ctx.files.all.filter(
      (f) => /(^|\/)package\.json$/.test(f) && f.split("/").length <= 3 && !f.includes("fixtures/") && !f.includes("node_modules/"),
    ))
      npmManifest(ctx, rel, emit, critical);
    otherManifests(ctx, emit, critical);
    installScripts(ctx, emit);
  },
);
