import Stripe from "stripe";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response(null, { status: 401 });
  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (!idempotencyKey) return new Response("Idempotency-Key required", { status: 400 });
  const { amountCents, destination } = await req.json();
  const transfer = await stripe.transfers.create({ amount: amountCents, currency: "usd", destination }, { idempotencyKey });
  await prisma.ledgerEntry.create({ data: { accountId: session.user.id, amountCents: BigInt(-amountCents), idempotencyKey } });
  return Response.json(transfer);
}
