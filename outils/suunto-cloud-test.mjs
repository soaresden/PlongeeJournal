// Compte Suunto (API officielle) : connexion OAuth, jetons, liste des
// activités, .fit, et alignement avec le carnet — contre un faux Suunto.
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
const imp = rel => import(__p2u(path.join(ROOT, rel)).href);

// Un faux navigateur : mémoire locale + hasard.
const memoire = new Map();
globalThis.localStorage = {
  getItem: k => (memoire.has(k) ? memoire.get(k) : null),
  setItem: (k, v) => memoire.set(k, String(v)),
  removeItem: k => memoire.delete(k),
};
globalThis.window = {};

const C = await imp('js/suunto-cloud.js');
const A = await imp('js/suunto-aligner.js');
const { fitToDive, genreFit } = await imp('js/fit.js');
const { fitPlongee } = await imp('outils/fit-fabrique.mjs');

const results = [];
const check = (name, cond, extra = '') => results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));
const attendu = async (fn, motif) => { try { await fn(); return 'aucune erreur'; } catch (e) { return motif.test(e.message) ? true : e.message; } };

const b64url = o => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = payload => `${b64url({ alg: 'HS256' })}.${b64url(payload)}.signature`;

const cles = { clientId: 'appli-carnet', clientSecret: 's3cret', cleAbonnement: 'abo-123' };
const T0 = Date.parse('2026-11-05T10:00:00Z');

// ---------- Connexion ----------
{
  const l = { ...C.liaisonVide(), ...cles };
  const etat = C.nouvelEtat();
  const u = new URL(C.lienAutorisation(l, etat));
  check('lien de connexion : adresse OAuth Suunto', u.origin === 'https://cloudapi-oauth.suunto.com' && u.pathname === '/oauth/authorize');
  check('lien de connexion : client, retour, état', u.searchParams.get('client_id') === 'appli-carnet'
    && u.searchParams.get('redirect_uri') === 'https://soaresden.github.io/PlongeeJournal/'
    && u.searchParams.get('state') === etat && u.searchParams.get('response_type') === 'code', u.toString());
  check('le secret n’est jamais dans le lien', !u.toString().includes('s3cret') && !u.toString().includes('abo-123'));
  check('état vérifié une seule fois', C.verifierEtat(etat) === true && C.verifierEtat(etat) === false);
  C.nouvelEtat();
  check('état d’une autre demande refusé', C.verifierEtat('pas-le-bon') === false);
  const e2 = C.nouvelEtat();
  check('état trop vieux refusé', C.verifierEtat(e2, Date.now() + 31 * 60 * 1000) === false);

  let requete = null;
  const fauxOAuth = (reponse, status = 200) => async (url, opts) => {
    requete = { url, ...opts };
    return { ok: status === 200, status, text: async () => (typeof reponse === 'string' ? reponse : JSON.stringify(reponse)) };
  };
  const acces = jwt({ user: 'denis.plongeur', exp: T0 / 1000 + 86400 });
  const reliee = await C.echangerCode(l, 'CODE42', { f: fauxOAuth({ access_token: acces, refresh_token: 'R1', expires_in: 86400 }), maintenant: T0 });
  const corps = new URLSearchParams(requete.body);
  check('échange : POST sur /oauth/token', requete.url === 'https://cloudapi-oauth.suunto.com/oauth/token' && requete.method === 'POST');
  check('échange : identifiant et secret en Basic', requete.headers.Authorization === `Basic ${Buffer.from('appli-carnet:s3cret').toString('base64')}`);
  check('échange : code et adresse de retour', corps.get('grant_type') === 'authorization_code' && corps.get('code') === 'CODE42'
    && corps.get('redirect_uri') === 'https://soaresden.github.io/PlongeeJournal/');
  check('échange : jetons et nom du compte', reliee.jeton.acces === acces && reliee.jeton.refresh === 'R1'
    && reliee.jeton.expire === T0 + 86400 * 1000 && reliee.compte === 'denis.plongeur', JSON.stringify(reliee));
  check('liaison reliée', C.estRelie(reliee) && !C.estRelie(l));

  check('code expiré expliqué', await attendu(() => C.echangerCode(l, 'X', { f: fauxOAuth('{"error":"invalid_grant"}', 400) }), /Reconnecte/));
  check('mauvais secret expliqué', await attendu(() => C.echangerCode(l, 'X', { f: fauxOAuth('{"error":"invalid_client"}', 401) }), /secret client refusé/));
  check('adresse de retour différente expliquée', await attendu(() => C.echangerCode(l, 'X',
    { f: fauxOAuth('{"error":"invalid_request","error_description":"redirect_uri mismatch"}', 400) }), /adresse de retour/));
  check('pas de réseau expliqué', await attendu(() => C.echangerCode(l, 'X', { f: async () => { throw new TypeError('fetch'); } }), /injoignable/));

  // Renouvellement
  let appels = 0;
  const neuf = await C.jetonValide(reliee, { f: async () => { appels++; }, maintenant: T0 + 3600 * 1000 });
  check('jeton encore bon : pas d’appel', !neuf.change && appels === 0 && neuf.acces === acces);
  const acces2 = jwt({ user: 'denis.plongeur' });
  const r = await C.jetonValide(reliee, { f: fauxOAuth({ access_token: acces2, expires_in: 86400 }), maintenant: T0 + 86200 * 1000 });
  const corpsR = new URLSearchParams(requete.body);
  check('jeton presque expiré : renouvelé', r.change && r.acces === acces2 && corpsR.get('grant_type') === 'refresh_token' && corpsR.get('refresh_token') === 'R1');
  check('renouvellement sans nouveau refresh : on garde l’ancien', r.liaison.jeton.refresh === 'R1');
  check('refresh refusé → reconnexion demandée', await attendu(
    () => C.jetonValide(reliee, { f: fauxOAuth('{"error":"invalid_grant"}', 400), maintenant: T0 + 90000 * 1000 }), /Reconnecte/));
}

