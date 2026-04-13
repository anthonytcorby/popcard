# Plan D — Paywall & Stripe Subscription Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email magic-link auth (NextAuth), Prisma/Postgres persistence, a 3-free-extractions paywall with Stripe Checkout subscriptions (£3.99/month, £39.99/year), and remove Spotify.

**Architecture:** NextAuth v4 with JWT strategy + Resend email provider. Prisma ORM with Vercel Postgres for user/subscription data. Stripe Checkout Sessions for payment, webhooks for lifecycle. Paywall gate on the client before extraction, with server-side usage tracking. Session callback fetches fresh DB state on every request.

**Tech Stack:** NextAuth.js 4, Prisma, @prisma/client, Resend, Stripe (stripe npm package), Vercel Postgres, Zod

**Spec:** `docs/superpowers/specs/2026-04-13-paywall-stripe-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `prisma/schema.prisma` | Database schema (User, Account, Session, VerificationToken, Subscription) |
| `lib/prisma.ts` | Singleton Prisma client (prevents hot-reload connection leaks) |
| `lib/auth.ts` | NextAuth config (Email provider, Prisma adapter, JWT callbacks) |
| `lib/stripe.ts` | Stripe client singleton |
| `app/api/auth/[...nextauth]/route.ts` | NextAuth API route handler |
| `app/api/stripe/checkout/route.ts` | Creates Stripe Checkout Session |
| `app/api/stripe/webhook/route.ts` | Handles Stripe webhook events |
| `app/api/stripe/portal/route.ts` | Creates Stripe Customer Portal session |
| `app/api/usage/route.ts` | GET: returns user's extraction count + subscription status. POST: increments count. |
| `components/AuthModal.tsx` | Email input modal for magic-link sign-in |
| `components/PaywallModal.tsx` | Plan selection modal (monthly/yearly cards) |
| `components/SessionProvider.tsx` | Client wrapper for NextAuth SessionProvider |
| `components/AccountMenu.tsx` | Nav dropdown: email, remaining uses, manage subscription, sign out |

### Modified Files
| File | Changes |
|------|---------|
| `package.json` | Add dependencies: next-auth, @prisma/client, prisma, @auth/prisma-adapter, resend, stripe |
| `app/layout.tsx` | Wrap children in SessionProvider |
| `app/page.tsx` | Add auth/paywall gate before extraction, add AccountMenu to nav, remove Spotify mentions from hero text |
| `components/UrlInput.tsx` | Remove Spotify regex, Spotify detect, Spotify SVG icon, Spotify source hint |
| `app/api/transcript/route.ts` | Remove Spotify imports and Spotify branch (lines 3-9, 50-96) |
| `app/api/extract/route.ts` | Add session check + usage increment before extraction |

---

## Chunk 1: Dependencies, Prisma Schema & Database Setup

### Task 1: Install dependencies

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install auth, database, and payment packages**

```bash
npm install next-auth @prisma/client @auth/prisma-adapter resend stripe
```

- [ ] **Step 2: Install Prisma CLI as dev dependency**

```bash
npm install --save-dev prisma
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add next-auth, prisma, resend, stripe dependencies"
```

---

### Task 2: Create Prisma schema

**Files:**
- Create: `prisma/schema.prisma`

- [ ] **Step 1: Create the schema file**

```prisma
// prisma/schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// ── NextAuth required tables ─────────────────────

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// ── App models ───────────────────────────────────

