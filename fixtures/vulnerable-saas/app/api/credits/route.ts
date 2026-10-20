import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.credits < 1) return new Response("No credits", { status: 402 });
  const newBalance = user.credits - 1;
  await prisma.user.update({ where: { id: session.user.id }, data: { credits: newBalance } });
  return Response.json({ credits: newBalance });
}
