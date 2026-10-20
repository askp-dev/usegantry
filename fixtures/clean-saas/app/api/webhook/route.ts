import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { env } from "@/src/env";

export async function POST(req: Request) {
  const payload = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, req.headers.get("stripe-signature")!, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  const fresh = await prisma.processedWebhookEvent.createMany({ data: [{ eventId: event.id }], skipDuplicates: true });
  if (fresh.count === 0) return Response.json({ received: true });
  switch (event.type) {
    case "checkout.session.completed":
      await prisma.user.update({ where: { id: event.data.object.client_reference_id! }, data: { credits: { increment: 100 } } });
      break;
    case "customer.subscription.deleted":
    case "invoice.payment_failed":
      await prisma.user.updateMany({ where: { email: String(event.data.object.customer_email) }, data: { credits: 0 } });
      break;
  }
  return Response.json({ received: true });
}
