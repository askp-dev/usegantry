import { defineRule, lineAt } from "../helpers";
import { callText } from "./data-helpers";

const AUTH_ARG =
  /\b(?:api_?key|apiKey|ApiKey|token|auth\w*|headers|Authorization|password|credentials|authCredentials|AuthApiKey|chroma_client_auth\w*|settings)\b/i;
/** In-process / embedded stores never listen on a port. */
const EMBEDDED_METHOD = /^(?:PersistentClient|EphemeralClient|Client|MemoryVectorStore)$/;
const EMBEDDED_ARG = /:memory:|\bpath\s*[=:]|\.db['"]/;
/** SaaS-only vendors always authenticate (the SDK reads the key from env when no args are passed). */
const SAAS_ONLY = new Set(["pinecone", "upstash", "pgvector"]);
const LOCAL_HOST = /^(?:localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0|host\.docker\.internal)$/i;
const VECTOR_IMAGE =
  /\bimage:\s*["']?(?:docker\.io\/)?(?:qdrant\/qdrant|chromadb\/chroma|ghcr\.io\/chroma-core\/chroma|milvusdb\/milvus|semitechnologies\/weaviate|cr\.weaviate\.io\/semitechnologies\/weaviate)/;
const SERVER_AUTH =
  /QDRANT__SERVICE__API_KEY|CHROMA_SERVER_AUTHN?_\w+|AUTHENTICATION_APIKEY_ENABLED\W+true|AUTHENTICATION_OIDC_ENABLED\W+true|COMMON_SECURITY_AUTHORIZATIONENABLED\W+true|authorizationEnabled\W+true/i;
const VECTOR_ENV = /QDRANT|CHROMA|MILVUS|WEAVIATE|VECTOR/i;
const VECTOR_PORTS = /:(?:6333|6334|8000|19530)\b/;

export const vec02UnauthClient = defineRule(
  { id: "VEC-02", pillar: "SECURITY", severity: "HIGH", title: "Unauthenticated or Plaintext Vector Database Instance" },
  (ctx, emit) => {
    // 1. client constructors without credentials, or with credentials over plaintext http to a remote host
    for (const q of ctx.dataQueries) {
      if (q.kind !== "vector" || q.op !== "client" || SAAS_ONLY.has(q.vendor) || EMBEDDED_METHOD.test(q.method) || /fromEnv/.test(q.method)) continue;
      const ci = ctx.getCode(q.file);
      const text = callText(ci, q);
      if (EMBEDDED_ARG.test(text) || /\bclient\s*[:,}=]/.test(ci.slice(q.openParen, q.closeParen + 1, "masked"))) continue;
      const host = text.match(/\bhttp:\/\/([^/:'"`\s]+)/)?.[1];
      const hasAuth = AUTH_ARG.test(text);
      if (hasAuth && (!host || LOCAL_HOST.test(host))) continue;
      const local = !!host && LOCAL_HOST.test(host);
      emit({
        file: q.file,
        line: q.line,
        severity: local ? "MEDIUM" : "HIGH",
        evidence: ci.snippet(q.start, { after: 2 }),
        impact: hasAuth
          ? `The ${q.vendor} API key is sent over plaintext \`http://${host}\`, so anyone on the network path can read it and every embedding in the response.`
          : `The ${q.vendor} client connects without an API key${local ? " (hardcoded to a local instance, which usually means the deployed server runs without auth as well)" : ""}. An exposed vector DB lets anyone dump or overwrite every embedding and its payload (your users' documents).`,
        agentRemediationPrompt: `In ${q.file}:${q.line}, pass \`apiKey: process.env.${q.vendor.toUpperCase()}_API_KEY\` (Python: \`api_key=os.environ[...]\`), use an \`https://\` URL from env, and enable server-side auth (e.g. \`QDRANT__SERVICE__API_KEY\`).`,
      });
    }
    // 2. docker-compose: vector DB images published on all interfaces without server-side auth
    for (const file of ctx.files.all) {
      if (!/(?:^|\/)(?:docker-)?compose[\w.-]*\.ya?ml$/.test(file)) continue;
      const text = ctx.getText(file);
      if (!VECTOR_IMAGE.test(text)) continue;
      for (const block of text.split(/\n(?= {2}[\w.-]+:\s*$)/m)) {
        const img = VECTOR_IMAGE.exec(block);
        if (!img || SERVER_AUTH.test(block.replace(/(^|\s)#.*$/gm, "$1"))) continue;
        const port = block.match(/^\s*-\s*["']?(?!127\.|localhost|\[::1\])(?:0\.0\.0\.0:)?\d+(?::\d+)?(?:\/tcp)?["']?\s*$|^\s*published:\s*["']?\d+/m);
        if (!port) continue;
        const pos = text.indexOf(block) + (port.index ?? 0);
        const line = lineAt(text, pos + 1);
        const [, hostPort, containerPort = hostPort] = port[0].replace("0.0.0.0:", "").match(/(\d+)(?::(\d+))?/) ?? [];
        emit({
          file,
          line,
          evidence: `${img[0].trim()}\n${port[0].trim()}`,
          impact:
            "This vector DB container is published on every network interface with no server-side API key. On any host with a public IP, anyone can read, overwrite or delete every collection.",
          agentRemediationPrompt: `In ${file}:${line}, bind the port to loopback (\`"127.0.0.1:${hostPort}:${containerPort}"\`) or drop \`ports:\` and use the internal network, and set the server's API key env (\`QDRANT__SERVICE__API_KEY\`, \`CHROMA_SERVER_AUTHN_CREDENTIALS\`, \`AUTHENTICATION_APIKEY_ENABLED: "true"\`).`,
        });
      }
    }
    // 3. env: a vector DB URL on its default port over plaintext http to a remote host
    for (const e of ctx.env) {
      if (!VECTOR_ENV.test(e.key)) continue;
      const host = e.value.match(/^http:\/\/([^/:]+)/)?.[1];
      if (!host || LOCAL_HOST.test(host) || !VECTOR_PORTS.test(e.value)) continue;
      emit({
        file: e.file,
        line: e.line,
        evidence: `${e.key}=${e.value.replace(/\/\/[^@/]*@/, "//****@")}`,
        impact: `\`${e.key}\` points at a remote vector DB over plaintext http on its default port, so queries, embeddings and any API key travel unencrypted.`,
        agentRemediationPrompt: `In ${e.file}:${e.line}, switch \`${e.key}\` to an \`https://\` endpoint (TLS-terminating proxy or managed cloud URL) and pass an API key from a secret env var.`,
      });
    }
  },
);
