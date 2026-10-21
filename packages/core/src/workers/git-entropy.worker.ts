/// <reference lib="webworker" />
/**
 * Runs the git-history secret scan off the main thread so the regex sweep over large diffs
 * doesn't stall the other rules.
 * in:  { root: string; timeoutMs: number }
 * out: { hits: GitSecretHit[]; error?: string }
 */
import { scanGitHistory } from "./git-history";

declare const self: Worker;

self.onmessage = async (e: MessageEvent<{ root: string; timeoutMs: number }>) => {
  try {
    self.postMessage({ hits: await scanGitHistory(e.data.root, e.data.timeoutMs) });
  } catch (err) {
    self.postMessage({ hits: [], error: String(err) });
  }
};
