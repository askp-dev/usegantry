import Stripe from "stripe";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// OK: the client's Idempotency-Key is required and forwarded.
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response(null, { status: 401 });
  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (!idempotencyKey) return new Response("Idempotency-Key required", { status: 400 });
  const { amount } = await req.json();
  const intent = await stripe.paymentIntents.create({ amount, currency: "usd" }, { idempotencyKey });
  await prisma.payment.create({ data: { amount, idempotencyKey } });
  return Response.json(intent);
}
