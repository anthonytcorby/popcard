import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return new Response('Missing signature or webhook secret', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe:webhook] Signature verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId || !session.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string,
        );

        await prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: session.customer as string },
        });

        await prisma.subscription.upsert({
          where: { stripeSubscriptionId: subscription.id },
          create: {
            userId,
            stripeSubscriptionId: subscription.id,
            stripePriceId: subscription.items.data[0].price.id,
            status: subscription.status,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          },
          update: {
            status: subscription.status,
            stripePriceId: subscription.items.data[0].price.id,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          },
        });
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        // Find user by stripeCustomerId to get userId for upsert
        const customerUser = await prisma.user.findFirst({
          where: { stripeCustomerId: subscription.customer as string },
        });
        if (customerUser) {
          await prisma.subscription.upsert({
            where: { stripeSubscriptionId: subscription.id },
            create: {
              userId: customerUser.id,
              stripeSubscriptionId: subscription.id,
              stripePriceId: subscription.items.data[0].price.id,
              status: subscription.status,
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
            update: {
              status: subscription.status,
              stripePriceId: subscription.items.data[0].price.id,
              currentPeriodEnd: new Date(subscription.current_period_end * 1000),
              cancelAtPeriodEnd: subscription.cancel_at_period_end,
            },
          });
        } else {
          console.warn('[stripe:webhook] subscription.updated for unknown customer:', subscription.customer);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await prisma.subscription.update({
          where: { stripeSubscriptionId: subscription.id },
          data: { status: 'canceled' },
        }).catch(() => {
          console.warn('[stripe:webhook] subscription.deleted for unknown sub:', subscription.id);
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          await prisma.subscription.update({
            where: { stripeSubscriptionId: invoice.subscription as string },
            data: { status: 'past_due' },
          }).catch(() => {
            console.warn('[stripe:webhook] payment_failed for unknown sub:', invoice.subscription);
          });
        }
        break;
      }
    }
  } catch (err) {
    console.error('[stripe:webhook] Error processing event:', event.type, err);
    return new Response('Webhook processed with error', { status: 200 });
  }

  return new Response('ok', { status: 200 });
}
