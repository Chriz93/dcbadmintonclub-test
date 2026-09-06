// Retire only this legacy test worker; never delete another app's origin caches.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
 for (const key of await caches.keys()) if (key.startsWith('dcbc-test-')) await caches.delete(key);
 await self.registration.unregister();
})()));
