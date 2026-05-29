// push.js — client-side browser push enable/disable + status.
//
// Public API (loaded as a regular script, exposes window.PopcardPush):
//   PopcardPush.supported()        → boolean
//   PopcardPush.status()           → 'unsupported' | 'denied' | 'enabled' | 'disabled'
//   PopcardPush.enable()           → request permission + subscribe; resolves to status
//   PopcardPush.disable()          → unsubscribe + tell server to forget the row
//   PopcardPush.sendTest()         → fire a test push to all this user's devices
//
// Used by the settings toggle on /settings (Sprint 2 #23) — but the API is
// generic enough for any page to call.

(function () {
  const SCOPE = '/';

  function supported() {
    return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  }

  async function getRegistration() {
    if (!supported()) return null;
    let reg = await navigator.serviceWorker.getRegistration(SCOPE);
    if (!reg) reg = await navigator.serviceWorker.register('/sw.js', { scope: SCOPE });
    return reg;
  }

  async function getSubscription() {
    const reg = await getRegistration();
    if (!reg) return null;
    return await reg.pushManager.getSubscription();
  }

  async function status() {
    if (!supported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    const sub = await getSubscription();
    return sub ? 'enabled' : 'disabled';
  }

  // VAPID public key from server — cached after first fetch.
  let vapidKey = null;
  async function getVapidKey() {
    if (vapidKey) return vapidKey;
    const r = await fetch('/api/push?action=key', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('Server push not configured');
    const data = await r.json();
    vapidKey = data.publicKey;
    return vapidKey;
  }

  // Web Push requires the VAPID key as a Uint8Array, not a string.
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function enable() {
    if (!supported()) return 'unsupported';
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'disabled';

    const reg = await getRegistration();
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      // Already subscribed — make sure server still has it
      await postSubscription(existing);
      return 'enabled';
    }

    const vapid = await getVapidKey();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    });
    await postSubscription(sub);
    return 'enabled';
  }

  async function disable() {
    const sub = await getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      try { await sub.unsubscribe(); } catch {}
      try {
        await fetch('/api/push?endpoint=' + encodeURIComponent(endpoint), {
          method: 'DELETE', credentials: 'same-origin',
        });
      } catch {}
    }
    return 'disabled';
  }

  async function postSubscription(sub) {
    await fetch('/api/push', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON ? sub.toJSON() : sub }),
    });
  }

  async function sendTest() {
    const r = await fetch('/api/push?action=test', {
      method: 'POST', credentials: 'same-origin',
    });
    return r.ok ? r.json() : { ok: false };
  }

  window.PopcardPush = { supported, status, enable, disable, sendTest };
})();
