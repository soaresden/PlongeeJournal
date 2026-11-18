// Vidéos pCloud : lien, dates des dossiers, rapprochement avec les plongées.
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
const imp = rel => import(__p2u(path.join(ROOT, rel)).href);
globalThis.localStorage ||= { _m: new Map(), getItem(k) { return this._m.get(k) ?? null; }, setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); } };

const V = await imp('js/videos.js');
const results = [];
const check = (name, cond, extra = '') => results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

const cfg = V.lirePublink('https://e.pcloud.link/publink/show?code=XyZ0FauxCodeDeTest0123456789abcd');
check('lien : code et serveur européen', cfg.code === 'XyZ0FauxCodeDeTest0123456789abcd' && cfg.api === 'eapi.pcloud.com');
check('lien : serveur américain', V.lirePublink('https://u.pcloud.link/publink/show?code=abcdefghijklmnopqrstuvwxyz').api === 'api.pcloud.com');
check('lien : pas un lien pCloud', V.lirePublink('https://exemple.fr') === null && V.lirePublink('') === null);

const dates = [
  ['2026-08-30 Cap Vert', '2026-08-30'], ['2026_08_30', '2026-08-30'], ['20260830 St Pierre', '2026-08-30'],
  ['30-08-2026', '2026-08-30'], ['30.08.2026 - plongée', '2026-08-30'], ['Malte 3/9/25', '2025-09-03'],
  ['Vacances', null], ['GX010123', null], ['Plongée 2026', null],
];
for (const [n, d] of dates) check(`date : « ${n} »`, V.dateDuNom(n) === d, V.dateDuNom(n));
check('date : « 08-30 Cap Vert » dans un dossier « 2026 »', V.dateDuNom('08-30 Cap Vert', 2026) === '2026-08-30');
check('heure : VID_20260830_123805', JSON.stringify(V.heureDuNom('VID_20260830_123805.mp4')) === JSON.stringify({ date: '2026-08-30', min: 758 }));

const f = (id, name, ct = 'video/mp4') => ({ isfolder: false, fileid: id, name, contenttype: ct, size: 1000, thumb: true });
const arbre = {
  name: 'Vidéos plongée', isfolder: true, folderid: 1, contents: [
    { name: '2026-08-30 Cap Vert', isfolder: true, folderid: 10, contents: [f(101, 'GX010001.MP4'), f(102, 'photo.jpg', 'image/jpeg'), f(103, 'notes.txt', 'text/plain')] },
    { name: '2026', isfolder: true, folderid: 2, contents: [
      { name: '11-08 Maldives', isfolder: true, folderid: 20, contents: [
        { name: 'GoPro', isfolder: true, folderid: 21, contents: [f(201, 'VID_20261108_075500.mp4'), f(202, 'VID_20261108_141000.mp4')] }] }] },
    { name: 'Divers', isfolder: true, folderid: 3, contents: [] },
    f(301, 'VID_20250328_142000.mp4'),
  ],
};
const dossiers = V.dossiersDates(arbre);
check('dossiers datés (sous-dossiers et année parente compris)', dossiers.map(d => d.date).join() === '2025-03-28,2026-08-30,2026-11-08', dossiers.map(d => d.date).join());
check('médias seulement, sous-dossiers compris', dossiers.find(d => d.date === '2026-08-30').fichiers.length === 2
  && dossiers.find(d => d.date === '2026-11-08').fichiers.length === 2);
check('fichiers en vrac datés : regroupés par jour', dossiers.find(d => d.date === '2025-03-28')?.fichiers[0].fileid === 301);

const matin = { id: 'a', date: '2026-11-08', heureImmersion: '07:50', dureeMin: 33 };
const aprem = { id: 'b', date: '2026-11-08', heureImmersion: '14:05', dureeMin: 40 };
const vm = V.videosDePlongee(matin, dossiers, [matin, aprem]);
check('deux plongées le même jour : chacune ses vidéos (heure du nom)', vm.parHeure && vm.fichiers.map(x => x.fileid).join() === '201');
check('… et l’après-midi', V.videosDePlongee(aprem, dossiers, [matin, aprem]).fichiers.map(x => x.fileid).join() === '202');
check('une seule plongée ce jour-là : tout le dossier', V.videosDePlongee({ date: '2026-08-30' }, dossiers).fichiers.length === 2);
check('dossier choisi à la main', V.videosDePlongee({ date: '2020-01-01', videoDossier: 10 }, dossiers)?.dossier.folderid === 10);
check('pas de dossier ce jour-là', V.videosDePlongee({ date: '2020-01-01' }, dossiers) === null);

