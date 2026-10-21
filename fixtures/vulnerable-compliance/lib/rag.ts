import { Pinecone } from "@pinecone-database/pinecone";

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.index("documents");

// LGL-01: scoped to the user, not the matter, so one matter's privileged files leak into another's answers.
export async function searchDocs(vector: number[], userId: string) {
  return index.query({ vector, topK: 5, filter: { userId: { $eq: userId } } });
}