// ---------- Liaison : deux appareils ----------
{
  const pc = { ...C.liaisonVide(), ...cles, jeton: { acces: 'A', refresh: 'R1', expire: 100 }, types: { 1: 'sport' }, majLe: '2026-11-05T10:00:00Z' };
  const tel = { ...C.liaisonVide(), ...cles, jeton: { acces: 'B', refresh: 'R2', expire: 200 }, types: { 83: 'plongee' }, majLe: '2026-11-05T09:00:00Z' };
  const f = C.fusionnerLiaisons(pc, tel);
  check('fusion : le jeton le plus frais gagne', f.jeton.refresh === 'R2');
  check('fusion : types appris des deux côtés', f.types[1] === 'sport' && f.types[83] === 'plongee');
  const deliee = { ...pc, jeton: null, compte: null, delieLe: '2026-11-05T11:00:00Z', majLe: '2026-11-05T11:00:00Z' };
  check('fusion : un compte délié ne ressuscite pas', C.fusionnerLiaisons(tel, deliee).jeton === null);

  // PC relié, mais l'écriture sur GitHub a échoué : GitHub n'a que les clés.
  const github = { ...C.liaisonVide(), ...cles, majLe: '2026-11-05T16:39:28Z' };
  const pcRelie = { ...C.liaisonVide(), ...cles, jeton: { acces: 'A', refresh: 'R1', expire: 300 },
    compte: 'denis', lieLe: '2026-11-05T16:40:10Z', majLe: '2026-11-05T16:40:10Z' };
  const surPc = C.fusionnerLiaisons(pcRelie, github);
  check('remontée : le PC relié pousse sa copie sur GitHub', C.estRelie(surPc) && C.enAvanceSurGitHub(surPc, github));
  const telAncien = { ...C.liaisonVide(), ...cles, majLe: '2026-11-05T16:38:57Z' };
  const surTel = C.fusionnerLiaisons(telAncien, { ...C.liaisonVide(), ...surPc });
  check('remontée : la tablette récupère la liaison sans rien réécrire',
    C.estRelie(surTel) && !C.enAvanceSurGitHub(surTel, { ...C.liaisonVide(), ...surPc }));
  check('remontée : mêmes types dans un autre ordre = rien à écrire',
    !C.enAvanceSurGitHub({ ...github, types: { 1: 'a', 2: 'b' } }, { ...github, types: { 2: 'b', 1: 'a' } }));
  check('remontée : GitHub sans fichier, clés saisies ici → on crée',
    C.enAvanceSurGitHub(telAncien, null) && !C.enAvanceSurGitHub(C.liaisonVide(), null));
  memoire.clear();
  const { liaison } = await C.chargerLiaison({ github: false });
  check('sans GitHub : liaison vide sur l’appareil', !C.estRelie(liaison) && liaison.redirectUri === C.RETOUR_DEFAUT);
  await C.sauverLiaison({ ...liaison, ...cles }, { github: false });
  check('sans GitHub : gardée sur l’appareil', (await C.chargerLiaison({ github: false })).liaison.clientId === 'appli-carnet');
}

