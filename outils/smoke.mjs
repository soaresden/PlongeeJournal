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
let fausseRelease = null;   // { installee, publiee } : simule l'APK et GitHub
globalThis.fetch = async (url) => {
  const u = String(url);
  if (fausseRelease && u.endsWith('version.json')) {
    return { ok: true, status: 200, json: async () => ({ build: fausseRelease.installee,
      version: `2.0.${fausseRelease.installee}`, commit: 'def5678', date: '2026-10-20T08:00:00Z' }) };
  }
  if (fausseRelease && u.includes('/releases/tags/android')) {
    return { ok: true, status: 200, json: async () => ({ name: `Carnet de plongée — APK 2.0.${fausseRelease.publiee}`,
      body: 'APK Android compilé depuis abc1234.', published_at: '2026-11-05T09:00:00Z',
      assets: [{ name: 'PlongeeJournal.apk', size: 4404019, updated_at: '2026-11-05T09:01:00Z',
        browser_download_url: 'https://github.com/soaresden/PlongeeJournal/releases/download/android/PlongeeJournal.apk' }] }) };
  }
  if (fausseRelease && u.includes('/compare/')) {
    return { ok: true, status: 200, json: async () => ({ commits: [{ commit: { message: 'Séances : fosse, piscine, apnée' } }] }) };
  }
  if (/\/api\/|carnet\.json/.test(u)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => [] };
};
// Leaflet en doublure
// (project et getZoom rendent de vrais nombres : la carte cumule les points à l'écran)
const chain = () => new Proxy(() => {}, {
  get: (_, k) => (k === 'project' ? ([lat, lng]) => ({ x: lng * 10, y: -lat * 10 }) : k === 'getZoom' ? () => 5 : chain()),
  apply: () => chain(),
});
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
  fait: 'Remontée assistée', vu: 'Brochet', observations: 'Eau claire',
});
await store.saveDive(dv);

const dv2 = emptyDive(d.id, await store.nextNumber(d.id));
Object.assign(dv2, { date: '2026-06-02', lieuNom: 'Calanque de Sormiou',
  lat: 43.2, lng: 5.41, eau: 'salee', heureImmersion: '23:40', dureeMin: 45,
  type: 'Exploration de nuit', profMax: 18 });
await store.saveDive(dv2);