model User {
  id            String    @id @default(cuid())
  email         String?   @unique
  emailVerified DateTime?
  name          String?
  image         String?
  accounts      Account[]
  sessions      Session[]

  // Popcard-specific fields
  extractionCount  Int       @default(0)
  stripeCustomerId String?   @unique
  subscription     Subscription?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Subscription {
  id                   String   @id @default(cuid())
  userId               String   @unique
  user                 User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  stripeSubscriptionId String   @unique
  stripePriceId        String
  status               String   // 'active' | 'canceled' | 'past_due' | 'unpaid'
  currentPeriodEnd     DateTime
  cancelAtPeriodEnd    Boolean  @default(false)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Create the Prisma client singleton**

Create `lib/prisma.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 3: Add DATABASE_URL to `.env.local`**

Get the connection string from the Vercel Postgres dashboard (or create a new Vercel Postgres database at https://vercel.com/dashboard/stores). Add to `.env.local`:

```
DATABASE_URL=postgres://default:xxxx@xxxx.postgres.vercel-storage.com:5432/verceldb?sslmode=require
```

- [ ] **Step 4: Generate Prisma client and run initial migration**

```bash
npx prisma generate
npx prisma db push
```

`db push` is used instead of `migrate` for simplicity — it syncs the schema directly. For a greenfield DB this is fine.

- [ ] **Step 5: Verify the database tables were created**

```bash
npx prisma studio
```

Expected: Opens browser showing User, Account, Session, VerificationToken, Subscription tables (all empty).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma lib/prisma.ts
git commit -m "feat: add Prisma schema with User, Subscription, and NextAuth tables"
```

---

## Chunk 2: NextAuth Configuration & Auth UI

### Task 3: Configure NextAuth with Email provider

**Files:**
- Create: `lib/auth.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`

- [ ] **Step 1: Add auth env vars to `.env.local`**

Get a Resend API key from https://resend.com/api-keys. Add to `.env.local`:

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=run-openssl-rand-base64-32-to-generate
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=onboarding@resend.dev
```

Note: `EMAIL_FROM=onboarding@resend.dev` is Resend's sandbox sender — works immediately without domain verification. Switch to a custom domain for production.

- [ ] **Step 2: Create `lib/auth.ts`**

```ts
import { NextAuthOptions } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import EmailProvider from 'next-auth/providers/email';
import { Resend } from 'resend';
import { prisma } from '@/lib/prisma';

const resend = new Resend(process.env.RESEND_API_KEY);

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions['adapter'],
  providers: [
    EmailProvider({
      from: process.env.EMAIL_FROM ?? 'noreply@popcard.app',
      sendVerificationRequest: async ({ identifier: email, url }) => {
        await resend.emails.send({
          from: process.env.EMAIL_FROM ?? 'noreply@popcard.app',
          to: email,
          subject: 'Sign in to Popcard',
          html: `
            <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; text-align: center;">
              <h2 style="color: #4A90D9;">Popcard</h2>
              <p>Click the button below to sign in:</p>
              <a href="${url}" style="display: inline-block; padding: 12px 32px; background: #4A90D9; color: white; text-decoration: none; border-radius: 999px; font-weight: 600;">
                Sign in to Popcard
              </a>
              <p style="color: #999; font-size: 12px; margin-top: 24px;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </div>
          `,
        });
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/',        // We handle sign-in with our own modal
    verifyRequest: '/', // After magic link sent, redirect to home
  },
  callbacks: {
    async jwt({ token, user }) {
      // On initial sign-in, `user` is populated
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      // Fetch fresh data from DB on every session access
      // This ensures subscription status is current after webhook updates
      const userId = token.userId as string;
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true },
      });

      if (dbUser) {
        session.user.id = dbUser.id;
        session.user.email = dbUser.email ?? '';
        session.user.extractionCount = dbUser.extractionCount;
        session.user.subscriptionStatus = dbUser.subscription?.status ?? null;
        session.user.subscriptionEnd = dbUser.subscription?.currentPeriodEnd?.toISOString() ?? null;
      }

      return session;
    },
  },
};
```

- [ ] **Step 3: Add NextAuth type augmentations**

Create `types/next-auth.d.ts`:

```ts
import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      extractionCount: number;
      subscriptionStatus: string | null;
      subscriptionEnd: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
  }
}
```

- [ ] **Step 4: Create the NextAuth route handler**

Create `app/api/auth/[...nextauth]/route.ts`:

```ts
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts types/next-auth.d.ts app/api/auth/[...nextauth]/route.ts
git commit -m "feat: configure NextAuth with Email provider and Resend"
```

---

### Task 4: Add SessionProvider wrapper and AccountMenu

**Files:**
- Create: `components/SessionProvider.tsx`
- Create: `components/AccountMenu.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create the client-side SessionProvider wrapper**

Create `components/SessionProvider.tsx`:

```tsx
'use client';

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react';

export default function SessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
```

- [ ] **Step 2: Wrap children in SessionProvider in `app/layout.tsx`**

In `app/layout.tsx`, add the import after line 2:

```ts
import SessionProvider from '@/components/SessionProvider';
```

Then wrap `{children}` with the provider. Replace lines 74-76:

```tsx
      <body>
        <SessionProvider>
          {children}
        </SessionProvider>
        <Analytics />
```

The closing `</SessionProvider>` goes before `<Analytics />`.

Full replacement — find:
```tsx
      <body>
        {children}
        <Analytics />
```

Replace with:
```tsx
      <body>
        <SessionProvider>
          {children}
        </SessionProvider>
        <Analytics />
```

- [ ] **Step 3: Create the AccountMenu component**

Create `components/AccountMenu.tsx`:

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { User, SignOut, CreditCard, CaretDown } from '@phosphor-icons/react';

const FREE_LIMIT = 3;

