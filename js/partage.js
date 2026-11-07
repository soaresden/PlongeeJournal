// ============================================================
//  Partager son carnet en lecture seule (un lien, pour Alison…)
//
//  Le carnet vit dans un dépôt privé : on ne peut pas le montrer tel
//  quel. On publie donc un INSTANTANÉ :
//   - sans rien de privé (adresse, groupe sanguin, contact d'urgence,
//     licence, notes sur les plongeurs, Suunto, photos) ;
//   - compressé puis chiffré (AES-256-GCM) ;
//   - déposé dans un gist secret de ton compte GitHub.
//  La clé de déchiffrement n'est QUE dans le lien, après le « # » : elle
//  ne part jamais vers un serveur. Sans le lien complet, le gist n'est
//  qu'un bloc illisible.
//
//  Celui qui ouvre le lien voit l'appli, tes plongées, tes stats, ta
//  carte, tes plongeurs… et ne peut rien modifier : rien n'est enregistré,
//  ni chez toi, ni chez lui.
// ============================================================

import * as gh from './github.js';

export const SITE = 'https://soaresden.github.io/PlongeeJournal/';
const FICHIER = 'carnet-partage.json';
const API = 'https://api.github.com';

// ------------------------------------------------------------
//  L'instantané : ce qu'on montre, et seulement ça
// ------------------------------------------------------------

const GARDER_PLONGEUR = ['id', 'prenom', 'nom', 'niveau', 'materiel', 'equipe', 'combiType', 'combiMm', 'createdAt', 'updatedAt'];
const GARDER_COMPAGNON = ['id', 'prenom', 'nom', 'club', 'moniteur', 'structure', 'categories', 'genre', 'createdAt', 'updatedAt'];
const GARDER_BREVET = ['id', 'diverId', 'nom', 'organisme', 'dateObtention', 'createdAt', 'updatedAt'];
const garder = (o, cles) => Object.fromEntries(cles.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

/** Le carnet, débarrassé de tout ce qui est privé. */
export function instantane(carnet, { auteur = '' } = {}) {
  const moi = carnet.settings?.activeDiverId || carnet.divers?.[0]?.id || null;
  const sansPhoto = d => { const { photoCarnet, stampImage, ...reste } = d; return reste; };
  return {
    version: 1,
    partage: { le: new Date().toISOString(), auteur },
    divers: (carnet.divers || []).filter(d => d.id === moi).map(d => garder(d, GARDER_PLONGEUR)),
    buddies: (carnet.buddies || []).map(b => garder(b, GARDER_COMPAGNON)),
    dives: (carnet.dives || []).filter(d => d.diverId === moi).map(sansPhoto),
    certifs: (carnet.certifs || []).filter(c => c.diverId === moi).map(c => garder(c, GARDER_BREVET)),
    seances: (carnet.seances || []).filter(s => s.diverId === moi),
    settings: { activeDiverId: moi },
    _supprimes: {},
  };
}

// ------------------------------------------------------------
//  Compression et chiffrement (WebCrypto)
// ------------------------------------------------------------

const b64 = octets => { let s = ''; const t = new Uint8Array(octets); for (let i = 0; i < t.length; i += 0x8000) s += String.fromCharCode(...t.subarray(i, i + 0x8000)); return btoa(s); };
const deB64 = texte => Uint8Array.from(atob(texte), c => c.charCodeAt(0));
const b64url = octets => b64(octets).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = t => deB64(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4));

async function flux(octets, transformation) {
  const sortie = new Blob([octets]).stream().pipeThrough(transformation);
  return new Uint8Array(await new Response(sortie).arrayBuffer());
}
const gzip = async octets => (typeof CompressionStream === 'function' ? flux(octets, new CompressionStream('gzip')) : null);
const gunzip = async octets => flux(octets, new DecompressionStream('gzip'));

/** Une clé neuve, en texte (pour le lien). */
export async function nouvelleCle() {
  const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  return b64url(await crypto.subtle.exportKey('raw', k));
}
const importer = cle => crypto.subtle.importKey('raw', deB64url(cle), 'AES-GCM', false, ['encrypt', 'decrypt']);

