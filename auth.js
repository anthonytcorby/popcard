window.PopcardAuth = {
  async me() {
    try {
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (!res.ok) return null;
      const data = await res.json();
      return data.user || null;
    } catch {
      return null;
    }
  },

  async signInWithGoogle(credential) {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    return res.json();
  },

  async signOut() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
    // Reset analytics identity so the next visitor isn't merged with this user
    window.PopcardAnalytics?.reset();
  },

  async startCheckout(tier) {
    const res = await fetch('/api/checkout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    });
    if (res.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent('/pricing')}`;
      return;
    }
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      console.error('Checkout failed', data);
    }
    return data;
  },
};

// Update nav avatar/state on every page that includes auth.js after the DOM is ready.
(async function paintNav() {
  function paint(user) {
    document.querySelectorAll('[data-auth-only]').forEach((el) => {
      el.style.display = user ? '' : 'none';
    });
    document.querySelectorAll('[data-guest-only]').forEach((el) => {
      el.style.display = user ? 'none' : '';
    });
    const nameEl = document.querySelector('[data-auth-name]');
    if (nameEl && user) nameEl.textContent = user.name || user.email;
    // Update every element marked with data-auth-tier (the original code used
    // querySelector singular, which only updated the first match — broke when
    // we added a second tier badge in the dashboard rail). Also expose the
    // tier as a data-tier attribute so CSS can colour the badge per plan.
    document.querySelectorAll('[data-auth-tier]').forEach((el) => {
      if (user) {
        el.textContent = user.tier;
        el.setAttribute('data-tier', user.tier);
      }
    });
    const picEl = document.querySelector('[data-auth-picture]');
    if (picEl && user && user.picture) picEl.src = user.picture;

    // PostHog: identify the user so their events get attached to their profile.
    // Only safe-to-track properties — never send the picture URL or other PII.
    if (user) {
      window.PopcardAnalytics?.identify(user.id, {
        email: user.email,
        name: user.name,
        tier: user.tier,
      });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => paint(await window.PopcardAuth.me()));
  } else {
    paint(await window.PopcardAuth.me());
  }
})();