// Un dossier par plongée (rangé par Ranger-GoPro) : chaque plongée du jour retrouve le sien par l'heure
check('heure de dossier : « 2026-11-08 - 12h34 Kandooma Thila »', V.heureDossier('2026-11-08 - 12h34 Kandooma Thila') === 754);
check('heure de dossier : aucune dans « 2026-11-08 » ni « 30.08.2026 - plongée »', V.heureDossier('2026-11-08') === null && V.heureDossier('30.08.2026 - plongée') === null);
{
  const parPlongee = V.dossiersDates({ name: 'GoPro', isfolder: true, folderid: 1, contents: [
    { name: '2026-11-08 - 07h50 Hulhumalé Harbor', isfolder: true, folderid: 51, contents: [f(511, '2026-11-08_03h55_4K.mp4')] },
    { name: '2026-11-08 - 12h34 Kandooma Thila', isfolder: true, folderid: 52, contents: [f(521, '2026-11-08_08h49_4K.mp4'), f(522, '2026-11-08_09h02_4K.mp4')] },
    { name: '2026-11-08', isfolder: true, folderid: 53, contents: [f(531, '2026-11-08_14h20_4K.mp4')] },
    { name: 'TOSORT', isfolder: true, folderid: 54, contents: [{ name: '100GOPRO', isfolder: true, folderid: 55, contents: [f(551, 'GX010001.MP4')] }] },
  ] });
  const p1 = { id: 'a', date: '2026-11-08', heureImmersion: '07:50', dureeMin: 33 };
  const p2 = { id: 'b', date: '2026-11-08', heureImmersion: '12:34', dureeMin: 51 };
  const p3 = { id: 'c', date: '2026-11-08', heureImmersion: '18:11', dureeMin: 51 };
  const toutes = [p1, p2, p3];
  const ids = d => V.videosDePlongee(d, parPlongee, toutes)?.fichiers.map(x => x.fileid).join() ?? null;
  check('dossier par plongée : la 1re a le sien', ids(p1) === '511', ids(p1));
  check('dossier par plongée : la 2e a le sien, en entier (heure de la GoPro ignorée)', ids(p2) === '521,522', ids(p2));
  check('dossier par plongée : sinon le dossier du jour sans heure', ids(p3) === '531', ids(p3));
  check('TOSORT/100GOPRO : pas un dossier daté', !parPlongee.some(x => x.folderid === 54 || x.folderid === 55));
}

// Séances et dossiers mis de côté
{
  const fosse = { id: 'f', type: 'fosse', date: '2026-08-30', heure: '19:00' };
  const plongee = { id: 'p', date: '2026-08-30', heureImmersion: '12:38' };
  check('séance : son dossier du jour', V.videosDePlongee(fosse, dossiers, [fosse])?.dossier.folderid === 10);
  const reliee = { ...fosse, videoDossier: 10 };
  check('dossier relié à la séance : plus sur la plongée du même jour', V.videosDePlongee(plongee, dossiers, [plongee, reliee]) === null
    && V.videosDePlongee(reliee, dossiers, [plongee, reliee])?.dossier.folderid === 10);
  check('dossier « test caméra » : ne va plus tout seul sur une plongée', V.videosDePlongee(plongee, dossiers, [plongee], { autres: { 10: 'Test caméra' } }) === null);
  check('… sauf si on le relie à la main', V.videosDePlongee({ ...plongee, videoDossier: 10 }, dossiers, [], { autres: { 10: 'Test caméra' } })?.dossier.folderid === 10);
}

// Plusieurs dossiers, retrait, vidéos retirées une à une
{
  const p = { id: 'p', date: '2026-08-30', heureImmersion: '12:38' };
  const deux = { ...p, ...V.avecDossier(p, 20) };
  const v2 = V.videosDePlongee({ ...deux, ...V.avecDossier(deux, 10) }, dossiers, []);
  check('plusieurs dossiers sur une plongée', v2.dossiers.map(x => x.folderid).join() === '20,10' && v2.fichiers.length === 4 && !v2.auto);
  const sans = { ...p, ...V.sansDossier(p, 10) };
  check('retirer le dossier trouvé à la date', V.videosDePlongee(sans, dossiers, []) === null && sans.videoSans.includes('10'));
  check('le relier de nouveau efface le retrait', V.videosDePlongee({ ...sans, ...V.avecDossier(sans, 10) }, dossiers, [])?.dossier.folderid === 10);
  const r = V.videosDePlongee({ ...p, videosRetirees: ['101'] }, dossiers, []);
  check('vidéo retirée une à une', r.fichiers.map(f => f.fileid).join() === '102' && r.retirees === 1);
  check('ancien format (un seul dossier) toujours lu', V.dossiersLies({ videoDossier: 10 }).join() === '10');
}


