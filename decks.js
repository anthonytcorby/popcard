// Popcard /decks — the standalone deck library page.
//
// Shares the dashboard app-shell chrome but shows ONLY the deck grid (the same
// cards as the dashboard's "Your decks" section, which used to be reached by
// scrolling). Auth-gated; redirects to /login if not signed in.

(function () {

  // ---------------------------------------------------------------------
  // Helpers (same rendering as the dashboard's deck library)
  // ---------------------------------------------------------------------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  function timeAgo(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const diff = Math.max(0, Date.now() - then);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    const days = Math.floor(hrs / 24);
    if (days < 30) return days + 'd ago';
    return new Date(iso).toLocaleDateString();
  }
  function sourceBadge(d) {
    if (d.sourceType === 'youtube') {
      return '<span class="account-deck-source"><span class="account-deck-source-icon" style="background:#FF0033"><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>YouTube</span>';
    }
    return '<span class="account-deck-source">📝 Text</span>';
  }
  function youtubeId(url) {
    if (!url) return null;
    const m = String(url).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  function youtubeThumb(d) {
    if (!d || d.sourceType !== 'youtube') return null;
    const id = youtubeId(d.sourceUrl);
    return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
  }
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

  // ---------------------------------------------------------------------
  // Deck grid
  // ---------------------------------------------------------------------
  function renderDeckCard(d) {
    const yt = youtubeThumb(d);
    const thumb = yt
      ? `<div class="account-deck-thumb"><img src="${yt}" alt="" loading="lazy" /><span class="account-deck-thumb-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span></div>`
      : '';
    return `
      <article class="account-deck-card${d.pinned ? ' is-pinned' : ''}${yt ? ' has-thumb' : ''}" data-deck-id="${d.id}">
        <a class="account-deck-link" href="/deck/${d.id}">
          ${thumb}
          <div class="account-deck-top">
            <span class="account-deck-mode" data-mode="${d.mode}">${d.mode}</span>
            <span class="account-deck-time">${timeAgo(d.createdAt)}</span>
          </div>
          <h3 class="account-deck-title">${escapeHtml(d.title || 'Untitled')}</h3>
          <div class="account-deck-meta">
            ${sourceBadge(d)}
            <span class="account-deck-count">${d.cardCount} card${d.cardCount === 1 ? '' : 's'}</span>
          </div>
        </a>
        <div class="account-deck-actions">
          <button type="button" class="account-deck-action account-deck-pin" data-action="pin" title="${d.pinned ? 'Unpin' : 'Pin to top'}" aria-label="${d.pinned ? 'Unpin' : 'Pin to top'}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${d.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z"/></svg>
          </button>
          <button type="button" class="account-deck-action account-deck-delete" data-action="delete" title="Delete" aria-label="Delete deck">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </article>`;
  }

  let _allDecks = [];
  function renderGrid(decks, { isSearch = false } = {}) {
    const empty = document.getElementById('account-decks-empty');
    const grid = document.getElementById('account-decks-grid');
    const footer = document.getElementById('account-decks-footer');
    if (!decks.length) {
      if (isSearch) {
        if (empty) empty.hidden = true;
        if (grid) { grid.hidden = false; grid.innerHTML = '<p class="decklib-loading">No decks match your search.</p>'; }
        if (footer) footer.hidden = true;
      } else {
        if (empty) empty.hidden = false;
        if (grid) { grid.hidden = true; grid.innerHTML = ''; }
        if (footer) footer.hidden = true;
      }
      return;
    }
    if (empty) empty.hidden = true;
    if (grid) { grid.hidden = false; grid.innerHTML = decks.map(renderDeckCard).join(''); }
    if (footer) footer.hidden = false;
  }

  async function loadDecks() {
    const loading = document.getElementById('account-decks-loading');
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

  function wireDeckActions() {
    const grid = document.getElementById('account-decks-grid');
    if (!grid) return;
    grid.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault(); e.stopPropagation();
      const card = btn.closest('.account-deck-card');
      const id = card.dataset.deckId;
      if (btn.dataset.action === 'pin') {
        const isPinned = card.classList.contains('is-pinned');
        btn.disabled = true;
        try {
          const r = await fetch('/api/deck?id=' + encodeURIComponent(id), {
            method: 'PATCH', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pinned: !isPinned }),
          });
          if (!r.ok) throw new Error();
          loadDecks();
        } catch { btn.disabled = false; showToast("Couldn't update — try again."); }
      } else if (btn.dataset.action === 'delete') {
        if (!confirm('Delete this deck? This cannot be undone.')) return;
        btn.disabled = true;
        try {
          const r = await fetch('/api/deck?id=' + encodeURIComponent(id), { method: 'DELETE', credentials: 'same-origin' });
          if (!r.ok) throw new Error();
          card.style.transition = 'opacity .2s, transform .2s';
          card.style.opacity = '0'; card.style.transform = 'scale(0.96)';
          setTimeout(() => { card.remove(); loadDecks(); }, 220);
        } catch { btn.disabled = false; showToast("Couldn't delete — try again."); }
      }
    });
  }

  async function deleteAllDecks() {
    const btn = document.getElementById('delete-all-decks-btn');
    const n = document.querySelectorAll('.account-deck-card').length;
    if (!confirm(`Delete ALL ${n || ''} decks? This cannot be undone.`)) return;
    if (prompt('Type DELETE in capitals to confirm.') !== 'DELETE') return;
    btn.disabled = true; btn.textContent = 'Deleting…';
    try {
      const r = await fetch('/api/decks', { method: 'DELETE', credentials: 'same-origin' });
      if (!r.ok) throw new Error();
      loadDecks();
    } catch { showToast("Couldn't delete decks. Try again."); }
    finally { btn.disabled = false; btn.textContent = 'Delete all decks'; }
  }

  function setupSearch() {
    const form = document.getElementById('decks-search-form');
    const input = document.getElementById('decks-search');
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

  // ---------------------------------------------------------------------
  // Chrome
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
    chip.addEventListener('click', (e) => { e.stopPropagation(); setOpen(menu.hidden); });
    document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && !chip.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setOpen(false); chip.focus(); } });
    menu.querySelectorAll('[role="menuitem"]').forEach((item) => item.addEventListener('click', () => setOpen(false)));
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
      if (!r.ok) throw new Error();
      payload = await r.json();
    } catch {
      window.location.href = '/login?next=' + encodeURIComponent('/decks');
      return;
    }
    if (!payload || !payload.user) {
      window.location.href = '/login?next=' + encodeURIComponent('/decks');
      return;
    }

    const { user } = payload;
    const dash = payload.dashboard || {};

    const loader = document.getElementById('account-loading');
    if (loader) loader.hidden = true;

    document.querySelectorAll('[data-auth-name]').forEach((el) => {
      el.textContent = user.name ? user.name.split(' ')[0] : 'there';
    });
    document.querySelectorAll('[data-auth-tier]').forEach((el) => { el.textContent = user.tier || 'free'; });
    const pic = document.querySelector('[data-auth-picture]');
    if (pic && user.picture) pic.src = user.picture;
    const streak = document.getElementById('dash-streak-num');
    if (streak) streak.textContent = dash.streak_days ?? 0;
    applyTier(user.tier);

    setupUserMenu();
    setupSoonStubs();
    setupSearch();
    wireDeckActions();

    document.getElementById('sign-out-btn')?.addEventListener('click', async () => {
      await window.PopcardAuth.signOut();
      window.location.href = '/';
    });
    document.getElementById('delete-all-decks-btn')?.addEventListener('click', deleteAllDecks);

    loadDecks();
  })();

})();
