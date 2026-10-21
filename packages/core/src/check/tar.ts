/**
 * Minimal, defensive ustar/pax reader for GitHub tarballs (zero deps).
 * Only regular files are written; symlinks, hardlinks and devices are skipped, and any path that
 * would escape `dest` (absolute, `..`) is rejected, so a hostile tarball can't write outside the temp dir.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";

export class TarLimitError extends Error {}

export interface ExtractResult {
  files: number;
  bytes: number;
  /** `comment=` from GitHub's pax global header: the commit sha. */
  commit?: string;
}

const str = (b: Uint8Array, off: number, len: number) => {
  const s = b.subarray(off, off + len);
  const end = s.indexOf(0);
  return new TextDecoder().decode(end < 0 ? s : s.subarray(0, end));
};
const octal = (b: Uint8Array, off: number, len: number) => Number.parseInt(str(b, off, len).trim() || "0", 8);

function paxRecords(body: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  const text = new TextDecoder().decode(body);
  let i = 0;
  while (i < text.length) {
    const sp = text.indexOf(" ", i);
    const len = Number.parseInt(text.slice(i, sp), 10);
    if (!(len > 0) || sp < 0) break;
    const rec = text.slice(sp + 1, i + len - 1);
    const eq = rec.indexOf("=");
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    i += len;
  }
  return out;
}

/** Strips the first path component (GitHub's `owner-repo-sha/`) and returns a safe relative path, or null. */
export function safeRelPath(name: string): string | null {
  if (/^([\\/]|[A-Za-z]:)/.test(name)) return null; // absolute paths are hostile, not "relative to the top dir"
  const parts = name.replace(/\\/g, "/").split("/").slice(1).filter(Boolean);
  if (!parts.length || parts.some((p) => p === ".." || p === ".")) return null;
  const rel = normalize(parts.join("/"));
  return rel.startsWith("..") || rel.startsWith(sep) ? null : rel;
}

export function extractTar(tar: Uint8Array, dest: string, limits: { maxFiles: number; maxBytes: number }): ExtractResult {
  const res: ExtractResult = { files: 0, bytes: 0 };
  let off = 0;
  let longName: string | undefined;
  let pax: Record<string, string> = {};
  while (off + 512 <= tar.length) {
    const h = tar.subarray(off, off + 512);
    if (h.every((x) => x === 0)) break;
    const size = octal(h, 124, 12);
    const type = String.fromCharCode(h[156] || 48);
    const body = tar.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === "g") {
      const g = paxRecords(body);
      if (g.comment && /^[0-9a-f]{40}$/.test(g.comment)) res.commit = g.comment;
      continue;
    }
    if (type === "x") {
      pax = paxRecords(body);
      continue;
    }
    if (type === "L") {
      longName = str(body, 0, body.length);
      continue;
    }
    const prefix = str(h, 345, 155);
    const name = pax.path ?? longName ?? (prefix ? `${prefix}/${str(h, 0, 100)}` : str(h, 0, 100));
    pax = {};
    longName = undefined;
    if (type !== "0" && type !== "\0" && type !== "7") continue; // dirs are implied; links/devices skipped
    const rel = safeRelPath(name);
    if (!rel) continue;
    res.files++;
    res.bytes += size;
    if (res.files > limits.maxFiles) throw new TarLimitError(`repository has more than ${limits.maxFiles} files`);
    if (res.bytes > limits.maxBytes) throw new TarLimitError(`repository is larger than ${Math.round(limits.maxBytes / 1e6)} MB unpacked`);
    const out = join(dest, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, body);
  }
  return res;
}
