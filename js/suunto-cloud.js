// ============================================================
//  Compte Suunto (API officielle « Suunto Cloud API »)
//
//  Pas de serveur : tout se passe sur l'appareil.
//   - Connexion (OAuth) : depuis le site, sur le PC. Suunto renvoie
//     sur https://soaresden.github.io/PlongeeJournal/?code=…, et le
//     carnet échange ce code contre des jetons (le serveur OAuth de
//     Suunto accepte les appels depuis un navigateur).
//   - Récupération des activités : dans l'APK. Le serveur des
//     activités refuse les pages web (pas d'en-têtes CORS) ; l'APK
//     passe par la couche HTTP native d'Android.
//
//  La « liaison » (clés de l'appli Suunto + jetons) vit dans
//  suunto.json, à côté du carnet dans le dépôt GitHub privé, pour
//  que le téléphone la retrouve sans rien ressaisir. Sans GitHub,
//  elle reste dans la mémoire de l'appareil. Elle n'est jamais
//  écrite dans le carnet lui-même.
// ============================================================

import { configGitHub, estConfigure, lireCarnet, ecrireCarnet } from './github.js';

export const OAUTH = 'https://cloudapi-oauth.suunto.com';
export const API = 'https://cloudapi.suunto.com';
export const RETOUR_DEFAUT = 'https://soaresden.github.io/PlongeeJournal/';
export const FICHIER = 'suunto.json';
const CLE = 'plongee-journal:suunto';
const CLE_ETAT = 'plongee-journal:suunto-etat';

export class ErreurSuunto extends Error {
  constructor(message, { status = 0, attente = 0, reconnecter = false } = {}) {
    super(message);
    this.status = status;
    this.attente = attente;            // secondes à patienter (429)
    this.reconnecter = reconnecter;    // jetons refusés : refaire la connexion
  }
}

// ------------------------------------------------------------
//  La liaison
// ------------------------------------------------------------

export function liaisonVide() {
  return {
    version: 1,
    clientId: '', clientSecret: '', cleAbonnement: '',
    redirectUri: RETOUR_DEFAUT,
    jeton: null,          // { acces, refresh, expire (ms) }
    compte: null,         // nom du compte Suunto (revendication « user » du JWT)
    lieLe: null,
    types: {},            // n° d'activité Suunto → genre appris d'un .fit
    derniereRecup: null,
    majLe: null,
  };
}

export const clesCompletes = l => !!(l?.clientId && l?.clientSecret && l?.cleAbonnement);
export const estRelie = l => !!(clesCompletes(l) && l?.jeton?.refresh);

function lireLocale() {
  try { return { ...liaisonVide(), ...JSON.parse(localStorage.getItem(CLE) || 'null') }; }
  catch { return liaisonVide(); }
}
function ecrireLocale(l) {
  try { localStorage.setItem(CLE, JSON.stringify(l)); } catch { /* stockage plein */ }
}

/** Deux copies de la liaison (appareil / GitHub) → la plus à jour, sans rien perdre. */
export function fusionnerLiaisons(a, b) {
  if (!a) return b; if (!b) return a;
  const [vieille, recente] = String(a.majLe || '') > String(b.majLe || '') ? [b, a] : [a, b];
  const out = { ...vieille, ...recente, types: { ...(vieille.types || {}), ...(recente.types || {}) } };
  // Le jeton le plus frais gagne, d'où qu'il vienne (Suunto peut en
  // avoir renouvelé un sur l'autre appareil).
  const ja = a.jeton, jb = b.jeton;
  out.jeton = !ja ? jb : !jb ? ja : (ja.expire || 0) >= (jb.expire || 0) ? ja : jb;
  if (!recente.jeton && recente.delieLe && String(recente.delieLe) >= String(vieille.majLe || '')) out.jeton = null;
  return out;
}

const cfgFichier = () => ({ ...configGitHub(), path: FICHIER });

/**
 * Charge la liaison : copie de l'appareil, complétée par celle de
 * GitHub si le carnet y est branché. Ne lève jamais : hors ligne, la
 * copie locale suffit.
 */
export async function chargerLiaison({ github = estConfigure() } = {}) {
  let l = lireLocale();
  let sha = null;
  if (github) {
    try {
      const r = await lireCarnet(cfgFichier());
      sha = r.sha;
      if (r.data) l = fusionnerLiaisons(l, { ...liaisonVide(), ...r.data });
      ecrireLocale(l);
    } catch { /* hors ligne : on garde la copie locale */ }
  }
  return { liaison: l, sha };
}

