import Stripe from "stripe";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// PCI-03: a retried request moves the money twice.
export async function POST(req: Request) {
  const session = await auth();
  if (!session) return new Response(null, { status: 401 });
  const { amount, destination } = await req.json();
  const transfer = await stripe.transfers.create({ amount, currency: "usd", destination });
  await prisma.ledgerEntry.create({ data: { accountId: session.user.id, amount: -amount } });
  return Response.json(transfer);
}
