import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRepoContext } from "../src/context/builder";
import { fingerprint, isGitIgnored, isSuppressed, makeFinding, openingTags, redact, redactUrl } from "../src/rules/helpers";
import { nearestTopPackage } from "../src/rules/legal/leg-01-slopsquatting";
import { isCopyleft } from "../src/rules/legal/leg-02-copyleft-eula";
import { sec06GitSecrets } from "../src/rules/security/sec-06-git-secrets";
import { scanDiff } from "../src/workers/git-history";

const tmp = () => mkdtempSync(join(tmpdir(), "gantry-test-"));
const write = (root: string, files: Record<string, string>) => {
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), c);
  }
};
// Built at runtime so this test file never contains a scannable secret.
const FAKE_STRIPE = ["sk", "live", "51Hx9TestOnlyAbCdEfGhIjKlMnOpQr"].join("_");

describe("makeFinding", () => {
  const meta = { id: "SEC-99", pillar: "SECURITY" as const, severity: "HIGH" as const, title: "t" };
  const base = { file: "a.ts", line: 3, evidence: "x  =  1", impact: "i", agentRemediationPrompt: "p" };
  test("HIGH blocks only in strict mode, CRITICAL always", () => {
    expect(makeFinding(meta, base).blocking).toBe(false);
    expect(makeFinding(meta, base, true).blocking).toBe(true);
    expect(makeFinding(meta, { ...base, severity: "CRITICAL" }).blocking).toBe(true);
    expect(makeFinding(meta, { ...base, severity: "MEDIUM" }, true).blocking).toBe(false);
  });
  test("fingerprint is whitespace-insensitive and file-sensitive", () => {
    expect(fingerprint("R", "a.ts", "x  = 1")).toBe(fingerprint("R", "a.ts", "x = 1"));
    expect(fingerprint("R", "a.ts", "x")).not.toBe(fingerprint("R", "b.ts", "x"));
  });
});

describe("suppression", () => {
  test("inline comment on same/previous line and config.ignoreRules", async () => {
    const root = tmp();
    write(root, { "a.ts": "const a = 1;\n// gantry-ignore SEC-03, SEC-07\nconst b = 2; // gantry-ignore FIN-03\nconst c = 3;\n" });
    const ctx = await buildRepoContext(root, { config: { offline: true, ignoreRules: ["OPS-04"] } });
    const f = (ruleId: string, line: number) => ({
      ...makeFinding(
        { id: ruleId, pillar: "SECURITY", severity: "HIGH", title: "" },
        { file: "a.ts", line, evidence: "e", impact: "", agentRemediationPrompt: "" },
      ),
    });
    expect(isSuppressed(ctx, f("SEC-03", 3))).toBe(true);
    expect(isSuppressed(ctx, f("SEC-07", 3))).toBe(true);
    expect(isSuppressed(ctx, f("FIN-03", 3))).toBe(true);
    expect(isSuppressed(ctx, f("SEC-01", 3))).toBe(false);
    expect(isSuppressed(ctx, f("FIN-03", 4))).toBe(true); // previous line (3) names FIN-03…
    expect(isSuppressed(ctx, f("SEC-03", 4))).toBe(false); // …but not SEC-03
    expect(isSuppressed(ctx, f("SEC-03", 1))).toBe(false);
    expect(isSuppressed(ctx, f("OPS-04", 1))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  test("legacy preflight-ignore still suppresses (one-release compat)", async () => {
    const root = tmp();
    write(root, { "a.ts": "const a = 1; // preflight-ignore SEC-03\n" });
    const ctx = await buildRepoContext(root, { config: { offline: true } });
    const f = makeFinding(
      { id: "SEC-03", pillar: "SECURITY", severity: "HIGH", title: "" },
      { file: "a.ts", line: 1, evidence: "e", impact: "", agentRemediationPrompt: "" },
    );
    expect(isSuppressed(ctx, f)).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("text helpers", () => {
  test("redaction keeps only a short prefix", () => {
    expect(redact(FAKE_STRIPE)).not.toContain(FAKE_STRIPE.slice(10));
    expect(redactUrl("postgresql://postgres:hunter2pw@db.x.supabase.co:5432/postgres")).toBe("postgresql://postgres:****@db.x.supabase.co:5432/postgres");
  });
  test("openingTags is brace-aware (arrow functions inside attributes)", () => {
    const tags = openingTags(`<div onClick={() => go({ a: 1 })} className="x">hi</div><img src="/a.png" />`, /^(div|img)$/);
    expect(tags.map((t) => t.tag)).toEqual(["div", "img"]);
    expect(tags[0].attrs).toContain("className");
  });
  test("SPDX OR expressions pass when any option is permissive", () => {
    expect(isCopyleft("GPL-3.0-or-later")).toBe(true);
    expect(isCopyleft("AGPL-3.0-only")).toBe(true);
    expect(isCopyleft("(MIT OR GPL-3.0)")).toBe(false);
    expect(isCopyleft("(MPL-2.0 OR Apache-2.0)")).toBe(false);
    expect(isCopyleft("LGPL-2.1")).toBe(false);
    expect(isCopyleft("MIT AND GPL-2.0")).toBe(true);
    expect(isCopyleft("CC-BY-NC-4.0")).toBe(true);
  });
  test("typosquat detection ignores short names and exact matches", () => {
    expect(nearestTopPackage("npm", "axois")).toBe("axios");
    expect(nearestTopPackage("npm", "axios")).toBeNull();
    expect(nearestTopPackage("npm", "zox")).toBeNull();
  });
  test("gitignore matching", async () => {
    const root = tmp();
    write(root, { ".gitignore": ".env*\n!.env.example\n/build/\n", ".env.local": "A=1", ".env.example": "A=", "build/x.js": "" });
    const ctx = await buildRepoContext(root, { config: { offline: true } });
    expect(isGitIgnored(ctx, ".env.local")).toBe(true);
    expect(isGitIgnored(ctx, ".env.example")).toBe(false);
    expect(isGitIgnored(ctx, "src/a.ts")).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("SEC-06 git history", () => {
  test("scanDiff finds secrets only on added lines", () => {
    const diff = `commit abcdef1234567890\ndiff --git a/x.ts b/x.ts\n+++ b/x.ts\n-const old = "${FAKE_STRIPE}";\n+const k = "${FAKE_STRIPE}";\n`;
    const hits = scanDiff(diff);
    expect(hits.length).toBe(1);
    expect(hits[0]).toMatchObject({ file: "x.ts", commit: "abcdef123456", patternId: "stripe-live-secret" });
  });
  test("worker finds a key deleted from the working tree but still in history", async () => {
    const root = tmp();
    const git = (...a: string[]) => execFileSync("git", ["-C", root, ...a], { stdio: "ignore" });
    write(root, { "config.ts": `export const key = "${FAKE_STRIPE}";\n` });
    git("init", "-q");
    git("-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", "add", ".");
    git("-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", "commit", "-qm", "add key");
    write(root, { "config.ts": "export const key = process.env.STRIPE_SECRET_KEY;\n" });
    const ctx = await buildRepoContext(root, { config: { offline: true } });
    const fs = await sec06GitSecrets.run(ctx);
    expect(fs.length).toBe(1);
    expect(fs[0].evidence).toContain("added in commit");
    expect(fs[0].evidence).not.toContain(FAKE_STRIPE);
    rmSync(root, { recursive: true, force: true });
  });
});