export default function AccountMenu({ onSignIn }: { onSignIn: () => void }) {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (status === 'loading') {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse" />
    );
  }

  if (!session) {
    return (
      <button
        onClick={onSignIn}
        className="text-sm font-medium text-gray-600 hover:text-[#4A90D9] transition-colors"
      >
        Sign in
      </button>
    );
  }

  const { extractionCount, subscriptionStatus } = session.user;
  const isSubscribed = subscriptionStatus === 'active' || subscriptionStatus === 'past_due';
  const remaining = Math.max(0, FREE_LIMIT - extractionCount);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-[#4A90D9] transition-colors"
      >
        <User size={18} weight="bold" />
        <CaretDown size={12} weight="bold" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50">
          {/* Email */}
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-xs text-gray-400">Signed in as</p>
            <p className="text-sm font-medium text-gray-700 truncate">{session.user.email}</p>
          </div>

          {/* Usage / Plan */}
          <div className="px-4 py-3 border-b border-gray-100">
            {isSubscribed ? (
              <p className="text-xs font-medium text-green-600">Pro plan active</p>
            ) : (
              <p className="text-xs font-medium text-gray-500">
                {remaining} of {FREE_LIMIT} free extraction{remaining !== 1 ? 's' : ''} remaining
              </p>
            )}
          </div>

          {/* Actions */}
          {isSubscribed && (
            <button
              onClick={async () => {
                setOpen(false);
                const res = await fetch('/api/stripe/portal', { method: 'POST' });
                const { url } = await res.json();
                window.location.href = url;
              }}
              className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <CreditCard size={16} />
              Manage subscription
            </button>
          )}

          <button
            onClick={() => { setOpen(false); signOut(); }}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <SignOut size={16} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/SessionProvider.tsx components/AccountMenu.tsx app/layout.tsx
git commit -m "feat: add SessionProvider, AccountMenu components and wrap layout"
```

---

### Task 5: Create the AuthModal component

**Files:**
- Create: `components/AuthModal.tsx`

- [ ] **Step 1: Create AuthModal**

```tsx
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { X } from 'lucide-react';
import { EnvelopeSimple, SpinnerGap } from '@phosphor-icons/react';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  message?: string;
}

export default function AuthModal({ open, onClose, message }: AuthModalProps) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    setSending(true);
    try {
      const result = await signIn('email', { email: trimmed, redirect: false });
      if (result?.error) {
        setError('Something went wrong. Please try again.');
      } else {
        setSent(true);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setSent(false);
    setError('');
    setSending(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-sm mx-4 bg-white rounded-3xl shadow-2xl p-8">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={20} />
        </button>

        {sent ? (
          /* ── Check your email ──────────────────── */
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
              <EnvelopeSimple size={32} weight="duotone" className="text-[#4A90D9]" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Check your email</h2>
            <p className="text-sm text-gray-500 mb-6">
              We sent a magic link to <strong className="text-gray-700">{email}</strong>. Click it to sign in.
            </p>
            <button
              onClick={handleClose}
              className="text-sm text-[#4A90D9] font-medium hover:underline"
            >
              Done
            </button>
          </div>
        ) : (
          /* ── Email input ──────────────────────── */
          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-1">Sign in to Popcard</h2>
            <p className="text-sm text-gray-500 mb-6">
              {message ?? 'Enter your email and we\'ll send you a magic link.'}
            </p>

            <form onSubmit={handleSubmit}>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="you@example.com"
                autoFocus
                disabled={sending}
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-[#4A90D9] transition-colors disabled:opacity-50"
              />

              {error && (
                <p className="mt-2 text-xs text-red-500">{error}</p>
              )}

              <button
                type="submit"
                disabled={sending}
                className="w-full mt-4 py-3 rounded-xl bg-[#4A90D9] text-white font-semibold text-sm hover:bg-[#3a7fc8] active:scale-[0.98] disabled:opacity-60 transition-all flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <SpinnerGap size={16} className="animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send magic link'
                )}
              </button>
            </form>

            <p className="mt-4 text-xs text-gray-400 text-center">
              No password needed. We&apos;ll email you a sign-in link.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/AuthModal.tsx
git commit -m "feat: add AuthModal component for magic-link sign-in"
```

---

## Chunk 3: Stripe Integration

### Task 6: Create Stripe client and API routes

**Files:**
- Create: `lib/stripe.ts`
- Create: `app/api/stripe/checkout/route.ts`
- Create: `app/api/stripe/webhook/route.ts`
- Create: `app/api/stripe/portal/route.ts`

- [ ] **Step 1: Add Stripe env vars to `.env.local`**

Get these from https://dashboard.stripe.com/apikeys and https://dashboard.stripe.com/webhooks:

```
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
STRIPE_PRICE_MONTHLY=price_xxxxxxxxxxxx
STRIPE_PRICE_YEARLY=price_xxxxxxxxxxxx
```

Create two products in Stripe Dashboard:
1. "Popcard Pro Monthly" — £3.99/month recurring
2. "Popcard Pro Yearly" — £39.99/year recurring

Copy the Price IDs into the env vars above.

- [ ] **Step 2: Create `lib/stripe.ts`**

```ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});
```

- [ ] **Step 3: Create checkout route `app/api/stripe/checkout/route.ts`**

```ts
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
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

  // Validate the priceId is one of our known prices
  const validPrices = [process.env.STRIPE_PRICE_MONTHLY, process.env.STRIPE_PRICE_YEARLY];
  if (!validPrices.includes(priceId)) {
    return Response.json({ error: 'invalid_price' }, { status: 400 });
  }

  // Look up existing Stripe customer to avoid duplicates
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

  // Use existing customer if we have one, otherwise pass email
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
```

- [ ] **Step 4: Create webhook route `app/api/stripe/webhook/route.ts`**

```ts
import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

// Disable body parsing — we need the raw body for signature verification
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

        // Set Stripe customer ID on user
        await prisma.user.update({
          where: { id: userId },
          data: { stripeCustomerId: session.customer as string },
        });

        // Upsert subscription (idempotent)
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
        await prisma.subscription.update({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            status: subscription.status,
            stripePriceId: subscription.items.data[0].price.id,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          },
        }).catch(() => {
          // Subscription may not exist yet if webhook arrives before checkout.session.completed
          console.warn('[stripe:webhook] subscription.updated for unknown sub:', subscription.id);
        });
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
    // Return 200 anyway so Stripe doesn't retry — we logged the error
    return new Response('Webhook processed with error', { status: 200 });
  }

  return new Response('ok', { status: 200 });
}
```

- [ ] **Step 5: Create portal route `app/api/stripe/portal/route.ts`**

```ts
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user?.stripeCustomerId) {
    return Response.json({ error: 'no_subscription' }, { status: 400 });
  }

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${baseUrl}/`,
  });

  return Response.json({ url: portalSession.url });
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/stripe.ts app/api/stripe/checkout/route.ts app/api/stripe/webhook/route.ts app/api/stripe/portal/route.ts
git commit -m "feat: add Stripe checkout, webhook, and portal API routes"
```

