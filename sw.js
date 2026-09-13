const CACHE_PREFIX = 'dcbc-test-';
const CACHE_NAME = CACHE_PREFIX + 'audit-v65';
const BASE = new URL('./', self.location.href);
const ASSETS = ['', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'].map(p => new URL(p, BASE).href);
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // Authentication and database responses are never intercepted or cached.
  if (e.request.method !== 'GET' || u.origin !== BASE.origin || !u.pathname.startsWith(BASE.pathname)) return;
  const result = fetch(e.request).then(async r => {
    if (r.ok && (ASSETS.includes(u.href) || u.pathname.startsWith(BASE.pathname + 'vendor/'))) {
      await caches.open(CACHE_NAME).then(c => c.put(e.request, r.clone())).catch(() => {});
    }
    return r;
  }).catch(async () => (await caches.match(e.request)) || new Response('Offline. Reconnect and retry; changes cannot be saved offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
  e.respondWith(result);
});
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Maplewood League', {
    body: d.body || '', icon: new URL('icon-192.png', BASE).href, badge: new URL('icon-192.png', BASE).href,
    tag: d.tag || 'maplewood-vote', renotify: true, data: { url: d.url || BASE.href }, actions: d.actions || []
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || BASE.href, BASE);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  // Only explicit response actions vote. Opening the message shows the form.
  url.searchParams.delete('vote');
  if (e.action === 'coming' || e.action === 'notcoming') url.searchParams.set('vote', e.action);
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async list => {
    const client = list.find(c => c.url.startsWith(BASE.href) && 'focus' in c);
    if (client) { await client.navigate(url.href); return client.focus(); }
    return self.clients.openWindow(url.href);
  }));
});
