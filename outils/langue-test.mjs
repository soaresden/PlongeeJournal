// L'appli en anglais : le dictionnaire et les motifs.
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
const { traduire } = await import(__p2u(path.join(ROOT, 'js/langue.js')).href);
const cas = [
  ['Plongées', 'Dives'], ['  Réglages ', '  Settings '], ['☰ Liste', '☰ List'], ['Plongée n°83', 'Dive #83'],
  ['26 plongées · max 39.8 m · 19 h', '26 dives · max 39.8 m · 19 h'], ['8 nov. · 3 plongées', '8 Nov · 3 dives'],
  ['dimanche 8 novembre 2026', 'Sunday 8 November 2026'], ['Exploration de nuit', 'Night dive'], ['🛢 Bouteille', '🛢 Tank'],
  ['Hurghada', 'Hurghada'], ['', ''],
];
const ko = cas.filter(([a, b]) => traduire(a) !== b);
cas.forEach(([a, b]) => console.log(`${traduire(a) === b ? '  OK ' : ' FAIL'} « ${a} » → « ${traduire(a)} »`));
console.log(`\n${cas.length - ko.length}/${cas.length} vérifications anglais`);
if (ko.length) process.exit(1);