// ---------- API : liste et .fit ----------
const N = 230;
const activitesFaux = Array.from({ length: N }, (_, i) => ({
  workoutKey: (0x5bd6e917 + i).toString(16).padStart(8, '0') + '52ce7b074fc4f8d1',
  activityId: i % 10 === 0 ? 83 : i % 3 === 0 ? 21 : 1,
  startTime: Date.parse('2024-01-01T09:00:00Z') + i * 86400000,
  totalTime: 3000 + i,
}));

function fauxSuunto({ ordre = 'recent', exigeBearer = true, version = 'v3' } = {}) {
  const journal = [];
  let refus = 0, limite = 0;
  const http = async (url, { headers }) => {
    const u = new URL(url);
    journal.push(u.pathname + u.search);
    if (headers['Ocp-Apim-Subscription-Key'] !== 'abo-123') return { status: 401, ok: false, texte: 'Access denied due to missing subscription key. Make sure to include subscription key when making requests to an API. (SubscriptionKeyNotFound)' };
    if (http.refuserProchain) { http.refuserProchain = false; refus++; return { status: 401, ok: false, texte: 'jeton expiré' }; }
    if (http.limiterProchain) { http.limiterProchain--; limite++; return { status: 429, ok: false, texte: 'Rate limit', entetes: { 'retry-after': '7' } }; }
    if (exigeBearer && !/^Bearer /.test(headers.Authorization)) return { status: 401, ok: false, texte: 'pas de jeton' };
    if (u.pathname === `/${version}/workouts`) {
      // Comme la doc v3 : since inclusif, until exclusif, limit plafonné
      // (ici à 50), offset ; la v2 du test ignore offset.
      const limit = Math.min(Number(u.searchParams.get('limit')) || 50, 50);
      const offset = version === 'v3' ? Number(u.searchParams.get('offset')) || 0 : 0;
      const until = u.searchParams.get('until'), since = u.searchParams.get('since');
      if (version === 'v3' && u.searchParams.get('filter-by-modification-time') !== 'false') {
        return { status: 200, ok: true, texte: JSON.stringify({ error: null, payload: [] }) };   // filtré sur la modif : rien
      }
      let liste = activitesFaux.filter(a => (!until || a.startTime < +until) && (!since || a.startTime >= +since));
      if (ordre === 'recent') liste = [...liste].reverse();
      liste = liste.slice(offset, offset + limit);
      return { status: 200, ok: true, texte: JSON.stringify({ error: null, payload: liste, metadata: { workoutcount: String(liste.length) } }) };
    }
    const m = version === 'v3' ? /^\/v3\/workouts\/(\w+)\/fit$/.exec(u.pathname) : /^\/v2\/workout\/exportFit\/(\w+)$/.exec(u.pathname);
    if (m) return { status: 200, ok: true, octets: Uint8Array.from([1, 2, 3, m[1].length]), texte: null };
    return { status: 404, ok: false, texte: 'introuvable' };
  };
  return { http, journal, stats: () => ({ refus, limite }) };
}

