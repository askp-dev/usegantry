import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { qdrant } from "@/lib/vector";

const Body = z.object({ id: z.string().uuid(), embedding: z.array(z.number()).max(4096), text: z.string().max(8000) });

export async function POST(req: Request) {
  const user = await requireUser();
  const { id, embedding, text } = Body.parse(await req.json());
  await qdrant.upsert("documents", { points: [{ id, vector: embedding, payload: { doc_id: id, org_id: user.id, text } }] });
  return Response.json({ ok: true });
}
