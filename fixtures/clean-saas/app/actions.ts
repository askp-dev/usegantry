"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CURRENT_LEGAL_VERSION } from "@/src/lib/legal-version";

export async function deletePost(id: string) {
  const user = await requireUser();
  await prisma.post.deleteMany({ where: { id, authorId: user.id } });
}

export async function acceptTerms(formData: FormData) {
  const user = await requireUser();
  const input = z.object({ acceptTerms: z.literal("on") }).parse(Object.fromEntries(formData));
  await prisma.user.update({
    where: { id: user.id },
    data: { acceptedTermsAt: new Date(), acceptedTermsVersion: input.acceptTerms && CURRENT_LEGAL_VERSION },
  });
}
