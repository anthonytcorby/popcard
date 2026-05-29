// notifications.js — shared bell dropdown wired to /api/notifications.
//
// On any page that includes <button class="topbar-bell">, this script:
//   1. Loads the inbox + unread count on init
//   2. Paints an unread badge on the bell
//   3. Opens a dropdown of items on click (with mark-as-read on open)
//   4. Each item links through to its `link` field
//
// Self-contained: no global state, no required HTML beyond the bell button.

(function () {
  // 1. Find or inject the bell. If a page's topbar already has one (e.g.
  //    account.html), reuse it. Otherwise inject a fresh bell at the start
  //    of `.topbar-actions` so every page gets notifications "for free".
  let bell = document.querySelector('.topbar-bell');
  if (!bell) {
    const actions = document.querySelector('.topbar-actions');
    if (!actions) return; // no topbar on this page (login/onboarding)
    bell = document.createElement('button');
    bell.type = 'button';
    bell.className = 'topbar-bell';
    bell.setAttribute('aria-label', 'Notifications');
    bell.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.7 21a2 2 0 0 1-3.4 0"/>
      </svg>
    `;
    actions.prepend(bell);
  }

  // Strip the data-soon stub behaviour and the legacy red dot — both replaced
  // by the dynamic badge below.
  bell.removeAttribute('data-soon');
  bell.querySelectorAll('.topbar-bell-dot').forEach((d) => d.remove());

  let panel = null;
  let items = [];
  let unreadCount = 0;
  let loaded = false;
  let lastOpenedAt = 0;

  // ---------- DOM construction ----------
  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'notif-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'menu');
    panel.innerHTML = `
      <div class="notif-panel-head">
        <span class="notif-panel-title">Notifications</span>
        <button type="button" class="notif-panel-x" aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="notif-panel-list" id="notif-list">
        <div class="notif-empty notif-loading">Loading…</div>
      </div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('.notif-panel-x').addEventListener('click', close);
    document.addEventListener('click', (e) => {
      if (panel.hidden) return;
      if (panel.contains(e.target) || bell.contains(e.target)) return;
      close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) { close(); bell.focus(); }
    });
    return panel;
  }

  function ensureBadge() {
    let b = bell.querySelector('.topbar-bell-badge');
    if (!b) {
      b = document.createElement('span');
      b.className = 'topbar-bell-badge';
      b.setAttribute('aria-hidden', 'true');
      bell.appendChild(b);
    }
    return b;
  }

  function paintBadge() {
    const b = ensureBadge();
    if (unreadCount > 0) {
      b.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
      b.hidden = false;
      bell.classList.add('has-unread');
    } else {
      b.hidden = true;
      bell.classList.remove('has-unread');
    }
  }

  function paintList() {
    const list = panel.querySelector('#notif-list');
    if (!items.length) {
      list.innerHTML = `
        <div class="notif-empty">
          <span class="notif-empty-emoji" aria-hidden="true">&#128293;</span>
          <p>Nothing new. Pop something or hit your daily quest to start your streak.</p>
        </div>
      `;
      return;
    }
    list.innerHTML = items.map((n) => {
      const icon = ICONS[n.kind] || ICONS._default;
      const when = timeAgo(n.created_at || n.createdAt);
      const titleSafe = escapeHtml(n.title);
      const bodySafe = n.body ? escapeHtml(n.body) : '';
      const cls = `notif-item${n.read_at ? '' : ' is-unread'}`;
      const linkAttr = n.link ? `href="${escapeHtml(n.link)}"` : 'href="#" onclick="return false"';
      return `
        <a class="${cls}" ${linkAttr} data-id="${escapeHtml(n.id)}">
          <span class="notif-icon notif-icon-${n.kind}">${icon}</span>
          <span class="notif-body">
            <span class="notif-title">${titleSafe}</span>
            ${bodySafe ? `<span class="notif-text">${bodySafe}</span>` : ''}
            <span class="notif-when">${when}</span>
          </span>
        </a>
      `;
    }).join('');
  }

  const ICONS = {
    streak_milestone: '&#128293;',
    deck_ready:       '&#10024;',
    session_starting: '&#9200;',
    session_missed:   '&#9888;&#65039;',
    crown_levelled:   '&#128081;',
    _default:         '&#128276;',
  };

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    }[c]));
  }

  function timeAgo(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60)        return 'just now';
    if (diff < 3600)      return `${Math.floor(diff / 60)}m`;
    if (diff < 86400)     return `${Math.floor(diff / 3600)}h`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // ---------- Data ----------
  async function loadInbox() {
    try {
      const r = await fetch('/api/notifications', { credentials: 'same-origin' });
      if (!r.ok) return;
      const data = await r.json();
      items = data.items || [];
      unreadCount = data.unreadCount || 0;
      loaded = true;
      paintBadge();
    } catch {}
  }

  async function markAllReadServer() {
    try {
      await fetch('/api/notifications', { method: 'PATCH', credentials: 'same-origin' });
      items = items.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }));
      unreadCount = 0;
      paintBadge();
    } catch {}
  }

  // ---------- Open / close ----------
  function open() {
    ensurePanel();
    if (!loaded) {
      loadInbox().then(() => { paintList(); });
    } else {
      paintList();
    }
    panel.hidden = false;
    bell.setAttribute('aria-expanded', 'true');
    lastOpenedAt = Date.now();
    // Mark unread → read once the panel is visible
    if (unreadCount > 0) markAllReadServer();
  }
  function close() {
    if (!panel) return;
    panel.hidden = true;
    bell.setAttribute('aria-expanded', 'false');
  }

  bell.setAttribute('aria-haspopup', 'menu');
  bell.setAttribute('aria-expanded', 'false');
  bell.addEventListener('click', (e) => {
    // Suppress the prior data-soon toast if any other handler also listens
    e.stopPropagation();
    if (panel && !panel.hidden) close(); else open();
  });

  // Initial load: pull badge count immediately so the user sees unread on
  // every page load without needing to open the panel.
  loadInbox();

  // Lightweight poll: refresh once every 90s so live events appear without
  // a page reload. Cheap (one GET, lightweight payload).
  setInterval(() => {
    if (document.visibilityState === 'visible' && (Date.now() - lastOpenedAt) > 5000) loadInbox();
  }, 90 * 1000);
})();
