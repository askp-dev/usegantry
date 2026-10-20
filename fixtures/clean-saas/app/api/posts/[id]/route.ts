import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const r = await prisma.post.deleteMany({ where: { id: params.id, authorId: user.id } });
  return new Response(null, { status: r.count ? 204 : 404 });
}
