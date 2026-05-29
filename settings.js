// Settings page — preferences, account info, sign-out.
// Persists mode + daily_goal via /api/onboarding-prefs (best effort, with
// localStorage fallback so the UI stays responsive even pre-migration).

(function () {

  // ---------------------------------------------------------------------
  // Mode switch — same applyMode pattern as account.js
  // ---------------------------------------------------------------------
  function applyMode(mode, opts) {
    opts = opts || {};
    if (mode !== 'quick' && mode !== 'study') mode = 'study';
    document.body.classList.toggle('is-quick-mode', mode === 'quick');
    document.body.classList.toggle('is-study-mode', mode === 'study');
    document.querySelectorAll('.dash-mode-switch-btn').forEach((btn) => {
      const on = btn.dataset.mode === mode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (opts.skipPersist) return;
    try { localStorage.setItem('popcardDashboardMode', mode); } catch {}
    fetch('/api/onboarding-prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ default_mode: mode }),
    }).catch(() => { /* fire-and-forget; localStorage backs it */ });
    window.PopcardAnalytics?.track('Settings Mode Change', { mode });
  }

  function setupModeSwitch(initial) {
    applyMode(initial, { skipPersist: true });
    document.querySelectorAll('.dash-mode-switch-btn').forEach((btn) => {
      btn.addEventListener('click', () => applyMode(btn.dataset.mode));
    });
  }

  // ---------------------------------------------------------------------
  // Daily goal
  // ---------------------------------------------------------------------
  function applyGoal(goal, opts) {
    opts = opts || {};
    const n = Number(goal) || 10;
    document.querySelectorAll('.settings-goal-btn').forEach((btn) => {
      btn.classList.toggle('is-active', Number(btn.dataset.goal) === n);
    });
    if (opts.skipPersist) return;
    try { localStorage.setItem('popcardDailyGoal', String(n)); } catch {}
    fetch('/api/onboarding-prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ daily_goal: n }),
    }).catch(() => {});
    window.PopcardAnalytics?.track('Settings Daily Goal Change', { goal: String(n) });
  }

  function setupDailyGoal(initial) {
    applyGoal(initial, { skipPersist: true });
    document.querySelectorAll('.settings-goal-btn').forEach((btn) => {
      btn.addEventListener('click', () => applyGoal(btn.dataset.goal));
    });
  }

  // ---------------------------------------------------------------------
  // Browser push toggle — real, end-to-end. Delegates to push.js for the
  // service-worker dance and the server roundtrip. The Weekly Summary
  // checkbox is deliberately left disabled (it's a "coming soon" stub
  // until we set up Resend / similar — see Backlog task #24).
  // ---------------------------------------------------------------------
  // Sound-effects toggle — drives PopcardSfx's persisted mute pref.
  function setupSound() {
    const t = document.getElementById('settings-sound');
    if (!t) return;
    let m = false;
    try { m = localStorage.getItem('popcardMuted') === 'true'; } catch {}
    t.checked = !m;
    t.addEventListener('change', () => {
      const muted = !t.checked;
      if (window.PopcardSfx) window.PopcardSfx.setMuted(muted);
      else { try { localStorage.setItem('popcardMuted', String(muted)); } catch {} }
      if (!muted) window.PopcardSfx?.correct?.();   // little preview when turning on
    });
  }

  async function setupNotificationToggles() {
    const pushToggle = document.getElementById('settings-push');
    const pushHelp = document.getElementById('settings-push-help');
    const testRow = document.getElementById('settings-push-test-row');
    const testBtn = document.getElementById('settings-push-test');
    if (!pushToggle || !window.PopcardPush) return;

    function setHelp(msg) { if (pushHelp) pushHelp.textContent = msg; }

    if (!window.PopcardPush.supported()) {
      pushToggle.disabled = true;
      setHelp('Browser push isn\'t supported here. Try a different browser (or your phone).');
      return;
    }

    // Reflect current state into the toggle
    async function refresh() {
      const s = await window.PopcardPush.status();
      pushToggle.checked = (s === 'enabled');
      pushToggle.disabled = (s === 'denied');
      testRow.hidden = (s !== 'enabled');
      if (s === 'denied') {
        setHelp('You blocked notifications for this site. Allow them in your browser settings, then refresh.');
      } else if (s === 'enabled') {
        setHelp('Push is on for this device. We\'ll only send: streak-at-risk in the evening, and 10 min before any scheduled session.');
      } else {
        setHelp('Reminders fire only on this device. We send: streak-at-risk in the evening, and 10 min before any scheduled session.');
      }
    }
    await refresh();

    pushToggle.addEventListener('change', async () => {
      pushToggle.disabled = true;
      try {
        if (pushToggle.checked) {
          const s = await window.PopcardPush.enable();
          window.PopcardAnalytics?.track('Settings Push Enable', { result: s });
          if (s !== 'enabled') {
            // Permission denied / unsupported — revert
            pushToggle.checked = false;
          }
        } else {
          await window.PopcardPush.disable();
          window.PopcardAnalytics?.track('Settings Push Disable');
        }
      } catch (e) {
        console.error('push toggle failed', e);
        pushToggle.checked = false;
      } finally {
        pushToggle.disabled = false;
        await refresh();
      }
    });

    testBtn?.addEventListener('click', async () => {
      testBtn.disabled = true;
      testBtn.textContent = 'Sending…';
      try {
        const r = await window.PopcardPush.sendTest();
        testBtn.textContent = r && r.sent ? 'Sent ✓' : 'No devices';
      } catch {
        testBtn.textContent = 'Failed';
      } finally {
        setTimeout(() => { testBtn.disabled = false; testBtn.textContent = 'Send test'; }, 1800);
      }
    });
  }

  // ---------------------------------------------------------------------
  // Language picker — defers to lang-picker.js if present, otherwise stub
  // ---------------------------------------------------------------------
  function setupLanguage() {
    const btn = document.getElementById('settings-lang-btn');
    const wrap = btn && btn.closest('.settings-lang-wrap');
    const flagEl = document.getElementById('settings-lang-flag');
    const nameEl = document.getElementById('settings-lang-name');
    if (!btn || !wrap || !window.PopcardLang) return;

    const langs = window.PopcardLang.languages || [];

    function paintCurrent() {
      const cur = window.PopcardLang.current;
      const l = langs.find((x) => x.code === cur) || langs[0];
      if (!l) return;
      if (flagEl) flagEl.className = `flag fi fi-${l.flag}`;
      if (nameEl) nameEl.textContent = l.native;
    }
    paintCurrent();

    // Build a real dropdown menu (the settings page has no header picker).
    const menu = document.createElement('div');
    menu.className = 'settings-lang-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    menu.innerHTML = langs.map((l) =>
      `<button type="button" role="menuitemradio" data-lang="${l.code}"><span class="flag fi fi-${l.flag}"></span><span>${l.native}</span></button>`
    ).join('');
    wrap.appendChild(menu);

    function setOpen(open) {
      menu.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
    }
    btn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(menu.hidden); });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-lang]');
      if (!b) return;
      window.PopcardLang.set(b.dataset.lang);
      paintCurrent();
      setOpen(false);
    });
    document.addEventListener('click', (e) => {
      if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) setOpen(false);
    });
    window.addEventListener('popcard-language-change', paintCurrent);
  }

  // ---------------------------------------------------------------------
  // User menu (shared pattern)
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
  // Delete account flow — confirms hard, then no-op for now (no API)
  // ---------------------------------------------------------------------
  function setupDelete() {
    const btn = document.getElementById('settings-delete-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const confirmed = confirm(
        "Are you absolutely sure?\n\n" +
        "This will permanently delete your account and ALL decks. " +
        "This action cannot be undone."
      );
      if (!confirmed) return;
      const typed = prompt('Type the word DELETE to confirm:');
      if (typed !== 'DELETE') {
        alert('Cancelled — account not deleted.');
        return;
      }
      // Fire a real deletion request via email (GDPR allows up to 30 days to
      // process). This avoids silently cancelling a paying customer's billing
      // — we confirm + handle Stripe on our side. Opens the user's mail client
      // with a pre-filled request so the action actually does something.
      const subject = encodeURIComponent('Account deletion request');
      const body = encodeURIComponent(
        "Please delete my Popcard account and all my data.\n\n" +
        "(Sent from Settings. We'll confirm and erase your data within 30 days.)"
      );
      window.location.href = `mailto:hello@popcard.me?subject=${subject}&body=${body}`;
      window.PopcardAnalytics?.track('Settings Delete Account Request');
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
      window.location.href = '/login?next=' + encodeURIComponent('/settings');
      return;
    }
    if (!payload || !payload.user) {
      window.location.href = '/login?next=' + encodeURIComponent('/settings');
      return;
    }

    const { user } = payload;
    const dash = payload.dashboard || {};

    // Auth-only fields
    document.querySelectorAll('[data-auth-only]').forEach((el) => el.style.display = '');
    document.querySelectorAll('[data-auth-name]').forEach((el) => {
      el.textContent = user.name || (user.email ? user.email.split('@')[0] : 'You');
    });
    document.querySelectorAll('[data-auth-picture]').forEach((el) => {
      if (user.picture) el.src = user.picture;
    });
    // Email + member-since (settings only)
    const emailEl = document.getElementById('settings-email');
    if (emailEl) emailEl.textContent = user.email || '';
    const sinceEl = document.getElementById('settings-since');
    if (sinceEl && user.created_at) {
      try {
        const d = new Date(user.created_at);
        sinceEl.textContent = 'Member since ' + d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      } catch {}
    }

    // Streak + sparks in header
    const streakEl = document.getElementById('dash-streak-num');
    if (streakEl) streakEl.textContent = dash.streak_days ?? 0;
    const sparksEl = document.getElementById('dash-sparks-num');
    if (sparksEl) sparksEl.textContent = (dash.sparks_total ?? 0).toLocaleString();

    // Resolve initial mode: server > localStorage > default
    let mode = 'study';
    if (dash.default_mode === 'quick' || dash.default_mode === 'study') {
      mode = dash.default_mode;
    } else {
      try {
        const cached = localStorage.getItem('popcardDashboardMode');
        if (cached === 'quick' || cached === 'study') mode = cached;
      } catch {}
    }
    setupModeSwitch(mode);

    // Resolve initial daily goal
    let goal = dash.daily_goal || 10;
    if (!goal) {
      try {
        const cached = localStorage.getItem('popcardDailyGoal');
        if (cached) goal = Number(cached) || 10;
      } catch {}
    }
    setupDailyGoal(goal);

    // Plan description
    const planDesc = document.getElementById('settings-plan-desc');
    if (planDesc && user.tier && user.tier !== 'free') {
      planDesc.textContent = 'You\'re on the ' + user.tier + ' plan. 1000 pops per month + advanced features.';
    }

    // Wire interactive bits
    setupNotificationToggles();
    setupSound();
    setupLanguage();
    setupUserMenu();
    setupDelete();

    // Sign out — header dropdown
    document.getElementById('sign-out-btn').addEventListener('click', async () => {
      await window.PopcardAuth.signOut();
      window.location.href = '/';
    });
    // Sign out — also from the danger-zone button
    document.getElementById('settings-signout-btn').addEventListener('click', async () => {
      await window.PopcardAuth.signOut();
      window.location.href = '/';
    });
  })();

})();
