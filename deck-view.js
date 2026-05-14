(function () {
  const TYPE_LABELS = {
    idea: 'Key idea',
    definition: 'Definition',
    example: 'Example',
    analogy: 'Analogy',
    mistake: 'Common mistake',
    comparison: 'Comparison',
    formula: 'Formula',
    action: 'Action step',
  };
  const IMPORTANCE_LABELS = {
    must_know: 'Must know',
    good_to_know: 'Good to know',
    extra_context: 'Extra',
  };

  const pathMatch = window.location.pathname.match(/^\/deck\/([\w-]+)/);
  const params = new URLSearchParams(window.location.search);
  const id = pathMatch?.[1] || params.get('id');

  const $ = (sel) => document.getElementById(sel);

  const loading = $('deck-loading');
  const errBox = $('deck-error');
  const meta = $('deck-meta');
  const wrap = $('deck-card-wrap');
  const gridWrap = $('deck-grid-wrap');
  const gridEl = $('deck-grid');
  const gridCountEl = $('deck-grid-count');
  const titleEl = $('deck-title');
  const sourceEl = $('deck-source');
  const modePill = $('deck-mode-pill');

  const card = $('deck-card');
  const qEl = $('deck-card-question');
  const aEl = $('deck-card-answer');
  const aInlineEl = $('deck-card-answer-inline');
  const hintEl = $('deck-card-hint');
  const countEl = $('deck-card-count');
  const countBackEl = $('deck-card-count-back');
  const typeBadge = $('deck-card-type');
  const typeBadgeBack = $('deck-card-type-back');
  const importanceBadge = $('deck-card-importance');
  const tsLink = $('deck-card-timestamp');
  const tsLabel = $('deck-card-timestamp-label');
  const tapReveal = $('deck-card-tap-reveal');
  const actionsFront = $('deck-card-actions-front');

  const progress = $('deck-progress');
  const prev = $('deck-prev');
  const next = $('deck-next');
  const showAllBtn = $('deck-show-all');
  const gridBack = $('deck-grid-back');

  function showError(msg) {
    loading.hidden = true;
    errBox.hidden = false;
    errBox.textContent = msg;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function ytTimestampUrl(sourceUrl, seconds) {
    if (!sourceUrl || typeof seconds !== 'number') return null;
    try {
      const url = new URL(sourceUrl);
      url.searchParams.set('t', `${Math.max(0, Math.floor(seconds))}s`);
      return url.toString();
    } catch {
      return null;
    }
  }

  function formatSeconds(s) {
    const total = Math.max(0, Math.floor(s));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function setBadge(el, label, kind) {
    if (!label) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = label;
    el.dataset.kind = kind;
  }

  if (!id) {
    showError('No deck ID provided.');
    return;
  }

  (async function init() {
    let res;
    try {
      res = await fetch('/api/deck?id=' + encodeURIComponent(id), { credentials: 'same-origin' });
    } catch {
      showError('Network error. Try refreshing.');
      return;
    }

    if (res.status === 401) {
      window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname + window.location.search);
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showError(data.error || 'Could not load this deck.');
      return;
    }

    const { deck, cards } = await res.json();

    loading.hidden = true;
    meta.hidden = false;

    titleEl.textContent = deck.title || 'Untitled deck';
    modePill.textContent = deck.mode;
    if (deck.sourceUrl) {
      sourceEl.hidden = false;
      sourceEl.href = deck.sourceUrl;
      sourceEl.textContent = deck.sourceUrl;
    }

    if (!cards.length) {
      showError("This deck doesn't have any cards yet.");
      return;
    }

    const isSimple = deck.mode === 'simple';
    card.classList.toggle('mode-simple', isSimple);

    let idx = 0;
    let flipped = false;

    function render() {
      const c = cards[idx];
      qEl.textContent = c.question;
      aEl.textContent = c.answer;
      aInlineEl.textContent = c.answer;
      countEl.textContent = countBackEl.textContent = `${idx + 1} / ${cards.length}`;

      setBadge(typeBadge, TYPE_LABELS[c.type] || null, c.type || 'idea');
      setBadge(typeBadgeBack, TYPE_LABELS[c.type] || null, c.type || 'idea');
      setBadge(importanceBadge, IMPORTANCE_LABELS[c.importance] || null, c.importance || 'good_to_know');

      if (c.hint) {
        hintEl.hidden = false;
        hintEl.textContent = '💡 ' + c.hint;
      } else {
        hintEl.hidden = true;
      }

      const tsUrl = ytTimestampUrl(deck.sourceUrl, c.sourceTimestampSeconds);
      if (tsUrl && deck.sourceType === 'youtube') {
        tsLink.hidden = false;
        tsLink.href = tsUrl;
        tsLabel.textContent = `Watch at ${formatSeconds(c.sourceTimestampSeconds)}`;
      } else {
        tsLink.hidden = true;
      }

      if (isSimple) {
        aInlineEl.hidden = false;
        actionsFront.hidden = false;
        tapReveal.hidden = true;
      } else {
        aInlineEl.hidden = true;
        actionsFront.hidden = true;
        tapReveal.hidden = false;
      }

      progress.style.setProperty('--p', `${((idx + 1) / cards.length) * 100}%`);
      flipped = false;
      card.classList.remove('flipped');
      prev.disabled = idx === 0;
      next.disabled = false;
      next.querySelector('svg').style.opacity = idx === cards.length - 1 ? '1' : '1';
    }

    function showGrid(reason) {
      renderGrid();
      wrap.hidden = true;
      gridWrap.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      window.PopcardAnalytics?.track('Deck Grid View', { reason: reason || 'manual' });
    }

    function showCards() {
      wrap.hidden = false;
      gridWrap.hidden = true;
    }

    function renderGrid() {
      gridCountEl.textContent = cards.length;
      gridEl.innerHTML = cards.map((c, i) => {
        const typeLabel = TYPE_LABELS[c.type] || c.type || 'Card';
        const impLabel = IMPORTANCE_LABELS[c.importance] || c.importance || 'Good to know';
        const tsUrl = ytTimestampUrl(deck.sourceUrl, c.sourceTimestampSeconds);
        const tsBlock = (tsUrl && deck.sourceType === 'youtube')
          ? `<a class="deck-grid-ts" href="${tsUrl}" target="_blank" rel="noopener">▶ Watch at ${formatSeconds(c.sourceTimestampSeconds)}</a>`
          : '';
        const hintBlock = c.hint
          ? `<div class="deck-grid-hint">💡 ${escapeHtml(c.hint)}</div>`
          : '';
        return `
          <article class="deck-grid-card" data-importance="${c.importance || 'good_to_know'}">
            <div class="deck-grid-card-top">
              <span class="deck-grid-num">${i + 1} / ${cards.length}</span>
              <div class="deck-grid-card-badges">
                <span class="deck-grid-badge deck-grid-badge-type" data-kind="${c.type || 'idea'}">${escapeHtml(typeLabel)}</span>
                <span class="deck-grid-badge deck-grid-badge-importance" data-kind="${c.importance || 'good_to_know'}">${escapeHtml(impLabel)}</span>
              </div>
            </div>
            <h3 class="deck-grid-q">${escapeHtml(c.question)}</h3>
            <p class="deck-grid-a">${escapeHtml(c.answer)}</p>
            ${hintBlock}
            ${tsBlock}
          </article>
        `;
      }).join('');
    }

    // Flip on click (study mode only)
    card.addEventListener('click', (e) => {
      if (isSimple) return;
      if (e.target.closest('.deck-action, .deck-card-timestamp')) return;
      flipped = !flipped;
      card.classList.toggle('flipped', flipped);
      window.PopcardAnalytics?.track('Card Flip', { side: flipped ? 'answer' : 'question' });
    });

    prev.addEventListener('click', (e) => {
      e.stopPropagation();
      if (idx > 0) { idx--; render(); }
    });

    next.addEventListener('click', (e) => {
      e.stopPropagation();
      if (idx < cards.length - 1) {
        idx++;
        render();
      } else {
        // Reached the end → show all cards
        showGrid('end_of_deck');
      }
    });

    showAllBtn.addEventListener('click', () => showGrid('manual'));
    gridBack.addEventListener('click', () => showCards());

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      // Only handle keys while in single-card view
      if (gridWrap.hidden === false) {
        if (e.key === 'Escape') showCards();
        return;
      }
      if (e.key === 'ArrowLeft' && idx > 0) { idx--; render(); }
      else if (e.key === 'ArrowRight') {
        if (idx < cards.length - 1) { idx++; render(); }
        else { showGrid('end_of_deck'); }
      } else if (!isSimple && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        card.click();
      }
    });

    // Per-card refine actions (both front and back have the same buttons)
    document.querySelectorAll('.deck-action[data-refine]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = btn.dataset.refine;
        const c = cards[idx];
        const originalAnswer = c.answer;
        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = '…';
        try {
          const r = await fetch('/api/refine', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, question: c.question, answer: c.answer }),
          });
          if (!r.ok) throw new Error('refine failed');
          const data = await r.json();
          // Update both visible answer slots (we may be on either side)
          aEl.textContent = data.answer;
          aInlineEl.textContent = data.answer;
          // Persist on the in-memory card so it sticks across navigation
          cards[idx].answer = data.answer;
          window.PopcardAnalytics?.track('Card Refine', { action });
        } catch {
          aEl.textContent = originalAnswer;
          aInlineEl.textContent = originalAnswer;
          alert("Couldn't rewrite that — try again.");
        } finally {
          btn.disabled = false;
          btn.textContent = originalLabel;
        }
      });
    });

    wrap.hidden = false;
    render();
    window.PopcardAnalytics?.track('Deck Viewed', {
      mode: deck.mode,
      cards: String(cards.length),
      cached: String(!!deck.fromCache),
    });
  })();
})();
