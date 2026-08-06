// ============================================================
//  Le carnet-fichier : les trois modes, et le trajet d'une saisie
//  faite loin du PC jusqu'au carnet.
//
//  On simule le réseau plutôt que de le mocker à moitié : un faux
//  serveur en mémoire, qu'on peut allumer et éteindre.
// ============================================================

import { JSDOM } from 'jsdom';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

const dom = new JSDOM('<!doctype html><html><body></body></html>',
  { url: 'http://localhost/', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.Blob = dom.window.Blob;
globalThis.URL = dom.window.URL;
globalThis.structuredClone ??= v => JSON.parse(JSON.stringify(v));
dom.window.URL.createObjectURL ??= () => 'blob:faux';
dom.window.URL.revokeObjectURL ??= () => {};

const resultats = [];
const check = (nom, cond, extra = '') =>
  resultats.push((cond ? '  OK  ' : ' FAIL ') + nom + (cond ? '' : ` -> ${extra}`));

const attendre = (ms = 30) => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------
//  Faux serveur
// ------------------------------------------------------------

const serveur = {
  allume: false,
  fichierPublie: null,        // donnees/carnet.json, en lecture seule
  carnet: { version: 1, divers: [], buddies: [], dives: [], certifs: [],
            settings: { activeDiverId: null } },
  ecritures: 0,
};

globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  const refus = { ok: false, status: 404, json: async () => ({}) };

  if (u.includes('/api/etat')) {
    return serveur.allume
      ? { ok: true, status: 200, json: async () => ({ serveur: true, ecriture: true }) }
      : refus;
  }
  if (u.includes('/api/carnet')) {
    if (!serveur.allume) return refus;
    if (options.method === 'PUT') {
      serveur.carnet = JSON.parse(options.body);
      serveur.ecritures++;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    return { ok: true, status: 200, json: async () => structuredClone(serveur.carnet) };
  }
  if (u.includes('carnet.json')) {
    return serveur.fichierPublie
      ? { ok: true, status: 200, json: async () => structuredClone(serveur.fichierPublie) }
      : refus;
  }
  return refus;
};

const fichier = await import(path.join(ROOT, 'js/store-fichier.js'));
const { fileStore, modeActuel, enAttenteDExport, oublierAttente, rafraichir } = fichier;
const { emptyDive, emptyDiver } = await import(path.join(ROOT, 'js/model.js'));
const exportPlongee = await import(path.join(ROOT, 'js/export-plongee.js'));
const sync = await import(path.join(ROOT, 'js/sync.js'));

// ============================================================
//  1. Aucun serveur, aucun fichier : hors ligne, mais utilisable
// ============================================================

localStorage.clear();
await fileStore.init();

check('sans rien de joignable, le mode est hors ligne',
  modeActuel() === 'hors-ligne', modeActuel());

const plongeur = emptyDiver();
Object.assign(plongeur, { id: 'd1', prenom: 'Denis', nom: 'Soares' });
await fileStore.saveDiver(plongeur);

const p1 = emptyDive('d1', 1);
Object.assign(p1, { id: 'p1', date: '2026-08-01', lieuNom: 'Sec du Gendarme', profMax: 32 });
await fileStore.saveDive(p1);

check('on peut saisir hors ligne',
  (await fileStore.listDives('d1')).length === 1, '');
check('la saisie est notée comme à exporter',
  enAttenteDExport().includes('p1'), JSON.stringify(enAttenteDExport()));
check('l’interface est prévenue qu’il y a du travail',
  sync.status().state === 'pending' && sync.status().pending === 1,
  JSON.stringify(sync.status()));

// Le miroir doit survivre à un rechargement de page.
check('le miroir garde la plongée pour la prochaine ouverture',
  JSON.parse(localStorage.getItem('plongee-journal:miroir')).dives.length === 1, '');

// ============================================================
//  2. Le fichier publié seul (pCloud) : lecture seule
// ============================================================

serveur.fichierPublie = {
  version: 1, divers: [plongeur], buddies: [], certifs: [],
  dives: [{ id: 'p0', diverId: 'd1', numero: 0, date: '2019-12-29',
            lieuNom: 'Ancienne plongée', updatedAt: '2019-12-29T10:00:00Z' }],
  settings: { activeDiverId: 'd1' },
};

await rafraichir();
check('avec le fichier publié seul, le mode est lecture',
  modeActuel() === 'lecture', modeActuel());

const enLecture = await fileStore.listDives('d1');
check('le carnet publié est visible',
  enLecture.some(d => d.id === 'p0'), '');
check('la saisie locale non exportée reste visible',
  enLecture.some(d => d.id === 'p1'),
  'la plongée saisie hors ligne a disparu de l’écran');
check('elle est toujours en attente d’export',
  enAttenteDExport().includes('p1'), '');

// ============================================================
//  3. Le fichier d'export : nom et contenu
// ============================================================

const quand = new Date(2026, 7, 6, 18, 30);
const p42 = { ...p1, id: 'p42', numero: 42, buddyIds: ['b1'] };
const carnet = await fileStore.raw();
carnet.buddies = [{ id: 'b1', prenom: 'Alix', nom: 'Ducamp',
                    stamps: [{ id: 't1', dataUrl: 'data:image/png;base64,AAAA' }] }];

check('le nom du fichier suit le format convenu',
  exportPlongee.nomDuFichier(p42, quand) === 'plongeeNo0042-20260806_1830.json',
  exportPlongee.nomDuFichier(p42, quand));
check('un numéro à un chiffre est complété',
  exportPlongee.nomDuFichier({ numero: 7 }, quand) === 'plongeeNo0007-20260806_1830.json',
  exportPlongee.nomDuFichier({ numero: 7 }, quand));

const contenu = exportPlongee.construireExport(p42, carnet, quand);
check('le fichier contient la plongée', contenu.dives.length === 1, '');
check('le fichier emporte le plongeur', contenu.divers.some(d => d.id === 'd1'), '');
check('le fichier emporte les compagnons cités',
  contenu.buddies.some(b => b.id === 'b1'), '');
check('le fichier n’emporte pas les compagnons non cités',
  contenu.buddies.length === 1, String(contenu.buddies.length));
check('les tampons voyagent avec',
  !!contenu.medias?.['tampon-b1-t1.png'], JSON.stringify(Object.keys(contenu.medias || {})));

// ============================================================
//  4. Le PC s'allume : ce qui attendait part tout seul
// ============================================================

serveur.allume = true;
serveur.carnet = structuredClone(serveur.fichierPublie);
const ecrituresAvant = serveur.ecritures;

await rafraichir();

check('serveur trouvé, le mode passe en écriture',
  modeActuel() === 'serveur', modeActuel());
check('la saisie en attente est montée sur le serveur',
  serveur.carnet.dives.some(d => d.id === 'p1'),
  JSON.stringify(serveur.carnet.dives.map(d => d.id)));
check('elle n’est plus en attente', enAttenteDExport().length === 0,
  JSON.stringify(enAttenteDExport()));
check('le serveur a bien été écrit', serveur.ecritures > ecrituresAvant, '');
check('l’ancienne plongée du carnet n’a pas été perdue',
  serveur.carnet.dives.some(d => d.id === 'p0'), '');
check('l’interface annonce que tout est écrit',
  sync.status().state === 'ok', JSON.stringify(sync.status()));

// Une nouvelle saisie part directement, sans rien demander.
const p2 = emptyDive('d1', 2);
Object.assign(p2, { id: 'p2', date: '2026-08-05', lieuNom: 'La Gabinière', profMax: 28 });
await fileStore.saveDive(p2);
await attendre(600);        // l'envoi est volontairement différé

check('avec serveur, une saisie part sans passer par un fichier',
  serveur.carnet.dives.some(d => d.id === 'p2'),
  JSON.stringify(serveur.carnet.dives.map(d => d.id)));
check('rien ne s’accumule dans la file d’export',
  enAttenteDExport().length === 0, JSON.stringify(enAttenteDExport()));

// ============================================================
//  5. Le PC s'éteint en cours de route
// ============================================================

serveur.allume = false;

const p3 = emptyDive('d1', 3);
Object.assign(p3, { id: 'p3', date: '2026-08-06', lieuNom: 'Le Donator', profMax: 40 });
await fileStore.saveDive(p3);
await attendre(600);

check('serveur perdu, on repasse en lecture seule',
  modeActuel() === 'lecture', modeActuel());
check('la saisie perdue rejoint la file d’export plutôt que de disparaître',
  (await fileStore.getDive('p3'))?.lieuNom === 'Le Donator', '');

// Elle sera rattrapée : on force une nouvelle saisie pour la marquer.
await fileStore.saveDive({ ...p3, lieuNom: 'Le Donator (corrigé)' });
check('la correction est notée à exporter',
  enAttenteDExport().includes('p3'), JSON.stringify(enAttenteDExport()));

oublierAttente();
check('on peut vider la file à la main', enAttenteDExport().length === 0, '');

// ============================================================
//  6. La fusion locale suit la même règle que le serveur
// ============================================================

await fileStore.importAll({
  dives: [
    { id: 'p2', lieuNom: 'Périmé', updatedAt: '2000-01-01T00:00:00Z' },
    { id: 'p9', lieuNom: 'Nouveau', updatedAt: '2026-09-01T00:00:00Z' },
  ],
}, { merge: true });

check('un import périmé ne remplace pas une plongée plus récente',
  (await fileStore.getDive('p2')).lieuNom === 'La Gabinière',
  (await fileStore.getDive('p2')).lieuNom);
check('un import ajoute ce qui manque',
  (await fileStore.getDive('p9'))?.lieuNom === 'Nouveau', '');

// ============================================================

console.log(resultats.join('\n'));
const echecs = resultats.filter(r => r.startsWith(' FAIL'));
console.log();
if (echecs.length) {
  console.log(`${echecs.length} test(s) en échec`);
  process.exit(1);
}
console.log('Tous les tests du carnet-fichier passent.');
