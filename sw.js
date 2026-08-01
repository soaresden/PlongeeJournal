/* Service worker : rend l'app utilisable hors connexion (bateau, carrière…).
   Les tuiles de carte, elles, ont besoin du réseau. */

// À incrémenter à chaque livraison : un vieux cache sert un vieux
// index.html, et les changements d'icônes ou de menu ne se voient pas.
const CACHE = 'plongee-journal-v2';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/router.js',
  './js/lib.js',
  './js/store.js',
  './js/store-local.js',
  './js/store-supabase.js',
  './js/model.js',
  './js/settings.js',
  './js/supabase.js',
  './js/sync.js',
  './js/fit.js',
  './js/geo.js',
  './js/species.js',
  './js/stamp.js',
  './js/draft.js',
  './js/config.js',
  './js/map.js',
  './js/views/dives.js',
  './js/views/dive-form.js',
  './js/views/divers.js',
  './js/views/buddies.js',
  './js/views/stats.js',
  './js/views/calendar.js',
  './js/views/materiel.js',
  './js/views/lock.js',
  './js/views/setup.js',
  './js/views/suunto.js',
  './js/biometric.js',
  './assets/icon.svg',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Cartes, recherche de lieux, Supabase, Suunto : réseau uniquement.
  // Mettre en cache des réponses de base ferait afficher des données périmées.
  if (/tile|nominatim|arcgisonline|googleapis|supabase\.co|suunto/.test(url.hostname + url.pathname)) return;

  // Réseau d'abord pour le code (mises à jour immédiates), cache en secours.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))),
  );
});
