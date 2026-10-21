import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { shannonEntropy } from "../../context/code-index";
import { SECRET_NAME_RE, SECRET_PATTERNS } from "../../context/patterns";
import type { RepoContext } from "../../context/types";
import { type GitSecretHit, scanGitHistory } from "../../workers/git-history";
import { defineRule, type Emit, isGitIgnored, lineAt, redact, redactUrl } from "../helpers";

const SKIP_FILE =
  /(^|\/)(bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|Cargo\.lock|composer\.lock)$|\.(png|jpe?g|gif|webp|ico|svg|pdf|woff2?|ttf|otf|zip|gz|sqlite|db|wasm|mp4|mp3|map|min\.js)$/i;
const NAMED_LITERAL =
  /\b([\w]*(?:secret|token|api_?key|apikey|password|passwd|private_?key|auth_?key|signing_?key)[\w]*)["']?\s*[:=]\s*["'`]([A-Za-z0-9+/_\-=.~]{20,})["'`]/gi;
const PLACEHOLDER = /your|xxx|example|changeme|placeholder|dummy|sample|test_?key|<|\.\.\./i;
export const GIT_SCAN_TIMEOUT_MS = 1500;

const fix = (what: string, file: string) =>
  `Rotate the ${what} in the vendor dashboard now (assume it's compromised). Replace the literal in ${file} with \`process.env.<NAME>\`, put the real value only in an untracked \`.env.local\`, add \`.env*\` and \`!.env.example\` to .gitignore, and purge history with \`git filter-repo --replace-text\`.`;

const WORKER_URL = new URL("../../workers/git-entropy.worker.ts", import.meta.url);

function gitHistory(root: string): Promise<GitSecretHit[]> {
  if (!existsSync(join(root, ".git"))) return Promise.resolve([]);
  // A `bun build --compile` binary has no worker file on disk: scan in-process rather than skip history.
  const inProcess = () => scanGitHistory(root, GIT_SCAN_TIMEOUT_MS).catch(() => []);
  if (WORKER_URL.protocol !== "file:" || !existsSync(fileURLToPath(WORKER_URL))) return inProcess();
  return new Promise((resolve) => {
    let w: Worker;
    try {
      w = new Worker(WORKER_URL.href);
    } catch {
      return resolve(inProcess());
    }
    const done = (hits: GitSecretHit[]) => {
      clearTimeout(t);
      w.terminate();
      resolve(hits);
    };
    // Hard cap so the 3s SLA holds even on huge histories.
    const t = setTimeout(() => done([]), GIT_SCAN_TIMEOUT_MS + 300);
    w.onmessage = (e) => done(e.data?.hits ?? []);
    w.onerror = () => done([]);
    w.postMessage({ root, timeoutMs: GIT_SCAN_TIMEOUT_MS });
  });
}

function scanTree(ctx: RepoContext, emit: Emit, found: Set<string>) {
  for (const file of ctx.files.all) {
    if (SKIP_FILE.test(file)) continue;
    const isEnv = ctx.files.envFiles.includes(file);
    // Real secrets in an untracked .env file are exactly where they belong.
    if (isEnv && isGitIgnored(ctx, file)) continue;
    const text = ctx.getText(file);
    if (!text || text.includes("\0")) continue;
    for (const p of SECRET_PATTERNS) {
      const re = new RegExp(p.re.source, p.re.flags.includes("g") ? p.re.flags : `${p.re.flags}g`);
      for (const m of text.matchAll(re)) {
        if (found.has(m[0])) continue;
        found.add(m[0]);
        const line = lineAt(text, m.index!);
        emit({
          file,
          line,
          severity: p.severity ?? "CRITICAL",
          evidence: `${p.name}: ${p.id === "db-url-password" ? redactUrl(m[0]) : redact(m[0])}${isEnv ? ` (${file} is not git-ignored)` : ""}`,
          impact: `A ${p.name} is committed in plain text. Anyone with repo access (or a leaked clone, CI log or npm tarball) can use it to bill, read or destroy your account.`,
          agentRemediationPrompt: fix(p.name, file),
        });
      }
    }
    const candidates: Array<[string, string, number]> = [];
    if (isEnv) {
      for (const e of ctx.env.filter((x) => x.file === file)) if (SECRET_NAME_RE.test(e.key)) candidates.push([e.key, e.value, e.line]);
    } else {
      for (const m of text.matchAll(NAMED_LITERAL)) candidates.push([m[1], m[2], lineAt(text, m.index!)]);
    }
    for (const [name, value, line] of candidates) {
      if (value.length < 16 || found.has(value) || PLACEHOLDER.test(value) || shannonEntropy(value) < (isEnv ? 3.5 : 4.0)) continue;
      if ([...found].some((f) => f.includes(value) || value.includes(f))) continue;
      found.add(value);
      emit({
        file,
        line,
        evidence: `${name} = ${redact(value)} (Shannon entropy ${shannonEntropy(value).toFixed(2)} bits/char)`,
        impact: `\`${name}\` holds a high-entropy literal that looks like a live credential, committed to the repo.`,
        agentRemediationPrompt: fix(`credential in \`${name}\``, file),
      });
    }
  }
}

export const sec06GitSecrets = defineRule(
  { id: "SEC-06", pillar: "SECURITY", severity: "CRITICAL", title: "Leaked Secrets in Working Tree or Git Commit History" },
  async (ctx, emit) => {
    const history = gitHistory(ctx.rootDir); // starts the worker while we scan the tree
    const found = new Set<string>();
    scanTree(ctx, emit, found);
    for (const h of await history) {
      if (found.has(h.match)) continue;
      found.add(h.match);
      emit({
        file: h.file,
        line: 1,
        severity: h.severity,
        evidence: `${h.name} added in commit ${h.commit}: ${h.patternId === "db-url-password" ? redactUrl(h.match) : redact(h.match)}`,
        impact: `A ${h.name} is in git history (commit ${h.commit}). Deleting it from the working tree doesn't remove it from clones or forks.`,
        agentRemediationPrompt: fix(h.name, h.file),
      });
    }
  },
);
