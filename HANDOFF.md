# Popcard — Claude Dispatch Handoff

Picking up Popcard work from your phone via Claude Dispatch. Paste this file into your first message so the assistant has full context.

## Where things stand

**Live URL:** https://www.popcard.me (Vercel project `anthonycorby-4171s-projects/popcard`)
**Latest production deploy:** `popcard-6m9mrmbi1-anthonycorby-4171s-projects.vercel.app` (ready)
**Repo path on your laptop:** `C:\Users\User\Desktop\claude\popcard`
**Stack:** static HTML + vanilla JS + CSS, Vercel serverless functions in `/api/*` (ESM, `"type": "module"`), Neon Postgres, Google Sign-In, Stripe (test mode), OpenAI `gpt-5-mini`, PostHog + Vercel Analytics, Sora/Plus Jakarta Sans/Outfit fonts.

## What's currently shipped (just deployed)

### Landing page (`index.html`) — Duolingo-style redesign
- 8 vertical scenes, snap-scroll, auto-hide nav on scroll
- Hero: mascot left + "Remember more from videos, articles, and books — without the boring bits." + 2 CTAs (`GET STARTED` → `/onboarding`, `I ALREADY HAVE AN ACCOUNT` → `/login`)
- Drop scene with `hero-drop.png` (mascot + funnel + cards illustration)
- Quick mode "Get the gist in minutes" with `hero-sprint.png` (mascot sprinting w/ stopwatch)
- Study mode "Until it actually sticks" with `hero-gist.png` (mascot pinning cards to bullseye)
- Busy brains "When walls of text just don't work" with `hero-busy.png` (mascot placing cards in progression)
- Languages section with `hero-language.png` + 10-language chip strip
- Testimonial card (yellow)
- CTA band "Pop your first deck" with peeking mascot behind a `[popcard]`-branded search bar, source-type chips (YouTube/Article/Book), and trust signals row
- Multi-column footer

### Onboarding (`/onboarding`)
5-step flow that lives behind `GET STARTED`:
1. **Welcome** — wave-animation video (`mascot-wave.webm/.mp4`, native 608×640, pure-white bg blends into page) + speech-bubble with typewriter "Hi, I'm Pop. Let's get you started."
2. **Topics** — multi-select chips (Books / YouTube / Articles / Podcasts / Lectures / Schoolwork)
3. **Mode** — Quick vs Study cards (renamed from old daily-goal step)
4. **Language** — 10 flag pills, applies live via `lang-picker.js`
5. **Auth** — Google sign-in. On success POSTs prefs to `/api/onboarding-prefs`, redirects to `/account?welcome=1`.

Reset escape hatch: visit `/onboarding?reset=1` to wipe `localStorage.popcardOnboarding` and re-test from step 1 (skips the signed-in auto-bounce).

### Login (`/login`)
Duolingo-style centred card:
- Email + password form (UI only — stub, "coming soon")
- Continue with Google (works)
- Continue with Apple (stub)
- Continue with Facebook (stub)
- Show/hide password eye toggle (works)
- Sign-up link → `/onboarding`

### Analytics
**PostHog wired up.** Set these in Vercel project env (and `.env.local` for dev):
```
POSTHOG_KEY=phc_xxx          # your project API key
POSTHOG_HOST=https://us.i.posthog.com   # or eu.i.posthog.com
```
Until set, PostHog calls silently no-op. Vercel Analytics still works regardless.

**Central wrapper:** `window.PopcardAnalytics.track / identify / reset / flag(name)` in `analytics.js`.
**Pageview events** auto-fire from `page.js` per route (`landing_page_viewed`, `onboarding_started`, `login_viewed`, `pricing_viewed`, `deck_opened`, etc.).
**Funnel events** include: `signed_up`, `onboarding_step_completed`, `onboarding_completed`, `CTA Band Paste`, `Hero Get Started`, scene CTAs, source-chip clicks.
**Identify** runs in `auth.js` when the user loads (`PopcardAnalytics.identify(user.id, { email, name, tier })`). Logout calls `.reset()`.
**Session replay masking:** `<input>` fields with `class="ph-no-capture"` are blocked from recording. Already applied to `#cta-paste`, `#login-id`, `#login-pw`.

### Mascot assets in `/images/`
| File | Used on | Notes |
|---|---|---|
| `popcard-mascot.png` | Generic | Default neutral pose |
| `popcard-icon.png` | Header brand icon | Cropped square head |
| `popcard-logo.png` | Misc | 192×192 logo |
| `hero-drop.png` | Drop scene | Mascot + funnel + cards |
| `hero-quick.png` | (unused now) | Older speedy stopwatch version |
| `hero-sprint.png` | Quick scene | Mascot sprinting with stopwatch |
| `hero-gist.png` | Study scene | Mascot pinning cards to bullseye |
| `hero-busy.png` | Busy scene | Mascot placing progression cards |
| `hero-language.png` | Languages scene | Mascot reading rainbow book + globe |
| `mascot-peek.png` | Below CTA band's search bar | Peeking pose |
| `mascot-wave.webm` + `.mp4` | Onboarding step 1 | Wave animation, native white bg |

## API endpoints currently live

