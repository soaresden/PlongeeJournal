// Test de fumée : charge l'app dans jsdom et parcourt tous les écrans.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
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
// Doublure de fetch. Elle refuse le carnet et l'API : c'est la situation
// d'un téléphone loin du PC, celle où le plus de choses peuvent casser.
globalThis.fetch = async (url) => {
  const u = String(url);
  if (/\/api\/|carnet\.json/.test(u)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => [] };
};
// Leaflet en doublure
const chain = () => new Proxy(() => {}, { get: () => chain(), apply: () => chain() });
globalThis.L = chain();
window.L = globalThis.L;
globalThis.structuredClone ??= v => JSON.parse(JSON.stringify(v));

const errors = [];
window.addEventListener('error', e => errors.push('window.error: ' + e.message));
process.on('unhandledRejection', r => errors.push('unhandled: ' + r));

const tick = (ms = 60) => new Promise(r => setTimeout(r, ms));

await import(__p2u(path.join(ROOT, 'js/app.js')).href);
await tick(150);

const view = () => document.getElementById('view').textContent.replace(/\s+/g, ' ').trim();
const title = () => document.getElementById('topTitle').textContent;
const results = [];
const check = (name, cond, extra = '') => {
  results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));
};

check('écran initial rendu', view().includes('Bienvenue'), view().slice(0, 80));
check('barre du haut : emplacement d’identité présent',
  !!document.getElementById('topIdent'), '');

// --- Créer un plongeur -------------------------------------
const { store, emptyDiver, emptyDive, emptyBuddy, guessWater } = await import(__p2u(path.join(ROOT, 'js/store.js')).href);

// --- Mode de stockage --------------------------------------
// Aucun dépôt GitHub configuré pendant les tests : l'app doit être en
// mode local, et le dire.
const { modeActuel } = await import(__p2u(path.join(ROOT, 'js/store-github.js')).href);
const etatSync = await import(__p2u(path.join(ROOT, 'js/sync.js')).href);
check('sans GitHub configuré, le carnet est en mode local',
  modeActuel() === 'local', modeActuel());
check('l’état est annoncé à l’interface',
  etatSync.status().state === 'local', etatSync.status().state);
check('la pastille d’état dit « Local »',
  document.querySelector('.etat-pill')?.textContent.includes('Local'), document.querySelector('.etat-pill')?.textContent);
check('le bandeau d’ouverture annonce le mode local',
  /Mode local/.test(document.getElementById('bandeau')?.textContent || ''), document.getElementById('bandeau')?.textContent);

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

// --- Une séance de fosse ------------------------------------
const { emptySeance } = await import(__p2u(path.join(ROOT, 'js/store.js')).href);
const sf = emptySeance(d.id, 'fosse', '2026-07-16');
Object.assign(sf, { heure: '20:00', dureeMin: 45, lieu: 'Fosse de Villeneuve', profMax: 20 });
await store.saveSeance(sf);
check('une séance ne compte pas comme plongée', (await store.stats(d.id)).count === 2);

// --- Parcours de tous les écrans ---------------------------
const routes = ['dives', `dive/${dv.id}`, `dive/${dv.id}/edit`, 'dive/new', 'seances', 'seance/new', `seance/${sf.id}`,
                'divers', `diver/${d.id}`, 'buddies', `buddy/${b.id}`, 'stats',
                'reglages', 'setup', 'suunto', 'montre', 'montre-aide', 'urgence', 'route/inexistante'];
for (const r of routes) {
  window.location.hash = '#/' + r;
  window.dispatchEvent(new window.Event('hashchange'));
  await tick(90);
  const txt = view();
  check(`route « ${r} » rend du contenu`, txt.length > 20 && !title().includes('Erreur'),
        title() + ' | ' + txt.slice(0, 100));
}

