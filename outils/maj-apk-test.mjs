// Mise à jour de l'APK : lecture des numéros, comparaison avec la
// release GitHub, vérification discrète une fois par jour, build www.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));

// Un faux téléphone : Capacitor natif + mémoire locale.
const memoire = new Map();
globalThis.localStorage = {
  getItem: k => memoire.has(k) ? memoire.get(k) : null,
  setItem: (k, v) => memoire.set(k, String(v)),
  removeItem: k => memoire.delete(k),
};
globalThis.window = { Capacitor: { isNativePlatform: () => true } };

const M = await import(__p2u(path.join(ROOT, 'js/maj-apk.js')).href);

const results = [];
const check = (name, cond, extra = '') => results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

const release = (n, sha = 'abc1234') => ({
  name: `Carnet de plongée — APK 2.0.${n}`, tag_name: 'android', published_at: '2026-11-05T09:00:00Z',
  body: `APK Android compilé depuis ${sha}. Sur le téléphone ou la tablette : télécharger…`,
  assets: [{ name: 'PlongeeJournal.apk', size: 4_404_019, updated_at: '2026-11-05T09:01:00Z',
    browser_download_url: 'https://github.com/soaresden/PlongeeJournal/releases/download/android/PlongeeJournal.apk' }],
});
let appels = [];
const fauxGitHub = ({ installee = 40, publiee = 42, statut = 200, panne = false } = {}) => async (url) => {
  const u = String(url);
  appels.push(u);
  if (u.endsWith('version.json')) {
    return installee === null ? { ok: false, status: 404, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => ({ build: installee, version: `2.0.${installee}`, commit: 'def5678' }) };
  }
  if (panne) throw new TypeError('Failed to fetch');
  if (u.includes('/releases/tags/android')) {
    return { ok: statut === 200, status: statut, json: async () => release(publiee) };
  }
  if (u.includes('/compare/def5678...abc1234')) {
    return { ok: true, status: 200, json: async () => ({ commits: [
      { commit: { message: 'Séances : fosse, piscine, apnée\n\nDétail…' } },
      { commit: { message: 'Bouton mise à jour de l’APK' } },
    ] }) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

// ---------- Numéros ----------
check('titre de release → numéro', JSON.stringify(M.lireNumero('Carnet de plongée — APK 2.0.57')) === '{"version":"2.0.57","build":57}');
check('titre sans numéro → null', M.lireNumero('android') === null && M.lireNumero(undefined) === null);
check('comparer : plus récent', M.comparer({ build: 40 }, { build: 42 }) === 'nouvelle');
check('comparer : même numéro', M.comparer({ build: 42 }, { build: 42 }) === 'a-jour');
check('comparer : installée plus récente (compilation en cours)', M.comparer({ build: 43 }, { build: 42 }) === 'a-jour');
check('comparer : installée sans numéro', M.comparer(null, { build: 42 }) === 'inconnue');
check('taille lisible', M.taillePropre(4_404_019) === '4,2 Mo', M.taillePropre(4_404_019));

// ---------- Vérification ----------
{
  const r = await M.verifier(fauxGitHub());
  check('vérifier : nouvelle version trouvée', r.etat === 'nouvelle' && r.derniere.version === '2.0.42' && r.installee.build === 40, JSON.stringify(r));
  check('vérifier : lien et taille de l’APK', /PlongeeJournal\.apk$/.test(r.derniere.url) && r.derniere.taille === 4_404_019);
  check('vérifier : commit de la release lu', r.derniere.commit === 'abc1234', r.derniere.commit);
  check('l’API publique est appelée sans jeton', appels.some(u => u === 'https://api.github.com/repos/soaresden/PlongeeJournal/releases/tags/android'));
  const titres = await M.nouveautes(r.installee.commit, r.derniere.commit, fauxGitHub());
  check('nouveautés : titres des commits, du plus récent au plus ancien',
    titres.length === 2 && titres[0] === 'Bouton mise à jour de l’APK' && titres[1] === 'Séances : fosse, piscine, apnée', JSON.stringify(titres));
  check('nouveautés : rien sans commit installé', (await M.nouveautes(null, 'abc1234', fauxGitHub())).length === 0);
}
{
  const r = await M.verifier(fauxGitHub({ installee: 42 }));
  check('vérifier : à jour', r.etat === 'a-jour');
  const r2 = await M.verifier(fauxGitHub({ installee: null }));
  check('vérifier : APK ancien sans numéro → inconnue', r2.etat === 'inconnue' && r2.installee === null);
}
for (const [statut, motif] of [[404, /Aucune version publiée/], [403, /limite/], [500, /500/]]) {
  let msg = '';
  try { await M.verifier(fauxGitHub({ statut })); } catch (e) { msg = e.message; }
  check(`erreur GitHub ${statut} expliquée`, motif.test(msg), msg);
}
{
  let msg = '';
  try { await M.verifier(fauxGitHub({ panne: true })); } catch (e) { msg = e.message; }
  check('hors réseau expliqué', /Pas de réseau/.test(msg), msg);
}

// ---------- Vérification discrète à l'ouverture ----------
{
  memoire.clear(); appels = [];
  const t0 = Date.parse('2026-11-05T10:00:00Z');
  const r = await M.verifierEnFond(fauxGitHub(), t0);
  check('en fond : annonce la nouvelle version', r?.derniere?.build === 42);
  appels = [];
  const r2 = await M.verifierEnFond(fauxGitHub(), t0 + 3600_000);
  check('en fond : pas deux fois dans la journée', r2 === null && appels.length === 0, appels.join(','));
  M.ecarter(42);
  const r3 = await M.verifierEnFond(fauxGitHub(), t0 + 25 * 3600_000);
  check('en fond : version écartée plus annoncée', r3 === null);
  const r4 = await M.verifierEnFond(fauxGitHub({ publiee: 43 }), t0 + 50 * 3600_000);
  check('en fond : la suivante est annoncée', r4?.derniere?.build === 43);
  const r5 = await M.verifierEnFond(fauxGitHub({ panne: true }), t0 + 80 * 3600_000);
  check('en fond : silencieux sans réseau', r5 === null);
  memoire.clear();
  check('en fond : à jour → rien', (await M.verifierEnFond(fauxGitHub({ installee: 42 }), t0)) === null);
  globalThis.window = {};
  memoire.clear(); appels = [];
  check('site web : aucune vérification', (await M.verifierEnFond(fauxGitHub(), t0)) === null && appels.length === 0 && !M.estApk());
}

// ---------- Téléchargement dans l'appli, puis installateur Android ----------
{
  const URL_REL = 'https://github.com/soaresden/PlongeeJournal/releases/download/android/PlongeeJournal.apk';
  // Faux téléphone : les deux modules natifs, enregistrés par Capacitor.
  const telephone = ({ panneTelechargement = false, panneOuverture = false, sansOpener = false } = {}) => {
    const t = { appels: [], ecouteurs: [], retires: 0, navigateur: [] };
    const Filesystem = {
      addListener: async (nom, fn) => { t.ecouteurs.push({ nom, fn }); return { remove: async () => { t.retires++; } }; },
      downloadFile: async opts => {
        t.appels.push(['download', opts]);
        for (const { fn } of t.ecouteurs) {
          fn({ url: opts.url, bytes: 2_202_009, contentLength: 4_404_019 });
          fn({ url: 'https://ailleurs/autre.bin', bytes: 1, contentLength: 1 });     // autre téléchargement : ignoré
          fn({ url: opts.url, bytes: 4_404_019, contentLength: 4_404_019 });
        }
        if (panneTelechargement) throw new Error('Error downloading file: timeout');
        return { path: '/data/user/0/com.soaresden.plongeejournal/cache/PlongeeJournal.apk' };
      },
    };
    const FileOpener = { open: async opts => { t.appels.push(['open', opts]); if (panneOuverture) throw new Error('Activity not found'); } };
    t.w = { Capacitor: {
      isNativePlatform: () => true,
      isPluginAvailable: nom => nom === 'Filesystem' || (nom === 'FileOpener' && !sansOpener),
      Plugins: { Filesystem, ...(sansOpener ? {} : { FileOpener }) },
    } };
    t.etapes = [];
    t.options = { w: t.w, progres: e => t.etapes.push(e), navigateur: u => t.navigateur.push(u) };
    return t;
  };

  check('pourcentage : arrondi', M.pourcentage(2_202_009, 4_404_019) === 50);
  check('pourcentage : taille inconnue → null', M.pourcentage(100, 0) === null && M.pourcentage(100, undefined) === null);

  const t = telephone();
  check('modules natifs détectés', !!M.modulesNatifs(t.w));
  const r = await M.telechargerApk(URL_REL, t.options);
  const dl = t.appels.find(a => a[0] === 'download')?.[1];
  const op = t.appels.find(a => a[0] === 'open')?.[1];
  check('appli : téléchargée puis installateur ouvert', r === 'installateur' && t.navigateur.length === 0, `${r} ${t.navigateur}`);
  check('appli : rangée dans le cache de l’appli (aucune permission de stockage)',
    dl?.directory === 'CACHE' && dl.path === 'PlongeeJournal.apk' && dl.progress === true && dl.url === URL_REL, JSON.stringify(dl));
  check('appli : ouverte comme un APK, depuis le fichier téléchargé',
    op?.contentType === 'application/vnd.android.package-archive' && /cache\/PlongeeJournal\.apk$/.test(op.filePath), JSON.stringify(op));
  const pourcents = t.etapes.filter(e => e.etape === 'telechargement').map(e => e.pourcent);
  check('appli : progression affichée, autres téléchargements ignorés',
    JSON.stringify(pourcents) === '[0,50,100]', JSON.stringify(pourcents));
  check('appli : annonce l’installation', t.etapes.at(-1)?.etape === 'installation');
  check('appli : l’écoute de la progression est retirée', t.retires === 1);

  // Deux appuis rapprochés : un seul téléchargement.
  const t2 = telephone();
  const [a, b] = await Promise.all([M.telechargerApk(URL_REL, t2.options), M.telechargerApk(URL_REL, t2.options)]);
  check('double appui : un seul téléchargement', a === 'installateur' && b === 'installateur'
    && t2.appels.filter(x => x[0] === 'download').length === 1);

  const t3 = telephone({ panneTelechargement: true });
  const r3 = await M.telechargerApk(URL_REL, t3.options);
  check('échec du téléchargement : on passe par le navigateur',
    r3 === 'navigateur' && t3.navigateur[0] === URL_REL && t3.etapes.at(-1)?.etape === 'secours'
      && /timeout/.test(t3.etapes.at(-1).message), JSON.stringify(t3.etapes.at(-1)));
  check('échec : l’écoute est quand même retirée', t3.retires === 1);

  const t4 = telephone({ panneOuverture: true });
  check('installateur indisponible : navigateur en secours',
    (await M.telechargerApk(URL_REL, t4.options)) === 'navigateur' && t4.navigateur.length === 1);

  const t5 = telephone({ sansOpener: true });
  check('ancien APK sans le module : navigateur directement, sans téléchargement',
    M.modulesNatifs(t5.w) === null && (await M.telechargerApk(URL_REL, t5.options)) === 'navigateur'
      && t5.appels.length === 0 && t5.etapes.length === 0);

  const web = [];
  check('site web : simple lien',
    (await M.telechargerApk(URL_REL, { w: {}, navigateur: u => web.push(u), progres: () => {} })) === 'navigateur' && web.length === 1);
}

// ---------- Le build www embarque le numéro ----------
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pj-www-'));
  for (const nom of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'assets', 'vendor']) {
    fs.cpSync(path.join(ROOT, nom), path.join(tmp, nom), { recursive: true });
  }
  fs.mkdirSync(path.join(tmp, 'outils'));
  fs.copyFileSync(path.join(ROOT, 'outils/build-www.mjs'), path.join(tmp, 'outils/build-www.mjs'));
  const lancer = env => execFileSync(process.execPath, [path.join(tmp, 'outils/build-www.mjs')], { env, stdio: 'pipe' });
  lancer({ ...process.env, GITHUB_RUN_NUMBER: '57', GITHUB_SHA: 'abc1234def' });
  const v = JSON.parse(fs.readFileSync(path.join(tmp, 'www/version.json'), 'utf8'));
  check('www/version.json : numéro du build GitHub', v.build === 57 && v.version === '2.0.57' && v.commit === 'abc1234', JSON.stringify(v));
  check('même numéro que le titre de la release', M.comparer(v, M.lireNumero('Carnet de plongée — APK 2.0.57')) === 'a-jour');
  const env = { ...process.env }; delete env.GITHUB_RUN_NUMBER; delete env.GITHUB_SHA;
  lancer(env);
  const vl = JSON.parse(fs.readFileSync(path.join(tmp, 'www/version.json'), 'utf8'));
  check('build local : pas de numéro inventé', vl.build === null);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith(' FAIL')).length;
console.log(failed ? `\n${failed} test(s) en échec` : `\n${results.length} vérifications, toutes passent.`);
process.exit(failed ? 1 : 0);
