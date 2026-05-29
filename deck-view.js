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
  const checkedBadge = $('deck-checked-badge');
  const checkedBadgeLabel = $('deck-checked-badge-label');
  const cardFlag = $('deck-card-flag');
  const cardFlagText = $('deck-card-flag-text');
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
  const startQuizBtn = $('deck-start-quiz');
  const startReviewBtn = $('deck-start-review');
  const startReviewLabel = $('deck-start-review-label');

  // Deck-level action refs
  const pinBtn = $('deck-pin');
  const pinLabel = $('deck-pin-label');
  const renameBtn = $('deck-rename');
  const deleteBtn = $('deck-delete');

  // Quiz refs
  const quizWrap = $('deck-quiz-wrap');
  const quizLoading = $('deck-quiz-loading');
  const quizError = $('deck-quiz-error');
  const quizActive = $('deck-quiz-active');
  const quizResults = $('deck-quiz-results');
  const quizQuestionEl = $('quiz-question');
  const quizOptionsEl = $('quiz-options');
  const quizFeedback = $('quiz-feedback');
  const quizFeedbackStatus = $('quiz-feedback-status');
  const quizFeedbackText = $('quiz-feedback-text');
  const quizNextBtn = $('quiz-next');
  const quizCurrentNum = $('quiz-current-num');
  const quizTotalNum = $('quiz-total-num');
  const quizProgressFill = $('quiz-progress-fill');
  const quizScoreEmoji = $('quiz-score-emoji');
  const quizScoreNum = $('quiz-score-num');
  const quizScoreLabel = $('quiz-score-label');
  const quizScoreSub = $('quiz-score-sub');
  const quizRetake = $('quiz-retake');
  const quizBackDeck = $('quiz-back-deck');
  const quizMissedList = $('quiz-missed-list');

  // Review-mode refs (spaced repetition)
  const reviewWrap = $('deck-review-wrap');
  const reviewEmpty = $('deck-review-empty');
  const reviewActive = $('deck-review-active');
  const reviewDone = $('deck-review-done');
  const reviewQSide = $('deck-review-q-side');
  const reviewASide = $('deck-review-a-side');
  const reviewMastery = $('deck-review-mastery');
  const reviewQuestionEl = $('review-question');
  const reviewQuestionSmall = $('review-question-small');
  const reviewAnswerEl = $('review-answer');
  const reviewRevealBtn = $('deck-review-reveal');
  const reviewCurrentNum = $('review-current-num');
  const reviewTotalNum = $('review-total-num');
  const reviewProgressFill = $('review-progress-fill');
  const reviewDoneCount = $('review-done-count');
  const reviewDoneBack = $('deck-review-done-back');
  const reviewEmptyBack = $('deck-review-empty-back');

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

  // Render answer text into structured HTML.
  //   Blocks separated by blank lines  → <p>
  //   Blocks where every line starts with "• " → <ul><li>
  //   A block where the FIRST line starts with `"` AND a later line starts
  //   with "— " is a quote block — rendered as <blockquote>.
  //   Single newlines inside a paragraph become <br> (keeps quote attribution
  //   on the next visual line). `**bold**` becomes <strong>.
  // Safe from injection: every non-pattern character is HTML-escaped, so the
  // only HTML the LLM can introduce is <p>, <blockquote>, <ul>, <li>,
  // <strong>, <br>, and our own attribution <span>.
  function richTextToHtml(s) {
    if (!s) return '';
    const blocks = String(s).trim().split(/\n{2,}/);
    const out = [];
    for (const block of blocks) {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) continue;
      const isBullets = lines.every((l) => l.startsWith('•'));
      if (isBullets) {
        out.push(
          '<ul class="card-answer-list">' +
            lines
              .map((l) => `<li>${renderInline(l.replace(/^•\s*/, ''))}</li>`)
              .join('') +
            '</ul>'
        );
        continue;
      }
      const looksLikeQuote =
        lines[0].startsWith('"') && lines.some((l) => /^[—-]\s/.test(l));
      const rendered = lines
        .map((l) => {
          if (/^[—-]\s/.test(l)) {
            return `<span class="card-answer-attr">${renderInline(l)}</span>`;
          }
          return renderInline(l);
        })
        .join('<br>');
      if (looksLikeQuote) {
        out.push(`<blockquote class="card-answer-quote">${rendered}</blockquote>`);
      } else {
        out.push(`<p class="card-answer-p">${rendered}</p>`);
      }
    }
    return out.join('');
  }

  function renderInline(s) {
    return escapeHtml(s).replace(/\*\*([^*\n][^*]*?)\*\*/g, '<strong>$1</strong>');
  }

  // Extract the YouTube video ID from any URL shape we accept (watch?v=, youtu.be/, shorts/, embed/).
  function youtubeIdFromUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      if (host.includes('youtu.be')) {
        return (u.pathname.slice(1).split(/[?#]/)[0]) || null;
      }
      if (host.includes('youtube.com')) {
        if (u.pathname === '/watch') return u.searchParams.get('v');
        const parts = u.pathname.split('/').filter(Boolean);
        if ((parts[0] === 'shorts' || parts[0] === 'embed') && parts[1]) return parts[1];
      }
    } catch {}
    return null;
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

    // Pre-warm the quiz in the background. Generation is the slow part, so kick
    // it off now (while the user reviews the deck) — by the time they open Quiz
    // Mode it's cached and "preparation" is instant. Fire-and-forget; cached
    // decks return immediately, so this is a cheap no-op once warmed.
    if (cards.filter((c) => c.position !== 0 && c.answer).length >= 4) {
      fetch('/api/quiz?id=' + encodeURIComponent(deck.id), { credentials: 'same-origin' }).catch(() => {});
    }

    // ---- Trust pass: paint the "Pop-checked" badge from the stored status,
    // then kick off the critique in the background if it hasn't run. When it
    // returns, re-paint the badge + re-flag cards without a reload. ----
    paintCheckedBadge(deck.reviewStatus);
    if (!deck.reviewStatus || deck.reviewStatus === 'unreviewed') {
      fetch('/api/review-deck', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId: deck.id }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => {
          if (!res || !res.status) return;
          deck.reviewStatus = res.status;
          paintCheckedBadge(res.status);
          // Re-fetch the deck's cards so confidence flags are current, then
          // refresh the visible card if it's now flagged.
          if (res.status === 'flagged') refreshConfidence();
          // If the enrichment pass re-grouped the lessons into named, semantic
          // ones, tell the lesson path to re-render so the new titles show.
          if (res.lessonsGrouped > 0) {
            window.dispatchEvent(new CustomEvent('popcard-lessons-regrouped'));
          }
        })
        .catch(() => {});
    }

    const isSimple = deck.mode === 'simple';
    card.classList.toggle('mode-simple', isSimple);

    let idx = 0;
    let flipped = false;

    function render() {
      const c = cards[idx];
      qEl.textContent = c.question;
      let answerHtml = richTextToHtml(c.answer);
      // Prepend the YouTube thumbnail on the overview card (first card) for
      // YouTube-sourced decks so the reader sees the video they're studying.
      if (idx === 0 && deck.sourceType === 'youtube' && deck.sourceUrl) {
        const ytId = youtubeIdFromUrl(deck.sourceUrl);
        if (ytId) {
          const thumbUrl = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
          answerHtml =
            `<a class="card-yt-thumb" href="${escapeHtml(deck.sourceUrl)}" target="_blank" rel="noopener" aria-label="Open video on YouTube">` +
              `<img src="${thumbUrl}" alt="Video thumbnail" loading="lazy">` +
              `<span class="card-yt-thumb-play" aria-hidden="true">▶</span>` +
            `</a>` + answerHtml;
        }
      }
      aEl.innerHTML = answerHtml;
      aInlineEl.innerHTML = answerHtml;
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

      // Trust pass: show the flag if the critique marked this card low/medium.
      if (cardFlag) {
        const conf = c.confidence;
        if (conf === 'low' || conf === 'medium') {
          cardFlag.hidden = false;
          cardFlag.dataset.confidence = conf;
          cardFlagText.textContent = c.flagReason
            ? `Heads up: ${c.flagReason}`
            : 'Double-check this one against the source.';
        } else {
          cardFlag.hidden = true;
        }
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
      if (quizWrap) quizWrap.hidden = true;
      if (reviewWrap) reviewWrap.hidden = true;
      gridWrap.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      window.PopcardAnalytics?.track('Deck Grid View', { reason: reason || 'manual' });
    }

    function showCards() {
      wrap.hidden = false;
      gridWrap.hidden = true;
      if (quizWrap) quizWrap.hidden = true;
      if (reviewWrap) reviewWrap.hidden = true;
    }

    // Trust pass UI helpers --------------------------------------------------
    function paintCheckedBadge(status) {
      if (!checkedBadge) return;
      if (status === 'checked') {
        checkedBadge.hidden = false;
        checkedBadge.dataset.status = 'checked';
        checkedBadgeLabel.textContent = 'Pop-checked';
        checkedBadge.title = "Every card passed Popcard's fact-check";
      } else if (status === 'flagged') {
        checkedBadge.hidden = false;
        checkedBadge.dataset.status = 'flagged';
        const n = deck.reviewData?.flaggedCount;
        checkedBadgeLabel.textContent = n ? `${n} to double-check` : 'Some cards to double-check';
        checkedBadge.title = 'Popcard flagged a few cards to verify against the source';
      } else {
        checkedBadge.hidden = true;
      }
    }

    // Re-pull the deck's cards so confidence/flagReason are current after the
    // critique runs, then re-render the visible card.
    async function refreshConfidence() {
      try {
        const r = await fetch('/api/deck?id=' + encodeURIComponent(deck.id), { credentials: 'same-origin' });
        if (!r.ok) return;
        const data = await r.json();
        const fresh = data.cards || [];
        // Patch confidence + flagReason onto the in-memory cards by id.
        const byId = new Map(fresh.map((c) => [c.id, c]));
        cards.forEach((c) => {
          const f = byId.get(c.id);
          if (f) { c.confidence = f.confidence; c.flagReason = f.flagReason; }
        });
        if (deck.reviewData == null && data.deck) deck.reviewData = data.deck.reviewData;
        render();
      } catch {}
    }

    const GRID_PALETTE = [
      { bg: '#6E3DEA', tone: 'light' },  // purple
      { bg: '#FF3DA0', tone: 'light' },  // pink
      { bg: '#FF8A3D', tone: 'light' },  // orange
      { bg: '#FFD338', tone: 'dark'  },  // yellow
      { bg: '#2BC489', tone: 'light' },  // green
      { bg: '#3DAEFF', tone: 'light' },  // blue
    ];

    function renderGrid() {
      gridCountEl.textContent = cards.length;
      gridEl.innerHTML = cards.map((c, i) => {
        const color = GRID_PALETTE[i % GRID_PALETTE.length];
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
          <article class="deck-grid-card" data-importance="${c.importance || 'good_to_know'}" data-tone="${color.tone}" style="background:${color.bg}">
            <div class="deck-grid-card-top">
              <span class="deck-grid-num">${i + 1} / ${cards.length}</span>
              <div class="deck-grid-card-badges">
                <span class="deck-grid-badge deck-grid-badge-type">${escapeHtml(typeLabel)}</span>
                <span class="deck-grid-badge deck-grid-badge-importance" data-kind="${c.importance || 'good_to_know'}">${escapeHtml(impLabel)}</span>
              </div>
            </div>
            <h3 class="deck-grid-q">${escapeHtml(c.question)}</h3>
            <div class="deck-grid-a">${richTextToHtml(c.answer)}</div>
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

    // ---------- Quiz Mode (Study decks only) ----------
    let quizQuestions = null;       // cached so Retake doesn't re-pay
    let quizIdx = 0;
    let quizMissed = [];            // array of { q, given, correct, explanation }
    let quizAnswered = false;       // whether current question has been answered

    // Quiz Mode is now available on every deck (Simple + Study). Cards from
    // Simple mode are now rich enough (200-400 for a book) that a quiz adds
    // real value, not just a Study-mode add-on.
    if (cards.length >= 3) {
      startQuizBtn.hidden = false;
      startQuizBtn.addEventListener('click', () => startQuiz());
      quizNextBtn.addEventListener('click', () => advanceQuiz());
      quizRetake.addEventListener('click', () => resetQuiz());
      quizBackDeck.addEventListener('click', () => hideQuiz());
    }

    function showQuizSection() {
      wrap.hidden = true;
      gridWrap.hidden = true;
      quizWrap.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function hideQuiz() {
      quizWrap.hidden = true;
      gridWrap.hidden = true;
      wrap.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function startQuiz() {
      showQuizSection();
      quizLoading.hidden = false;
      quizActive.hidden = true;
      quizResults.hidden = true;
      quizError.hidden = true;

      if (quizQuestions) {
        // Already cached
        kickOffQuiz();
        return;
      }

      try {
        const r = await fetch('/api/quiz', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deckId: deck.id }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || data.error || 'Quiz failed');
        if (!data.questions?.length) throw new Error('No quiz questions returned');
        quizQuestions = data.questions;
        kickOffQuiz();
        window.PopcardAnalytics?.track('Quiz Started', { questions: String(quizQuestions.length) });
      } catch (e) {
        quizLoading.hidden = true;
        quizError.hidden = false;
        quizError.textContent = e.message || 'Could not generate quiz. Try again.';
      }
    }

    function kickOffQuiz() {
      quizLoading.hidden = true;
      quizError.hidden = true;
      quizResults.hidden = true;
      quizActive.hidden = false;
      quizIdx = 0;
      quizMissed = [];
      quizTotalNum.textContent = quizQuestions.length;
      renderQuizQuestion();
    }

    function resetQuiz() {
      kickOffQuiz();
      window.PopcardAnalytics?.track('Quiz Retake');
    }

    function renderQuizQuestion() {
      const q = quizQuestions[quizIdx];
      quizCurrentNum.textContent = quizIdx + 1;
      quizProgressFill.style.width = `${((quizIdx) / quizQuestions.length) * 100}%`;
      quizQuestionEl.textContent = q.question;
      quizFeedback.hidden = true;
      quizAnswered = false;
      quizOptionsEl.innerHTML = '';
      quizOptionsEl.classList.remove('has-selected');
      q.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'deck-quiz-option';
        btn.dataset.index = String(i);
        btn.dataset.letter = String.fromCharCode(65 + i); // A, B, C, D, ...
        const textSpan = document.createElement('span');
        textSpan.className = 'deck-quiz-option-text';
        textSpan.textContent = opt;
        btn.appendChild(textSpan);
        btn.addEventListener('click', () => selectQuizOption(i, btn));
        quizOptionsEl.appendChild(btn);
      });
    }

    function selectQuizOption(idx, btn) {
      if (quizAnswered) return;
      quizAnswered = true;
      const q = quizQuestions[quizIdx];
      const correct = idx === q.correctIndex;
      quizOptionsEl.classList.add('has-selected');
      Array.from(quizOptionsEl.children).forEach((b, i) => {
        b.disabled = true;
        if (i === q.correctIndex) b.classList.add('is-correct');
        if (i === idx && !correct) b.classList.add('is-wrong');
      });
      quizFeedback.hidden = false;
      quizFeedbackStatus.textContent = correct ? '✓ Correct' : '✗ Not quite';
      quizFeedbackStatus.className = 'deck-quiz-feedback-status ' + (correct ? 'is-correct' : 'is-wrong');
      quizFeedbackText.textContent = q.explanation || '';
      quizNextBtn.textContent = (quizIdx === quizQuestions.length - 1) ? 'See results →' : 'Next question →';
      if (!correct) {
        quizMissed.push({
          q: q.question,
          given: q.options[idx],
          correct: q.options[q.correctIndex],
          explanation: q.explanation,
        });
      }
      window.PopcardAnalytics?.track('Quiz Answer', { correct: String(correct) });
      // Scroll feedback into view if needed
      quizFeedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function advanceQuiz() {
      if (quizIdx < quizQuestions.length - 1) {
        quizIdx++;
        renderQuizQuestion();
      } else {
        showQuizResults();
      }
    }

    function showQuizResults() {
      quizActive.hidden = true;
      quizResults.hidden = false;
      quizProgressFill.style.width = '100%';
      const total = quizQuestions.length;
      const right = total - quizMissed.length;
      const pct = Math.round((right / total) * 100);
      quizScoreNum.textContent = `${right} / ${total}`;
      quizScoreEmoji.textContent = pct === 100 ? '🏆' : pct >= 80 ? '🎉' : pct >= 60 ? '💪' : pct >= 40 ? '📚' : '🌱';
      quizScoreLabel.textContent =
        pct === 100 ? "Perfect — you've got this." :
        pct >= 80 ? "Strong work." :
        pct >= 60 ? "Solid, with a couple to revisit." :
        pct >= 40 ? "A few to brush up on." :
        "Worth another pass through the cards.";
      quizScoreSub.textContent = pct === 100
        ? 'Nothing to review.'
        : `${quizMissed.length} card${quizMissed.length === 1 ? '' : 's'} worth revisiting.`;

      if (quizMissed.length) {
        quizMissedList.hidden = false;
        quizMissedList.innerHTML = `
          <h3 class="deck-quiz-missed-title">Worth revisiting</h3>
          ${quizMissed.map((m) => `
            <article class="deck-quiz-missed-card">
              <div class="deck-quiz-missed-q">${escapeHtml(m.q)}</div>
              <div class="deck-quiz-missed-row"><span class="deck-quiz-missed-label deck-quiz-missed-label-wrong">You said</span> ${escapeHtml(m.given)}</div>
              <div class="deck-quiz-missed-row"><span class="deck-quiz-missed-label deck-quiz-missed-label-right">Correct</span> ${escapeHtml(m.correct)}</div>
              <p class="deck-quiz-missed-why">${escapeHtml(m.explanation || '')}</p>
            </article>
          `).join('')}
        `;
      } else {
        quizMissedList.hidden = true;
      }

      window.PopcardAnalytics?.track('Quiz Completed', {
        score: String(right),
        total: String(total),
        pct: String(pct),
      });
    }

    // ---------- Review Mode (spaced repetition) ----------
    let reviewQueue = [];
    let reviewIdx = 0;
    let reviewCompletedCount = 0;

    if (startReviewBtn && reviewWrap) {
      startReviewBtn.hidden = false;
      // Surface "X due" badge on the button if we can ping the queue summary.
      fetch(`/api/review?deckId=${encodeURIComponent(deck.id)}`, { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.cards?.length) {
            startReviewLabel.textContent = `Review ${d.cards.length} due`;
          }
        })
        .catch(() => {});

      startReviewBtn.addEventListener('click', () => startReview());
      reviewRevealBtn.addEventListener('click', () => revealReviewAnswer());
      reviewDoneBack.addEventListener('click', () => exitReview());
      reviewEmptyBack.addEventListener('click', () => exitReview());
      document.querySelectorAll('.deck-review-rating').forEach((btn) => {
        btn.addEventListener('click', () => rateCurrentReview(btn.dataset.rating));
      });
    }

    async function startReview() {
      wrap.hidden = true;
      gridWrap.hidden = true;
      if (quizWrap) quizWrap.hidden = true;
      reviewWrap.hidden = false;
      reviewActive.hidden = true;
      reviewEmpty.hidden = true;
      reviewDone.hidden = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });

      try {
        const r = await fetch(`/api/review?deckId=${encodeURIComponent(deck.id)}`, {
          credentials: 'same-origin',
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.message || 'Could not load review queue');
        reviewQueue = data.cards || [];
        reviewIdx = 0;
        reviewCompletedCount = 0;
        if (!reviewQueue.length) {
          reviewEmpty.hidden = false;
          return;
        }
        reviewTotalNum.textContent = reviewQueue.length;
        reviewActive.hidden = false;
        renderReviewCard();
        window.PopcardAnalytics?.track('Review Started', { due: String(reviewQueue.length) });
      } catch (e) {
        reviewEmpty.hidden = false;
      }
    }

    function exitReview() {
      reviewWrap.hidden = true;
      gridWrap.hidden = true;
      wrap.hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function renderReviewCard() {
      const c = reviewQueue[reviewIdx];
      reviewMastery.textContent = c.mastery || 'new';
      reviewMastery.dataset.mastery = c.mastery || 'new';
      reviewQuestionEl.textContent = c.question;
      reviewQuestionSmall.textContent = c.question;
      reviewAnswerEl.innerHTML = richTextToHtml(c.answer);
      reviewQSide.hidden = false;
      reviewASide.hidden = true;
      reviewCurrentNum.textContent = String(reviewIdx + 1);
      reviewProgressFill.style.width = `${(reviewIdx / reviewQueue.length) * 100}%`;
    }

    function revealReviewAnswer() {
      reviewQSide.hidden = true;
      reviewASide.hidden = false;
    }

    async function rateCurrentReview(rating) {
      const c = reviewQueue[reviewIdx];
      if (!c) return;
      // Disable buttons to prevent double-submit
      document.querySelectorAll('.deck-review-rating').forEach((b) => (b.disabled = true));
      try {
        await fetch('/api/review', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cardId: c.id, rating }),
        });
        reviewCompletedCount++;
        window.PopcardAnalytics?.track('Card Reviewed', { rating, mastery: c.mastery || 'new' });
      } catch {
        // Silent — they can re-rate if needed
      }
      document.querySelectorAll('.deck-review-rating').forEach((b) => (b.disabled = false));

      if (reviewIdx < reviewQueue.length - 1) {
        reviewIdx++;
        renderReviewCard();
      } else {
        reviewActive.hidden = true;
        reviewDone.hidden = false;
        reviewDoneCount.textContent = String(reviewCompletedCount);
        reviewProgressFill.style.width = '100%';
        window.PopcardAnalytics?.track('Review Session Complete', { count: String(reviewCompletedCount) });
      }
    }

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
          aEl.innerHTML = richTextToHtml(data.answer);
          aInlineEl.innerHTML = richTextToHtml(data.answer);
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

    // ---------- Deck-level actions: rename, pin, delete ----------
    let isPinned = !!deck.pinned;
    function paintPin() {
      pinBtn.classList.toggle('is-pinned', isPinned);
      pinLabel.textContent = isPinned ? 'Pinned' : 'Pin';
      const svg = pinBtn.querySelector('svg');
      if (svg) svg.setAttribute('fill', isPinned ? 'currentColor' : 'none');
    }
    paintPin();

    pinBtn.addEventListener('click', async () => {
      pinBtn.disabled = true;
      try {
        const r = await fetch('/api/deck?id=' + encodeURIComponent(deck.id), {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pinned: !isPinned }),
        });
        if (!r.ok) throw new Error('pin failed');
        isPinned = !isPinned;
        paintPin();
        window.PopcardAnalytics?.track('Deck Pin', { pinned: String(isPinned) });
      } catch {
        alert("Couldn't update pin — try again.");
      } finally {
        pinBtn.disabled = false;
      }
    });

    function startRename() {
      const old = titleEl.textContent;
      titleEl.contentEditable = 'true';
      titleEl.classList.add('is-editing');
      titleEl.focus();
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(titleEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);

      let done = false;
      const finish = async (save) => {
        if (done) return;
        done = true;
        titleEl.contentEditable = 'false';
        titleEl.classList.remove('is-editing');
        const next = titleEl.textContent.trim().slice(0, 140);
        if (!save || !next || next === old) {
          titleEl.textContent = old;
          return;
        }
        try {
          const r = await fetch('/api/deck?id=' + encodeURIComponent(deck.id), {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: next }),
          });
          if (!r.ok) throw new Error('rename failed');
          titleEl.textContent = next;
          window.PopcardAnalytics?.track('Deck Rename');
        } catch {
          titleEl.textContent = old;
          alert("Couldn't rename — try again.");
        }
      };

      const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      };
      titleEl.addEventListener('keydown', onKey, { once: false });
      titleEl.addEventListener('blur', () => {
        titleEl.removeEventListener('keydown', onKey);
        finish(true);
      }, { once: true });
    }

    renameBtn.addEventListener('click', startRename);
    titleEl.addEventListener('click', () => {
      if (titleEl.classList.contains('is-editing')) return;
      startRename();
    });

    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`Delete "${deck.title}"? This can't be undone.`)) return;
      deleteBtn.disabled = true;
      try {
        const r = await fetch('/api/deck?id=' + encodeURIComponent(deck.id), {
          method: 'DELETE',
          credentials: 'same-origin',
        });
        if (!r.ok) throw new Error('delete failed');
        window.PopcardAnalytics?.track('Deck Delete');
        window.location.href = '/account';
      } catch {
        deleteBtn.disabled = false;
        alert("Couldn't delete — try again.");
      }
    });

    // ---------- Export menu (Markdown + TikTok carousel) ----------
    const exportBtn = $('deck-export-btn');
    const exportMenu = $('deck-export-menu');
    const tiktokModal = $('tiktok-modal');
    const tiktokModalClose = $('tiktok-modal-close');

    if (exportBtn) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportMenu.hidden = !exportMenu.hidden;
      });
      document.addEventListener('click', (e) => {
        if (exportMenu.hidden) return;
        if (!exportMenu.contains(e.target) && e.target !== exportBtn) {
          exportMenu.hidden = true;
        }
      });
      exportMenu.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-export]');
        if (!btn || btn.disabled) return;
        exportMenu.hidden = true;
        const fmt = btn.dataset.export;
        if (fmt === 'markdown') {
          exportMarkdown();
          window.PopcardAnalytics?.track('Deck Export', { format: 'markdown' });
        } else if (fmt === 'tiktok') {
          await exportTikTok();
          window.PopcardAnalytics?.track('Deck Export', { format: 'tiktok' });
        }
      });
    }
    if (tiktokModalClose) {
      tiktokModalClose.addEventListener('click', () => { tiktokModal.hidden = true; });
      tiktokModal.querySelector('.tiktok-modal-backdrop')?.addEventListener('click', () => { tiktokModal.hidden = true; });
    }

    function slugify(s) {
      return String(s || 'popcard').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    }
    function triggerDownload(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function exportMarkdown() {
      const title = titleEl.textContent.trim();
      let md = `# ${title}\n\n`;
      if (deck.sourceUrl) md += `**Source:** ${deck.sourceUrl}\n\n`;
      md += `Generated with [Popcard](https://www.popcard.me) — ${deck.mode} mode, ${cards.length} cards.\n\n---\n\n`;
      cards.forEach((c, i) => {
        md += `## ${i + 1}. ${c.question}\n\n${c.answer}\n\n`;
        if (c.hint) md += `> 💡 ${c.hint}\n\n`;
        const tags = [c.type, c.importance].filter(Boolean).map((t) => `\`${t}\``).join(' ');
        if (tags) md += `${tags}\n\n`;
        if (c.sourceTimestampSeconds != null && deck.sourceUrl?.includes('youtube')) {
          try {
            const url = new URL(deck.sourceUrl);
            url.searchParams.set('t', Math.max(0, Math.floor(c.sourceTimestampSeconds)) + 's');
            md += `[▶ Watch at ${formatSeconds(c.sourceTimestampSeconds)}](${url.toString()})\n\n`;
          } catch {}
        }
        md += `---\n\n`;
      });
      triggerDownload(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `${slugify(title)}.md`);
    }

    // ---------- Canvas card image renderer + ZIP for TikTok ----------
    const TIKTOK_PALETTE = [
      { bg: '#6E3DEA', tone: 'light' },
      { bg: '#FF3DA0', tone: 'light' },
      { bg: '#FF8A3D', tone: 'light' },
      { bg: '#FFD338', tone: 'dark'  },
      { bg: '#2BC489', tone: 'light' },
      { bg: '#3DAEFF', tone: 'light' },
    ];

    function wrapTextLines(ctx, text, maxWidth) {
      const words = String(text).split(/\s+/);
      const lines = [];
      let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = w;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      return lines;
    }

    // ---- Rich-text canvas rendering for the TikTok carousel ----
    // Parse `**bold**` into segments so we can swap font weight per word
    // during canvas rendering. Also strip newlines + bullet glyphs so the
    // carousel image stays as one flowing paragraph (cards are too small
    // for paragraph + bullet layout at carousel scale).
    function parseBoldSegments(text) {
      // Collapse newlines / bullets to spaces; then split on `**...**`.
      const cleaned = String(text || '')
        .replace(/\s*\n+\s*/g, ' ')
        .replace(/[ \t]*•[ \t]*/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      const segs = [];
      const re = /\*\*([^*\n]+)\*\*/g;
      let last = 0;
      let m;
      while ((m = re.exec(cleaned)) !== null) {
        if (m.index > last) segs.push({ text: cleaned.slice(last, m.index), bold: false });
        segs.push({ text: m[1], bold: true });
        last = m.index + m[0].length;
      }
      if (last < cleaned.length) segs.push({ text: cleaned.slice(last), bold: false });
      return segs;
    }

    // Wraps mixed-weight tokens onto lines, measuring each word with the
    // appropriate font so bold words contribute their wider widths.
    // Returns { lines: [[{text,bold,width}]], truncated: bool }.
    function wrapBoldLines(ctx, segs, maxWidth, fontReg, fontBold, maxLines) {
      const lines = [[]];
      let lineWidth = 0;
      const spaceWidth = (font) => { ctx.font = font; return ctx.measureText(' ').width; };
      const regSpace = spaceWidth(fontReg);
      let truncated = false;

      for (const seg of segs) {
        const font = seg.bold ? fontBold : fontReg;
        ctx.font = font;
        // Tokenize the segment by whitespace, preserving order.
        const words = seg.text.split(/\s+/).filter(Boolean);
        for (const w of words) {
          const wWidth = ctx.measureText(w).width;
          const curLine = lines[lines.length - 1];
          const needSpace = curLine.length > 0;
          const proposedWidth = lineWidth + (needSpace ? regSpace : 0) + wWidth;
          if (proposedWidth > maxWidth && curLine.length > 0) {
            if (maxLines && lines.length >= maxLines) {
              truncated = true;
              return { lines, truncated };
            }
            lines.push([]);
            lineWidth = 0;
            lines[lines.length - 1].push({ text: w, bold: seg.bold, width: wWidth, leadingSpace: 0 });
            lineWidth = wWidth;
          } else {
            curLine.push({
              text: w,
              bold: seg.bold,
              width: wWidth,
              leadingSpace: needSpace ? regSpace : 0,
            });
            lineWidth = proposedWidth;
          }
        }
      }
      // Drop a trailing empty line, if any
      if (lines.length && lines[lines.length - 1].length === 0) lines.pop();
      return { lines, truncated };
    }

    function drawBoldLines(ctx, wrapped, x, y, lineHeight, fontReg, fontBold) {
      for (const line of wrapped.lines) {
        let cx = x;
        for (const seg of line) {
          if (seg.leadingSpace) cx += seg.leadingSpace;
          ctx.font = seg.bold ? fontBold : fontReg;
          ctx.fillText(seg.text, cx, y);
          cx += seg.width;
        }
        y += lineHeight;
      }
      if (wrapped.truncated) {
        ctx.font = fontReg;
        ctx.fillText('…', x, y);
        y += lineHeight;
      }
      return y;
    }

    function loadImageCors(url) {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null); // soft-fail: continue without thumb
        img.src = url;
      });
    }

    function fillRoundedRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fill();
    }

    async function renderCardPng({ kind, card, index, total, title, color, thumbnail }) {
      const W = 1080, H = 1350;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      const fontStack = '"Sora", system-ui, -apple-system, "Segoe UI", sans-serif';
      const bodyFont = '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif';

      // background
      ctx.fillStyle = color.bg;
      ctx.fillRect(0, 0, W, H);
      const tx = color.tone === 'dark' ? '#0F0F14' : '#FFFFFF';
      const inkSoft = color.tone === 'dark' ? 'rgba(15,15,20,0.6)' : 'rgba(255,255,255,0.78)';
      const lineColor = color.tone === 'dark' ? 'rgba(15,15,20,0.22)' : 'rgba(255,255,255,0.26)';

      if (kind === 'cover') {
        // Cover layout: brand pill at top, big title, optional YouTube
        // thumbnail underneath (if the deck was YouTube-sourced), then a
        // "N cards · swipe →" hint and branding at the bottom.
        ctx.fillStyle = inkSoft;
        ctx.font = `700 30px ${fontStack}`;
        ctx.fillText('POPCARD', 80, 110);

        ctx.fillStyle = tx;
        ctx.font = `800 76px ${fontStack}`;
        const lines = wrapTextLines(ctx, title || 'Untitled deck', W - 160);
        let y = 280;
        for (const ln of lines) { ctx.fillText(ln, 80, y); y += 96; }

        // Optional YouTube thumbnail inserted on the cover for video decks.
        if (thumbnail) {
          const thumbW = W - 160;            // 920px
          const thumbH = Math.round(thumbW * 9 / 16); // 16:9 letterbox
          const thumbX = 80;
          const thumbY = y + 30;
          // Rounded clip
          ctx.save();
          const r = 24;
          ctx.beginPath();
          ctx.moveTo(thumbX + r, thumbY);
          ctx.arcTo(thumbX + thumbW, thumbY, thumbX + thumbW, thumbY + thumbH, r);
          ctx.arcTo(thumbX + thumbW, thumbY + thumbH, thumbX, thumbY + thumbH, r);
          ctx.arcTo(thumbX, thumbY + thumbH, thumbX, thumbY, r);
          ctx.arcTo(thumbX, thumbY, thumbX + thumbW, thumbY, r);
          ctx.closePath();
          ctx.clip();
          // Cover-fit the image (YouTube hqdefault is 480x360 = 4:3 with black bars)
          const ir = thumbnail.naturalWidth / thumbnail.naturalHeight;
          const tr = thumbW / thumbH;
          let sx = 0, sy = 0, sw = thumbnail.naturalWidth, sh = thumbnail.naturalHeight;
          if (ir > tr) {
            sw = thumbnail.naturalHeight * tr;
            sx = (thumbnail.naturalWidth - sw) / 2;
          } else if (ir < tr) {
            sh = thumbnail.naturalWidth / tr;
            sy = (thumbnail.naturalHeight - sh) / 2;
          }
          ctx.drawImage(thumbnail, sx, sy, sw, sh, thumbX, thumbY, thumbW, thumbH);
          // Play-button overlay
          const pcx = thumbX + thumbW / 2;
          const pcy = thumbY + thumbH / 2;
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.beginPath();
          ctx.arc(pcx, pcy, 70, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(pcx - 22, pcy - 32);
          ctx.lineTo(pcx + 40, pcy);
          ctx.lineTo(pcx - 22, pcy + 32);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          y = thumbY + thumbH + 50;
        }

        ctx.fillStyle = inkSoft;
        ctx.font = `600 40px ${bodyFont}`;
        ctx.fillText(`${total} cards · swipe →`, 80, y + 30);

        ctx.fillStyle = inkSoft;
        ctx.font = `700 26px ${fontStack}`;
        ctx.fillText('popcard.me', 80, H - 70);
      } else if (kind === 'outro') {
        ctx.fillStyle = tx;
        ctx.font = `800 72px ${fontStack}`;
        const lines = wrapTextLines(ctx, 'Pop your own deck.', W - 160);
        let y = 420;
        for (const ln of lines) { ctx.fillText(ln, 80, y); y += 92; }

        ctx.fillStyle = inkSoft;
        ctx.font = `500 40px ${bodyFont}`;
        const subLines = wrapTextLines(ctx, 'Paste a YouTube link or any text. Get colourful cards in seconds.', W - 160);
        y += 30;
        for (const ln of subLines) { ctx.fillText(ln, 80, y); y += 58; }

        ctx.fillStyle = tx;
        ctx.font = `800 56px ${fontStack}`;
        ctx.fillText('popcard.me', 80, H - 90);
      } else {
        // Standard card
        ctx.fillStyle = inkSoft;
        ctx.font = `700 30px ${fontStack}`;
        ctx.fillText(`${index + 1} / ${total}`, 80, 110);

        // Question
        ctx.fillStyle = tx;
        ctx.font = `800 60px ${fontStack}`;
        const qLines = wrapTextLines(ctx, card.question, W - 160);
        let y = 220;
        for (const ln of qLines) { ctx.fillText(ln, 80, y); y += 76; }

        // Divider
        y += 30;
        ctx.fillStyle = lineColor;
        ctx.fillRect(80, y, W - 160, 3);
        y += 60;

        // Answer — render with **bold** support, cleanly truncated.
        // Carousel cards aren't tall enough for paragraphs + bullets, so
        // parseBoldSegments flattens those to a single flowing paragraph,
        // then wrapBoldLines caps total lines and adds an ellipsis if the
        // answer is too long for the available space.
        ctx.fillStyle = tx;
        ctx.globalAlpha = 0.96;
        const ansFontReg = `500 40px ${bodyFont}`;
        const ansFontBold = `800 40px ${bodyFont}`;
        const lineHeight = 56;
        const availableHeight = H - 160 - y;          // room before branding
        const maxLines = Math.max(4, Math.floor(availableHeight / lineHeight));
        const segs = parseBoldSegments(card.answer);
        const wrapped = wrapBoldLines(ctx, segs, W - 160, ansFontReg, ansFontBold, maxLines);
        drawBoldLines(ctx, wrapped, 80, y, lineHeight, ansFontReg, ansFontBold);
        ctx.globalAlpha = 1;

        // Importance badge (top-right) — only if must_know
        if (card.importance === 'must_know') {
          const badgeW = 200, badgeH = 56, bx = W - 80 - badgeW, by = 80;
          ctx.fillStyle = '#FFD338';
          fillRoundedRect(ctx, bx, by, badgeW, badgeH, 28);
          ctx.fillStyle = '#0F0F14';
          ctx.font = `800 22px ${fontStack}`;
          ctx.fillText('MUST KNOW', bx + 24, by + 36);
        }

        // Branding
        ctx.fillStyle = inkSoft;
        ctx.font = `700 26px ${fontStack}`;
        ctx.fillText('popcard.me', 80, H - 60);
      }

      return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    }

    // CRC32 + minimal stored-zip encoder (no deps)
    const _crcTable = (() => {
      const t = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : (c >>> 1);
        t[i] = c;
      }
      return t;
    })();
    function crc32(data) {
      let c = 0xFFFFFFFF;
      for (let i = 0; i < data.length; i++) c = _crcTable[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
      return (c ^ 0xFFFFFFFF) >>> 0;
    }
    function makeZip(files) {
      const enc = new TextEncoder();
      const parts = [];
      const central = [];
      let offset = 0;
      for (const f of files) {
        const nameBytes = enc.encode(f.name);
        const crc = crc32(f.data);
        const size = f.data.length;
        const local = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(6, 0, true);
        lv.setUint16(8, 0, true);
        lv.setUint16(10, 0, true); lv.setUint16(12, 0, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, size, true);
        lv.setUint32(22, size, true);
        lv.setUint16(26, nameBytes.length, true);
        lv.setUint16(28, 0, true);
        local.set(nameBytes, 30);
        parts.push(local, f.data);

        const ch = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(ch.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
        cv.setUint16(8, 0, true); cv.setUint16(10, 0, true);
        cv.setUint16(12, 0, true); cv.setUint16(14, 0, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, size, true);
        cv.setUint32(24, size, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
        cv.setUint16(34, 0, true); cv.setUint16(36, 0, true);
        cv.setUint32(38, 0, true);
        cv.setUint32(42, offset, true);
        ch.set(nameBytes, 46);
        central.push(ch);
        offset += local.length + size;
      }
      const cdSize = central.reduce((s, h) => s + h.length, 0);
      const cdOffset = offset;
      for (const h of central) parts.push(h);
      const eocd = new Uint8Array(22);
      const ev = new DataView(eocd.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
      ev.setUint16(8, files.length, true);
      ev.setUint16(10, files.length, true);
      ev.setUint32(12, cdSize, true);
      ev.setUint32(16, cdOffset, true);
      ev.setUint16(20, 0, true);
      parts.push(eocd);
      return new Blob(parts, { type: 'application/zip' });
    }

    async function exportTikTok() {
      const title = titleEl.textContent.trim();
      const exportLabel = exportBtn;
      const originalLabel = exportLabel.innerHTML;
      exportLabel.disabled = true;
      exportLabel.innerHTML = '<span class="quiz-spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px"></span> Rendering…';

      try {
        const files = [];
        // Cap at 35 cards (TikTok carousel max) + cover + outro = 37, leave room.
        const limit = Math.min(cards.length, 33);

        // For YouTube decks, fetch the video thumbnail and stamp it onto the
        // cover slide. Loads cross-origin so the canvas stays exportable; on
        // failure we fall through with no thumb instead of breaking the export.
        let thumbnail = null;
        if (deck.sourceType === 'youtube' && deck.sourceUrl) {
          const ytId = youtubeIdFromUrl(deck.sourceUrl);
          if (ytId) {
            thumbnail = await loadImageCors(`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`);
          }
        }

        const coverBlob = await renderCardPng({
          kind: 'cover', total: limit, title, color: TIKTOK_PALETTE[0], thumbnail,
        });
        files.push({ name: '00-cover.png', data: new Uint8Array(await coverBlob.arrayBuffer()) });

        for (let i = 0; i < limit; i++) {
          const blob = await renderCardPng({
            kind: 'card',
            card: cards[i],
            index: i,
            total: limit,
            color: TIKTOK_PALETTE[i % TIKTOK_PALETTE.length],
          });
          files.push({
            name: `${String(i + 1).padStart(2, '0')}-${slugify(cards[i].question).slice(0, 40)}.png`,
            data: new Uint8Array(await blob.arrayBuffer()),
          });
        }

        const outroBlob = await renderCardPng({
          kind: 'outro', total: limit, title, color: TIKTOK_PALETTE[limit % TIKTOK_PALETTE.length],
        });
        files.push({ name: `${String(limit + 1).padStart(2, '0')}-outro.png`, data: new Uint8Array(await outroBlob.arrayBuffer()) });

        const zip = makeZip(files);
        triggerDownload(zip, `${slugify(title)}-tiktok.zip`);

        // Show the post-instructions modal
        if (tiktokModal) tiktokModal.hidden = false;
      } catch (e) {
        console.error('TikTok export failed', e);
        alert("Couldn't generate the carousel. Try again.");
      } finally {
        exportLabel.disabled = false;
        exportLabel.innerHTML = originalLabel;
      }
    }

    wrap.hidden = false;
    render();
    window.PopcardAnalytics?.track('Deck Viewed', {
      mode: deck.mode,
      cards: String(cards.length),
      cached: String(!!deck.fromCache),
    });
  })();
})();
