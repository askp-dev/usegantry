import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { toRoast } from "../src/check/card";
import { CheckInputError, fetchSnapshot, parseTarget } from "../src/check/fetch";
import { renderCheckMarkdown, renderCheckText } from "../src/check/report";
import { CLEAN_LINES, FOOTER, RULE_LINES, VERDICT } from "../src/check/roast-lines";
import { scrubSecrets, toCheck, toRoastInput } from "../src/check/summary";
import { extractTar, safeRelPath, TarLimitError } from "../src/check/tar";
import { buildRepoContext } from "../src/context/builder";
import type { AuditReport, RepoContext } from "../src/context/types";
import { runAudit } from "../src/engine";

const ROOT = join(import.meta.dir, "../../..");
const VULN = join(ROOT, "fixtures/vulnerable-saas");
const CLEAN = join(ROOT, "fixtures/clean-saas");
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "gantry-check-test-"));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

// ── tiny ustar writer (test-only) ────────────────────────────────────────────
function tarEntry(name: string, data: string | Uint8Array, type = "0", extra: { linkname?: string } = {}): Uint8Array {
  const body = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const h = new Uint8Array(512);
  const put = (s: string, off: number, len: number) => h.set(new TextEncoder().encode(s).subarray(0, len), off);
  put(name, 0, 100);
  put("0000644\0", 100, 8);
  put("0000000\0", 108, 8);
  put("0000000\0", 116, 8);
  put(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12);
  put("00000000000\0", 136, 12);
  put(type, 156, 1);
  if (extra.linkname) put(extra.linkname, 157, 100);
  put("ustar\0", 257, 6);
  put("00", 263, 2);
  put("        ", 148, 8);
  const sum = h.reduce((a, b) => a + b, 0);
  put(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8);
  const padded = new Uint8Array(Math.ceil(body.length / 512) * 512);
  padded.set(body);
  const out = new Uint8Array(512 + padded.length);
  out.set(h);
  out.set(padded, 512);
  return out;
}
const pax = (records: Record<string, string>) =>
  Object.entries(records)
    .map(([k, v]) => {
      const rec = ` ${k}=${v}\n`;
      let len = rec.length + 1;
      while (`${len}${rec}`.length !== len) len = `${len}${rec}`.length;
      return `${len}${rec}`;
    })
    .join("");
const tarOf = (...entries: Uint8Array[]) => {
  const total = entries.reduce((a, e) => a + e.length, 0) + 1024;
  const out = new Uint8Array(total);
  let o = 0;
  for (const e of entries) {
    out.set(e, o);
    o += e.length;
  }
  return out;
};

const SHA = "a".repeat(40);
const TOKEN = "ghp_testtoken1234567890abcdefghijklmnopqr";

describe("parseTarget allowlist", () => {
  test("accepts github.com repo and tree URLs", () => {
    expect(parseTarget("https://github.com/acme/app")).toMatchObject({ kind: "github", owner: "acme", name: "app", ref: undefined });
    expect(parseTarget("https://github.com/acme/app.git")).toMatchObject({ name: "app" });
    expect(parseTarget("github.com/acme/app/tree/feature/x")).toMatchObject({ ref: "feature/x" });
  });
  test("rejects everything else (SSRF)", () => {
    for (const bad of [
      "http://github.com/acme/app",
      "https://gitlab.com/acme/app",
      "https://github.com.evil.com/acme/app",
      "https://api.github.com/repos/acme/app",
      "https://user:pw@github.com/acme/app",
      "https://github.com:8443/acme/app",
      "https://github.com/acme",
      "https://github.com/acme/app/blob/main/x.ts",
      "https://github.com/acme/app/tree/../../x",
      "https://169.254.169.254/latest/meta-data",
      "file:///etc/passwd",
    ])
      expect(() => parseTarget(bad)).toThrow(CheckInputError);
  });
  test("local directories pass through; missing paths don't", () => {
    expect(parseTarget(VULN)).toMatchObject({ kind: "local", name: "vulnerable-saas" });
    expect(() => parseTarget(join(VULN, "does-not-exist"))).toThrow(CheckInputError);
  });
});

