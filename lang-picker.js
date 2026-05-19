// Shared language picker — runs on every page that includes this script.
// Lives in the header nav. Persists the user's choice to localStorage so it
// applies to the next pop from the landing page.
(function () {
  // Flag is the country code used by the flag-icons CSS library (loaded from
  // CDN in each page's <head>). Country emoji flags don't render on Windows,
  // so we use SVG flags via class names instead.
  const LANGUAGES = [
    { code: 'en', flag: 'gb', native: 'English' },
    { code: 'es', flag: 'es', native: 'Español' },
    { code: 'zh', flag: 'cn', native: '中文 (简体)' },
    { code: 'hi', flag: 'in', native: 'हिन्दी' },
    { code: 'ar', flag: 'sa', native: 'العربية' },
    { code: 'pt', flag: 'br', native: 'Português' },
    { code: 'fr', flag: 'fr', native: 'Français' },
    { code: 'de', flag: 'de', native: 'Deutsch' },
    { code: 'ja', flag: 'jp', native: '日本語' },
    { code: 'ru', flag: 'ru', native: 'Русский' },
  ];
  const VALID = new Set(LANGUAGES.map((l) => l.code));

  function readSaved() {
    try {
      const v = localStorage.getItem('popcardLanguage');
      return v && VALID.has(v) ? v : 'en';
    } catch {
      return 'en';
    }
  }

  function writeSaved(code) {
    try { localStorage.setItem('popcardLanguage', code); } catch {}
  }

  let current = readSaved();

  // Public surface — other scripts (app.js on landing) read window.PopcardLang.current
  // to attach the language to the pop request body.
  window.PopcardLang = {
    get current() { return current; },
    set(code) {
      if (!VALID.has(code)) return;
      if (code === current) return;
      current = code;
      writeSaved(code);
      updateButtonUI();
      window.dispatchEvent(new CustomEvent('popcard-language-change', { detail: { language: code } }));
      window.PopcardAnalytics?.track('Language Change', { language: code });
    },
    languages: LANGUAGES,
  };

  const trigger = document.getElementById('lang-picker-trigger');
  const menu = document.getElementById('lang-picker-menu');
  const flagSpan = document.getElementById('lang-picker-current-flag');
  if (!trigger || !menu || !flagSpan) return; // page doesn't include the picker

  function updateButtonUI() {
    const lang = LANGUAGES.find((l) => l.code === current) || LANGUAGES[0];
    flagSpan.className = `lang-picker-flag fi fi-${lang.flag}`;
    flagSpan.textContent = '';
    trigger.setAttribute('aria-label', `Card language: ${lang.native}. Change`);
    menu.querySelectorAll('button[data-lang]').forEach((btn) => {
      btn.setAttribute('aria-current', btn.dataset.lang === current ? 'true' : 'false');
    });
  }

  // Build the menu items once.
  menu.innerHTML = LANGUAGES.map((l) => `
    <button type="button" role="menuitemradio" data-lang="${l.code}">
      <span class="lang-picker-flag fi fi-${l.flag}"></span>
      <span class="lang-picker-native">${l.native}</span>
    </button>
  `).join('');

  updateButtonUI();

  function openMenu() {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
  }
  function closeMenu() {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }
  function toggleMenu() {
    if (menu.hidden) openMenu(); else closeMenu();
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-lang]');
    if (!btn) return;
    window.PopcardLang.set(btn.dataset.lang);
    closeMenu();
  });

  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !trigger.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) closeMenu();
  });
})();