// --- Séances : compteurs, pointage, calendrier ---
window.location.hash = '#/seances';
window.dispatchEvent(new window.Event('hashchange'));
await tick(120);
check('séances : compteur de fosses', /1\s*fosse/.test(view()) || [...document.querySelectorAll('.seance-stat.s-fosse .n')].some(n => n.textContent.includes('1')), view().slice(0, 200));
check('séances : la fosse est listée', view().includes('Fosse de Villeneuve'), view().slice(0, 300));
check('séances : boutons pour pointer', [...document.querySelectorAll('.seances-ajout .btn')].length === 3);

window.location.hash = '#/seance/new?type=piscine&date=2026-07-20';
window.dispatchEvent(new window.Event('hashchange'));
await tick(120);
const formS = document.querySelector('#view form');
check('nouvelle séance : type et date repris du lien',
  formS?.querySelector('.seg button.on')?.textContent.includes('Piscine') && formS?.querySelector('input[type=date]')?.value === '2026-07-20',
  formS?.querySelector('.seg button.on')?.textContent);
formS.querySelector('input[list=seance-lieux]').value = 'Piscine de La Garenne';
formS.dispatchEvent(new window.Event('submit', { cancelable: true }));
await tick(150);
const apres = await store.listSeances(d.id);
check('nouvelle séance : enregistrée', apres.length === 2 && apres.some(s => s.type === 'piscine' && s.lieu === 'Piscine de La Garenne'), JSON.stringify(apres.map(s => s.type)));

localStorage.setItem('plongee-journal:vue-dives', 'calendrier');
localStorage.setItem('plongee-journal:cal-mode', 'mois');
window.location.hash = '#/dives';
window.dispatchEvent(new window.Event('hashchange'));
await tick(150);
const couches = [...document.querySelectorAll('.cal-couche input')];
check('agenda : cases Plongées / Fosse / Piscine / Apnée', couches.length === 4, String(couches.length));
const grilleCal = () => document.querySelector('.cal-carte');
check('agenda : séances masquées tant qu’on ne les coche pas', !grilleCal()?.querySelector('.j.s-fosse'));
couches[1].checked = true;
couches[1].dispatchEvent(new window.Event('change'));
await tick(60);
check('agenda : fosse cochée, son jour se colore', !!grilleCal()?.querySelector('.j.s-fosse'), grilleCal()?.innerHTML.slice(0, 200));
grilleCal().querySelector('.j.s-fosse').click();
await tick(30);
check('agenda : le jour montre la fosse et propose de pointer', /Fosse de Villeneuve/.test(view()) && /＋ 🏊 Piscine/.test(view()), view().slice(-300));
couches[1].checked = false;
couches[1].dispatchEvent(new window.Event('change'));
localStorage.setItem('plongee-journal:vue-dives', 'liste');
localStorage.removeItem('plongee-journal:cal-mode');

// --- Import depuis la montre (Bluetooth) ---
window.location.hash = '#/suunto';
window.dispatchEvent(new window.Event('hashchange'));
await tick(90);
check('import : bouton « Importer depuis la montre (Bluetooth) »',
  !!window.document.querySelector('#btn-montre-ble'), view().slice(0, 150));
window.location.hash = '#/montre';
window.dispatchEvent(new window.Event('hashchange'));
await tick(120);
check('montre : sans Bluetooth, le navigateur est signalé', /ne gère pas le Bluetooth/.test(view()), view().slice(0, 200));
check('montre : journal de diagnostic présent', /Journal Bluetooth/.test(view()), view().slice(0, 200));
window.location.hash = '#/montre-aide';
window.dispatchEvent(new window.Event('hashchange'));
await tick(90);
check('montre : mode d’emploi de l’appairage', /appairage/i.test(view()) && /Ne désappaire surtout rien/.test(view()), view().slice(0, 200));

// --- Contrôles de contenu ----------------------------------
window.location.hash = '#/dives';
window.dispatchEvent(new window.Event('hashchange'));
await tick(90);
check('la liste affiche les deux lieux',
  view().includes('Lac de Beaumont-sur-Oise') && view().includes('Calanque de Sormiou'), view().slice(0, 150));
