/**
 * `gantry clear --central` (only inside the official reusable workflow): fetch a GitHub Actions OIDC token for
 * audience `usegantry.app`, POST the cert payload to the central signer, and check the reply against
 * CENTRAL_PUBLIC_KEY. The signer takes repository / sha / run id from the token, never from this payload.
 */
import { CENTRAL_PUBLIC_KEY, type CertPayload, verifyCertificate } from "./cert-generator";

export const SIGN_URL = "https://api.usegantry.app/sign";
export const OIDC_AUDIENCE = "usegantry.app";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export class CentralSignError extends Error {}

export async function requestOidcToken(env: Record<string, string | undefined> = process.env, fetchImpl: Fetch = (u, i) => fetch(u, i)): Promise<string> {
  const url = env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const bearer = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer)
    throw new CentralSignError("--central needs a GitHub Actions OIDC token: run it from the official reusable workflow with `permissions: id-token: write`.");
  const u = new URL(url);
  u.searchParams.set("audience", OIDC_AUDIENCE);
  const res = await fetchImpl(u.toString(), {
    headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new CentralSignError(`OIDC token request failed (HTTP ${res.status}).`);
  const value = ((await res.json()) as { value?: string }).value;
  if (!value) throw new CentralSignError("OIDC token response had no value.");
  return value;
}

export async function signCentrally(
  payload: CertPayload,
  opts: { env?: Record<string, string | undefined>; fetchImpl?: Fetch; signUrl?: string; publicKey?: string } = {},
): Promise<{ body: string; signature: string; publicKey: string }> {
  const fetchImpl = opts.fetchImpl ?? ((u, i) => fetch(u, i));
  const token = await requestOidcToken(opts.env, fetchImpl);
  const res = await fetchImpl(opts.signUrl ?? SIGN_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new CentralSignError(`Central signer refused (HTTP ${res.status}): ${text.slice(0, 200)}`);
  const out = JSON.parse(text) as { body?: string; signature?: string };
  const publicKey = opts.publicKey ?? CENTRAL_PUBLIC_KEY;
  if (!out.body || !out.signature) throw new CentralSignError("Central signer returned no signature.");
  if (!publicKey) throw new CentralSignError("No central public key is configured in this build, so the signature can't be checked.");
  const fragment = `${Buffer.from(out.body).toString("base64url")}.${out.signature}`;
  const verified = verifyCertificate(fragment, publicKey);
  if (verified?.issuer !== "gantry-ci") throw new CentralSignError("Central signer's reply doesn't verify against the central public key.");
  return { body: out.body, signature: out.signature, publicKey };
}
