// Calendar page — a full-month study planner. Tap a day to block out study
// time; saved locally under the same key as the dashboard's calendar card, so
// the two stay in sync.

(function () {
  const STORE_KEY = 'popcardStudyDays';
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  function loadBlocked() {
    try { const v = JSON.parse(localStorage.getItem(STORE_KEY)); return new Set(Array.isArray(v) ? v : []); }
    catch { return new Set(); }
  }
  function saveBlocked(set) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify([...set])); } catch {}
  }
  // Local-date key (avoids UTC off-by-one).
  function ymd(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  (async function () {
    await window.Popcard.ready;

    const grid = document.getElementById('fcal-grid');
    const label = document.getElementById('fcal-month');
    const prev = document.getElementById('fcal-prev');
    const next = document.getElementById('fcal-next');
    const count = document.getElementById('fcal-count');
    if (!grid || !label) return;

    const blocked = loadBlocked();
    const now = new Date();
    const todayKey = ymd(now.getFullYear(), now.getMonth(), now.getDate());
    let viewYear = now.getFullYear();
    let viewMonth = now.getMonth();

    function updateCount() {
      if (!count) return;
      const n = blocked.size;
      count.textContent = n ? `${n} study day${n === 1 ? '' : 's'} planned` : '';
    }

    function render() {
      label.textContent = `${MONTHS[viewMonth]} ${viewYear}`;
      const firstDow = new Date(viewYear, viewMonth, 1).getDay();
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      let html = DOW.map((d) => `<span class="fcal-dow" aria-hidden="true">${d}</span>`).join('');
      for (let i = 0; i < firstDow; i++) html += '<span class="fcal-day is-blank" aria-hidden="true"></span>';
      for (let d = 1; d <= daysInMonth; d++) {
        const key = ymd(viewYear, viewMonth, d);
        const cls = ['fcal-day'];
        if (key === todayKey) cls.push('is-today');
        if (blocked.has(key)) cls.push('is-blocked');
        html += `<button type="button" class="${cls.join(' ')}" data-day="${key}" role="gridcell" aria-pressed="${blocked.has(key)}" aria-label="${MONTHS[viewMonth]} ${d}"><span class="fcal-day-num">${d}</span></button>`;
      }
      grid.innerHTML = html;
      updateCount();
    }

    // Scheduled sessions — refresh from server on load + after every create.
    // The Set holds YYYY-MM-DD strings of dates that have ≥1 scheduled session.
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
          const k = ymd(d.getFullYear(), d.getMonth(), d.getDate());
          scheduled.add(k);
        });
        // Re-paint to show dots
        applyScheduledDots();
        updateCount();
      } catch {}
    }
    async function loadDecks() {
      try {
        const r = await fetch('/api/decks?limit=50', { credentials: 'same-origin' });
        if (!r.ok) return;
        const { decks } = await r.json();
        userDecks = (decks || []).map((d) => ({ id: d.id, title: d.title }));
      } catch {}
    }
    function applyScheduledDots() {
      grid.querySelectorAll('.fcal-day[data-day]').forEach((cell) => {
        cell.classList.toggle('has-scheduled', scheduled.has(cell.dataset.day));
      });
    }

    grid.addEventListener('click', (e) => {
      const cell = e.target.closest('.fcal-day[data-day]');
      if (!cell) return;
      const key = cell.dataset.day;
      // Open the schedule modal instead of the old block-day toggle.
      if (window.Popcard?.scheduleModal) {
        window.Popcard.scheduleModal.open({
          dateISO: key,
          decks: userDecks,
          onCreate: (s) => {
            scheduled.add(key);
            // Also keep the legacy "blocked day" visual so users see progress.
            blocked.add(key);
            saveBlocked(blocked);
            cell.classList.add('is-blocked', 'has-scheduled');
            cell.setAttribute('aria-pressed', 'true');
            updateCount();
            window.PopcardAnalytics?.track('Calendar Schedule', { sourceKind: s?.sourceKind });
          },
        });
      } else {
        // Fallback if the modal script didn't load: original block-day toggle
        const nowBlocked = !blocked.has(key);
        if (nowBlocked) blocked.add(key); else blocked.delete(key);
        saveBlocked(blocked);
        cell.classList.toggle('is-blocked', nowBlocked);
        cell.setAttribute('aria-pressed', String(nowBlocked));
        updateCount();
      }
    });

    prev?.addEventListener('click', () => { if (--viewMonth < 0) { viewMonth = 11; viewYear--; } render(); applyScheduledDots(); });
    next?.addEventListener('click', () => { if (++viewMonth > 11) { viewMonth = 0; viewYear++; } render(); applyScheduledDots(); });

    render();
    // Lazy-load scheduled + decks in parallel after first paint
    Promise.all([loadScheduled(), loadDecks()]).then(applyScheduledDots);
  })();
})();
