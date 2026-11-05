// ============================================================
//  Photos du carnet papier
//
//  On photographie la page du carnet papier, on garde la partie
//  qui concerne LA plongée, et cette image sert de modèle pour
//  remplir la fiche.
//
//  Où vivent les images :
//   - jamais dans carnet.json : il est relu et réécrit à chaque
//     modification, des images en base64 l'alourdiraient d'autant ;
//   - la plongée ne garde qu'une référence : { ref: 'photos/….jpg' } ;
//   - l'image elle-même est rangée sur l'appareil (IndexedDB, qui
//     n'a pas la petite limite du localStorage), puis envoyée dans
//     le dépôt GitHub privé, à côté du carnet ;
//   - sans réseau, l'envoi attend (file d'attente) et repart tout
//     seul ; sans GitHub, l'image reste sur l'appareil.
//
//  Un autre appareil reçoit la référence avec le carnet, et ne
//  télécharge l'image que le jour où on la regarde.
// ============================================================

import * as gh from './github.js';

const BASE = 'plongee-journal-photos';
const TABLE = 'photos';
const ATTENTE = 'plongee-journal:photos-attente';     // [{ op, ref }]
const DERNIERE_PAGE = '_derniere-page';               // reste sur l'appareil

/** Taille des images gardées (plus grand côté, en pixels). */
export const COTE_PHOTO = 1800;       // la partie retenue : lisible zoomée
export const COTE_PAGE = 2400;        // la page entière, copie de travail

// ------------------------------------------------------------
//  Rangement sur l'appareil
// ------------------------------------------------------------

/** Doublure en mémoire : navigateur sans IndexedDB, tests. */
export function stockageMemoire() {
  const m = new Map();
  return {
    lire: async k => (m.has(k) ? m.get(k) : null),
    ecrire: async (k, v) => { m.set(k, v); },
    effacer: async k => { m.delete(k); },
  };
}

function stockageIndexedDB() {
  let base = null;
  const ouvrir = () => base ||= new Promise((resolve, reject) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(TABLE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error('Stockage des photos indisponible'));
  });
  const operation = (mode, fn) => ouvrir().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(TABLE, mode);
    const req = fn(t.objectStore(TABLE));
    t.oncomplete = () => resolve(req?.result ?? null);
    t.onerror = () => reject(t.error || new Error('Écriture de la photo impossible'));
    t.onabort = () => reject(t.error || new Error('Mémoire de l’appareil pleine'));
  }));
  return {
    lire: k => operation('readonly', s => s.get(k)),
    ecrire: (k, v) => operation('readwrite', s => s.put(v, k)).then(() => {}),
    effacer: k => operation('readwrite', s => s.delete(k)).then(() => {}),
  };
}

let local = null;
const stockage = () => local ||= (globalThis.indexedDB ? stockageIndexedDB() : stockageMemoire());

/** Pour les tests : remplace le rangement local. */
export function _utiliserStockage(s) { local = s; }

// ------------------------------------------------------------
//  Références et chemins
// ------------------------------------------------------------

/** Nouvelle référence, unique : une photo remplacée ne réutilise jamais un nom. */
export function nouvelleRef(diveId, quand = Date.now()) {
  const propre = String(diveId || 'plongee').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40) || 'plongee';
  return `photos/carnet-${propre}-${quand.toString(36)}.jpg`;
}

/** Une référence acceptable : rien qui sorte du dossier photos. */
export const refValide = ref => /^photos\/[a-zA-Z0-9._-]+\.jpg$/.test(String(ref || ''));

/** Chemin dans le dépôt : à côté du carnet. */
export const cheminDepot = (ref, cfg = gh.configGitHub()) => gh.dossierCarnet(cfg) + ref;

export const versBase64 = dataUrl => String(dataUrl).replace(/^data:[^,]*,/, '');
export const versDataUrl = base64 => `data:image/jpeg;base64,${base64}`;

/** Poids approximatif d'une data-URL, en octets. */
export const poids = dataUrl => Math.round(versBase64(dataUrl).length * 3 / 4);

// ------------------------------------------------------------
//  File d'attente des envois
// ------------------------------------------------------------

function lireAttente() {
  try {
    const l = JSON.parse(localStorage.getItem(ATTENTE) || '[]');
    return Array.isArray(l) ? l.filter(x => x && refValide(x.ref)) : [];
  } catch { return []; }
}

function ecrireAttente(liste) {
  try { localStorage.setItem(ATTENTE, JSON.stringify(liste)); } catch { /* plein */ }
}

/** Une seule opération par photo : la dernière demandée l'emporte. */
function mettreEnAttente(op, ref) {
  ecrireAttente([...lireAttente().filter(x => x.ref !== ref), { op, ref }]);
}

export const enAttente = () => lireAttente();

const abonnes = new Set();
/** Prévient quand une photo change d'état (envoyée, en attente). */
export function surChangement(fn) { abonnes.add(fn); return () => abonnes.delete(fn); }
const prevenir = () => abonnes.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

