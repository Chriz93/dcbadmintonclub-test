const CACHE_NAME = 'dcbc-test-v49';
const ASSETS = [
  '/dcbadmintonclub-test/',
  '/dcbadmintonclub-test/index.html'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network-first for API calls, cache-first for static assets
  if (e.request.url.includes('supabase.co')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const clone = r.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
  }
});

// ── Push notifications (vote reminders and open spare seats) ──
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'Maplewood League', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Maplewood League', {
    body: d.body || '', icon: '/dcbadmintonclub-test/icon-192.png', badge: '/dcbadmintonclub-test/icon-192.png',
    tag: d.tag || 'maplewood-vote', renotify: true, data: { url: d.url || '/dcbadmintonclub-test/' }, actions: d.actions || []
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  let url = (e.notification.data && e.notification.data.url) || '/dcbadmintonclub-test/';
  if (e.action === 'coming' || e.action === 'notcoming') url = url.replace(/vote=[a-z]+/, 'vote=' + e.action);
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
