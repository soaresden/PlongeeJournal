// Photos du carnet papier : références, cadrage, et envoi vers un faux
// GitHub en mémoire — hors ligne, retour du réseau, suppression, lecture
// depuis un autre appareil.
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
const imp = rel => import(__p2u(path.join(ROOT, rel)).href);

const results = [];
const check = (name, cond, extra = '') =>
  results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

// ---------- Environnement navigateur minimal ----------
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};

// ---------- Faux GitHub ----------
const gh = { fichiers: new Map(), horsLigne: false, n: 0, commits: [], requetes: [] };
const rep = (status, corps) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => corps, text: async () => JSON.stringify(corps),
});
globalThis.fetch = async (url, opts = {}) => {
  if (gh.horsLigne) throw new TypeError('Failed to fetch');
  const u = new URL(url);
  const methode = opts.method || 'GET';
  gh.requetes.push(`${methode} ${decodeURIComponent(u.pathname)}`);
  if (opts.headers?.Authorization !== 'Bearer jeton-test') return rep(401, { message: 'Bad credentials' });
  const m = decodeURIComponent(u.pathname).match(/^\/repos\/moi\/carnet-data\/contents\/(.+)$/);
  if (!m) return rep(404, { message: 'route inconnue' });
  const chemin = m[1];
  const f = gh.fichiers.get(chemin);
  if (methode === 'GET') {
    return f ? rep(200, { sha: f.sha, encoding: 'base64', content: f.base64 }) : rep(404, { message: 'Not Found' });
  }
  const corps = JSON.parse(opts.body);
  if (methode === 'PUT') {
    if (f && corps.sha !== f.sha) return rep(422, { message: '"sha" wasn\'t supplied' });
    const sha = 'sha' + (++gh.n);
    gh.fichiers.set(chemin, { base64: corps.content, sha });
    gh.commits.push(corps.message);
    return rep(f ? 200 : 201, { content: { sha } });
  }
  if (methode === 'DELETE') {
    if (!f) return rep(404, { message: 'Not Found' });
    if (corps.sha !== f.sha) return rep(409, { message: 'sha mismatch' });
    gh.fichiers.delete(chemin);
    gh.commits.push(corps.message);
    return rep(200, {});
  }
  return rep(405, {});
};

const ghMod = await imp('js/github.js');
const P = await imp('js/photos.js');
P._utiliserStockage(P.stockageMemoire());

// ---------- Références et chemins ----------
{
  const ref = P.nouvelleRef('a1b2-c3', 1730000000000);
  check('référence : rangée dans photos/, en .jpg', /^photos\/carnet-a1b2-c3-[a-z0-9]+\.jpg$/.test(ref), ref);
  check('référence : valide', P.refValide(ref));
  check('référence : un chemin qui sort du dossier est refusé', !P.refValide('photos/../carnet.json'));
  check('référence : rien hors de photos/', !P.refValide('carnet.json') && !P.refValide(''));
  check('référence : un identifiant bizarre est nettoyé',
    P.refValide(P.nouvelleRef('../../x y', 1)), P.nouvelleRef('../../x y', 1));
  check('référence : deux photos de la même plongée ne se marchent pas dessus',
    P.nouvelleRef('d', 1) !== P.nouvelleRef('d', 2));

  check('dossier : carnet à la racine', ghMod.dossierCarnet({ path: 'carnet.json' }) === '');
  check('dossier : carnet dans un sous-dossier',
    ghMod.dossierCarnet({ path: 'donnees/carnet.json' }) === 'donnees/');
  check('chemin : la photo se range à côté du carnet',
    P.cheminDepot('photos/x.jpg', { path: 'donnees/carnet.json' }) === 'donnees/photos/x.jpg');

  check('base64 : l’en-tête data-URL est retiré', P.versBase64('data:image/jpeg;base64,QUJD') === 'QUJD');
  check('base64 : aller-retour', P.versBase64(P.versDataUrl('QUJD')) === 'QUJD');
  check('poids : estimé depuis le base64', P.poids('data:image/jpeg;base64,QUJDRA==') === 6, P.poids('data:image/jpeg;base64,QUJDRA=='));
}

