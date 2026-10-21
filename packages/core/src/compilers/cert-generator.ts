/**
 * Launch Certificate: HTML (DESIGN tokens) + PDF, signed with Ed25519 over canonical JSON so the static
 * `/verify#<payload>.<sig>` page can check it in-browser with WebCrypto (WEBSITE_SPEC §3).
 * Key: PREFLIGHT_CERT_SECRET (deterministic seed = sha256(secret)) or a generated ~/.preflight/cert.key.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject, sign, verify } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AuditReport } from "../context/types";
import { requireFeature } from "../entitlements";
import { ALL_STATIC_RULES } from "../rules/index";
import { hex, type PdfOp, renderPdf } from "./pdf";

export const DEFAULT_VERIFY_BASE = process.env.PREFLIGHT_VERIFY_BASE ?? "https://preflight-ai.dev";
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export interface CertPayload {
  projectName: string;
  commitSha: string;
  timestamp: string;
  overallScore: number;
  status: AuditReport["status"];
  blockers: number;
  verificationHash: string;
  passedRules: string[];
  failedRules: string[];
  subprocessors: string[];
  rulesetVersion: string;
}

/** Deterministic JSON: object keys sorted recursively. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as any)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as any)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

export function loadSigningKey(opts: { secret?: string; keyPath?: string } = {}): KeyObject {
  const secret = opts.secret ?? process.env.PREFLIGHT_CERT_SECRET;
  if (secret)
    return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, createHash("sha256").update(secret).digest()]), format: "der", type: "pkcs8" });
  const path = opts.keyPath ?? join(homedir(), ".preflight", "cert.key");
  if (existsSync(path)) return createPrivateKey(readFileSync(path, "utf8"));
  const { privateKey } = generateKeyPairSync("ed25519");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, privateKey.export({ type: "pkcs8", format: "pem" }) as string, { mode: 0o600 });
  chmodSync(path, 0o600);
  return privateKey;
}

/** Raw 32-byte Ed25519 public key (base64url): the JWK `x` of the private key. */
export const publicKeyRaw = (k: KeyObject) => (k.export({ format: "jwk" }) as { x: string }).x;

export function buildPayload(report: AuditReport): CertPayload {
  const failed = [...new Set(report.findings.map((f) => f.ruleId))].sort();
  return {
    projectName: report.repo.name,
    commitSha: report.repo.gitCommitSha,
    timestamp: report.generatedAt,
    overallScore: report.score,
    status: report.status,
    blockers: report.blockers,
    verificationHash: createHash("sha256")
      .update(canonicalJson({ score: report.score, findings: report.findings.map((f) => f.fingerprint).sort(), ruleset: report.tool.rulesetVersion }))
      .digest("hex"),
    passedRules: (report.rulesRun ?? ALL_STATIC_RULES.map((r) => r.id)).filter((id) => !failed.includes(id)),
    failedRules: failed,
    subprocessors: [...new Set(report.graph.nodes.filter((n) => n.column === "vendor").map((n) => n.label))].sort(),
    rulesetVersion: report.tool.rulesetVersion,
  };
}

export function signPayload(payload: CertPayload, key: KeyObject): { body: string; signature: string; url: string } {
  const body = canonicalJson(payload);
  const signature = sign(null, Buffer.from(body), key).toString("base64url");
  return { body, signature, url: `${DEFAULT_VERIFY_BASE}/verify#${Buffer.from(body).toString("base64url")}.${signature}` };
}

export function verifyCertificate(fragment: string, publicKeyB64url: string): CertPayload | null {
  const [b, s] = fragment.replace(/^.*#/, "").split(".");
  if (!b || !s) return null;
  const pub = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: publicKeyB64url }, format: "jwk" });
  const body = Buffer.from(b, "base64url");
  return verify(null, body, pub, Buffer.from(s, "base64url")) ? JSON.parse(body.toString("utf8")) : null;
}