/** 'envoyee' | 'attente' | 'locale' (mode local) */
export function etatPhoto(ref) {
  if (lireAttente().some(x => x.ref === ref && x.op === 'envoi')) {
    return gh.estConfigure() ? 'attente' : 'locale';
  }
  return gh.estConfigure() ? 'envoyee' : 'locale';
}

let envoiEnCours = null;
let derniereErreur = '';
export const erreurPhotos = () => derniereErreur;

/**
 * Vide la file d'attente vers GitHub. Sans réseau, on s'arrête au
 * premier échec et tout reste en attente pour la prochaine fois.
 * Renvoie le nombre d'opérations faites.
 */
export function envoyerEnAttente() {
  if (!gh.estConfigure()) return Promise.resolve(0);
  if (envoiEnCours) return envoiEnCours;

  envoiEnCours = (async () => {
    const cfg = gh.configGitHub();
    let faites = 0;
    for (const { op, ref } of lireAttente()) {
      try {
        if (op === 'envoi') {
          const rec = await stockage().lire(ref);
          if (rec?.dataUrl) {
            await gh.ecrireFichierBase64(cheminDepot(ref, cfg), versBase64(rec.dataUrl),
              'Photo du carnet papier', cfg);
          }
        } else if (op === 'suppression') {
          await gh.supprimerFichier(cheminDepot(ref, cfg), 'Photo du carnet papier retirée', cfg);
        }
        // Retirée de la file seulement une fois faite.
        ecrireAttente(lireAttente().filter(x => !(x.ref === ref && x.op === op)));
        faites++;
        derniereErreur = '';
      } catch (e) {
        derniereErreur = e.message || String(e);
        break;     // réseau absent ou jeton refusé : inutile d'insister
      }
    }
    if (faites) prevenir();
    return faites;
  })();

  return envoiEnCours.finally(() => { envoiEnCours = null; });
}

// ------------------------------------------------------------
//  Ce que les écrans utilisent
// ------------------------------------------------------------

/**
 * Range une photo sur l'appareil, puis l'envoie (en arrière-plan).
 * L'écriture locale est attendue : si elle échoue, la plongée ne
 * doit pas pointer vers une image qui n'existe nulle part.
 */
export async function enregistrerPhoto(ref, dataUrl) {
  if (!refValide(ref)) throw new Error('Référence de photo invalide');
  await stockage().ecrire(ref, { dataUrl, date: new Date().toISOString() });
  mettreEnAttente('envoi', ref);
  prevenir();
  envoyerEnAttente().catch(() => {});
}

/**
 * L'image d'une référence, en data-URL. Cherchée sur l'appareil,
 * sinon téléchargée depuis GitHub (et gardée pour la suite).
 * null si elle n'est nulle part — par exemple pas encore envoyée
 * par l'appareil qui l'a prise.
 */
export async function lirePhoto(ref) {
  if (!refValide(ref)) return null;
  const rec = await stockage().lire(ref).catch(() => null);
  if (rec?.dataUrl) return rec.dataUrl;
  if (!gh.estConfigure()) return null;
  const f = await gh.lireFichierBase64(cheminDepot(ref));
  if (!f?.base64) return null;
  const dataUrl = versDataUrl(f.base64);
  await stockage().ecrire(ref, { dataUrl, date: new Date().toISOString() }).catch(() => {});
  return dataUrl;
}

/** Retire une photo de l'appareil, et de GitHub au prochain envoi. */
export async function oublierPhoto(ref) {
  if (!refValide(ref)) return;
  await stockage().effacer(ref).catch(() => {});
  if (gh.estConfigure()) mettreEnAttente('suppression', ref);
  else ecrireAttente(lireAttente().filter(x => x.ref !== ref));
  prevenir();
  envoyerEnAttente().catch(() => {});
}

/**
 * La dernière page photographiée, gardée sur l'appareil seulement :
 * une page du carnet porte souvent plusieurs plongées, on rogne la
 * suivante sans reprendre la photo.
 */
export async function garderDernierePage(dataUrl) {
  await stockage().ecrire(DERNIERE_PAGE, { dataUrl, date: new Date().toISOString() }).catch(() => {});
}

export async function dernierePage() {
  const rec = await stockage().lire(DERNIERE_PAGE).catch(() => null);
  return rec?.dataUrl ? rec : null;
}

// ------------------------------------------------------------
//  Cadrage (calculs purs, testés sans navigateur)
// ------------------------------------------------------------

/** Dimensions réduites pour tenir dans `max`, proportions gardées. */
export function tailleCible(l, h, max) {
  const r = Math.min(1, max / Math.max(l, h, 1));
  return { l: Math.max(1, Math.round(l * r)), h: Math.max(1, Math.round(h * r)) };
}

/** Ramène un cadre (proportions 0..1) dans l'image, taille minimale comprise. */
export function bornerCadre({ x = 0, y = 0, w = 1, h = 1 } = {}, min = 0.04) {
  const bw = Math.min(1, Math.max(min, w));
  const bh = Math.min(1, Math.max(min, h));
  return {
    x: Math.min(1 - bw, Math.max(0, x)),
    y: Math.min(1 - bh, Math.max(0, y)),
    w: bw, h: bh,
  };
}