---

## Chunk 4: Usage Tracking & Paywall Gate

### Task 7: Create usage API route

**Files:**
- Create: `app/api/usage/route.ts`

- [ ] **Step 1: Create the usage route**

This route provides two endpoints:
- `GET` — returns the current user's extraction count and subscription status
- `POST` — increments the extraction count (called before each extraction)

```ts
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const FREE_LIMIT = 3;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  return Response.json({
    extractionCount: session.user.extractionCount,
    subscriptionStatus: session.user.subscriptionStatus,
    remaining: Math.max(0, FREE_LIMIT - session.user.extractionCount),
    canExtract:
      session.user.subscriptionStatus === 'active' ||
      session.user.subscriptionStatus === 'past_due' ||
      session.user.extractionCount < FREE_LIMIT,
  });
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Subscribers get unlimited
  const isSubscribed =
    session.user.subscriptionStatus === 'active' ||
    session.user.subscriptionStatus === 'past_due';

  if (!isSubscribed && session.user.extractionCount >= FREE_LIMIT) {
    return Response.json({ error: 'limit_reached', canExtract: false }, { status: 403 });
  }

  // Only increment for non-subscribers
  if (!isSubscribed) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { extractionCount: { increment: 1 } },
    });
  }

  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/usage/route.ts
git commit -m "feat: add usage tracking API route"
```

---

### Task 8: Create PaywallModal component

**Files:**
- Create: `components/PaywallModal.tsx`

- [ ] **Step 1: Create the PaywallModal**