// ---------- Cadrage ----------
{
  const t = P.tailleCible(4000, 3000, 1800);
  check('réduction : plus grand côté ramené à 1800', t.l === 1800 && t.h === 1350, JSON.stringify(t));
  const p = P.tailleCible(800, 600, 1800);
  check('réduction : une petite image n’est pas agrandie', p.l === 800 && p.h === 600);

  const b = P.bornerCadre({ x: 0.9, y: -0.2, w: 0.5, h: 0.5 });
  check('cadre : ramené dans l’image', b.x === 0.5 && b.y === 0 && b.w === 0.5, JSON.stringify(b));

  const c = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
  check('prise : un coin', P.priseSous(c, { x: 0.61, y: 0.59 }) === 'se');
  check('prise : l’intérieur déplace', P.priseSous(c, { x: 0.4, y: 0.4 }) === 'deplacer');
  check('prise : dehors, on trace un nouveau cadre', P.priseSous(c, { x: 0.9, y: 0.9 }) === 'nouveau');
  check('prise : sur la page entière, glisser trace un cadre',
    P.priseSous(P.CADRES.page.cadre, { x: 0.4, y: 0.6 }) === 'nouveau');
  check('prise : sur la page entière, les coins restent des poignées',
    P.priseSous(P.CADRES.page.cadre, { x: 0.01, y: 0.99 }) === 'so');

  const d = P.ajusterCadre(c, 'deplacer', { x: 0.4, y: 0.4 }, { x: 0.9, y: 0.4 });
  check('déplacer : le cadre reste dans l’image', Math.abs(d.x - 0.6) < 1e-9 && d.w === 0.4, JSON.stringify(d));
  const e = P.ajusterCadre(c, 'se', { x: 0.6, y: 0.6 }, { x: 0.8, y: 0.9 });
  check('coin : agrandit depuis le coin bas-droit',
    Math.abs(e.w - 0.6) < 1e-9 && Math.abs(e.h - 0.7) < 1e-9 && e.x === 0.2, JSON.stringify(e));
  const f = P.ajusterCadre(c, 'no', { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 });
  check('coin : un coin tiré au-delà de l’autre ne donne pas un cadre négatif',
    f.w >= 0 && f.h >= 0 && Math.abs(f.x - 0.6) < 1e-9, JSON.stringify(f));
  const g = P.ajusterCadre(c, 'nouveau', { x: 0.7, y: 0.1 }, { x: 0.3, y: 0.5 });
  check('nouveau cadre : tracé dans n’importe quel sens',
    Math.abs(g.x - 0.3) < 1e-9 && Math.abs(g.w - 0.4) < 1e-9 && Math.abs(g.h - 0.4) < 1e-9, JSON.stringify(g));
  check('raccourcis : moitié basse d’une page',
    P.CADRES.bas.cadre.y === 0.5 && P.CADRES.bas.cadre.h === 0.5);
}

// ---------- Sans GitHub : tout reste sur l'appareil ----------
const IMG = 'data:image/jpeg;base64,' + Buffer.from('fausse image jpeg').toString('base64');
const r1 = P.nouvelleRef('plongee1', 1);
await P.enregistrerPhoto(r1, IMG);
check('mode local : la photo se relit sur l’appareil', (await P.lirePhoto(r1)) === IMG);
check('mode local : état « sur cet appareil »', P.etatPhoto(r1) === 'locale', P.etatPhoto(r1));
check('mode local : aucun appel réseau', gh.requetes.length === 0, gh.requetes.join(' | '));
check('mode local : une référence inconnue ne plante pas', (await P.lirePhoto('photos/absente.jpg')) === null);
let refusee = false;
try { await P.enregistrerPhoto('../carnet.json', IMG); } catch { refusee = true; }
check('une référence invalide n’est jamais écrite', refusee);

// ---------- Branchement : ce qui attendait part ----------
ghMod.enregistrerConfigGitHub({ owner: 'moi', repo: 'carnet-data', token: 'jeton-test', path: 'carnet.json' });
check('branché : la photo prise avant est en attente', P.etatPhoto(r1) === 'attente', P.etatPhoto(r1));
let n = await P.envoyerEnAttente();
check('branché : la photo d’avant est envoyée', n === 1 && gh.fichiers.has(r1), `${n} ${[...gh.fichiers.keys()]}`);
check('envoi : contenu intact sur GitHub', gh.fichiers.get(r1)?.base64 === P.versBase64(IMG));
check('envoi : jamais dans carnet.json', !gh.fichiers.has('carnet.json'));
check('envoi : état « sur GitHub »', P.etatPhoto(r1) === 'envoyee', P.etatPhoto(r1));
check('envoi : commit nommé', /Photo du carnet papier/.test(gh.commits.at(-1) || ''), gh.commits.at(-1));

