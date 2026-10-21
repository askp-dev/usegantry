#!/usr/bin/env bun
import { resolve } from "node:path";
import { CertificateBlockedError, generateCertificate } from "../compilers/cert-generator";
import { writeChecklist } from "../compilers/checklist-writer";
import { compileLegalDocs } from "../compilers/legal-compiler";
import { LEGAL_DISCLAIMER } from "../compilers/legal-templates";
import { writeVendorPack } from "../compilers/vendor-pack";
import { buildRepoContext } from "../context/builder";
import { changedScope } from "../context/changed";
import { loadConfig } from "../context/config";
import { runAudit, VERSION } from "../engine";
import { requireFeature } from "../entitlements";
import { renderCompact } from "../reporters/compact";
import { color, renderPretty } from "../reporters/pretty";
import { toSarif } from "../reporters/sarif";

const HELP = `preflight ${VERSION}: launch readiness for AI-generated repos

Usage:
  preflight scan [path] [--json] [--sarif] [--compact] [--changed-only] [--strict] [--offline] [--write-checklist] [--verbose]
  preflight legal [path] [--apply]
  preflight cert [path] [--allow-blocked] [--strict] [--offline]
  preflight attack --target <url> [path]
  preflight ui [path] [--port 4400]
  preflight init [path] [--ci] [--no-hooks] [--pre-commit]
  preflight hook <stop|pre-commit> [path] [--agent claude|cursor]   (agent hooks; reads the event JSON on stdin)
  preflight mcp

Exit codes: 0 ok · 1 launch blockers found · 2 usage/runtime error`;

export function parseArgs(argv: string[]): { cmd: string; path: string; flags: Record<string, string | boolean> } {
  const [cmd = "help", ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) positional.push(a);
    else if (a.includes("=")) flags[a.slice(2, a.indexOf("="))] = a.slice(a.indexOf("=") + 1);
    else if (["--target", "--port", "--out", "--agent"].includes(a) && rest[i + 1] && !rest[i + 1].startsWith("--")) flags[a.slice(2)] = rest[++i];
    else flags[a.slice(2)] = true;
  }
  return { cmd, path: resolve(positional[0] ?? "."), flags };
}

/** Commands whose modules land in later sprints are loaded lazily so `scan` stays fast. */
// Static specifiers (lazily loaded) so `bun build --compile` bundles every subcommand.
const MODULES = {
  "pentest/runner": () => import("../pentest/runner"),
  "server/ui-server": () => import("../server/ui-server"),
  init: () => import("../init"),
  hooks: () => import("../hooks"),
  "bin/mcp": () => import("./mcp"),
} as const;

async function delegate(mod: keyof typeof MODULES, args: { path: string; flags: Record<string, string | boolean>; event?: string }): Promise<number> {
  return (await MODULES[mod]()).main(args);
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const { cmd, path, flags } = parseArgs(argv);
  const config = { strict: flags.strict === true || undefined, offline: flags.offline === true || undefined };
  switch (cmd) {
    case "scan": {
      const scope = flags["changed-only"] ? changedScope(path, loadConfig(path, config)) : null;
      if (flags["changed-only"] && !scope) console.error(color.dim("--changed-only: not a git work tree, scanning everything"));
      const ctx = await buildRepoContext(path, { config, ...(scope ? { only: scope.only } : {}) });
      const report = await runAudit(ctx, scope ? { changedFiles: scope.changed } : {});
      if (flags.compact) process.stdout.write(renderCompact(report));
      else if (flags.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      else if (flags.sarif) process.stdout.write(`${JSON.stringify(toSarif(report), null, 2)}\n`);
      else process.stdout.write(renderPretty(report, { verbose: flags.verbose === true }));
      // A partial scan would overwrite the checklist with a subset of the repo's findings.
      if (flags["write-checklist"] && scope) console.error(color.dim("--write-checklist ignored with --changed-only"));
      else if (flags["write-checklist"]) {
        writeChecklist(ctx, report);
        if (!flags.json && !flags.sarif && !flags.compact) console.log(color.dim("Updated READINESS_CHECKLIST.md"));
      }
      return report.blockers > 0 ? 1 : 0;
    }
    case "legal": {
      const ctx = await buildRepoContext(path, { config });
      const { manifest, changes } = compileLegalDocs(ctx, { apply: flags.apply === true });
      console.log(`${color.bold("Legal manifest")} v${manifest.version} · stack hash ${manifest.stackHash} · ${manifest.subprocessors.length} sub-processors`);
      if (!changes.length) console.log(color.green("Legal docs are up to date."));
      for (const c of changes) {
        if (flags.apply) console.log(`${color.green("✔ wrote")} ${c.path}`);
        else process.stdout.write(c.diff);
      }
      if (!flags.apply && changes.length) console.log(color.dim("Dry run. Re-run with --apply to write these changes."));
      console.log(color.amber(`⚠ ${LEGAL_DISCLAIMER}`));
      return 0;
    }
    case "cert": {
      const ctx = await buildRepoContext(path, { config });
      const report = await runAudit(ctx);
      try {
        const res = generateCertificate(report, { outDir: path, allowBlocked: flags["allow-blocked"] === true });
        const pack = writeVendorPack(ctx, report, path);
        console.log(
          `${color.green("✔")} ${res.html}\n${color.green("✔")} ${res.pdf}\n${pack.map((p) => `${color.green("✔")} ${p}`).join("\n")}\n${color.dim("verify:")} ${res.url.slice(0, 100)}…`,
        );
        return report.blockers > 0 ? 1 : 0;
      } catch (e) {
        if (e instanceof CertificateBlockedError) {
          console.error(color.red(e.message));
          return 1;
        }
        throw e;
      }
    }
    case "attack":
      requireFeature("attack");
      if (typeof flags.target !== "string") {
        console.error("attack requires --target <url>");
        return 2;
      }
      return delegate("pentest/runner", { path, flags });
    case "ui":
      return delegate("server/ui-server", { path, flags });
    case "init":
      return delegate("init", { path, flags });
    case "hook": {
      // `hook <event> [path]`: the first positional is the event, not the path.
      const event = argv[1] && !argv[1].startsWith("--") ? argv[1] : "";
      const rest = parseArgs(["hook", ...argv.slice(event ? 2 : 1)]);
      return delegate("hooks", { path: rest.path, flags: rest.flags, event });
    }
    case "mcp":
      return delegate("bin/mcp", { path, flags });
    case "--version":
    case "version":
      console.log(VERSION);
      return 0;
    default:
      console.log(HELP);
      return cmd === "help" || cmd === "--help" || cmd === "-h" ? 0 : 2;
  }
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(color.red(`preflight: ${e instanceof Error ? e.message : e}`));
      process.exit(2);
    },
  );
}