describe("tar extraction", () => {
  test("strips the top dir, honours pax paths and skips links/traversal", () => {
    const dest = tmp();
    const long = `acme-app-abc/${"d/".repeat(60)}deep.ts`;
    const res = extractTar(
      tarOf(
        tarEntry("pax_global_header", pax({ comment: SHA }), "g"),
        tarEntry("acme-app-abc/", "", "5"),
        tarEntry("acme-app-abc/src/a.ts", "export const a = 1;\n"),
        tarEntry("PaxHeader", pax({ path: long }), "x"),
        tarEntry("ignored-name", "deep\n"),
        tarEntry("acme-app-abc/link", "", "2", { linkname: "/etc/passwd" }),
        tarEntry("acme-app-abc/../../escape.ts", "nope"),
        tarEntry("/abs.ts", "nope"),
      ),
      dest,
      { maxFiles: 100, maxBytes: 1e6 },
    );
    expect(res.commit).toBe(SHA);
    expect(readFileSync(join(dest, "src/a.ts"), "utf8")).toContain("export const a");
    expect(existsSync(join(dest, `${"d/".repeat(60)}deep.ts`))).toBe(true);
    expect(existsSync(join(dest, "link"))).toBe(false);
    expect(existsSync(join(dest, "../escape.ts"))).toBe(false);
    expect(res.files).toBe(2);
    expect(safeRelPath("x/../../a")).toBeNull();
  });
  test("file and size caps", () => {
    const many = tarOf(...Array.from({ length: 5 }, (_, i) => tarEntry(`r/f${i}.ts`, "x")));
    expect(() => extractTar(many, tmp(), { maxFiles: 3, maxBytes: 1e6 })).toThrow(TarLimitError);
    expect(() => extractTar(tarOf(tarEntry("r/big", "x".repeat(2000))), tmp(), { maxFiles: 10, maxBytes: 1000 })).toThrow(TarLimitError);
  });
});

describe("fetchSnapshot", () => {
  const tarball = gzipSync(tarOf(tarEntry("acme-app-aaaaaaa/index.ts", "export {};\n"), tarEntry("acme-app-aaaaaaa/package.json", '{"name":"app"}')));
  const calls: Array<{ url: string; auth?: string; redirect?: string }> = [];
  const github =
    (opts: { redirectTo?: string; tar?: Uint8Array; shaStatus?: number } = {}) =>
    async (url: string, init: RequestInit) => {
      const h = init.headers as Record<string, string>;
      calls.push({ url, auth: h.Authorization, redirect: init.redirect as string });
      const u = new URL(url);
      if (u.hostname === "api.github.com" && u.pathname.includes("/commits/")) return new Response(SHA, { status: opts.shaStatus ?? 200 });
      if (u.hostname === "api.github.com" && u.pathname.includes("/tarball/"))
        return new Response(null, {
          status: 302,
          headers: { location: opts.redirectTo ?? `https://codeload.github.com/acme/app/legacy.tar.gz/${SHA}?token=tmp` },
        });
      if (u.hostname === "codeload.github.com") return new Response((opts.tar ?? tarball) as unknown as BodyInit);
      return new Response("nope", { status: 500 });
    };
  const target = parseTarget("https://github.com/acme/app");

  test("downloads via api.github.com → codeload, token only on the API host", async () => {
    calls.length = 0;
    const snap = await fetchSnapshot(target, { token: TOKEN, fetchImpl: github() });
    try {
      expect(snap.sha).toBe(SHA);
      expect(snap.files).toBe(2);
      expect(readFileSync(join(snap.dir, "index.ts"), "utf8")).toBe("export {};\n");
    } finally {
      snap.cleanup();
    }
    expect(existsSync(snap.dir)).toBe(false);
    for (const c of calls) {
      expect(c.redirect).toBe("manual");
      expect(c.url).not.toContain(TOKEN);
      if (new URL(c.url).hostname === "api.github.com") expect(c.auth).toBe(`Bearer ${TOKEN}`);
      else expect(c.auth).toBeUndefined();
    }
    expect(calls.some((c) => c.url.includes(`/tarball/${SHA}`))).toBe(true);
  });

  test("refuses redirects to other hosts and caps the download", async () => {
    await expect(fetchSnapshot(target, { fetchImpl: github({ redirectTo: "https://evil.example/x.tgz" }) })).rejects.toThrow(/Refusing to follow a redirect/);
    await expect(fetchSnapshot(target, { fetchImpl: github({ redirectTo: "http://codeload.github.com/x" }) })).rejects.toThrow(/Refusing/);
    await expect(fetchSnapshot(target, { fetchImpl: github(), limits: { maxDownloadBytes: 10 } })).rejects.toThrow(/larger than/);
  });

  test("errors never contain the token", async () => {
    const leaky = async () => {
      throw new Error(`boom ${TOKEN}`);
    };
    const err = (await fetchSnapshot(target, { token: TOKEN, fetchImpl: leaky }).catch((e) => e)) as Error;
    expect(err).toBeInstanceOf(CheckInputError);
    expect(err.message).not.toContain(TOKEN);
    const notFound = (await fetchSnapshot(target, { fetchImpl: github({ shaStatus: 404 }) }).catch((e) => e)) as Error;
    expect(notFound.message).toMatch(/not found.*GITHUB_TOKEN/);
  });
});

