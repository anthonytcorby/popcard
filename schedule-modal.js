// schedule-modal.js — shared "schedule a study session" modal used by both
// the dashboard calendar widget (account.html) and the full /calendar page.
//
// Public API:
//   Popcard.scheduleModal.open({ dateISO, decks, onCreate })
//     - dateISO: 'YYYY-MM-DD' for the day the user tapped
//     - decks:   array of {id, title} for the deck picker
//     - onCreate: callback(scheduledSession) after a successful POST
//   Popcard.scheduleModal.close()
//
// The modal is injected into <body> lazily on first open and reused after.
// Form supports three source kinds: existing deck, paste YouTube link, or
// paste raw text. Default time = 18:00 local. Label is optional.

(function () {
  let root = null;            // the modal DOM root
  let currentOpts = null;     // { dateISO, decks, onCreate }
  let lastFocused = null;     // restore focus on close

  function ensureRoot() {
    if (root) return root;
    root = document.createElement('div');
    root.className = 'sched-modal';
    root.hidden = true;
    root.innerHTML = `
      <div class="sched-modal-backdrop" data-close></div>
      <div class="sched-modal-card" role="dialog" aria-modal="true" aria-labelledby="sched-modal-title">
        <header class="sched-modal-head">
          <h2 class="sched-modal-title" id="sched-modal-title">Schedule study time</h2>
          <button type="button" class="sched-modal-x" aria-label="Close" data-close>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>
        <p class="sched-modal-date" id="sched-modal-date">Date</p>

        <form class="sched-modal-form" id="sched-modal-form">
          <!-- Source kind tabs -->
          <div class="sched-tabs" role="tablist" aria-label="Source">
            <button type="button" class="sched-tab is-active" data-kind="deck" role="tab" aria-selected="true">Existing deck</button>
            <button type="button" class="sched-tab" data-kind="url" role="tab" aria-selected="false">YouTube / link</button>
            <button type="button" class="sched-tab" data-kind="text" role="tab" aria-selected="false">Paste text</button>
          </div>

          <!-- Per-kind input panels -->
          <div class="sched-pane" data-pane="deck">
            <label class="sched-label">Pick a deck
              <select class="sched-select" name="deckId" id="sched-deck-select">
                <option value="">Choose…</option>
              </select>
            </label>
            <p class="sched-hint" id="sched-deck-hint" hidden>No saved decks yet — paste a link or text on another tab.</p>
          </div>
          <div class="sched-pane" data-pane="url" hidden>
            <label class="sched-label">YouTube / article URL
              <input type="url" class="sched-input" name="url" placeholder="https://youtube.com/watch?v=…" />
            </label>
          </div>
          <div class="sched-pane" data-pane="text" hidden>
            <label class="sched-label">Paste the text you want to study
              <textarea class="sched-input sched-textarea" name="text" rows="5" placeholder="Notes, article body, anything…"></textarea>
            </label>
          </div>

          <div class="sched-row">
            <label class="sched-label sched-label-time">Time
              <input type="time" class="sched-input" name="time" id="sched-time" value="18:00" required />
            </label>
            <label class="sched-label sched-label-flex">Label <span class="sched-label-sub">(optional)</span>
              <input type="text" class="sched-input" name="label" maxlength="60" placeholder="e.g. Biology revision" />
            </label>
          </div>

          <div class="sched-error" id="sched-modal-error" hidden></div>

          <div class="sched-actions">
            <button type="button" class="sched-btn sched-btn-secondary" data-close>Cancel</button>
            <button type="submit" class="sched-btn sched-btn-primary" id="sched-modal-submit">Schedule</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(root);

    // Wire close handlers
    root.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', close);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !root.hidden) { e.preventDefault(); close(); }
    });

    // Tab switching
    root.querySelectorAll('.sched-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const kind = tab.dataset.kind;
        root.querySelectorAll('.sched-tab').forEach((t) => {
          const on = t === tab;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', String(on));
        });
        root.querySelectorAll('.sched-pane').forEach((p) => {
          p.hidden = p.dataset.pane !== kind;
        });
        clearError();
      });
    });

    // Form submit → POST /api/schedule
    root.querySelector('#sched-modal-form').addEventListener('submit', onSubmit);
    return root;
  }

  function showError(msg) {
    const err = root.querySelector('#sched-modal-error');
    err.textContent = msg;
    err.hidden = false;
  }
  function clearError() {
    const err = root.querySelector('#sched-modal-error');
    err.hidden = true;
    err.textContent = '';
  }

  function selectedKind() {
    const tab = root.querySelector('.sched-tab.is-active');
    return tab ? tab.dataset.kind : 'deck';
  }

  async function onSubmit(e) {
    e.preventDefault();
    clearError();
    const submitBtn = root.querySelector('#sched-modal-submit');
    submitBtn.disabled = true;

    const kind = selectedKind();
    const time = root.querySelector('#sched-time').value || '18:00';
    const [hh, mm] = time.split(':').map(Number);
    // Build a local-time Date for the chosen date + time, then ISO-stringify.
    const [y, m, d] = currentOpts.dateISO.split('-').map(Number);
    const when = new Date(y, m - 1, d, hh || 18, mm || 0, 0, 0);

    const label = (root.querySelector('input[name="label"]').value || '').trim() || null;
    const payload = { scheduledAt: when.toISOString(), sourceKind: kind, label };

    if (kind === 'deck') {
      const id = root.querySelector('#sched-deck-select').value;
      if (!id) { showError('Pick a deck or switch source type.'); submitBtn.disabled = false; return; }
      payload.sourceDeckId = id;
    } else if (kind === 'url') {
      const u = (root.querySelector('input[name="url"]').value || '').trim();
      if (!u) { showError('Paste a URL.'); submitBtn.disabled = false; return; }
      payload.sourceUrl = u;
    } else {
      const t = (root.querySelector('textarea[name="text"]').value || '').trim();
      if (!t) { showError('Paste some text.'); submitBtn.disabled = false; return; }
      payload.sourceText = t;
    }

    try {
      const r = await fetch('/api/schedule', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) { showError(data.error || 'Could not schedule. Try again.'); submitBtn.disabled = false; return; }
      window.PopcardAnalytics?.track('Schedule Created', { sourceKind: kind });
      const cb = currentOpts.onCreate;
      close();
      if (typeof cb === 'function') cb(data.session);
    } catch {
      showError('Network error. Try again.');
      submitBtn.disabled = false;
    }
  }

  function open(opts) {
    const r = ensureRoot();
    currentOpts = opts || {};
    lastFocused = document.activeElement;

    // Date header: "Mon, 8 June" — readable & local-aware
    const [y, m, d] = (opts.dateISO || '').split('-').map(Number);
    const when = new Date(y, m - 1, d);
    r.querySelector('#sched-modal-date').textContent = when.toLocaleDateString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long',
    });

    // Populate deck select with user's decks
    const sel = r.querySelector('#sched-deck-select');
    const hint = r.querySelector('#sched-deck-hint');
    sel.innerHTML = '<option value="">Choose…</option>';
    const decks = Array.isArray(opts.decks) ? opts.decks : [];
    decks.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.title || 'Untitled';
      sel.appendChild(opt);
    });
    if (!decks.length) {
      sel.disabled = true;
      hint.hidden = false;
      // Auto-switch to URL tab if they have no decks
      r.querySelector('.sched-tab[data-kind="url"]').click();
    } else {
      sel.disabled = false;
      hint.hidden = true;
      // Reset to deck tab on every open
      r.querySelector('.sched-tab[data-kind="deck"]').click();
    }

    // Reset other inputs
    r.querySelector('input[name="url"]').value = '';
    r.querySelector('textarea[name="text"]').value = '';
    r.querySelector('input[name="label"]').value = '';
    r.querySelector('#sched-time').value = '18:00';
    r.querySelector('#sched-modal-submit').disabled = false;
    clearError();

    r.hidden = false;
    document.body.classList.add('is-modal-open');
    // Focus the first interactive element for keyboard users
    setTimeout(() => {
      const focusTarget = decks.length ? sel : r.querySelector('input[name="url"]');
      focusTarget?.focus();
    }, 50);
  }

  function close() {
    if (!root) return;
    root.hidden = true;
    document.body.classList.remove('is-modal-open');
    currentOpts = null;
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  window.Popcard = window.Popcard || {};
  window.Popcard.scheduleModal = { open, close };
})();