check('la liste affiche le compagnon', view().includes('Jean Moniteur'), '');

// --- Réglages : l'état du carnet, en clair ---
window.location.hash = '#/reglages';
window.dispatchEvent(new window.Event('hashchange'));
await tick(150);
check('réglages : l’état du stockage est expliqué',
  /Mode local/.test(view()), view().slice(0, 120));
check('réglages : le branchement GitHub est proposé',
  /Dépôt GitHub privé/.test(view()) && /Jeton d’accès/.test(view()), '');
check('réglages : les thèmes sont proposés',
  /Cousteau/.test(view()) && /Abysse/.test(view()) && /Eau turquoise/.test(view()), '');
check('réglages : sauvegarde manuelle proposée',
  /Exporter le carnet/.test(view()), '');

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
check('fiche : Modifier, En séance et Supprimer présents',
  ['Modifier', 'En séance', 'Supprimer'].every(t => [...blocs[iActions].querySelectorAll('.btn')].some(b => b.textContent.includes(t))),
  [...blocs[iActions].querySelectorAll('.btn')].map(b => b.textContent).join(' | '));

// --- Identité dans la barre du haut ---
window.location.hash = '#/dives';
window.dispatchEvent(new window.Event('hashchange'));
await tick(150);

const ident = document.getElementById('topIdent');
check('barre du haut : le nom du plongeur y est affiché',
  !ident.hidden && ident.querySelector('.ident-nom')?.textContent === 'Denis Testeur',
  ident.querySelector('.ident-nom')?.textContent);
check('barre du haut : le compte et la dernière date suivent',
  /^2 plongées · /.test(ident.querySelector('.ident-sous')?.textContent || ''),
  ident.querySelector('.ident-sous')?.textContent);
check('liste : la carte d’identité ne double plus la barre du haut',
  !view().includes('Dernière plongée le'), view().slice(0, 60));

// --- Calendrier ---

const versCal = [...document.querySelectorAll('#view .seg button')]
  .find(b => /Agenda/.test(b.textContent));
check('bascule agenda présente', !!versCal, '');
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
  check('cal/tout : douze lignes de mois',
    document.querySelectorAll('#view .an12 .an12-mois').length === 12,
    String(document.querySelectorAll('#view .an12 .an12-mois').length));
  check('cal/tout : 31 colonnes de jours',
    document.querySelectorAll('#view .an12 .an12-num').length === 31,
    String(document.querySelectorAll('#view .an12 .an12-num').length));
  check('cal/tout : la grille annonce son orientation',
    /\bsens-[hv]\b/.test(document.querySelector('#view .an12')?.className || ''),
    document.querySelector('#view .an12')?.className);
  check('cal/tout : le sélecteur d’échelle est en tête, hors des colonnes',
    !!document.querySelector('#view .cal-tete .seg')
      && !document.querySelector('#view .cal-wrap .cal-tete'), '');
  check('cal/tout : la grille et le panneau se partagent la largeur',
    !!document.querySelector('#view .cal-wrap > .cal-carte .an12')
      && !!document.querySelector('#view .cal-wrap > .cal-panneau'), '');
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
  check('cal/mois : le nombre de semaines est connu de la mesure',
    Number(document.querySelector('#view .mois-grille')?.dataset.lignes) === 5,
    document.querySelector('#view .mois-grille')?.dataset.lignes);
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
    carres('#view .mois-grille .j.grand').filter(c => !c.classList.contains('n0')).length === 1,
    String(carres('#view .mois-grille .j.grand').filter(c => !c.classList.contains('n0')).length));
  check('cal/mois : chaque jour se touche (pour pointer une séance)',
    carres('#view .mois-grille .j.grand').every(c => !c.disabled));
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
  check('cal/période : les bornes tiennent sur une ligne',
    document.querySelectorAll('#view .cal-paire').length === 1
      && document.querySelectorAll('#view .cal-champs .field').length === 0,
    String(document.querySelectorAll('#view .cal-paire').length));
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

