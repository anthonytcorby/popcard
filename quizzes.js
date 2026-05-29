// Quizzes page — MCQ quiz with an onboarding-style quizmaster intro.
//
// Flow:
//   1. Deck picker — pick a deck.
//   2. Welcome intro — quizmaster mascot beside a speech bubble ("Welcome to
//      Quiz Mode!") + START QUIZ button. Styled like onboarding step 1.
//   3. Quiz session — quizmaster asks; tap an option → CHECK → feedback
//      (cheer / random dance on correct, sad on wrong) → CONTINUE → next.
//   4. Complete — score-band mascot (grad / cheer / idle / sad) + Sparks.
//
// 10 MCQs per quiz; distractors drawn from other cards' answers in the deck.
// Need ≥4 cards. Mascot states swap via .is-active inside .qz-stage /
// .qz-complete-stage — each state is an <img> or <video>.

(function () {

  const QUESTIONS_PER_QUIZ = 10;
  const OPTIONS_PER_QUESTION = 4;
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  let decks = [];
  let currentQuiz = null;     // { deckId, deckTitle, questions, index, score }
  let selectedIdx = null;     // null until user picks an answer
  let isGraded = false;       // false until CHECK clicked

  // Held between the deck pick and the welcome-intro START click. The quiz is
  // fetched (and generated server-side on first play) while the welcome shows.
  let pendingQuizPromise = null;
  let pendingDeckId = null;
  let pendingDeckTitle = null;

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

  // YouTube thumbnail from a deck's source (null for non-YouTube decks).
  function youtubeThumb(d) {
    if (!d || d.sourceType !== 'youtube' || !d.sourceUrl) return null;
    const m = String(d.sourceUrl).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg` : null;
  }

  // Swap which mascot state is visible inside a stage element. The matching
  // child gets .is-active; others lose it. CSS handles display. For <video>
  // states we rewind to 0 and play (browsers don't autoplay hidden videos).
  function setStage(stageEl, state) {
    if (!stageEl) return;
    stageEl.dataset.state = state;
    stageEl.querySelectorAll('[data-state]').forEach((el) => {
      const active = el.dataset.state === state;
      el.classList.toggle('is-active', active);
      if (el.tagName === 'VIDEO') {
        if (active) { try { el.currentTime = 0; el.play(); } catch {} }
        else { try { el.pause(); } catch {} }
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

    // Need ≥4 cards to make a quiz.
    const quizzable = decks.filter((d) => (d.cardCount || 0) >= 4);
    if (!quizzable.length) {
      empty.hidden = false;
      return;
    }

    grid.innerHTML = quizzable.map((d) => {
      const yt = youtubeThumb(d);
      const thumb = yt
        ? `<div class="quiz-deck-thumb"><img src="${yt}" alt="" loading="lazy" /><span class="quiz-deck-thumb-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span></div>`
        : '';
      return `
      <div class="quiz-deck${yt ? ' has-thumb' : ''}" data-deck-id="${escapeHtml(d.id)}" data-deck-title="${escapeHtml(d.title || 'Untitled')}" data-card-count="${d.cardCount}">
        ${thumb}
        <span class="quiz-deck-mode" data-mode="${escapeHtml(d.mode)}">${escapeHtml(d.mode)}</span>
        <h3 class="quiz-deck-title">${escapeHtml(d.title || 'Untitled')}</h3>
        <div class="quiz-deck-meta">${d.cardCount} card${d.cardCount === 1 ? '' : 's'}</div>
        <button type="button" class="quiz-deck-cta">Quiz this deck</button>
      </div>`;
    }).join('');

    grid.querySelectorAll('.quiz-deck').forEach((el) => {
      const go = () => startQuiz(el.dataset.deckId, el.dataset.deckTitle);
      el.addEventListener('click', go);
      el.querySelector('.quiz-deck-cta').addEventListener('click', (e) => { e.stopPropagation(); go(); });
    });
  }

  // ---------------------------------------------------------------------
  // Start a quiz. The quiz is generated server-side (with purpose-built,
  // same-concept distractors) and cached on the deck. We kick that fetch off
  // and show the welcome intro immediately — generation overlaps the read.
  // ---------------------------------------------------------------------
  async function fetchQuiz(deckId) {
    const r = await fetch('/api/quiz?id=' + encodeURIComponent(deckId), { credentials: 'same-origin' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const err = new Error(data.message || 'Quiz failed'); err.code = data.error; throw err; }
    return data.questions || [];
  }

  function startQuiz(deckId, deckTitle) {
    pendingDeckId = deckId;
    pendingDeckTitle = deckTitle;
    pendingQuizPromise = fetchQuiz(deckId);
    pendingQuizPromise.catch(() => {});   // surfaced when the user hits START
    showWelcome(deckTitle);
  }

  // ---------------------------------------------------------------------
  // Welcome intro (onboarding-style: quizmaster + speech bubble)
  // ---------------------------------------------------------------------
  function showWelcome(deckTitle) {
    document.getElementById('quiz-list').hidden = true;
    document.getElementById('quiz-session').hidden = true;
    document.getElementById('quiz-complete').hidden = true;
    document.getElementById('quiz-welcome').hidden = false;
    document.body.classList.add('is-quiz-active');

    const deckEl = document.getElementById('quiz-welcome-deck');
    if (deckEl) deckEl.textContent = deckTitle || 'this deck';

    // (Re)start the quizmaster intro video.
    const vid = document.getElementById('quiz-welcome-mascot');
    if (vid && vid.tagName === 'VIDEO') { try { vid.currentTime = 0; vid.play(); } catch {} }
  }

  async function startFromWelcome() {
    if (!pendingQuizPromise) return;
    const startBtn = document.getElementById('quiz-welcome-start');
    const orig = startBtn ? startBtn.textContent : '';
    if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Preparing…'; }
    try {
      const questions = await pendingQuizPromise;
      if (!questions.length) throw new Error('empty');
      launchQuiz(questions);
    } catch (e) {
      if (startBtn) { startBtn.disabled = false; startBtn.textContent = orig || 'START QUIZ'; }
      alert(e.code === 'deck_too_small'
        ? 'This deck needs at least 4 cards to build a quiz.'
        : "Couldn't build a quiz right now. Please try again.");
      cancelWelcome();
    } finally {
      if (startBtn) { startBtn.disabled = false; startBtn.textContent = orig || 'START QUIZ'; }
    }
  }

  function cancelWelcome() {
    document.getElementById('quiz-welcome').hidden = true;
    document.getElementById('quiz-list').hidden = false;
    document.body.classList.remove('is-quiz-active');
    pendingQuizPromise = null;
    pendingDeckId = null;
    pendingDeckTitle = null;
  }

  // Shuffle a question's options and keep correctIndex pointing at the answer.
  function prepQuestion(q) {
    const correctText = q.options[q.correctIndex];
    const options = shuffle(q.options.slice());
    return {
      question: q.question,
      options,
      correctIndex: options.indexOf(correctText),
      explanation: q.explanation || '',
    };
  }

  function launchQuiz(rawQuestions) {
    const questions = shuffle(rawQuestions.slice())
      .slice(0, QUESTIONS_PER_QUIZ)
      .map(prepQuestion);
    currentQuiz = {
      deckId: pendingDeckId,
      deckTitle: pendingDeckTitle,
      questions,
      index: 0,
      score: 0,
      startedAt: Date.now(),
    };

    document.getElementById('quiz-welcome').hidden = true;
    document.getElementById('quiz-session').hidden = false;
    document.getElementById('quiz-total').textContent = questions.length;
    document.getElementById('quiz-score-live').textContent = '0';
    renderQuestion();

    window.PopcardAnalytics?.track('Quiz Start', {
      deckId: pendingDeckId,
      deckTitle: pendingDeckTitle,
      count: questions.length,
    });
  }

  // ---------------------------------------------------------------------
  // Render the current question
  // ---------------------------------------------------------------------
  function renderQuestion() {
    const q = currentQuiz.questions[currentQuiz.index];
    const total = currentQuiz.questions.length;

    selectedIdx = null;
    isGraded = false;

    document.getElementById('quiz-current').textContent = currentQuiz.index + 1;
    document.getElementById('quiz-progress-fill').style.width = ((currentQuiz.index) / total) * 100 + '%';

    // Generated quizzes have no card-type tag — keep the chip empty (CSS hides
    // it when empty) so the focus stays on the question.
    document.getElementById('quiz-question-tag').textContent = '';
    document.getElementById('quiz-question').textContent = q.question;

    // Quizmaster asking — randomly one of the four variants.
    const ASK_STATES = ['ask', 'ask2', 'ask3', 'ask4'];
    setStage(document.getElementById('quiz-stage'), ASK_STATES[Math.floor(Math.random() * ASK_STATES.length)]);

    const fb = document.getElementById('quiz-feedback');
    fb.hidden = true;
    const action = document.getElementById('quiz-action');
    action.classList.remove('is-correct', 'is-wrong');

    // Instant-grade mode: there's no CHECK step — tapping an answer grades it.
    // Hide + disable the action button until then (CONTINUE appears on grading).
    const cta = document.getElementById('quiz-cta');
    cta.style.display = 'none';
    cta.disabled = true;
    cta.classList.remove('is-correct', 'is-wrong');

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

  // Tapping an answer grades it instantly — no separate CHECK step.
  function selectOption(idx) {
    if (isGraded) return;
    selectedIdx = idx;
    document.querySelectorAll('.qz-option').forEach((btn, i) => {
      const on = i === idx;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    checkAnswer();
  }

  // Grade the selected answer (called instantly on tap).
  function checkAnswer() {
    if (selectedIdx === null || isGraded) return;
    const q = currentQuiz.questions[currentQuiz.index];
    const correct = selectedIdx === q.correctIndex;
    if (correct) currentQuiz.score += 1;
    isGraded = true;
    window.PopcardSfx?.[correct ? 'correct' : 'wrong']?.();

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

    // Mascot reaction: correct → 30% still cheer / 70% a random dance video;
    // wrong → sad.
    const CORRECT_DANCES = ['correct-dance', 'correct-dance2', 'correct-dance3'];
    let mascotState;
    if (correct) {
      mascotState = Math.random() < 0.3 ? 'correct' : CORRECT_DANCES[Math.floor(Math.random() * CORRECT_DANCES.length)];
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
    fbText.textContent = correct ? pickCheer() : 'Not quite.';
    const explain = (q.explanation || '').trim();
    if (correct) {
      if (explain) { fbDetail.textContent = explain; fbDetail.hidden = false; }
      else { fbDetail.hidden = true; }
    } else {
      fbDetail.innerHTML = 'Answer: <strong>' + escapeHtml(q.options[q.correctIndex]) + '</strong>'
        + (explain ? '<br>' + escapeHtml(explain) : '');
      fbDetail.hidden = false;
    }

    setCTA('continue', true, correct ? 'correct' : 'wrong');

    document.getElementById('quiz-score-live').textContent = currentQuiz.score;
    document.getElementById('quiz-progress-fill').style.width =
      ((currentQuiz.index + 1) / currentQuiz.questions.length) * 100 + '%';
  }

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
    btn.style.display = '';
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
    const sparks = score * 3 + (pct === 100 ? 20 : 0);   // perfect bonus

    document.getElementById('quiz-session').hidden = true;
    document.getElementById('quiz-complete').hidden = false;
    // Celebrate — bigger burst for a perfect score.
    window.PopcardSfx?.celebrate?.({ intensity: pct === 100 ? 'big' : 'normal' });
    document.getElementById('quiz-score-final').textContent = score;
    document.getElementById('quiz-score-total').textContent = total;
    document.getElementById('quiz-complete-sparks').textContent = sparks;

    const h = document.getElementById('quiz-complete-h');
    const sub = document.getElementById('quiz-complete-sub');
    const stage = document.getElementById('quiz-complete-stage');

    if (pct === 100) {
      h.textContent = 'Perfect score!';
      sub.textContent = 'You absolutely nailed this deck. Pop is proud.';
      setStage(stage, 'grad');
    } else if (pct >= 70) {
      h.textContent = 'Strong work.';
      sub.textContent = 'Solid grasp. A practice session could push this to 100%.';
      setStage(stage, 'cheer');
    } else if (pct >= 40) {
      h.textContent = 'Mid result.';
      sub.textContent = "You're learning. Practice the deck and retake — it'll click.";
      setStage(stage, 'idle');
    } else {
      h.textContent = 'Early days.';
      sub.textContent = 'Take this deck to Practice first, then retake the quiz.';
      setStage(stage, 'sad');
    }

    window.PopcardAnalytics?.track('Quiz Complete', {
      deckId: currentQuiz.deckId,
      score: String(score),
      total: String(total),
      sparks: String(sparks),
    });

    // Persist the session server-side. Streak + sparks_total update in the
    // same transaction. Server computes its own sparks number (clients can't
    // inflate XP); we replace the local estimate with the server's value.
    fetch('/api/session', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'quiz',
        deckId: currentQuiz.deckId,
        mode: 'study',
        cardsReviewed: total,
        correctCount: score,
        durationMs: currentQuiz.startedAt ? (Date.now() - currentQuiz.startedAt) : null,
      }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && typeof data.sparksEarned === 'number') {
          document.getElementById('quiz-complete-sparks').textContent = data.sparksEarned;
        }
        if (data && data.streak && data.streak.dayChanged) {
          const el = document.getElementById('dash-streak-num');
          if (el) el.textContent = data.streak.days;
        }
      })
      .catch(() => {});
  }

  function retake() {
    if (!currentQuiz) return;
    startQuiz(currentQuiz.deckId, currentQuiz.deckTitle);
  }

  function pickDifferentDeck() {
    currentQuiz = null;
    document.getElementById('quiz-complete').hidden = true;
    document.getElementById('quiz-session').hidden = true;
    document.getElementById('quiz-welcome').hidden = true;
    document.getElementById('quiz-list').hidden = false;
    document.body.classList.remove('is-quiz-active');
  }

  function quitQuiz() {
    if (!confirm('Quit this quiz? Your progress will not be saved.')) return;
    pickDifferentDeck();
  }

  // ---------------------------------------------------------------------
  // User menu (shared pattern — see account.js)
  // ---------------------------------------------------------------------
  function setupUserMenu() {
    const chip = document.getElementById('dash-user-chip');
    const menu = document.getElementById('dash-user-menu');
    if (!chip || !menu) return;
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
    menu.querySelectorAll('[role="menuitem"]').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (item.getAttribute('href') === '#') e.preventDefault();
        setOpen(false);
      });
    });
  }

  // ---------------------------------------------------------------------
  // Chrome helpers — toast, "coming soon" sidebar stubs, search, tier.
  // Mirrors the dashboard so the quizzes page behaves the same.
  // ---------------------------------------------------------------------
  function showToast(msg) {
    const t = document.getElementById('app-toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('is-show'));
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      t.classList.remove('is-show');
      setTimeout(() => { t.hidden = true; }, 300);
    }, 2200);
  }

  function setupSoonStubs() {
    document.querySelectorAll('[data-soon]').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (el.tagName === 'A') e.preventDefault();
        showToast((el.dataset.soon || 'This') + ' is coming soon ✨');
      });
    });
  }

  function applyTier(tier) {
    const isFree = (tier === 'free' || !tier);
    document.querySelectorAll('[data-tier-only="free"]').forEach((el) => { el.style.display = isFree ? '' : 'none'; });
  }

  // Filter the deck-picker grid by title (topbar search).
  function setupSearch() {
    const form = document.getElementById('quiz-search-form');
    const input = document.getElementById('quiz-search');
    if (!form || !input) return;
    function filter() {
      const q = (input.value || '').trim().toLowerCase();
      document.querySelectorAll('#quiz-deck-grid .quiz-deck').forEach((card) => {
        const title = (card.dataset.deckTitle || '').toLowerCase();
        card.style.display = (!q || title.includes(q)) ? '' : 'none';
      });
    }
    input.addEventListener('input', filter);
    form.addEventListener('submit', (e) => e.preventDefault());
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
    document.querySelectorAll('[data-auth-tier]').forEach((el) => { el.textContent = user.tier || 'free'; });
    document.getElementById('dash-streak-num').textContent = dash.streak_days ?? 0;
    document.getElementById('dash-sparks-num').textContent = (dash.sparks_total ?? 0).toLocaleString();
    applyTier(user.tier);

    setupUserMenu();
    setupSoonStubs();
    setupSearch();
    document.getElementById('sign-out-btn').addEventListener('click', async () => {
      await window.PopcardAuth.signOut();
      window.location.href = '/';
    });
    document.getElementById('quiz-quit').addEventListener('click', quitQuiz);
    document.getElementById('quiz-cta').addEventListener('click', handleCTAClick);
    document.getElementById('quiz-again').addEventListener('click', retake);
    document.getElementById('quiz-different-deck').addEventListener('click', pickDifferentDeck);

    // Welcome-intro buttons
    document.getElementById('quiz-welcome-start').addEventListener('click', startFromWelcome);
    const welcomeBack = document.getElementById('quiz-welcome-back');
    if (welcomeBack) welcomeBack.addEventListener('click', cancelWelcome);

    const completeClose = document.getElementById('quiz-complete-close');
    if (completeClose) completeClose.addEventListener('click', (e) => {
      e.preventDefault();
      pickDifferentDeck();
    });

    // Keyboard: in the session, A/B/C/D pick; Enter/Space fires CHECK/CONTINUE.
    // On the welcome screen, Enter/Space starts the quiz.
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const welcomeOpen = !document.getElementById('quiz-welcome').hidden;
      if (welcomeOpen && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        startFromWelcome();
        return;
      }

      if (!currentQuiz) return;
      if (document.getElementById('quiz-session').hidden) return;

      if (e.key === 'Enter' || e.key === ' ') {
        const btn = document.getElementById('quiz-cta');
        if (!btn.disabled) { e.preventDefault(); handleCTAClick(); }
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
