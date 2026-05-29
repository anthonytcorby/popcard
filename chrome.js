// Shared app-shell chrome for the lighter pages (Casual / Progress / Calendar).
// Handles the common bits — auth gate, user identity, sidebar user menu,
// "coming soon" stubs, tier gating — and exposes deck-card rendering + a toast.
//
// Usage in a page script:
//   const { user, dashboard } = await window.Popcard.ready;
//   ... page-specific rendering ...
//
// (account.js / decks.js / quizzes.js keep their own copies — this is only
// wired into the newer, simpler pages.)

(function () {

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  function timeAgo(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const mins = Math.floor(Math.max(0, Date.now() - then) / 60000);
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
  function youtubeThumb(d) {
    if (!d || d.sourceType !== 'youtube' || !d.sourceUrl) return null;
    const m = String(d.sourceUrl).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg` : null;
  }
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
      </article>`;
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

  function setupUserMenu() {
    const chip = document.getElementById('dash-user-chip');
    const menu = document.getElementById('dash-user-menu');
    if (!chip || !menu) return;
    const setOpen = (open) => { menu.hidden = !open; chip.classList.toggle('is-open', open); chip.setAttribute('aria-expanded', String(open)); };
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

  const ready = (async function init() {
    let payload;
    const here = window.location.pathname || '/';
    try {
      const r = await fetch('/api/me?include=dashboard', { credentials: 'same-origin' });
      if (!r.ok) throw new Error();
      payload = await r.json();
    } catch {
      window.location.href = '/login?next=' + encodeURIComponent(here);
      return new Promise(() => {});   // never resolves — we're navigating away
    }
    if (!payload || !payload.user) {
      window.location.href = '/login?next=' + encodeURIComponent(here);
      return new Promise(() => {});
    }

    const { user } = payload;
    const dash = payload.dashboard || {};

    const loader = document.getElementById('account-loading');
    if (loader) loader.hidden = true;

    document.querySelectorAll('[data-auth-name]').forEach((el) => { el.textContent = user.name ? user.name.split(' ')[0] : 'there'; });
    document.querySelectorAll('[data-auth-tier]').forEach((el) => { el.textContent = user.tier || 'free'; });
    const pic = document.querySelector('[data-auth-picture]');
    if (pic && user.picture) pic.src = user.picture;
    const streak = document.getElementById('dash-streak-num');
    if (streak) streak.textContent = dash.streak_days ?? 0;
    applyTier(user.tier);

    setupUserMenu();
    setupSoonStubs();
    document.getElementById('sign-out-btn')?.addEventListener('click', async () => {
      try { await window.PopcardAuth.signOut(); } catch {}
      window.location.href = '/';
    });

    return { user, dashboard: dash };
  })();

  window.Popcard = { ready, showToast, renderDeckCard, escapeHtml, timeAgo, sourceBadge, youtubeThumb };
})();