check('numérotation auto : elle suit les dates (le 2 juin avant le 14 juillet)', dv2.numero === 1 && dv.numero === 2, `${dv.numero}/${dv2.numero}`);
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
const routes = ['suunto-cloud', 'dives', `dive/${dv.id}`, `dive/${dv.id}/edit`, 'dive/new', 'seances', 'seance/new', `seance/${sf.id}`,
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
check('séances : la fosse a son onglet, avec son compteur', /Fosses\s*1/.test(document.querySelector('#view .seg-discipline')?.textContent || ''),
  document.querySelector('#view .seg-discipline')?.textContent);
check('séances : ranger des plongées du carnet à la main (snorkeling)',
  [...document.querySelectorAll('#view button')].some(b => /Ranger des plongées du carnet/.test(b.textContent)), '');
check('séances : boutons pour pointer (piscine, apnée, snorkeling)', [...document.querySelectorAll('.seances-ajout .btn')].length === 3,
  String([...document.querySelectorAll('.seances-ajout .btn')].length));
[...document.querySelectorAll('#view .seg-discipline button')].find(b => /Fosses/.test(b.textContent))?.click();
await tick(120);
check('fosses : listées comme des plongées', view().includes('Fosse de Villeneuve') && !!document.querySelector('#view .dive-card .vignette'), view().slice(0, 300));
[...document.querySelectorAll('#view .seg-discipline button')].find(b => /Plongées/.test(b.textContent))?.click();
await tick(80);

window.location.hash = '#/seance/new?type=piscine&date=2026-07-20';
window.dispatchEvent(new window.Event('hashchange'));
await tick(120);
const formS = document.querySelector('#view form');
check('nouvelle séance : type et date repris du lien',
  formS?.querySelector('.seg button.on')?.textContent.includes('Piscine') && formS?.querySelector('input[type=date]')?.value === '2026-07-20',
  formS?.querySelector('.seg button.on')?.textContent);
check('nouvelle séance : « Avec qui » (comme une palanquée)',
  [...formS.querySelectorAll('.lbl')].some(x => /Avec qui/.test(x.textContent)) && !!formS.querySelector('.palq input'), '');
formS.querySelector('input[list=seance-lieux]').value = 'Piscine de La Garenne';
formS.dispatchEvent(new window.Event('submit', { cancelable: true }));
await tick(150);
const apres = await store.listSeances(d.id);
check('nouvelle séance : enregistrée', apres.length === 2 && apres.some(s => s.type === 'piscine' && s.lieu === 'Piscine de La Garenne'), JSON.stringify(apres.map(s => s.type)));

localStorage.setItem('plongee-journal:discipline', 'plongees');
localStorage.setItem('plongee-journal:vue-dives', 'calendrier');
localStorage.setItem('plongee-journal:cal-mode', 'mois');
window.location.hash = '#/dives';
window.dispatchEvent(new window.Event('hashchange'));
await tick(150);
const couches = [...document.querySelectorAll('.cal-couche input')];
check('agenda : cases Plongées / Fosse / Piscine / Apnée / Snorkeling', couches.length === 5, String(couches.length));
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
{
  check('thème : un bouton dans Réglages (plus de grille)', !!document.querySelector('#view .theme-bouton') && !document.querySelector('#view .themes'), '');
  check('thème : un bouton 🎨 dans la barre du haut', !!document.querySelector('#topActions .btn-theme'), '');
  document.querySelector('#topActions .btn-theme').click();
  await tick(80);
  const v = document.querySelector('.volet-theme');
  check('thème : le volet s’ouvre, tous les thèmes dedans', v?.classList.contains('ouvert') && v.querySelectorAll('.theme-choix').length >= 10, String(v?.querySelectorAll('.theme-choix').length));
  check('thème : sans voile sombre (la page reste visible)', !document.querySelector('.apercu-fond.ouvert'), '');
  const avant = document.documentElement.dataset.theme;
  const autre = [...v.querySelectorAll('.theme-choix')].find(b => !['auto', avant].includes(b.dataset.id));
  autre.click();
  check('thème : appliqué tout de suite, volet toujours ouvert', document.documentElement.dataset.theme === autre.dataset.id && v.classList.contains('ouvert')
    && autre.getAttribute('aria-pressed') === 'true', document.documentElement.dataset.theme);
  check('thème : retenu sur l’appareil', localStorage.getItem('plongee-journal:theme') === autre.dataset.id, '');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  check('thème : Échap ferme le volet', !v.classList.contains('ouvert'), '');
  v.querySelector(`[data-id="${avant}"]`)?.click();
  const { choisirTheme } = await import(__p2u(path.join(ROOT, 'js/theme.js')).href);
  choisirTheme(avant);
}
check('réglages : le branchement GitHub est proposé',
  /Dépôt GitHub privé/.test(view()) && /Jeton d’accès/.test(view()), '');
check('réglages : le thème en cours est affiché sur le bouton',
  /Thème : /.test(view()), '');
check('réglages : sauvegarde manuelle proposée',
  /Exporter le carnet/.test(view()), '');
check('réglages (site web) : pas de carte de mise à jour de l’APK',
  !/Dernière sur GitHub/.test(view()), '');

// --- Réglages dans l'APK : mise à jour depuis GitHub ---
window.Capacitor = { isNativePlatform: () => true };
fausseRelease = { installee: 40, publiee: 42 };
window.location.hash = '#/dives';
window.dispatchEvent(new window.Event('hashchange'));
await tick(80);
window.location.hash = '#/reglages';
window.dispatchEvent(new window.Event('hashchange'));
await tick(200);
const boutonMaj = () => document.querySelector('.carte-maj button');
check('APK : version installée et dernière sur GitHub affichées',
  /Installée\s*2\.0\.40/.test(view()) && /Dernière sur GitHub\s*2\.0\.42/.test(view()), view().slice(view().indexOf('Appli Android'), view().indexOf('Appli Android') + 160));
check('APK : bouton de téléchargement de la nouvelle version',
  /Télécharger la 2\.0\.42 \(4,2 Mo\)/.test(boutonMaj()?.textContent || '') && boutonMaj().classList.contains('primary'),
  boutonMaj()?.textContent);
check('APK : nouveautés listées', /Séances : fosse, piscine, apnée/.test(document.querySelector('.maj-nouveautes')?.textContent || ''), '');
let ouvert = null;
const clicOrigine = window.HTMLAnchorElement.prototype.click;
window.HTMLAnchorElement.prototype.click = function () { ouvert = this.href; };
boutonMaj().click();
window.HTMLAnchorElement.prototype.click = clicOrigine;
check('APK : le bouton ouvre l’APK de la release', /releases\/download\/android\/PlongeeJournal\.apk$/.test(ouvert || ''), ouvert);
fausseRelease = { installee: 42, publiee: 42 };
window.location.hash = '#/dives';
window.dispatchEvent(new window.Event('hashchange'));
await tick(80);
window.location.hash = '#/reglages';
window.dispatchEvent(new window.Event('hashchange'));
await tick(200);
check('APK : « dernière version » quand c’est à jour',
  /Tu as la dernière version/.test(view()) && /Vérifier à nouveau/.test(boutonMaj()?.textContent || ''), boutonMaj()?.textContent);
fausseRelease = null;

// --- Compte Suunto : réglages (site) puis récupération (APK) ---
delete window.Capacitor;
window.location.hash = '#/dives';
window.dispatchEvent(new window.Event('hashchange'));
await tick(80);
window.location.hash = '#/reglages';
window.dispatchEvent(new window.Event('hashchange'));
await tick(200);
check('réglages : carte Compte Suunto avec les trois clés',
  /Compte Suunto/.test(view()) && /Identifiant client/.test(view()) && /Secret client/.test(view()) && /Clé d’abonnement/.test(view()), '');
check('réglages : adresse de retour à déclarer affichée', /soaresden\.github\.io\/PlongeeJournal\//.test(view()), '');

const { fitPlongee, FitWriter } = await import(__p2u(path.join(ROOT, 'outils/fit-fabrique.mjs')).href);
const fitVide = () => { const w = new FitWriter(); w.def(0, 0, [[0, 1, 0]]); w.msg(0, [[1, 4]]); return w.fin(); };
const isoLocal = txt => new Date(txt).toISOString();
const ACTS = [
  { workoutKey: 'aaaaaaaaaaaaaaaaaaaaaaa1', activityId: 78, iso: isoLocal('2026-06-02T23:40:00'), fit: {} },               // = dv2
  { workoutKey: 'aaaaaaaaaaaaaaaaaaaaaaa2', activityId: 78, iso: isoLocal('2023-05-10T10:00:00'), fit: {} },               // ancienne
  { workoutKey: 'aaaaaaaaaaaaaaaaaaaaaaa3', activityId: 21, iso: isoLocal('2026-07-20T12:00:00'), fit: { sport: 5, sub: 17 } }, // natation
  { workoutKey: 'aaaaaaaaaaaaaaaaaaaaaaa4', activityId: 1, iso: isoLocal('2026-07-21T07:00:00'), fit: { sport: 1, sub: 0 } },  // course
  { workoutKey: 'aaaaaaaaaaaaaaaaaaaaaaa5', activityId: 90, iso: isoLocal('2025-08-12T10:00:00'), vide: true },               // snorkeling, .fit vide
];
let fitsDemandes = [];
window.Capacitor = { isNativePlatform: () => true, Plugins: { CapacitorHttp: { request: async ({ url, headers, responseType }) => {
  const u = new URL(url);
  if (headers['Ocp-Apim-Subscription-Key'] !== 'abo-smoke' || !/^Bearer /.test(headers.Authorization)) return { status: 401, data: 'refusé', headers: {} };
  if (u.pathname === '/v3/workouts') {
    const liste = Number(u.searchParams.get('offset')) > 0 || u.searchParams.get('until') ? [] : ACTS.map(a => ({ workoutKey: a.workoutKey, activityId: a.activityId,
      startTime: Date.parse(a.iso), totalTime: 2700 }));
    return { status: 200, data: JSON.stringify({ error: null, payload: liste }), headers: {} };
  }
  const k = /^\/v3\/workouts\/(\w+)\/fit$/.exec(u.pathname)?.[1];
  const a = ACTS.find(x => x.workoutKey === k);
  if (!a || responseType !== 'arraybuffer') return { status: 404, data: '', headers: {} };
  fitsDemandes.push(k);
  return { status: 200, data: Buffer.from(a.vide ? fitVide() : fitPlongee({ ...a.fit, debutIso: a.iso })).toString('base64'), headers: {} };
} } } };
window.localStorage.setItem('plongee-journal:suunto', JSON.stringify({ version: 1, clientId: 'id-smoke', clientSecret: 'secret-smoke',
  cleAbonnement: 'abo-smoke', redirectUri: 'https://soaresden.github.io/PlongeeJournal/', compte: 'denis.smoke',
  jeton: { acces: 'x.eyJ1c2VyIjoiZGVuaXMifQ.y', refresh: 'R', expire: Date.now() + 864e5 }, types: {}, majLe: new Date().toISOString() }));
window.location.hash = '#/dives';
window.dispatchEvent(new window.Event('hashchange'));
await tick(80);
window.location.hash = '#/reglages';
window.dispatchEvent(new window.Event('hashchange'));
await tick(200);
check('réglages APK : compte relié affiché, sans action d’import', /Relié · denis\.smoke/.test(view()) && !/Récupérer mes activités/.test(view()), '');
window.location.hash = '#/suunto';
window.dispatchEvent(new window.Event('hashchange'));
await tick(150);
check('import : bouton « Récupérer depuis mon compte Suunto »', !!document.getElementById('btn-suunto-cloud'), '');
document.getElementById('btn-suunto-cloud').click();
await tick(200);
const bouton = txt => [...document.querySelectorAll('#view button')].find(x => txt.test(x.textContent));
bouton(/Chercher mes activités/).click();
await tick(500);
check('Suunto : 5 activités, la course ignorée', /5 activités sur ton compte/.test(view()) && /1 autre sport ignoré/.test(view()),
  view().slice(view().indexOf('activité(s) sur'), view().indexOf('activité(s) sur') + 160));
check('Suunto : plongée et natation reconnues sans .fit, la course en un seul', fitsDemandes.length === 1, fitsDemandes.join(','));
bouton(/Analyser/).click();
await tick(500);
check('Suunto : par défaut, seulement ce qui manque (la plongée du 2 juin n’est pas touchée)',
  /Appliquer : 1 plongée \+ 2 séances$/.test(bouton(/Appliquer/)?.textContent || '') && /1 déjà au carnet/.test(view()) && /Déjà au carnet · 1/.test(view()),
  bouton(/Appliquer/)?.textContent);
const caseCompleter = [...document.querySelectorAll('#view label')].find(l => /Compléter aussi celles déjà au carnet/.test(l.textContent))?.querySelector('input');
caseCompleter.checked = true;
caseCompleter.dispatchEvent(new window.Event('change'));
await tick(50);
bouton(/Analyser/).click();
await tick(500);
const dv2Avant = structuredClone(await store.getDive(dv2.id));
const btnAppliquer = bouton(/Appliquer/);
check('Suunto : proposition 1 plongée + 2 séances + 1 à compléter',
  /1 plongée \+ 2 séances \+ 1 à compléter/.test(btnAppliquer?.textContent || ''), btnAppliquer?.textContent);
check('Suunto : la plongée du 2 juin sera complétée (bloc, profil)', /↻ n°1 : profil.*pression du bloc/.test(view()),
  view().slice(view().indexOf('↻'), view().indexOf('↻') + 200));
check('Suunto : plus de case « renuméroter » (c’est automatique)', !/Renuméroter le carnet/.test(view()), '');
btnAppliquer.click();
await tick(500);
const apresSuunto = await store.listDives(d.id);
const dv2Apres = apresSuunto.find(x => x.id === dv2.id);
check('Suunto : plongée ajoutée au carnet', apresSuunto.length === 3 && apresSuunto.some(x => x.suunto?.source === 'suunto-cloud' && x.date === '2023-05-10'),
  apresSuunto.map(x => `${x.numero}:${x.date}`).join(' '));
check('Suunto : plongée existante complétée sans écraser', dv2Apres.pressionDepart === 200 && dv2Apres.samples?.length > 50
  && dv2Apres.profMax === 18 && dv2Apres.lat === 43.2 && dv2Apres.suuntoKeys.includes('suunto:aaaaaaaaaaaaaaaaaaaaaaa1'), JSON.stringify({ p: dv2Apres.pressionDepart, prof: dv2Apres.profMax, lat: dv2Apres.lat }));
check('Suunto : natation rangée en séance piscine', (await store.listSeances(d.id)).some(x => x.type === 'piscine' && x.source === 'suunto-cloud'), '');
check('Suunto : .fit vide → séance faite depuis la liste (snorkeling, date, durée)',
  (await store.listSeances(d.id)).some(x => x.type === 'snorkeling' && x.date === '2025-08-12' && x.heure === '10:00' && x.dureeMin === 45),
  JSON.stringify((await store.listSeances(d.id)).filter(x => x.source === 'suunto-cloud').map(x => [x.type, x.date, x.heure, x.dureeMin])));
check('Suunto : les numéros suivent les dates (2023 devient la n°1)', apresSuunto.find(x => x.date === '2023-05-10').numero === 1
  && [...apresSuunto].sort((a, b) => a.numero - b.numero).every((x, i, t) => !i || t[i - 1].date <= x.date),
  apresSuunto.map(x => `${x.numero}:${x.date}`).join(' '));
// On remet le carnet comme avant pour la suite des vérifications.
for (const x of apresSuunto.filter(x => x.suunto?.source === 'suunto-cloud')) await store.deleteDive(x.id);
for (const x of (await store.listSeances(d.id)).filter(x => x.source === 'suunto-cloud')) await store.deleteSeance(x.id);
await store.saveDive(dv2Avant);
delete window.Capacitor;
window.localStorage.removeItem('plongee-journal:suunto');

// --- Écran Plongeurs : vignettes, pas des lignes ---
window.location.hash = '#/buddies';
window.dispatchEvent(new window.Event('hashchange'));
await tick(120);
check('Plongeurs : titre', title().includes('Plongeurs'), title());
check('Plongeurs : une carte par plongeur, tous mélangés',
  document.querySelectorAll('#view .pgrille .pcarte').length === 1,
  String(document.querySelectorAll('#view .pgrille .pcarte').length));
check('Plongeurs : plus de lignes pleine largeur',
  document.querySelectorAll('#view .card.clickable').length === 0,
  String(document.querySelectorAll('#view .card.clickable').length));
check('Plongeurs : filtres par catégorie (Tous, Moniteurs…)',
  document.querySelectorAll('#view .cat-filtres .cat-filtre').length >= 1, '');
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
check('fiche : plus de tampon (la page du carnet suffit)', !document.querySelector('#view .stamp'), '');

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
  !ident.hidden && ident.querySelector('.ident-long')?.textContent === 'Denis Testeur' && ident.querySelector('.ident-court')?.textContent === 'Denis',
  ident.querySelector('.ident-long')?.textContent);
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

  // --- Vue « tout » sur une seule année : douze petits mois ---
  check('cal/tout : une année = un calendrier de douze mois',
    document.querySelectorAll('#view .an-mois').length === 1 && !document.querySelector('#view .an12'),
    String(document.querySelectorAll('#view .an-mois').length));
  check('cal/tout : douze mois',
    document.querySelectorAll('#view .an-mois .mm').length === 12,
    String(document.querySelectorAll('#view .an-mois .mm').length));
  check('cal/tout : les jours de la semaine en tête de chaque mois',
    document.querySelectorAll('#view .an-mois .mm-jn').length === 84,
    String(document.querySelectorAll('#view .an-mois .mm-jn').length));
  check('cal/tout : le sélecteur d’échelle est en tête, hors des colonnes',
    !!document.querySelector('#view .cal-tete .seg')
      && !document.querySelector('#view .cal-wrap .cal-tete'), '');
  check('cal/tout : la grille et le panneau se partagent la largeur',
    !!document.querySelector('#view .cal-wrap > .cal-carte .an-mois')
      && !!document.querySelector('#view .cal-wrap > .cal-panneau'), '');
  check('cal/tout : 365 jours, pas un de plus',
    document.querySelectorAll('#view .an-mois .j').length === 365,
    String(document.querySelectorAll('#view .an-mois .j').length));
  check('cal/tout : les week-ends sont marqués',
    document.querySelectorAll('#view .an-mois .j.we').length === 104,
    String(document.querySelectorAll('#view .an-mois .j.we').length));

  check('cal/tout : étiquette et compteur de l’année',
    document.querySelector('#view .an12-an')?.textContent === '2026'
      && /2 plongées/.test(document.querySelector('#view .an12-n')?.textContent || ''),
    document.querySelector('#view .an12-n')?.textContent);

  check('cal/tout : deux jours colorés', chaudsDe('#view .an-mois .j').length === 2,
    String(chaudsDe('#view .an-mois .j').length));
  check('cal/tout : les autres jours ne sont pas cliquables',
    carres('#view .an-mois button.j').filter(c => !c.disabled).length === 2,
    String(carres('#view .an-mois button.j').filter(c => !c.disabled).length));

  chaudsDe('#view .an-mois .j').pop()?.click();
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
    chaudsDe('#view .an-mois .j').length === 1, String(chaudsDe('#view .an-mois .j').length));
  chipJean?.click();
  await tick(120);

  const onglet = nom => [...document.querySelectorAll('#view .seg button')]
    .find(b => b.textContent.trim() === nom);

  // --- Vue « année » ---
  onglet('Année')?.click();
  await tick(150);
  check('cal/année : un seul calendrier', document.querySelectorAll('#view .an-mois').length === 1, '');
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
  check('cal/période : même calendrier', !!document.querySelector('#view .an-mois'), '');

  bornes[0].value = '2026-07-01';
  bornes[0].dispatchEvent(new window.Event('change'));
  await tick(120);
  check('cal/période : hors bornes grisé, pas masqué',
    document.querySelectorAll('#view .an-mois .j.hors').length === 351,
    String(document.querySelectorAll('#view .an-mois .j.hors').length));
  check('cal/période : une seule plongée dans la fenêtre',
    chaudsDe('#view .an-mois .j').length === 1, String(chaudsDe('#view .an-mois .j').length));

  const parNumeros = onglet('Par numéros');
  check('cal/période : bascule par numéros', !!parNumeros, '');
  parNumeros?.click();
  await tick(150);
  check('cal/période : les numéros remplacent les dates',
    document.querySelectorAll('#view input[type=date]').length === 0
      && document.querySelectorAll('#view input[inputmode=numeric]').length === 2,
    String(document.querySelectorAll('#view input[inputmode=numeric]').length));
  check('cal/période : les numéros couvrent tout le carnet',
    chaudsDe('#view .an-mois .j').length === 2, String(chaudsDe('#view .an-mois .j').length));
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
  // Sur tablette la barre d'onglets devient un rail à gauche (haut = 0) :
  // la prendre pour le bas de l'écran réduisait la grille à 4 px.
  check('cal : un rail à gauche n’est pas pris pour le bas de l’écran',
    /innerHeight\s*\/\s*2/.test(src), '');
  check('cal : en tablette portrait, les commandes passent au-dessus',
    /@media \(min-width: 600px\) and \(orientation: portrait\)[\s\S]{0,300}\.cal-panneau\s*\{\s*display:\s*contents/.test(css), '');
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

check('formulaire : la palanquée se tape (champ + puces)',
  !!document.querySelector('#view .palq .palq-saisie input[type=text]'), '');
check('formulaire : le plongeur de la palanquée est en puce',
  document.querySelectorAll('#view .palq-puce').length === 1,
  String(document.querySelectorAll('#view .palq-puce').length));
{
  const champ = document.querySelector('#view .palq-saisie input[type=text]');
  champ.value = 'zzz';
  champ.dispatchEvent(new window.Event('input'));
  check('formulaire : un nom inconnu propose de l’ajouter',
    [...document.querySelectorAll('#view .palq-prop.nouveau')].some(b => b.textContent.includes('zzz')), '');
  champ.value = '';
  champ.dispatchEvent(new window.Event('input'));
}
check('formulaire : moniteur sans nom proposé',
  !!document.querySelector('#view .palq-prop.anonyme'), '');
check('formulaire : centre de plongée',
  [...document.querySelectorAll('#view label, #view .lbl')].some(x => /Centre de plongée/.test(x.textContent)), '');
check('formulaire : le centre, un seul champ (plus d’« Adresse du centre »)',
  document.querySelectorAll('#view .centre-champ input').length === 1
  && ![...document.querySelectorAll('#view label, #view .lbl')].some(x => /Adresse du centre/.test(x.textContent)), '');
check('formulaire : le centre se cherche aussi sur la carte',
  [...document.querySelectorAll('#view .centre-champ button')].some(b => /Sur la carte/.test(b.textContent)), '');
check('formulaire : plus de menu « Moniteur » en double sous la palanquée',
  ![...document.querySelectorAll('#view .lbl')].some(x => /^(Moniteur|Guide de palanquée)$/.test(x.textContent.trim())), '');
check('formulaire : plus de tampon', !document.querySelector('#view .stamp-grid'), '');
check('formulaire : « Snorkeling, fosse… » pour ranger une plongée en séance',
  [...document.querySelectorAll('#view .actions-fiche button')].some(b => /Snorkeling/.test(b.textContent)), '');
check('formulaire : numéro automatique, non saisi', !!document.querySelector('#view input.lecture-seule'), '');
{
  const lireTxt = [...document.querySelectorAll('#view button')].find(b => /Retrouver les plongeurs/.test(b.textContent));
  check('formulaire : retrouver les plongeurs dans un texte', !!lireTxt, '');
  lireTxt?.click();
  await tick(60);
  const zone = document.querySelector('#modalRoot textarea');
  if (zone) { zone.value = 'plongé avec jean et Paul Martin, froid'; zone.dispatchEvent(new window.Event('input')); }
  await tick(400);
  const puces = [...document.querySelectorAll('#modalRoot .noms-trouves .chip')].map(c => c.textContent);
  check('… un nouveau nom proposé après « avec », pas celui déjà dans la palanquée',
    puces.some(t => /Paul Martin/.test(t)) && !puces.some(t => /Jean/.test(t)), puces.join(' | '));
  document.querySelector('#modalRoot').innerHTML = '';
}
check('formulaire : section Bouteille',
  [...document.querySelectorAll('#view .sec-titre')].some(x => /Bouteille/.test(x.textContent)),
  '');
check('formulaire : gaz par défaut sur Air',
  [...document.querySelectorAll('#view .seg button.on')].some(b => b.textContent === 'Air'),
  [...document.querySelectorAll('#view .seg button.on')].map(b => b.textContent).join(','));
check('formulaire : chips objectifs cochées',
  [...document.querySelectorAll('#view .chip.on')].some(c => c.textContent === 'Épaves'), '');

// --- Page du carnet papier ---------------------------------
check('formulaire : section « Page du carnet papier »',
  [...document.querySelectorAll('#view .sec-titre')].some(x => /Page du carnet papier/.test(x.textContent)), '');
const btnPhoto = [...document.querySelectorAll('#view button')].find(b => /Photographier la page/.test(b.textContent));
check('carnet papier : bouton « Photographier la page »', !!btnPhoto, '');
if (btnPhoto) {
  let champ = null;
  const ancienClic = window.HTMLInputElement.prototype.click;
  window.HTMLInputElement.prototype.click = function () { champ = this; };
  btnPhoto.click();
  window.HTMLInputElement.prototype.click = ancienClic;
  check('carnet papier : appareil photo arrière demandé',
    champ?.type === 'file' && champ.getAttribute('accept') === 'image/*'
      && champ.getAttribute('capture') === 'environment', champ?.outerHTML || 'aucun champ');
  champ?.remove();
}
check('carnet papier : pas de panneau tant qu’il n’y a pas de photo',
  document.querySelector('#view .carnet-dock')?.hidden === true, '');

// Une plongée qui a déjà sa photo (rangée sur l'appareil, sans GitHub).
{
  const P = await import(__p2u(path.join(ROOT, 'js/photos.js')).href);
  const img = 'data:image/jpeg;base64,' + Buffer.from('jpeg').toString('base64');
  const ref = P.nouvelleRef(dv.id, 42);
  await P.enregistrerPhoto(ref, img);
  const avecPhoto = { ...(await store.getDive(dv.id)), photoCarnet: { ref, l: 10, h: 10, le: '2026-11-05T10:00:00Z' } };
  await store.saveDive(avecPhoto);
  const carnetBrut = await store.exportAll();
  check('carnet papier : carnet.json ne garde que la référence',
    carnetBrut.includes(ref) && !carnetBrut.includes(P.versBase64(img)), '');

  window.location.hash = `#/dive/${dv.id}`;
  window.dispatchEvent(new window.Event('hashchange'));
  await tick(160);
  check('fiche : la page du carnet est affichée en grand, zoomable',
    document.querySelector('#view .carnet-lisible .zoom img')?.getAttribute('src') === img,
    document.querySelector('#view .carnet-lisible')?.outerHTML?.slice(0, 160) || 'absente');

  const { apercuPlongee } = await import(__p2u(path.join(ROOT, 'js/apercu.js')).href);
  await apercuPlongee(dv.id);
  await tick(160);
  check('aperçu : la page du carnet est là pour relire',
    document.querySelector('.apercu .carnet-lisible .zoom img')?.getAttribute('src') === img,
    document.querySelector('.apercu')?.textContent?.slice(0, 160) || 'absente');
  document.querySelector('.apercu .apercu-btn[aria-label=Fermer]')?.click();

  window.location.hash = `#/dive/${dv.id}/edit`;
  window.dispatchEvent(new window.Event('hashchange'));
  await tick(160);
  check('formulaire : la photo s’affiche à côté des champs',
    document.querySelector('#view .carnet-dock') && !document.querySelector('#view .carnet-dock').hidden
      && !!document.querySelector('#view .carnet-dock .zoom-img'), '');
  check('formulaire : état « sur cet appareil » en mode local',
    /Sur cet appareil/.test(view()), '');
  const retirer = [...document.querySelectorAll('#view button')].find(b => /Retirer la photo/.test(b.textContent));
  retirer?.click();
  await tick(60);
  check('formulaire : la photo se retire (avant enregistrement)',
    document.querySelector('#view .carnet-dock')?.hidden === true, '');
  check('formulaire : retirer sans enregistrer ne touche pas la plongée',
    (await store.getDive(dv.id)).photoCarnet?.ref === ref, '');
}

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