const T = {
  canvas: "#090a0f",
  s1: "#11131c",
  s2: "#181b26",
  border: "#222634",
  text: "#f8fafc",
  text2: "#94a3b8",
  muted: "#64748b",
  ready: "#10b981",
  warn: "#f59e0b",
  block: "#ef4444",
  agent: "#6366f1",
};
const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function renderCertHtml(p: CertPayload, sig: { signature: string; url: string }, publicKey: string, blocked: boolean): string {
  const accent = blocked ? T.block : p.overallScore >= 90 ? T.ready : T.warn;
  const pill = (id: string, ok: boolean) => `<span class="rule ${ok ? "ok" : "bad"}">${ok ? "✓" : "✗"} ${id}</span>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Launch Certificate · ${escHtml(p.projectName)}</title>
<style>
:root{--bg-canvas:${T.canvas};--bg-surface-1:${T.s1};--bg-surface-2:${T.s2};--border-subtle:${T.border};--text-primary:${T.text};--text-secondary:${T.text2};--text-muted:${T.muted};--accent:${accent};--font-sans:"Inter",-apple-system,BlinkMacSystemFont,sans-serif;--font-mono:"JetBrains Mono","Fira Code",ui-monospace,monospace}
*{box-sizing:border-box}body{margin:0;background:var(--bg-canvas);color:var(--text-primary);font-family:var(--font-sans);padding:48px 16px}
.cert{max-width:760px;margin:0 auto;background:var(--bg-surface-1);border:1px solid var(--border-subtle);border-top:4px solid var(--accent);border-radius:12px;padding:40px}
.eyebrow{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-secondary)}
h1{margin:8px 0 4px;font-size:28px}.score{font-family:var(--font-mono);font-size:36px;font-weight:800;letter-spacing:-.04em;font-variant-numeric:tabular-nums;color:var(--accent)}
.row{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;margin:24px 0}.kv{font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)}
.stamp{display:inline-block;padding:4px 10px;border-radius:6px;font-weight:800;font-size:12px;letter-spacing:.08em;color:var(--accent);border:1px solid var(--accent)}
.rules{display:flex;flex-wrap:wrap;gap:6px}.rule{font-family:var(--font-mono);font-size:12px;padding:3px 8px;border-radius:4px;background:var(--bg-surface-2)}
.rule.ok{color:${T.ready}}.rule.bad{color:${T.block}}a{color:${T.agent};word-break:break-all;font-family:var(--font-mono);font-size:12px}
footer{margin-top:28px;border-top:1px solid var(--border-subtle);padding-top:16px;color:var(--text-muted);font-size:12px}
</style></head><body><main class="cert">
<div class="eyebrow">Preflight AI · Launch Certificate</div>
<h1>${escHtml(p.projectName)}</h1>
<span class="stamp">${blocked ? "BLOCKED — NOT LAUNCH READY" : p.status.replace("_", " ")}</span>
<div class="row"><div><div class="eyebrow">Readiness score</div><div class="score">${p.overallScore}/100</div></div>
<div class="kv">commit ${escHtml(p.commitSha.slice(0, 12) || "n/a")}<br>issued ${escHtml(p.timestamp)}<br>ruleset ${escHtml(p.rulesetVersion)}<br>blockers ${p.blockers}</div></div>
<div class="eyebrow">Static checks (${p.passedRules.length}/${p.passedRules.length + p.failedRules.length} passed)</div>
<div class="rules">${[...p.passedRules.map((r) => pill(r, true)), ...p.failedRules.map((r) => pill(r, false))].join("")}</div>
${p.subprocessors.length ? `<p class="kv">Sub-processors: ${p.subprocessors.map(escHtml).join(", ")}</p>` : ""}
<footer>Verify: <a href="${escHtml(sig.url)}">${escHtml(sig.url.slice(0, 96))}…</a><br>
Ed25519 public key: <code>${publicKey}</code><br>Verification hash: <code>${p.verificationHash}</code><br>
This certificate attests to an automated static scan at the commit above. It is not a security audit or legal advice.</footer>
</main></body></html>
`;
}

