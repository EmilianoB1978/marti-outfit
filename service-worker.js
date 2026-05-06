// Service Worker per PWA Marty Outfit
// Strategia: cache-first per shell statica, network-first per Firebase/Claude API

const CACHE_VERSION = 'v50-season-chips';
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

// Listener: postMessage('SKIP_WAITING') -> attiva subito il nuovo SW
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
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
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Non cachare API esterne (Firebase, Claude proxy) - sempre network
  const isExternalAPI =
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    url.hostname.includes('firebasestorage.app') ||
    url.hostname.includes('workers.dev') ||
    url.hostname.includes('anthropic.com');

  if (isExternalAPI) {
    // Network-first per le API: se offline usa cache come fallback
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first per assets locali
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          // Cacha solo risposte valide same-origin
          if (response.ok && url.origin === self.location.origin) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
      .catch(() => caches.match('./index.html'))
  );
});