// --- l'assistant : jour et heure dans le nom, proposition, assignations ---
{
  const dh = n => JSON.stringify(V.dateHeureDuNom(n));
  const att = (d, m) => JSON.stringify({ date: d, min: m });
  check('nom : 2026-11-08_08h49_4K.mp4', dh('2026-11-08_08h49_4K.mp4') === att('2026-11-08', 529));
  check('nom : WhatsApp … 2023-03-18 at 12.34.56(1)', dh('WhatsApp Image 2023-03-18 at 12.34.56(1).jpeg') === att('2023-03-18', 754));
  check('nom : IMG_20230318_123456', dh('IMG_20230318_123456.jpg') === att('2023-03-18', 754));
  check('nom : 20260622_11h46_Kayak', dh('20260622_11h46_Kayak Gx010109 Joined.mp4') === att('2026-06-22', 706));
  check('nom : 2023-05-13 1ere (jour seul)', dh('2023-05-13 1ere.mp4') === att('2023-05-13', null));
  check('nom : GX010096 (rien)', V.dateHeureDuNom('GX010096.MP4') === null);
  check('heureDuNom : pas d’heure → null', V.heureDuNom('2023-05-13 1ere.mp4') === null);

  const g = (id, name) => ({ isfolder: false, fileid: id, name, contenttype: 'video/mp4', parentfolderid: 0 });
  const racine = { name: 'GoPro', isfolder: true, folderid: 1, contents: [
    g(1, '2026-11-11_07h13_4K drop1.mp4'), g(2, '2026-11-11_08h34_4K drop2.mp4'), g(3, '2026-11-11_08h34_4K drop2.srt'),
    g(4, '2026-11-11_13h40_4K.mp4'), g(9, '2026-11-11_16h00_snorkeling.mp4'),
    { name: '2026-11-09 - 12h00 Miyaru Kandu', isfolder: true, folderid: 5, contents: [g(5, '2026-11-09_13h00_4K.mp4')] },
    { name: '2025-11-29 Roussay', isfolder: true, folderid: 6, contents: [g(6, 'Gx010096 Joined.mp4')] },
    { name: 'TOSORT', isfolder: true, folderid: 7, contents: [{ name: '100GOPRO', isfolder: true, folderid: 8, contents: [g(8, 'GX010200.MP4')] }] },
  ] };
  const plats = V.fichiersPlats(racine);
  check('à plat : TOSORT ignoré, .srt ignoré', plats.map(f => f.fileid).join() === '1,2,4,9,5,6', plats.map(f => f.fileid).join());
  check('à plat : le dossier qui contient', plats.find(f => f.fileid === 5).dossier === '2026-11-09 - 12h00 Miyaru Kandu' && plats.find(f => f.fileid === 1).dossier === '');
  check('TOSORT absent des dossiers datés aussi', !V.dossiersDates({ contents: [{ name: 'TOSORT', isfolder: true, folderid: 7, contents: [{ name: '2026-01-01 x', isfolder: true, folderid: 9, contents: [g(8, 'a.mp4')] }] }] }).length);

  const five = { id: 'five', date: '2026-11-11', heureImmersion: '07:11', heureSortie: '07:58', dureeMin: 47,
    parties: [{ heureImmersion: '07:11', heureSortie: '07:22', dureeMin: 11 }, { heureImmersion: '07:34', heureSortie: '08:10', dureeMin: 36 }] };
  const lily = { id: 'lily', date: '2026-11-11', heureImmersion: '11:55', heureSortie: '12:55', dureeMin: 60 };
  const miyaru = { id: 'miy', date: '2026-11-09', heureImmersion: '12:00', heureSortie: '12:38', dureeMin: 38 };
  const roussay = { id: 'rou', date: '2025-11-29', heureImmersion: '10:00', dureeMin: 40 };
  const carnet = [five, lily, miyaru, roussay];
  const P = id => V.proposer(plats.find(f => f.fileid === id), carnet);
  check('deux drops : drop1 → partie 1', P(1).dive === five && P(1).partie === 1 && P(1).raison === 'pendant');
  check('deux drops : drop2 → partie 2 (24 min après la sortie)', P(2).dive === five && P(2).partie === 2 && P(2).raison === 'apres');
  check('à 1 h près : décalage de la caméra', P(4).dive === lily && P(4).raison === 'decalage' && P(4).decalage === -60);
  check('rien à cette heure (snorkeling)', P(9).dive === null && P(9).raison === 'hors' && P(9).jour.length === 2);
  check('dossier de la plongée : il l’emporte sur l’heure du nom', P(5).dive === miyaru && P(5).raison === 'dossier');
  check('sans heure : la seule plongée du jour (faible)', P(6).dive === roussay && P(6).confiance === 'faible');

  // Les assignations validées : le fichier vient sur la plongée, d'où qu'il soit, et quitte les autres.
  const dd = V.dossiersDates(racine);
  const opts = aff => ({ affectations: aff, fichiers: plats });
  const ids = (d, aff) => V.videosDePlongee(d, dd, carnet, opts(aff))?.fichiers.map(f => f.fileid).join() ?? null;
  check('fenêtres : les deux drops', JSON.stringify(V.fenetres(five)) === JSON.stringify([{ debut: 431, fin: 442, partie: 1 }, { debut: 454, fin: 490, partie: 2 }]));
  check('sans assignation : drop2 retrouvé par l’heure (fenêtre du 2e drop)', ids(five, {}).split(',').includes('2'));
  check('assigné à Lily : il quitte Five Rocks et va sur Lily', !ids(five, { 2: 'lily' }).split(',').includes('2') && ids(lily, { 2: 'lily' }).split(',').includes('2'), ids(five, { 2: 'lily' }) + ' / ' + ids(lily, { 2: 'lily' }));
  check('assigné à aucune : il ne s’affiche nulle part', !ids(five, { 1: '' }).split(',').includes('1'));
  check('assigné d’un autre dossier, sans dossier du jour', ids({ id: 'x', date: '2020-01-01' }, { 5: 'x' }) === '5');
}

