# Paywall & Stripe Subscription — Design Spec

> **Date:** 2026-04-13
> **Status:** Approved
> **Goal:** Gate extractions after 3 free uses behind a £3.99/month or £39.99/year Stripe subscription, using email magic-link authentication.

---

## 1. Architecture Overview

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Auth | NextAuth.js v4 (Email provider) | Magic-link sign-in, session management |
| Email delivery | Resend | Transactional magic-link emails |
| Database | Vercel Postgres + Prisma ORM | Users, sessions, accounts, usage counts, subscriptions |
| Payments | Stripe Checkout + Webhooks | Subscription billing, plan management |
| Hosting | Vercel (existing) | Serverless functions, edge middleware |

### Data Flow

```
User submits URL → API checks session
  → No session? → Show auth modal (email input → magic link)
  → Session exists? → Check usage count
    → usage < 3 && no subscription? → Allow (decrement remaining)
    → usage >= 3 && no subscription? → Show paywall modal
    → Active subscription? → Allow (unlimited)
```

---

## 2. Authentication Flow

### Magic Link Auth (NextAuth.js Email Provider)

1. User clicks "Sign in" or hits the paywall gate
2. Modal appears with email input field
3. User submits email → NextAuth sends magic link via Resend
4. User clicks link → NextAuth creates session (JWT strategy for Vercel compatibility)
5. Session cookie persists across browser sessions

### Key Decisions

- **JWT strategy** (not database sessions) — works better with Vercel's serverless model
- **JWT freshness** — use NextAuth `session` callback to fetch `subscriptionStatus` and `extractionCount` from the DB on each request, ensuring the JWT reflects current state (important after webhook updates)
- **No password, no OAuth** — magic link only, minimal friction
- **Session includes:** `userId`, `email`, `subscriptionStatus`, `usageCount`
- **Resend** as email provider — simple API, good deliverability, free tier sufficient for launch

### New Files

- `app/api/auth/[...nextauth]/route.ts` — NextAuth config
- `lib/auth.ts` — shared NextAuth options, `getServerSession` helper
- `components/AuthModal.tsx` — email input modal for sign-in

---

## 3. Database Schema (Prisma)

```prisma
// prisma/schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// NextAuth required tables
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

model User {
  id            String    @id @default(cuid())
  email         String?   @unique
  emailVerified DateTime?
  name          String?
  image         String?
  accounts      Account[]
  sessions      Session[]

  // Popcard-specific
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

### Key Decisions

- `extractionCount` on `User` — simple integer, incremented on each successful extraction start
- `Subscription` is a separate model (1:1 with User) — cleaner than cramming Stripe fields into User
- No `Plan` model — only two prices (monthly/yearly), stored as Stripe Price IDs in env vars

---

## 4. Paywall Logic

### Gate Location

**Hard gate at extraction time** — the paywall triggers when the user clicks "Extract" (before any API call to process the video). This prevents wasted compute on users who can't access results.

### Flow

```
User clicks Extract
  → Check: is user signed in?
    → No → Show AuthModal ("Sign in to continue")
    → Yes → Check: user.subscription.status in ('active', 'past_due')?
      → Yes → Proceed (unlimited) — past_due gets a grace period until Stripe cancels
      → No → Check: user.extractionCount < 3?
        → Yes → Proceed, increment extractionCount
        → No → Show PaywallModal
