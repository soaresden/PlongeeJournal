// Vérifie l'ambiance déduite du lieu, et le centrage des vignettes satellite.
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
globalThis.document = { createElement: () => ({ style: { setProperty() {} }, append() {}, setAttribute() {} }), createTextNode: () => ({}) };
const { ambianceId, tuiles } = await import(__p2u(path.join(ROOT, 'js/ambiance.js')).href);

const results = [];
const check = (name, cond, extra = '') =>
  results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

const cas = [
  ['St-Pierre, Martinique', { lat: 14.74, lng: -61.19, eau: 'salee' }, 'caraibes'],
  ['Fornells, Minorque',    { lat: 40.06, lng: 4.13, eau: 'salee' }, 'med'],
  ['Fréjus',                { lat: 43.42, lng: 6.77, eau: 'salee' }, 'med'],
  ['Jale, Albanie',         { lat: 40.13, lng: 19.63, eau: 'salee' }, 'med'],
  ['Hurghada',              { lat: 27.25, lng: 33.83, eau: 'salee' }, 'merRouge'],
  ['Lanzarote',             { lat: 28.86, lng: -13.83, eau: 'salee' }, 'atlantique'],
  ['Açores',                { lat: 37.74, lng: -25.67, eau: 'salee' }, 'atlantique'],
  ['Cherbourg',             { lat: 49.66, lng: -1.62, eau: 'salee' }, 'nord'],
  ['Beaumont-sur-Oise',     { lat: 49.14, lng: 2.29, eau: 'douce' }, 'douce'],
  ['Fosse (option)',        { lat: 48.8, lng: 2.3, eau: 'douce', options: ['Plongée en fosse'] }, 'fosse'],
  ['Maldives',              { lat: 4.17, lng: 73.5, eau: 'salee' }, 'tropiques'],
  ['Sans GPS',              { eau: 'salee' }, 'ocean'],
];
for (const [nom, d, attendu] of cas) {
  const id = ambianceId(d);
  check(`ambiance : ${nom} → ${attendu}`, id === attendu, id);
}

// Le site doit toujours tomber au centre de la vignette, même près d'un bord de tuile.
for (const [lat, lng] of [[14.74465, -61.19461], [40.13, 19.63], [0.0001, 0.0001], [49.66, -1.62]]) {
  const { liste, taille } = tuiles(lat, lng, { zoom: 12, boite: 84 });
  const couvre = liste.every(t => t.x <= 84 && t.y <= 84 && t.x + taille >= 0 && t.y + taille >= 0);
  check(`vignette ${lat},${lng} : 1 à 4 tuiles qui couvrent la boîte`, liste.length >= 1 && liste.length <= 4 && couvre, JSON.stringify(liste));
  const minX = Math.min(...liste.map(t => t.x)), maxX = Math.max(...liste.map(t => t.x)) + taille;
  const minY = Math.min(...liste.map(t => t.y)), maxY = Math.max(...liste.map(t => t.y)) + taille;
  check(`vignette ${lat},${lng} : aucune zone vide`, minX <= 0 && minY <= 0 && maxX >= 84 && maxY >= 84);
}

console.log(results.join('\n'));
const ko = results.filter(l => l.startsWith(' FAIL')).length;
console.log(`\n${results.length - ko}/${results.length} vérifications`);
process.exit(ko ? 1 : 0);
