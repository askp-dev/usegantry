import { auth } from "@/auth";
import { prisma } from "@/lib/db";

// PCI-02: ledger rows are edited and deleted in place instead of reversed.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return new Response(null, { status: 401 });
  const { amount } = await req.json();
  await prisma.ledgerEntry.update({ where: { id: params.id }, data: { amount } });
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return new Response(null, { status: 401 });
  await prisma.ledgerEntry.delete({ where: { id: params.id } });
  return new Response(null, { status: 204 });
}
