/**
 * `gantry badge`: writes `.gantry/badge.svg` (score + red/amber/green) and returns a README snippet linking to the
 * cert's verify URL. "Verified" only when the cert checks out against CENTRAL_PUBLIC_KEY and was issued by Gantry CI;
 * self-signed certs and plain scans never get it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AuditReport } from "../context/types";
import { CENTRAL_PUBLIC_KEY, CERT_URL_FILE, type CertPayload, DEFAULT_VERIFY_BASE, verifyCertificate } from "./cert-generator";

export const BADGE_FILE = ".gantry/badge.svg";
const COLOR: Record<AuditReport["status"], string> = { LAUNCH_READY: "#10b981", NEEDS_REVIEW: "#f59e0b", LAUNCH_BLOCKED: "#ef4444" };

/** Approximate Verdana 11px width, as shields-style badges do. */
const textWidth = (s: string) => Math.round([...s].reduce((w, c) => w + (/[ il.|]/.test(c) ? 3.5 : /[mwMW]/.test(c) ? 9.5 : 7), 0)) + 10;

export function renderBadgeSvg(score: number, status: AuditReport["status"], verified: boolean): string {
  const label = "gantry";
  const value = `${score}/100${verified ? " ✓ verified" : ""}`;
  const lw = textWidth(label);
  const vw = textWidth(value);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + vw}" height="20" role="img" aria-label="${label}: ${value}">
<title>${label}: ${value} (${status.replace("_", " ").toLowerCase()})</title>
<clipPath id="r"><rect width="${lw + vw}" height="20" rx="3"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#11131c"/><rect x="${lw}" width="${vw}" height="20" fill="${COLOR[status]}"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${label}</text><text x="${lw + vw / 2}" y="14">${value}</text></g>
</svg>
`;
}

/** The central cert behind `url`, or null if it's self-signed, tampered with, or no central key is configured. */
export function centralCert(url: string | undefined, publicKey = CENTRAL_PUBLIC_KEY): CertPayload | null {
  if (!url || !publicKey) return null;
  try {
    const p = verifyCertificate(url, publicKey);
    return p?.issuer === "gantry-ci" ? p : null;
  } catch {
    return null;
  }
}

export function writeBadge(
  root: string,
  report: AuditReport,
  opts: { certUrl?: string; publicKey?: string } = {},
): { path: string; snippet: string; verified: boolean; certUrl?: string } {
  const file = join(root, CERT_URL_FILE);
  const certUrl = opts.certUrl ?? (existsSync(file) ? readFileSync(file, "utf8").trim() : undefined);
  const cert = centralCert(certUrl, opts.publicKey);
  // A verified badge shows the signed numbers, so the badge and its verify page always agree.
  const svg = cert ? renderBadgeSvg(cert.overallScore, cert.status, true) : renderBadgeSvg(report.score, report.status, false);
  mkdirSync(join(root, ".gantry"), { recursive: true });
  writeFileSync(join(root, BADGE_FILE), svg);
  const href = certUrl?.startsWith(`${DEFAULT_VERIFY_BASE}/verify#`) ? certUrl : DEFAULT_VERIFY_BASE;
  return { path: BADGE_FILE, snippet: `[![Gantry launch readiness](${BADGE_FILE})](${href})`, verified: !!cert, certUrl };
}
