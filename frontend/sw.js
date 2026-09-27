/* ThisWeekSaudi service worker: app-shell cache + offline data fallback. */
const V = 'tws-v2';
const SHELL = ['/index.html', '/app.js', '/styles.css', '/logo.svg',
               '/manifest.json', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== self.location.origin) return;
  // Navigations + API data: network first, cache fallback (offline mode).
  if (e.request.mode === 'navigate' || u.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(V).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request)));
    return;
  }
  // Versioned app shell (?v=hash): cache first, then network.
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(V).then(c => c.put(e.request, copy));
    return r;
  })));
});

/* ---------- web-push reminders ---------- */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch {}
  const title = d.title || 'ThisWeekSaudi';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: '/icon-512.png',
    badge: '/icon-512.png',
    data: { url: d.url || '/' },
    tag: 'tws-reminder-' + (d.event_id || Date.now()),
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) { if ('focus' in w) { w.navigate(url); return w.focus(); } }
    return clients.openWindow(url);
  }));
});