11 of 12 (Hobby-plan cap):
- `/api/auth/google` — Google JWT → cookie session
- `/api/auth/logout` — clear cookie
- `/api/checkout` — Stripe Checkout session
- `/api/config` — public PostHog key (read by `analytics.js`)
- `/api/deck` — GET deck + cards
- `/api/decks` — list (GET) / bulk delete (DELETE) user's decks
- `/api/me` — current user
- `/api/onboarding-prefs` — POST onboarding selections
- `/api/pop` — generate cards (main product action)
- `/api/refine` — regenerate a single card
- `/api/stripe-webhook` — Stripe subscription events

**Disabled** (in `api/_disabled/`, not deployed, code preserved): `collection-card.js`, `collection.js`, `collections.js`, `review.js`, `review-queue.js`, `quiz.js`. Move back to `api/` and redeploy when those features get UI.

## DB migrations needed

Run on Neon when you're ready:
- `node tools/migrate-onboarding.mjs` — adds `users.topic_interests`, `users.default_mode`, `users.preferred_language` (idempotent, safe to re-run; until run, `/api/onboarding-prefs` 200s but doesn't persist)

## Open product TODOs (loose priority)

### High value
1. **Add PostHog key in Vercel env.** Same key to `.env.local` for dev. Until done, no PostHog events flow.
2. **Wire `popcardPendingInput` localStorage value** — the CTA-band paste-and-go writes this; `/account` (or wherever the user lands post-onboarding) should pre-fill the pop input from it.
3. **Build `/account` dashboard properly.** Currently a basic deck list. Should become the gamified hub: streak counter, mascot greeting, daily goal, recent decks, "pop something new" CTA. Phase 1 of the gamification spec (in earlier chat history) covers this.
4. **Pop event tracking on `/api/pop` calls** — `content_dropped_in`, `cards_generated` aren't fired yet because the new flow doesn't wire them up. Add to whatever page hosts the pop input post-onboarding.

### Auth gaps
5. **Email + password auth** — `/login` UI is in place, backend isn't. Adds `users.password_hash` column + bcrypt + `/api/auth/login`, `/api/auth/signup`, password-reset email infra.
6. **Apple Sign In** — needs Apple Developer account + JWT-signed client secret.
7. **Facebook Login** — register a Facebook App, add OAuth.

### Polish
8. **Free-tier quota modal** — currently returns raw 402 when free users hit 10 pops/month; no friendly upgrade prompt yet.
9. **Mobile pass** — most pages have responsive rules but no thorough mobile QA done.
10. **Mascot art still pending** for: sad mascot (broken streak), cheering (achievement unlock), sleeping (overdue review). See earlier image-list document for the full 20-pose library.

### Side-of-desk
11. **Anki/PDF/Markdown export** — promised on pricing page, not built.
12. **Browser extension** — mentioned in footer, not built.
13. **Sentry** for error monitoring — separate install, not started.

## Things to be careful about (don't break)

- `framework: null` in `vercel.json` — without it Vercel auto-detects Next.js.
- `cleanUrls: true` requires the `/deck/:id` rewrite to go to `/deck?id=:id`, not `/deck.html?id=:id`.
- `_lib/`, `_disabled/`, any `_`-prefixed file in `/api/` is excluded from Vercel's function scan.
- Every API module that reads `process.env` at load time must `import './_lib/env.js'` first, otherwise Neon's `POSTGRES_URL` comes through empty in dev.
- Function count cap: 12 on Hobby. Adding a 12th function requires removing/merging another.
- Don't deploy as part of normal iteration — push to GitHub freely, deploy is explicit.

## Useful commands

```bash
# Local dev
cd C:\Users\User\Desktop\claude\popcard
npm start                  # vercel dev on :3000

# Re-deploy
./node_modules/.bin/vercel deploy --prod --yes

# Run migrations
node tools/migrate-onboarding.mjs
```

## Recent design decisions worth remembering

- **Onboarding step 3** was changed from daily-goal (Casual/Serious/Intense) to **mode picker (Quick vs Study)**. Old `daily_goal` column was renamed to `default_mode`. State key in `localStorage.popcardOnboarding` is `mode`, not `goal`.
- **CTA band ("Pop your first deck")** has a peeking mascot behind the search bar, a centred wide bar (max-width 1100), source-type chips below, trust signals below that. Brand mark moved to absolute top-left of the section (`top: 116px; left: 48px`).
- **Footer mascot** was added then removed.
- **Auth flow:** GET STARTED → `/onboarding` (full 5-step funnel). I ALREADY HAVE AN ACCOUNT → `/login` (modal-style centred card).
- **Hero/scenes ditched the eyebrow chips** ("STEP ONE", "QUICK MODE" etc.) — replaced with subtle in-paragraph purple mention via `.mode-name`.
- **Welcome typewriter** types "Hi, I'm Pop. Let's get you started." at ~36 ms/char with longer pauses on `.` and `,`. Bubble is locked at 320×116 px so typing doesn't shift the mascot.
- **All scene CTAs use `btn-primary` (purple)** uniformly; yellow/pink button variants are still defined in CSS but not used.

## Where to start a Dispatch session

A solid one-line prompt that picks up the thread:

> "Here's the Popcard handoff doc. I want to [TASK]. Read the doc, then look at the relevant files and make the change."

Replace `[TASK]` with whatever you want to tackle. Most likely candidates:
- "set up the PostHog env var and check events flow"
- "wire up the /account dashboard with streak counter + popcardPendingInput pre-fill"
- "build email + password auth"
- "draw and integrate the sad/cheering/sleeping mascot variants"
- "track content_dropped_in and cards_generated events on /api/pop calls"

The full Dispatch agent has read-and-execute access to the same repo; it should be able to pick up from here cleanly.
