// ============================================================
//  Partager son carnet en lecture seule (un lien, pour Alison…)
//
//  Le carnet vit dans un dépôt privé : on ne peut pas le montrer tel
//  quel. On publie donc une COPIE, compressée mais pas chiffrée (c'est
//  ton carnet, il est fait pour être montré), dans le dépôt public du
//  site : partage/<numéro>.json. Le numéro est tiré au hasard : sans le
//  lien, on ne tombe pas dessus en visitant le site. (Les premiers liens
//  passaient par un gist : ils restent lisibles.) Restent dehors : les
//  numéros de licence (les tiens et ceux des autres), tes coordonnées
//  (adresse, groupe sanguin, contact d'urgence), les notes sur les
//  plongeurs, Suunto, les photos.
//
//  Celui qui ouvre le lien voit l'appli, tes plongées, tes stats, ta
//  carte, tes plongeurs… et ne peut rien modifier : rien n'est enregistré,
//  ni chez toi, ni chez lui.
// ============================================================

import * as gh from './github.js';

export const SITE = 'https://soaresden.github.io/PlongeeJournal/';
const FICHIER = 'carnet-partage.json';
/** Le dépôt public du site, où la copie est déposée. */
export const DEPOT_SITE = { owner: 'soaresden', repo: 'PlongeeJournal', branch: 'main' };
const RAW = `https://raw.githubusercontent.com/${DEPOT_SITE.owner}/${DEPOT_SITE.repo}/${DEPOT_SITE.branch}/partage/`;
const estGist = id => /^[0-9a-f]{20,}$/.test(String(id));
const cheminPartage = id => `partage/${id}.json`;
const nouveauNumero = () => b64url(crypto.getRandomValues(new Uint8Array(12)));
const enB64 = texte => b64(new TextEncoder().encode(texte));
const API = 'https://api.github.com';

// ------------------------------------------------------------
//  L'instantané : ce qu'on montre, et seulement ça
// ------------------------------------------------------------

// Le contact à appeler en cas d'urgence est montré (demandé exprès) ;
// l'adresse, le groupe sanguin et la licence restent privés.
const GARDER_PLONGEUR = ['id', 'prenom', 'nom', 'niveau', 'materiel', 'equipe', 'combiType', 'combiMm',
  'urgPrenom', 'urgNom', 'urgTel', 'urgLien', 'photoProfil', 'createdAt', 'updatedAt'];
const GARDER_COMPAGNON = ['id', 'prenom', 'nom', 'club', 'moniteur', 'structure', 'categories', 'genre', 'createdAt', 'updatedAt'];
const GARDER_BREVET = ['id', 'diverId', 'nom', 'organisme', 'dateObtention', 'createdAt', 'updatedAt'];
const garder = (o, cles) => Object.fromEntries(cles.filter(k => o[k] !== undefined).map(k => [k, o[k]]));

