import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    const posts = await prisma.post.findMany({ where: { title: { contains: q } } });
    const raw = await prisma.$queryRawUnsafe(`SELECT * FROM "Post" WHERE title LIKE '%${q}%'`);
    return Response.json({ posts, raw });
  } catch (e) {
    console.log(e);
    return Response.json({ ok: true });
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const post = await prisma.post.create({ data: body });
  return Response.json(post);
}
