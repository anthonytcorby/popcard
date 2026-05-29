// Popcard service worker — minimal, push-only.
//
// Scope: '/' (served from the site root so notifications.js can register
// without needing a separate scope header).
//
// Payload shape from server: { title, body, link, icon? }

self.addEventListener('install', (e) => {
  // Activate immediately on update so users get the new SW without a hard reload.
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Popcard', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Popcard';
  const options = {
    body: data.body || '',
    icon: data.icon || '/images/popcard-icon.png',
    badge: '/images/favicon.png',
    data: { link: data.link || '/account' },
    // Lightly tactile: vibrate on devices that support it (Android Chrome).
    vibrate: [60, 30, 60],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/account';

  // If a Popcard tab is already open, focus it and navigate. Otherwise open new.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      for (const c of all) {
        // matchAll returns same-origin clients — focus the first one we find
        if ('focus' in c) {
          c.navigate(link).catch(() => {});
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
    })
  );
});