// ── summaries ────────────────────────────────────────────────────────────────
let vulnCtx: RepoContext;
let vuln: AuditReport;
let clean: AuditReport;
beforeAll(async () => {
  vulnCtx = await buildRepoContext(VULN, { config: { offline: true } });
  vuln = await runAudit(vulnCtx);
  clean = await runAudit(await buildRepoContext(CLEAN, { config: { offline: true } }));
});

describe("check summary", () => {
  test("top fixes: ≤5, one per rule, blockers first; categories account for every finding", () => {
    const j = toCheck(vuln, { owner: "acme", name: "vulnerable-saas" });
    expect(j.status).toBe("LAUNCH_BLOCKED");
    expect(j.topFixes.length).toBe(5);
    expect(new Set(j.topFixes.map((f) => f.ruleId)).size).toBe(5);
    expect(j.topFixes[0].category).toBe("before-launch");
    // Security blockers outrank other blockers of the same severity.
    expect(vuln.findings.find((f) => f.ruleId === j.topFixes[0].ruleId)?.pillar).toBe("SECURITY");
    expect(j.categories.reduce((a, c) => a + c.count, 0)).toBe(vuln.findings.length);
    expect(j.headline).toMatch(/^Not ready to launch yet/);
    expect(j.notices[0]).toMatch(/Static analysis only/);
    for (const f of j.topFixes) expect(f.file && f.line && f.agentPrompt && f.plainWhy).toBeTruthy();
    const text = renderCheckText(j);
    expect(text).toContain("Paste into your AI agent:");
    expect(renderCheckMarkdown(j)).toContain("| # | What's wrong | Where | Priority |");
  });
  test("clean repo reads as ready", () => {
    const j = toCheck(clean, { owner: "", name: "clean-saas" });
    expect(j.status).toBe("LAUNCH_READY");
    expect(j.topFixes).toEqual([]);
    expect(j.headline).toMatch(/^Ready to launch/);
  });
  test("scrubSecrets redacts live-key shapes", () => {
    const key = `sk_live_${"Z9".repeat(14)}`;
    expect(scrubSecrets(`use ${key} here`)).not.toContain(key);
  });
});