```tsx
'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Lightning, Check, SpinnerGap } from '@phosphor-icons/react';

interface PaywallModalProps {
  open: boolean;
  onClose: () => void;
}

const PLANS = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: '£3.99',
    period: '/month',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY,
    badge: null,
  },
  {
    id: 'yearly',
    name: 'Yearly',
    price: '£39.99',
    period: '/year',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY,
    badge: 'Save 16%',
  },
];

const FEATURES = [
  'Unlimited extractions',
  'YouTube, PDFs & pasted text',
  'TikTok carousel export',
  'Shareable deck links',
  'Priority support',
];

export default function PaywallModal({ open, onClose }: PaywallModalProps) {
  const [loading, setLoading] = useState<string | null>(null);

  if (!open) return null;

  const handleCheckout = async (priceId: string | undefined, planId: string) => {
    if (!priceId) return;
    setLoading(planId);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      const { url, error } = await res.json();
      if (url) {
        window.location.href = url;
      } else {
        console.error('Checkout error:', error);
        setLoading(null);
      }
    } catch {
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-lg mx-4 bg-white rounded-3xl shadow-2xl p-8">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#4A90D9] to-[#6C63FF] flex items-center justify-center">
            <Lightning size={28} weight="fill" className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Upgrade to Popcard Pro</h2>
          <p className="text-sm text-gray-500">
            You&apos;ve used all 3 free extractions. Upgrade for unlimited access.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {PLANS.map((plan) => (
            <button
              key={plan.id}
              onClick={() => handleCheckout(plan.priceId, plan.id)}
              disabled={loading !== null}
              className={`
                relative rounded-2xl border-2 p-5 text-left transition-all
                ${plan.id === 'yearly'
                  ? 'border-[#4A90D9] bg-blue-50/50'
                  : 'border-gray-200 hover:border-gray-300'
                }
                disabled:opacity-60
              `}
            >
              {plan.badge && (
                <span className="absolute -top-2.5 right-3 bg-[#4A90D9] text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {plan.badge}
                </span>
              )}
              <p className="text-sm font-semibold text-gray-700 mb-1">{plan.name}</p>
              <p className="text-2xl font-bold text-gray-900">
                {plan.price}
                <span className="text-sm font-normal text-gray-400">{plan.period}</span>
              </p>
              {loading === plan.id && (
                <SpinnerGap size={20} className="animate-spin text-[#4A90D9] mt-2" />
              )}
            </button>
          ))}
        </div>

        {/* Features */}
        <ul className="space-y-2 mb-6">
          {FEATURES.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm text-gray-600">
              <Check size={16} weight="bold" className="text-green-500 shrink-0" />
              {feature}
            </li>
          ))}
        </ul>

        <p className="text-xs text-gray-400 text-center">
          Cancel anytime. Payments secured by Stripe.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/PaywallModal.tsx
git commit -m "feat: add PaywallModal component with plan cards"
```

---

### Task 9: Add paywall gate to the main page

**Files:**
- Modify: `app/page.tsx`

This is the core integration: adding auth state, modal state, and the paywall gate before extraction.

- [ ] **Step 1: Add new imports to `app/page.tsx`**

After the existing imports (line 1-15), add:

```ts
import { useSession } from 'next-auth/react';
import AuthModal from '@/components/AuthModal';
import PaywallModal from '@/components/PaywallModal';
import AccountMenu from '@/components/AccountMenu';
```

- [ ] **Step 2: Add session hook and modal state inside `HomePage` component**

After line 56 (`export default function HomePage() {`), add the session hook. After the existing state declarations (line 66, `const abortRef`), add:

```ts
  const { data: session, status: sessionStatus, update: updateSession } = useSession();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<SubmitPayload | null>(null);
```

- [ ] **Step 3: Add the paywall gate function**

Before the `handleSubmit` function (before line 144), add:

```ts
  /** Check auth & usage before allowing extraction */
  const checkAccessAndSubmit = async (payload: SubmitPayload) => {
    // Must be signed in
    if (!session) {
      setPendingPayload(payload);
      setShowAuthModal(true);
      return;
    }

    // Check usage
    const usageRes = await fetch('/api/usage');
    const usage = await usageRes.json();

    if (!usage.canExtract) {
      setShowPaywallModal(true);
      return;
    }

    // Increment usage counter (fire-and-forget for non-subscribers)
    const isSubscribed = usage.subscriptionStatus === 'active' || usage.subscriptionStatus === 'past_due';
    if (!isSubscribed) {
      await fetch('/api/usage', { method: 'POST' });
    }

    // Refresh session to get updated count
    await updateSession();

    // Proceed with extraction
    handleSubmit(payload);
  };
```

- [ ] **Step 4: Add effect to handle post-auth redirect**

After the `checkAccessAndSubmit` function, add:

```ts
  // After signing in via magic link, retry the pending payload
  useEffect(() => {
    if (session && pendingPayload) {
      const payload = pendingPayload;
      setPendingPayload(null);
      setShowAuthModal(false);
      checkAccessAndSubmit(payload);
    }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps
```

This requires adding `useEffect` to the existing React import on line 3:

Find: `import { useState, useRef, useCallback } from 'react';`
Replace: `import { useState, useRef, useCallback, useEffect } from 'react';`

- [ ] **Step 5: Update UrlInput's onSubmit to go through the gate**

