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
                'setup', 'verrou', 'login', 'motdepasse', 'suunto', 'suunto?ok=1', 'urgence',
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

// --- Assistant d'installation : un écran par étape ---
window.location.hash = '#/setup';
window.dispatchEvent(new window.Event('hashchange'));
await tick(150);
check('installation : barre de progression à 3 étapes',
  document.querySelectorAll('#view .wiz-etape').length === 3,
  String(document.querySelectorAll('#view .wiz-etape').length));
check('installation : une seule étape affichée',
  document.querySelectorAll('#view .wiz-titre').length === 1,
  String(document.querySelectorAll('#view .wiz-titre').length));
check('installation : étapes non atteintes verrouillées',
  document.querySelectorAll('#view .wiz-puce[disabled]').length === 2,
  String(document.querySelectorAll('#view .wiz-puce[disabled]').length));
check('installation : commence à l’étape 1',
  document.querySelector('#view .wiz-puce.active')?.textContent === '1',
  document.querySelector('#view .wiz-puce.active')?.textContent);

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

// Les actions se lisent en haut de fiche, pas au bout d'un long défilement.
const racine = document.querySelector('#view').firstElementChild;
const blocs = [...racine.children];
const iActions = blocs.findIndex(c => c.classList.contains('actions-fiche'));
check('fiche : actions en tête', iActions === 1, `position ${iActions}`);
check('fiche : Modifier et Supprimer présents',
  [...blocs[iActions].querySelectorAll('.btn')].length === 2,
  String(blocs[iActions]?.querySelectorAll('.btn').length));

// --- Calendrier ---
window.location.hash = '#/dives';
window.dispatchEvent(new window.Event('hashchange'));
await tick(120);

const versCal = [...document.querySelectorAll('#view .seg button')]
  .find(b => /Calendrier/.test(b.textContent));
check('bascule calendrier présente', !!versCal, '');
if (versCal) {
  localStorage.removeItem('plongee-journal:cal-mode');
  versCal.click();
  await tick(200);

  const carres = sel => [...document.querySelectorAll(sel)];
  const chaudsDe = sel => carres(sel).filter(c => /\bn[1-4]\b/.test(c.className));

  // --- Vue « tout » : la grille murale, 12 colonnes × 31 lignes ---
  check('cal/tout : une grille par année',
    document.querySelectorAll('#view .an12').length === 1,
    String(document.querySelectorAll('#view .an12').length));
  check('cal/tout : douze en-têtes de mois',
    document.querySelectorAll('#view .an12 .an12-mois').length === 12,
    String(document.querySelectorAll('#view .an12 .an12-mois').length));
  check('cal/tout : 31 lignes de jours',
    document.querySelectorAll('#view .an12 .an12-num').length === 31,
    String(document.querySelectorAll('#view .an12 .an12-num').length));
  check('cal/tout : 12 × 31 cases',
    document.querySelectorAll('#view .an12 .j').length === 372,
    String(document.querySelectorAll('#view .an12 .j').length));

  // 2026 : 7 jours inexistants (février 29/30/31, et les 31 des mois courts).
  check('cal/tout : les jours qui n’existent pas sont vides',
    document.querySelectorAll('#view .an12 .j.vide').length === 7,
    String(document.querySelectorAll('#view .an12 .j.vide').length));
  check('cal/tout : les week-ends sont marqués',
    document.querySelectorAll('#view .an12 .j.we').length === 104,
    String(document.querySelectorAll('#view .an12 .j.we').length));

  check('cal/tout : étiquette et compteur de l’année',
    document.querySelector('#view .an12-an')?.textContent === '2026'
      && /2 plongées/.test(document.querySelector('#view .an12-n')?.textContent || ''),
    document.querySelector('#view .an12-n')?.textContent);

  check('cal/tout : deux jours colorés', chaudsDe('#view .an12 .j').length === 2,
    String(chaudsDe('#view .an12 .j').length));
  check('cal/tout : les autres jours ne sont pas cliquables',
    carres('#view .an12 button.j').filter(c => !c.disabled).length === 2,
    String(carres('#view .an12 button.j').filter(c => !c.disabled).length));

  chaudsDe('#view .an12 .j').pop()?.click();
  await tick(100);
  check('cal/tout : le jour se déplie', view().includes('Lac de Beaumont-sur-Oise'), '');

  // --- Filtre par compagnon ---
  const entete = document.querySelector('#view .filtre-entete');
  check('cal : filtre par compagnon proposé', !!entete, '');
  entete?.click();
  await tick(40);
  const chipJean = [...document.querySelectorAll('#view .filtre-card .chip')]
    .find(c => /Jean/.test(c.textContent));
  check('cal : le compagnon apparaît avec son compte',
    /Jean Moniteur · 1/.test(chipJean?.textContent || ''), chipJean?.textContent);
  chipJean?.click();
  await tick(120);
  check('cal : le filtre ne garde que la plongée partagée',
    chaudsDe('#view .an12 .j').length === 1, String(chaudsDe('#view .an12 .j').length));
  chipJean?.click();
  await tick(120);

  const onglet = nom => [...document.querySelectorAll('#view .seg button')]
    .find(b => b.textContent.trim() === nom);

  // --- Vue « année » ---
  onglet('Année')?.click();
  await tick(150);
  check('cal/année : une seule grille', document.querySelectorAll('#view .an12').length === 1, '');
  check('cal/année : sélecteur sur la dernière année',
    document.querySelector('#view .cal-nav select')?.value === '2026',
    document.querySelector('#view .cal-nav select')?.value);

  // --- Vue « mois » ---
  onglet('Mois')?.click();
  await tick(150);
  check('cal/mois : grille mensuelle', !!document.querySelector('#view .mois-grille'), '');
  check('cal/mois : les sept jours de la semaine',
    document.querySelectorAll('#view .mois-jour-nom').length === 7,
    String(document.querySelectorAll('#view .mois-jour-nom').length));
  const selects = document.querySelectorAll('#view .cal-nav select');
  check('cal/mois : ouvre sur le mois de la dernière plongée',
    selects[0]?.value === '6' && selects[1]?.value === '2026',
    `${selects[0]?.value}/${selects[1]?.value}`);
  check('cal/mois : juillet fait 31 jours',
    document.querySelectorAll('#view .mois-grille .j.grand').length === 31,
    String(document.querySelectorAll('#view .mois-grille .j.grand').length));
  check('cal/mois : une seule journée plongée en juillet',
    carres('#view .mois-grille .j.grand').filter(c => !c.disabled).length === 1,
    String(carres('#view .mois-grille .j.grand').filter(c => !c.disabled).length));
  document.querySelector('#view .cal-nav .btn')?.click();
  await tick(120);
  check('cal/mois : navigation vers juin',
    document.querySelectorAll('#view .cal-nav select')[0]?.value === '5',
    document.querySelectorAll('#view .cal-nav select')[0]?.value);

  // --- Vue « période » ---
  onglet('Période')?.click();
  await tick(150);
  const bornes = document.querySelectorAll('#view input[type=date]');
  check('cal/période : deux bornes de date', bornes.length === 2, String(bornes.length));
  check('cal/période : bornes pré-remplies sur tout le carnet',
    bornes[0]?.value === '2026-06-02' && bornes[1]?.value === '2026-07-14',
    `${bornes[0]?.value} → ${bornes[1]?.value}`);
  check('cal/période : même grille murale', !!document.querySelector('#view .an12'), '');

  bornes[0].value = '2026-07-01';
  bornes[0].dispatchEvent(new window.Event('change'));
  await tick(120);
  check('cal/période : hors bornes grisé, pas masqué',
    document.querySelectorAll('#view .an12 .j.hors').length === 351,
    String(document.querySelectorAll('#view .an12 .j.hors').length));
  check('cal/période : une seule plongée dans la fenêtre',
    chaudsDe('#view .an12 .j').length === 1, String(chaudsDe('#view .an12 .j').length));

  const parNumeros = onglet('Par numéros');
  check('cal/période : bascule par numéros', !!parNumeros, '');
  parNumeros?.click();
  await tick(150);
  check('cal/période : les numéros remplacent les dates',
    document.querySelectorAll('#view input[type=date]').length === 0
      && document.querySelectorAll('#view input[inputmode=numeric]').length === 2,
    String(document.querySelectorAll('#view input[inputmode=numeric]').length));
  check('cal/période : les numéros couvrent tout le carnet',
    chaudsDe('#view .an12 .j').length === 2, String(chaudsDe('#view .an12 .j').length));
}

