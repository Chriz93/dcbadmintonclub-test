const CACHE='clubcourt-test-public-v1';
const BASE=new URL('./',self.location.href);
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll([new URL('./',BASE),new URL('manifest.webmanifest',BASE)]))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('clubcourt-test-public-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==BASE.origin||!u.pathname.startsWith(BASE.pathname)||u.search||e.request.headers.has('Authorization'))return;
 // Only immutable build assets and public app shell; never API/auth/private routes.
 const shell=u.pathname===BASE.pathname||u.pathname===BASE.pathname+'index.html';
 const asset=u.pathname.startsWith(BASE.pathname+'assets/')||u.pathname===BASE.pathname+'manifest.webmanifest';
 if(!shell&&!asset)return;
 e.respondWith(fetch(e.request).then(r=>{if(r.ok&&r.type==='basic'){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)));}return r;}).catch(()=>caches.match(e.request).then(r=>r||Response.error())));
});
