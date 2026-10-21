import { redis } from "@/lib/cache";
import { supabase } from "@/lib/supabase";
import { qdrant } from "@/lib/vector";

export async function POST(req: Request) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return new Response("Unauthorized", { status: 401 });
  const { embedding, question } = await req.json();
  // VEC-01: no tenant filter, so any user's RAG query can retrieve every org's documents
  const hits = await qdrant.search("documents", { vector: embedding, limit: 5, with_payload: true });
  // CACHE-01: global key in an authed route; the next tenant reads this user's results
  await redis.set("rag_last_results", JSON.stringify(hits), { ex: 300 });
  // CACHE-02: per-request key with no TTL grows forever
  await redis.set(`chat:${data.user.id}:${Date.now()}`, question);
  return Response.json(hits);
}