{
  const acces = jwt({ user: 'denis.plongeur' });
  const liaison = { ...C.liaisonVide(), ...cles, jeton: { acces, refresh: 'R1', expire: Date.now() + 86400000 } };
  for (const ordre of ['recent', 'ancien']) {
    const faux = fauxSuunto({ ordre });
    const client = new C.ClientSuunto(liaison, { http: faux.http, fJeton: async () => { throw new Error('pas d’appel OAuth attendu'); } });
    const liste = await client.activites({ parPage: 100 });
    check(`liste complète (API qui rend les plus ${ordre === 'recent' ? 'récentes' : 'anciennes'} d’abord)`,
      liste.length === N && new Set(liste.map(a => a.cle)).size === N, `${liste.length} — ${faux.journal.join(' ')}`);
    check(`liste triée par date (${ordre})`, liste.every((a, i) => !i || a.debut >= liste[i - 1].debut));
  }
  {
    const v2 = fauxSuunto({ version: 'v2' });
    const ancien = new C.ClientSuunto(liaison, { http: v2.http, fJeton: async () => { throw new Error('non'); } });
    const liste = await ancien.activites({ parPage: 100 });
    const o = await ancien.fit(activitesFaux[3].workoutKey);
    check('API v2 seulement : on s’y replie (liste et .fit)', liste.length === N && o.length === 4, v2.journal.slice(0, 4).join(' '));
    const v3 = fauxSuunto();
    await new C.ClientSuunto(liaison, { http: v3.http }).fit(activitesFaux[3].workoutKey);
    check('API v3 : adresse /v3/workouts/{clé}/fit', v3.journal[0] === `/v3/workouts/${activitesFaux[3].workoutKey}/fit`, v3.journal.join(' '));
  }
  const faux = fauxSuunto();
  let renouvele = 0, pauses = [];
  const client = new C.ClientSuunto(liaison, {
    http: faux.http,
    fJeton: async () => { renouvele++; return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: jwt({ user: 'x' }), refresh_token: 'R2', expires_in: 86400 }) }; },
    surLiaison: l => { client.enregistree = l; },
    attendre: async ms => { pauses.push(ms); },
  });
  faux.http.refuserProchain = true;
  const octets = await client.fit(activitesFaux[0].workoutKey);
  check('.fit téléchargé', octets instanceof Uint8Array && octets.length === 4);
  check('401 → jeton renouvelé puis nouvel essai', renouvele === 1 && client.enregistree?.jeton.refresh === 'R2');
  faux.http.limiterProchain = 2;
  await client.fit(activitesFaux[1].workoutKey);
  check('429 → pause demandée par Suunto respectée', pauses.length === 2 && pauses[0] === 7000, JSON.stringify(pauses));
  faux.http.limiterProchain = 5;
  check('429 qui dure → arrêt propre, reprise possible', await attendu(() => client.fit(activitesFaux[2].workoutKey), /limite le nombre d’appels/));
  const sansCle = new C.ClientSuunto({ ...liaison, cleAbonnement: 'faux' }, { http: fauxSuunto().http, fJeton: async () => ({ ok: false, status: 400, text: async () => 'invalid_grant' }) });
  check('clé d’abonnement refusée expliquée (pas une reconnexion)', await attendu(() => sansCle.fit('abc'), /Primary key/));
  check('activité en secondes ou ms', A && C.normaliserActivite({ workoutKey: 'k', startTime: 1730800000 }).debut === 1730800000000
    && C.normaliserActivite({ workoutKey: 'k', startTime: 1730800000000 }).debut === 1730800000000);
  check('profondeur lue dans les extensions', C.normaliserActivite({ workoutKey: 'k', extensions: [{ type: 'DiveHeaderExtension', maxDepth: 18.4 }] }).profMax === 18.4);
}