Find (line 324):
```tsx
<UrlInput onSubmit={(p: SubmitPayload) => handleSubmit(p)} loading={appState === 'loading'} />
```

Replace with:
```tsx
<UrlInput onSubmit={(p: SubmitPayload) => checkAccessAndSubmit(p)} loading={appState === 'loading'} />
```

- [ ] **Step 6: Add AccountMenu to the nav bar**

In the nav section, find the hamburger menu button (lines 268-271):
```tsx
            <button aria-label="Menu" className="flex flex-col gap-[5px] cursor-pointer" onClick={handleReset}>
              <span className="w-5 h-0.5 bg-gray-500 rounded-full block" />
              <span className="w-5 h-0.5 bg-gray-500 rounded-full block" />
            </button>
```

Replace with:
```tsx
            <AccountMenu onSignIn={() => setShowAuthModal(true)} />
```

- [ ] **Step 7: Add remaining-uses indicator below the nav (for free users)**

After the closing `</nav>` tag (line 274), add:

```tsx
      {/* Remaining uses banner for free-tier users */}
      {session && !(['active', 'past_due'].includes(session.user.subscriptionStatus ?? '')) && (
        <div className="bg-blue-50 border-b border-blue-100 py-1.5 text-center">
          <p className="text-xs text-blue-600 font-medium">
            {Math.max(0, 3 - session.user.extractionCount)} of 3 free extractions remaining
            {session.user.extractionCount >= 2 && (
              <button
                onClick={() => setShowPaywallModal(true)}
                className="ml-2 text-[#4A90D9] font-bold hover:underline"
              >
                Upgrade
              </button>
            )}
          </p>
        </div>
      )}
```

- [ ] **Step 8: Add modals at the end of the component, before the closing `</div>`**

Find the last line before the component's closing (line 550):
```tsx
    </div>
  );
}
```

Insert before `</div>`:
```tsx
      {/* Modals */}
      <AuthModal
        open={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        message={pendingPayload ? 'Sign in to start extracting knowledge cards.' : undefined}
      />
      <PaywallModal
        open={showPaywallModal}
        onClose={() => setShowPaywallModal(false)}
      />
```

- [ ] **Step 9: Handle `?subscribed=true` query param for post-checkout celebration**

Add this effect after the existing `useEffect` for pending payload:

```ts
  // Clear ?subscribed=true from URL after checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('subscribed') === 'true') {
      // Remove the query param
      window.history.replaceState({}, '', '/');
      // Refresh session to pick up new subscription
      updateSession();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 10: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add auth/paywall gate before extraction with modals and AccountMenu"
```

---

## Chunk 5: Spotify Removal & Environment Config

### Task 10: Remove Spotify from UrlInput

**Files:**
- Modify: `components/UrlInput.tsx`

- [ ] **Step 1: Remove Spotify from URL validation**

Find the `isValidUrl` function (lines 23-31):

```ts
function isValidUrl(url: string): boolean {
  const trimmed = url.trim();
  return (
    // YouTube
    /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}/.test(trimmed) ||
    // Spotify episode
    /^(https?:\/\/)?open\.spotify\.com\/episode\/[a-zA-Z0-9]{22}/.test(trimmed)
  );
}
```

Replace with:

```ts
function isValidUrl(url: string): boolean {
  const trimmed = url.trim();
  return /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[a-zA-Z0-9_-]{11}/.test(trimmed);
}
```

- [ ] **Step 2: Remove the `detectSource` function (lines 33-37)**

Find:
```ts
function detectSource(url: string): 'youtube' | 'spotify' | null {
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  if (/spotify\.com\/episode/.test(url)) return 'spotify';
  return null;
}
```

Replace with:
```ts
// Source detection (YouTube only for now)
function detectSource(url: string): 'youtube' | null {
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube';
  return null;
}
```

- [ ] **Step 3: Remove the Spotify SVG icon in the input field**

Find the Spotify icon block (lines 145-151):
```tsx
          {/* Source icon */}
          {detected === 'spotify' ? (
            <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 text-[#1DB954]" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
          ) : (
            <Link2 className="text-gray-400 shrink-0" size={20} />
          )}
```

Replace with:
```tsx
          {/* Source icon */}
          <Link2 className="text-gray-400 shrink-0" size={20} />
```

- [ ] **Step 4: Update the `detected` variable (line 109)**

Find:
```ts
  const detected = mode === 'link' && urlValue.trim() ? detectSource(urlValue) : null;
```

This can stay as-is — `detectSource` now only returns `'youtube'` or `null`, which is fine.

- [ ] **Step 5: Update placeholder text (line 159)**

Find:
```tsx
            placeholder="Paste a YouTube or Spotify link..."
```

