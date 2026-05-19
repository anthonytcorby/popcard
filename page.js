// Cross-page tracking helpers shared by every page.
//
//   1. data-track  — click delegation (any element with data-track="..." fires)
//   2. pageview    — one event per page load, named per route
//
// Both go through window.PopcardAnalytics which fans out to Vercel + PostHog.
(function () {
  // ----- Click delegation: data-track + data-track-<propName> -----------------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-track]');
    if (!el) return;
    const event = el.dataset.track;
    const props = {};
    for (const [key, value] of Object.entries(el.dataset)) {
      if (key.startsWith('track') && key !== 'track') {
        const propName = key.slice(5);
        props[propName.charAt(0).toLowerCase() + propName.slice(1)] = value;
      }
    }
    window.PopcardAnalytics?.track(event, Object.keys(props).length ? props : undefined);
  });

  // ----- Pageview tracking ---------------------------------------------------
  function pageViewName() {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    if (path === '/' || path === '') return 'landing_page_viewed';
    if (path === '/onboarding') return 'onboarding_started';
    if (path === '/login') return 'login_viewed';
    if (path === '/account') return 'account_viewed';
    if (path === '/pricing') return 'pricing_viewed';
    if (path === '/examples') return 'examples_viewed';
    if (path === '/success') return 'checkout_completed';      // post-Stripe-success landing
    if (path.startsWith('/deck/')) return 'deck_opened';
    return 'page_viewed';
  }

  function firePageView() {
    const path = window.location.pathname || '/';
    const referrer = document.referrer || '';
    window.PopcardAnalytics?.track(pageViewName(), { path, referrer });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', firePageView);
  } else {
    firePageView();
  }
})();