// ---------- .fit refusé, redirection ----------
{
  const acces = jwt({ user: 'denis.plongeur' });
  const liaison = { ...C.liaisonVide(), ...cles, jeton: { acces, refresh: 'R1', expire: Date.now() + 86400000 } };
  const sansOAuth = async () => { throw new Error('pas de renouvellement attendu'); };
  const faux = (fitV3, fitV2) => {
    const vus = [];
    const http = async url => {
      const u = new URL(url); vus.push(u.pathname);
      if (u.pathname === '/v3/workouts') return { status: 200, ok: true, texte: JSON.stringify({ error: null, payload: [] }) };
      if (u.pathname.startsWith('/v3/workouts/')) return fitV3;
      return fitV2;
    };
    return { http, vus };
  };
  const ok = { status: 200, ok: true, octets: Uint8Array.from([9, 9]) };
  const refus = { status: 401, ok: false, texte: 'Unauthorized' };

  let f = faux(refus, ok);
  let cl = new C.ClientSuunto(liaison, { http: f.http, fJeton: sansOAuth });
  await cl.activites();
  const o = await cl.fit('k1');
  check('.fit v3 refusé, liste OK : on prend l’adresse v2, sans renouveler le jeton', o.length === 2 && f.vus.includes('/v2/workout/exportFit/k1'),
    f.vus.join(' '));

  f = faux(refus, { status: 404, ok: false, texte: '' });
  cl = new C.ClientSuunto(liaison, { http: f.http, fJeton: sansOAuth });
  await cl.activites();
  let err = null;
  try { await cl.fit('k2'); } catch (e) { err = e; }
  check('.fit refusé partout : erreur « pour tout le compte », sans demander de reconnecter',
    err?.systeme === true && !err.reconnecter && /refuse le \.fit \(401\)/.test(err.message), err?.message);

  // Couche native : redirection vers un stockage, suivie SANS nos en-têtes.
  const requetes = [];
  globalThis.window = { Capacitor: { isNativePlatform: () => true, Plugins: { CapacitorHttp: { request: async opts => {
    requetes.push(opts);
    if (opts.url.startsWith('https://cloudapi.suunto.com/')) return { status: 302, headers: { Location: 'https://stockage.example/f.fit?sig=1' }, data: '' };
    if (opts.headers.Authorization) return { status: 401, headers: {}, data: Buffer.from('<Error>jeton refusé</Error>').toString('base64') };
    return { status: 200, headers: {}, data: Buffer.from([1, 2, 3]).toString('base64') };
  } } } } };
  const natif = C.httpParDefaut();
  const r = await natif('https://cloudapi.suunto.com/v3/workouts/k/fit', { binaire: true, headers: { Authorization: 'Bearer x', 'Ocp-Apim-Subscription-Key': 'abo' } });
  check('natif : redirection suivie sans le jeton ni la clé', r.ok && r.octets.length === 3 && requetes[0].disableRedirects === true
    && Object.keys(requetes[1].headers).length === 0 && /stockage\.example/.test(r.redirige || ''), JSON.stringify(requetes.map(q => q.url)));
  globalThis.window.Capacitor.Plugins.CapacitorHttp.request = async () => ({ status: 401, headers: {}, data: Buffer.from('Access denied: scope').toString('base64') });
  const e401 = await natif('https://cloudapi.suunto.com/v3/workouts/k/fit', { binaire: true, headers: {} });
  check('natif : le corps d’une erreur binaire est lisible dans le journal', e401.status === 401 && e401.texte === 'Access denied: scope', e401.texte);
  globalThis.window = {};
}

// ---------- Snorkeling, fiche sans .fit ----------
{
  const act = { cle: 'sn1', activite: 90, debut: Date.parse('2025-08-10T09:30:00Z'), dureeS: 3540, profMax: 4.2 };
  const dec = A.decDepuisListe(act);
  check('sans .fit : date, durée, profondeur depuis la liste', dec.start.getTime() === act.debut && dec.dureeMin === 59 && dec.profMax === 4.2 && dec.sansFit);
  const p = A.proposer(act, dec, []);
  check('snorkeling (n°90) → séance snorkeling', A.genreActivite(act, dec) === 'snorkeling' && p.action === 'ajouter' && p.rangement === 'snorkeling', JSON.stringify(p));
  check('apnée (n°79) → séance apnée', A.proposer({ ...act, activite: 79 }, A.decDepuisListe({ ...act, activite: 79 }), []).rangement === 'apnee');
  check('natation (n°21) → séance piscine', A.proposer({ ...act, activite: 21 }, A.decDepuisListe({ ...act, activite: 21 }), []).rangement === 'piscine');
}

