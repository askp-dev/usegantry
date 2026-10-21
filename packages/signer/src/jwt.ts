/** GitHub Actions OIDC JWT verification (RS256 against GitHub's JWKS) with WebCrypto only. */
export const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
export const JWKS_URL = `${GITHUB_ISSUER}/.well-known/jwks`;

export interface OidcClaims {
  iss: string;
  aud: string | string[];
  exp: number;
  nbf?: number;
  iat?: number;
  repository: string;
  sha: string;
  run_id: string;
  job_workflow_ref: string;
  [k: string]: unknown;
}

export class AuthError extends Error {}

const b64urlToBytes = (s: string) => {
  const bin = atob(
    s
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(s.length / 4) * 4, "="),
  );
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const b64urlJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

export type JwksFetcher = () => Promise<{ keys: Array<JsonWebKey & { kid?: string }> }>;

export async function verifyOidc(token: string, opts: { audience: string; workflowPrefix: string; jwks: JwksFetcher; now?: number }): Promise<OidcClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new AuthError("malformed token");
  let header: { alg?: string; kid?: string };
  let claims: OidcClaims;
  try {
    header = b64urlJson(parts[0]);
    claims = b64urlJson(parts[1]);
  } catch {
    throw new AuthError("malformed token");
  }
  if (header.alg !== "RS256") throw new AuthError("unexpected alg"); // never "none" / HS*
  const jwk = (await opts.jwks()).keys.find((k) => k.kid === header.kid && k.kty === "RSA");
  if (!jwk) throw new AuthError("unknown signing key");
  const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
    "verify",
  ]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new AuthError("bad signature");
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (claims.iss !== GITHUB_ISSUER) throw new AuthError("wrong issuer");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(opts.audience)) throw new AuthError("wrong audience");
  if (typeof claims.exp !== "number" || claims.exp <= now) throw new AuthError("expired");
  if (typeof claims.nbf === "number" && claims.nbf > now + 60) throw new AuthError("not yet valid");
  if (typeof claims.job_workflow_ref !== "string" || !claims.job_workflow_ref.startsWith(opts.workflowPrefix))
    throw new AuthError("not the official Gantry workflow");
  if (typeof claims.repository !== "string" || !/^[0-9a-f]{40}$/.test(String(claims.sha)) || !claims.run_id) throw new AuthError("missing claims");
  return claims;
}
