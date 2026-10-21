/**
 * `gantry check|roast <github-url>`: download a repo snapshot for a static, offline scan.
 * SSRF-safe by construction: only `github.com/<owner>/<repo>[/tree/<ref>]` is accepted, requests go only to
 * api.github.com, and redirects are followed only to codeload.github.com. No clone, no installs, no scripts.
 * A token (GITHUB_TOKEN / GH_TOKEN / `gh auth token`) is sent only in the Authorization header to
 * api.github.com and is scrubbed from every error message.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { extractTar } from "./tar";

export const LIMITS = { maxDownloadBytes: 50e6, maxUnpackedBytes: 250e6, maxFiles: 20_000, timeoutMs: 60_000 };
const API = "api.github.com";
const REDIRECT_HOSTS = new Set(["codeload.github.com"]);
const NAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/;
const REF_RE = /^[A-Za-z0-9._/-]{1,200}$/;

export class CheckInputError extends Error {}

export interface RepoTarget {
  kind: "github" | "local";
  owner: string;
  name: string;
  ref?: string;
  path?: string;
}

/** Parses a GitHub URL (or `owner/repo` is *not* accepted: it's ambiguous with a local path) or a local directory. */
export function parseTarget(input: string, cwd = process.cwd()): RepoTarget {
  if (/^(https?:)?\/\//i.test(input) || /^github\.com\//i.test(input)) {
    // Reject dot segments before URL() silently normalises them away.
    if (/(^|[/\\])(\.|%2e){2}([/\\?#]|$)/i.test(input)) throw new CheckInputError("Expected https://github.com/<owner>/<repo>[/tree/<ref>].");
    let u: URL;
    try {
      u = new URL(/^github\.com\//i.test(input) ? `https://${input}` : input);
    } catch {
      throw new CheckInputError("Not a valid URL.");
    }
    if (u.protocol !== "https:" || u.hostname.toLowerCase() !== "github.com" || u.port || u.username || u.password)
      throw new CheckInputError("Only https://github.com/<owner>/<repo> URLs are supported.");
    const [owner, rawName, tree, ...refParts] = u.pathname.split("/").filter(Boolean);
    const name = rawName?.replace(/\.git$/, "");
    if (!owner || !name || !NAME_RE.test(owner) || !NAME_RE.test(name) || name === "." || name === "..")
      throw new CheckInputError("Expected https://github.com/<owner>/<repo>[/tree/<ref>].");
    if (tree !== undefined && (tree !== "tree" || !refParts.length)) throw new CheckInputError("Expected https://github.com/<owner>/<repo>[/tree/<ref>].");
    const ref = refParts.length ? decodeURIComponent(refParts.join("/")) : undefined;
    if (ref !== undefined && (!REF_RE.test(ref) || ref.split("/").includes(".."))) throw new CheckInputError("Unsupported branch/tag name.");
    return { kind: "github", owner, name, ref };
  }
  const path = resolve(cwd, input);
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new CheckInputError(`${input} is neither a GitHub URL nor a directory.`);
  return { kind: "local", owner: "", name: basename(path), path };
}

/** GITHUB_TOKEN / GH_TOKEN, else `gh auth token` if the GitHub CLI is installed and logged in. */
export function resolveToken(env = process.env): string | undefined {
  const t = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (t) return t.trim();
  try {
    const r = spawnSync("gh", ["auth", "token"], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
    const out = r.status === 0 ? r.stdout.trim() : "";
    return out || undefined;
  } catch {
    return undefined;
  }
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface Snapshot {
  dir: string;
  sha: string;
  files: number;
  cleanup: () => void;
}

/**
 * GET that follows redirects by hand: api.github.com (with token) → codeload.github.com (never with token).
 * Any other host aborts the download.
 */
async function guardedGet(url: string, token: string | undefined, accept: string, signal: AbortSignal, fetchImpl: Fetch): Promise<Response> {
  let current = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    const isApi = current.hostname === API;
    if (current.protocol !== "https:" || (!isApi && !REDIRECT_HOSTS.has(current.hostname)))
      throw new CheckInputError(`Refusing to follow a redirect to ${current.hostname}.`);
    const headers: Record<string, string> = { Accept: accept, "User-Agent": "gantry-cli", "X-GitHub-Api-Version": "2022-11-28" };
    if (token && isApi) headers.Authorization = `Bearer ${token}`;
    const res = await fetchImpl(current.toString(), { headers, redirect: "manual", signal });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new CheckInputError("GitHub sent a redirect without a location.");
      current = new URL(loc, current);
      continue;
    }
    return res;
  }
  throw new CheckInputError("Too many redirects.");
}

async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > max) throw new CheckInputError(`Repository archive is larger than ${max / 1e6} MB.`);
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw new CheckInputError(`Repository archive is larger than ${max / 1e6} MB.`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

const httpError = (status: number, t: RepoTarget, authed: boolean) =>
  new CheckInputError(
    status === 404
      ? `github.com/${t.owner}/${t.name}${t.ref ? ` @ ${t.ref}` : ""} not found${authed ? "" : " (private? set GITHUB_TOKEN or run `gh auth login`)"}.`
      : status === 403 || status === 429
        ? "GitHub rate limit or access denied. Set GITHUB_TOKEN or run `gh auth login`, then retry."
        : `GitHub returned HTTP ${status}.`,
  );

/** Downloads `target` into a fresh temp dir. The caller must call `cleanup()`. */
export async function fetchSnapshot(target: RepoTarget, opts: { token?: string; fetchImpl?: Fetch; limits?: Partial<typeof LIMITS> } = {}): Promise<Snapshot> {
  if (target.kind !== "github") throw new CheckInputError("fetchSnapshot needs a GitHub target.");
  const lim = { ...LIMITS, ...opts.limits };
  const token = opts.token;
  const fetchImpl = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const scrub = (m: string) => (token ? m.split(token).join("***") : m);
  const signal = AbortSignal.timeout(lim.timeoutMs);
  const dir = mkdtempSync(join(tmpdir(), "gantry-check-"));
  const cleanup = () => rmSync(dir, { recursive: true, force: true });
  try {
    const base = `https://${API}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.name)}`;
    const ref = encodeURIComponent(target.ref ?? "HEAD");
    const shaRes = await guardedGet(`${base}/commits/${ref}`, token, "application/vnd.github.sha", signal, fetchImpl);
    if (!shaRes.ok) throw httpError(shaRes.status, target, !!token);
    const sha = (await shaRes.text()).trim();
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new CheckInputError("GitHub returned an unexpected commit id.");
    const tarRes = await guardedGet(`${base}/tarball/${sha}`, token, "application/vnd.github+json", signal, fetchImpl);
    if (!tarRes.ok) throw httpError(tarRes.status, target, !!token);
    const gz = await readCapped(tarRes, lim.maxDownloadBytes);
    let tar: Uint8Array;
    try {
      tar = gunzipSync(gz, { maxOutputLength: lim.maxUnpackedBytes + 1e6 });
    } catch (e) {
      throw new CheckInputError(
        /RangeError|buffer|length/i.test(String(e))
          ? `Repository is larger than ${lim.maxUnpackedBytes / 1e6} MB unpacked.`
          : "Archive is not a valid gzip file.",
      );
    }
    const { files } = extractTar(tar, dir, { maxFiles: lim.maxFiles, maxBytes: lim.maxUnpackedBytes });
    return { dir, sha, files, cleanup };
  } catch (e) {
    cleanup();
    const msg =
      e instanceof Error && e.name === "TimeoutError" ? `Download took longer than ${lim.timeoutMs / 1000} s.` : e instanceof Error ? e.message : String(e);
    throw new CheckInputError(scrub(msg));
  }
}
