// ---------- Hero deck cycling ----------
(function () {
  const stack = document.getElementById('hero-deck-stack');
  const prev = document.getElementById('hero-prev');
  const next = document.getElementById('hero-next');
  if (!stack || !prev || !next) return;

  const cards = Array.from(stack.querySelectorAll('.deck-card'));
  const TOTAL = cards.length;
  let busy = false;

  function cycle(dir) {
    if (busy) return;
    busy = true;
    cards.forEach((card) => {
      const m = card.className.match(/\bl(\d)\b/);
      if (!m) return;
      const cur = parseInt(m[1], 10);
      const next_ = dir === 'next'
        ? (cur - 1 + TOTAL) % TOTAL  // front → back: 0→5, 1→0, 2→1, …
        : (cur + 1) % TOTAL;         // back → front: 5→0, 0→1, …
      card.className = card.className.replace(/\bl\d\b/, 'l' + next_);
    });
    window.PopcardAnalytics?.track('Hero Deck Cycle', { direction: dir });
    setTimeout(() => { busy = false; }, 600);
  }

  next.addEventListener('click', (e) => { e.stopPropagation(); cycle('next'); });
  prev.addEventListener('click', (e) => { e.stopPropagation(); cycle('prev'); });
})();

const modeButtons = document.querySelectorAll('.mode');
let currentMode = 'simple';
modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    modeButtons.forEach((b) => {
      const isActive = b === btn;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    currentMode = btn.dataset.mode;
    window.PopcardAnalytics?.track('Mode Toggle', { mode: currentMode });
  });
});

const pasteBtn = document.getElementById('paste-btn');
const heroInput = document.getElementById('hero-input');
if (pasteBtn && heroInput) {
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      heroInput.value = text;
      heroInput.focus();
      window.PopcardAnalytics?.track('Paste Click', { success: 'true' });
    } catch {
      heroInput.focus();
      window.PopcardAnalytics?.track('Paste Click', { success: 'false' });
    }
  });
}

const popBtn = document.getElementById('pop-btn');
const popStatus = document.getElementById('pop-status');
const popLabel = document.getElementById('pop-btn-label');

function setStatus(msg, isError) {
  if (!popStatus) return;
  popStatus.textContent = msg || '';
  popStatus.classList.toggle('error', !!isError);
}

function startPopProgress(input) {
  const isYoutube = /youtube\.com|youtu\.be/.test(input);
  const youtubeMsgs = [
    "Pulling the YouTube transcript…",
    "Reading what they said…",
    "Picking the ideas worth keeping…",
    "Writing your cards…",
    "Almost there — making them shine…",
  ];
  const textMsgs = [
    "Reading your text…",
    "Picking the key ideas…",
    "Writing your cards…",
    "Almost there — making them shine…",
  ];
  const msgs = isYoutube ? youtubeMsgs : textMsgs;
  let i = 0;
  setStatus(msgs[0]);
  return setInterval(() => {
    i = Math.min(i + 1, msgs.length - 1);
    setStatus(msgs[i]);
  }, 3200);
}

if (popBtn && heroInput) {
  popBtn.addEventListener('click', async () => {
    const input = heroInput.value.trim();
    if (!input) {
      heroInput.focus();
      setStatus('Paste a YouTube link or some text first.', true);
      return;
    }

    popBtn.classList.add('loading');
    popBtn.disabled = true;
    popLabel.textContent = 'Popping…';
    setStatus('');
    const progressTimer = startPopProgress(input);

    try {
      const res = await fetch('/api/pop', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, mode: currentMode }),
      });

      if (res.status === 401) {
        // Stash the pending pop so the user can resume after sign-in
        try { sessionStorage.setItem('pendingPop', JSON.stringify({ input, mode: currentMode })); } catch {}
        window.location.href = '/login?next=' + encodeURIComponent('/');
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setStatus(data.message || data.error || 'Something went wrong.', true);
        window.PopcardAnalytics?.track('Pop Failed', { reason: data.error || 'unknown' });
      } else {
        window.PopcardAnalytics?.track('Pop Success', {
          mode: data.deck.mode,
          cards: String(data.deck.cardCount),
          cached: String(!!data.deck.fromCache),
        });
        window.location.href = '/deck/' + data.deck.id;
      }
    } catch (e) {
      setStatus('Network error. Try again.', true);
    } finally {
      clearInterval(progressTimer);
      popBtn.classList.remove('loading');
      popBtn.disabled = false;
      popLabel.textContent = 'Pop it into cards';
    }
  });

  // Auto-resume after sign-in redirect
  try {
    const pending = sessionStorage.getItem('pendingPop');
    if (pending) {
      sessionStorage.removeItem('pendingPop');
      const { input, mode } = JSON.parse(pending);
      heroInput.value = input;
      currentMode = mode;
      modeButtons.forEach((b) => {
        const active = b.dataset.mode === mode;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      window.PopcardAuth?.me().then((u) => {
        if (u) popBtn.click();
      });
    }
  } catch {}
}