/** Données → texte chiffré (JSON, base64). */
export async function chiffrer(donnees, cle) {
  const brut = new TextEncoder().encode(JSON.stringify(donnees));
  const compresse = await gzip(brut);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importer(cle), compresse || brut);
  return JSON.stringify({ v: 1, gz: !!compresse, iv: b64(iv), ct: b64(ct) });
}

/** Texte chiffré → données. Une mauvaise clé lève une erreur claire. */
export async function dechiffrer(texte, cle) {
  const { gz, iv, ct } = JSON.parse(texte);
  let clair;
  try {
    clair = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) }, await importer(cle), deB64(ct)));
  } catch { throw new Error('Lien incomplet ou clé erronée : redemande le lien.'); }
  const octets = gz ? await gunzip(clair) : clair;
  return JSON.parse(new TextDecoder().decode(octets));
}

// ------------------------------------------------------------
//  Le gist secret
// ------------------------------------------------------------

function expliquer(status) {
  if (status === 403 || status === 404) {
    return 'Ton jeton GitHub ne peut pas créer de gist. Sur GitHub : Settings → Developer settings → '
      + 'Fine-grained tokens → ton jeton → Account permissions → « Gists : Read and write », puis Update.';
  }
  if (status === 401) return 'Jeton GitHub refusé (expiré ou révoqué).';
  return `GitHub a répondu ${status}.`;
}

async function appelGist(chemin, options = {}, cfg = gh.configGitHub()) {
  let r;
  try {
    r = await fetch(API + chemin, { ...options, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28', ...(options.headers || {}) } });
  } catch { throw new Error('GitHub injoignable (pas de réseau ?)'); }
  if (!r.ok) throw new Error(expliquer(r.status));
  return r.status === 204 ? null : r.json();
}

/**
 * Publie (ou met à jour) l'instantané chiffré.
 * @param {object} carnet  le carnet complet (il est filtré ici)
 * @param {{gistId?:string, cle?:string}} actuel  le partage déjà créé, s'il y en a un
 * @returns {{gistId:string, cle:string, majLe:string, lien:string}}
 */
export async function publierPartage(carnet, actuel = {}, { auteur = '' } = {}) {
  if (!gh.estConfigure()) throw new Error('Branche d’abord ton dépôt GitHub (Réglages).');
  const cle = actuel.cle || await nouvelleCle();
  const contenu = await chiffrer(instantane(carnet, { auteur }), cle);
  const corps = { description: 'Carnet de plongée (partage chiffré, lecture seule)', files: { [FICHIER]: { content: contenu } } };
  let gist;
  if (actuel.gistId) {
    try { gist = await appelGist(`/gists/${actuel.gistId}`, { method: 'PATCH', body: JSON.stringify(corps) }); }
    catch (e) { if (!/404|gist/i.test(e.message)) throw e; }
  }
  if (!gist) gist = await appelGist('/gists', { method: 'POST', body: JSON.stringify({ ...corps, public: false }) });
  const p = { gistId: gist.id, cle, majLe: new Date().toISOString() };
  return { ...p, lien: lienPartage(p) };
}

/** Arrête le partage : le gist est supprimé, le lien ne mène plus à rien. */
export async function arreterPartage(gistId) {
  if (gistId) await appelGist(`/gists/${gistId}`, { method: 'DELETE' }).catch(e => { if (!/404/.test(e.message)) throw e; });
}

export const lienPartage = ({ gistId, cle }) => `${SITE}?voir=${encodeURIComponent(gistId)}#k=${cle}`;

/**
 * Côté visiteur : récupère et déchiffre. Le gist est public pour qui a
 * son numéro ; aucun jeton n'est nécessaire.
 */
export async function lirePartage(gistId, cle) {
  let r;
  try { r = await fetch(`${API}/gists/${encodeURIComponent(gistId)}`, { headers: { Accept: 'application/vnd.github+json' } }); }
  catch { throw new Error('Pas de réseau : le carnet partagé ne peut pas être chargé.'); }
  if (r.status === 404) throw new Error('Ce partage n’existe plus (il a été arrêté).');
  if (!r.ok) throw new Error(`GitHub a répondu ${r.status}. Réessaie dans un moment.`);
  const g = await r.json();
  const f = g.files?.[FICHIER];
  if (!f) throw new Error('Ce lien ne mène pas à un carnet partagé.');
  const texte = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
  return dechiffrer(texte, cle);
}
