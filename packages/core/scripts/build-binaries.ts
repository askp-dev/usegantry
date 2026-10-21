// Cross-compiles the standalone `gantry` binary for every installer target and writes dist/SHA256SUMS.
// Standalone binaries have no Go/Rust coverage (the optional ast-grep grammars aren't bundled; handoff quirk 37).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TARGETS = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"] as const;
const root = join(import.meta.dir, "..");
const dist = join(root, "dist");
mkdirSync(dist, { recursive: true });
const sums: string[] = [];
for (const t of TARGETS) {
  const out = join(dist, `gantry-${t}`);
  const p = Bun.spawnSync(["bun", "build", "--compile", "--minify", `--target=bun-${t}`, "./src/bin/cli.ts", "--outfile", out], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (p.exitCode !== 0) throw new Error(`build failed for ${t}`);
  sums.push(`${createHash("sha256").update(readFileSync(out)).digest("hex")}  gantry-${t}`);
}
writeFileSync(join(dist, "SHA256SUMS"), `${sums.join("\n")}\n`);
console.log(sums.join("\n"));
