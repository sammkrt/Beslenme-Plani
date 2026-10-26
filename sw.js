/* Çevrimdışı açılış. Sayfa önce ağdan istenir (en fazla 4 sn beklenir), gelmezse son kopya açılır;
   böylece yeni sürüm hemen gelir ama markette zayıf bağlantıda da uygulama açılır.
   Simgeler ve fontlar önbellekten verilip arka planda yenilenir. API (/api/state) hiç önbelleğe alınmaz. */
const CACHE = 'beslenme-v3';
const CORE = ['./', 'index.html', 'mealie-adapter.js', 'auto-recipes.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.pathname.includes('/api/')) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const net = fetch(req).then(res => { if (res.ok) cache.put('index.html', res.clone()); return res; });
      try {
        const res = await Promise.race([net, new Promise(ok => setTimeout(ok, 4000))]);
        if (res) return res;
      } catch (_) { /* çevrimdışı: önbelleğe düş */ }
      return (await cache.match('index.html')) || net;
    })());
    return;
  }

  if (url.origin === location.origin || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE).then(async cache => {
      const hit = await cache.match(req);
      const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
