/* Service worker : rend l'app utilisable hors connexion (bateau, carrière…).
   Les tuiles de carte, elles, ont besoin du réseau. */

// À incrémenter à chaque livraison : un vieux cache sert un vieux
// index.html, et les changements d'icônes ou de menu ne se voient pas.
const CACHE = 'plongee-journal-v36';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/themes.css',
  './css/styles.css',
  './js/app.js',
  './js/router.js',
  './js/lib.js',
  './js/store.js',
  './js/store-base.js',
  './js/store-github.js',
  './js/github.js',
  './js/fusion.js',
  './js/theme.js',
  './js/ambiance.js',
  './js/model.js',
  './js/settings.js',
  './js/sync.js',
  './js/fit.js',
  './js/heatshrink.js',
  './js/ocean-proto.js',
  './js/ocean-device.js',
  './js/ocean-sbem.js',
  './js/seances.js',
  './js/maj-apk.js',
  './js/suunto-cloud.js',
  './js/suunto-aligner.js',
  './js/ble.js',
  './js/ble-journal.js',
  './js/geo.js',
  './js/species.js',
  './js/stamp.js',
  './js/photos.js',
  './js/config.js',
  './js/map.js',
  './js/views/dives.js',
  './js/views/dive-form.js',
  './js/views/divers.js',
  './js/views/buddies.js',
  './js/views/stats.js',
  './js/views/calendar.js',
  './js/views/reglages.js',
  './js/views/carte.js',
  './js/views/materiel.js',
  './js/views/urgence.js',
  './js/urgence.js',
  './js/views/suunto.js',
  './js/views/montre.js',
  './js/views/seances.js',
  './js/views/suunto-cloud.js',
  './js/views/montre-aide.js',
  './js/views/carnet-photo.js',
  './assets/icon.svg',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
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

  // Le carnet, l'API locale, les cartes et les recherches de lieux ne
  // passent jamais par le cache : servir un carnet périmé serait pire
  // que ne rien servir du tout.
  if (/^\/api\//.test(url.pathname) || /\/donnees\//.test(url.pathname)) return;
  if (/tile|nominatim|arcgisonline|googleapis|suunto|api\.github\.com/.test(url.hostname + url.pathname)) return;

  // Réseau d'abord pour le code (mises à jour immédiates), cache en secours.
  // « no-cache » : on revalide auprès du serveur, sinon le cache HTTP du
  // navigateur peut resservir une vieille feuille de style après une mise à jour.
  const frais = e.request.mode === 'navigate'
    ? fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(e.request, { cache: 'no-cache' });
  e.respondWith(
    frais
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))),
  );
});
