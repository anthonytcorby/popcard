# Mobile redesign brief — Popcard

I'm building a web app called **Popcard**. It turns YouTube videos, articles, ebooks, and notes into flashcards. Drop a link in, get a deck of color-coded cards you can study or skim. Target users: students, lifelong learners, people with ADHD, anyone trying to retain what they consume.

Live desktop site: https://www.popcard.me

The desktop site is already designed in a Duolingo-inspired style — bouncy buttons, mascot-driven scenes, big colorful cards. I want **comprehensive mobile UI designs (~375–430px portrait)** for every key screen, in the same style. The mobile pass should be faithful to the brand but designed for thumbs, not patched from desktop.

---

## Brand & design system

### Color palette
- **Purple (primary)**: `#6E3DEA` — deeps `#5826D9` / `#3D1F8F`, soft `#F2EDFF`, ring `#E6DDFF`
- **Pink (accent)**: `#FF3DA0` — deep `#DB1F7E`, soft `#FFEEF6`, ring `#FFD1E5`
- **Yellow (accent)**: `#FFD338` — deep `#E5B30E`, soft `#FFF8DD`, ring `#FFE89B`
- **Green (accent)**: `#2BC489` — deep `#1B9E69`
- **Blue (accent)**: `#3DAEFF` — deep `#1F8DDB`
- **Orange (accent)**: `#FF8A3D` — deep `#DB6A1F`
- **Neutrals**: ink `#0F0F14`, ink-2 `#1F1F2A`, mute `#6B7280`, mute-2 `#9AA0AA`, line `#ECECF0`, line-2 `#F5F5F7`, bg `#FFFFFF`, surface `#FAFAFB`

### Type
- **Display** (headings, buttons): **Sora** (700/800) — fallback Plus Jakarta Sans
- **Wordmark logo only**: **Outfit** (800) — for the "popcard" wordmark in the header/footer
- **Body**: **Plus Jakarta Sans** (500/600/700)

### Radii
sm 10px · md 14px · lg 20px · xl 28px · 2xl 36px · pill 999px

### Visual signatures
- **Chunky buttons** — rounded pill, 2px solid border in the button color, plus a "depth" shadow `box-shadow: 0 4px 0 [color-deep]`. On `:active` the shadow shrinks to `0 2px 0 …` and the button `translateY(2px)` — gives a satisfying pressed-in feel. Examples:
  - Primary: bg `#6E3DEA`, border `#6E3DEA`, shadow `0 4px 0 #5826D9`
  - Secondary: bg `#fff`, border `#E6DDFF`, shadow `0 4px 0 #E6DDFF`, color `#6E3DEA`
  - Yellow: bg `#FFD338`, color `#6E4900`, shadow `0 4px 0 #E5B30E`
  - Pink: bg `#FF3DA0`, color `#fff`, shadow `0 4px 0 #DB1F7E`
- **All-caps button labels** with 0.06em letter spacing
- **Cards/chips** also use the depth-shadow trick: white bg, 2px line border, `0 3px 0 var(--line)` shadow; selected state swaps to purple border + `0 3px 0 var(--purple)`
- **Drop shadows are subtle and downward only** — no glow, no harsh contrast

### Mascot — meet "Pop"
A friendly, blob-shaped character. Available PNG poses (which I have as assets):
- `popcard-mascot.png` — neutral pose (default everywhere)
- `popcard-icon.png` — cropped square head (header logo)
- `hero-drop.png` — Pop with a funnel turning a YouTube/book/article into cards
- `hero-sprint.png` — Pop sprinting with a stopwatch (Quick mode)
- `hero-gist.png` — Pop pinning colored cards onto a bullseye (Study mode)
- `hero-busy.png` — Pop placing colored cards in a progression (Busy brains)
- `hero-language.png` — Pop reading a rainbow book with a globe (Languages)
- `mascot-peek.png` — Pop peeking over a bottom edge (used behind a paste-bar)
- `mascot-wave.mp4`/`.webm` — looping wave animation, 608×640, native white bg (used in onboarding step 1)

**The mascot is the brand.** Use Pop liberally across the mobile designs — but at sizes that don't dominate. On phone think **100–180px tall**, not the 460px we use on desktop.

---

## Style reference: Duolingo mobile
Look-and-feel reference: the Duolingo mobile app's lesson/onboarding screens. Specifically the things to copy:
- Big chunky pill buttons with `0 4px 0` depth shadow that "press in" on tap
- Centered, friendly typography
- One clear action per screen
- Mascot greeting moments
- Soft pastel backgrounds in scenes, white card-on-white pattern for surfaces
- Progress bars at the top of multi-step flows
- Floating circular back button bottom-left
- 16-24px page padding on the sides — never edge-to-edge text

