// mobile-nav.js — fixed bottom tab bar for the app on phones.
//
// On app-shell pages (those with a .app-shell), the left sidebar is hidden at
// phone widths (see dashboard.css) and this injects a 5-tab bottom bar instead
// — the standard mobile pattern (Duolingo, Instagram, etc.). One source of
// truth, auto-highlights the current tab. Pure-CSS handles show/hide by width,
// so this script just builds the markup once.

(function () {
  if (!document.querySelector('.app-shell')) return;          // app pages only
  if (document.querySelector('.mnav')) return;                // don't double-inject

  const path = window.location.pathname.replace(/\/+$/, '') || '/account';

  // The 5 core surfaces. Calendar over Casual for the bottom bar — Casual is
  // reachable from Home. Icons mirror the sidebar SVGs.
  const TABS = [
    { href: '/account',  label: 'Home',    d: '<path d="M3 12 12 3l9 9"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/>' },
    { href: '/practice', label: 'Study',   d: '<path d="m22 10-10-5L2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>' },
    { href: '/quizzes',  label: 'Quizzes', d: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 11h6"/><path d="M9 15h4"/>' },
    { href: '/decks',    label: 'Decks',   d: '<rect x="3" y="4" width="14" height="16" rx="2"/><path d="M21 8v12a1 1 0 0 1-1 1H8"/>' },
    { href: '/calendar', label: 'Plan',    d: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
  ];

  const nav = document.createElement('nav');
  nav.className = 'mnav';
  nav.setAttribute('aria-label', 'Primary');
  nav.innerHTML = TABS.map((t) => {
    const active = path === t.href || (t.href === '/account' && (path === '' || path === '/'));
    return `<a class="mnav-item${active ? ' is-active' : ''}" href="${t.href}"${active ? ' aria-current="page"' : ''}>
      <svg class="mnav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${t.d}</svg>
      <span>${t.label}</span>
    </a>`;
  }).join('');
  document.body.appendChild(nav);
  document.body.classList.add('has-mnav');
})();
