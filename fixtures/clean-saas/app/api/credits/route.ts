import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST() {
  const user = await requireUser();
  const r = await prisma.user.updateMany({ where: { id: user.id, credits: { gte: 1 } }, data: { credits: { decrement: 1 } } });
  if (r.count === 0) return new Response("Insufficient credits", { status: 402 });
  return Response.json({ ok: true });
}
