/* Service worker: rende la piantina un’app installabile che si apre anche senza connessione.

   - File del sito (pagina, stile, moduli, data/plan.json, icone): prima la rete, così ogni
     modifica pubblicata arriva subito; se la rete manca o tarda, la copia salvata.
   - three.js da jsDelivr e il font da Google Fonts: hanno la versione nell’indirizzo e non
     cambiano, quindi prima la copia salvata e la rete solo la prima volta.
   - La pagina, una volta avviata, manda l’elenco di tutto quello che ha caricato (moduli,
     aggiunte di three.js, font) e lo salvo: alla visita successiva funziona tutto offline. */

const CACHE = 'piantina-v1';
const SHELL = ['./', 'index.html', 'css/style.css', 'data/plan.json', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png',
  'icons/apple-touch-icon.png', 'src/main.js'];
const CDN = ['https://cdn.jsdelivr.net/', 'https://fonts.googleapis.com/', 'https://fonts.gstatic.com/'];
const NET_WAIT = 4000;      /* ms: oltre, rispondo con la copia salvata e aggiorno in background */

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache:'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('piantina-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isCdn = url => CDN.some(p => url.startsWith(p));
const sameOrigin = url => url.startsWith(self.location.origin + '/');
const inScope = url => url.startsWith(self.registration.scope);

/* la pagina manda gli indirizzi caricati: salvo quelli che mancano */
self.addEventListener('message', e => {
  const d = e.data;
  if (!d || d.type !== 'cache-urls' || !Array.isArray(d.urls)) return;
  e.waitUntil(caches.open(CACHE).then(async c => {
    for (const u of d.urls){
      if (typeof u !== 'string' || !(inScope(u) || isCdn(u))) continue;
      const key = inScope(u) ? u.split('#')[0].split('?')[0] : u;
      if (await c.match(key)) continue;
      try {
        const r = await fetch(key, { mode:'cors', credentials:'omit' });
        if (r.ok) await c.put(key, r);
      } catch(err){}
    }
  }));
});

async function networkFirst(req, key){
  const c = await caches.open(CACHE);
  const net = fetch(req).then(r => {
    if (r.ok && r.type === 'basic') c.put(key, r.clone()).catch(() => {});
    return r;
  });
  net.catch(() => {});      /* se vince la copia salvata, un errore di rete dopo non va segnalato */
  const cached = c.match(key);
  /* rete entro NET_WAIT; altrimenti la copia salvata (se c’è), mentre la rete finisce e aggiorna */
  const timeout = new Promise(res => setTimeout(() => res(null), NET_WAIT));
  try {
    const first = await Promise.race([net, timeout]);
    if (first) return first;
    return (await cached) || await net;
  } catch(err){
    const hit = await cached;
    if (hit) return hit;
    throw err;
  }
}
async function cacheFirst(req){
  const c = await caches.open(CACHE);
  const hit = await c.match(req.url);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') c.put(req.url, r.clone()).catch(() => {});
  return r;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  if (req.mode === 'navigate' && inScope(url)){
    /* qualunque pagina del sito: la piantina (index.html), anche offline */
    e.respondWith(networkFirst(req, new URL('./', self.registration.scope).href).catch(() => caches.match('index.html')));
    return;
  }
  if (sameOrigin(url) && inScope(url)){
    e.respondWith(networkFirst(req, url.split('#')[0].split('?')[0]));
    return;
  }
  if (isCdn(url)) e.respondWith(cacheFirst(req));
});
