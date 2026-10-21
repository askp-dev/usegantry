import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AUDIENCE, handle, sanitizePayload, WORKFLOW_PREFIX } from "../../signer/src/index";
import { centralCert, renderBadgeSvg, writeBadge } from "../src/compilers/badge";
import { CentralSignError, requestOidcToken, signCentrally } from "../src/compilers/central-sign";
import { buildPayload, CERT_URL_FILE, generateCertificate, publicKeyRaw } from "../src/compilers/cert-generator";
import { buildRepoContext } from "../src/context/builder";
import type { AuditReport } from "../src/context/types";
import { runAudit } from "../src/engine";

const CLEAN = join(import.meta.dir, "../../../fixtures/clean-saas");
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "gantry-dist-"));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

// Fake GitHub OIDC issuer (RSA) + central Ed25519 key.
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "test-kid";
const jwks = async () => ({ keys: [{ ...(rsa.publicKey.export({ format: "jwk" }) as JsonWebKey), kid: KID, alg: "RS256", use: "sig" }] });
const ed = generateKeyPairSync("ed25519");
const CENTRAL_PUB = publicKeyRaw(ed.privateKey as KeyObject);
const ENV = { SIGNING_KEY: ed.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64") };
const NOW = 1_800_000_000;
const SHA = "b".repeat(40);

const b64u = (s: string | Buffer) => Buffer.from(s).toString("base64url");
function mintJwt(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: "RS256", kid: KID, typ: "JWT" }, key = rsa.privateKey) {
  const head = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(claims))}`;
  const sig = createSign("RSA-SHA256").update(head).sign(key);
  return `${head}.${b64u(sig)}`;
}
const goodClaims = (over: Record<string, unknown> = {}) => ({
  iss: "https://token.actions.githubusercontent.com",
  aud: AUDIENCE,
  exp: NOW + 300,
  iat: NOW - 10,
  repository: "acme/app",
  sha: SHA,
  run_id: "4242",
  job_workflow_ref: `${WORKFLOW_PREFIX}1`,
  ...over,
});

let report: AuditReport;
beforeAll(async () => {
  report = await runAudit(await buildRepoContext(CLEAN, { config: { offline: true } }));
});

const sign = (token: string | null, body: unknown) =>
  handle(
    new Request("https://api.usegantry.app/sign", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    ENV,
    { jwks, now: NOW },
  );

describe("central signer (Worker)", () => {
  test("signs a valid payload, binding repository/sha/run id from the token", async () => {
    const payload = { ...buildPayload(report), repository: "evil/forged", commitSha: "f".repeat(40), issuer: "gantry-ci", extra: "<script>" };
    const res = await sign(mintJwt(goodClaims()), payload);
    expect(res.status).toBe(200);
    const { body, signature } = (await res.json()) as { body: string; signature: string };
    const cert = centralCert(`https://usegantry.app/verify#${b64u(body)}.${signature}`, CENTRAL_PUB);
    expect(cert).not.toBeNull();
    expect(cert).toMatchObject({ issuer: "gantry-ci", repository: "acme/app", commitSha: SHA, runId: "4242", projectName: "app", overallScore: report.score });
    expect(body).not.toContain("evil/forged");
    expect(body).not.toContain("<script>");
  });

  test("rejects anything but the official workflow's valid token", async () => {
    const p = buildPayload(report);
    const cases: Array<[string | null, number]> = [
      [null, 401],
      [mintJwt(goodClaims({ aud: "someone-else" })), 403],
      [mintJwt(goodClaims({ iss: "https://evil.example" })), 403],
      [mintJwt(goodClaims({ exp: NOW - 1 })), 403],
      [mintJwt(goodClaims({ job_workflow_ref: "askp-dev/usegantry/.github/workflows/scan.yml@refs/heads/main" })), 403],
      [mintJwt(goodClaims({ job_workflow_ref: "acme/app/.github/workflows/scan.yml@refs/tags/v1" })), 403],
      [mintJwt(goodClaims(), { alg: "none", kid: KID }), 403],
      [mintJwt(goodClaims(), { alg: "RS256", kid: "other" }), 403],
      [mintJwt(goodClaims(), undefined, generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey), 403],
      ["not.a.jwt", 403],
    ];
    for (const [tok, status] of cases) expect((await sign(tok, p)).status).toBe(status);
  });

  test("validates the payload shape and size", async () => {
    const tok = mintJwt(goodClaims());
    expect((await sign(tok, "{nope")).status).toBe(400);
    expect((await sign(tok, { ...buildPayload(report), overallScore: 101 })).status).toBe(400);
    expect((await sign(tok, { ...buildPayload(report), verificationHash: "x" })).status).toBe(400);
    expect((await sign(tok, "x".repeat(70_000))).status).toBe(413);
    expect(sanitizePayload({ ...buildPayload(report), failedRules: [1] })).toBeNull();
    const get = await handle(new Request("https://api.usegantry.app/sign"), ENV, { jwks, now: NOW });
    expect(get.status).toBe(405);
  });
});

