/// <reference lib="webworker" />
/**
 * Scans `git log -p -50` for vendor secrets added in recent history. Runs off the main thread
 * so the regex sweep over large diffs doesn't stall the other rules.
 * in:  { root: string; timeoutMs: number }
 * out: { hits: GitSecretHit[]; error?: string }
 */
import { SECRET_PATTERNS } from "../context/patterns";

export interface GitSecretHit {
  commit: string;
  file: string;
  patternId: string;
  name: string;
  match: string;
  severity: "CRITICAL" | "HIGH";
}

declare const self: Worker;

self.onmessage = async (e: MessageEvent<{ root: string; timeoutMs: number }>) => {
  const { root, timeoutMs } = e.data;
  try {
    const proc = Bun.spawn(["git", "-C", root, "log", "-p", "-50", "--no-color", "--unified=0", "--no-ext-diff", "--format=commit %H"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    const out = await new Response(proc.stdout).text();
    clearTimeout(timer);
    self.postMessage({ hits: scanDiff(out) });
  } catch (err) {
    self.postMessage({ hits: [], error: String(err) });
  }
};

export function scanDiff(diff: string): GitSecretHit[] {
  const hits: GitSecretHit[] = [];
  const seen = new Set<string>();
  let commit = "";
  let file = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("commit ")) commit = line.slice(7, 19);
    else if (line.startsWith("+++ ")) file = line.replace(/^\+\+\+ (b\/)?/, "");
    else if (line.startsWith("+") && line.length > 12) {
      for (const p of SECRET_PATTERNS) {
        const m = p.re.exec(line);
        if (!m || seen.has(m[0])) continue;
        seen.add(m[0]);
        hits.push({ commit, file, patternId: p.id, name: p.name, match: m[0], severity: p.severity ?? "CRITICAL" });
      }
    }
  }
  return hits;
}
