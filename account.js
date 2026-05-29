// Popcard /account dashboard — app-shell layout.
//
// On load:
//   1. Fetch /api/me?include=dashboard → user + streak + sparks + daily goal
//   2. Paint top bar / hero / quests / streak ring / week progress
//   3. Fetch /api/decks → recent-decks list + full deck library grid
//   4. Wire the create-from-anything form (→ /api/pop), search, mode switch,
//      user menu, and "coming soon" stubs.
//
// The study calendar (block out learning days) persists locally. Other
// unbuilt features (study plan, achievements, etc.) show a friendly toast
// instead of being dead links.

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
  // Pull the 11-char video id out of any YouTube URL form, then build a
  // thumbnail URL. Returns null for non-YouTube / unparseable sources.
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
  // Welcome sub-line copy from the user's state
  // ---------------------------------------------------------------------
  function welcomeSubFor(dash) {
    const streak = dash.streak_days || 0;
    const today = dash.cards_reviewed_today || 0;
    const goal = dash.daily_goal || 20;
    if (streak === 0 && today === 0) return "Pop something below to start your first streak.";
    if (today >= goal) return `🎉 Daily goal hit. ${streak}-day streak safe.`;
    if (streak > 0) return `You're on fire today. Let's keep that streak alive!`;
    return `Today's goal: ${goal} cards. You've got this.`;
  }

  // ---------------------------------------------------------------------
  // Paint dashboard state
  // ---------------------------------------------------------------------
  function paintDashboard(user, dash) {
    const streak = dash.streak_days ?? 0;
    const goal = dash.daily_goal || 20;
    const today = dash.cards_reviewed_today || 0;
    const popped = dash.decks_popped_today || 0;

    setText('dash-streak-num', streak);
    setText('dash-streak-num-2', streak);
    setText('dash-streak-num-3', streak);
    setText('dash-streak-best', dash.longest_streak ?? 0);

    setText('dash-goal-current', today);
    setText('dash-goal-target', goal);
    const goalPct = Math.max(0, Math.min(100, (today / goal) * 100));
    const goalFill = document.getElementById('dash-goal-fill');
    if (goalFill) goalFill.style.width = goalPct + '%';

    setText('dash-welcome-sub', welcomeSubFor(dash));

    // Quests — every count comes from real persisted state (api/me dashboard
    // block). Review = cards graded today; Time = sum of session.duration_ms
    // today / 60000; Pop = decks created today.
    paintQuest('review', today, 20);
    paintQuest('time', dash.minutes_today || 0, 15);
    paintQuest('pop', popped, 1);

    // Week progress: real sum of last 7 days from daily_activity.
    const weekSum = dash.cards_reviewed_week || 0;
    const weekGoal = goal * 7;
    setText('dash-week-num', weekSum);
    setText('dash-week-goal', weekGoal);

    // Week chart — Sun..Sat bars. dash.weekly_bars is a 7-element array
    // aligned to the current week. Heights scale against the tallest bar
    // so even a small week still reads visually (min 8% so empty days show
    // as a stub).
    const chart = document.getElementById('dash-week-chart');
    if (chart) {
      const bars = chart.querySelectorAll('.weekp-bar');
      const data = Array.isArray(dash.weekly_bars) && dash.weekly_bars.length === 7
        ? dash.weekly_bars : [0, 0, 0, 0, 0, 0, 0];
      // Chart labels currently start at Mon — shift the Sun-indexed array.
      const ordered = [data[1], data[2], data[3], data[4], data[5], data[6], data[0]];
      const max = Math.max(1, ...ordered);
      const todayIdx = ((new Date()).getDay() + 6) % 7;   // Mon=0 .. Sun=6
      bars.forEach((bar, i) => {
        const pct = Math.max(8, Math.round((ordered[i] / max) * 100));
        bar.style.height = pct + '%';
        bar.classList.toggle('is-today', i === todayIdx);
      });
    }

    // Streak ring — fill against a 7-day target.
    const ring = document.getElementById('dash-streak-ring');
    if (ring) {
      const C = 327;   // 2πr, r=52
      const frac = Math.max(0, Math.min(1, streak / 7));
      ring.style.strokeDashoffset = String(C * (1 - frac));
    }

    // Mascot mood: goal hit → celebrate, else default.
    const goalHit = today >= goal;
    const hero = document.getElementById('dash-welcome-mascot');
    if (hero) hero.src = goalHit ? '/images/mascot-cheer.png' : '/images/popcard-mascot.png';
  }

  function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = (typeof v === 'number') ? v.toLocaleString() : v;
  }
  function paintQuest(id, cur, tgt) {
    const li = document.querySelector(`.quest[data-quest-id="${id}"]`);
    if (!li) return;
    const c = li.querySelector('.quest-cur');
    const t = li.querySelector('.quest-tgt');
    const fill = li.querySelector('.quest-fill');
    if (c) c.textContent = cur;
    if (t) t.textContent = tgt;
    if (fill) fill.style.width = Math.max(0, Math.min(100, (cur / tgt) * 100)) + '%';
    li.classList.toggle('is-done', cur >= tgt);
  }

  // ---------------------------------------------------------------------
  // Decks — recent list + full library grid
  // ---------------------------------------------------------------------
  const RECENT_COLORS = ['#7C5CFC', '#1F8DDB', '#16A34A', '#DB6A1F', '#DB1F7E'];

  function renderRecent(decks) {
    const list = document.getElementById('dash-recent-list');
    if (!list) return;
    if (!decks.length) { list.innerHTML = '<li class="recent-empty">No decks yet — pop one above.</li>'; return; }
    list.innerHTML = decks.slice(0, 5).map((d, i) => {
      const yt = youtubeThumb(d);
      const thumb = yt
        ? `<span class="recent-thumb recent-thumb-yt" style="background-image:url('${yt}')"></span>`
        : `<span class="recent-thumb" style="background:${RECENT_COLORS[i % RECENT_COLORS.length]}">${escapeHtml((d.title || '?').charAt(0).toUpperCase())}</span>`;
      return `
      <a class="recent-item" href="/deck/${d.id}">
        ${thumb}
        <span class="recent-info">
          <span class="recent-title">${escapeHtml(d.title || 'Untitled')}</span>
          <span class="recent-meta">${d.cardCount} card${d.cardCount === 1 ? '' : 's'}${d.createdAt ? ' · ' + timeAgo(d.createdAt) : ''}</span>
        </span>
      </a>`;
    }).join('');
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
  async function loadDecks() {
    const loading = document.getElementById('account-decks-loading');
    const empty = document.getElementById('account-decks-empty');
    const grid = document.getElementById('account-decks-grid');
    const footer = document.getElementById('account-decks-footer');
    if (empty) empty.hidden = true;
    if (footer) footer.hidden = true;
    try {
      const r = await fetch('/api/decks?limit=30', { credentials: 'same-origin' });
      if (!r.ok) throw new Error('failed');
      const { decks } = await r.json();
      _allDecks = decks || [];
      if (loading) loading.hidden = true;
      renderRecent(_allDecks);
      if (!_allDecks.length) {
        if (empty) empty.hidden = false;
        if (grid) grid.hidden = true;
        return;
      }
      if (grid) { grid.hidden = false; grid.innerHTML = _allDecks.map(renderDeckCard).join(''); }
      if (footer) footer.hidden = false;
    } catch {
      if (loading) loading.textContent = "Couldn't load your decks. Refresh to try again.";
      renderRecent([]);
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

  // ---------------------------------------------------------------------
  // Pop loader — full-screen bobbing-logo overlay + progress bar shown while
  // a deck is being created. Progress is simulated (the /api/pop call doesn't
  // stream): it eases toward ~92% over a duration estimated from the input,
  // then snaps to 100% on success. Returns { finish, fail }.
  // ---------------------------------------------------------------------
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
    const stages = [
      'Reading your source…',
      'Pulling out the key ideas…',
      'Writing your cards…',
      'Polishing the details…',
      'Almost there…',
    ];
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

  // ---------------------------------------------------------------------
  // Create-from-anything form
  // ---------------------------------------------------------------------
  function setupCreateForm() {
    const form = document.getElementById('dash-pop-form');
    const input = document.getElementById('dash-pop-input');
    const btn = document.getElementById('dash-pop-btn');
    const status = document.getElementById('dash-pop-status');

    try {
      const pending = localStorage.getItem('popcardPendingInput');
      if (pending) { input.value = pending; localStorage.removeItem('popcardPendingInput'); }
    } catch {}

    const PLACEHOLDERS = {
      youtube: 'Paste a YouTube link…',
      article: 'Paste an article URL or full text…',
      book: 'Paste your notes or any text…',
    };
    const SOON_SOURCES = { pdf: 'PDF', upload: 'File' };
    document.querySelectorAll('.create-source').forEach((chip) => {
      chip.addEventListener('click', () => {
        const src = chip.dataset.source;
        if (SOON_SOURCES[src]) { showToast(SOON_SOURCES[src] + ' upload is coming soon ✨'); return; }
        document.querySelectorAll('.create-source').forEach((c) => c.classList.toggle('is-active', c === chip));
        input.placeholder = PLACEHOLDERS[src] || 'Paste anything…';
        input.focus();
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = (input.value || '').trim();
      if (!value) { input.focus(); return; }
      btn.classList.add('is-loading'); btn.disabled = true;
      status.hidden = true; status.classList.remove('is-error');
      const loader = startPopLoading(value);
      try {
        const mode = document.body.classList.contains('is-quick-mode') ? 'quick' : 'study';
        const r = await fetch('/api/pop', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: value, mode }),
        });
        const data = await r.json();
        if (!r.ok) {
          loader?.fail();
          status.hidden = false; status.classList.add('is-error');
          // 402 = quota exceeded. Show the friendly message + an upgrade link
          // so the user knows what to do (the raw 'quota_exceeded' code is
          // useless on its own).
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
        window.PopcardAnalytics?.track('Dashboard Pop', { mode, fromCache: String(Boolean(data.fromCache)) });
        loader?.finish();
        window.location.href = '/deck/' + data.deck.id;
      } catch {
        loader?.fail();
        status.hidden = false; status.classList.add('is-error');
        status.textContent = 'Network error. Check your connection and try again.';
      } finally { btn.classList.remove('is-loading'); btn.disabled = false; }
    });
  }

  // ---------------------------------------------------------------------
  // Mode switch
  // ---------------------------------------------------------------------
  function applyMode(mode, opts) {
    const m = (mode === 'quick') ? 'quick' : 'study';
    document.body.classList.toggle('is-quick-mode', m === 'quick');
    document.body.classList.toggle('is-study-mode', m === 'study');
    document.querySelectorAll('.dash-mode-switch-btn').forEach((b) => {
      const on = b.dataset.mode === m;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    try { localStorage.setItem('popcardDashboardMode', m); } catch {}
    if (!opts || !opts.skipPersist) {
      fetch('/api/onboarding-prefs', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_mode: m }),
      }).catch(() => {});
      window.PopcardAnalytics?.track('Mode Switch', { mode: m });
    }
  }
  function setupModeSwitch(initial) {
    applyMode(initial, { skipPersist: true });
    document.querySelectorAll('.dash-mode-switch-btn').forEach((b) => b.addEventListener('click', () => applyMode(b.dataset.mode)));
  }

  // ---------------------------------------------------------------------
  // User menu (sidebar bottom)
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
    menu.querySelectorAll('[role="menuitem"]').forEach((item) => {
      item.addEventListener('click', () => setOpen(false));
    });
  }

  // ---------------------------------------------------------------------
  // "Coming soon" stubs + search + topbar chips
  // ---------------------------------------------------------------------
  function setupSoonStubs() {
    document.querySelectorAll('[data-soon]').forEach((el) => {
      if (el.classList.contains('create-source')) return;   // handled in setupCreateForm
      el.addEventListener('click', (e) => {
        if (el.tagName === 'A') e.preventDefault();
        showToast((el.dataset.soon || 'This') + ' is coming soon ✨');
        window.PopcardAnalytics?.track('Dashboard Soon Click', { feature: el.dataset.soon || '' });
      });
    });
  }

  function setupSearch() {
    const form = document.getElementById('dash-search-form');
    const input = document.getElementById('dash-search');
    if (!form || !input) return;
    // Live-filter the recent decks list by title; full search is a TODO.
    function filter() {
      const q = (input.value || '').trim().toLowerCase();
      if (!q) { renderRecent(_allDecks); return; }
      renderRecent(_allDecks.filter((d) => (d.title || '').toLowerCase().includes(q)));
    }
    input.addEventListener('input', filter);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = (input.value || '').trim();
      if (!q) return;
      const matches = _allDecks.filter((d) => (d.title || '').toLowerCase().includes(q.toLowerCase()));
      if (matches.length === 1) { window.location.href = '/deck/' + matches[0].id; return; }
      window.location.href = '/decks';
    });
    // ⌘K / Ctrl+K focuses search
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); }
    });
  }

  function setupTopbar() {
    const streakChip = document.getElementById('dash-streak-chip');
    if (streakChip) streakChip.addEventListener('click', () => {
      document.querySelector('.streakc')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function applyTier(tier) {
    const isFree = (tier === 'free' || !tier);
    document.querySelectorAll('[data-tier-only="free"]').forEach((el) => { el.style.display = isFree ? '' : 'none'; });
  }

  // ---------------------------------------------------------------------
  // Study calendar — tap a day to block out learning time.
  // Blocked days are stored locally (key: popcardStudyDays = array of
  // YYYY-MM-DD). No backend yet; this is a personal planning aid.
  // ---------------------------------------------------------------------
  function setupCalendar() {
    const grid = document.getElementById('cal-grid');
    const label = document.getElementById('cal-month');
    const prev = document.getElementById('cal-prev');
    const next = document.getElementById('cal-next');
    if (!grid || !label) return;

    const STORE_KEY = 'popcardStudyDays';
    const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    function loadBlocked() {
      try { const v = JSON.parse(localStorage.getItem(STORE_KEY)); return new Set(Array.isArray(v) ? v : []); }
      catch { return new Set(); }
    }
    function saveBlocked(set) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify([...set])); } catch {}
    }
    // Local-date key (avoids UTC off-by-one from toISOString()).
    function ymd(y, m, d) {
      return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    const blocked = loadBlocked();
    const now = new Date();
    const todayKey = ymd(now.getFullYear(), now.getMonth(), now.getDate());
    let viewYear = now.getFullYear();
    let viewMonth = now.getMonth();

    function render() {
      label.textContent = `${MONTHS[viewMonth]} ${viewYear}`;
      const firstDow = new Date(viewYear, viewMonth, 1).getDay();
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      let html = DOW.map((d) => `<span class="cal-dow" aria-hidden="true">${d}</span>`).join('');
      for (let i = 0; i < firstDow; i++) html += '<span class="cal-day is-blank" aria-hidden="true"></span>';
      for (let d = 1; d <= daysInMonth; d++) {
        const key = ymd(viewYear, viewMonth, d);
        const cls = ['cal-day'];
        if (key === todayKey) cls.push('is-today');
        if (blocked.has(key)) cls.push('is-blocked');
        html += `<button type="button" class="${cls.join(' ')}" data-day="${key}" role="gridcell" aria-pressed="${blocked.has(key)}" aria-label="${MONTHS[viewMonth]} ${d}">${d}</button>`;
      }
      grid.innerHTML = html;
    }

    // Track scheduled-session dates so we can paint a dot on the calendar day.
    const scheduled = new Set();
    let userDecks = [];

    async function loadScheduled() {
      try {
        const r = await fetch('/api/schedule', { credentials: 'same-origin' });
        if (!r.ok) return;
        const { sessions } = await r.json();
        scheduled.clear();
        (sessions || []).forEach((s) => {
          const d = new Date(s.scheduledAt);
          scheduled.add(ymd(d.getFullYear(), d.getMonth(), d.getDate()));
        });
        applyScheduledDots();
      } catch {}
    }
    async function loadDecksForModal() {
      try {
        const r = await fetch('/api/decks?limit=50', { credentials: 'same-origin' });
        if (!r.ok) return;
        const { decks } = await r.json();
        userDecks = (decks || []).map((d) => ({ id: d.id, title: d.title }));
      } catch {}
    }
    function applyScheduledDots() {
      grid.querySelectorAll('.cal-day[data-day]').forEach((cell) => {
        cell.classList.toggle('has-scheduled', scheduled.has(cell.dataset.day));
      });
    }

    grid.addEventListener('click', (e) => {
      const cell = e.target.closest('.cal-day[data-day]');
      if (!cell) return;
      const key = cell.dataset.day;
      if (window.Popcard?.scheduleModal) {
        window.Popcard.scheduleModal.open({
          dateISO: key,
          decks: userDecks,
          onCreate: (s) => {
            scheduled.add(key);
            blocked.add(key);
            saveBlocked(blocked);
            cell.classList.add('is-blocked', 'has-scheduled');
            cell.setAttribute('aria-pressed', 'true');
            window.PopcardAnalytics?.track('Calendar Schedule', { sourceKind: s?.sourceKind, surface: 'dashboard' });
          },
        });
      } else {
        // Fallback: legacy block-day toggle
        const nowBlocked = !blocked.has(key);
        if (nowBlocked) blocked.add(key); else blocked.delete(key);
        saveBlocked(blocked);
        cell.classList.toggle('is-blocked', nowBlocked);
        cell.setAttribute('aria-pressed', String(nowBlocked));
      }
    });

    // Lazy-load scheduled sessions + decks list after the calendar paints.
    Promise.all([loadScheduled(), loadDecksForModal()]).then(applyScheduledDots);

    prev?.addEventListener('click', () => { if (--viewMonth < 0) { viewMonth = 11; viewYear--; } render(); });
    next?.addEventListener('click', () => { if (++viewMonth > 11) { viewMonth = 0; viewYear++; } render(); });

    render();
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
      window.location.href = '/login?next=' + encodeURIComponent('/account');
      return;
    }
    if (!payload || !payload.user) {
      window.location.href = '/login?next=' + encodeURIComponent('/account');
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
    applyTier(user.tier);

    // Resolve initial mode: server > localStorage > study
    let mode = 'study';
    if (dash.default_mode === 'quick' || dash.default_mode === 'study') mode = dash.default_mode;
    else { try { const c = localStorage.getItem('popcardDashboardMode'); if (c === 'quick' || c === 'study') mode = c; } catch {} }
    setupModeSwitch(mode);

    paintDashboard(user, dash);

    setupCreateForm();
    setupUserMenu();
    setupSoonStubs();
    setupSearch();
    setupTopbar();
    setupCalendar();
    wireDeckActions();

    document.getElementById('sign-out-btn')?.addEventListener('click', async () => {
      await window.PopcardAuth.signOut();
      window.PopcardAnalytics?.track('Sign Out');
      window.location.href = '/';
    });
    document.getElementById('delete-all-decks-btn')?.addEventListener('click', deleteAllDecks);
    document.getElementById('dash-goal-edit')?.addEventListener('click', () =>
      showToast('Daily-goal picker is coming soon — change it in Settings ✨'));

    loadDecks();
  })();

})();
