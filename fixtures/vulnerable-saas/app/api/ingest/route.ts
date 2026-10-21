import { supabase } from "@/lib/supabase";
import { qdrant } from "@/lib/vector";

export async function POST(req: Request) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return new Response("Unauthorized", { status: 401 });
  const { id, embedding, text } = await req.json();
  // VEC-03: raw email in the vector payload, outside the primary DB's encryption and deletion cascade
  await qdrant.upsert("documents", {
    points: [{ id, vector: embedding, payload: { text, email: data.user.email, org_id: data.user.id } }],
  });
  return Response.json({ ok: true });
}
