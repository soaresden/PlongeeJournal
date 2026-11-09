// La feuille Google des visites : le script (simulé ici comme le ferait
// Google), l'écriture côté visiteur, la relecture avec la clé, et pas de
// doublon avec ntfy.
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
const F = await import(__p2u(path.join(ROOT, 'js/feuille.js')).href);
const V = await import(__p2u(path.join(ROOT, 'js/visites.js')).href);
const results = [];
const check = (name, cond, extra = '') => results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

const URL_OK = 'https://script.google.com/macros/s/AKfycbx-abc_123/exec';
check('adresse de script reconnue', F.estAdresseFeuille(URL_OK) && !F.estAdresseFeuille('https://exemple.com/exec') && !F.estAdresseFeuille(''));
const cle = F.nouvelleCle();
check('clé longue et aléatoire', cle.length === 24 && cle !== F.nouvelleCle());

// --- Le script Google, exécuté avec de faux services Google
function google({ lie = true } = {}) {
  const lignes = [];
  const feuille = { appendRow: r => lignes.push(r), setFrozenRows() {}, setColumnWidth() {}, getDataRange: () => ({ getValues: () => lignes.map(r => [...r]) }) };
  let creee = false;
  const ss = { getId: () => 'ID1', getSheetByName: () => (creee ? feuille : null), insertSheet: () => { creee = true; return feuille; } };
  const props = {}, crees = [];
  const env = {
    // lie : script collé dans une feuille ; sinon créé seul sur script.google.com
    SpreadsheetApp: { getActiveSpreadsheet: () => (lie ? ss : null), create: nom => { crees.push(nom); return ss; }, openById: id => (id === 'ID1' ? ss : null) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ texte: t, setMimeType() { return this; } }) },
  };
  const code = F.scriptFeuille(cle) + '\nreturn { doPost, doGet };';
  const fn = new Function(...Object.keys(env), code)(...Object.values(env));
  return { ...fn, lignes, crees };
}
const g = google();
const m = V.message({ prenom: 'Alison', date: '2025-03-29', lieu: 'Egypte', plongee: { id: 'p48', numero: 48, lieuNom: 'Hurghada' }, ok: true, sid: 's1' });
g.doPost({ parameter: { title: m.titre, tags: m.tags.join(',') }, postData: { contents: m.corps } });
g.doPost({ parameter: { title: '=IMPORTXML("x")', tags: 'pj-ko' }, postData: { contents: '=HYPERLINK("x")' } });
g.doPost({ parameter: { title: 'spam', tags: 'rien' }, postData: { contents: 'spam' } });
check('le script crée l’onglet avec ses titres, puis ajoute les visites', g.lignes[0][0] === 'Quand' && g.lignes.length === 3, JSON.stringify(g.lignes));
check('une formule tapée par un visiteur reste du texte', g.lignes[2][1].startsWith("'=") && g.lignes[2][2].startsWith("'="));
check('un message qui ne vient pas du carnet est ignoré', !g.lignes.some(l => l[1] === 'spam'));
check('sans la clé : rien à lire', JSON.parse(g.doGet({ parameter: { cle: 'mauvaise' } }).texte).erreur === 'clé');
const lus = JSON.parse(g.doGet({ parameter: { cle } }).texte);
check('avec la clé : les visites, au format des messages ntfy', lus.length === 2 && lus[0].event === 'message' && lus[0].tags.includes('pj-ok') && lus[0].message === m.corps, JSON.stringify(lus[0]));

// Créé seul sur script.google.com (tablette) : la feuille est créée une fois, puis réutilisée.
const seul = google({ lie: false });
seul.doGet({ parameter: { cle } });
seul.doPost({ parameter: { title: m.titre, tags: m.tags.join(',') }, postData: { contents: m.corps } });
seul.doPost({ parameter: { title: m.titre, tags: m.tags.join(',') }, postData: { contents: m.corps } });
check('script seul : sa feuille créée une seule fois, dans le Drive', seul.crees.length === 1 && /Visites du carnet/.test(seul.crees[0]) && seul.lignes.length === 3,
  JSON.stringify(seul.crees));