/** Raccourcis de cadrage : beaucoup de carnets ont 2 plongées par page. */
export const CADRES = {
  page:   { label: 'Page entière', cadre: { x: 0, y: 0, w: 1, h: 1 } },
  haut:   { label: '½ haut',       cadre: { x: 0, y: 0, w: 1, h: 0.5 } },
  bas:    { label: '½ bas',        cadre: { x: 0, y: 0.5, w: 1, h: 0.5 } },
  gauche: { label: '½ gauche',     cadre: { x: 0, y: 0, w: 0.5, h: 1 } },
  droite: { label: '½ droite',     cadre: { x: 0.5, y: 0, w: 0.5, h: 1 } },
};

/**
 * Fait évoluer un cadre selon un geste du doigt.
 * `prise` : 'deplacer', 'nouveau' ou un coin 'no' | 'ne' | 'so' | 'se'.
 * `depart` et `p` sont des points en proportions de l'image.
 */
export function ajusterCadre(initial, prise, depart, p) {
  const dx = p.x - depart.x, dy = p.y - depart.y;
  if (prise === 'deplacer') return bornerCadre({ ...initial, x: initial.x + dx, y: initial.y + dy }, 0);
  if (prise === 'nouveau') {
    return {
      x: Math.max(0, Math.min(depart.x, p.x)), y: Math.max(0, Math.min(depart.y, p.y)),
      w: Math.min(1, Math.abs(dx)), h: Math.min(1, Math.abs(dy)),
    };
  }
  let x0 = initial.x, y0 = initial.y, x1 = initial.x + initial.w, y1 = initial.y + initial.h;
  if (prise.includes('o')) x0 += dx; else x1 += dx;
  if (prise.includes('n')) y0 += dy; else y1 += dy;
  const c = v => Math.min(1, Math.max(0, v));
  [x0, x1] = [c(Math.min(x0, x1)), c(Math.max(x0, x1))];
  [y0, y1] = [c(Math.min(y0, y1)), c(Math.max(y0, y1))];
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Quelle poignée est sous le doigt ? `tol` en proportions. */
export function priseSous(cadre, p, tolX = 0.05, tolY = 0.05) {
  const coins = {
    no: [cadre.x, cadre.y], ne: [cadre.x + cadre.w, cadre.y],
    so: [cadre.x, cadre.y + cadre.h], se: [cadre.x + cadre.w, cadre.y + cadre.h],
  };
  for (const [nom, [cx, cy]] of Object.entries(coins)) {
    if (Math.abs(p.x - cx) <= tolX && Math.abs(p.y - cy) <= tolY) return nom;
  }
  const dedans = p.x >= cadre.x && p.x <= cadre.x + cadre.w && p.y >= cadre.y && p.y <= cadre.y + cadre.h;
  // Un cadre qui couvre toute la page n'a nulle part où aller : glisser
  // dessus trace la partie voulue, c'est le geste attendu au départ.
  const pageEntiere = cadre.w > 0.97 && cadre.h > 0.97;
  return dedans && !pageEntiere ? 'deplacer' : 'nouveau';
}

// ------------------------------------------------------------
//  Images (navigateur)
// ------------------------------------------------------------

/** Charge une data-URL ou un fichier en <img> décodée. */
export function chargerImage(source) {
  return new Promise((resolve, reject) => {
    const depuisUrl = url => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image illisible'));
      img.src = url;
    };
    if (typeof source === 'string') return depuisUrl(source);
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error('Lecture du fichier impossible'));
    lecteur.onload = () => depuisUrl(lecteur.result);
    lecteur.readAsDataURL(source);
  });
}

function dessiner(l, h, fn, qualite) {
  const cv = document.createElement('canvas');
  cv.width = l; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, l, h);
  ctx.imageSmoothingQuality = 'high';
  fn(ctx);
  return cv.toDataURL('image/jpeg', qualite);
}

/** Copie de travail d'une page : réduite, compressée. */
export function reduire(img, max = COTE_PAGE, qualite = 0.85) {
  const t = tailleCible(img.naturalWidth || img.width, img.naturalHeight || img.height, max);
  return dessiner(t.l, t.h, ctx => ctx.drawImage(img, 0, 0, t.l, t.h), qualite);
}

/** Quart de tour (sens horaire), pour une photo prise de travers. */
export function pivoter(img, qualite = 0.88) {
  const l = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  return dessiner(h, l, ctx => {
    ctx.translate(h, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, 0, 0);
  }, qualite);
}

/** La partie retenue, compressée pour l'envoi. */
export function recadrer(img, cadre, max = COTE_PHOTO, qualite = 0.8) {
  const L = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const c = bornerCadre(cadre, 0.01);
  const sx = Math.round(c.x * L), sy = Math.round(c.y * H);
  const sw = Math.max(1, Math.round(c.w * L)), sh = Math.max(1, Math.round(c.h * H));
  const t = tailleCible(sw, sh, max);
  return {
    dataUrl: dessiner(t.l, t.h, ctx => ctx.drawImage(img, sx, sy, sw, sh, 0, 0, t.l, t.h), qualite),
    l: t.l, h: t.h,
  };
}