// --- Le calendrier tient-il dans la hauteur qu'on lui donne ? ---
// jsdom ne calcule pas les mises en page : on vérifie l'arithmétique de la
// feuille de style, qui est ce qui garantit l'absence de scroll.
{
  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
  const cell = /--cell:\s*calc\(\(var\(--hpx[^)]*\)\s*-\s*(\d+)px\s*-\s*31\s*\*\s*var\(--gap\)\)\s*\/\s*31\)/.exec(css);
  const gap = /\.an12\s*\{[^}]*--gap:\s*([\d.]+)px/.exec(css);
  check('cal : le côté du carré se déduit de la hauteur', !!cell && !!gap,
    `${!!cell}/${!!gap}`);

  if (cell && gap) {
    const entete = Number(cell[1]), g = Number(gap[1]);
    // Pour n'importe quelle hauteur allouée, en-tête + 31 carrés + 31
    // gouttières doit retomber exactement sur cette hauteur.
    const rendu = h => entete + 31 * ((h - entete - 31 * g) / 31) + 31 * g;
    check('cal : la grille retombe pile sur la hauteur allouée',
      [180, 260, 420, 700].every(h => Math.abs(rendu(h) - h) < 0.001), '');
  }

  const src = fs.readFileSync(path.join(ROOT, 'js/views/calendar.js'), 'utf8');
  check('cal : la hauteur est mesurée, pas exprimée en svh',
    /getBoundingClientRect/.test(src) && !/\d+svh/.test(src), '');
  check('cal : la barre d’onglets est déduite de la place utile',
    /getElementById\('tabbar'\)/.test(src), '');
  check('cal : la grille se recalcule au redimensionnement',
    /addEventListener\('resize'/.test(src) && /orientationchange/.test(src), '');
}

// --- Carte des plongées ---
const versCarte = [...document.querySelectorAll('#view .seg button')]
  .find(b => /Carte/.test(b.textContent));
check('bascule carte présente', !!versCarte, '');
if (versCarte) {
  versCarte.click();
  await tick(220);
  check('carte : conteneur rendu', !!document.querySelector('#view .carte-plein'), '');
  check('carte : les deux lieux comptés',
    /2 lieux · 2 plongée/.test(view()), view().slice(0, 160));
  check('carte : filtre par compagnon aussi disponible',
    !!document.querySelector('#view .filtre-entete'), '');
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