// --- Relecture : feuille + ntfy, le même message n'est compté qu'une fois
const visiteFeuille = V.lireMessage(lus[0]);
check('le numéro de message est le même partout', visiteFeuille.id === m.tags.find(t => t.startsWith('pj-m-')).slice(5));
const reponse = corps => ({ ok: true, status: 200, text: async () => corps });
const faux = async url => (url.startsWith(V.NTFY)
  ? reponse(JSON.stringify({ id: 'ntfy1', event: 'message', time: 1700000000, tags: m.tags, message: m.corps }))
  : reponse(JSON.stringify(lus)));
const tout = await V.relireToutesVisites({ canal: 'pj-x', feuille: URL_OK, cle }, faux);
check('feuille relue : chaque visite une seule fois', tout.filter(v => v.prenom === 'Alison').length === 1, JSON.stringify(tout));
const sansNtfy = await V.relireToutesVisites({ canal: 'pj-x', feuille: URL_OK, cle },
  async url => (url.startsWith(V.NTFY) ? Promise.reject(new Error('hors ligne')) : reponse(JSON.stringify(lus))));
check('ntfy injoignable : la feuille suffit', sansNtfy.length === 2);
let leve = false;
try { await V.relireToutesVisites({ canal: 'pj-x' }, async () => Promise.reject(new Error('hors ligne'))); } catch { leve = true; }
check('rien de joignable : erreur', leve);
let msg = '';
try { await F.lireFeuille(URL_OK, 'x', async () => reponse('{"erreur":"clé"}')); } catch (e) { msg = e.message; }
check('clé refusée : message clair', /recopie le script/.test(msg), msg);

// --- Côté visiteur : écrit dans la feuille si elle est branchée
const envois = [];
globalThis.fetch = async (u, o) => { envois.push([u, o]); return { ok: true }; };
V.brancherFeuille(URL_OK);
await V.annoncerVisite('pj-x', { prenom: 'Léa', date: '2025-03-29', lieu: 'Egypte', ok: true, sid: 's2' }, globalThis.fetch);
const versFeuille = envois.find(([u]) => u.startsWith(URL_OK));
check('visite écrite dans la feuille (sans clé, sans lire la réponse)', versFeuille && versFeuille[1].mode === 'no-cors' && !versFeuille[0].includes('cle='), JSON.stringify(envois));
check('feuille branchée : plus rien sur ntfy (superflu)', !envois.some(([u]) => u.startsWith(V.NTFY)), JSON.stringify(envois));
const lus2 = []; await V.relireToutesVisites({ canal: 'pj-x', feuille: URL_OK, cle }, async u => { lus2.push(u); return reponse('[]'); });
check('feuille branchée : relue, et ntfy aussi (anciennes copies du carnet)', lus2.some(u => u.startsWith(URL_OK)) && lus2.some(u => u.startsWith(V.NTFY)), JSON.stringify(lus2));
V.brancherFeuille('');
envois.length = 0;
await V.annoncerVisite('pj-x', { prenom: 'Léa', date: '2025-03-29', lieu: 'Egypte', ok: true, sid: 's3' }, globalThis.fetch);
check('sans feuille : ntfy prend le relais', envois.some(([u]) => u.startsWith(V.NTFY)));
V.brancherFeuille('');
check('adresse invalide : rien n’est envoyé', F.posterFeuille('https://pirate.example/exec', m) === false);

// --- La clé de relecture ne part jamais dans le lien de partage
const P = await import(__p2u(path.join(ROOT, 'js/partage.js')).href);
const copie = JSON.stringify(P.instantane({ settings: { feuilleCle: cle, partage: { feuille: URL_OK } }, divers: [{ id: 'd' }] }, { canal: 'pj-x', feuille: URL_OK }));
check('le lien de partage a l’adresse de la feuille, jamais la clé', copie.includes(URL_OK) && !copie.includes(cle));

console.log(results.join('\n'));
const ko = results.filter(r => r.startsWith(' FAIL'));
console.log(`\n${results.length - ko.length}/${results.length} vérifications feuille Google`);
if (ko.length) process.exit(1);
