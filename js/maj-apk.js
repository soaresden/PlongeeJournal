// ============================================================
//  Mise à jour de l'APK
//
//  L'APK embarque son numéro (www/version.json, écrit à la
//  compilation). GitHub Actions publie chaque nouvelle version dans
//  la release « android » du dépôt, titrée « … APK 2.0.N ». On compare
//  les deux numéros ; s'il y a plus récent, on ouvre le lien de
//  téléchargement dans le navigateur du téléphone, qui récupère le
//  fichier — Android demande ensuite de confirmer l'installation
//  (il ne laisse jamais une appli s'installer en silence).
//
//  Le dépôt de l'appli est public : pas de jeton, rien de personnel
//  n'est envoyé. GitHub tolère 60 vérifications par heure sans
//  jeton ; la vérification automatique n'a lieu qu'une fois par jour.
// ============================================================

export const DEPOT_APPLI = 'soaresden/PlongeeJournal';
export const URL_APK = `https://github.com/${DEPOT_APPLI}/releases/latest/download/PlongeeJournal.apk`;
const API = `https://api.github.com/repos/${DEPOT_APPLI}`;
const CLE = 'plongee-journal:maj-apk';
const UN_JOUR = 24 * 3600 * 1000;

export function estApk() {
  return typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
}

/** « Carnet de plongée — APK 2.0.57 » → { version: '2.0.57', build: 57 } */
export function lireNumero(titre) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(titre || ''));
  return m ? { version: m[0], build: Number(m[3]) } : null;
}

/** Ce qui est installé (null hors APK compilé par GitHub). */
export async function versionInstallee(f = fetch) {
  try {
    const r = await f('./version.json', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return Number.isInteger(j?.build) ? j : null;
  } catch { return null; }
}

/** La dernière version publiée sur GitHub. */
export async function derniereVersion(f = fetch) {
  let r;
  try {
    r = await f(`${API}/releases/tags/android`, {
      headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  } catch {
    throw new Error('Pas de réseau — impossible de joindre GitHub.');
  }
  if (r.status === 404) throw new Error('Aucune version publiée en ce moment (une compilation est peut-être en cours, réessaie dans quelques minutes).');
  if (r.status === 403 || r.status === 429) throw new Error('GitHub limite les vérifications — réessaie dans un moment.');
  if (!r.ok) throw new Error(`GitHub a répondu ${r.status}.`);
  const j = await r.json();
  const n = lireNumero(j.name) || lireNumero(j.tag_name);
  if (!n) throw new Error('Version publiée illisible.');
  const apk = (j.assets || []).find(a => /\.apk$/i.test(a.name || ''));
  return {
    ...n,
    date: apk?.updated_at || j.published_at || null,
    taille: apk?.size || null,
    url: apk?.browser_download_url || URL_APK,
    commit: /\b([0-9a-f]{7,40})\b/.exec(j.body || '')?.[1]?.slice(0, 7) || null,
  };
}

/** 'nouvelle' | 'a-jour' | 'inconnue' (installée sans numéro). */
export function comparer(installee, derniere) {
  if (!derniere) return 'inconnue';
  if (!installee?.build) return 'inconnue';
  return derniere.build > installee.build ? 'nouvelle' : 'a-jour';
}

/** Les nouveautés entre deux commits (titres seulement), au mieux. */
export async function nouveautes(de, a, f = fetch) {
  if (!de || !a || de === a) return [];
  try {
    const r = await f(`${API}/compare/${de}...${a}`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.commits || [])
      .map(c => String(c.commit?.message || '').split('\n')[0].trim())
      .filter(Boolean)
      .reverse();
  } catch { return []; }
}

function lireMemo() {
  try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch { return {}; }
}
function ecrireMemo(m) {
  try { localStorage.setItem(CLE, JSON.stringify(m)); } catch { /* stockage indisponible */ }
}

/** Vérifie (en direct). */
export async function verifier(f = fetch) {
  const [installee, derniere] = await Promise.all([versionInstallee(f), derniereVersion(f)]);
  ecrireMemo({ ...lireMemo(), verifieLe: Date.now() });
  return { installee, derniere, etat: comparer(installee, derniere) };
}

/**
 * Vérification discrète à l'ouverture de l'APK : au plus une fois par
 * jour, silencieuse en cas d'erreur, et une version déjà écartée
 * (bandeau fermé) n'est plus annoncée. Renvoie le résultat à annoncer
 * ou null.
 */
export async function verifierEnFond(f = fetch, maintenant = Date.now()) {
  if (!estApk()) return null;
  const memo = lireMemo();
  if (memo.verifieLe && maintenant - memo.verifieLe < UN_JOUR) return null;
  try {
    const res = await verifier(f);
    if (res.etat !== 'nouvelle') return null;
    if (memo.ecartee === res.derniere.build) return null;
    return res;
  } catch { return null; }
}

/** L'utilisateur ferme l'annonce : on ne la remontre pas pour ce numéro. */
export function ecarter(build) { ecrireMemo({ ...lireMemo(), ecartee: build }); }

/** Ouvre le téléchargement (dans l'APK, le lien part dans le navigateur du téléphone). */
export function telechargerApk(url = URL_APK) {
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.append(a); a.click(); a.remove();
}

/** « 2,4 Mo » */
export function taillePropre(octets) {
  if (!octets) return '';
  return `${(octets / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}
