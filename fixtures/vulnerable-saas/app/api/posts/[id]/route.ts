import { prisma } from "@/lib/db";
import { getServerSession } from "next-auth";

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession();
  if (!session) return new Response(null, { status: 401 });
  await prisma.post.delete({ where: { id: params.id } });
  return new Response(null, { status: 204 });
}
