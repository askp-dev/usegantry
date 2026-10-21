import { shannonEntropy } from "../../context/code-index";
import { SECRET_PATTERNS, SECRET_PLACEHOLDER_RE } from "../../context/patterns";
import { defineRule, lineAt, redact, redactUrl } from "../helpers";
import { agentConfigs, ENV_REF_RE, stringLeaves } from "./mcp-config";

/** Names that carry a credential in env maps, headers, CLI flags and query params. */
const SECRET_KEY_RE =
  /api[-_]?key|token|secret|passw|(^|[-_])auth($|[-_]|orization)|bearer|credential|private[-_]?key|access[-_]?key|(^|[-_])pat($|[-_])/i;

function fixFor(file: string, path: string): string {
  const name = path.split(/[.?]/).pop()!.replace(/[^\w]/g, "_").toUpperCase();
  if (/\.claude\/settings/.test(file))
    return `Remove the literal from \`${path}\` in ${file}. Export ${name} in your shell (or put it in the git-ignored \`.claude/settings.local.json\`; \`git rm --cached\` it if it's tracked) so the committed settings carry no secret.`;
  const ref = /\.cursor\//.test(file)
    ? `\`\${env:${name}}\``
    : /\.vscode\//.test(file)
      ? `\`\${input:${name.toLowerCase()}}\` with a matching \`inputs\` entry \`{ "type": "promptString", "id": "${name.toLowerCase()}", "password": true }\``
      : `\`\${${name}}\``;
  return `In ${file}, replace the literal at \`${path}\` with ${ref} and keep the real value only in an untracked \`.env\` / your shell. The value is in git history: rotate it in the vendor dashboard first.`;
}

export const mcp01HardcodedCreds = defineRule(
  { id: "MCP-01", pillar: "SECURITY", severity: "CRITICAL", title: "Hardcoded Credentials in Agent / MCP Config" },
  (ctx, emit) => {
    for (const cfg of agentConfigs(ctx)) {
      const found = new Set<string>();
      const report = (path: string, what: string, secret: string, severity?: "CRITICAL" | "HIGH") => {
        if (found.has(secret)) return;
        found.add(secret);
        const at = cfg.text.indexOf(secret);
        emit({
          file: cfg.file,
          line: at >= 0 ? lineAt(cfg.text, at) : 1,
          severity,
          evidence: `${path}: ${what} ${/:\/\//.test(secret) ? redactUrl(secret) : redact(secret)}`,
          impact: `A ${what} is committed in ${cfg.file}. Every clone, fork and agent session that reads this config gets the credential, and MCP configs are routinely pasted into issues and shared setups.`,
          agentRemediationPrompt: fixFor(cfg.file, path),
        });
      };
      for (const { path, key, value } of stringLeaves(cfg.json)) {
        const literal = value.replace(ENV_REF_RE, " ");
        const hit = SECRET_PATTERNS.find((p) => p.re.test(literal));
        if (hit) {
          report(path, hit.name, literal.match(hit.re)![0], hit.severity);
          continue;
        }
        if (!key || !SECRET_KEY_RE.test(key)) continue;
        const v = literal.replace(/^\s*(?:Bearer|Basic|Token)\s+/i, "").trim();
        // URLs and paths aren't credentials (a URL with an inline password matches a SECRET_PATTERN above).
        if (v.length < 16 || /\s|^[a-z][\w+.-]*:\/\/|^[./~]/i.test(v) || SECRET_PLACEHOLDER_RE.test(v) || shannonEntropy(v) < 3.5) continue;
        report(path, `high-entropy literal in \`${key}\` (${shannonEntropy(v).toFixed(2)} bits/char)`, v);
      }
    }
  },
);
