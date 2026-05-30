// Practice page — spaced-repetition review session.
//
// MVP scope:
//  - Fetch user's decks → fetch each deck's cards
//  - Show "ready to review" count (placeholder: total cards for now;
//    real spaced-rep due-date filtering comes when /api/review endpoint
//    is restored + mastery PATCH ships)
//  - Session UI: card-flip, self-grade Hard/Good/Easy
//  - Persist grade updates to localStorage so the next session avoids
//    cards you just marked Easy (basic interval bump). Server-side
//    persistence comes later.

(function () {

  const SESSION_SIZE = 10;
  // Note: STORAGE_KEY used to hold per-card localStorage SR state (legacy
  // shadow algorithm). We now read mastery/next_review_at from the server
  // — see /api/review. Old localStorage data is ignored and can be wiped.
  const DECK_FILTER_KEY = 'popcardPracticeDeck';
  // Map server mastery strings → 0..1 for visual progress bars + counting.
  const MASTERY_LEVEL = { new: 0, learning: 0.4, reviewing: 0.7, mastered: 1.0 };

  let allCards = [];          // flat array of cards across decks (the source of truth)
  let activeCards = [];       // filtered subset based on the deck picker
  let decks = [];             // decks list for the picker (id, title, count)
  let deckFilter = 'all';     // 'all' or a specific deck id
  let session = null;         // current session state

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    }[c]));
  }

  // SR state now lives server-side. These helpers read from the card object
  // returned by /api/deck (which now exposes mastery + nextReviewAt) and the
  // updated card returned by POST /api/review.
  function isDue(card) {
    if (!card.nextReviewAt) return true;          // never reviewed → due
    return new Date(card.nextReviewAt).getTime() <= Date.now();
  }
  function masteryLevel(card) {
    return MASTERY_LEVEL[card.mastery] ?? 0;
  }

  // POST a grade. Optimistically updates the in-memory card row from the
  // server response so paintList()/picker counts refresh immediately.
  async function gradeCard(card, grade) {
    try {
      const r = await fetch('/api/review', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: card.id, rating: grade }),
      });
      if (!r.ok) return null;
      const data = await r.json();
      // Mutate the in-memory card so subsequent isDue/masteryLevel reads are
      // up-to-date without a full reload.
      card.mastery = data.mastery;
      card.reviewCount = data.reviewCount;
      card.intervalDays = data.intervalDays;
      card.nextReviewAt = data.nextReviewAt;
      return data;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------
  // Data load — fetches all decks, then all their cards in parallel
  // ---------------------------------------------------------------------
  async function loadAllCards() {
    const r = await fetch('/api/decks?limit=50', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('Failed to load decks');
    const { decks: decksList } = await r.json();
    decks = decksList || [];
    if (!decks.length) return [];

    // Fetch every deck's cards in parallel
    const responses = await Promise.all(
      decks.map((d) => fetch('/api/deck?id=' + encodeURIComponent(d.id), { credentials: 'same-origin' })
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null)
      )
    );
    const cards = [];
    responses.forEach((data, i) => {
      if (!data || !data.cards) return;
      const deck = decks[i];
      data.cards.forEach((c) => {
        // Skip the overview card (position 0) — it's a summary, not a study card
        if (c.position === 0) return;
        cards.push({
          ...c,
          deckId: deck.id,
          deckTitle: deck.title,
          deckMode: deck.mode,
        });
      });
    });
    // Annotate decks with their study-card count (excludes overview cards)
    const counts = new Map();
    cards.forEach((c) => counts.set(c.deckId, (counts.get(c.deckId) || 0) + 1));
    decks = decks.map((d) => ({ ...d, study_count: counts.get(d.id) || 0 }))
                 .filter((d) => d.study_count > 0);
    return cards;
  }

  // ---------------------------------------------------------------------
  // Deck picker — chips above the START button to choose which deck (or
  // all decks) to study. Stores last choice in localStorage so users land
  // back on the same deck.
  // ---------------------------------------------------------------------
  function loadDeckFilter() {
    try { return localStorage.getItem(DECK_FILTER_KEY) || 'all'; }
    catch { return 'all'; }
  }
  function saveDeckFilter(v) {
    try { localStorage.setItem(DECK_FILTER_KEY, v); } catch {}
  }
  function applyDeckFilter() {
    if (deckFilter === 'all') {
      activeCards = allCards.slice();
    } else {
      activeCards = allCards.filter((c) => c.deckId === deckFilter);
      // If the saved deck has been deleted, fall back to All
      if (!activeCards.length && !decks.some((d) => d.id === deckFilter)) {
        deckFilter = 'all';
        saveDeckFilter('all');
        activeCards = allCards.slice();
      }
    }
  }
  function renderDeckPicker() {
    const wrap = document.getElementById('prac-picker');
    const list = document.getElementById('prac-picker-list');
    if (!wrap || !list) return;
    if (decks.length <= 1) {
      // Only one (or zero) deck — picker adds noise. Hide it; default 'all' covers it.
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    const chips = [
      { id: 'all', label: 'All decks', count: allCards.length },
      ...decks.map((d) => ({ id: d.id, label: d.title || 'Untitled', count: d.study_count })),
    ];
    list.innerHTML = chips.map((c) => `
      <button type="button" class="prac-chip${c.id === deckFilter ? ' is-active' : ''}"
              data-deck="${escapeHtml(c.id)}" role="tab" aria-selected="${c.id === deckFilter}">
        <span class="prac-chip-label">${escapeHtml(c.label)}</span>
        <span class="prac-chip-count">${c.count}</span>
      </button>
    `).join('');
    list.querySelectorAll('.prac-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        deckFilter = btn.dataset.deck;
        saveDeckFilter(deckFilter);
        applyDeckFilter();
        renderDeckPicker();
        paintList();
        window.PopcardAnalytics?.track('Practice Deck Filter', { deck: deckFilter });
      });
    });
  }

  // ---------------------------------------------------------------------
  // Paint the list view (stats + start button)
  // ---------------------------------------------------------------------
  function paintList() {
    const due = activeCards.filter(isDue);
    const mastered = activeCards.filter((c) => masteryLevel(c) >= 0.75);
    const learning = activeCards.filter((c) => masteryLevel(c) < 0.75 && masteryLevel(c) > 0);

    document.getElementById('prac-due').textContent = due.length;
    document.getElementById('prac-mastered').textContent = mastered.length;
    document.getElementById('prac-learning').textContent = learning.length;
    document.getElementById('prac-total').textContent = activeCards.length;

    const startBtn = document.getElementById('prac-start');
    const startCount = document.getElementById('prac-start-count');
    const empty = document.getElementById('prac-empty');
    const sub = document.getElementById('prac-sub');

    if (!allCards.length) {
      empty.hidden = false;
      document.getElementById('prac-stats').style.display = 'none';
      startBtn.style.display = 'none';
      return;
    }

    empty.hidden = true;
    document.getElementById('prac-stats').style.display = '';
    startBtn.style.display = '';

    if (!activeCards.length) {
      // Picked deck has no cards (shouldn't happen because we filter empty decks)
      startBtn.disabled = true;
      startCount.textContent = '0 cards';
      sub.textContent = 'This deck has no review-able cards yet.';
      return;
    }

    startBtn.disabled = false;
    const ready = Math.min(SESSION_SIZE, due.length || activeCards.length);
    startCount.textContent = `${ready} card${ready === 1 ? '' : 's'}`;

    const scope = deckFilter === 'all'
      ? 'across all decks'
      : `from “${decks.find((d) => d.id === deckFilter)?.title || 'this deck'}”`;
    if (due.length) {
      sub.textContent = `${due.length} card${due.length === 1 ? ' is' : 's are'} ready to review ${scope}. Sessions are about 3 minutes.`;
    } else {
      sub.textContent = `Nothing's due ${scope} right now — but Pop can shuffle a fresh practice session anyway.`;
    }
  }

  // ---------------------------------------------------------------------
  // Session controller
  // ---------------------------------------------------------------------
  function startSession() {
    // Prefer due cards; pad with random non-due cards if not enough are due.
    // Pool is scoped to the active deck filter.
    const due = activeCards.filter(isDue);
    const queue = due.slice();
    if (queue.length < SESSION_SIZE) {
      const extras = activeCards.filter((c) => !isDue(c));
      shuffle(extras);
      queue.push(...extras.slice(0, SESSION_SIZE - queue.length));
    }
    shuffle(queue);
    const cards = queue.slice(0, SESSION_SIZE);

    if (!cards.length) return;

    session = {
      cards,
      index: 0,
      flipped: false,
      grades: { hard: 0, good: 0, easy: 0 },
      startedAt: Date.now(),
    };

    document.getElementById('prac-list').hidden = true;
    document.getElementById('prac-complete').hidden = true;
    document.getElementById('prac-session').hidden = false;
    document.getElementById('prac-total-session').textContent = cards.length;

    renderCurrentCard();
    window.PopcardAnalytics?.track('Practice Session Start', { count: cards.length });
  }

  function renderCurrentCard() {
    const c = session.cards[session.index];
    document.getElementById('prac-current').textContent = session.index + 1;
    const pct = ((session.index) / session.cards.length) * 100;
    document.getElementById('prac-progress-fill').style.width = pct + '%';

    const tag = c.type ? c.type.charAt(0).toUpperCase() + c.type.slice(1) : 'Card';
    document.getElementById('prac-card-tag').textContent = tag;
    document.getElementById('prac-card-tag-back').textContent = tag;
    document.getElementById('prac-card-q').textContent = c.question || '';
    document.getElementById('prac-card-q-back').textContent = c.question || '';
    document.getElementById('prac-card-a').innerHTML = renderAnswerHtml(c.answer || '');

    // Reset to front face
    document.getElementById('prac-card').classList.remove('is-flipped');
    document.getElementById('prac-grades').hidden = true;
    session.flipped = false;
  }

  // Simple bold rendering so **text** comes through (matches deck-view behaviour)
  function renderAnswerHtml(text) {
    return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');
  }

  function flipCard() {
    if (session.flipped) return;
    session.flipped = true;
    document.getElementById('prac-card').classList.add('is-flipped');
    setTimeout(() => {
      document.getElementById('prac-grades').hidden = false;
    }, 350);
  }

  function applyGrade(grade) {
    const c = session.cards[session.index];
    // Sound feedback — soft tick for "hard", bright ding for good/easy.
    window.PopcardSfx?.[grade === 'hard' ? 'tick' : 'correct']?.();
    // Fire-and-forget: persistence shouldn't block the UI. The local card
    // object gets mutated when the response lands so paintList() reflects
    // truth on return to the list view.
    gradeCard(c, grade);
    session.grades[grade] = (session.grades[grade] || 0) + 1;

    session.index += 1;
    if (session.index >= session.cards.length) {
      completeSession();
    } else {
      renderCurrentCard();
    }
  }

  function completeSession() {
    const total = session.cards.length;
    const { hard, good, easy } = session.grades;
    // Local sparks estimate for the completion screen. The server recomputes
    // its own number (source of truth) — we replace this with the server's
    // value once the POST resolves so the user sees the persisted total.
    const localSparks = hard * 1 + good * 2 + easy * 3;

    document.getElementById('prac-session').hidden = true;
    document.getElementById('prac-complete').hidden = false;
    // Celebrate the finish — fanfare + confetti.
    window.PopcardSfx?.celebrate?.();
    document.getElementById('prac-complete-count').textContent = total;
    document.getElementById('prac-complete-hard').textContent = hard;
    document.getElementById('prac-complete-good').textContent = good;
    document.getElementById('prac-complete-easy').textContent = easy;
    document.getElementById('prac-complete-sparks').textContent = localSparks;

    window.PopcardAnalytics?.track('Practice Session Complete', {
      total: String(total), hard: String(hard), good: String(good), easy: String(easy),
      sparks: String(localSparks),
    });

    // Persist the session server-side. Streak + sparks_total update in the
    // same transaction (see api/session.js). Fire-and-forget: the user sees
    // the celebration screen immediately; if the POST fails we surface a
    // small console note but don't block.
    postSession({
      source: 'practice',
      deckId: deckFilter !== 'all' ? deckFilter : null,
      mode: 'study',
      cardsReviewed: total,
      // 'correct' for a practice session = good + easy (hard means missed it)
      correctCount: good + easy,
      durationMs: session.startedAt ? (Date.now() - session.startedAt) : null,
    }).then((data) => {
      if (data && typeof data.sparksEarned === 'number') {
        document.getElementById('prac-complete-sparks').textContent = data.sparksEarned;
      }
      if (data && data.streak && data.streak.dayChanged) {
        // Refresh the topbar streak chip on the next page nav. Lightweight:
        // update the visible counter in place so the user feels it.
        const el = document.getElementById('dash-streak-num');
        if (el) el.textContent = data.streak.days;
      }
    }).catch(() => {});
  }

  // Generic session POST. Used by completeSession() and (when wired) any
  // other place a study unit completes.
  async function postSession(payload) {
    const r = await fetch('/api/session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) return null;
    return r.json().catch(() => null);
  }

  function quitSession() {
    if (!confirm('Quit this session? Cards you graded will be remembered, but you\'ll lose your in-session streak.')) return;
    document.getElementById('prac-session').hidden = true;
    document.getElementById('prac-list').hidden = false;
    session = null;
    paintList();
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ---------------------------------------------------------------------
  // User menu (mirrors account.js)
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
  // Chrome helpers — toast, sidebar "coming soon" stubs, tier gating.
  // ---------------------------------------------------------------------
  function showToast(msg) {
    const t = document.getElementById('app-toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('is-show'));
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { t.classList.remove('is-show'); setTimeout(() => { t.hidden = true; }, 300); }, 2200);
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
      window.location.href = '/login?next=' + encodeURIComponent('/practice');
      return;
    }
    if (!payload || !payload.user) {
      window.location.href = '/login?next=' + encodeURIComponent('/practice');
      return;
    }

    const { user } = payload;
    const dash = payload.dashboard || {};

    const loader = document.getElementById('account-loading');
    if (loader) loader.hidden = true;

    // Paint user fields
    document.querySelectorAll('[data-auth-only]').forEach((el) => el.style.display = '');
    document.querySelectorAll('[data-auth-name]').forEach((el) => {
      el.textContent = user.name ? user.name.split(' ')[0] : 'there';
    });
    const picEl = document.querySelector('[data-auth-picture]');
    if (picEl && user.picture) picEl.src = user.picture;
    document.getElementById('dash-streak-num').textContent = dash.streak_days ?? 0;
    document.getElementById('dash-sparks-num').textContent = (dash.sparks_total ?? 0).toLocaleString();
    document.querySelectorAll('[data-auth-tier]').forEach((el) => { el.textContent = user.tier || 'free'; });
    applyTier(user.tier);

    setupUserMenu();
    setupSoonStubs();

    document.getElementById('sign-out-btn').addEventListener('click', async () => {
      await window.PopcardAuth.signOut();
      window.location.href = '/';
    });

    document.getElementById('prac-start').addEventListener('click', startSession);
    document.getElementById('prac-card-reveal').addEventListener('click', flipCard);
    document.getElementById('prac-card').addEventListener('click', (e) => {
      // Click anywhere on the card to flip (but not the reveal button itself)
      if (e.target.closest('.prac-card-reveal')) return;
      flipCard();
    });
    document.querySelectorAll('.prac-grade').forEach((btn) => {
      btn.addEventListener('click', () => applyGrade(btn.dataset.grade));
    });
    document.getElementById('prac-quit').addEventListener('click', quitSession);
    document.getElementById('prac-again').addEventListener('click', () => {
      document.getElementById('prac-complete').hidden = true;
      document.getElementById('prac-list').hidden = false;
      paintList();
    });

    // Keyboard shortcuts in session: Space/Enter flip; 1/2/3 grade
    document.addEventListener('keydown', (e) => {
      if (!session) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (!session.flipped) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flipCard(); }
      } else {
        if (e.key === '1') applyGrade('easy');
        else if (e.key === '2') applyGrade('good');
        else if (e.key === '3') applyGrade('hard');
      }
    });

    // Fetch cards
    try {
      allCards = await loadAllCards();
      deckFilter = loadDeckFilter();
      applyDeckFilter();
      renderDeckPicker();
      paintList();
    } catch (err) {
      document.getElementById('prac-sub').textContent = 'Could not load your cards. Try again later.';
    }
  })();

})();