---

## Pages to design (all 375–430px portrait)

### 1. Landing page — 8 scenes, vertical scroll (no scroll-snap on mobile)

#### Scene 1 — Hero
- Header (sticky overlay, ~60–72px tall on phone): mascot icon + "popcard" wordmark left; lang picker pill + small "SIGN UP" purple chip right
- Centered mascot (`popcard-mascot.png`), ~180px tall
- Headline (display 30–40px): **"Remember more from videos, articles, and books — without the boring bits."**
- Lede (16px, mute): "Turn anything you watch or read into cards you'll actually remember."
- Two chunky full-width CTAs stacked:
  - **GET STARTED** (purple, primary) → /onboarding
  - **I ALREADY HAVE AN ACCOUNT** (white outline) → /login

#### Scene 2 — Drop
White section.
- Illustration: `hero-drop.png` (Pop + funnel + YouTube/book/article icons turning into cards). Fit within column, ~280–320px wide.
- Headline (28–36px): **"Drop anything in."**
- Lede: "A YouTube link, a chapter from your textbook, an article you saved. Popcard turns it into cards."
- CTA: **TRY IT NOW** (purple, primary)

#### Scene 3 — Quick mode
White section, yellow accent.
- Illustration: `hero-sprint.png` (Pop sprinting with stopwatch)
- Headline: **"Get the gist in minutes."**
- Lede: "Drop in a long video, article, or chapter and **Quick Mode** pulls out the key ideas fast. No waffle, no overload — just the stuff worth knowing." ("Quick Mode" is purple-bold inline)
- CTA: **TRY QUICK MODE**

#### Scene 4 — Study mode
White section, purple accent.
- Illustration: `hero-gist.png` (Pop pinning cards to a bullseye)
- Headline (two lines): **"Until it / actually sticks."**
- Lede: "**Study Mode** uses spaced reviews, quizzes, and mastery tracking — the science-backed way to remember everything you read, not just for tomorrow, for keeps."
- CTA: **START STUDYING**

#### Scene 5 — Busy brains
White section, pink accent.
- Illustration: `hero-busy.png` (Pop placing colored cards in progression)
- Headline (two lines): **"When walls of text / just don't work."**
- Lede: "Short cards. One idea each. Color, progress, little wins. **Popcard** is designed for the way your brain actually wants to learn."
- CTA: **SEE IT IN ACTION**

#### Scene 6 — Languages
Centered layout.
- Headline: **"Learn in your language."**
- Lede: "Cards and the whole app in **10 languages** — whichever you pick. Tap a flag, get learning."
- Illustration: `hero-language.png` (Pop reading rainbow book with a globe), ~240px wide
- Below: wrap row of 10 language chips with circular flag dots: English · Español · 中文 · हिन्दी · العربية · Português · Français · Deutsch · 日本語 · Русский
- Each chip: white bg, 2px line border, depth shadow, flag circle (18–22px) + name (13px)

#### Scene 7 — Testimonial
Big yellow card.
- Yellow `#FFD338` background, 24–36px border-radius, 2.5px yellow-deep border, `0 5–8px 0 #E5B30E` shadow
- Pop mascot top-center (96–140px), 5 yellow stars below
- Quote (display 18–22px, ink): "I pasted a 2-hour Huberman pod and got 80 cards. Genuinely the only way I finish them now — and remember what I watched."
- Author row (wrap): **Maya R.** · Medical student, London · 4.9★ from 1,000+ learners

#### Scene 8 — Big CTA band
Section background can be purple or white. Currently white with purple accents.
- Brand mark anchored top-left of the section (logo + wordmark, ~30/20px)
- Heading: **"Pop your first deck."**
- Sub: "Paste a YouTube link, article, or ebook — we'll do the rest."
- Mascot peeks up from behind a search bar (`mascot-peek.png`, ~100px)
- Search-bar input: tiny red YouTube icon left, placeholder "Paste a YouTube link…", **POP IT** purple submit on right (pill, depth shadow)
- Three source-type chips below the bar (active = purple ring + soft fill):
  - 📺 YouTube (default active)
  - 📰 Article
  - 📚 Book
- Trust signals row (12–14px, mute): ✓ Free · No card needed · ⚡ 10 seconds · 5,000+ learners

