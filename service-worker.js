// Service Worker per PWA Marti Outfit
// Strategia: cache-first per shell statica, network-first per Firebase/Claude API

const CACHE_VERSION = 'v128-sw-bypass-cross-origin';
const CACHE_NAME = `marty-outfit-${CACHE_VERSION}`;

// File della shell PWA da pre-cachare per uso offline.
// Quando aggiungi un file critico al boot, mettilo qui e bumpa CACHE_VERSION.
// NOTA: il modello @imgly (~30 MB) NON e' qui: viene cachato in IndexedDB
// dalla libreria stessa al primo uso dell'editor.
const SHELL_FILES = [
  './',
  './index.html',
  './settings.html',
  './capsules.html',
  './capsule-detail.html',
  './analytics.html',
  './outfit-editor.html',
  './manual.html',
  './calendar.html',
  './manifest.json',
  './css/tokens.css',
  './css/components.css',
  './css/styles.css',
  './css/settings.css',
  './css/extras.css',
  './js/app.js',
  './js/firebase-config.js',
  './js/claude-api.js',
  './js/wardrobe.js',
  './js/outfit.js',
  './js/capsules.js',
  './js/capsules-page.js',
  './js/capsule-detail.js',
  './js/analytics.js',
  './js/settings.js',
  './js/outfit-editor.js',
  './js/bg-removal.js',
  './js/calendar.js',
  './js/weather.js',
  './js/search.js',
  './js/haptic.js',
  './js/taxonomies.js',
  './js/taxonomies-page.js',
  './taxonomies.html',
  './js/demo-data.js',
  './js/demo-loader.js',
  './js/share-outfit.js',
  './js/share-templates.js',
  './js/share-user-templates.js',
  './js/share-logo.js',
  './js/color-palette.js',
  './js/palette-page.js',
  './js/wear-sessions.js',
  './js/bottom-nav.js',
  './js/system-page.js',
  './system.html',
  './js/live-memory-page.js',
  './palette.html',
  './live-memory.html',
  './js/dormant.js',
  './js/dormant-page.js',
  './js/today-outfit.js',
  './js/it-format.js',
  './js/trips.js',
  './js/trips-data.js',
  './js/trips-generator.js',
  './js/trip-detail.js',
  './js/trip-wrapped.js',
  './js/trip-mood-board.js',
  './js/trips-dresscode.js',
  './js/calendar-trip-banner.js',
  './js/trips-weather.js',
  './js/trips-weather-compat.js',
  './js/instagram-share.js',
  './js/budget-data.js',
  './js/budget-page.js',
  './js/notes-data.js',
  './js/notes-page.js',
  './js/note-detail.js',
  './js/reminders-data.js',
  './js/reminders-page.js',
  './js/diary-data.js',
  './js/diary-page.js',
  './js/diary-detail.js',
  './js/diary-wrapped.js',
  './js/home-hub-card.js',
  './js/top-month-banner.js',
  './js/item-quick-actions.js',
  './js/chip-styles.js',
  './js/action-tree.js',
  './css/action-tree.css',
  './js/outfit-history-page.js',
  './css/outfit-history.css',
  './outfit-history.html',
  './js/armocromia-data.js',
  './js/armocromia-page.js',
  './js/color-match.js',
  './js/armocromia-wrapped.js',
  './css/armocromia.css',
  './armocromia.html',
  './js/inspirations-data.js',
  './js/inspirations-page.js',
  './css/inspirations.css',
  './inspirations.html',
  './css/trips.css',
  './css/budget.css',
  './css/notes.css',
  './css/reminders.css',
  './css/diary.css',
  './budget.html',
  './notes.html',
  './note-detail.html',
  './reminders.html',
  './diary.html',
  './diary-detail.html',
  './trips.html',
  './trip-detail.html',
  './dormant.html',
  './js/theme/tokens.js',
  './js/theme/manager.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/icon-192-pink.png',
  './icons/icon-192-navy.png',
  './icons/icon-192-mono.png',
  './icons/icon-512-pink.png',
  './icons/icon-512-navy.png',
  './icons/icon-512-mono.png',
  './icons/apple-touch-icon-pink.png',
  './icons/apple-touch-icon-navy.png',
  './icons/apple-touch-icon-mono.png',
  './fonts/inter.woff2',
  './fonts/playfair.woff2',
  './fonts/dmsans.woff2',
  './fonts/jetbrains.woff'
];

// Install: pre-cache della shell.
// IMPORTANTE: cache.addAll() e' atomico (1 file 404 fa fallire tutto). Uso
// cache.add() singolarmente con catch, cosi' anche se un asset e' mancante
// il SW si installa comunque e l'app non resta bloccata.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        await Promise.all(SHELL_FILES.map(async f => {
          try { await cache.add(f); }
          catch (err) { console.warn('[SW] skip', f, err.message); }
        }));
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] install error:', err))
  );
});

// Cosa c'e' di nuovo in questa versione (testo human-friendly mostrato nel
// banner di update). Tieni stringato e accattivante, NON tecnico.
const WHATS_NEW = "✨ Rimozione sfondo ora funziona davvero: corretto bug del service worker che bloccava il modello AI. Aggiorna e riprova.";

// Listener postMessage:
//  - 'SKIP_WAITING' -> attiva subito il nuovo SW
//  - 'GET_WHATS_NEW' -> ritorna WHATS_NEW al client (via MessageChannel)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data === 'GET_WHATS_NEW' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ version: CACHE_VERSION, whatsNew: WHATS_NEW });
  }
});

// Activate: pulizia vecchie cache + claim immediato dei client aperti
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: strategie differenziate
//
// REGOLA D'ORO: cross-origin = bypass totale del SW (return senza respondWith).
// Senza questa regola, su Safari iOS il fetch a CDN remoti (esm.sh per @imgly,
// modelli ONNX, Firebase Storage, Claude proxy Cloudflare) entrava nel branch
// "cache-first" del SW e in caso di errore la catch ritornava
// caches.match('./index.html') = null  →  "FetchEvent.respondWith received an
// error: Returned response is null" → bg-removal fallita.
//
// Il browser sa gestire da solo CORS e cache HTTP per le risorse cross-origin,
// non c'e' nessun guadagno a intercettarle dal SW. Same-origin solo, qui.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo GET vengono gestite dal SW (POST/PUT vanno sempre in rete)
  if (req.method !== 'GET') return;

  // Cross-origin → lascia gestire al browser (no intercept)
  if (url.origin !== self.location.origin) return;

  // Same-origin: navigation HTML → network-first con fallback index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cached = await caches.match('./index.html');
        return cached || Response.error();
      })
    );
    return;
  }

  // Same-origin asset (js/css/img/font) → cache-first
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => Response.error());
    })
  );
});
