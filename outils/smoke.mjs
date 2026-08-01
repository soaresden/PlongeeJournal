// Test de fumée : charge l'app dans jsdom et parcourt tous les écrans.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  url: 'http://localhost/index.html#/dives',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
});

const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.location = window.location;
globalThis.history = window.history;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.localStorage = window.localStorage;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.Image = window.Image;
globalThis.FileReader = window.FileReader;
globalThis.Blob = window.Blob;
globalThis.URL = window.URL;
globalThis.requestAnimationFrame = cb => setTimeout(cb, 0);
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
  randomUUID: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random()*16|0).toString(16)) } });
globalThis.fetch = async () => ({ ok: true, json: async () => [] });
// Leaflet en doublure
const chain = () => new Proxy(() => {}, { get: () => chain(), apply: () => chain() });
globalThis.L = chain();
window.L = globalThis.L;
globalThis.structuredClone ??= v => JSON.parse(JSON.stringify(v));

const errors = [];
window.addEventListener('error', e => errors.push('window.error: ' + e.message));
process.on('unhandledRejection', r => errors.push('unhandled: ' + r));

const tick = (ms = 60) => new Promise(r => setTimeout(r, ms));

await import(path.join(ROOT, 'js/app.js'));
await tick(150);

const view = () => document.getElementById('view').textContent.replace(/\s+/g, ' ').trim();
const title = () => document.getElementById('topTitle').textContent;
const results = [];
const check = (name, cond, extra = '') => {
  results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));
};

check('écran initial rendu', view().includes('Bienvenue'), view().slice(0, 80));

// --- Créer un plongeur -------------------------------------
const { store, emptyDiver, emptyDive, emptyBuddy, guessWater } = await import(path.join(ROOT, 'js/store.js'));
const { checkCredentials } = await import(path.join(ROOT, 'js/settings.js'));

// --- Garde-fou sur les clés Supabase -----------------------
check('clé secrète refusée',
  checkCredentials('https://abc.supabase.co', 'sb_secret_XXXX').some(e => e.includes('SECRÈTE')));
check('clé publiable acceptée',
  checkCredentials('https://abc.supabase.co', 'sb_publishable_XXXX').length === 0);
check('ancienne clé anon (JWT) acceptée',
  checkCredentials('https://abc.supabase.co', 'eyJhbGciOi').length === 0);
check('URL malformée refusée',
  checkCredentials('abc.supabase.co', 'sb_publishable_X').length > 0);

const d = emptyDiver();
Object.assign(d, { prenom: 'Denis', nom: 'Testeur', licence: 'A-12-345678',
  groupeSanguin: 'O+', ville: 'Beaumont-sur-Oise', cp: '95260',
  urgPrenom: 'Marie', urgNom: 'Testeur', urgTel: '0600000000' });
await store.saveDiver(d);
await store.setActiveDiver(d.id);

// --- Compagnon avec tampon ---------------------------------
const b = emptyBuddy();
Object.assign(b, { prenom: 'Jean', nom: 'Moniteur', niveau: 'MF1',
  stamps: [{ id: 'st1', dataUrl: 'data:image/jpeg;base64,AAAA', label: 'Club' }] });
await store.saveBuddy(b);

// --- Deux plongées -----------------------------------------
const n1 = await store.nextNumber(d.id);
const dv = emptyDive(d.id, n1);
Object.assign(dv, {
  date: '2026-07-14', lieuNom: 'Lac de Beaumont-sur-Oise',
  lieuDetail: 'Beaumont-sur-Oise, Val-d’Oise, France',
  lat: 49.1421, lng: 2.2854, eau: guessWater('Lac de Beaumont-sur-Oise'),
  heureImmersion: '10:15', heureSortie: '11:03',
  type: 'Exploration de jour', options: ['Nitrox'], objectifs: ['Épaves', 'Poissons'],
  palier3: 3, palier6: 0, profMax: 24, lestage: '6 kg', tempFond: 12,
  buddyIds: [b.id], palanqueeMode: 'moniteur', chefBuddyId: b.id,
  stampBuddyId: b.id, stampId: 'st1',
  fait: 'Remontée assistée', vu: 'Brochet', observations: 'Eau claire',
});
await store.saveDive(dv);

