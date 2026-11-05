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

function fauxSuunto({ ordre = 'recent', exigeBearer = true } = {}) {
  const journal = [];
  let refus = 0, limite = 0;
  const http = async (url, { headers }) => {
    const u = new URL(url);
    journal.push(u.pathname + u.search);
    if (headers['Ocp-Apim-Subscription-Key'] !== 'abo-123') return { status: 401, ok: false, texte: '{"message":"Access denied due to missing subscription key"}' };
    if (http.refuserProchain) { http.refuserProchain = false; refus++; return { status: 401, ok: false, texte: 'jeton expiré' }; }
    if (http.limiterProchain) { http.limiterProchain--; limite++; return { status: 429, ok: false, texte: 'Rate limit', entetes: { 'retry-after': '7' } }; }
    if (exigeBearer && !/^Bearer /.test(headers.Authorization)) return { status: 401, ok: false, texte: 'pas de jeton' };
    if (u.pathname === '/v2/workouts') {
      const limit = Number(u.searchParams.get('limit')) || 50;
      const until = u.searchParams.get('until'), since = u.searchParams.get('since');
      let liste = activitesFaux.filter(a => (!until || a.startTime <= +until) && (!since || a.startTime >= +since));
      liste = ordre === 'recent' ? [...liste].reverse().slice(0, limit) : liste.slice(0, limit);
      return { status: 200, ok: true, texte: JSON.stringify({ error: null, payload: liste, metadata: { workoutcount: String(liste.length) } }) };
    }
    const m = /^\/v2\/workout\/exportFit\/(\w+)$/.exec(u.pathname);
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
  check('clé d’abonnement refusée expliquée', await attendu(() => sansCle.fit('abc'), /Reconnecte|abonnement/));
  check('activité en secondes ou ms', A && C.normaliserActivite({ workoutKey: 'k', startTime: 1730800000 }).debut === 1730800000000
    && C.normaliserActivite({ workoutKey: 'k', startTime: 1730800000000 }).debut === 1730800000000);
  check('profondeur lue dans les extensions', C.normaliserActivite({ workoutKey: 'k', extensions: [{ type: 'DiveHeaderExtension', maxDepth: 18.4 }] }).profMax === 18.4);
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
