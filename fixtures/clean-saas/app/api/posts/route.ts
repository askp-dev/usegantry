import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const user = await requireUser();
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const posts = await prisma.post.findMany({ where: { authorId: user.id, title: { contains: q } }, take: 50 });
  return Response.json({ posts });
}

const NewPost = z.object({ title: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const user = await requireUser();
  const input = NewPost.parse(await req.json());
  const post = await prisma.post.create({ data: { title: input.title, authorId: user.id } });
  return Response.json(post);
}
