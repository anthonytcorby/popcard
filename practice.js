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
  const STORAGE_KEY = 'popcardPracticeProgress';

  let allCards = [];          // flat array of cards across decks
  let session = null;         // current session state

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    }[c]));
  }
  function readProgress() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }
  function writeProgress(p) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
  }
  function cardDueAt(cardId) {
    const p = readProgress();
    const rec = p[cardId];
    if (!rec || !rec.dueAt) return 0;
    return rec.dueAt;
  }
  function gradeCard(cardId, grade) {
    // Grade-based interval bump (light SM-2 sketch). Times in MS.
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;
    const intervals = {
      hard: 4 * HOUR,         // ~4 hours
      good: 2 * DAY,          // ~2 days
      easy: 7 * DAY,          // ~1 week
    };
    const p = readProgress();
    const rec = p[cardId] || { reviewCount: 0, mastery: 0 };
    rec.reviewCount = (rec.reviewCount || 0) + 1;
    rec.lastGrade = grade;
    rec.lastReviewed = Date.now();
    rec.dueAt = Date.now() + (intervals[grade] || DAY);
    // Mastery 0..1 — easy/good push up, hard pulls down
    const delta = grade === 'easy' ? 0.15 : grade === 'good' ? 0.08 : -0.10;
    rec.mastery = Math.max(0, Math.min(1, (rec.mastery || 0) + delta));
    p[cardId] = rec;
    writeProgress(p);
    return rec;
  }
  function isDue(card) {
    const dueAt = cardDueAt(card.id);
    return dueAt <= Date.now();
  }
  function masteryLevel(card) {
    const p = readProgress();
    const rec = p[card.id];
    return rec ? rec.mastery : 0;
  }

  // ---------------------------------------------------------------------
  // Data load — fetches all decks, then all their cards in parallel
  // ---------------------------------------------------------------------
  async function loadAllCards() {
    const r = await fetch('/api/decks?limit=50', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('Failed to load decks');
    const { decks } = await r.json();
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
    return cards;
  }

  // ---------------------------------------------------------------------
  // Paint the list view (stats + start button)
  // ---------------------------------------------------------------------
  function paintList() {
    const due = allCards.filter(isDue);
    const mastered = allCards.filter((c) => masteryLevel(c) >= 0.75);
    const learning = allCards.filter((c) => masteryLevel(c) < 0.75 && masteryLevel(c) > 0);

    document.getElementById('prac-due').textContent = due.length;
    document.getElementById('prac-mastered').textContent = mastered.length;
    document.getElementById('prac-learning').textContent = learning.length;
    document.getElementById('prac-total').textContent = allCards.length;

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
    startBtn.disabled = false;

    const ready = Math.min(SESSION_SIZE, due.length || allCards.length);
    startCount.textContent = `${ready} card${ready === 1 ? '' : 's'}`;

    if (due.length) {
      sub.textContent = `${due.length} card${due.length === 1 ? ' is' : 's are'} ready to review. Sessions are about 3 minutes.`;
    } else {
      sub.textContent = "Nothing's due right now — but Pop can shuffle a fresh practice session anyway.";
    }
  }

  // ---------------------------------------------------------------------
  // Session controller
  // ---------------------------------------------------------------------
  function startSession() {
    // Prefer due cards; pad with random non-due cards if not enough are due
    const due = allCards.filter(isDue);
    const queue = due.slice();
    if (queue.length < SESSION_SIZE) {
      const extras = allCards.filter((c) => !isDue(c));
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
    gradeCard(c.id, grade);
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
    // Sparks: 1 per hard, 2 per good, 3 per easy
    const sparks = hard * 1 + good * 2 + easy * 3;

    document.getElementById('prac-session').hidden = true;
    document.getElementById('prac-complete').hidden = false;
    document.getElementById('prac-complete-count').textContent = total;
    document.getElementById('prac-complete-hard').textContent = hard;
    document.getElementById('prac-complete-good').textContent = good;
    document.getElementById('prac-complete-easy').textContent = easy;
    document.getElementById('prac-complete-sparks').textContent = sparks;

    window.PopcardAnalytics?.track('Practice Session Complete', {
      total: String(total), hard: String(hard), good: String(good), easy: String(easy),
      sparks: String(sparks),
    });
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

    // Paint user fields
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
        if (e.key === '1') applyGrade('hard');
        else if (e.key === '2') applyGrade('good');
        else if (e.key === '3') applyGrade('easy');
      }
    });

    // Fetch cards
    try {
      allCards = await loadAllCards();
      paintList();
    } catch (err) {
      document.getElementById('prac-sub').textContent = 'Could not load your cards. Try again later.';
    }
  })();

})();
