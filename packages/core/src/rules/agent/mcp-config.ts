/** Shared parsing for agent / MCP config files (MCP-01, MCP-02). */

import { parseToml } from "../../context/toml";
import type { RepoContext } from "../../context/types";
import { isGitIgnored } from "../helpers";

/**
 * Claude / Cursor / VS Code project configs, Windsurf (Devin Desktop) and Antigravity `mcp_config.json`
 * (workspace `.agents/`, or a user-level copy committed under `.windsurf/`, `.devin/`, `.codeium/windsurf/`, `.gemini/`),
 * and Codex `.codex/config.toml`.
 */
export const AGENT_CONFIG_RE =
  /(^|\/)(\.mcp\.json|\.cursor\/mcp\.json|\.vscode\/mcp\.json|\.claude\/settings(\.local)?\.json|\.(windsurf|devin|agents?|codeium\/windsurf|gemini(\/config|\/antigravity)?)\/mcp_config\.json|\.codex\/config\.toml)$/;
/** `${VAR}`, `${env:VAR}`, `${input:id}`, `${VAR:-default}`, `$VAR`, `%VAR%`: resolved at launch, never a literal. */
export const ENV_REF_RE = /\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|%[A-Za-z_][A-Za-z0-9_]*%/g;

export interface AgentConfig {
  file: string;
  text: string;
  json: Record<string, unknown>;
  /** `mcpServers` (Claude, Cursor, Windsurf, Antigravity), `servers` (VS Code) or `mcp_servers` (Codex TOML) */
  servers: Array<[name: string, def: Record<string, unknown>]>;
}

/** JSON with `//` and block comments and trailing commas (VS Code's mcp.json is JSONC). */
export function parseJsonc(text: string): unknown {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      out += text.slice(i, end < 0 ? text.length : end + 2).replace(/[^\n]/g, " ");
      i = end < 0 ? text.length : end + 1;
    } else if (c === "," && /^\s*[}\]]/.test(text.slice(i + 1, i + 200))) out += " ";
    else out += c;
  }
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Committed agent configs only: a git-ignored one stays on the developer's machine. */
export function agentConfigs(ctx: RepoContext): AgentConfig[] {
  const out: AgentConfig[] = [];
  for (const file of ctx.files.all) {
    if (!AGENT_CONFIG_RE.test(file) || isGitIgnored(ctx, file)) continue;
    const text = ctx.getText(file);
    const json = file.endsWith(".toml") ? parseToml(text) : parseJsonc(text);
    if (!isObj(json)) continue;
    const map = [json.mcpServers, json.servers, json.mcp_servers].find(isObj) ?? {};
    out.push({ file, text, json, servers: Object.entries(map).filter((e): e is [string, Record<string, unknown>] => isObj(e[1])) });
  }
  return out;
}

/** Every string leaf with its JSON path and the name it's bound to (object key, preceding `--flag`, `--flag=` or URL query param). */
export function stringLeaves(v: unknown, path: string[] = []): Array<{ path: string; key: string | null; value: string }> {
  const out: Array<{ path: string; key: string | null; value: string }> = [];
  const add = (p: string[], key: string | null, value: string) => {
    const at = p.join(".").replace(/\.\[/g, "[");
    out.push({ path: at, key, value });
    if (/^https?:\/\/[^?\s]+\?/.test(value))
      try {
        for (const [k, val] of new URL(value).searchParams) out.push({ path: `${at}?${k}`, key: k, value: val });
      } catch {}
  };
  if (typeof v === "string") add(path, null, v);
  else if (Array.isArray(v))
    for (const [i, item] of v.entries()) {
      const p = [...path, `[${i}]`];
      if (typeof item !== "string") {
        out.push(...stringLeaves(item, p));
        continue;
      }
      const kv = item.match(/^--?([\w-]+)=(.+)$/s);
      const prev = v[i - 1];
      if (kv) add(p, kv[1], kv[2]);
      else add(p, typeof prev === "string" && /^--?[A-Za-z][\w-]*$/.test(prev) ? prev.replace(/^-+/, "") : null, item);
    }
  else if (isObj(v))
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === "string") add([...path, k], k, val);
      else out.push(...stringLeaves(val, [...path, k]));
    }
  return out;
}