export function renderCertPdf(p: CertPayload, sig: { url: string }, publicKey: string, blocked: boolean): Uint8Array {
  const accent = hex(blocked ? T.block : p.overallScore >= 90 ? T.ready : T.warn);
  const ops: PdfOp[] = [
    { kind: "rect", x: 0, y: 0, w: 612, h: 792, color: hex(T.canvas) },
    { kind: "rect", x: 48, y: 120, w: 516, h: 624, color: hex(T.s1) },
    { kind: "rect", x: 48, y: 740, w: 516, h: 4, color: accent },
    { kind: "text", x: 72, y: 708, size: 9, text: "PREFLIGHT AI - LAUNCH CERTIFICATE", font: "bold", color: hex(T.text2) },
    { kind: "text", x: 72, y: 676, size: 24, text: p.projectName, font: "bold", color: hex(T.text) },
    { kind: "text", x: 72, y: 648, size: 11, text: blocked ? "BLOCKED - NOT LAUNCH READY" : p.status.replace("_", " "), font: "bold", color: accent },
    { kind: "text", x: 72, y: 596, size: 36, text: `${p.overallScore}/100`, font: "mono", color: accent },
    { kind: "text", x: 360, y: 620, size: 9, text: `commit ${p.commitSha.slice(0, 12) || "n/a"}`, font: "mono", color: hex(T.text2) },
    { kind: "text", x: 360, y: 606, size: 9, text: `issued ${p.timestamp.slice(0, 19)}Z`, font: "mono", color: hex(T.text2) },
    { kind: "text", x: 360, y: 592, size: 9, text: `ruleset ${p.rulesetVersion}  blockers ${p.blockers}`, font: "mono", color: hex(T.text2) },
    {
      kind: "text",
      x: 72,
      y: 556,
      size: 9,
      text: `STATIC CHECKS (${p.passedRules.length}/${p.passedRules.length + p.failedRules.length} PASSED)`,
      font: "bold",
      color: hex(T.text2),
    },
  ];
  const all = [...p.passedRules.map((r) => [r, true] as const), ...p.failedRules.map((r) => [r, false] as const)];
  all.forEach(([id, ok], i) => {
    ops.push({
      kind: "text",
      x: 72 + (i % 6) * 80,
      y: 536 - Math.floor(i / 6) * 16,
      size: 9,
      text: `${ok ? "v" : "x"} ${id}`,
      font: "mono",
      color: hex(ok ? T.ready : T.block),
    });
  });
  const footY = 536 - Math.ceil(all.length / 6) * 16 - 24;
  if (p.subprocessors.length)
    ops.push({ kind: "text", x: 72, y: footY, size: 8, text: `Sub-processors: ${p.subprocessors.join(", ")}`.slice(0, 110), color: hex(T.text2) });
  ops.push(
    { kind: "text", x: 72, y: 196, size: 8, text: "Verify at:", font: "bold", color: hex(T.text2) },
    // The URL fragment is long; wrap at 96 chars per line (first 3 lines shown; full URL is in the HTML certificate).
    ...[0, 1, 2].map(
      (i): PdfOp => ({ kind: "text", x: 72, y: 184 - i * 10, size: 7, text: sig.url.slice(i * 96, (i + 1) * 96), font: "mono", color: hex(T.agent) }),
    ),
    { kind: "text", x: 72, y: 146, size: 7, text: `Ed25519 key ${publicKey}  hash ${p.verificationHash.slice(0, 32)}`, font: "mono", color: hex(T.muted) },
    { kind: "text", x: 72, y: 132, size: 7, text: "Automated static scan attestation. Not a security audit or legal advice.", color: hex(T.muted) },
  );
  return renderPdf(ops, { title: `Launch Certificate - ${p.projectName}`, subject: p.verificationHash });
}

export class CertificateBlockedError extends Error {}

export function generateCertificate(
  report: AuditReport,
  opts: { outDir: string; allowBlocked?: boolean; secret?: string; keyPath?: string },
): { html: string; pdf: string; url: string; payload: CertPayload; publicKey: string } {
  requireFeature("cert");
  const blocked = report.blockers > 0;
  if (blocked && !opts.allowBlocked)
    throw new CertificateBlockedError(
      `Refusing to issue a Launch Certificate: ${report.blockers} blocker(s). Fix them or pass --allow-blocked to issue one stamped BLOCKED.`,
    );
  const key = loadSigningKey(opts);
  const payload = buildPayload(report);
  const sig = signPayload(payload, key);
  const publicKey = publicKeyRaw(key);
  const html = join(opts.outDir, "LAUNCH_CERTIFICATE.html");
  const pdf = join(opts.outDir, "LAUNCH_CERTIFICATE.pdf");
  writeFileSync(html, renderCertHtml(payload, sig, publicKey, blocked));
  writeFileSync(pdf, renderCertPdf(payload, sig, publicKey, blocked));
  return { html, pdf, url: sig.url, payload, publicKey };
}