Replace with:
```tsx
            placeholder="Paste a YouTube link..."
```

- [ ] **Step 6: Update error message (line 65)**

Find:
```ts
        setError("That doesn't look like a YouTube or Spotify link.");
```

Replace with:
```ts
        setError("That doesn't look like a valid YouTube link.");
```

- [ ] **Step 7: Update error message (line 61)**

Find:
```ts
        setError('Paste a YouTube or Spotify link to get started!');
```

Replace with:
```ts
        setError('Paste a YouTube link to get started!');
```

- [ ] **Step 8: Remove the Spotify source hint (lines 321-326)**

Find the entire Spotify hint span:
```tsx
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" style={{ color: '#1DB954' }}>
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            Spotify
          </span>
```

Delete this entire block.

- [ ] **Step 9: Remove `'spotify'` from `SubmitPayload` comment (line 10)**

Find:
```ts
  /** YouTube or Spotify URL */
```

Replace with:
```ts
  /** YouTube URL */
```

- [ ] **Step 10: Commit**

```bash
git add components/UrlInput.tsx
git commit -m "refactor: remove Spotify support from UrlInput"
```

---

### Task 11: Remove Spotify from transcript API route

**Files:**
- Modify: `app/api/transcript/route.ts`

- [ ] **Step 1: Remove Spotify imports (lines 3-9)**

Find:
```ts
import {
  isSpotifyUrl,
  extractSpotifyEpisodeId,
  fetchSpotifyMetadata,
  fetchSpotifyTranscript,
  SpotifyError,
} from '@/lib/spotify';
```

Delete this entire import block.

- [ ] **Step 2: Remove the Spotify branch (lines 50-96)**

Find and delete the entire Spotify section:
```ts
  /* ─── Spotify episode ─────────────────────────────────────── */
  if (isSpotifyUrl(url)) {
    const episodeId = extractSpotifyEpisodeId(url);
    if (!episodeId) {
      return NextResponse.json(
        { error: 'invalid_url', message: 'Could not parse Spotify episode ID.' },
        { status: 400 }
      );
    }

    try {
      const [transcript, metadata] = await Promise.all([
        fetchSpotifyTranscript(episodeId),
        fetchSpotifyMetadata(episodeId),
      ]);

      return NextResponse.json({
        transcript,
        videoId: `spotify-${episodeId}`,
        title: metadata?.title ?? null,
        thumbnailUrl: metadata?.thumbnailUrl ?? null,
        sourceType: 'spotify',
      });
    } catch (err) {
      if (err instanceof SpotifyError) {
        const messages: Record<string, string> = {
          no_transcript:
            "This Spotify episode doesn't have an accessible transcript. Try uploading a PDF or pasting the text instead.",
          invalid_url: "That doesn't look like a valid Spotify episode link.",
          not_episode:
            'Only Spotify podcast episodes are supported (not tracks or albums).',
        };
        return NextResponse.json(
          {
            error: err.code,
            message: messages[err.code] ?? 'Something went wrong.',
          },
          { status: 422 }
        );
      }
      console.error('[transcript:spotify]', err);
      return NextResponse.json(
        { error: 'unknown', message: 'Failed to fetch Spotify transcript.' },
        { status: 500 }
      );
    }
  }
```

Delete all of this. The route now only handles YouTube.

- [ ] **Step 3: Commit**

```bash
git add app/api/transcript/route.ts
git commit -m "refactor: remove Spotify support from transcript API route"
```

---

### Task 12: Remove Spotify from landing page copy and metadata

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Update metadata description in `app/layout.tsx`**

Find (line 13-14):
```ts
  description:
    'Turn YouTube videos, Spotify podcasts, and ebooks into crisp, interactive knowledge cards with AI. Save time and learn faster.',
```

Replace with:
```ts
  description:
    'Turn YouTube videos, PDFs, and articles into crisp, interactive knowledge cards with AI. Save time and learn faster.',
```

- [ ] **Step 2: Update keywords in `app/layout.tsx`**

Find (line 24):
```ts
    'Spotify podcast summary',
```

Replace with:
```ts
    'podcast summary',
```

- [ ] **Step 3: Update OpenGraph description in `app/layout.tsx`**

Find (lines 32-33):
```ts
    description:
      'Turn YouTube videos, Spotify podcasts, and ebooks into crisp, interactive knowledge cards with AI.',
```

Replace with:
```ts
    description:
      'Turn YouTube videos, PDFs, and articles into crisp, interactive knowledge cards with AI.',
```

- [ ] **Step 4: Update Twitter description in `app/layout.tsx`**

Find (lines 43-44):
```ts
    description:
      'Turn YouTube videos, Spotify podcasts, and ebooks into crisp, interactive knowledge cards with AI.',
```

