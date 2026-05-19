// Consent modal + analytics loader.
//
// Shows a Popcard-specific consent screen the first time a user lands on
// any page (logged-in or not). Choice persists in localStorage as
// 'popcard-consent'. Accepted = analytics + PostHog load; declined = neither
// loads (Vercel iframes from /_vercel/* 404 silently in dev — that's fine).
(function () {
  const KEY = 'popcard-consent';
  const ANALYTICS_SRC = '/_vercel/insights/script.js';
  const SPEED_SRC = '/_vercel/speed-insights/script.js';

  // ---------- Vercel + PostHog loader ----------------------------------
  function loadVercel() {
    if (document.querySelector('script[data-popcard-vercel]')) return;
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
    const a = document.createElement('script');
    a.defer = true; a.src = ANALYTICS_SRC; a.dataset.popcardVercel = 'analytics';
    document.head.appendChild(a);
    const s = document.createElement('script');
    s.defer = true; s.src = SPEED_SRC; s.dataset.popcardVercel = 'speed';
    document.head.appendChild(s);
  }
  function loadAnalytics() {
    loadVercel();
    if (window.PopcardAnalytics && typeof window.PopcardAnalytics.loadPostHog === 'function') {
      window.PopcardAnalytics.loadPostHog();
    } else {
      setTimeout(loadAnalytics, 100);
    }
  }

  // ---------- Consent store --------------------------------------------
  function getConsent() {
    try { return localStorage.getItem(KEY); } catch { return null; }
  }
  function setConsent(value) {
    try { localStorage.setItem(KEY, value); } catch {}
    if (value === 'accepted') loadAnalytics();
    closeModal();
  }
  window.PopcardConsent = {
    get: getConsent,
    set: setConsent,
    reset() { try { localStorage.removeItem(KEY); } catch {} },
  };

  // ---------- Modal markup ---------------------------------------------
  function openModal() {
    if (document.getElementById('consent-modal')) return;

    const overlay = document.createElement('div');
    overlay.id = 'consent-modal';
    overlay.className = 'consent-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'consent-title');
    overlay.innerHTML = `
      <div class="consent-modal-backdrop"></div>
      <div class="consent-modal-card">
        <div class="consent-modal-head">
          <img class="consent-modal-mascot" src="/images/mascot-sad.png" alt="" />
          <div class="consent-modal-headtext">
            <h2 id="consent-title" class="consent-modal-title">
              Popcard asks for your consent to use your data
            </h2>
            <p class="consent-modal-sub">
              Analytics &amp; product improvement, session replay (with sensitive
              fields masked), and AI processing of any content you Pop.
            </p>
            <p class="consent-modal-sub">
              Store and/or access information on a device.
            </p>
            <a class="consent-modal-learn" href="/privacy" target="_blank" rel="noopener">Learn more</a>
          </div>
        </div>

        <div class="consent-modal-body">
          <p>
            Your activity on Popcard and information from your device (cookies,
            anonymous IDs, page interactions) may be processed by us and by the
            analytics services we use (<strong>Vercel Web Analytics</strong> &mdash;
            cookieless &mdash; and <strong>PostHog</strong> for product analytics
            and session replay).
          </p>
          <p>
            When you Pop content, it&rsquo;s sent to <strong>OpenAI</strong> to
            generate flashcards. They process it under their own terms and
            don&rsquo;t train on it.
          </p>
          <p class="consent-modal-fine">
            We don&rsquo;t sell your data. We don&rsquo;t share with advertisers.
            We don&rsquo;t use precise geolocation. Sensitive fields (passwords,
            pasted content) are masked in session replay.
            You can change your mind anytime in Settings.
          </p>
        </div>

        <div class="consent-modal-actions">
          <button type="button" class="consent-btn consent-btn-decline" id="consent-decline">
            Decline analytics
          </button>
          <button type="button" class="consent-btn consent-btn-accept" id="consent-accept">
            Accept all
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = 'hidden';

    overlay.querySelector('#consent-accept').addEventListener('click', () => setConsent('accepted'));
    overlay.querySelector('#consent-decline').addEventListener('click', () => setConsent('declined'));
    // Pressing Escape declines (least-bad option for accidental dismiss)
    document.addEventListener('keydown', escapeOnce);
  }

  function escapeOnce(e) {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', escapeOnce);
      // Don't auto-set on escape — leave the modal up; user must choose
      // explicitly. (Compliance: implicit dismiss isn't valid consent.)
    }
  }

  function closeModal() {
    const m = document.getElementById('consent-modal');
    if (m) m.remove();
    document.documentElement.style.overflow = '';
  }

  // ---------- Boot ------------------------------------------------------
  function init() {
    const consent = getConsent();
    if (consent === 'accepted') loadAnalytics();
    else if (consent === null) openModal();
    // 'declined' → nothing loads, no modal shown
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
