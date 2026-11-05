// Vérifie la synchronisation avec GitHub, contre un faux GitHub en mémoire :
// création du carnet, écriture différée, conflit entre deux appareils,
// suppressions qui ne ressuscitent pas, travail hors ligne puis rattrapage.
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
const imp = rel => import(__p2u(path.join(ROOT, rel)).href);

const results = [];
const check = (name, cond, extra = '') =>
  results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

// ---------- Environnement navigateur minimal ----------
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};
globalThis.window = { innerWidth: 400 };
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'test' }, configurable: true });

// ---------- Faux GitHub ----------
const gh = {
  fichier: null,          // { texte, sha }
  depotExiste: true,
  prive: true,
  horsLigne: false,
  commits: [],
  n: 0,
};
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const deB64 = s => Buffer.from(s, 'base64').toString('utf8');
const rep = (status, corps) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => corps, text: async () => JSON.stringify(corps),
});

globalThis.fetch = async (url, opts = {}) => {
  if (gh.horsLigne) throw new TypeError('Failed to fetch');
  const u = new URL(url);
  const auth = opts.headers?.Authorization;
  if (auth !== 'Bearer jeton-test') return rep(401, { message: 'Bad credentials' });
  if (!gh.depotExiste) return rep(404, { message: 'Not Found' });

  if (/^\/repos\/moi\/carnet-data$/.test(u.pathname)) {
    return rep(200, { full_name: 'moi/carnet-data', private: gh.prive, permissions: { push: true } });
  }
  if (/\/contents\/carnet\.json$/.test(u.pathname)) {
    if ((opts.method || 'GET') === 'GET') {
      if (!gh.fichier) return rep(404, { message: 'Not Found' });
      return rep(200, { sha: gh.fichier.sha, encoding: 'base64', content: b64(gh.fichier.texte) });
    }
    const corps = JSON.parse(opts.body);
    const shaActuel = gh.fichier?.sha || undefined;
    if (corps.sha !== shaActuel) return rep(409, { message: 'sha mismatch' });
    gh.fichier = { texte: deB64(corps.content), sha: 'sha' + (++gh.n) };
    gh.commits.push(corps.message);
    return rep(200, { content: { sha: gh.fichier.sha } });
  }
  return rep(404, { message: 'route inconnue ' + u.pathname });
};

const distant = () => JSON.parse(gh.fichier.texte);
/** Un autre appareil écrit directement sur GitHub. */
function ecritureAilleurs(modif) {
  const d = distant();
  modif(d);
  gh.fichier = { texte: JSON.stringify(d), sha: 'sha' + (++gh.n) };
}

// ---------- Fusion pure ----------
const { fusionner } = await imp('js/fusion.js');
{
  const a = { dives: [{ id: '1', updatedAt: '2026-01-01', x: 'distant' }, { id: '2', updatedAt: '2026-01-01' }] };
  const b = { dives: [{ id: '1', updatedAt: '2026-02-01', x: 'local' }, { id: '3', updatedAt: '2026-01-05' }],
              _supprimes: { 2: '2026-01-10' } };
  const f = fusionner(a, b);
  check('fusion : la fiche la plus récente gagne', f.dives.find(x => x.id === '1').x === 'local');
  check('fusion : un ajout local est gardé', f.dives.some(x => x.id === '3'));
  check('fusion : une suppression locale ne ressuscite pas', !f.dives.some(x => x.id === '2'));
  const g = fusionner({ dives: [{ id: '2', updatedAt: '2026-03-01' }] }, { dives: [], _supprimes: { 2: '2026-01-10' } });
  check('fusion : une fiche retouchée après sa suppression survit', g.dives.some(x => x.id === '2'));
}

// ---------- Base64 accentué ----------
const ghMod = await imp('js/github.js');
{
  const s = 'Plongée à l’Île Verte — 🐙 poulpe, 18 °C';
  check('base64 : accents et emojis aller-retour', ghMod.depuisBase64(ghMod.versBase64(s)) === s);
}

// ---------- Mode local (rien de configuré) ----------
const sg = await imp('js/store-github.js');
const sync = await imp('js/sync.js');
const { store } = await imp('js/store.js');
const { emptyDiver, emptyDive } = await imp('js/model.js');

await store.listDivers();
check('sans réglage : mode local', sg.modeActuel() === 'local', sg.modeActuel());
check('sans réglage : état « local » affiché', sync.status().state === 'local', sync.status().state);

const moi = { ...emptyDiver(), prenom: 'Test', nom: 'Plongeur' };
await store.saveDiver(moi);
const p1 = { ...emptyDive(moi.id), numero: 1, date: '2026-06-01', lieuNom: 'Calanque', profMax: 18, dureeMin: 40 };
await store.saveDive(p1);
check('mode local : rien n’est envoyé', gh.commits.length === 0);

// ---------- Branchement sur un dépôt neuf ----------
ghMod.enregistrerConfigGitHub({ owner: 'moi', repo: 'carnet-data', token: 'jeton-test' });
const t = await ghMod.testerConnexion(ghMod.configGitHub());
check('test de connexion : dépôt privé reconnu', t.prive === true);