Replace with:
```ts
    description:
      'Turn YouTube videos, PDFs, and articles into crisp, interactive knowledge cards with AI.',
```

- [ ] **Step 5: Update JSON-LD description in `app/layout.tsx`**

Find (lines 63-64):
```ts
  description:
    'Turn YouTube videos, Spotify podcasts, and ebooks into crisp, interactive knowledge cards with AI.',
```

Replace with:
```ts
  description:
    'Turn YouTube videos, PDFs, and articles into crisp, interactive knowledge cards with AI.',
```

- [ ] **Step 6: Update the free pricing to show subscription info in JSON-LD**

Find (line 68):
```ts
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
```

Replace with:
```ts
  offers: { '@type': 'Offer', price: '3.99', priceCurrency: 'GBP', description: 'Pro plan, 3 free extractions included' },
```

- [ ] **Step 7: Update hero subtitle in `app/page.tsx`**

Find (line 316):
```tsx
            Turn videos, podcasts, and books into crisp, interactive cards. Ready to save your time?
```

Replace with:
```tsx
            Turn videos, PDFs, and articles into crisp, interactive cards. Ready to save your time?
```

- [ ] **Step 8: Commit**

```bash
git add app/layout.tsx app/page.tsx
git commit -m "refactor: remove Spotify references from metadata and landing copy"
```

---

### Task 13: Add public Stripe price env vars and final environment setup

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: Add all required env vars**

Ensure `.env.local` has ALL the following new variables (in addition to the existing ones):

```
# ── Auth (NextAuth + Resend) ──────────────────
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<run: openssl rand -base64 32>
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=onboarding@resend.dev

# ── Database (Vercel Postgres) ────────────────
DATABASE_URL=postgres://...

# ── Stripe ────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
STRIPE_PRICE_MONTHLY=price_xxxxxxxxxxxx
STRIPE_PRICE_YEARLY=price_xxxxxxxxxxxx

# ── Public (accessible in client components) ──
NEXT_PUBLIC_STRIPE_PRICE_MONTHLY=price_xxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PRICE_YEARLY=price_xxxxxxxxxxxx
```

Note: The `NEXT_PUBLIC_` versions of the price IDs are needed because `PaywallModal.tsx` runs on the client and reads them at build time via `process.env.NEXT_PUBLIC_*`. The price IDs are not secrets — they're public identifiers.

- [ ] **Step 2: Add these same variables to Vercel**

```bash
vercel env add NEXTAUTH_URL
vercel env add NEXTAUTH_SECRET
vercel env add RESEND_API_KEY
vercel env add EMAIL_FROM
vercel env add DATABASE_URL
vercel env add STRIPE_SECRET_KEY
vercel env add STRIPE_PUBLISHABLE_KEY
vercel env add STRIPE_WEBHOOK_SECRET
vercel env add STRIPE_PRICE_MONTHLY
vercel env add STRIPE_PRICE_YEARLY
vercel env add NEXT_PUBLIC_STRIPE_PRICE_MONTHLY
vercel env add NEXT_PUBLIC_STRIPE_PRICE_YEARLY
```

Note: Set `NEXTAUTH_URL` to the production URL (e.g., `https://popcard-eta.vercel.app`) in production.

- [ ] **Step 3: Set up Stripe webhook endpoint**

In Stripe Dashboard → Developers → Webhooks, add endpoint:
- URL: `https://popcard-eta.vercel.app/api/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- Copy the signing secret to `STRIPE_WEBHOOK_SECRET`

- [ ] **Step 4: No commit needed — .env.local is gitignored**

---

### Task 14: Verify the full flow locally

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test sign-in flow**

1. Open http://localhost:3000
2. Click "Sign in" in the nav
3. Enter an email address
4. Check email for magic link (with Resend sandbox, only verified emails work)
5. Click link → should redirect back to app with session

- [ ] **Step 3: Test extraction gate**

1. As a signed-in user, submit a YouTube URL
2. Verify extraction works and remaining-uses banner updates
3. After 3 extractions, verify the PaywallModal appears

- [ ] **Step 4: Test Stripe checkout**

1. Click a plan in the PaywallModal
2. Should redirect to Stripe Checkout
3. Use test card `4242 4242 4242 4242` with any future expiry and CVC
4. Should redirect back with `?subscribed=true`
5. Verify unlimited extractions now work

- [ ] **Step 5: Test Stripe portal**

1. Click "Manage subscription" in AccountMenu
2. Should open Stripe Customer Portal
3. Cancel subscription → verify status updates

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete paywall system with auth, Stripe, and usage tracking"
```

---
