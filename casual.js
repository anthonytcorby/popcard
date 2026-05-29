// Casual page — a stripped-back "just pop and browse" view: one pop bar (creates
// a quick deck) + your decks, searchable from the top bar. No gamification.

(function () {

  // ---- Pop loader (bobbing logo + progress bar; same as the dashboard) ----
  function popDurationEstimate(input) {
    if (/youtube\.com|youtu\.be/.test(input || '')) return 60;
    const n = (input || '').length;
    if (n < 5000) return 16;
    if (n < 50000) return 45;
    if (n < 200000) return 110;
    return 200;
  }
  function startPopLoading(input) {
    const el = document.getElementById('pop-loading');
    const fill = document.getElementById('pop-loading-fill');
    const msg = document.getElementById('pop-loading-msg');
    if (!el) return null;
    el.hidden = false;
    const stages = ['Reading your source…', 'Pulling out the key ideas…', 'Writing your cards…', 'Polishing the details…', 'Almost there…'];
    let pct = 5, stageI = 0;
    if (fill) fill.style.width = '5%';
    if (msg) msg.textContent = stages[0];
    const STEP_MS = 400;
    const perStep = Math.max(0.3, (90 - 5) / ((popDurationEstimate(input) * 1000) / STEP_MS));
    const timer = setInterval(() => {
      pct = Math.min(92, pct + perStep);
      if (fill) fill.style.width = pct.toFixed(1) + '%';
      const want = Math.min(stages.length - 1, Math.floor((pct / 92) * stages.length));
      if (want !== stageI) { stageI = want; if (msg) msg.textContent = stages[stageI]; }
    }, STEP_MS);
    return {
      finish() { clearInterval(timer); if (fill) fill.style.width = '100%'; },
      fail() { clearInterval(timer); el.hidden = true; if (fill) fill.style.width = '5%'; },
    };
  }

  function setupPopForm() {
    const form = document.getElementById('casual-pop-form');
    const input = document.getElementById('casual-pop-input');
    const btn = document.getElementById('casual-pop-btn');
    const status = document.getElementById('casual-pop-status');
    if (!form) return;

    try {
      const pending = localStorage.getItem('popcardPendingInput');
      if (pending) { input.value = pending; localStorage.removeItem('popcardPendingInput'); }
    } catch {}

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = (input.value || '').trim();
      if (!value) { input.focus(); return; }
      btn.classList.add('is-loading'); btn.disabled = true;
      status.hidden = true; status.classList.remove('is-error');
      const loader = startPopLoading(value);
      try {
        // Casual = quick mode (lighter, fewer cards).
        const r = await fetch('/api/pop', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: value, mode: 'quick' }),
        });
        const data = await r.json();
        if (!r.ok) {
          loader?.fail();
          status.hidden = false; status.classList.add('is-error');
          if (r.status === 402) {
            status.innerHTML = '';
            const msg = document.createElement('span');
            msg.textContent = data.message || 'You’ve hit your monthly limit. Upgrade to keep popping.';
            const link = document.createElement('a');
            link.href = '/pricing';
            link.textContent = ' Upgrade →';
            link.className = 'dash-status-cta';
            status.appendChild(msg); status.appendChild(link);
          } else {
            status.textContent = data.message || data.error || 'Something went sideways. Try again?';
          }
          return;
        }
        window.PopcardAnalytics?.track('Casual Pop', { fromCache: String(Boolean(data.fromCache)) });
        loader?.finish();
        window.location.href = '/deck/' + data.deck.id;
      } catch {
        loader?.fail();
        status.hidden = false; status.classList.add('is-error');
        status.textContent = 'Network error. Check your connection and try again.';
      } finally { btn.classList.remove('is-loading'); btn.disabled = false; }
    });
  }

  // ---- Decks (searchable) ----
  let _allDecks = [];
  function renderGrid(decks, { isSearch = false } = {}) {
    const empty = document.getElementById('casual-decks-empty');
    const grid = document.getElementById('casual-decks-grid');
    if (!decks.length) {
      if (isSearch) {
        if (empty) empty.hidden = true;
        if (grid) { grid.hidden = false; grid.innerHTML = '<p class="decklib-loading">No decks match your search.</p>'; }
      } else {
        if (empty) empty.hidden = false;
        if (grid) { grid.hidden = true; grid.innerHTML = ''; }
      }
      return;
    }
    if (empty) empty.hidden = true;
    if (grid) { grid.hidden = false; grid.innerHTML = decks.map(window.Popcard.renderDeckCard).join(''); }
  }

  async function loadDecks() {
    const loading = document.getElementById('casual-decks-loading');
    try {
      const r = await fetch('/api/decks?limit=100', { credentials: 'same-origin' });
      if (!r.ok) throw new Error('failed');
      const { decks } = await r.json();
      _allDecks = decks || [];
      if (loading) loading.hidden = true;
      renderGrid(_allDecks);
    } catch {
      if (loading) loading.textContent = "Couldn't load your decks. Refresh to try again.";
    }
  }

  function setupSearch() {
    const form = document.getElementById('casual-search-form');
    const input = document.getElementById('casual-search');
    if (!form || !input) return;
    function filter() {
      const q = (input.value || '').trim().toLowerCase();
      if (!q) { renderGrid(_allDecks); return; }
      renderGrid(_allDecks.filter((d) => (d.title || '').toLowerCase().includes(q)), { isSearch: true });
    }
    input.addEventListener('input', filter);
    form.addEventListener('submit', (e) => e.preventDefault());
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); }
    });
  }

  (async function () {
    await window.Popcard.ready;   // auth gate + chrome
    setupPopForm();
    setupSearch();
    loadDecks();
  })();

})();
