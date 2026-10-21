import type { Severity } from "../../context/types";
import { parseJsonc } from "../agent/mcp-config";
import { defineRule, lineAt } from "../helpers";

type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Whole-disk or whole-home globs (app-scoped `$APP*` bases are fine). */
const BROAD_PATH =
  /^(?:\*{1,2}(?:\/.*)?|\/\*\*.*|[A-Za-z]:[\\/]*\*\*.*|~\/\*\*.*|\$(?:HOME|ROOT|DESKTOP|DOCUMENT|DOWNLOAD|PUBLIC|AUDIO|VIDEO|PICTURE|TEMP|CACHE|CONFIG|DATA|LOCALDATA|RUNTIME|EXE|HOME_DIR)\/\*\*.*)$/;
const BROAD_URL = /^(?:\*+|https?:\/\/\*+(?:\/.*)?|https?:\/\/\*\*.*|https?:\/\/\*\.\*.*|\*:\/\/.*)$/i;
const SHELLS = /(?:^|[\\/])(?:sh|bash|zsh|fish|cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh|node|python3?|osascript)$/i;
/** v2 permissions that grant recursive access to a user directory outside the app's sandbox. */
const RECURSIVE_USER_DIR =
  /^fs:allow-(?!app)(?:home|desktop|document|download|picture|video|audio|public|temp|cache|config|data|localdata|resource|exe)-(?:read|write|meta)(?:-recursive)?$/;
const CAP_FILE = /(?:^|\/)capabilities\/[^/]+\.json$/;

type Hit = { severity: Severity; needle: string; what: string; fix: string };

/** Scope entries are strings or `{ path | url | cmd }` objects; `{allow, deny}` wraps them. */
const scopeEntries = (s: unknown): unknown[] => (Array.isArray(s) ? s : isObj(s) && Array.isArray(s.allow) ? s.allow : []);
const entryPath = (e: unknown) => (typeof e === "string" ? e : isObj(e) ? (e.path ?? e.url) : undefined);

function checkV1(allow: Obj, hits: Hit[]) {
  if (allow.all === true)
    hits.push({
      severity: "CRITICAL",
      needle: '"all"',
      what: "`tauri.allowlist.all: true` enables every API (shell execute, fs on any path, http to anywhere)",
      fix: "set `allowlist.all` to false and enable only the individual APIs the frontend calls",
    });
  for (const g of ["fs", "shell", "http", "process", "protocol"]) {
    const grp = allow[g];
    if (!isObj(grp)) continue;
    if (grp.all === true)
      hits.push({
        severity: "HIGH",
        needle: `"${g}"`,
        what: `\`allowlist.${g}.all: true\` enables every ${g} API`,
        fix: `replace \`${g}.all\` with the specific ${g} commands you use`,
      });
    for (const key of ["scope", "assetScope"])
      for (const e of scopeEntries(grp[key])) {
        const p = entryPath(e);
        if (typeof p === "string" && (g === "http" ? BROAD_URL : BROAD_PATH).test(p))
          hits.push({
            severity: "HIGH",
            needle: JSON.stringify(p),
            what: `\`allowlist.${g}.${key}\` contains \`${p}\``,
            fix: g === "http" ? "list exact API origins" : "restrict the scope to `$APPDATA/**` or an exact folder",
          });
        if (g === "shell" && isObj(e) && e.args === true && e.sidecar !== true)
          hits.push({
            severity: "HIGH",
            needle: JSON.stringify(e.cmd ?? e.name),
            what: `shell scope \`${e.name}\` runs \`${e.cmd}\` with arbitrary arguments`,
            fix: "replace `args: true` with a fixed argument list or `{ validator }` regexes",
          });
      }
  }
}

