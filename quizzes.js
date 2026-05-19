// Quizzes page — Duolingo-style MCQ quiz.
//
// Interaction model:
//   1. User picks a deck → quiz fades in as a full-screen overlay.
//   2. Per question: tap an option to select it (no auto-grade) → CHECK
//      button activates → tap CHECK to grade → feedback panel slides up at
//      the bottom of the screen with mascot reaction → CONTINUE → next.
//   3. End → graduation/cheer/idle/sad mascot by score band, sparks tally.
//
// For each deck the user picks, we fetch all cards, pick up to 10 random
// ones, and generate 3 distractor options per question from OTHER cards'
// answers in the same deck. Need ≥4 cards in a deck to make a quiz.
//
// Mascot states are swapped via .is-active class on the matching element
// inside .qz-stage / .qz-complete-stage. Each state can be an <img> or
// <video> — see HTML for the swap pattern.

(function () {

  const QUESTIONS_PER_QUIZ = 10;
  const OPTIONS_PER_QUESTION = 4;
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  let decks = [];
  let currentQuiz = null;     // { deckId, deckTitle, questions, index, score }
  let selectedIdx = null;     // null until user picks
  let isGraded = false;       // false until CHECK clicked

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    }[c]));
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Swap which mascot state is visible inside a stage element.
  // The matching child gets .is-active; others lose it. CSS handles display.
  // For <video> states (e.g. the dancing mascot), we also rewind to frame 0
  // and call .play() — browsers don't auto-play hidden videos and we want the
  // loop to start fresh each time the user gets a correct answer.
  function setStage(stageEl, state) {
    if (!stageEl) return;
    stageEl.dataset.state = state;
    stageEl.querySelectorAll('[data-state]').forEach((el) => {
      const active = el.dataset.state === state;
      el.classList.toggle('is-active', active);
      if (el.tagName === 'VIDEO') {
        if (active) {
          try { el.currentTime = 0; el.play(); } catch {}
        } else {
          try { el.pause(); } catch {}
        }
      }
    });
  }

  // ---------------------------------------------------------------------
  // Deck picker
  // ---------------------------------------------------------------------
  async function loadDecks() {
    const grid = document.getElementById('quiz-deck-grid');
    const loading = document.getElementById('quiz-loading');
    const empty = document.getElementById('quiz-empty');
    try {
      const r = await fetch('/api/decks?limit=50', { credentials: 'same-origin' });
      if (!r.ok) throw new Error('failed');
      const data = await r.json();
      decks = data.decks || [];
    } catch {
      loading.textContent = "Couldn't load decks. Refresh to try again.";
      return;
    }
    loading.hidden = true;

    // Need to know cardCount to know which decks are quiz-able (≥4 cards)
    const quizzable = decks.filter((d) => (d.cardCount || 0) >= 4);
    if (!quizzable.length) {
      empty.hidden = false;
      return;
    }

    grid.innerHTML = quizzable.map((d) => `
      <div class="quiz-deck" data-deck-id="${escapeHtml(d.id)}" data-deck-title="${escapeHtml(d.title || 'Untitled')}" data-card-count="${d.cardCount}">
        <span class="quiz-deck-mode" data-mode="${escapeHtml(d.mode)}">${escapeHtml(d.mode)}</span>
        <h3 class="quiz-deck-title">${escapeHtml(d.title || 'Untitled')}</h3>
        <div class="quiz-deck-meta">${d.cardCount} card${d.cardCount === 1 ? '' : 's'}</div>
        <button type="button" class="quiz-deck-cta">Quiz this deck</button>
      </div>
    `).join('');

    grid.querySelectorAll('.quiz-deck').forEach((el) => {
      el.addEventListener('click', () => startQuiz(el.dataset.deckId, el.dataset.deckTitle));
    });
  }

  // ---------------------------------------------------------------------
  // Start a quiz: fetch deck, build questions, swap to overlay
  // ---------------------------------------------------------------------
  async function startQuiz(deckId, deckTitle) {
    const cardEl = document.querySelector(`.quiz-deck[data-deck-id="${deckId}"] .quiz-deck-cta`);
    if (cardEl) { cardEl.disabled = true; cardEl.textContent = 'Loading…'; }

    let cards;
    try {
      const r = await fetch('/api/deck?id=' + encodeURIComponent(deckId), { credentials: 'same-origin' });
      if (!r.ok) throw new Error('fetch failed');
      const data = await r.json();
      cards = (data.cards || []).filter((c) => c.position !== 0);   // skip overview card
    } catch {
      alert("Couldn't load this deck. Try a different one.");
      if (cardEl) { cardEl.disabled = false; cardEl.textContent = 'Quiz this deck'; }
      return;
    }
    if (cards.length < 4) {
      alert('Need at least 4 cards to build a quiz.');
      if (cardEl) { cardEl.disabled = false; cardEl.textContent = 'Quiz this deck'; }
      return;
    }

    const questions = buildQuestions(cards);
    currentQuiz = {
      deckId,
      deckTitle,
      questions,
      index: 0,
      score: 0,
    };

    document.getElementById('quiz-list').hidden = true;
    document.getElementById('quiz-complete').hidden = true;
    document.getElementById('quiz-session').hidden = false;
    document.body.classList.add('is-quiz-active');
    document.getElementById('quiz-total').textContent = questions.length;
    document.getElementById('quiz-score-live').textContent = '0';

    if (cardEl) { cardEl.disabled = false; cardEl.textContent = 'Quiz this deck'; }
    renderQuestion();

    window.PopcardAnalytics?.track('Quiz Start', {
      deckId, deckTitle, count: questions.length,
    });
  }

  // Build N MCQ questions from a deck of cards.
  function buildQuestions(cards) {
    const sampleSize = Math.min(QUESTIONS_PER_QUIZ, cards.length);
    const chosen = shuffle(cards.slice()).slice(0, sampleSize);
    const allAnswers = cards.map((c) => c.answer).filter(Boolean);

    return chosen.map((card) => {
      const correct = card.answer;
      const distractors = pickDistractors(correct, allAnswers, OPTIONS_PER_QUESTION - 1);
      const options = shuffle([correct, ...distractors]);
      const correctIndex = options.indexOf(correct);
      return {
        cardId: card.id,
        type: card.type || 'idea',
        question: card.question,
        options,
        correctIndex,
      };
    });
  }
  function pickDistractors(correct, pool, n) {
    const others = pool.filter((a) => a && a !== correct);
    shuffle(others);
    const out = [];
    for (const a of others) {
      if (out.length >= n) break;
      if (a.length > 200 && correct.length <= 80) continue;
      out.push(a);
    }
    while (out.length < n) out.push('(N/A)');
    return out.slice(0, n);
  }

  // ---------------------------------------------------------------------
  // Render the current question
  // ---------------------------------------------------------------------
  function renderQuestion() {
    const q = currentQuiz.questions[currentQuiz.index];
    const total = currentQuiz.questions.length;

    // Reset per-question state
    selectedIdx = null;
    isGraded = false;

    document.getElementById('quiz-current').textContent = currentQuiz.index + 1;
    const pct = ((currentQuiz.index) / total) * 100;
    document.getElementById('quiz-progress-fill').style.width = pct + '%';

    document.getElementById('quiz-question-tag').textContent =
      q.type.charAt(0).toUpperCase() + q.type.slice(1);
    document.getElementById('quiz-question').textContent = q.question;

    // Mascot back to idle/asking state — randomly pick one of the quizmaster
    // variants per question so the reaction has variety.
    const ASK_STATES = ['ask', 'ask2'];
    const askState = ASK_STATES[Math.floor(Math.random() * ASK_STATES.length)];
    setStage(document.getElementById('quiz-stage'), askState);

    // Hide feedback, reset action bar color
    const fb = document.getElementById('quiz-feedback');
    fb.hidden = true;
    const action = document.getElementById('quiz-action');
    action.classList.remove('is-correct', 'is-wrong');

    // Reset CTA
    setCTA('check', false);

    // Render options
    const optsEl = document.getElementById('quiz-options');
    optsEl.innerHTML = q.options.map((opt, i) => `
      <button type="button" class="qz-option" data-idx="${i}" role="radio" aria-checked="false">
        <span class="qz-option-letter">${LETTERS[i]}</span>
        <span class="qz-option-text">${escapeHtml(opt)}</span>
        <span class="qz-option-mark" aria-hidden="true"></span>
      </button>
    `).join('');
    optsEl.querySelectorAll('.qz-option').forEach((btn) => {
      btn.addEventListener('click', () => selectOption(parseInt(btn.dataset.idx, 10)));
    });
  }

  // First step: user taps an option — just mark selected.
  function selectOption(idx) {
    if (isGraded) return;
    selectedIdx = idx;
    document.querySelectorAll('.qz-option').forEach((btn, i) => {
      const on = i === idx;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    setCTA('check', true);
  }

  // Second step: CHECK button grades the answer.
  function checkAnswer() {
    if (selectedIdx === null || isGraded) return;
    const q = currentQuiz.questions[currentQuiz.index];
    const correct = selectedIdx === q.correctIndex;
    if (correct) currentQuiz.score += 1;
    isGraded = true;

    // Mark options visually
    const opts = document.querySelectorAll('.qz-option');
    opts.forEach((btn, i) => {
      btn.disabled = true;
      btn.classList.remove('is-selected');
      if (i === q.correctIndex) {
        btn.classList.add('is-correct');
        btn.querySelector('.qz-option-mark').textContent = '✓';
      }
      if (i === selectedIdx && !correct) {
        btn.classList.add('is-wrong');
        btn.querySelector('.qz-option-mark').textContent = '✕';
      }
    });

    // Swap mascot + colour the action bar + show feedback panel.
    // Correct answers roll a random reaction: ~30% still cheer pose, ~70%
    // one of three dancing video variants (split evenly). Keeps it fresh
    // without the still pose disappearing entirely. To rebalance, change the
    // 0.3 threshold (lower = more dances) or add/remove keys from CORRECT_DANCES.
    const CORRECT_DANCES = ['correct-dance', 'correct-dance2', 'correct-dance3'];
    let mascotState;
    if (correct) {
      if (Math.random() < 0.3) {
        mascotState = 'correct';
      } else {
        mascotState = CORRECT_DANCES[Math.floor(Math.random() * CORRECT_DANCES.length)];
      }
    } else {
      mascotState = 'wrong';
    }
    setStage(document.getElementById('quiz-stage'), mascotState);
    const action = document.getElementById('quiz-action');
    action.classList.toggle('is-correct', correct);
    action.classList.toggle('is-wrong', !correct);

    const fb = document.getElementById('quiz-feedback');
    const fbIcon = document.getElementById('quiz-feedback-icon');
    const fbText = document.getElementById('quiz-feedback-text');
    const fbDetail = document.getElementById('quiz-feedback-detail');
    fb.hidden = false;
    fbIcon.textContent = correct ? '✓' : '✕';
    if (correct) {
      fbText.textContent = pickCheer();
      fbDetail.hidden = true;
    } else {
      fbText.textContent = "Not quite.";
      fbDetail.innerHTML = 'Answer: <strong>' + escapeHtml(q.options[q.correctIndex]) + '</strong>';
      fbDetail.hidden = false;
    }

    // CTA becomes CONTINUE
    setCTA('continue', true, correct ? 'correct' : 'wrong');

    document.getElementById('quiz-score-live').textContent = currentQuiz.score;
    // Bump progress bar to reflect the just-answered question
    const pct = ((currentQuiz.index + 1) / currentQuiz.questions.length) * 100;
    document.getElementById('quiz-progress-fill').style.width = pct + '%';
  }

  // Friendly randomized correct-answer copy, like Duolingo.
  function pickCheer() {
    const cheers = ['Nailed it!', 'Correct!', 'Nice one!', 'Spot on!', 'Sharp!', 'Yes!'];
    return cheers[Math.floor(Math.random() * cheers.length)];
  }

  function nextQuestion() {
    if (!isGraded) return;
    currentQuiz.index += 1;
    if (currentQuiz.index >= currentQuiz.questions.length) {
      completeQuiz();
    } else {
      renderQuestion();
    }
  }

  // One CTA element, two modes: CHECK and CONTINUE.
  function setCTA(mode, enabled, colour) {
    const btn = document.getElementById('quiz-cta');
    btn.dataset.mode = mode;
    btn.disabled = !enabled;
    btn.textContent = mode === 'check' ? 'CHECK' : 'CONTINUE';
    btn.classList.remove('is-correct', 'is-wrong');
    if (colour) btn.classList.add('is-' + colour);
  }
  function handleCTAClick() {
    const mode = document.getElementById('quiz-cta').dataset.mode;
    if (mode === 'check') checkAnswer();
    else nextQuestion();
  }

  // ---------------------------------------------------------------------
  // Complete
  // ---------------------------------------------------------------------
  function completeQuiz() {
    const total = currentQuiz.questions.length;
    const score = currentQuiz.score;
    const pct = (score / total) * 100;
    const sparks = score * 3 + (pct === 100 ? 20 : 0);    // bonus for perfect

    document.getElementById('quiz-session').hidden = true;
    document.getElementById('quiz-complete').hidden = false;
    document.getElementById('quiz-score-final').textContent = score;
    document.getElementById('quiz-score-total').textContent = total;
    document.getElementById('quiz-complete-sparks').textContent = sparks;

    const h = document.getElementById('quiz-complete-h');
    const sub = document.getElementById('quiz-complete-sub');
    const stage = document.getElementById('quiz-complete-stage');

    if (pct === 100) {
      h.textContent = 'Perfect score!';
      sub.textContent = "You absolutely nailed this deck. Pop is proud.";
      setStage(stage, 'grad');
    } else if (pct >= 70) {
      h.textContent = 'Strong work.';
      sub.textContent = "Solid grasp. A practice session could push this to 100%.";
      setStage(stage, 'cheer');
    } else if (pct >= 40) {
      h.textContent = 'Mid result.';
      sub.textContent = "You're learning. Practice the deck and retake — it'll click.";
      setStage(stage, 'idle');
    } else {
      h.textContent = 'Early days.';
      sub.textContent = "Take this deck to Practice first, then retake the quiz.";
      setStage(stage, 'sad');
    }

    window.PopcardAnalytics?.track('Quiz Complete', {
      deckId: currentQuiz.deckId,
      score: String(score),
      total: String(total),
      sparks: String(sparks),
    });
  }

  function retake() {
    if (!currentQuiz) return;
    startQuiz(currentQuiz.deckId, currentQuiz.deckTitle);
  }

  function pickDifferentDeck() {
    currentQuiz = null;
    document.getElementById('quiz-complete').hidden = true;
    document.getElementById('quiz-session').hidden = true;
    document.getElementById('quiz-list').hidden = false;
    document.body.classList.remove('is-quiz-active');
  }

  function quitQuiz() {
    if (!confirm('Quit this quiz? Your progress will not be saved.')) return;
    pickDifferentDeck();
  }

  // ---------------------------------------------------------------------
  // User menu
  // ---------------------------------------------------------------------
  function setupUserMenu() {
    const chip = document.getElementById('dash-user-chip');
    const menu = document.getElementById('dash-user-menu');
    if (!chip || !menu) return;
    // See account.js setupUserMenu — manage open-state via .is-open class so
    // :hover doesn't stick on touch devices and leave the chip "stuck on".
    function setOpen(open) {
      menu.hidden = !open;
      chip.classList.toggle('is-open', open);
      chip.setAttribute('aria-expanded', String(open));
    }
    setOpen(false);
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(menu.hidden);
    });
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !menu.contains(e.target) && !chip.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) { setOpen(false); chip.focus(); }
    });
    // Close menu when any menu item is clicked (see account.js for the why).
    menu.querySelectorAll('[role="menuitem"]').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (item.getAttribute('href') === '#') e.preventDefault();
        setOpen(false);
      });
    });
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  (async function init() {
    let payload;
    try {
      const r = await fetch('/api/me?include=dashboard', { credentials: 'same-origin' });
      if (!r.ok) throw new Error('not signed in');
      payload = await r.json();
    } catch {
      window.location.href = '/login?next=' + encodeURIComponent('/quizzes');
      return;
    }
    if (!payload || !payload.user) {
      window.location.href = '/login?next=' + encodeURIComponent('/quizzes');
      return;
    }

    const { user } = payload;
    const dash = payload.dashboard || {};

    document.querySelectorAll('[data-auth-only]').forEach((el) => el.style.display = '');
    document.querySelectorAll('[data-auth-name]').forEach((el) => {
      el.textContent = user.name ? user.name.split(' ')[0] : 'there';
    });
    const picEl = document.querySelector('[data-auth-picture]');
    if (picEl && user.picture) picEl.src = user.picture;
    document.getElementById('dash-streak-num').textContent = dash.streak_days ?? 0;
    document.getElementById('dash-sparks-num').textContent = (dash.sparks_total ?? 0).toLocaleString();

    setupUserMenu();
    document.getElementById('sign-out-btn').addEventListener('click', async () => {
      await window.PopcardAuth.signOut();
      window.location.href = '/';
    });
    document.getElementById('quiz-quit').addEventListener('click', quitQuiz);
    document.getElementById('quiz-cta').addEventListener('click', handleCTAClick);
    document.getElementById('quiz-again').addEventListener('click', retake);
    document.getElementById('quiz-different-deck').addEventListener('click', pickDifferentDeck);
    // The complete-close link routes back to the deck picker without reloading
    const completeClose = document.getElementById('quiz-complete-close');
    if (completeClose) completeClose.addEventListener('click', (e) => {
      e.preventDefault();
      pickDifferentDeck();
    });

    // Keyboard: A/B/C/D pick option; Enter/Space triggers the CTA (CHECK or CONTINUE)
    document.addEventListener('keydown', (e) => {
      if (!currentQuiz) return;
      if (document.getElementById('quiz-session').hidden) return;   // not in session
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'Enter' || e.key === ' ') {
        const btn = document.getElementById('quiz-cta');
        if (!btn.disabled) {
          e.preventDefault();
          handleCTAClick();
        }
        return;
      }
      const idx = ['a','b','c','d'].indexOf(e.key.toLowerCase());
      if (idx >= 0 && !isGraded) {
        const btn = document.querySelector(`.qz-option[data-idx="${idx}"]`);
        if (btn) btn.click();
      }
    });

    loadDecks();
  })();

})();
