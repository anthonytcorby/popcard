// lesson-path.js — Sprint 3 path + lesson screen.
//
// Renders the deck's lessons as a winding skill-tree path (nodes with crown
// state + lock state), and runs the focused per-lesson session when a node is
// tapped. On completion it POSTs the result to /api/lessons, which bumps the
// crown, then re-renders the path.
//
// Runs independently of deck-view.js: reads the deck id from the URL the same
// way, fetches /api/lessons, and only reveals its section if the deck has
// lessons. The existing flip-card browse / quiz / review stay untouched below.

(function () {
  const pathMatch = window.location.pathname.match(/^\/deck\/([\w-]+)/);
  const params = new URLSearchParams(window.location.search);
  const deckId = pathMatch?.[1] || params.get('id');
  if (!deckId) return;

  const wrap = document.getElementById('deck-path-wrap');
  const track = document.getElementById('deck-path-nodes');
  if (!wrap || !track) return;

  // Lesson screen elements
  const screen = document.getElementById('lesson-screen');
  const stage = document.getElementById('lesson-stage');
  const card = document.getElementById('lesson-card');
  const cardQ = document.getElementById('lesson-card-q');
  const cardQBack = document.getElementById('lesson-card-q-back');
  const cardA = document.getElementById('lesson-card-a');
  const cardTag = document.getElementById('lesson-card-tag');
  const cardTagBack = document.getElementById('lesson-card-tag-back');
  const revealBtn = document.getElementById('lesson-reveal');
  const grades = document.getElementById('lesson-grades');
  const progressFill = document.getElementById('lesson-progress-fill');
  const completeEl = document.getElementById('lesson-complete');
  const stageWrap = stage; // alias

  let lessons = [];
  let session = null;   // { lesson, cards, index, correct, flipped }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    }[c]));
  }
  function renderAnswerHtml(t) {
    return escapeHtml(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');
  }

  // ---------- Path ----------
  async function loadPath() {
    try {
      const r = await fetch('/api/lessons?deckId=' + encodeURIComponent(deckId), { credentials: 'same-origin' });
      if (!r.ok) { wrap.hidden = true; return; }
      const data = await r.json();
      lessons = data.lessons || [];
      if (!lessons.length) { wrap.hidden = true; return; }
      renderPath();
      wrap.hidden = false;
    } catch { wrap.hidden = true; }
  }

  function crownsRow(crown) {
    let html = '';
    for (let i = 0; i < 5; i++) {
      html += `<span class="deck-node-crown${i < crown ? ' is-on' : ''}" aria-hidden="true">&#128081;</span>`;
    }
    return html;
  }

  function renderPath() {
    const totalCrowns = lessons.reduce((s, l) => s + (l.crown || 0), 0);
    const maxCrowns = lessons.length * 5;
    document.getElementById('deck-path-crowns-num').textContent = totalCrowns;
    document.getElementById('deck-path-crowns-max').textContent = maxCrowns;

    // Find the "current" lesson: first unlocked, non-maxed lesson — where Pop sits.
    const currentIdx = lessons.findIndex((l) => l.unlocked && l.crown < 5);

    track.innerHTML = lessons.map((l, i) => {
      const state = l.crown >= 5 ? 'gold'
        : l.crown >= 1 ? 'done'
        : l.unlocked ? 'open'
        : 'locked';
      const side = i % 2 === 0 ? 'left' : 'right';
      const isCurrent = i === currentIdx;
      const lockIco = state === 'locked'
        ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
        : state === 'gold'
        ? '<span class="deck-node-star" aria-hidden="true">&#11088;</span>'
        : `<span class="deck-node-num">${i + 1}</span>`;
      return `
        <div class="deck-node-row deck-node-${side}" role="listitem">
          ${isCurrent ? '<img class="deck-node-mascot" src="/images/popcard-mascot.png" alt="Pop is here" />' : ''}
          <button type="button" class="deck-node deck-node--${state}" data-lesson="${escapeHtml(l.id)}" data-locked="${state === 'locked'}"
                  aria-label="${escapeHtml(l.title)}${state === 'locked' ? ' (locked)' : ''}">
            ${lockIco}
          </button>
          <div class="deck-node-meta">
            <span class="deck-node-title">${escapeHtml(l.title)}</span>
            <span class="deck-node-crowns">${crownsRow(l.crown || 0)}</span>
          </div>
        </div>
      `;
    }).join('');

    track.querySelectorAll('.deck-node').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.locked === 'true') {
          flashLocked(btn);
          return;
        }
        openLesson(btn.dataset.lesson);
      });
    });
  }

  function flashLocked(btn) {
    btn.classList.remove('is-shake');
    // reflow to restart the animation
    void btn.offsetWidth;
    btn.classList.add('is-shake');
  }

  // ---------- Lesson session ----------
  async function openLesson(lessonId) {
    try {
      const r = await fetch('/api/lessons?lessonId=' + encodeURIComponent(lessonId), { credentials: 'same-origin' });
      if (!r.ok) return;
      const data = await r.json();
      const cards = (data.cards || []).filter((c) => c.question);
      if (!cards.length) return;
      session = { lesson: data.lesson, cards, index: 0, correct: 0, flipped: false };
      completeEl.hidden = true;
      stageWrap.hidden = false;
      screen.hidden = false;
      document.body.classList.add('is-lesson-open');
      renderCard();
      window.PopcardAnalytics?.track('Lesson Start', { lessonId, cards: cards.length });
    } catch {}
  }

  function renderCard() {
    const c = session.cards[session.index];
    const tag = c.type ? c.type.charAt(0).toUpperCase() + c.type.slice(1) : 'Card';
    cardTag.textContent = tag;
    cardTagBack.textContent = tag;
    cardQ.textContent = c.question || '';
    cardQBack.textContent = c.question || '';
    cardA.innerHTML = renderAnswerHtml(c.answer || '');
    card.classList.remove('is-flipped');
    grades.hidden = true;
    session.flipped = false;
    const pct = (session.index / session.cards.length) * 100;
    progressFill.style.width = pct + '%';
  }

  function flip() {
    if (session.flipped) return;
    session.flipped = true;
    window.PopcardSfx?.flip?.();
    card.classList.add('is-flipped');
    setTimeout(() => { grades.hidden = false; }, 350);
  }

  function grade(correct) {
    window.PopcardSfx?.[correct ? 'correct' : 'wrong']?.();
    if (correct) session.correct++;
    session.index++;
    if (session.index >= session.cards.length) {
      finishLesson();
    } else {
      renderCard();
    }
  }

  async function finishLesson() {
    const total = session.cards.length;
    const correct = session.correct;
    progressFill.style.width = '100%';
    stageWrap.hidden = true;

    // Report to server → crown logic
    let result = null;
    try {
      const r = await fetch('/api/lessons', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: session.lesson.id, correct, total }),
      });
      if (r.ok) result = await r.json();
    } catch {}

    // Also count this toward the daily session/streak engine (Sprint 1).
    try {
      await fetch('/api/session', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'lesson', deckId: session.lesson.deckId, mode: 'study',
          cardsReviewed: total, correctCount: correct,
        }),
      });
    } catch {}

    const passed = result ? result.passed : (correct / total >= 0.85);
    const crown = result ? result.crown : 0;
    const crownedUp = result ? result.crownedUp : false;

    const crownEl = document.getElementById('lesson-complete-crown');
    const h = document.getElementById('lesson-complete-h');
    const sub = document.getElementById('lesson-complete-sub');
    const score = document.getElementById('lesson-complete-score');
    const redo = document.getElementById('lesson-redo');

    score.textContent = `${correct} / ${total} correct`;
    if (passed) {
      crownEl.textContent = crown >= 5 ? '👑' : '🎉';
      crownEl.classList.add('is-pop');
      h.textContent = crown >= 5 ? 'Gold crown!' : crownedUp ? `Crown ${crown} earned!` : 'Lesson cleared!';
      sub.textContent = crown >= 5
        ? "You've maxed this lesson. That material is locked in for good."
        : crownedUp
          ? `Nice. ${5 - crown} more clean pass${5 - crown === 1 ? '' : 'es'} to gold.`
          : 'Solid pass. Keep climbing.';
      redo.hidden = true;
    } else {
      crownEl.textContent = '💪';
      crownEl.classList.remove('is-pop');
      h.textContent = 'Almost there.';
      sub.textContent = 'You need 85% to earn the crown. Run it back — it sticks faster the second time.';
      redo.hidden = false;
    }

    completeEl.hidden = false;
    // Celebrate a pass — crown jingle + confetti (bigger for gold).
    if (passed) {
      window.PopcardSfx?.crown?.();
      window.PopcardSfx?.confetti?.({ intensity: crown >= 5 ? 'big' : 'normal' });
    }
    window.PopcardAnalytics?.track('Lesson Complete', {
      lessonId: session.lesson.id, correct: String(correct), total: String(total),
      crown: String(crown), passed: String(passed),
    });
  }

  function closeLesson() {
    screen.hidden = true;
    document.body.classList.remove('is-lesson-open');
    session = null;
    loadPath(); // refresh crowns
  }

  // Wire lesson screen controls
  revealBtn?.addEventListener('click', (e) => { e.stopPropagation(); flip(); });
  card?.addEventListener('click', (e) => { if (!e.target.closest('.lesson-reveal')) flip(); });
  grades?.querySelectorAll('.lesson-grade').forEach((btn) => {
    btn.addEventListener('click', () => grade(btn.dataset.correct === '1'));
  });
  document.getElementById('lesson-quit')?.addEventListener('click', closeLesson);
  document.getElementById('lesson-continue')?.addEventListener('click', closeLesson);
  document.getElementById('lesson-redo')?.addEventListener('click', () => {
    const id = session?.lesson?.id;
    closeLessonSilent();
    if (id) openLesson(id);
  });
  function closeLessonSilent() {
    screen.hidden = true;
    document.body.classList.remove('is-lesson-open');
    session = null;
  }

  // "Browse all cards" → reveal the existing flip-card view managed by deck-view.js.
  document.getElementById('deck-path-browse')?.addEventListener('click', () => {
    const cardWrap = document.getElementById('deck-card-wrap');
    if (cardWrap) {
      cardWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  // Keyboard: space/enter flips, 1=missed 2=got
  document.addEventListener('keydown', (e) => {
    if (!session || screen.hidden) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (!session.flipped) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
    } else if (!grades.hidden) {
      if (e.key === '1') grade(false);
      else if (e.key === '2') grade(true);
    }
  });

  // When the deck-enrichment pass re-groups lessons into named, semantic ones
  // (fired from deck-view.js after /api/review-deck), reload the path so the
  // new titles + boundaries appear without a page refresh.
  window.addEventListener('popcard-lessons-regrouped', () => { loadPath(); });

  loadPath();
})();
