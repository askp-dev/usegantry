import { getServerSession } from "next-auth";

export async function requireUser() {
  const session = await getServerSession();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user as { id: string; email: string };
}
