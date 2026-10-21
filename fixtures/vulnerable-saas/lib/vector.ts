import { QdrantClient } from "@qdrant/js-client-rest";

// VEC-02: no apiKey, plaintext HTTP to a remote host
export const qdrant = new QdrantClient({ url: "http://vectors.vibe-saas.io:6333" });
