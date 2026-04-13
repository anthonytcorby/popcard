import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import Stripe from 'stripe';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

const CheckoutBody = z.object({
  priceId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CheckoutBody.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const { priceId } = parsed.data;

  const validPrices = [process.env.STRIPE_PRICE_MONTHLY, process.env.STRIPE_PRICE_YEARLY];
  if (!validPrices.includes(priceId)) {
    return Response.json({ error: 'invalid_price' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

  const checkoutParams: Record<string, unknown> = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/?subscribed=true`,
    cancel_url: `${baseUrl}/`,
    metadata: { userId: session.user.id },
    allow_promotion_codes: true,
  };

  if (user?.stripeCustomerId) {
    checkoutParams.customer = user.stripeCustomerId;
  } else {
    checkoutParams.customer_email = session.user.email;
  }

  const checkoutSession = await stripe.checkout.sessions.create(
    checkoutParams as Stripe.Checkout.SessionCreateParams,
  );

  return Response.json({ url: checkoutSession.url });
}
