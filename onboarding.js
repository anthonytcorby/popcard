// Onboarding flow — 5-step Duolingo-style signup:
//   1. Welcome  2. Topic interests  3. Daily goal  4. Language  5. Google auth
//
// Selections are stored in localStorage during the flow (so a refresh doesn't
// lose progress) and shipped to /api/onboarding-prefs after the Google sign-in
// succeeds. If the user is already authenticated and lands here, they get
// bounced straight to /account.
(function () {
  // 6 steps as of Sprint 2: welcome → topics → mode → language → try-a-card → auth.
  // The try-card step is the "experience first, sign up second" hook (Duolingo-style).
  const TOTAL_STEPS = 6;
  const STORAGE_KEY = 'popcardOnboarding';

  // --- Reset escape hatch ----------------------------------------------------
  // Visit /onboarding?reset=1 to wipe saved state, skip the signed-in
  // auto-bounce, and review the flow from step 1 again.
  const RESET = new URLSearchParams(window.location.search).has('reset');
  if (RESET) {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  // --- State -----------------------------------------------------------------
  let state = {
    step: 1,
    topics: [],
    mode: null,
    language: null,
  };
  if (!RESET) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state = Object.assign(state, saved);
    } catch {}
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  // --- DOM hooks -------------------------------------------------------------
  const stepEls = document.querySelectorAll('.ob-step');
  const progressFill = document.getElementById('ob-progress-fill');
  const backBtn = document.getElementById('ob-back');
  const errorEl = document.getElementById('ob-auth-error');

  // --- Step navigation -------------------------------------------------------
  function showStep(n) {
    n = Math.max(1, Math.min(TOTAL_STEPS, n));
    state.step = n;
    save();

    stepEls.forEach((el) => {
      const isCurrent = Number(el.dataset.step) === n;
      el.hidden = !isCurrent;
      el.classList.toggle('is-active', isCurrent);
    });

    progressFill.style.width = ((n - 1) / (TOTAL_STEPS - 1) * 100) + '%';
    backBtn.hidden = n === 1;

    // Reflect saved selections into the UI when navigating back/forward
    syncStepUI(n);
    refreshCTA(n);

    // Replay the welcome typewriter every time step 1 becomes active
    if (n === 1) startWelcomeTypewriter();

    // Analytics — fire one step event per advance (not on initial paint of
    // step 1, that's already covered by the onboarding_started pageview).
    if (n > 1) {
      window.PopcardAnalytics?.track('onboarding_step_completed', {
        from_step: n - 1,
        to_step: n,
      });
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // --- Welcome speech-bubble typewriter --------------------------------------
  // Reveals "Hi, I'm Pop. Let's get you started." one character at a time.
  // Respects prefers-reduced-motion (just shows the full text immediately).
  let welcomeTimer = null;
  function startWelcomeTypewriter() {
    const el = document.getElementById('ob-bubble-text');
    const bubble = el && el.parentElement;
    if (!el || !bubble) return;
    if (welcomeTimer) clearTimeout(welcomeTimer);

    const text = "Hi, I’m Pop. Let’s get you started.";
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      el.textContent = text;
      bubble.classList.add('is-done');
      return;
    }

    bubble.classList.remove('is-done');
    el.textContent = '';
    let i = 0;
    const tick = () => {
      if (i <= text.length) {
        el.textContent = text.slice(0, i);
        // Slow down on punctuation/spaces for a natural rhythm
        const ch = text.charAt(i - 1);
        const delay = ch === '.' || ch === ',' ? 220 : 36;
        i++;
        welcomeTimer = setTimeout(tick, delay);
      } else {
        bubble.classList.add('is-done');
      }
    };
    // Wait for the bubble's fade-in animation (0.2s delay + 0.35s duration) before typing
    welcomeTimer = setTimeout(tick, 600);
  }

  function next() {
    if (!isStepValid(state.step)) return;
    if (state.step < TOTAL_STEPS) {
      showStep(state.step + 1);
    }
  }

  function back() {
    if (state.step > 1) {
      showStep(state.step - 1);
    }
  }

  function isStepValid(n) {
    switch (n) {
      case 1: return true;                          // welcome — always valid
      case 2: return state.topics.length > 0;       // at least one topic
      case 3: return state.mode !== null;
      case 4: return state.language !== null;
      case 5: return state.tryGraded === true;      // try-a-card: must grade before continue
      case 6: return true;                          // auth has its own CTA
      default: return true;
    }
  }

  function refreshCTA(n) {
    const step = document.querySelector(`.ob-step[data-step="${n}"]`);
    if (!step) return;
    const cta = step.querySelector('[data-action="next"]');
    if (cta) cta.disabled = !isStepValid(n);
  }

  // --- Selection handlers ----------------------------------------------------
  // Step 2 — multi-select topic chips
  document.querySelectorAll('#ob-topics .ob-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const v = chip.dataset.value;
      const i = state.topics.indexOf(v);
      if (i === -1) state.topics.push(v); else state.topics.splice(i, 1);
      chip.classList.toggle('is-selected', state.topics.includes(v));
      save();
      refreshCTA(2);
    });
  });

  // Step 3 — single-select mode card (Quick vs Study)
  document.querySelectorAll('#ob-mode .ob-mode-card').forEach((card) => {
    card.addEventListener('click', () => {
      state.mode = card.dataset.value;
      document.querySelectorAll('#ob-mode .ob-mode-card').forEach((c) => {
        c.classList.toggle('is-selected', c === card);
      });
      save();
      refreshCTA(3);
    });
  });

  // Step 4 — single-select language pill
  document.querySelectorAll('#ob-lang .ob-lang').forEach((pill) => {
    pill.addEventListener('click', () => {
      state.language = pill.dataset.value;
      document.querySelectorAll('#ob-lang .ob-lang').forEach((p) => {
        p.classList.toggle('is-selected', p === pill);
      });
      save();
      // Apply the language preference immediately so the rest of the app picks
      // it up via lang-picker.js / i18n.js
      if (window.PopcardLang) window.PopcardLang.set(state.language);
      refreshCTA(4);
    });
  });

  // Step 5 — try a card (flip + grade). The reveal flips the card, then the
  // three grade buttons appear. Picking a grade unlocks CONTINUE and makes
  // Pop react. State.tryGraded is what isStepValid checks.
  const tryCard = document.getElementById('ob-try-card');
  const tryReveal = document.getElementById('ob-try-reveal');
  const tryGrades = document.getElementById('ob-try-grades');
  const tryBubble = document.getElementById('ob-try-bubble');
  const tryMascot = document.getElementById('ob-try-mascot');

  function flipTryCard() {
    if (!tryCard) return;
    if (tryCard.classList.contains('is-flipped')) return;
    tryCard.classList.add('is-flipped');
    if (tryReveal) tryReveal.disabled = true;
    if (tryGrades) {
      // Small delay so the flip finishes before grades pop in.
      setTimeout(() => { tryGrades.hidden = false; }, 350);
    }
    if (tryBubble) {
      tryBubble.innerHTML = '<span>Now grade yourself — how easy was that?</span>';
    }
    window.PopcardAnalytics?.track('onboarding_try_card_revealed');
  }

  if (tryCard) {
    tryCard.addEventListener('click', (e) => {
      if (e.target.closest('.ob-try-grade')) return; // grades handle their own clicks
      flipTryCard();
    });
    tryCard.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipTryCard(); }
    });
  }
  if (tryReveal) tryReveal.addEventListener('click', (e) => { e.stopPropagation(); flipTryCard(); });

  document.querySelectorAll('.ob-try-grade').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const grade = btn.dataset.grade;
      state.tryGraded = true;
      save();
      // Visual: highlight chosen grade, dim others
      document.querySelectorAll('.ob-try-grade').forEach((b) => {
        b.classList.toggle('is-selected', b === btn);
        b.classList.toggle('is-dim', b !== btn);
      });
      // Pop reacts to the grade
      const reactions = {
        hard: { msg: 'Nice work being honest. Pop will show this one to you again soon.', img: '/images/popcard-mascot.png' },
        good: { msg: 'Nailed it. Pop will check back in a couple of days.', img: '/images/mascot-cheer.png' },
        easy: { msg: 'Boom. Pop will park this one for a week — you\'ve got it.', img: '/images/mascot-cheer.png' },
      };
      const r = reactions[grade] || reactions.good;
      if (tryBubble) tryBubble.innerHTML = `<span>${r.msg}</span>`;
      if (tryMascot) tryMascot.src = r.img;
      refreshCTA(5);
      window.PopcardAnalytics?.track('onboarding_try_card_graded', { grade });
    });
  });

  // Re-paint UI to reflect previously-saved selections (e.g. after refresh)
  function syncStepUI(n) {
    if (n === 2) {
      document.querySelectorAll('#ob-topics .ob-chip').forEach((chip) => {
        chip.classList.toggle('is-selected', state.topics.includes(chip.dataset.value));
      });
    } else if (n === 3) {
      document.querySelectorAll('#ob-mode .ob-mode-card').forEach((card) => {
        card.classList.toggle('is-selected', state.mode === card.dataset.value);
      });
    } else if (n === 4) {
      document.querySelectorAll('#ob-lang .ob-lang').forEach((pill) => {
        pill.classList.toggle('is-selected', state.language === pill.dataset.value);
      });
    } else if (n === 5 && state.tryGraded) {
      // If they're coming back to this step having already graded, skip
      // straight to the "now sign up" feeling — flip card + show grades
      // already selected. We don't reset the grade so CONTINUE stays unlocked.
      if (tryCard && !tryCard.classList.contains('is-flipped')) {
        tryCard.classList.add('is-flipped');
      }
      if (tryGrades) tryGrades.hidden = false;
    }
  }

  // --- Continue / Back buttons ----------------------------------------------
  document.querySelectorAll('[data-action="next"]').forEach((btn) => {
    btn.addEventListener('click', next);
  });
  backBtn.addEventListener('click', back);

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'Enter' && isStepValid(state.step)) next();
    if (e.key === 'Escape' && state.step > 1) back();
    if (e.key === 'ArrowLeft' && state.step > 1) back();
  });

  // --- Google auth handler ---------------------------------------------------
  // Called by the GSI script when the user completes the popup
  window.onGoogleCredential = async function (response) {
    if (errorEl) errorEl.hidden = true;
    try {
      const data = await window.PopcardAuth.signInWithGoogle(response.credential);
      if (!data || !data.user) {
        if (errorEl) {
          errorEl.textContent = (data && data.error) || 'Sign-in failed. Please try again.';
          errorEl.hidden = false;
        }
        return;
      }
      window.PopcardAnalytics?.track('signed_up', { method: 'google', via: 'onboarding' });
      window.PopcardAnalytics?.track('onboarding_completed', {
        topics: state.topics,
        default_mode: state.mode,
        language: state.language,
      });

      // Ship onboarding preferences to the backend. Non-blocking — if it
      // fails we still let the user through to the app.
      const prefs = {
        topics: state.topics,
        default_mode: state.mode,
        language: state.language,
      };
      try {
        await fetch('/api/onboarding-prefs', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(prefs),
        });
      } catch {
        /* swallow — preferences are also stashed in localStorage as fallback */
      }

      // Cleanup local state, redirect into the app
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      window.location.href = '/account?welcome=1';
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = 'Network error. Please try again.';
        errorEl.hidden = false;
      }
    }
  };

  // Apple / Facebook sign-up were removed from the UI at launch (Google is the
  // only live provider) rather than shown as non-functional "coming soon"
  // buttons. Re-add the markup + handlers here once their backend flows exist.

  // --- Already signed in? Skip to /account -----------------------------------
  // Skipped when ?reset=1 so you can review the flow even while signed in.
  if (!RESET) {
    (async function autoBounce() {
      try {
        const user = await window.PopcardAuth.me();
        if (user) window.location.href = '/account';
      } catch {}
    })();
  }

  // --- Initial render --------------------------------------------------------
  showStep(state.step);
})();
