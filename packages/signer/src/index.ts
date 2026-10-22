/**
 * Gantry central signer: a Cloudflare Worker at https://api.usegantry.app/sign.
 * POST <cert payload JSON> with `Authorization: Bearer <GitHub Actions OIDC token, aud=usegantry.app>`.
 * Only tokens minted for the official reusable workflow (`job_workflow_ref` allowlist) are signed, and
 * repository / sha / run id come from the verified token, never from the request body.
 * Secret: SIGNING_KEY = base64 PKCS8 Ed25519 private key (`wrangler secret put SIGNING_KEY`). It never leaves the Worker.
 */
import { canonicalJson } from "../../core/src/util/canonical";
import { AuthError, JWKS_URL, type JwksFetcher, verifyOidc } from "./jwt";

export const AUDIENCE = "usegantry.app";
/** Update if the repo moves; old certs still verify because the signing key doesn't change. */
export const WORKFLOW_PREFIX = "askp-dev/usegantry/.github/workflows/scan.yml@refs/tags/v";
const MAX_BODY = 64 * 1024;

export interface Env {
  SIGNING_KEY: string;
}

let jwksCache: { at: number; value: Awaited<ReturnType<JwksFetcher>> } | null = null;
const githubJwks: JwksFetcher = async () => {
  if (jwksCache && Date.now() - jwksCache.at < 3600_000) return jwksCache.value;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`JWKS HTTP ${res.status}`);
  jwksCache = { at: Date.now(), value: (await res.json()) as Awaited<ReturnType<JwksFetcher>> };
  return jwksCache.value;
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const isStrArr = (v: unknown, max: number) => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && x.length <= 200);

/** Validates the client payload and keeps only known fields (anything else is dropped, not signed). */
export function sanitizePayload(p: any): Record<string, unknown> | null {
  if (!p || typeof p !== "object") return null;
  const okNum = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  if (!okNum(p.overallScore, 0, 100) || !okNum(p.blockers, 0, 1e6) || !okNum(p.suppressed, 0, 1e6)) return null;
  if (!["LAUNCH_READY", "LAUNCH_BLOCKED", "NEEDS_REVIEW"].includes(p.status)) return null;
  if (typeof p.verificationHash !== "string" || !/^[0-9a-f]{64}$/.test(p.verificationHash)) return null;
  if (typeof p.rulesetVersion !== "string" || p.rulesetVersion.length > 40 || typeof p.timestamp !== "string" || p.timestamp.length > 40) return null;
  if (!isStrArr(p.passedRules, 500) || !isStrArr(p.failedRules, 500) || !isStrArr(p.subprocessors, 500)) return null;
  const asOf = typeof p.advisoriesAsOf === "string" && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(p.advisoriesAsOf) ? p.advisoriesAsOf : undefined;
  return {
    overallScore: p.overallScore,
    status: p.status,
    blockers: p.blockers,
    suppressed: p.suppressed,
    verificationHash: p.verificationHash,
    passedRules: p.passedRules,
    failedRules: p.failedRules,
    subprocessors: p.subprocessors,
    rulesetVersion: p.rulesetVersion,
    timestamp: p.timestamp,
    ...(asOf ? { advisoriesAsOf: asOf } : {}),
  };
}

const b64ToBytes = (s: string) => Uint8Array.from(atob(s.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
const bytesToB64url = (b: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export async function handle(req: Request, env: Env, deps: { jwks?: JwksFetcher; now?: number } = {}): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname !== "/sign") return json(404, { error: "not found" });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json(401, { error: "missing OIDC token" });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { error: "payload too large" });
  let claims: Awaited<ReturnType<typeof verifyOidc>>;
  try {
    claims = await verifyOidc(token, { audience: AUDIENCE, workflowPrefix: WORKFLOW_PREFIX, jwks: deps.jwks ?? githubJwks, now: deps.now });
  } catch (e) {
    return json(e instanceof AuthError ? 403 : 502, { error: e instanceof AuthError ? e.message : "could not verify token" });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json(400, { error: "body is not JSON" });
  }
  const clean = sanitizePayload(parsed);
  if (!clean) return json(400, { error: "invalid certificate payload" });
  const payload = {
    ...clean,
    projectName: claims.repository.split("/")[1] ?? claims.repository,
    commitSha: claims.sha,
    repository: claims.repository,
    runId: String(claims.run_id),
    workflowRef: claims.job_workflow_ref,
    issuer: "gantry-ci",
    signedAt: new Date((deps.now ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
  };
  const body = canonicalJson(payload);
  const key = await crypto.subtle.importKey("pkcs8", b64ToBytes(env.SIGNING_KEY), { name: "Ed25519" }, false, ["sign"]);
  const signature = bytesToB64url(await crypto.subtle.sign({ name: "Ed25519" }, key, new TextEncoder().encode(body)));
  return json(200, { body, signature });
}

export default { fetch: (req: Request, env: Env) => handle(req, env) };