/** Enregistre la liaison sur l'appareil et, si possible, sur GitHub. */
export async function sauverLiaison(l, { sha = null, message = 'Liaison Suunto', github = estConfigure() } = {}) {
  const propre = { ...l, majLe: new Date().toISOString() };
  ecrireLocale(propre);
  if (!github) return { liaison: propre, sha: null };
  try {
    const nouveau = await ecrireCarnet(propre, sha, message, cfgFichier());
    return { liaison: propre, sha: nouveau };
  } catch (e) {
    if (!e.conflit) throw e;
    // Écrite ailleurs entre-temps : on fusionne et on réessaie une fois.
    const r = await lireCarnet(cfgFichier());
    const fusion = { ...fusionnerLiaisons({ ...liaisonVide(), ...r.data }, propre), majLe: new Date().toISOString() };
    ecrireLocale(fusion);
    const nouveau = await ecrireCarnet(fusion, r.sha, message, cfgFichier());
    return { liaison: fusion, sha: nouveau };
  }
}

// ------------------------------------------------------------
//  Connexion (OAuth « authorization code »)
// ------------------------------------------------------------

export function nouvelEtat() {
  const octets = new Uint8Array(16);
  crypto.getRandomValues(octets);
  const etat = [...octets].map(b => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(CLE_ETAT, JSON.stringify({ etat, le: Date.now() })); } catch { /* */ }
  return etat;
}

/** Le retour de Suunto porte-t-il bien l'état qu'on a envoyé (et pas trop vieux) ? */
export function verifierEtat(etat, maintenant = Date.now()) {
  let memo = null;
  try { memo = JSON.parse(localStorage.getItem(CLE_ETAT) || 'null'); } catch { /* */ }
  try { localStorage.removeItem(CLE_ETAT); } catch { /* */ }
  return !!(memo && etat && memo.etat === etat && maintenant - memo.le < 30 * 60 * 1000);
}

export function lienAutorisation(l, etat) {
  const u = new URL(`${OAUTH}/oauth/authorize`);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', l.clientId);
  u.searchParams.set('redirect_uri', l.redirectUri || RETOUR_DEFAUT);
  u.searchParams.set('state', etat);
  return u.toString();
}