#### Footer
Single column on mobile.
- Brand block: icon + wordmark + tagline ("The fun, effective way to remember what you watch and read.") + social icons (Twitter / Instagram / TikTok / YouTube — 32px white circles, 2px line border)
- Sections (each as a stacked list with all-caps h5 label): **PRODUCT** (Examples, Pricing, Browser extension) · **COMPANY** (About, Help, Contact) · **LEGAL** (Terms, Privacy, Cookies) · **ACCOUNT** (Log in, Sign up)
- Footer bottom: © 2026 Popcard® · language list

---

### 2. Onboarding — 5 single-screen steps

Layout for ALL steps:
- Sticky header: logo top-left, progress bar in the middle (12–14px tall pill, green fill that animates as steps complete), "Skip" text top-right
- Steps occupy the rest of the viewport, centered, with vertical stacking
- Floating circular **back button** bottom-left (44–56px, white with line border + depth shadow), appears on steps 2+

#### Step 1 — Welcome
- Mascot wave video (`mascot-wave.mp4` loops, white bg blends with page), ~110px on phone
- Speech bubble pointing UP at the mascot (because mascot is above on mobile, switches from desktop's right-side bubble)
  - Bubble width 100%, max 280px, purple-ring border, depth shadow, `0 4px 0 ring`
  - Typewriter text at 16px display weight 700: "Hi, I'm Pop. Let's get you started."
  - Tail triangle pointing up from the bubble toward the mascot
- **CONTINUE** chunky purple button, full-width

#### Step 2 — Topics (multi-select)
- Pointing mascot at top (110px)
- Heading (display 24px): **"What do you want to remember?"**
- Sub (14px): "Pick as many as apply."
- Grid of 6 emoji+label chips — single column on phone, each:
  - 14px padding, 2px line border, depth shadow `0 2px 0 line`
  - Emoji ~20px + label (display 13px) in a row
  - Selected = purple border, purple soft bg, `0 2px 0 purple` shadow
  - Options: 📚 Books & ebooks · 📺 YouTube videos · 📄 Articles · 🎙 Podcasts · 🎓 Lectures & notes · 📝 Schoolwork
- **CONTINUE** disabled until at least one selected

#### Step 3 — Mode
- Pointing mascot at top
- Heading: **"What suits you best?"**
- Sub: "Pick a default — you can switch any time."
- Two big mode cards stacked, each:
  - Emoji + body column (label 17px display 800 + 12px sub)
  - "**Quick Mode**" / "Just the gist from videos, articles, and books. Perfect for ADHD, busy days, or when you just want the value — fast." (⚡)
  - "**Study Mode**" / "Quizzes, spaced reviews, reveal cards, mastery tracking. For when you really need to remember it." (🎓)
- **CONTINUE** disabled until one selected

#### Step 4 — Language
- Pointing mascot at top
- Heading: **"Which language for your cards?"**
- Sub: "The whole app will switch to this language."
- Grid of 10 flag+name pills, **2 columns** on phone (forces consistent visual rhythm):
  - English · Español · 中文 · हिन्दी · العربية · Português · Français · Deutsch · 日本語 · Русский
- Each pill: 10×12 padding, white bg, 2px line, depth shadow, 13px display weight 700, flag dot 18px
- **CONTINUE** disabled until one selected

#### Step 5 — Auth
- Cheering mascot at top
- Heading: **"Save your progress."**
- Sub: "Sign in with Google so we can save your decks and streak."
- Google Sign-In button (pill, large theme)
- Fine print: "By continuing you agree to our Terms and Privacy."

---

### 3. Login
- Sticky header: logo top-left, "Sign up" pill top-right
- Centered card stack, full-width on mobile (gap 14px):
  - h1 (24px): "Welcome back."
  - Sub (14px): "Sign in to keep your streak going."
  - Email/password form:
    - Field with all-caps 11px label above + 16px font input (16px to prevent iOS auto-zoom), 2px line border, 14px padding, md radius. Focus = purple border + purple-soft glow ring
    - Password field has a show/hide eye toggle (right-aligned 32px button)
    - Remember-me checkbox + Forgot password link in a between row
  - **LOG IN** chunky purple submit, full-width
  - OR divider (two horizontal lines + text)
  - Social buttons stacked:
    - Google (rendered by Google's GIS — pill, themed)
    - Apple (black bg, white text + Apple glyph, depth shadow `0 3px 0 #000`)
    - Facebook (blue `#1877F2` bg, white text, `0 3px 0 #0d5cba`)
  - "Don't have an account? **Sign up**" link
  - Fine print

---

### 4. Account dashboard
- Standard header (logo+wordmark left, lang picker + **Sign Out** purple chip right)
- **Account card row**:
  - 48px avatar (left, soft purple ring), then:
    - "Hi, [Name] 👋" (display 19px)
    - "Current plan: **FREE**" (13px, with `FREE` as a purple pill 11px caps)
- **(If free) Upgrade panel**:
  - White card, 18px padding, lg radius
  - h2 (18px): "Upgrade to Study"
  - Body (14px): "100 popcards/month, Study Mode, source-linked cards, saved decks, and (soon) Quiz Mode + exports."
  - Full-width **Upgrade to Study · £3.99/mo** purple chunky CTA
- **Decks library**:
  - "Your decks" h2 (20px) · "+ Pop another" purple link
  - Each deck = a white card with line border, single column on mobile:
    - Mode pill (top-left, purple-soft pill, all-caps 11px)
    - Time-ago (top-right, 11px mute)
    - Deck title (15px display 800 ink)
    - Source badge (📝 Text or red YouTube logo + "YouTube") + card count "12 cards" (12px mute)
    - Pin + Delete action buttons in the top-right corner — **always visible on touch** (hidden until hover on desktop)

---

### 5. Deck view (the study screen)
- Standard header
- **Breadcrumb**: "← Your decks"
- **Mode pill** + **deck title** (display 24px) + source URL (12px purple)
- **Deck meta actions row** (flex-wrap chips, each 13px font, 44px min-height): Pin · Rename · Delete · Export (dropdown menu trigger)
- **Single-card view** (the main act):
  - Big card, full-width, ~440px tall, xl radius
  - Card has a purple gradient bg (question side) or a deeper purple gradient (answer side)
  - Topbar: card count + 1-2 colored badges (must-know, definition, example, analogy, etc.)
  - Question text (display 800, 22px on phone)
  - "TAP TO REVEAL" hint at the bottom + a "▶ Watch at 2:34" timestamp pill linking to the YouTube source
  - Card flips on tap to reveal the answer
- **Nav controls below the card**: ← prev (48px white circle), progress bar in the middle, → next (48px purple circle, primary)
- **Actions below**: "Show all cards" link
- Plus a **Take quiz** CTA chip and review-mode triggers

---

## Mobile-specific design rules

- **Target viewport**: 375–430px portrait. Account for safe areas (notch/home indicator) — leave 16–24px breathing room at top + bottom.
- **Touch targets**: every tappable element **≥ 44×44px**. No tiny icon-only buttons.
- **Form inputs must be 16px font** to prevent iOS Safari auto-zoom on focus.
- **Single column everywhere**. No side-by-side layouts.
- **Page side padding**: 16px (12px is the floor; 20px is the ceiling).
- **Chunky buttons stay chunky** but slightly slimmer on mobile: 14–15px font (was 17px on desktop), 16–22px padding (was 20×36).
- **Mascot scales down** to ~100–180px tall on phone (was 220–460px on desktop).
- **Illustrations** should fit within the column at their natural display size — no `transform: scale()` tricks.
- **Snap scroll OFF** on mobile (allows natural scroll momentum). Sticky header is fine but auto-hide-on-scroll-down adds polish.
- **Hover doesn't exist** on touch — design for `:active` press states (translate Y by 1–2px, shrink depth shadow). Anything that's hover-only on desktop must be always-visible on touch.
- **Bottom-anchored primary action** is a Duolingo signature — for the onboarding steps especially, the CONTINUE button should feel anchored near the bottom of the viewport.

---

## Deliverables I want

For each of the page categories (landing scenes 1–8, onboarding steps 1–5, login, account, deck view), produce:

1. **Mobile mockups at 375px width** showing the full scrolled layout (or one screen each for onboarding).
2. **Annotations** for spacing, font sizes, and touch-target sizes.
3. **Hand-off-ready specs** that match the existing color/font/button vocabulary above.
4. **Alternative layout proposals** where the desktop design doesn't translate cleanly (e.g., the testimonial card, the CTA band's peeking mascot composition, the deck card flip — show your version).

The desktop site at https://www.popcard.me is the visual reference. I'll attach screenshots of the key desktop screens to this conversation.

Stack constraint: static HTML + vanilla JS + CSS. No framework. Designs should be implementable as CSS (no animation libraries, no design tokens beyond what's listed).
