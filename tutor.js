// tutor.js — AI tutor chat drawer on the deck page.
//
// Reveals the "Ask Pop" launcher once a deck is loaded, opens a chat drawer,
// and talks to /api/tutor (which grounds Pop in this deck's cards). The
// conversation lives in memory and is resent each turn (server is stateless).
//
// Runs independently of deck-view.js: reads the deck id from the URL, and
// only shows the launcher once the deck meta is visible.

(function () {
  const pathMatch = window.location.pathname.match(/^\/deck\/([\w-]+)/);
  const params = new URLSearchParams(window.location.search);
  const deckId = pathMatch?.[1] || params.get('id');
  if (!deckId) return;

  const fab = document.getElementById('tutor-fab');
  const drawer = document.getElementById('tutor-drawer');
  const backdrop = document.getElementById('tutor-drawer-backdrop');
  const closeBtn = document.getElementById('tutor-close');
  const messagesEl = document.getElementById('tutor-messages');
  const suggestsEl = document.getElementById('tutor-suggests');
  const form = document.getElementById('tutor-form');
  const textEl = document.getElementById('tutor-text');
  const sendBtn = document.getElementById('tutor-send');
  const subEl = document.getElementById('tutor-head-sub');
  if (!fab || !drawer || !form) return;

  // Conversation state (resent to the server each turn).
  const history = [];
  let busy = false;

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    }[c]));
  }
  // Light formatting: bold + bullet lines + paragraph breaks. No raw HTML from
  // the model is trusted — everything is escaped first.
  function formatReply(text) {
    const safe = escapeHtml(text);
    return safe
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .split('\n')
      .map((line) => {
        const t = line.trim();
        if (/^[-•]\s+/.test(t)) return `<span class="tutor-bullet">${t.replace(/^[-•]\s+/, '• ')}</span>`;
        return t ? `<span class="tutor-line">${t}</span>` : '';
      })
      .filter(Boolean)
      .join('');
  }

  // Reveal the launcher once the deck meta is on screen. deck-view.js unhides
  // #deck-meta after load; we poll briefly for it.
  function waitForDeck() {
    const meta = document.getElementById('deck-meta');
    if (meta && !meta.hidden) {
      fab.hidden = false;
      const title = document.getElementById('deck-title')?.textContent?.trim();
      if (title && subEl) subEl.textContent = `Grounded in "${title}"`;
      return;
    }
    setTimeout(waitForDeck, 300);
  }
  waitForDeck();

  function openDrawer() {
    drawer.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-tutor-open');
    setTimeout(() => textEl?.focus(), 80);
    window.PopcardAnalytics?.track('Tutor Opened', { deckId });
  }
  function closeDrawer() {
    drawer.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-tutor-open');
    fab?.focus();
  }

  fab.addEventListener('click', openDrawer);
  closeBtn?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) closeDrawer();
  });

  function appendMessage(role, html) {
    const el = document.createElement('div');
    el.className = 'tutor-msg ' + (role === 'user' ? 'tutor-msg-user' : 'tutor-msg-pop');
    el.innerHTML = html;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function setTyping(on) {
    let t = document.getElementById('tutor-typing');
    if (on) {
      if (t) return;
      t = document.createElement('div');
      t.id = 'tutor-typing';
      t.className = 'tutor-msg tutor-msg-pop tutor-typing';
      t.innerHTML = '<span></span><span></span><span></span>';
      messagesEl.appendChild(t);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    } else if (t) {
      t.remove();
    }
  }

  async function send(text) {
    const msg = (text || '').trim();
    if (!msg || busy) return;
    busy = true;
    if (suggestsEl) suggestsEl.style.display = 'none';

    appendMessage('user', `<p>${escapeHtml(msg)}</p>`);
    history.push({ role: 'user', content: msg });
    textEl.value = '';
    textEl.style.height = 'auto';
    sendBtn.disabled = true;
    setTyping(true);

    try {
      const r = await fetch('/api/tutor', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckId, messages: history }),
      });
      const data = await r.json();
      setTyping(false);
      if (!r.ok) {
        if (r.status === 402) {
          appendMessage('pop', `<p>${escapeHtml(data.message || 'Free tutor limit reached.')}</p><a class="tutor-upgrade" href="/pricing">Upgrade for unlimited →</a>`);
        } else {
          appendMessage('pop', `<p>${escapeHtml(data.message || 'Pop hit a snag — try again.')}</p>`);
        }
        // Drop the failed user turn so the convo can retry cleanly.
        history.pop();
        return;
      }
      appendMessage('pop', `<p>${formatReply(data.reply)}</p>`);
      history.push({ role: 'assistant', content: data.reply });
      window.PopcardAnalytics?.track('Tutor Reply', { deckId });
    } catch {
      setTyping(false);
      appendMessage('pop', '<p>Network hiccup — try that again?</p>');
      history.pop();
    } finally {
      busy = false;
      sendBtn.disabled = false;
      textEl.focus();
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); send(textEl.value); });

  // Enter to send, Shift+Enter for newline. Auto-grow the textarea.
  textEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(textEl.value); }
  });
  textEl.addEventListener('input', () => {
    textEl.style.height = 'auto';
    textEl.style.height = Math.min(120, textEl.scrollHeight) + 'px';
  });

  suggestsEl?.querySelectorAll('.tutor-suggest').forEach((btn) => {
    btn.addEventListener('click', () => send(btn.dataset.q));
  });
})();