// ---------- Hors ligne, puis retour du réseau ----------
gh.horsLigne = true;
const r2 = P.nouvelleRef('plongee2', 2);
await P.enregistrerPhoto(r2, IMG);
await P.envoyerEnAttente();
check('hors ligne : la photo reste en attente', P.etatPhoto(r2) === 'attente', P.etatPhoto(r2));
check('hors ligne : elle se relit quand même', (await P.lirePhoto(r2)) === IMG);
check('hors ligne : une erreur lisible est gardée', /injoignable/.test(P.erreurPhotos()), P.erreurPhotos());
gh.horsLigne = false;
n = await P.envoyerEnAttente();
check('retour du réseau : la photo part', n === 1 && gh.fichiers.has(r2), String(n));
check('retour du réseau : file vide', P.enAttente().length === 0, JSON.stringify(P.enAttente()));

// ---------- Fichier déjà présent : remplacé, pas d'erreur ----------
gh.fichiers.set('photos/deja.jpg', { base64: 'QQ==', sha: 'vieux' });
await P.enregistrerPhoto('photos/deja.jpg', IMG);
await P.envoyerEnAttente();
check('déjà présent : remplacé par la nouvelle version',
  gh.fichiers.get('photos/deja.jpg')?.base64 === P.versBase64(IMG) && P.enAttente().length === 0);

// ---------- Suppression ----------
await P.oublierPhoto(r1);
await P.envoyerEnAttente();
check('suppression : retirée de GitHub', !gh.fichiers.has(r1));
check('suppression : retirée de l’appareil aussi',
  (await (async () => { gh.horsLigne = true; try { return await P.lirePhoto(r1); } catch { return 'erreur'; } finally { gh.horsLigne = false; } })()) === 'erreur');
await P.oublierPhoto('photos/jamais-envoyee.jpg');
n = await P.envoyerEnAttente();
check('suppression : une photo jamais envoyée ne bloque pas la file', P.enAttente().length === 0, JSON.stringify(P.enAttente()));

// ---------- Un autre appareil : il télécharge à la demande ----------
P._utiliserStockage(P.stockageMemoire());     // appareil neuf
const avant = gh.requetes.length;
const lu = await P.lirePhoto(r2);
check('autre appareil : la photo est téléchargée', lu === IMG);
await P.lirePhoto(r2);
check('autre appareil : téléchargée une seule fois, puis gardée',
  gh.requetes.slice(avant).filter(x => x.startsWith('GET')).length === 1, gh.requetes.slice(avant).join(' | '));
check('autre appareil : pas encore envoyée → null, sans erreur', (await P.lirePhoto('photos/pas-encore.jpg')) === null);

// ---------- Carnet dans un sous-dossier ----------
ghMod.enregistrerConfigGitHub({ owner: 'moi', repo: 'carnet-data', token: 'jeton-test', path: 'donnees/carnet.json' });
const r3 = P.nouvelleRef('plongee3', 3);
await P.enregistrerPhoto(r3, IMG);
await P.envoyerEnAttente();
check('sous-dossier : la photo suit le carnet', gh.fichiers.has('donnees/' + r3), [...gh.fichiers.keys()].join(','));

// ---------- Dernière page (reste sur l'appareil) ----------
await P.garderDernierePage(IMG);
const dp = await P.dernierePage();
check('dernière page : gardée, avec sa date', dp?.dataUrl === IMG && !!dp.date);
check('dernière page : jamais envoyée', ![...gh.fichiers.keys()].some(k => /derniere/.test(k)));

// ---------- La plongée ne porte qu'une référence ----------
const { emptyDive } = await imp('js/model.js');
const dv = emptyDive('moi', 1);
check('modèle : pas de photo par défaut', dv.photoCarnet === null);

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith(' FAIL')).length;
console.log(failed ? `\n${failed} test(s) en échec` : '\nPhotos du carnet : tous les tests passent.');
process.exit(failed ? 1 : 0);
