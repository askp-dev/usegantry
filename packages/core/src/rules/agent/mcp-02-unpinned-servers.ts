import { levenshtein } from "../../context/code-index";
import { lookupKnownPackage, OFFICIAL_MCP_SERVERS } from "../../context/knowledge";
import { defineRule, lineAt } from "../helpers";
import { nearestTopPackage, registryInfo } from "../legal/leg-01-slopsquatting";
import { agentConfigs } from "./mcp-config";

type Eco = "npm" | "pypi";
/** Runner prefixes (after `cmd /c` is dropped) → ecosystem and how many tokens the runner spans. */
const RUNNERS: Array<[RegExp, Eco, number]> = [
  [/^(npx|bunx|pnpx)$/, "npm", 1],
  [/^(pnpm|yarn|bun) (dlx|x)$/, "npm", 2],
  [/^npm exec$/, "npm", 2],
  [/^uvx$/, "pypi", 1],
  [/^uv tool run$/, "pypi", 3],
  [/^pipx run$/, "pypi", 2],
];
/** Flags whose next token names the package to install. */
const PKG_FLAGS = /^(-p|--package|--from|--spec)$/;
/** Flags that take a value that isn't the package (`--python 3.12`, `--with x`). */
const VALUE_FLAGS = /^(--python|--with|--with-requirements|--index|--index-url|--extra-index-url|--registry|--cache|--userconfig|-c|--call)$/;
const EXACT_VERSION = /^v?\d+(\.\d+){1,3}(?:[-+.]?[0-9A-Za-z.-]+)?$/;

interface ServerPackage {
  eco: Eco;
  spec: string;
  name: string;
  version?: string;
}

/** The package an `npx`/`uvx`/… launch line installs, or null when it isn't a package runner. */
export function serverPackage(command: unknown, args: unknown): ServerPackage | null {
  const toks = [...(typeof command === "string" ? command.trim().split(/\s+/) : []), ...(Array.isArray(args) ? args.filter((a) => typeof a === "string") : [])];
  while (toks.length && /^(cmd(\.exe)?|\/[cC]|-c|sh|bash)$/.test(toks[0])) toks.shift();
  if (!toks.length) return null;
  toks[0] = toks[0].replace(/^.*[\\/]/, "").replace(/\.(cmd|exe)$/i, "");
  const runner = RUNNERS.find(([re, , n]) => re.test(toks.slice(0, n).join(" ")));
  if (!runner) return null;
  const [, eco, n] = runner;
  let spec: string | undefined;
  for (let i = n; i < toks.length && !spec; i++) {
    const t = toks[i];
    const eq = t.match(/^(--package|--from|--spec)=(.+)$/);
    if (eq) spec = eq[2];
    else if (PKG_FLAGS.test(t)) spec = toks[++i];
    else if (VALUE_FLAGS.test(t)) i++;
    else if (!t.startsWith("-")) spec = t;
  }
  if (!spec) return null;
  const m = eco === "npm" ? spec.match(/^(@[^/@\s]+\/[^@\s]+|[^@\s]+)(?:@(.+))?$/) : spec.match(/^([A-Za-z0-9._-]+)(?:\[[^\]]*\])?(?:(?:==|@)(.+))?$/);
  return { eco, spec, name: m?.[1] ?? spec, version: m?.[2] };
}

function lookalikeOfficial(eco: Eco, name: string): string | null {
  for (const o of OFFICIAL_MCP_SERVERS[eco]) if (o !== name && levenshtein(name, o, 1) <= 1) return o;
  return null;
}

export const mcp02UnpinnedServers = defineRule(
  { id: "MCP-02", pillar: "SECURITY", severity: "HIGH", title: "Unpinned or Unverified npx / uvx / bunx MCP Servers" },
  async (ctx, emit) => {
    const pending: Array<Promise<void>> = [];
    for (const cfg of agentConfigs(ctx)) {
      for (const [server, def] of cfg.servers) {
        const pkg = serverPackage(def.command, def.args);
        if (!pkg || /^(\.|\/|~|file:)/.test(pkg.spec)) continue;
        const remote = /^(git\+|github:|gitlab:|https?:)|:\/\//.test(pkg.spec);
        const name = pkg.eco === "pypi" ? pkg.name.toLowerCase() : pkg.name;
        const known = !remote && (!!lookupKnownPackage(pkg.eco, name) || OFFICIAL_MCP_SERVERS[pkg.eco].includes(name));
        const near = remote || known ? null : (lookalikeOfficial(pkg.eco, name) ?? nearestTopPackage(pkg.eco, name));
        const pinned = !remote && !!pkg.version && EXACT_VERSION.test(pkg.version);
        const report = (extra: string[], critical: boolean) => {
          const why = [
            ...extra,
            ...(pinned
              ? []
              : [
                  remote
                    ? "installs from a git/URL source, not a registry"
                    : `isn't pinned to an exact version${pkg.version ? ` (\`@${pkg.version}\` floats)` : ""}`,
                ]),
            ...(known || remote || near ? [] : ["isn't in the verified package seed or official MCP server list"]),
          ];
          if (!why.length) return;
          const at = [`"${server}"`, `mcp_servers.${server}]`].map((n) => cfg.text.indexOf(n)).find((n) => n >= 0) ?? -1;
          emit({
            file: cfg.file,
            line: at >= 0 ? lineAt(cfg.text, at) : 1,
            nodeRef: `mcp:${server}`,
            severity: critical ? "CRITICAL" : undefined,
            evidence: `mcp server "${server}": \`${pkg.spec}\` ${why.join("; ")}`,
            impact: `Every agent session runs \`${pkg.spec}\` with your shell's permissions and env. An unpinned or look-alike package means whoever publishes the next version (or registers the typo) gets code execution on every developer machine that opens this repo.`,
            agentRemediationPrompt: near
              ? `In ${cfg.file}, server "${server}": replace \`${pkg.name}\` with the official \`${near}\` pinned to an exact version you've verified (e.g. \`${near}@<x.y.z>\`), and check whether \`${pkg.name}\` already ran on any machine.`
              : `In ${cfg.file}, server "${server}": pin \`${pkg.name}\` to an exact, verified version (\`${pkg.eco === "npm" ? `${pkg.name}@<x.y.z>` : `${pkg.name}==<x.y.z>`}\`), confirm it's the vendor's official package, or install it as a pinned devDependency and launch it from \`node_modules/.bin\`.`,
          });
        };
        if (near) report([`is 1 edit away from \`${near}\` (likely typosquat)`], true);
        else if (known || remote || ctx.config.offline) report([], false);
        else
          pending.push(
            registryInfo(pkg.eco, name).then((info) => (info && !info.exists ? report(["does not exist on the registry (404)"], true) : report([], false))),
          );
      }
    }
    await Promise.all(pending);
  },
);