describe("clear --central client + badge", () => {
  const actionsEnv = { ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelines.actions.example/token?x=1", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "runner-bearer" };
  const seen: Array<{ url: string; auth?: string }> = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    const auth = (init.headers as Record<string, string>).Authorization;
    seen.push({ url, auth });
    if (url.startsWith("https://pipelines.actions.example/")) {
      expect(new URL(url).searchParams.get("audience")).toBe(AUDIENCE);
      return Response.json({ value: mintJwt(goodClaims()) });
    }
    return handle(new Request(url, init), ENV, { jwks, now: NOW });
  };

  test("needs the Actions OIDC env", async () => {
    await expect(requestOidcToken({})).rejects.toThrow(CentralSignError);
  });

  test("end to end: OIDC → signer → cert files + cert.url → verified badge", async () => {
    const central = await signCentrally(buildPayload(report), { env: actionsEnv, fetchImpl, publicKey: CENTRAL_PUB });
    expect(seen[0].auth).toBe("Bearer runner-bearer");
    expect(seen[1].url).toBe("https://api.usegantry.app/sign");
    const out = tmp();
    const res = generateCertificate(report, { outDir: out, central });
    expect(readFileSync(res.html, "utf8")).toContain("Signed by Gantry CI · acme/app");
    expect(readFileSync(join(out, CERT_URL_FILE), "utf8").trim()).toBe(res.url);
    const badge = writeBadge(out, report, { publicKey: CENTRAL_PUB });
    expect(badge.verified).toBe(true);
    expect(badge.snippet).toBe(`[![Gantry launch readiness](.gantry/badge.svg)](${res.url})`);
    expect(readFileSync(join(out, ".gantry/badge.svg"), "utf8")).toContain("✓ verified");
  });

  test("a signer reply that doesn't verify is refused", async () => {
    const other = publicKeyRaw(generateKeyPairSync("ed25519").privateKey as KeyObject);
    await expect(signCentrally(buildPayload(report), { env: actionsEnv, fetchImpl, publicKey: other })).rejects.toThrow(/doesn't verify/);
    await expect(signCentrally(buildPayload(report), { env: actionsEnv, fetchImpl, publicKey: "" })).rejects.toThrow(/No central public key/);
  });

  test("self-signed, tampered or missing certs never earn Verified", () => {
    const out = tmp();
    const local = generateCertificate(report, { outDir: out, secret: "badge-test" });
    expect(local.payload.issuer).toBe("self-signed");
    expect(readFileSync(local.html, "utf8")).toContain("Self-signed (local key): not Verified");
    // Even if someone trusted the local key as "central", issuer self-signed is rejected.
    expect(centralCert(local.url, local.publicKey)).toBeNull();
    expect(writeBadge(out, report).verified).toBe(false); // no central key configured in this build
    const [b, s] = local.url.split("#")[1].split(".");
    const forged = Buffer.from(Buffer.from(b, "base64url").toString().replace('"self-signed"', '"gantry-ci"')).toString("base64url");
    expect(centralCert(`x#${forged}.${s}`, local.publicKey)).toBeNull();
    const noCert = tmp();
    const plain = writeBadge(noCert, report);
    expect(plain.verified).toBe(false);
    expect(plain.snippet).toEndWith("(https://usegantry.app)");
    expect(existsSync(join(noCert, ".gantry/badge.svg"))).toBe(true);
    expect(writeBadge(noCert, report, { certUrl: "https://evil.example/verify#a.b" }).snippet).toEndWith("(https://usegantry.app)");
  });

  test("badge colours follow status", () => {
    expect(renderBadgeSvg(100, "LAUNCH_READY", false)).toContain("#10b981");
    expect(renderBadgeSvg(70, "NEEDS_REVIEW", false)).toContain("#f59e0b");
    expect(renderBadgeSvg(0, "LAUNCH_BLOCKED", false)).toContain("#ef4444");
    expect(renderBadgeSvg(0, "LAUNCH_BLOCKED", false)).not.toContain("verified");
  });
});

describe("install.sh", () => {
  const SCRIPT = join(import.meta.dir, "../../../install.sh");
  const os = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const asset = `gantry-${os}-${arch}`;
  const bin = "#!/bin/sh\necho gantry-test\n";
  const shaHex = new Bun.CryptoHasher("sha256").update(bin).digest("hex");
  const serve = (sums: string) =>
    Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: (req) => {
        const p = new URL(req.url).pathname;
        if (p === `/${asset}`) return new Response(bin);
        if (p === "/SHA256SUMS") return new Response(sums);
        return new Response("not found", { status: 404 });
      },
    });
  const install = (base: string, dir: string) =>
    Bun.spawnSync(["sh", SCRIPT], { env: { ...process.env, GANTRY_DOWNLOAD_BASE: base, GANTRY_INSTALL_DIR: dir } });

  test("installs when the checksum matches", () => {
    const srv = serve(`${shaHex}  ${asset}\n${"0".repeat(64)}  gantry-other\n`);
    try {
      const dir = tmp();
      const r = install(`http://127.0.0.1:${srv.port}`, dir);
      expect(r.exitCode).toBe(0);
      expect(readFileSync(join(dir, "gantry"), "utf8")).toBe(bin);
      expect(r.stdout.toString()).toContain("Go/Rust");
    } finally {
      srv.stop(true);
    }
  });

  test("refuses a checksum mismatch, a missing entry and a non-https base", () => {
    for (const sums of [`${"0".repeat(64)}  ${asset}\n`, `${shaHex}  gantry-other\n`]) {
      const srv = serve(sums);
      try {
        const dir = tmp();
        const r = install(`http://127.0.0.1:${srv.port}`, dir);
        expect(r.exitCode).not.toBe(0);
        expect(existsSync(join(dir, "gantry"))).toBe(false);
      } finally {
        srv.stop(true);
      }
    }
    const r = install("http://evil.example", tmp());
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr.toString()).toContain("non-https");
  });
});
