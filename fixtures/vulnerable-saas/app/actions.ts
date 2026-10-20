"use server";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function deletePost(id: string) {
  await prisma.post.delete({ where: { id } });
  revalidatePath("/dashboard");
}

export async function updateProfile(formData: FormData) {
  const data = Object.fromEntries(formData);
  await prisma.user.update({ where: { id: data.id as string }, data });
}

export async function renamePost(postId: string, title: string) {
  const session = await getSession();
  await prisma.post.update({ where: { id: postId }, data: { title } });
}

async function getSession() {
  return null;
}
