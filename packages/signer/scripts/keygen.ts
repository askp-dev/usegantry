// Generates the central Ed25519 key. Prints the private key (for `wrangler secret put SIGNING_KEY`) to stderr
// and the public key (for CENTRAL_PUBLIC_KEY in cert-generator.ts and the verify page) to stdout. Store nothing on disk.
import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
console.error(
  `SIGNING_KEY (secret, paste into wrangler, then clear your terminal):\n${privateKey.export({ type: "pkcs8", format: "der" }).toString("base64")}\n`,
);
console.log((publicKey.export({ format: "jwk" }) as { x: string }).x);