function checkCapability(cap: Obj, hits: Hit[]) {
  const remote = isObj(cap.remote) && Array.isArray(cap.remote.urls) ? cap.remote.urls : [];
  for (const u of remote)
    if (typeof u === "string" && (BROAD_URL.test(u) || /^https?:\/\/\*/.test(u) || u.startsWith("http://")))
      hits.push({
        severity: /\*/.test(u) ? "CRITICAL" : "HIGH",
        needle: JSON.stringify(u),
        what: `capability \`${cap.identifier}\` grants IPC to remote pages matching \`${u}\``,
        fix: "remove `remote.urls` or list one exact `https://` origin you control",
      });
  for (const p of Array.isArray(cap.permissions) ? cap.permissions : []) {
    const id = typeof p === "string" ? p : isObj(p) ? String(p.identifier ?? "") : "";
    if (RECURSIVE_USER_DIR.test(id))
      hits.push({
        severity: "HIGH",
        needle: JSON.stringify(id),
        what: `\`${id}\` grants access to a user directory outside the app sandbox`,
        fix: "use `fs:allow-appdata-*` permissions or an `fs:scope` limited to `$APPDATA/**`",
      });
    if (!isObj(p)) continue;
    for (const e of scopeEntries(p.allow)) {
      const path = entryPath(e);
      if (typeof path === "string" && (/^http:/.test(id) ? BROAD_URL : BROAD_PATH).test(path))
        hits.push({
          severity: "HIGH",
          needle: JSON.stringify(path),
          what: `\`${id}\` is scoped to \`${path}\``,
          fix: /^http:/.test(id) ? "list exact API origins in `allow`" : "scope it to `$APPDATA/**` or an exact folder",
        });
      if (/^shell:allow-(?:execute|spawn)$/.test(id) && isObj(e) && e.sidecar !== true && (e.args === true || SHELLS.test(String(e.cmd ?? ""))))
        hits.push({
          severity: "HIGH",
          needle: JSON.stringify(e.cmd ?? e.name),
          what: `\`${id}\` lets the webview run \`${e.cmd ?? e.name}\`${e.args === true ? " with arbitrary arguments" : ""}`,
          fix: "allow only a fixed binary (ideally a sidecar) with fixed args or strict `{ validator }` regexes, never a shell or interpreter",
        });
    }
  }
}

export const client01TauriScopes = defineRule(
  { id: "CLIENT-01", pillar: "SECURITY", severity: "HIGH", title: "Tauri Allowlist / Capability Grants the Webview Broad System Access" },
  (ctx, emit) => {
    for (const file of ctx.files.all) {
      const isConf = /(?:^|\/)tauri(?:\.[\w-]+)?\.conf\.json$/.test(file);
      if (!isConf && !(CAP_FILE.test(file) && /"permissions"\s*:/.test(ctx.getText(file)))) continue;
      const text = ctx.getText(file);
      const json = parseJsonc(text);
      if (!isObj(json)) continue;
      const hits: Hit[] = [];
      if (isConf) {
        if (isObj(json.tauri?.allowlist)) checkV1(json.tauri.allowlist, hits);
        for (const d of [...(json.tauri?.security?.dangerousRemoteDomainIpcAccess ?? []), ...(json.tauri?.security?.dangerousRemoteUrlIpcAccess ?? [])])
          if (isObj(d) && /\*/.test(String(d.domain ?? d.url ?? "")))
            hits.push({
              severity: "CRITICAL",
              needle: JSON.stringify(d.domain ?? d.url),
              what: `remote IPC access is granted to the wildcard \`${d.domain ?? d.url}\``,
              fix: "remove the wildcard remote IPC grant",
            });
        for (const c of json.app?.security?.capabilities ?? []) if (isObj(c)) checkCapability(c, hits);
      } else checkCapability(json, hits);
      if (!hits.length) continue;
      const noCsp = isConf && (json.tauri?.security?.csp ?? json.app?.security?.csp) == null;
      for (const h of hits) {
        const idx = text.indexOf(h.needle);
        const line = idx >= 0 ? lineAt(text, idx + 1) : 1;
        emit({
          file,
          line,
          severity: h.severity,
          evidence: text.split("\n")[line - 1]?.trim() || h.needle,
          impact: `${h.what}. Tauri's security model assumes the webview is hostile: one XSS, a malicious npm package in the frontend bundle, or a loaded remote page turns this grant into reading or overwriting the user's files and running commands on their machine${noCsp ? " (and no CSP is configured, so injected scripts run freely)" : ""}.`,
          agentRemediationPrompt: `In ${file}:${line}, ${h.fix}. Keep permissions per window in \`src-tauri/capabilities/\`, and set a strict \`csp\` in tauri.conf.json.`,
        });
      }
    }
  },
);