// --- Le calendrier tient-il à l'écran, dans les deux directions ? ---
// jsdom ne calcule pas les mises en page : on teste la géométrie comme une
// fonction pure, et on vérifie que la feuille de style s'y raccroche.
{
  const { GEO, coteDansLeSens, meilleurSens } =
    await import(__p2u(path.join(ROOT, 'js/views/calendar.js')).href);
  const { gouttiere: G, regle: R, gap: g } = GEO;

  // Un sens ne doit jamais déborder, ni en largeur ni en hauteur.
  const tient = (sens, L, H) => {
    const c = coteDansLeSens(sens, L, H);
    const [cols, lignes] = sens === 'v' ? [12, 31] : [31, 12];
    return (G + cols * c + cols * g <= L && R + lignes * c + lignes * g <= H)
      || c === GEO.minCote;
  };
  const ecrans = [[320, 480], [375, 620], [420, 300], [523, 560],
                  [311, 534], [900, 700], [1400, 400]];
  check('cal : aucun débordement, sens horizontal',
    ecrans.every(([L, H]) => tient('h', L, H)), '');
  check('cal : aucun débordement, sens vertical',
    ecrans.every(([L, H]) => tient('v', L, H)), '');

  check('cal : on retient toujours le sens qui donne le plus gros carré',
    ecrans.every(([L, H]) => {
      const m = meilleurSens(L, H);
      return m.cote === Math.max(coteDansLeSens('h', L, H), coteDansLeSens('v', L, H))
        && m.cote === coteDansLeSens(m.sens, L, H);
    }), '');

  // Téléphone en portrait, commandes empilées : la transposée gagne.
  check('cal : en portrait large et bas, les mois passent en lignes',
    meilleurSens(360, 300).sens === 'h', JSON.stringify(meilleurSens(360, 300)));
  // Colonne étroite et haute (commandes à droite) : l'inverse.
  check('cal : en colonne étroite et haute, les mois passent en colonnes',
    meilleurSens(311, 534).sens === 'v', JSON.stringify(meilleurSens(311, 534)));
  check('cal : le panneau latéral fait grossir les carrés',
    meilleurSens(311, 534).cote > meilleurSens(523, 200).cote,
    `${meilleurSens(311, 534).cote} vs ${meilleurSens(523, 200).cote}`);

  const css = fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8');
  check('cal : les deux orientations sont stylées',
    /\.an12\.sens-h\s*\{[^}]*repeat\(31,\s*var\(--cell/.test(css)
      && /\.an12\.sens-v\s*\{[^}]*repeat\(12,\s*var\(--cell/.test(css), '');
  check('cal : les lignes suivent le côté du carré',
    /grid-auto-rows:\s*var\(--cell/.test(css), '');
  check('cal : la vue mois est dimensionnée elle aussi',
    /\.mois-grille\s*\{[^}]*repeat\(7,\s*var\(--cellm/.test(css)
      && /\.j\.grand\s*\{[^}]*var\(--cellm/.test(css), '');
  check('cal : la vue mois mesure la place restante',
    /ajusterMois/.test(fs.readFileSync(path.join(ROOT, 'js/views/calendar.js'), 'utf8')), '');
  const declH = /\.an12\.sens-h\s*\{([^}]*)\}/.exec(css)?.[1] || '';
  check('cal : la gouttière du CSS est celle du calcul',
    declH.includes(`${G}px`), `${G} / ${declH.trim()}`);
  check('cal : les commandes passent à droite dès qu’il y a la place',
    /@media \(min-width: 560px\)[\s\S]{0,400}\.cal-panneau\s*\{[^}]*flex:/.test(css), '');

  const src = fs.readFileSync(path.join(ROOT, 'js/views/calendar.js'), 'utf8');
  check('cal : la largeur utile est mesurée',
    /scene\.clientWidth/.test(src), '');
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
