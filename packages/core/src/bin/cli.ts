#!/usr/bin/env bun
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileAiInventory } from "../compilers/ai-inventory";
import { CentralSignError, signCentrally } from "../compilers/central-sign";
import { buildPayload, CertificateBlockedError, generateCertificate } from "../compilers/cert-generator";
import { writeChecklist } from "../compilers/checklist-writer";
import { compileLegalDocs, writeChanges } from "../compilers/legal-compiler";
import { LEGAL_DISCLAIMER } from "../compilers/legal-templates";
import { compileSafeHarbor } from "../compilers/safe-harbor";
import { buildSbom, writeVendorPack } from "../compilers/vendor-pack";
import { loadAdvisories } from "../context/advisories";
import { buildRepoContext } from "../context/builder";
import { changedScope } from "../context/changed";
import { loadConfig } from "../context/config";
import { runAudit, VERSION } from "../engine";
import { requireFeature } from "../entitlements";
import { renderCompact } from "../reporters/compact";
import { color, renderPretty } from "../reporters/pretty";
import { toSarif } from "../reporters/sarif";
import { ALL_STATIC_RULES } from "../rules/index";

const HELP = `gantry ${VERSION}: launch readiness for AI-generated repos

Usage:
  gantry scan [path] [--json] [--sarif] [--compact] [--changed-only] [--only DEP-01,DEP-02] [--strict] [--offline] [--profile hipaa,fintech-pci,legal-privilege,eu-ai-act,airgap] [--write-checklist] [--verbose]
  gantry sbom [path] [--out sbom.cdx.json] [--offline]   (CycloneDX 1.6; known advisories included when online or cached)
  gantry legal [path] [--sync] [--profile eu-ai-act]
  gantry clear [path] [--allow-blocked] [--strict] [--offline] [--central]   (--central: official GitHub workflow only)
  gantry check <https://github.com/owner/repo[/tree/ref] | path> [--json] [--md] [--online]   (--online: package-name advisory lookups)
  gantry roast <https://github.com/owner/repo[/tree/ref] | path> [--json] [--out card.svg]
  gantry badge [path] [--cert <verify-url>]
  gantry attack --target <url> [path]
  gantry ui [path] [--port 4400]
  gantry init [path] [--ci] [--no-hooks] [--pre-commit]
  gantry hook <stop|pre-commit> [path] [--agent claude|cursor]   (agent hooks; reads the event JSON on stdin)
  gantry mcp

Exit codes: 0 ok · 1 launch blockers found · 2 usage/runtime error`;

export function parseArgs(argv: string[]): { cmd: string; path: string; positional: string[]; flags: Record<string, string | boolean> } {
  const [cmd = "help", ...rest] = argv;
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) positional.push(a);
    else if (a.includes("=")) flags[a.slice(2, a.indexOf("="))] = a.slice(a.indexOf("=") + 1);
    else if (["--target", "--port", "--out", "--agent", "--profile", "--cert", "--only"].includes(a) && rest[i + 1] && !rest[i + 1].startsWith("--"))
      flags[a.slice(2)] = rest[++i];
    else flags[a.slice(2)] = true;
  }
  return { cmd, path: resolve(positional[0] ?? "."), positional, flags };
}

/** Commands whose modules land in later sprints are loaded lazily so `scan` stays fast. */
// Static specifiers (lazily loaded) so `bun build --compile` bundles every subcommand.
const MODULES = {
  "pentest/runner": () => import("../pentest/runner"),
  "server/ui-server": () => import("../server/ui-server"),
  init: () => import("../init"),
  hooks: () => import("../hooks"),
  "bin/mcp": () => import("./mcp"),
  "check/cli": () => import("../check/cli"),
} as const;