const dv2 = emptyDive(d.id, await store.nextNumber(d.id));
Object.assign(dv2, { date: '2026-06-02', lieuNom: 'Calanque de Sormiou',
  lat: 43.2, lng: 5.41, eau: 'salee', heureImmersion: '23:40', dureeMin: 45,
  type: 'Exploration de nuit', profMax: 18 });
await store.saveDive(dv2);

check('numérotation auto', dv.numero === 1 && dv2.numero === 2, `${dv.numero}/${dv2.numero}`);
check('durée calculée depuis les horaires', dv.dureeMin === 48, String(dv.dureeMin));
check('heure de sortie calculée (passage minuit)', dv2.heureSortie === '00:25', dv2.heureSortie);
check('eau douce devinée', dv.eau === 'douce', dv.eau);
check('eau salée devinée', guessWater('Calanque de Sormiou') === 'salee', guessWater('Calanque de Sormiou'));

const st = await store.stats(d.id);
check('compteur de plongées', st.count === 2, String(st.count));
check('profondeur max', st.maxDepth === 24, String(st.maxDepth));
check('total temps', st.totalMin === 93, String(st.totalMin));
check('plongées de nuit', st.nuit === 1, String(st.nuit));

// --- Parcours de tous les écrans ---------------------------
const routes = ['dives', `dive/${dv.id}`, `dive/${dv.id}/edit`, 'dive/new',
                'divers', `diver/${d.id}`, 'buddies', `buddy/${b.id}`, 'stats',
                'setup', 'verrou', 'login', 'motdepasse', 'suunto', 'suunto?ok=1',
                'route/inexistante'];
for (const r of routes) {
  window.location.hash = '#/' + r;
  window.dispatchEvent(new window.Event('hashchange'));
  await tick(90);
  const txt = view();
  check(`route « ${r} » rend du contenu`, txt.length > 20 && !title().includes('Erreur'),
        title() + ' | ' + txt.slice(0, 100));
}

// --- Contrôles de contenu ----------------------------------
window.location.hash = '#/dives';
window.dispatchEvent(new window.Event('hashchange'));
await tick(90);
check('la liste affiche les deux lieux',
  view().includes('Lac de Beaumont-sur-Oise') && view().includes('Calanque de Sormiou'), view().slice(0, 150));
check('la liste affiche le compagnon', view().includes('Jean Moniteur'), '');

// --- Écran Plongeurs : vignettes, pas des lignes ---
window.location.hash = '#/buddies';
window.dispatchEvent(new window.Event('hashchange'));
await tick(120);
check('Plongeurs : titre avec le tuba', title().includes('🤿') && title().includes('Plongeurs'), title());
check('Plongeurs : affichage en vignettes',
  document.querySelectorAll('#view .obs.buddy').length === 1,
  String(document.querySelectorAll('#view .obs.buddy').length));
check('Plongeurs : plus de lignes pleine largeur',
  document.querySelectorAll('#view .card.clickable').length === 0,
  String(document.querySelectorAll('#view .card.clickable').length));
check('Plongeurs : regroupé par club',
  document.querySelectorAll('#view .groupe-club').length >= 1, '');
check('Plongeurs : filtre présent', !!document.querySelector('#view input[type=search]'), '');

window.location.hash = '#/dives';
window.dispatchEvent(new window.Event('hashchange'));
await tick(120);

window.location.hash = `#/dive/${dv.id}`;
window.dispatchEvent(new window.Event('hashchange'));
await tick(90);
const detail = view();
check('fiche : libellé du lieu conservé', detail.includes('Lac de Beaumont-sur-Oise'), '');
check('fiche : paliers', detail.includes('3 min à 3 m'), '');
check('fiche : coordonnées', detail.includes('49.14210'), '');
check('fiche : chef de palanquée marqué', detail.includes('Jean Moniteur ★'), '');
check('fiche : comptes-rendus', detail.includes('Remontée assistée') && detail.includes('Brochet'), '');
check('fiche : tampon affiché', !!document.querySelector('#view .stamp img'), '');

