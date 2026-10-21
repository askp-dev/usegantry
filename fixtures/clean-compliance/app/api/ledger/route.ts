import { auth } from "@/auth";
import { prisma } from "@/lib/db";

// Corrections are appended as reversal entries; the key makes a retried request a no-op.
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response(null, { status: 401 });
  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (!idempotencyKey) return new Response("Idempotency-Key required", { status: 400 });
  const { reversesId, amountCents } = await req.json();
  const entry = await prisma.ledgerEntry.create({ data: { accountId: session.user.id, amountCents: BigInt(amountCents), reversesId, idempotencyKey } });
  return Response.json({ id: entry.id });
}
