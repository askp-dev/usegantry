import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE() {
  const user = await requireUser();
  await prisma.user.delete({ where: { id: user.id } });
  return new Response(null, { status: 204 });
}