// ---------- FIT : bloc, gaz, gradients, GPS, sport ----------
{
  const d = fitToDive(fitPlongee());
  check('FIT : sport plongée', d.genre === 'plongee' && d.sport === 53);
  check('FIT : pression du Tank POD', d.pressionDepart === 200 && d.pressionFin === 65, `${d.pressionDepart}→${d.pressionFin}`);
  check('FIT : nitrox 32', d.gazO2 === 32 && !d.gazHe);
  check('FIT : gradients 40/85, eau douce', d.gf?.bas === 40 && d.gf?.haut === 85 && d.eau === 'douce');
  check('FIT : position de départ', Math.abs(d.lieu.lat - 48.9) < 1e-4 && Math.abs(d.lieu.lng - 2.25) < 1e-4, JSON.stringify(d.lieu));
  check('FIT : profil et profondeur', d.samples.length > 80 && d.profMax === 12 && d.dureeMin === 45);
  check('FIT : apnée (sous-sport 56)', fitToDive(fitPlongee({ sub: 56, tank: false })).genre === 'apnee');
  check('FIT : sans GPS → pas de position fantôme', fitToDive(fitPlongee({ lat: 0, lng: 0 })).lieu === null);
  check('genres FIT', genreFit(5, 17) === 'natation' && genreFit(1, null) === 'sport' && genreFit(53, 57) === 'apnee' && genreFit(null) === null);
}