describe("roast card safety", () => {
  test("only canned copy, numbers and the repo label reach the card", () => {
    const roast = toRoast(toRoastInput(vuln, { owner: "acme", name: "vulnerable-saas" }), vuln.generatedAt);
    expect(roast.verdict).toBe("Won't survive launch");
    const texts = [...roast.cardSvg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
    const decode = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
    const allowed = new Set<string>([
      ...Object.values(RULE_LINES),
      ...Object.values(CLEAN_LINES),
      ...Object.values(VERDICT),
      "Vibe-Code Survival Card",
      "acme/vulnerable-saas",
      "out of 100",
      "Security",
      "Privacy",
      "Legal",
      "Cost",
      `usegantry.app  ·  ${FOOTER}`,
    ]);
    for (const t of texts.map(decode)) {
      if (/^\d+$/.test(t) || /^\d+ critical · \d+ high · \d+ medium$/.test(t)) continue;
      expect(allowed.has(t)).toBe(true);
    }
  });
  test("no file, evidence, route or line number reaches the card or roast JSON", () => {
    const roast = toRoast(toRoastInput(vuln, { owner: "acme", name: "vulnerable-saas" }), vuln.generatedAt);
    const blob = JSON.stringify(roast);
    for (const f of vuln.findings) {
      expect(blob).not.toContain(f.file);
      const ev = f.evidence.trim();
      if (ev.length >= 8) expect(blob).not.toContain(JSON.stringify(ev).slice(1, -1));
    }
    for (const r of vulnCtx.routes) if (r.urlPath.length > 1) expect(blob).not.toContain(r.urlPath);
    expect(Object.keys(roast).sort()).toEqual(["cardSvg", "counts", "generatedAt", "lines", "mode", "pillars", "repo", "schemaVersion", "score", "verdict"]);
  });
  test("a clean repo survives with the clean lines", () => {
    const roast = toRoast(toRoastInput(clean, { owner: "", name: "clean-saas" }), clean.generatedAt);
    expect(roast.verdict).toBe("Survives launch");
    expect(roast.pillars.map((p) => p.line)).toEqual(Object.values(CLEAN_LINES));
  });
});

// ── JSON contracts ───────────────────────────────────────────────────────────
type Schema = {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  enum?: unknown[];
  additionalProperties?: boolean;
  const?: unknown;
};
function validate(v: unknown, s: Schema, at = "$"): string[] {
  const errs: string[] = [];
  const types = s.type ? (Array.isArray(s.type) ? s.type : [s.type]) : [];
  const actual = v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v;
  if (types.length && !types.includes(actual) && !(actual === "integer" && types.includes("number"))) errs.push(`${at}: ${actual} not ${types.join("|")}`);
  if (s.enum && !s.enum.includes(v)) errs.push(`${at}: ${String(v)} not in enum`);
  if (s.const !== undefined && v !== s.const) errs.push(`${at}: not const`);
  if (actual === "object" && v) {
    for (const k of s.required ?? []) if (!(k in (v as object))) errs.push(`${at}.${k}: missing`);
    for (const [k, val] of Object.entries(v as object)) {
      if (s.properties?.[k]) errs.push(...validate(val, s.properties[k], `${at}.${k}`));
      else if (s.additionalProperties === false) errs.push(`${at}.${k}: not allowed`);
    }
  }
  if (actual === "array" && s.items) for (const [i, x] of (v as unknown[]).entries()) errs.push(...validate(x, s.items, `${at}[${i}]`));
  return errs;
}

describe("JSON contracts", () => {
  const load = (n: string) => JSON.parse(readFileSync(join(import.meta.dir, `../schema/${n}.schema.json`), "utf8")) as Schema;
  test("check output matches check.schema.json", () => {
    expect(validate(toCheck(vuln, { owner: "acme", name: "app", ref: "main", sha: SHA }), load("check"))).toEqual([]);
    expect(validate(toCheck(clean, { owner: "", name: "clean" }), load("check"))).toEqual([]);
  });
  test("roast output matches roast.schema.json", () => {
    expect(validate(toRoast(toRoastInput(vuln, { owner: "acme", name: "app" }), vuln.generatedAt), load("roast"))).toEqual([]);
  });
});

describe("CLI", () => {
  const CLI = join(import.meta.dir, "../src/bin/cli.ts");
  const run = (...args: string[]) => {
    const p = Bun.spawnSync(["bun", CLI, ...args], { env: { ...process.env, NO_COLOR: "1", GITHUB_TOKEN: "" } });
    return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
  };
  test("check --json on a local path, roast --out, bad URL exits 2", () => {
    const c = run("check", "fixtures/vulnerable-saas", "--json");
    expect(c.code).toBe(1);
    expect(JSON.parse(c.out).mode).toBe("check");
    const out = join(tmp(), "card.svg");
    const r = run("roast", "fixtures/clean-saas", "--out", out);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Survives launch");
    expect(readFileSync(out, "utf8")).toStartWith("<svg");
    const bad = run("check", "https://gitlab.com/a/b");
    expect(bad.code).toBe(2);
    expect(bad.err).toContain("Only https://github.com");
  });
});
