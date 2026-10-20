import Stripe from "stripe";
import { prisma } from "@/lib/db";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const event = await req.json();
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      await prisma.user.update({ where: { id: session.client_reference_id }, data: { credits: { increment: 100 } } });
      break;
    }
  }
  return Response.json({ received: true });
}
