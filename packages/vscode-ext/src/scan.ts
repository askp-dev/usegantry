import { spawn } from "node:child_process";
import type { AuditReport, Finding } from "../../core/src/context/types";

export type { AuditReport, Finding };

/**
 * Runs `preflight scan <root> --json --offline`. Exit 1 only means "blockers found", so any run that
 * printed a report is a success; anything else surfaces stderr.
 */
export function runScan(command: string[], root: string, timeoutMs = 30_000): Promise<AuditReport> {
  const [bin, ...pre] = command;
  if (!bin) return Promise.reject(new Error("preflight.command is empty"));
  return new Promise((resolve, reject) => {
    const child = spawn(bin, [...pre, "scan", root, "--json", "--offline"], { cwd: root, shell: false, timeout: timeoutMs });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0 && code !== 1) return reject(new Error(err.trim() || `preflight exited with ${code}`));
      try {
        resolve(JSON.parse(out) as AuditReport);
      } catch {
        reject(new Error(`preflight printed no JSON report${err ? `: ${err.trim()}` : ""}`));
      }
    });
  });
}
