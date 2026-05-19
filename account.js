// Popcard /account dashboard.
//
// On load:
//   1. Fetch /api/me?include=dashboard → user + streak + sparks + daily goal
//   2. Paint header stats + welcome strip + mascot greeting
//   3. Fetch /api/decks → render the deck library
//   4. Pre-fill the Pop input if landing-side stashed a value in localStorage
//
// Backed by:
//   /api/me (extended; defensively 200s with defaults if dashboard columns
//   aren't in the DB yet — run tools/migrate-dashboard.mjs to enable real
//   persistence)

(function () {

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  function timeAgo(iso) {
    const then = new Date(iso).getTime();
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

  // ---------------------------------------------------------------------
  // Welcome-text & mascot mood — picks a greeting from the user's state.
  // ---------------------------------------------------------------------
  function greetingFor(user, dash) {
    const hour = new Date().getHours();
    const name = (user && user.name) ? user.name.split(' ')[0] : 'there';
    const greet = hour < 5 ? `Up late, ${name}?`
              : hour < 12 ? `Good morning, ${name}.`
              : hour < 17 ? `Good afternoon, ${name}.`
              : hour < 22 ? `Good evening, ${name}.`
              : `Burning the midnight oil, ${name}?`;
    return greet;
  }
  function welcomeSubFor(dash) {
    const streak = dash.streak_days || 0;
    const todayProgress = dash.cards_reviewed_today || 0;
    const goal = dash.daily_goal || 20;
    if (streak === 0 && todayProgress === 0) {
      return "Pop something below to start your first streak.";
    }
    if (streak > 0 && todayProgress >= goal) {
      return `🎉 Daily goal hit. ${streak}-day streak safe.`;
    }
    if (streak > 0) {
      return `${streak}-day streak going. ${goal - todayProgress} cards to hit today's goal.`;
    }
    return `Today's goal: ${goal} cards. You've got this.`;
  }
  function mascotBubbleFor(dash) {
    const streak = dash.streak_days || 0;
    const todayProgress = dash.cards_reviewed_today || 0;
    const goal = dash.daily_goal || 20;
    if (todayProgress >= goal) return "Nailed it. See you tomorrow!";
    if (streak === 0) return "Drop something in any time — I'll turn it into cards.";
    if (streak >= 30) return `${streak} days! You're a machine. 🔥`;
    if (streak >= 7) return `${streak}-day streak. Don't break it on me now!`;
    return "Keep going — I'm cheering for you.";
  }

  // ---------------------------------------------------------------------
  // Paint dashboard state from /api/me?include=dashboard
  // ---------------------------------------------------------------------
  function paintDashboard(user, dash) {
    document.getElementById('dash-streak-num').textContent = dash.streak_days ?? 0;
    document.getElementById('dash-sparks-num').textContent = (dash.sparks_total ?? 0).toLocaleString();

    const goal = dash.daily_goal || 20;
    const today = dash.cards_reviewed_today || 0;
    document.getElementById('dash-goal-current').textContent = today;
    document.getElementById('dash-goal-target').textContent = goal;
    const pct = Math.max(0, Math.min(100, (today / goal) * 100));
    document.getElementById('dash-goal-fill').style.width = pct + '%';

    document.getElementById('rail-streak-num').textContent = dash.streak_days ?? 0;
    document.getElementById('rail-streak-best').textContent = dash.longest_streak ?? 0;
    document.getElementById('rail-shield-num').textContent = dash.streak_shields ?? 2;

    // Daily quest progress (mock targets; back this with real activity logging later)
    setQuestProgress('pop', dash.decks_popped_today || 0, 1);
    setQuestProgress('review', today, 10);
    setQuestProgress('goal', today, goal);

    document.getElementById('dash-welcome-sub').textContent = welcomeSubFor(dash);
    document.getElementById('rail-mascot-bubble').textContent = mascotBubbleFor(dash);
    document.querySelectorAll('[data-auth-name]').forEach((el) => {
      el.textContent = (user && user.name) ? user.name.split(' ')[0] : 'there';
    });

    // Swap mascot images based on activity state.
    // Goal hit → celebrating. Otherwise → default neutral. (Sad/sleeping
    // states get wired when we add a "days inactive" check later.)
    const goalHit = (dash.cards_reviewed_today || 0) >= (dash.daily_goal || 20);
    const welcomeMascot = document.getElementById('dash-welcome-mascot');
    const railMascot = document.getElementById('rail-mascot-img');
    const mascotSrc = goalHit ? '/images/mascot-cheer.png' : '/images/popcard-mascot.png';
    if (welcomeMascot) welcomeMascot.src = mascotSrc;
    if (railMascot) railMascot.src = mascotSrc;
    // h1 specifically wants the time-of-day greeting
    const h1 = document.querySelector('.dash-welcome-h');
    if (h1) h1.textContent = greetingFor(user, dash);
  }

  function setQuestProgress(id, cur, tgt) {
    const li = document.querySelector(`.rail-quest[data-quest-id="${id}"]`);
    if (!li) return;
    li.querySelector('.rail-quest-cur').textContent = cur;
    li.querySelector('.rail-quest-tgt').textContent = tgt;
    li.classList.toggle('is-done', cur >= tgt);
  }

  // ---------------------------------------------------------------------
  // Deck library (preserved from prior account.html)
  // ---------------------------------------------------------------------
  function renderDeckCard(d) {
    return `
      <article class="account-deck-card${d.pinned ? ' is-pinned' : ''}" data-deck-id="${d.id}">
        <a class="account-deck-link" href="/deck/${d.id}">
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${d.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m12 2 3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z"/>
            </svg>
          </button>
          <button type="button" class="account-deck-action account-deck-delete" data-action="delete" title="Delete" aria-label="Delete deck">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            </svg>
          </button>
        </div>
      </article>
    `;
  }

  async function loadDecks() {
    const loading = document.getElementById('account-decks-loading');
    const empty = document.getElementById('account-decks-empty');
    const gridEl = document.getElementById('account-decks-grid');
    const footer = document.getElementById('account-decks-footer');
    empty.hidden = true;
    footer.hidden = true;

    try {
      const r = await fetch('/api/decks?limit=30', { credentials: 'same-origin' });
      if (!r.ok) throw new Error('Failed to load');
      const { decks } = await r.json();
      loading.hidden = true;
      if (!decks.length) {
        empty.hidden = false;
        gridEl.hidden = true;
        return;
      }
      gridEl.hidden = false;
      gridEl.innerHTML = decks.map(renderDeckCard).join('');
      wireDeckActions(gridEl);
      footer.hidden = false;
    } catch (e) {
      loading.textContent = "Couldn't load your decks. Refresh to try again.";
    }
  }

  async function deleteAllDecks() {
    const btn = document.getElementById('delete-all-decks-btn');
    const decksOnPage = document.querySelectorAll('.account-deck-card').length;
    const msg = decksOnPage
      ? `Delete ALL ${decksOnPage} deck${decksOnPage === 1 ? '' : 's'}? This cannot be undone.`
      : 'Delete all decks? This cannot be undone.';
    if (!confirm(msg)) return;
    const typed = prompt('Type DELETE in capitals to confirm.');
    if (typed !== 'DELETE') {
      if (typed != null) alert("Cancelled — confirmation text didn't match.");
      return;
    }
    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.textContent = 'Deleting…';
    try {
      const r = await fetch('/api/decks', { method: 'DELETE', credentials: 'same-origin' });
      if (!r.ok) throw new Error('Delete failed');
      const data = await r.json();
      window.PopcardAnalytics?.track('Decks Delete All', { count: String(data.deleted ?? 0) });
      loadDecks();
    } catch (e) {
      alert("Couldn't delete decks. Refresh and try again.");
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  function wireDeckActions(root) {
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const card = btn.closest('.account-deck-card');
      const id = card.dataset.deckId;

      if (btn.dataset.action === 'pin') {
        const isPinned = card.classList.contains('is-pinned');
        btn.disabled = true;
        try {
          const r = await fetch('/api/deck?id=' + encodeURIComponent(id), {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pinned: !isPinned }),
          });
          if (!r.ok) throw new Error('pin failed');
          loadDecks();
          window.PopcardAnalytics?.track('Deck Pin', { pinned: String(!isPinned) });
        } catch {
          btn.disabled = false;
          alert("Couldn't update — try again.");
        }
      } else if (btn.dataset.action === 'delete') {
        if (!confirm('Delete this deck? This cannot be undone.')) return;
        btn.disabled = true;
        try {
          const r = await fetch('/api/deck?id=' + encodeURIComponent(id), {
            method: 'DELETE', credentials: 'same-origin',
          });
          if (!r.ok) throw new Error('delete failed');
          card.style.transition = 'opacity .2s, transform .2s';
          card.style.opacity = '0';
          card.style.transform = 'scale(0.96)';
          setTimeout(() => card.remove(), 220);
          window.PopcardAnalytics?.track('Deck Delete');
          setTimeout(() => {
            if (!document.querySelector('.account-deck-card')) {
              document.getElementById('account-decks-grid').hidden = true;
              document.getElementById('account-decks-empty').hidden = false;
              document.getElementById('account-decks-footer').hidden = true;
            }
          }, 240);
        } catch {
          btn.disabled = false;
          alert("Couldn't delete — try again.");
        }
      }
    });
  }

  // ---------------------------------------------------------------------
  // "Pop something new" — dashboard's inline pop form
  // ---------------------------------------------------------------------
  function setupPopForm() {
    const form = document.getElementById('dash-pop-form');
    const input = document.getElementById('dash-pop-input');
    const btn = document.getElementById('dash-pop-btn');
    const status = document.getElementById('dash-pop-status');

    // Pre-fill if the landing-side CTA stashed a value
    try {
      const pending = localStorage.getItem('popcardPendingInput');
      if (pending) {
        input.value = pending;
        localStorage.removeItem('popcardPendingInput');
      }
    } catch {}

    // Chip click → just update placeholder + active state (doesn't lock mode)
    const PLACEHOLDERS = {
      youtube: 'Paste a YouTube link…',
      article: 'Paste an article URL or full text…',
      book:    'Paste book chapter text (or upload via the deck library)…',
    };
    document.querySelectorAll('#dash-pop-chips .dash-pop-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#dash-pop-chips .dash-pop-chip').forEach((c) =>
          c.classList.toggle('is-active', c === chip));
        input.placeholder = PLACEHOLDERS[chip.dataset.source] || 'Paste anything…';
        input.focus();
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = (input.value || '').trim();
      if (!value) { input.focus(); return; }

      btn.classList.add('is-loading');
      btn.disabled = true;
      status.hidden = false;
      status.classList.remove('is-error');
      status.textContent = 'Popping your cards… this can take 10-30 seconds for long content.';

      try {
        // Send whichever mode is currently selected on the dashboard
        const mode = form.dataset.mode || (document.body.classList.contains('is-quick-mode') ? 'quick' : 'study');
        const r = await fetch('/api/pop', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: value,
            mode,
          }),
        });
        const data = await r.json();
        if (!r.ok) {
          status.classList.add('is-error');
          status.textContent = data.error || 'Something went sideways. Try again?';
          return;
        }
        window.PopcardAnalytics?.track('Dashboard Pop', {
          mode: 'study',
          fromCache: String(Boolean(data.fromCache)),
        });
        window.location.href = '/deck/' + data.deck.id;
      } catch (err) {
        status.classList.add('is-error');
        status.textContent = 'Network error. Check your connection and try again.';
      } finally {
        btn.classList.remove('is-loading');
        btn.disabled = false;
      }
    });
  }

  // ---------------------------------------------------------------------
  // Mode switch (Quick ↔ Study)
  // ---------------------------------------------------------------------
  // applyMode toggles a body class so CSS hides gamification widgets in
  // Quick mode. Choice is persisted both to localStorage (instant on next
  // load) and to /api/onboarding-prefs (server-side default_mode column).
  function applyMode(mode, opts) {
    const m = (mode === 'quick') ? 'quick' : 'study';
    document.body.classList.toggle('is-quick-mode', m === 'quick');
    document.body.classList.toggle('is-study-mode', m === 'study');

    const sw = document.querySelector('.dash-mode-switch');
    if (sw) sw.dataset.current = m;
    document.querySelectorAll('.dash-mode-switch-btn').forEach((btn) => {
      const isActive = btn.dataset.mode === m;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Update the Pop form's submit handler default mode (set as data attr)
    const popForm = document.getElementById('dash-pop-form');
    if (popForm) popForm.dataset.mode = m;

    try { localStorage.setItem('popcardDashboardMode', m); } catch {}

    if (!opts || !opts.skipPersist) {
      // Fire-and-forget persistence — non-blocking, defensive
      fetch('/api/onboarding-prefs', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_mode: m }),
      }).catch(() => {});
      window.PopcardAnalytics?.track('Mode Switch', { mode: m });
    }
  }

  function setupModeSwitch(initialMode) {
    applyMode(initialMode, { skipPersist: true });
    document.querySelectorAll('.dash-mode-switch-btn').forEach((btn) => {
      btn.addEventListener('click', () => applyMode(btn.dataset.mode));
    });
  }

  // ---------------------------------------------------------------------
  // User-menu dropdown
  // ---------------------------------------------------------------------
  function setupUserMenu() {
    const chip = document.getElementById('dash-user-chip');
    const menu = document.getElementById('dash-user-menu');
    if (!chip || !menu) return;
    // Programmatic open-state tracker — drives the chip's "active" look via
    // an .is-open class. We don't rely on :hover for "open" feedback because
    // :hover sticks on touch devices after a tap and leaves the chip visually
    // "on" until you tap somewhere else.
    function setOpen(open) {
      menu.hidden = !open;
      chip.classList.toggle('is-open', open);
      chip.setAttribute('aria-expanded', String(open));
    }
    setOpen(false);
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(menu.hidden);   // toggle: was hidden → now open
    });
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !menu.contains(e.target) && !chip.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) { setOpen(false); chip.focus(); }
    });
    // Close menu when ANY menu item is clicked — including non-navigating
    // placeholders like the Settings link (href="#"). Without this, clicking
    // Settings leaves the menu stuck open because the document outside-click
    // handler ignores clicks inside the menu.
    menu.querySelectorAll('[role="menuitem"]').forEach((item) => {
      item.addEventListener('click', (e) => {
        if (item.getAttribute('href') === '#') e.preventDefault();   // placeholder — don't jump to top
        setOpen(false);
      });
    });
  }

  // ---------------------------------------------------------------------
  // Friends invite — for now, copy a placeholder link to clipboard
  // ---------------------------------------------------------------------
  function setupFriendsInvite() {
    const btn = document.getElementById('rail-friends-invite');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const link = `${window.location.origin}/onboarding?ref=invite`;
      try {
        navigator.clipboard.writeText(link);
        btn.textContent = 'Link copied!';
        setTimeout(() => { btn.textContent = 'Invite friends'; }, 2000);
      } catch {
        prompt('Copy this invite link:', link);
      }
      window.PopcardAnalytics?.track('Friends Invite Copy');
    });
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  (async function init() {
    const loading = document.getElementById('account-loading');

    let payload;
    try {
      const r = await fetch('/api/me?include=dashboard', { credentials: 'same-origin' });
      if (!r.ok) throw new Error('not signed in');
      payload = await r.json();
    } catch {
      window.location.href = '/login?next=' + encodeURIComponent('/account');
      return;
    }
    if (!payload || !payload.user) {
      window.location.href = '/login?next=' + encodeURIComponent('/account');
      return;
    }

    const { user } = payload;
    const dash = payload.dashboard || {};

    loading.hidden = true;

    // Paint user fields
    document.querySelectorAll('[data-auth-only]').forEach((el) => el.style.display = '');
    document.querySelectorAll('[data-auth-name]').forEach((el) => {
      el.textContent = user.name ? user.name.split(' ')[0] : 'there';
    });
    document.querySelectorAll('[data-auth-tier]').forEach((el) => {
      el.textContent = user.tier;
    });
    const picEl = document.querySelector('[data-auth-picture]');
    if (picEl && user.picture) picEl.src = user.picture;

    // Show right upsell strip
    if (user.tier === 'free') document.getElementById('actions-free').hidden = false;
    else document.getElementById('actions-paid').hidden = false;

    // Resolve initial mode: server preference > localStorage > default 'study'.
    let initialMode = 'study';
    if (dash.default_mode === 'quick' || dash.default_mode === 'study') {
      initialMode = dash.default_mode;
    } else {
      try {
        const cached = localStorage.getItem('popcardDashboardMode');
        if (cached === 'quick' || cached === 'study') initialMode = cached;
      } catch {}
    }
    setupModeSwitch(initialMode);

    // Paint dashboard data (streak, sparks, goal, quests, mascot bubble)
    paintDashboard(user, dash);

    // Wire interactive surfaces
    setupPopForm();
    setupUserMenu();
    setupFriendsInvite();

    document.getElementById('sign-out-btn').addEventListener('click', async () => {
      await window.PopcardAuth.signOut();
      window.PopcardAnalytics?.track('Sign Out');
      window.location.href = '/';
    });
    document.querySelectorAll('[data-checkout]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.PopcardAnalytics?.track('Account Upgrade', { tier: btn.dataset.checkout });
        window.PopcardAuth.startCheckout(btn.dataset.checkout);
      });
    });
    document.getElementById('delete-all-decks-btn').addEventListener('click', deleteAllDecks);
    document.getElementById('dash-goal-edit').addEventListener('click', () => {
      // TODO: real goal-picker modal — for now show a friendly placeholder
      alert("Daily-goal picker coming next. Default is 20 cards/day; change via Settings (also coming soon).");
    });

    loadDecks();
  })();

})();