// --- Calendrier ---
window.location.hash = '#/dives';
window.dispatchEvent(new window.Event('hashchange'));
await tick(120);

const versCal = [...document.querySelectorAll('#view .seg button')]
  .find(b => /Calendrier/.test(b.textContent));
check('bascule calendrier présente', !!versCal, '');
if (versCal) {
  versCal.click();
  await tick(150);
  // Les deux plongées sont sur deux mois différents : juillet n'en montre qu'une.
  const cases = document.querySelectorAll('#view .cal-case.a-plonge');
  check('calendrier : seul le jour plongé du mois est marqué', cases.length === 1, String(cases.length));
  check('calendrier : les autres jours ne sont pas cliquables',
    [...document.querySelectorAll('#view .cal-case:not(.vide)')].filter(c => !c.disabled).length === 1);
  check('calendrier : en-têtes de semaine',
    document.querySelectorAll('#view .cal-jour-nom').length === 7,
    String(document.querySelectorAll('#view .cal-jour-nom').length));
  const moisAffiche = document.querySelector('#view .mois')?.textContent || '';
  check('calendrier : ouvre sur la dernière plongée', /juillet 2026/i.test(moisAffiche), moisAffiche);
  cases[0]?.click();
  await tick(80);
  check('calendrier : le jour se déplie', view().includes('Lac de Beaumont-sur-Oise'), '');
}

window.location.hash = `#/dive/${dv.id}/edit`;
window.dispatchEvent(new window.Event('hashchange'));
await tick(120);
const inputs = document.querySelectorAll('#view input, #view select, #view textarea');
check('formulaire : nombre de champs', inputs.length > 25, String(inputs.length));

// Les sections facultatives sont repliées : on les déplie pour inspecter.
document.querySelectorAll('#view .section.repliable.replie .sec-entete')
        .forEach(b => b.click());
await tick(60);

check('formulaire : sections en entonnoir',
  [...document.querySelectorAll('#view .sec-titre')].map(x => x.textContent.trim())
    .join('|').includes('Lieu et environnement'),
  [...document.querySelectorAll('#view .sec-titre')].map(x => x.textContent.trim()).join('|'));

check('formulaire : plongeurs en lignes',
  document.querySelectorAll('#view .pl-ligne').length === 1,
  String(document.querySelectorAll('#view .pl-ligne').length));
check('formulaire : clubs en accordéon',
  document.querySelectorAll('#view .pl-club').length >= 1,
  String(document.querySelectorAll('#view .pl-club').length));
check('formulaire : le plongeur de la palanquée est coché',
  document.querySelectorAll('#view .pl-ligne.on').length === 1,
  String(document.querySelectorAll('#view .pl-ligne.on').length));
check('formulaire : colonne tampon présente',
  document.querySelectorAll('#view .pl-tampon').length === 1, '');
check('formulaire : section Bouteille',
  [...document.querySelectorAll('#view .sec-titre')].some(x => /Bouteille/.test(x.textContent)),
  '');
check('formulaire : gaz par défaut sur Air',
  [...document.querySelectorAll('#view .seg button.on')].some(b => b.textContent === 'Air'),
  [...document.querySelectorAll('#view .seg button.on')].map(b => b.textContent).join(','));
check('formulaire : chips objectifs cochées',
  [...document.querySelectorAll('#view .chip.on')].some(c => c.textContent === 'Épaves'), '');

// --- Export / import ---------------------------------------
const json = await store.exportAll();
await store.wipe();
check('wipe efface tout', (await store.listDives(d.id)).length === 0, '');
await store.importAll(json);
check('import restaure les plongées', (await store.listDives(d.id)).length === 2, '');
check('import restaure les compagnons', (await store.listBuddies()).length === 1, '');

console.log(results.join('\n'));
console.log('\nErreurs console :', errors.length ? errors : 'aucune');
const failed = results.filter(r => r.startsWith(' FAIL')).length;
console.log(failed ? `\n${failed} test(s) en échec` : '\nTous les tests passent.');
process.exit(failed ? 1 : 0);
