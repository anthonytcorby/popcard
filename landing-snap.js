// Landing v2 — one-scroll-per-page.
//
// CSS scroll-snap-type only snaps after motion settles; it doesn't force one
// wheel tick to advance one section. This script intercepts the wheel and
// keyboard, debounces, and scrolls to the next/prev .hero | .scene |
// .cta-band-page. After the last section the wheel passes through so the
// user can reach the footer naturally.
//
// Disabled on mobile (touch scroll feels bad with hijacking) and when the
// user has prefers-reduced-motion.
(function () {
  if (!document.body.classList.contains('landing-v2')) return;

  // ---- CTA-band "paste-and-go" → onboarding ----------------------------------
  // Stashes the pasted URL/text in localStorage so /account (or the next page
  // the user lands on after auth) can auto-fill the pop input.
  (function ctaPaste() {
    const form = document.getElementById('cta-paste-form');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('cta-paste');
      const value = (input && input.value || '').trim();
      if (value) {
        try { localStorage.setItem('popcardPendingInput', value); } catch {}
      }
      window.PopcardAnalytics?.track('CTA Band Paste', { hasValue: Boolean(value) });
      window.location.href = '/onboarding';
    });
  })();

  // ---- Source-type chips above the CTA paste bar -----------------------------
  // Each chip swaps the input's placeholder so the user sees what's expected
  // for that source. Click also focuses the input and marks the chip active.
  (function ctaChips() {
    const chips = document.querySelectorAll('.cta-source-chip');
    if (!chips.length) return;
    const PLACEHOLDERS = {
      youtube: 'Paste a YouTube link…',
      article: 'Paste an article URL or text…',
      book:    'Paste a book chapter or upload an ebook after sign-in…',
    };
    const input = document.getElementById('cta-paste');

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const src = chip.dataset.source;
        chips.forEach((c) => c.classList.toggle('is-active', c === chip));
        if (input) {
          input.placeholder = PLACEHOLDERS[src] || 'Paste anything…';
          input.focus();
        }
      });
    });
  })();

  // ---- Auto-hide nav on scroll-down, reveal on scroll-up --------------------
  // Independent of the snap logic below — runs on mobile + reduced-motion too,
  // because the auto-hide nav is a UX feature not an animation flourish.
  (function autohideNav() {
    const header = document.querySelector('.header');
    if (!header) return;
    let lastY = window.scrollY;
    let ticking = false;
    let lockShown = false;        // when true, never hide (set by other sections, e.g. CTA band)
    const SHOW_NEAR_TOP = 80;     // always show when within 80px of top
    const DELTA = 6;              // ignore tiny scroll noise

    function update() {
      const cur = window.scrollY;
      if (lockShown || cur < SHOW_NEAR_TOP) {
        header.classList.remove('is-hidden');
      } else if (cur > lastY + DELTA) {
        header.classList.add('is-hidden');         // scrolling DOWN
      } else if (cur < lastY - DELTA) {
        header.classList.remove('is-hidden');      // scrolling UP
      }
      lastY = cur;
      ticking = false;
    }

    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });

    // Force the nav to come up whenever the "Pop your first deck" CTA band
    // is on screen — that section doesn't have its own brand mark anymore,
    // so the global nav stands in for it.
    const ctaBand = document.querySelector('.cta-band-page');
    if (ctaBand && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            lockShown = true;
            header.classList.remove('is-hidden');
          } else {
            lockShown = false;
          }
        }
      }, { threshold: 0.15 });    // ~15% of section in view triggers
      io.observe(ctaBand);
    }
  })();

  // ---- Snap-scroll (one wheel tick = one section) ---------------------------
  if (window.matchMedia('(max-width: 980px)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  function getSections() {
    return Array.from(document.querySelectorAll(
      '.hero, .scene, .cta-band-page'
    ));
  }

  function currentIndex(sections) {
    // Pick the section whose top is closest to the current scroll position.
    let best = 0;
    let bestDist = Infinity;
    const y = window.scrollY;
    sections.forEach((s, i) => {
      const dist = Math.abs(s.offsetTop - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  }

  function goTo(idx) {
    const sections = getSections();
    idx = Math.max(0, Math.min(sections.length - 1, idx));
    sections[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Wheel cooldown — one full smooth-scroll takes ~500ms; block follow-up
  // wheel events for slightly longer so trackpad inertia doesn't skip
  // multiple sections.
  const COOLDOWN_MS = 750;
  let lastWheelTime = 0;

  window.addEventListener('wheel', (e) => {
    const sections = getSections();
    if (!sections.length) return;
    const idx = currentIndex(sections);
    const lastIdx = sections.length - 1;

    // If we're already on the last section and scrolling DOWN, let the
    // wheel pass through so the user can scroll into the footer naturally.
    if (e.deltaY > 0 && idx >= lastIdx) return;

    // If we're already on the first section and scrolling UP, no-op.
    if (e.deltaY < 0 && idx <= 0) return;

    const now = Date.now();
    if (now - lastWheelTime < COOLDOWN_MS) {
      e.preventDefault();
      return;
    }

    // Ignore tiny pixel-perfect trackpad ticks (some trackpads stream 1-3px
    // deltas during inertia — these shouldn't trigger a section jump).
    if (Math.abs(e.deltaY) < 6) return;

    e.preventDefault();
    lastWheelTime = now;
    goTo(idx + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });

  // Keyboard nav — arrow keys + Page Down/Up + Space. Skip if the user is
  // typing in an input/textarea or interacting with a button (so Enter on a
  // CTA still works).
  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

    const sections = getSections();
    if (!sections.length) return;
    const idx = currentIndex(sections);

    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      goTo(idx + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      goTo(idx - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      goTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      goTo(sections.length - 1);
    }
  });
})();