/** Le carnet, débarrassé de tout ce qui est privé. */
export function instantane(carnet, { auteur = '', canal = '', feuille = '' } = {}) {
  const moi = carnet.settings?.activeDiverId || carnet.divers?.[0]?.id || null;
  const sansPhoto = d => { const { photoCarnet, stampImage, ...reste } = d; return reste; };
  return {
    version: 1,
    partage: { le: new Date().toISOString(), auteur, ...(canal ? { canal } : {}), ...(feuille ? { feuille } : {}) },
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

/** Ancien format (liens d'avant) : données → texte chiffré (JSON, base64). */
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

/** Données → texte compressé (gzip, base64), lisible par l'appli seule… et par toi. */
export async function emballer(donnees) {
  const brut = new TextEncoder().encode(JSON.stringify(donnees));
  const compresse = await gzip(brut);
  return compresse ? JSON.stringify({ v: 2, gz: true, data: b64(compresse) }) : JSON.stringify({ v: 2, carnet: donnees });
}

/** Texte publié → données (nouveau format ; l'ancien, chiffré, avec sa clé). */
export async function deballer(texte, cle = '') {
  const o = JSON.parse(texte);
  if (o.carnet) return o.carnet;
  if (o.data) return JSON.parse(new TextDecoder().decode(await gunzip(deB64(o.data))));
  if (o.ct) {
    if (!cle) throw new Error('Ce lien est un ancien lien chiffré, incomplet : redemande le lien.');
    return dechiffrer(texte, cle);
  }
  throw new Error('Ce lien ne mène pas à un carnet partagé.');
}

/** Ce qu'il faut faire quand le jeton n'a pas accès au dépôt du site. */
export const AIDE_JETON = 'Ton jeton GitHub n’a pas encore accès au dépôt du site. Sur GitHub : Settings → Developer settings → '
  + 'Fine-grained tokens → ton jeton → Repository access → Select repositories → ajoute « PlongeeJournal » '
  + '(en plus de « PlongeeJournal-data »), puis Update en bas. La permission « Contents : Read and write » vaut pour les deux.';

/**
 * Publie (ou met à jour) la copie du carnet sur le site.
 * @param {object} carnet  le carnet complet (il est filtré ici)
 * @param {{siteId?:string}} actuel  le partage déjà créé, s'il y en a un
 * @returns {{siteId:string, majLe:string, lien:string}}
 */
export async function publierPartage(carnet, actuel = {}, { auteur = '' } = {}) {
  if (!gh.estConfigure()) throw new Error('Branche d’abord ton dépôt GitHub (Réglages).');
  const siteId = actuel.siteId || nouveauNumero();
  // Le canal des visites : créé une fois, gardé ensuite.
  const canal = actuel.canal || (await import('./visites.js')).nouveauCanal();
  const contenu = await emballer(instantane(carnet, { auteur, canal, feuille: actuel.feuille || '' }));
  const cfg = { ...gh.configGitHub(), ...DEPOT_SITE };
  try {
    await gh.ecrireFichierBase64(cheminPartage(siteId), enB64(contenu), 'Partage du carnet : mise à jour', cfg);
  } catch (e) {
    if ([403, 404].includes(e.status) || /introuvable|droit/i.test(e.message)) throw new Error(AIDE_JETON);
    throw e;
  }
  const p = { siteId, majLe: new Date().toISOString(), canal };
  return { ...p, lien: lienPartage(p) };
}

/** Arrête le partage : la copie est retirée, le lien ne mène plus à rien. */
export async function arreterPartage(p = {}) {
  if (p.siteId) {
    await gh.supprimerFichier(cheminPartage(p.siteId), 'Partage du carnet : arrêté', { ...gh.configGitHub(), ...DEPOT_SITE });
  } else if (p.gistId) {
    await appelGist(`/gists/${p.gistId}`, { method: 'DELETE' }).catch(e => { if (!/404/.test(e.message)) throw e; });
  }
}

export const lienPartage = ({ siteId, gistId }) => `${SITE}?voir=${encodeURIComponent(siteId || gistId)}`;

/** Le QR code d'un lien, en SVG (pour le scanner avec un téléphone). */
export async function qrSvg(texte, { taille = 200 } = {}) {
  const { default: qrcode } = await import('./vendor/qrcode.js');
  const q = qrcode(0, 'M');
  q.addData(texte);
  q.make();
  return q.createSvgTag({ cellSize: Math.max(2, Math.floor(taille / (q.getModuleCount() + 8))), margin: 4, scalable: true });
}

/**
 * Côté visiteur : récupère et déchiffre. Le gist est public pour qui a
 * son numéro ; aucun jeton n'est nécessaire.
 */
export async function lirePartage(id, cle = '') {
  if (!estGist(id)) {
    // Sur le site : raw.githubusercontent (à jour en quelques minutes),
    // sinon le site lui-même.
    for (const url of [`${RAW}${encodeURIComponent(id)}.json`, `./partage/${encodeURIComponent(id)}.json`]) {
      let r;
      try { r = await fetch(url, { cache: 'no-store' }); } catch { continue; }
      if (r.ok) return deballer(await r.text(), cle);
      if (r.status === 404) continue;
    }
    throw new Error('Ce partage n’existe pas ou plus (il a peut-être été arrêté). Si le lien vient d’être créé, réessaie dans une minute.');
  }
  const gistId = id;
  let r;
  try { r = await fetch(`${API}/gists/${encodeURIComponent(gistId)}`, { headers: { Accept: 'application/vnd.github+json' } }); }
  catch { throw new Error('Pas de réseau : le carnet partagé ne peut pas être chargé.'); }
  if (r.status === 404) throw new Error('Ce partage n’existe plus (il a été arrêté).');
  if (!r.ok) throw new Error(`GitHub a répondu ${r.status}. Réessaie dans un moment.`);
  const g = await r.json();
  const f = g.files?.[FICHIER];
  if (!f) throw new Error('Ce lien ne mène pas à un carnet partagé.');
  const texte = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
  return deballer(texte, cle);
}