// API simulée : le lien est en fait américain, le serveur européen répond 7001.
const appels = [];
const http = async url => {
  appels.push(url);
  const u = new URL(url);
  if (u.hostname === 'eapi.pcloud.com') return { ok: true, status: 200, texte: JSON.stringify({ result: 7001, error: 'Invalid link referer.' }) };
  if (u.pathname === '/showpublink') return { ok: true, status: 200, texte: JSON.stringify({ result: 0, metadata: arbre }) };
  if (u.pathname === '/getpubvideolinks') return { ok: true, status: 200, texte: JSON.stringify({ result: 0, variants: [
    { transcoded: false, width: 3840, hosts: ['c1.pcloud.com'], path: '/brut.mp4' },
    { transcoded: true, width: 1280, hosts: ['c2.pcloud.com'], path: '/web.mp4' }] }) };
  if (u.pathname === '/getpublinkdownload') return { ok: true, status: 200, texte: JSON.stringify({ result: 0, hosts: ['c3.pcloud.com'], path: '/photo.jpg' }) };
  return { ok: false, status: 404, texte: '' };
};
const c2 = { ...cfg };
const lus = await V.chargerDossiers(c2, { forcer: true, http });
check('API : autre région essayée, puis retenue', lus.length === 3 && c2.api === 'api.pcloud.com' && appels.length === 2, appels.join(' '));
check('cache : le badge de la liste le retrouve', V.dossiersEnCache(c2)?.length === 3);
check('lecture : la version web de la vidéo', await V.urlLecture(c2, { fileid: 201, video: true }, { http }) === 'https://c2.pcloud.com/web.mp4');
check('lecture : une photo, le fichier', await V.urlLecture(c2, { fileid: 102, video: false }, { http }) === 'https://c3.pcloud.com/photo.jpg');
check('miniature', V.urlMiniature(c2, 101).startsWith('https://api.pcloud.com/getpubthumb?code=XyZ') && V.urlMiniature(c2, 101).includes('fileid=101'));

console.log(results.join('\n'));
const ko = results.filter(r => r.startsWith(' FAIL'));
console.log(`\n${results.length - ko.length}/${results.length} vérifications vidéos`);
if (ko.length) process.exit(1);