```

### Extraction Counting

- **What counts:** Any successful extraction initiation (YouTube, PDF upload, TikTok storyboard)
- **When incremented:** At the START of extraction (before streaming begins), server-side
- **Failed extractions:** If the extraction fails (network error, invalid URL, API error), the count is NOT rolled back. The count represents "extraction attempts" not "successful extractions." This is simpler to implement and prevents abuse (repeatedly failing requests to game the counter). The 3 free uses are generous enough that losing one to an error is acceptable.
- **Spotify:** Removed entirely (not working yet)
- **Anonymous users:** Cannot extract at all — must sign in first (the 3 free extractions require an account to track)

### Remaining Uses Indicator

- Shown in the header/nav area for signed-in free users: "2 of 3 free extractions remaining"
- Not shown for subscribers or anonymous users
- Updates immediately after each extraction

---

## 5. Stripe Integration

### Products & Prices

| Plan | Price | Stripe Price ID (env var) |
|------|-------|--------------------------|
| Monthly | £3.99/month | `STRIPE_PRICE_MONTHLY` |
| Yearly | £39.99/year | `STRIPE_PRICE_YEARLY` |

### Checkout Flow

1. User hits paywall → PaywallModal shows two plan cards (monthly/yearly)
2. User clicks a plan → POST `/api/stripe/checkout` with `priceId`
3. Server creates Stripe Checkout Session with:
   - `customer` (existing `stripeCustomerId`) OR `customer_email` (first-time checkout) — avoids creating duplicate Stripe customers
   - `mode: 'subscription'`
   - `success_url` → `/` with `?subscribed=true` param
   - `cancel_url` → `/`
   - `metadata.userId` for webhook correlation
4. Redirect to Stripe Checkout
5. On success, Stripe fires webhook → app updates DB

### Webhook Security

All webhook requests MUST be verified using `stripe.webhooks.constructEvent()` with the `stripe-signature` header and `STRIPE_WEBHOOK_SECRET`. Unverified requests must be rejected with 400. The webhook route must use `request.text()` (not `request.json()`) to get the raw body for signature verification.

### Webhook Events

All webhook handlers must be **idempotent** — use `upsert` (keyed on `stripeSubscriptionId`) instead of `create` to handle Stripe's at-least-once delivery guarantee.

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Upsert `Subscription` record, set `stripeCustomerId` on User |
| `customer.subscription.updated` | Update `status`, `currentPeriodEnd`, `cancelAtPeriodEnd` |
| `customer.subscription.deleted` | Set subscription status to `'canceled'` |
| `invoice.payment_failed` | Set subscription status to `'past_due'` |

### Customer Portal

- Link in account dropdown: "Manage subscription"
- Uses Stripe Customer Portal (no custom UI needed)
- Handles: cancel, resubscribe, update payment method, view invoices

### New Files

- `app/api/stripe/checkout/route.ts` — creates Checkout Session
- `app/api/stripe/webhook/route.ts` — handles Stripe events
- `app/api/stripe/portal/route.ts` — creates Customer Portal session
- `components/PaywallModal.tsx` — plan selection UI
- `lib/stripe.ts` — Stripe client initialization

---

## 6. Spotify Removal

Remove all Spotify-related code:

- `components/UrlInput.tsx` — remove Spotify regex pattern, remove Spotify from supported URL hints
- `app/api/transcript/route.ts` — remove Spotify branch in transcript fetching (if any)
- Landing page copy — remove any mention of Spotify from feature lists or descriptions

This is a clean removal (Spotify never worked), not a feature flag.

---

## 7. Environment Variables (New)

```env
# Auth
NEXTAUTH_URL=https://popcard.vercel.app
NEXTAUTH_SECRET=<random-32-chars>

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=noreply@popcard.app

# Database
DATABASE_URL=postgres://...

# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
STRIPE_PRICE_MONTHLY=price_xxxxxxxxxxxx
STRIPE_PRICE_YEARLY=price_xxxxxxxxxxxx
```

---

## 8. Scope Boundaries

### In Scope

- Email magic-link auth (NextAuth + Resend)
- Prisma + Vercel Postgres for persistence
- 3 free extractions per account (hard gate)
- Stripe Checkout for £3.99/month and £39.99/year
- Stripe webhooks for subscription lifecycle
- Stripe Customer Portal for self-service management
- Remaining-uses indicator for free-tier users
- Spotify code removal
- PaywallModal with monthly/yearly plan cards

### Rate Limiter Interaction

The existing Upstash Redis rate limiter (10 requests/60s per IP) remains unchanged and applies to ALL users equally (free and subscribed). The paywall is a separate business-logic gate. The rate limiter prevents abuse; the paywall gates access. They don't conflict — the rate limiter fires first (in the API route), and the paywall gate fires on the client before the API call.

### Session & Account Models

The Prisma schema includes `Session` and `Account` models for NextAuth compatibility. With JWT strategy and email-only auth, the `Session` table won't be populated (JWTs are stateless). The `Account` table is used by NextAuth's Email provider adapter. Both are kept for NextAuth adapter compliance. `VerificationToken` IS actively used for magic link verification.

### Out of Scope

- Team/org accounts
- Trial period (3 free extractions IS the trial)
- Admin dashboard
- Usage analytics beyond extraction count
- Refund handling (done via Stripe dashboard)
- Multiple subscription tiers
- OAuth providers (Google, GitHub, etc.)