let r = await sg.rebrancher();
check('dépôt neuf : passage en mode GitHub', r.mode === 'github', r.mode);
check('dépôt neuf : le carnet de l’appareil est envoyé', gh.fichier && distant().dives.length === 1);
check('dépôt neuf : un commit explicite', /création du carnet/.test(gh.commits[0] || ''), gh.commits[0]);
check('état : synchronisé', sync.status().state === 'ok', sync.status().state);

// ---------- Écriture différée ----------
const p2 = { ...emptyDive(moi.id), numero: 2, date: '2026-06-02', lieuNom: 'Port-Cros', profMax: 25, dureeMin: 45 };
await store.saveDive(p2);
check('après saisie : état « en attente »', sync.status().state === 'pending', sync.status().state);
await tick(1400);
await tick(50);
check('écriture différée : la plongée arrive sur GitHub', distant().dives.some(d => d.id === p2.id));
check('commit nommé d’après la plongée', /plongée n°2/.test(gh.commits.at(-1)), gh.commits.at(-1));

// ---------- Conflit : un autre appareil a écrit entre-temps ----------
const pTablette = { ...emptyDive(moi.id), id: 'tablette-1', numero: 3, date: '2026-06-03',
  lieuNom: 'Saisie tablette', updatedAt: new Date().toISOString() };
ecritureAilleurs(d => d.dives.push(pTablette));
const p4 = { ...emptyDive(moi.id), numero: 4, date: '2026-06-04', lieuNom: 'Saisie téléphone' };
await store.saveDive(p4);
await sg.vider();
const ids = distant().dives.map(d => d.id);
check('conflit : la plongée de la tablette est conservée', ids.includes('tablette-1'), ids.join(','));
check('conflit : la plongée du téléphone est envoyée', ids.includes(p4.id));
check('conflit : l’appareil voit aussi la plongée de la tablette',
  (await store.listDives(moi.id)).some(d => d.id === 'tablette-1'));

// ---------- Suppression ----------
await store.deleteDive(p1.id);
await sg.vider();
check('suppression : partie de GitHub', !distant().dives.some(d => d.id === p1.id));
check('suppression : pierre tombale écrite', !!distant()._supprimes?.[p1.id]);

// Un autre appareil avec une vieille copie renvoie la plongée supprimée.
ecritureAilleurs(d => d.dives.push({ ...p1 }));
await sg.synchroniser();
const ici = await store.listDives(moi.id);
check('suppression : une vieille copie ne la ressuscite pas après fusion',
  !ici.some(d => d.id === p1.id) || !distant()._supprimes, ici.map(d => d.lieuNom).join(','));

// ---------- Hors ligne ----------
gh.horsLigne = true;
const p5 = { ...emptyDive(moi.id), numero: 5, date: '2026-06-05', lieuNom: 'Sur le bateau' };
await store.saveDive(p5);
await sg.vider();
check('hors ligne : état « en attente »', sync.status().state === 'pending', sync.status().state);
check('hors ligne : la plongée est gardée sur l’appareil', (await store.listDives(moi.id)).some(d => d.id === p5.id));
check('hors ligne : copie de l’appareil à jour', JSON.parse(mem.get('plongee-journal:miroir')).dives.some(d => d.id === p5.id));

gh.horsLigne = false;
await sg.synchroniser();
check('retour du réseau : la plongée part', distant().dives.some(d => d.id === p5.id));
check('retour du réseau : état synchronisé', sync.status().state === 'ok', sync.status().state);

// ---------- Changement venu d'ailleurs, sans rien en attente ----------
ecritureAilleurs(d => { d.dives.find(x => x.id === 'tablette-1').lieuNom = 'Renommée sur la tablette'; });
const change = await sg.synchroniser();
check('mise à jour distante : détectée', change === true);
check('mise à jour distante : visible sur l’appareil',
  (await store.getDive('tablette-1'))?.lieuNom === 'Renommée sur la tablette');

// ---------- Erreurs lisibles ----------
ghMod.enregistrerConfigGitHub({ owner: 'moi', repo: 'carnet-data', token: 'mauvais' });
r = await sg.rebrancher();
check('jeton refusé : mode erreur', r.mode === 'github-erreur', r.mode);
check('jeton refusé : message clair', /Jeton GitHub refusé/.test(sg.erreurGitHub()), sg.erreurGitHub());
check('jeton refusé : les données restent sur l’appareil', (await store.listDives(moi.id)).length >= 4);

ghMod.enregistrerConfigGitHub({ owner: 'moi', repo: 'carnet-data', token: 'jeton-test' });
gh.depotExiste = false;
r = await sg.rebrancher();
check('dépôt introuvable : message clair', /introuvable/.test(sg.erreurGitHub()), sg.erreurGitHub());
gh.depotExiste = true;

ghMod.oublierConfigGitHub();
r = await sg.rebrancher();
check('débranché : retour au mode local', r.mode === 'local');
check('jeton jamais écrit dans le carnet', !gh.fichier.texte.includes('jeton-test'));

// ---------- Bilan ----------
console.log(results.join('\n'));
const ko = results.filter(l => l.startsWith(' FAIL')).length;
console.log(`\n${results.length - ko}/${results.length} vérifications`);
process.exit(ko ? 1 : 0);