/** Contenu d'un JWT (sans vérification : on ne s'en sert que pour l'affichage et l'échéance). */
export function lireJwt(jwt) {
  try {
    const b = String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const txt = decodeURIComponent([...atob(b)].map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    return JSON.parse(txt);
  } catch { return {}; }
}

async function demandeJeton(l, params, f = fetch) {
  let r;
  try {
    r = await f(`${OAUTH}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${l.clientId}:${l.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(params).toString(),
    });
  } catch {
    throw new ErreurSuunto('Suunto injoignable (pas de réseau ?)');
  }
  const texte = await r.text();
  if (!r.ok) {
    if (r.status === 400 && /invalid_grant/i.test(texte)) {
      throw new ErreurSuunto('Suunto a refusé la connexion (lien expiré ou déjà utilisé). Reconnecte ton compte.', { status: 400, reconnecter: true });
    }
    if (r.status === 400 && /redirect/i.test(texte)) {
      throw new ErreurSuunto(`L’adresse de retour ne correspond pas à celle de ton appli Suunto. Dans API Zone, mets exactement : ${l.redirectUri || RETOUR_DEFAUT}`, { status: 400 });
    }
    if (r.status === 401 || /invalid_client/i.test(texte)) {
      throw new ErreurSuunto('Identifiant ou secret client refusé par Suunto. Vérifie-les dans ton profil API Zone.', { status: r.status });
    }
    throw new ErreurSuunto(`Suunto a répondu ${r.status} : ${texte.slice(0, 160)}`, { status: r.status });
  }
  let tok;
  try { tok = JSON.parse(texte); } catch { throw new ErreurSuunto('Réponse de Suunto illisible.'); }
  if (!tok.access_token) throw new ErreurSuunto('Suunto n’a pas renvoyé de jeton.');
  return tok;
}

function jetonDepuis(tok, ancien, maintenant) {
  const jwt = lireJwt(tok.access_token);
  const expire = tok.expires_in ? maintenant + tok.expires_in * 1000
    : jwt.exp ? jwt.exp * 1000 : maintenant + 3600 * 1000;
  return { acces: tok.access_token, refresh: tok.refresh_token || ancien?.refresh || null, expire };
}

/** Code reçu au retour de Suunto → liaison connectée. */
export async function echangerCode(l, code, { f = fetch, maintenant = Date.now() } = {}) {
  const tok = await demandeJeton(l, {
    grant_type: 'authorization_code', code, redirect_uri: l.redirectUri || RETOUR_DEFAUT,
  }, f);
  const jeton = jetonDepuis(tok, null, maintenant);
  return { ...l, jeton, compte: lireJwt(jeton.acces).user || null, lieLe: new Date(maintenant).toISOString(), delieLe: null };
}

/** Un jeton d'accès valable au moins 5 minutes, renouvelé si besoin. */
export async function jetonValide(l, { f = fetch, maintenant = Date.now(), forcer = false } = {}) {
  if (!estRelie(l)) throw new ErreurSuunto('Compte Suunto pas connecté.', { reconnecter: true });
  if (!forcer && l.jeton.acces && (l.jeton.expire || 0) - maintenant > 5 * 60 * 1000) {
    return { liaison: l, acces: l.jeton.acces, change: false };
  }
  let tok;
  try {
    tok = await demandeJeton(l, { grant_type: 'refresh_token', refresh_token: l.jeton.refresh }, f);
  } catch (e) {
    if (e.status === 400 || e.status === 401) {
      throw new ErreurSuunto('La connexion à Suunto a expiré. Reconnecte ton compte depuis les réglages (sur le site).', { status: e.status, reconnecter: true });
    }
    throw e;
  }
  const jeton = jetonDepuis(tok, l.jeton, maintenant);
  return { liaison: { ...l, jeton }, acces: jeton.acces, change: true };
}

// ------------------------------------------------------------
//  HTTP : natif dans l'APK (pas de CORS), fetch ailleurs
// ------------------------------------------------------------

function base64EnOctets(b64) {
  const bin = atob(String(b64 || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Une requête GET qui renvoie { status, ok, texte, octets, entetes }.
 * Dans l'APK, passe par CapacitorHttp (requête faite par Android, que
 * le serveur de Suunto accepte) ; sinon fetch.
 */
export function httpParDefaut() {
  const natif = typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()
    ? window.Capacitor?.Plugins?.CapacitorHttp : null;
  if (natif) {
    return async (url, { headers = {}, binaire = false } = {}) => {
      const r = await natif.request({ url, method: 'GET', headers, responseType: binaire ? 'arraybuffer' : 'text' });
      const ok = r.status >= 200 && r.status < 300;
      const texte = binaire ? null : (typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''));
      return { status: r.status, ok, texte, octets: binaire && ok ? base64EnOctets(r.data) : null, entetes: r.headers || {} };
    };
  }
  return async (url, { headers = {}, binaire = false } = {}) => {
    const r = await fetch(url, { headers, cache: 'no-store' });
    const entetes = {};
    r.headers?.forEach?.((v, k) => { entetes[k] = v; });
    return {
      status: r.status, ok: r.ok,
      texte: binaire && r.ok ? null : await r.text(),
      octets: binaire && r.ok ? new Uint8Array(await r.arrayBuffer()) : null,
      entetes,
    };
  };
}

export const apiAccessible = () => typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

// ------------------------------------------------------------
//  Les activités
// ------------------------------------------------------------

/** Une activité de la liste Suunto, lue avec tolérance. */
export function normaliserActivite(w) {
  const cle = String(w.workoutKey ?? w.workoutId ?? w.key ?? w.id ?? '');
  let debut = Number(w.startTime ?? w.startTimeMillis ?? w.start ?? NaN);
  if (Number.isFinite(debut) && debut < 1e11) debut *= 1000;      // en secondes
  const duree = Number(w.totalTime ?? w.duration ?? w.totalTimeSeconds ?? NaN);
  const ext = Array.isArray(w.extensions) ? w.extensions : [];
  const plongee = ext.find(e => /dive/i.test(e.type || '')) || {};
  const prof = Number(w.maxDepth ?? w.diveMaxDepth ?? plongee.maxDepth ?? NaN);
  return {
    cle,
    activite: w.activityId ?? w.activityType ?? null,
    debut: Number.isFinite(debut) ? debut : null,
    dureeS: Number.isFinite(duree) ? duree : null,
    profMax: Number.isFinite(prof) && prof > 0 ? prof : null,
    nom: w.activityName || w.description || '',
  };
}

const pause = ms => new Promise(r => setTimeout(r, ms));

/**
 * Client de l'API, avec une liaison qu'il tient à jour (jetons
 * renouvelés). `surLiaison(l)` est appelé quand elle change, pour
 * l'enregistrer.
 */
export class ClientSuunto {
  constructor(liaison, { http = httpParDefaut(), fJeton = fetch, surLiaison = () => {}, journal = () => {}, attendre = pause } = {}) {
    this.liaison = liaison;
    this.http = http;
    this.fJeton = fJeton;
    this.surLiaison = surLiaison;
    this.journal = journal;
    this.attendre = attendre;
  }

  async jeton(forcer = false) {
    const r = await jetonValide(this.liaison, { f: this.fJeton, forcer });
    if (r.change) {
      this.liaison = r.liaison;
      this.journal('jeton Suunto renouvelé');
      await this.surLiaison(this.liaison);
    }
    return r.acces;
  }

  /** GET sur l'API, avec renouvellement du jeton et patience sur 429. */
  async appel(chemin, { binaire = false } = {}) {
    let renouvele = false;
    for (let essai = 0; essai < 6; essai++) {
      const acces = await this.jeton();
      const r = await this.http(`${API}${chemin}`, {
        binaire,
        headers: {
          Authorization: `Bearer ${acces}`,
          'Ocp-Apim-Subscription-Key': this.liaison.cleAbonnement,
          Accept: binaire ? 'application/octet-stream' : 'application/json',
        },
      });
      if (r.ok) return r;
      const corps = String(r.texte || '').slice(0, 200);
      this.journal(`GET ${chemin} → ${r.status} ${corps}`);
      if (r.status === 401 && !renouvele) { renouvele = true; await this.jeton(true); continue; }
      if (r.status === 401) throw new ErreurSuunto('Suunto refuse l’accès au compte. Reconnecte-le depuis les réglages.', { status: 401, reconnecter: true });
      if (r.status === 403 || (r.status === 401 && /subscription/i.test(corps))) {
        throw new ErreurSuunto('Clé d’abonnement refusée (profil API Zone → « Your subscriptions »).', { status: r.status });
      }
      if (r.status === 429) {
        const attente = Math.min(Number(r.entetes?.['retry-after'] ?? r.entetes?.['Retry-After']) || 60, 300);
        if (essai >= 3) throw new ErreurSuunto(`Suunto limite le nombre d’appels. Reprends dans ${Math.ceil(attente / 60)} min : ce qui est fait est gardé.`, { status: 429, attente });
        this.journal(`pause demandée par Suunto : ${attente} s`);
        await this.attendre(attente * 1000);
        continue;
      }
      if (r.status >= 500 && essai < 2) { await this.attendre(2000); continue; }
      throw new ErreurSuunto(`Suunto a répondu ${r.status}. ${corps}`, { status: r.status });
    }
    throw new ErreurSuunto('Suunto ne répond pas comme prévu.');
  }

  /**
   * Toutes les activités du compte. On ne sait pas dans quel ordre
   * l'API les rend : on recule avec « until », puis on avance avec
   * « since », jusqu'à ne plus rien voir de neuf.
   */
  async activites({ parPage = 100, progres = () => {} } = {}) {
    const vues = new Map();
    const page = async (params) => {
      const q = new URLSearchParams({ limit: String(parPage), ...params });
      const r = await this.appel(`/v2/workouts?${q}`);
      let j;
      try { j = JSON.parse(r.texte || '{}'); } catch { throw new ErreurSuunto('Liste d’activités illisible.'); }
      const brutes = Array.isArray(j) ? j : (j.payload ?? j.workouts ?? j.data ?? []);
      const lot = brutes.map(normaliserActivite).filter(a => a.cle);
      const neuves = lot.filter(a => !vues.has(a.cle));
      neuves.forEach(a => vues.set(a.cle, a));
      progres(vues.size);
      this.journal(`liste ${JSON.stringify(params)} : ${lot.length} activité(s), ${neuves.length} nouvelle(s)`);
      return { lot, neuves };
    };

    let p = await page({});
    // En arrière
    for (let i = 0; i < 500 && p.neuves.length && p.lot.length >= parPage; i++) {
      const plusVieux = Math.min(...p.lot.map(a => a.debut).filter(Number.isFinite));
      if (!Number.isFinite(plusVieux)) break;
      p = await page({ until: String(plusVieux - 1) });
    }
    // En avant (si l'API rend les plus anciennes d'abord)
    let plusRecent = Math.max(...[...vues.values()].map(a => a.debut).filter(Number.isFinite));
    for (let i = 0; i < 500 && Number.isFinite(plusRecent); i++) {
      p = await page({ since: String(plusRecent + 1) });
      if (!p.neuves.length) break;
      plusRecent = Math.max(plusRecent, ...p.neuves.map(a => a.debut).filter(Number.isFinite));
      if (p.lot.length < parPage) break;
    }
    return [...vues.values()].sort((a, b) => (a.debut || 0) - (b.debut || 0));
  }

  /** Le .fit d'une activité. */
  async fit(cle) {
    const r = await this.appel(`/v2/workout/exportFit/${encodeURIComponent(cle)}`, { binaire: true });
    if (!r.octets?.length) throw new ErreurSuunto('Fichier .fit vide.');
    return r.octets;
  }
}