async function delegate(
  mod: keyof typeof MODULES,
  args: { path: string; flags: Record<string, string | boolean>; event?: string; cmd?: string; target?: string },
): Promise<number> {
  return (await MODULES[mod]()).main(args as any);
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const { cmd, path, positional, flags } = parseArgs(argv);
  const config = {
    strict: flags.strict === true || undefined,
    offline: flags.offline === true || undefined,
    profiles: typeof flags.profile === "string" ? flags.profile.split(",").map((p) => p.trim()) : undefined,
  };
  switch (cmd) {
    case "scan": {
      // `--only` names rule ids; it never becomes BuildOptions.only, which means files (quirk 5).
      const ruleIds = typeof flags.only === "string" ? flags.only.split(",").map((s) => s.trim().toUpperCase()) : undefined;
      const unknown = ruleIds?.filter((id) => !ALL_STATIC_RULES.some((r) => r.id === id)) ?? [];
      if (flags.only === true || unknown.length) {
        console.error(color.red(`--only: unknown rule id${unknown.length === 1 ? "" : "s"} ${unknown.join(", ") || "(none given)"}`));
        return 2;
      }
      const scope = flags["changed-only"] ? changedScope(path, loadConfig(path, config)) : null;
      if (flags["changed-only"] && !scope) console.error(color.dim("--changed-only: not a git work tree, scanning everything"));
      const ctx = await buildRepoContext(path, { config, ...(scope ? { only: scope.only } : {}) });
      const report = await runAudit(ctx, { ...(scope ? { changedFiles: scope.changed } : {}), ...(ruleIds ? { ruleIds } : {}) });
      if (flags.compact) process.stdout.write(renderCompact(report));
      else if (flags.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      else if (flags.sarif) process.stdout.write(`${JSON.stringify(toSarif(report), null, 2)}\n`);
      else process.stdout.write(renderPretty(report, { verbose: flags.verbose === true }));
      // A partial scan would overwrite the checklist with a subset of the repo's findings.
      if (flags["write-checklist"] && (scope || ruleIds)) console.error(color.dim(`--write-checklist ignored with ${scope ? "--changed-only" : "--only"}`));
      else if (flags["write-checklist"]) {
        writeChecklist(ctx, report);
        if (!flags.json && !flags.sarif && !flags.compact) console.log(color.dim("Updated GANTRY_CHECKLIST.md"));
      }
      return report.blockers > 0 ? 1 : 0;
    }
    case "sbom": {
      const ctx = await buildRepoContext(path, { config });
      // Offline (or a failed lookup) still yields a full component list; vulnerabilities come from the cache if any.
      const doc = `${JSON.stringify(buildSbom(ctx, new Date(), await loadAdvisories(ctx)), null, 2)}\n`;
      if (typeof flags.out === "string") {
        writeFileSync(resolve(flags.out), doc);
        console.error(`${color.green("✔")} ${flags.out} (CycloneDX 1.6, ${ctx.dependencies.size} components)`);
      } else process.stdout.write(doc);
      return 0;
    }
    case "legal": {
      const ctx = await buildRepoContext(path, { config });
      const { manifest, changes: legalChanges } = compileLegalDocs(ctx, { apply: flags.sync === true });
      const harbor = compileSafeHarbor(ctx, { apply: flags.sync === true });
      // eu-ai-act also compiles AI_INVENTORY.md (agency tier, like every profile).
      const aiAct = ctx.config.profiles?.includes("eu-ai-act");
      if (aiAct) requireFeature("profiles");
      const inventory = aiAct ? writeChanges(ctx, compileAiInventory(ctx), flags.sync === true) : [];
      const changes = [...legalChanges, ...harbor.changes, ...inventory];
      console.log(`${color.bold("Legal manifest")} v${manifest.version} · stack hash ${manifest.stackHash} · ${manifest.subprocessors.length} sub-processors`);
      if (!changes.length) console.log(color.green("Legal docs are up to date."));
      for (const c of changes) {
        if (flags.sync) console.log(`${color.green("✔ wrote")} ${c.path}`);
        else process.stdout.write(c.diff);
      }
      for (const s of harbor.skipped) console.log(color.amber(`skipped ${s.path}: ${s.reason}`));
      if (!flags.sync && changes.length) console.log(color.dim("Dry run. Re-run with --sync to write these changes."));
      console.log(color.amber(`⚠ ${LEGAL_DISCLAIMER}`));
      return 0;
    }
    case "clear": {
      const ctx = await buildRepoContext(path, { config });
      const report = await runAudit(ctx);
      try {
        const blockedNoAllow = report.blockers > 0 && flags["allow-blocked"] !== true;
        // Central signing only after the local refusal check, so a blocked repo never gets a signed cert by accident.
        const central = flags.central && !blockedNoAllow ? await signCentrally(buildPayload(report)) : undefined;
        const res = generateCertificate(report, { outDir: path, allowBlocked: flags["allow-blocked"] === true, central });
        const pack = writeVendorPack(ctx, report, path);
        console.log(
          `${color.green("✔")} ${res.html}\n${color.green("✔")} ${res.pdf}\n${pack.map((p) => `${color.green("✔")} ${p}`).join("\n")}\n${color.dim("verify:")} ${res.url.slice(0, 100)}…`,
        );
        return report.blockers > 0 ? 1 : 0;
      } catch (e) {
        if (e instanceof CertificateBlockedError || e instanceof CentralSignError) {
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
    case "check":
    case "roast":
    case "badge":
      return delegate("check/cli", { path, flags, cmd, target: positional[0] ?? "" });
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
      console.error(color.red(`gantry: ${e instanceof Error ? e.message : e}`));
      process.exit(2);
    },
  );
}
