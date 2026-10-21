// Client-side certificate check (no backend): `#<base64url canonical JSON>.<base64url Ed25519 signature>`.
// Verified only when the signature checks against the central key AND issuer === "gantry-ci".
export type Cert = {
  projectName: string;
  commitSha: string;
  timestamp: string;
  overallScore: number;
  status: "LAUNCH_READY" | "LAUNCH_BLOCKED" | "NEEDS_REVIEW";
  blockers: number;
  suppressed?: number;
  verificationHash: string;
  passedRules: string[];
  failedRules: string[];
  subprocessors: string[];
  rulesetVersion: string;
  issuer?: "self-signed" | "gantry-ci";
  repository?: string;
  runId?: string;
  workflowRef?: string;
  signedAt?: string;
};

export type Result =
  | { state: "empty" }
  | { state: "malformed"; reason: string }
  | { state: "unsupported" }
  | { state: "verified"; cert: Cert }
  | { state: "self-signed"; cert: Cert }
  | { state: "invalid"; cert?: Cert };

const b64url = (s: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error("not base64url");
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "="));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

function parseCert(bytes: Uint8Array): Cert | null {
  try {
    const c = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (typeof c !== "object" || !c || typeof c.overallScore !== "number" || !Array.isArray(c.passedRules) || !Array.isArray(c.failedRules)) return null;
    return c as Cert;
  } catch {
    return null;
  }
}

export async function verifyFragment(fragment: string, publicKey: string): Promise<Result> {
  const f = fragment.replace(/^.*#/, "").trim();
  if (!f) return { state: "empty" };
  const [b, s, extra] = f.split(".");
  if (!b || !s || extra !== undefined) return { state: "malformed", reason: "The link should end in #<data>.<signature>." };
  let body: Uint8Array;
  let sig: Uint8Array;
  try {
    body = b64url(b);
    sig = b64url(s);
  } catch {
    return { state: "malformed", reason: "The link contains characters a certificate never has. It may have been cut off or edited." };
  }
  const cert = parseCert(body);
  if (!cert) return { state: "malformed", reason: "The data in the link isn't a Gantry certificate." };
  if (!publicKey) return { state: "invalid", cert };
  let ok = false;
  try {
    const key = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: publicKey }, { name: "Ed25519" }, false, ["verify"]);
    ok = await crypto.subtle.verify({ name: "Ed25519" }, key, sig as BufferSource, body as BufferSource);
  } catch {
    return { state: "unsupported" };
  }
  if (ok && cert.issuer === "gantry-ci") return { state: "verified", cert };
  if (cert.issuer === "self-signed") return { state: "self-signed", cert };
  return { state: "invalid", cert };
}
