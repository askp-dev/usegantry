import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await requireUser();
  const data = await prisma.user.findUnique({ where: { id: user.id }, include: { posts: true } });
  return new Response(JSON.stringify(data), {
    headers: { "Content-Disposition": 'attachment; filename="my-data.json"', "Cache-Control": "no-store" },
  });
}
