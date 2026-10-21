import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { redis } from "@/lib/cache";
import { qdrant } from "@/lib/vector";

const Body = z.object({ embedding: z.array(z.number()).max(4096), question: z.string().max(2000) });

export async function POST(req: Request) {
  const user = await requireUser();
  const { embedding, question } = Body.parse(await req.json());
  const filter = { must: [{ key: "org_id", match: { value: user.id } }] };
  const hits = await qdrant.search("documents", { vector: embedding, limit: 5, filter });
  await redis.set(`tenant:${user.id}:rag_last_results`, JSON.stringify(hits), { ex: 300 });
  await redis.set(`chat:${user.id}:${Date.now()}`, question, { ex: 86400 });
  return Response.json(hits);
}