// ---------- Alignement avec le carnet ----------
{
  const dec = fitToDive(fitPlongee());
  const debut = +dec.start;
  const act = { cle: '5bd6e91752ce7b074fc4f8d1', activite: 83, debut };
  const local = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const hhmm = d => d.toTimeString().slice(0, 5);
  const saisie = { id: 'd1', numero: 12, date: local(dec.start), heureImmersion: hhmm(dec.start), profMax: 11.5, dureeMin: null,
    pressionDepart: null, pressionFin: null, lat: null, lng: null, eau: '', gazType: 'air', gazO2: null, suuntoKeys: [] };

  const t = A.trouverDansCarnet(act, [saisie]);
  check('retrouvée par la date et l’heure', t?.entree.id === 'd1' && !t.liee);
  check('retrouvée par la clé Bluetooth', A.trouverDansCarnet(act, [{ id: 'b', suuntoKeys: [`ocean:${Math.round(debut / 1000) + 120}`] }])?.comment === 'importée en Bluetooth');
  check('déjà liée par la clé Suunto', A.trouverDansCarnet(act, [{ id: 'c', suuntoKeys: [A.CLE_SUUNTO(act.cle)] }])?.liee === true);
  check('une heure d’écart : pas la même', A.trouverDansCarnet(act, [{ ...saisie, heureImmersion: hhmm(new Date(debut + 3600e3)) }]) === null);

  // Doublons : ancien export (clé sans préfixe), plongée à l'étranger.
  const ancien = A.trouverDansCarnet(act, [{ id: 'st', suuntoKeys: [act.cle] }]);
  check('doublon : clé de l’ancien export reconnue, puis liée', ancien?.entree.id === 'st' && !ancien.liee);
  const decalage = -new Date(debut).getTimezoneOffset() + 180;               // lieu à +3 h de l'appareil
  const surPlace = new Date(debut + decalage * 60e3);
  const iso = surPlace.toISOString();
  const etranger = { id: 'eg', date: iso.slice(0, 10), heureImmersion: iso.slice(11, 16), suuntoKeys: [] };
  check('doublon : plongée à l’étranger reconnue à l’heure du lieu',
    A.trouverDansCarnet({ ...act, decalageMin: decalage }, [etranger])?.entree.id === 'eg');
  check('doublon : sans fuseau Suunto, l’heure du lieu ne suffit pas', A.trouverDansCarnet(act, [etranger]) === null);
  check('fuseau lu dans la liste Suunto', C.normaliserActivite({ workoutKey: 'k', startTime: debut, timeOffsetInMinutes: 120 }).decalageMin === 120
    && C.normaliserActivite({ workoutKey: 'k', startTime: debut }).decalageMin === null);

  const p = A.proposer(act, dec, [saisie]);
  check('plongée saisie à la main : complétée', p.action === 'completer' && p.entree.id === 'd1');
  check('ce qui est saisi n’est pas écrasé', !('profMax' in p.champs), JSON.stringify(p.champs));
  check('le bloc, la durée, le GPS, l’eau, le nitrox sont ajoutés', p.champs.pressionDepart === 200 && p.champs.pressionFin === 65
    && p.champs.dureeMin === 45 && p.champs.lat && p.champs.eau === 'douce' && p.champs.gazType === 'nitrox' && p.champs.gazO2 === 32,
    JSON.stringify(p.champs));
  check('profil ajouté', p.champs.samples?.length > 80 && p.libelles.includes('profil'));
  const complet = { ...saisie, ...p.champs, suuntoKeys: [A.CLE_SUUNTO(act.cle)] };
  check('une fois liée et complète : rien à faire', A.proposer(act, dec, [complet]).action === 'rien');
  check('pression pré-remplie 200 → 50 : remplacée par le Tank POD',
    A.completerPlongee({ ...saisie, pressionDepart: 200, pressionFin: 50 }, dec).champs.pressionFin === 65);
  check('pression réellement saisie : pas touchée',
    !('pressionDepart' in A.completerPlongee({ ...saisie, pressionDepart: 210, pressionFin: 70 }, dec).champs));
  check('mélange déjà saisi : pas touché', !('gazType' in A.completerPlongee({ ...saisie, gazType: 'nitrox', gazO2: 36 }, dec).champs));

  check('absente : ajoutée (jeudi soir ≤ 25 m → fosse)', A.proposer(act, dec, []).action === 'ajouter'
    && A.proposer(act, dec, []).rangement === (new Date(debut).getDay() === 4 ? 'fosse' : 'plongee'));
  const nage = { ...dec, genre: 'natation', profMax: null };
  check('natation → séance piscine', A.proposer(act, nage, []).rangement === 'piscine');
  check('apnée → séance apnée', A.proposer(act, { ...dec, genre: 'apnee' }, []).rangement === 'apnee');
  check('n° officiel 79 (apnée) prime sur le .fit « plongée »', A.proposer({ ...act, activite: 79 }, dec, []).rangement === 'apnee');
  check('n° officiels : plongée 78, natation 21, sans .fit', A.genreConnu({}, 78) === 'plongee' && A.genreConnu({}, 21) === 'natation'
    && !A.aExaminer({ activite: 1 }, { 1: 'sport' }));
  check('autre sport ignoré', A.proposer(act, { ...dec, genre: 'sport' }, []).action === 'ignorer');
  const seance = { id: 's1', type: 'piscine', date: saisie.date, heureImmersion: saisie.heureImmersion, heure: saisie.heureImmersion,
    seance: true, dureeMin: null, tempEau: null, suuntoKeys: [] };
  const ps = A.proposer(act, nage, [seance]);
  check('séance déjà pointée : complétée (durée, température)', ps.action === 'completer' && ps.champs.dureeMin === 45 && ps.champs.tempEau === 26
    && !('profMax' in ps.champs), JSON.stringify(ps.champs));

  check('type appris : la course n’est plus examinée', !A.aExaminer({ activite: 1 }, { 1: 'sport' }) && A.aExaminer({ activite: 83 }, { 83: 'plongee' })
    && A.aExaminer({ activite: 99 }, {}));

  const meta = A.metaSuunto(act, dec);
  check('fiche : origine Suunto, GF, eau', meta.cle === 'suunto:5bd6e91752ce7b074fc4f8d1' && meta.gf === '40/85' && meta.eau === 'douce' && meta.source === 'suunto-cloud');
}

// ---------- Numéros dans l'ordre des dates ----------
{
  const dives = [
    { id: 'a', numero: 12, date: '2025-06-01', heureImmersion: '10:00' },
    { id: 'b', numero: 13, date: '2025-07-01', heureImmersion: '10:00' },
    { id: 'c', numero: 14, date: '2023-05-01', heureImmersion: '09:00' },   // ancienne, importée
    { id: 'd', numero: 15, date: '2025-07-01', heureImmersion: '15:00' },
  ];
  const m = A.numerotationChronologique(dives);
  check('renumérotation : à partir du premier numéro', m.get('c') === 12 && m.get('a') === 13 && m.get('b') === 14 && !m.has('d'), JSON.stringify([...m]));
  check('renumérotation : rien si déjà dans l’ordre', A.numerotationChronologique([dives[0], dives[1]]).size === 0);
}

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith(' FAIL')).length;
console.log(failed ? `\n${failed} test(s) en échec` : `\n${results.length} vérifications, toutes passent.`);
process.exit(failed ? 1 : 0);
