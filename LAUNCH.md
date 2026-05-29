# 🚀 Popcard launch checklist

Everything needed to take Popcard live. Work top to bottom.

> **Which folder ships?** All current work lives in **`C:\Users\User\Desktop\claude\popcard`** — that's the tree the dev server runs and everything below was built/verified in. Deploy from here. (There is a separate stale checkout under `…\codex\…\worktrees\…` — ignore it.)

---

## 1. Google OAuth (the one known blocker)

Sign-in is the front door. On `localhost` it shows `GSI_LOGGER: The given origin is not allowed for the given client ID` — this is a **Google Cloud config** issue, not a code bug.

- Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client **`Popcard Web`** (`61959955783-…`).
- **Authorised JavaScript origins** must include your production origin(s):
  - `https://www.popcard.me`
  - `https://popcard.me`
  - (and `http://localhost:3000` if you want local sign-in to work)
- Click **Save**. Propagation takes 5 min–1 hr.
- Verify: load the production site, open the console, confirm the `GSI_LOGGER` error is gone and the Google button renders.

## 2. Environment variables (Vercel → Project → Settings → Environment Variables)

Set these for **Production** (and Preview if you use it). Values for the new ones are in your local `.env.local`.

| Var | Notes |
|---|---|
| `POSTGRES_URL` | Neon connection string (already set) |
| `GOOGLE_CLIENT_ID` | already set |
| `OPENAI_API_KEY` | already set |
| `SESSION_SECRET` | already set |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID_STUDY`, `STRIPE_WEBHOOK_SECRET` | already set |
| `SUPADATA_API_KEY` | YouTube fallback transcription (already set) |
| **`VAPID_PUBLIC_KEY`** | NEW — browser push. Copy from `.env.local` (or run `npm run gen:vapid` for a fresh pair). |
| **`VAPID_PRIVATE_KEY`** | NEW — keep server-only. |
| **`VAPID_SUBJECT`** | NEW — `mailto:hello@popcard.me`. |
| **`CRON_SECRET`** | NEW — protects `/api/cron/notify`. Copy from `.env.local`. |

## 3. Database migrations

Run once against the production Neon DB (idempotent — safe to re-run):

```bash
npm run db:migrate:all
```

This applies all 13 migrations (sessions, streaks, scheduled sessions, notifications, push subscriptions, lessons + crowns, deck review/Pop-checked, etc.).

Optional one-time backfills if you already have decks in prod:
```bash
npm run db:backfill:quiz       # quizzes for existing decks
npm run db:backfill:lessons    # chunk existing decks into lessons
```

## 4. Cron (notifications)

`vercel.json` already declares the cron:
```json
"crons": [{ "path": "/api/cron/notify", "schedule": "*/5 * * * *" }]
```
Vercel auto-registers it on deploy. It fires streak-at-risk + scheduled-session push reminders. No action needed beyond setting `CRON_SECRET`.

## 5. Deploy

```bash
export VERCEL_TOKEN=<token>
./node_modules/.bin/vercel deploy --prod --yes
```
(Do not undo `framework: null` in `vercel.json`. `cleanUrls: true` requires the `/deck/:id → /deck?id=:id` rewrite — already present.)

## 6. Post-deploy smoke test (5 min)

- `/` loads, hero renders, "POP IT" works → onboarding.
- Sign in with Google (after step 1 propagates).
- Pop a YouTube link → deck builds → lesson path + "Pop-checked" badge appear.
- Study a lesson → confetti + sound on finish; streak/sparks increment on `/account`.
- `/blog`, `/how-it-works`, `/pricing`, `/examples` all load.
- `/sitemap.xml` and `/robots.txt` resolve.
- Hit a bad URL → branded `/404` page.

## 7. SEO / ASO go-live

- **Google Search Console**: add `https://www.popcard.me`, verify, submit `https://www.popcard.me/sitemap.xml`.
- **Bing Webmaster Tools**: same.
- Confirm rich results: paste the homepage + a blog URL into Google's Rich Results Test (we ship `SoftwareApplication`, `Article`, `FAQPage`, `Blog` JSON-LD).
- **Replace the placeholder OG image**: social previews currently point at `/images/hero-drop.png`. For best sharing, add a proper 1200×630 `og:image` (e.g. `/images/og-card.png`) and update the `og:image` / `twitter:image` tags on `index.html`, `pricing.html`, `examples.html`, `how-it-works.html`, `blog/*`.
- Blog is live at `/blog` with 6 cornerstone articles targeting: *youtube to flashcards, spaced repetition, active recall, study with ADHD, Quizlet alternative, JungleAI alternative*. Share them; build backlinks.

## 8. Known follow-ups (NOT launch blockers)

- **PDF / file upload** — removed the dashboard "Upload file" + "PDF" chips (they promised unbuilt file handling). YouTube / link / text all work. Build file upload post-launch to match competitors.
- **Anki / PDF export** — pricing no longer claims these; Markdown + TikTok export work.
- **Email digests** — deferred; needs a provider (Resend) + `RESEND_API_KEY`. Browser push covers retention for now.
- **Notification timezone** — cron currently uses a UK/UTC evening window; add per-user timezones before scaling internationally.
- **Stock knowledge library** — `stock_*` tables seeded (Maths + Lit) but unverified/not surfaced; verify + build `/modules` when ready.
- **Delete account** — opens a pre-filled email request (GDPR 30-day). Wire a self-serve endpoint + Stripe cancellation later.

---

**Built for launch:** real spaced repetition, lessons + crown progression, quizzes with smart distractors, an AI tutor grounded in your decks, a "Pop-checked" accuracy pass, streaks + sparks + push reminders, sound + confetti, and an SEO blog. The core loop is done, fact-checked, and fun.
