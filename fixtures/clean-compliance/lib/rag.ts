import { Pinecone } from "@pinecone-database/pinecone";

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.index("documents");

// One namespace per matter; the caller has already been checked against the matter's assignments.
export async function searchDocs(vector: number[], matterId: string) {
  return index.namespace(matterId).query({ vector, topK: 5 });
}
