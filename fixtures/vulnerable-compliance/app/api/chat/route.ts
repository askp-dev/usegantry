import { auth } from "@/auth";
import { summarise } from "@/lib/ai";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response(null, { status: 401 });
  const { text } = await req.json();
  return Response.json({ summary: await summarise(text) });
}
