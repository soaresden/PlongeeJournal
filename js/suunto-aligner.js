// ============================================================
//  Aligner le carnet sur le compte Suunto
//
//  Pour chaque activité du compte :
//   - déjà liée (même clé Suunto) → rien à faire ;
//   - retrouvée par l'heure (import Bluetooth, .fit, saisie à la
//     main) → on COMPLÈTE ce qui manque, sans jamais écraser une
//     valeur déjà saisie ;
//   - absente → on l'AJOUTE, en plongée ou en séance (fosse,
//     piscine, apnée) selon ce qu'elle est.
//  Tout est pur : l'écran décide, le store écrit.
// ============================================================

import { suggererRangement } from './seances.js';
import { PRE_REMPLI } from './config.js';

export const CLE_SUUNTO = cle => `suunto:${cle}`;

/** Genre appris pour un n° d'activité Suunto, ou null si jamais vu. */
export const genreConnu = (types, activite) => (activite == null ? null : types?.[String(activite)] ?? null);

/** Faut-il télécharger le .fit de cette activité ? */
export function aExaminer(act, types) {
  const g = genreConnu(types, act.activite);
  if (g) return g !== 'sport';
  return true;                        // type jamais vu : on regarde
}

/** Clé .fit « …2026-06-24_11.27.06… » → secondes UNIX (UTC). */
function heureCleFit(cle) {
  const m = /(\d{4})-(\d\d)-(\d\d)_(\d\d)\.(\d\d)\.(\d\d)/.exec(cle || '');
  return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000 : null;
}

/**
 * L'entrée du carnet (plongée ou séance vue comme plongée) qui
 * correspond à cette activité, s'il y en a une.
 * @param {{cle:string, debut:number}} act  debut en ms
 */
export function trouverDansCarnet(act, connues) {
  const cle = CLE_SUUNTO(act.cle);
  for (const d of connues) if ((d.suuntoKeys || []).includes(cle)) return { entree: d, comment: 'déjà liée à Suunto', liee: true };
  if (!Number.isFinite(act.debut)) return null;
  const t = act.debut / 1000;
  for (const d of connues) {
    for (const k of d.suuntoKeys || []) {
      const o = /^ocean:(\d+)$/.exec(k);
      if (o && Math.abs(+o[1] - t) <= 300) return { entree: d, comment: 'importée en Bluetooth' };
      const f = heureCleFit(k);
      if (f !== null && Math.abs(f - t) <= 300) return { entree: d, comment: 'importée depuis un .fit' };
    }
  }
  for (const d of connues) {
    if (!d.date || !d.heureImmersion) continue;
    const td = new Date(`${d.date}T${d.heureImmersion}:00`).getTime() / 1000;
    if (Math.abs(td - t) <= 600) return { entree: d, comment: 'même date et même heure' };
  }
  return null;
}

const vide = v => v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));

/**
 * Ce qu'un .fit peut apporter à une plongée déjà dans le carnet.
 * Ne touche qu'aux champs vides.
 * @returns {{champs:object, libelles:string[]}}
 */
export function completerPlongee(dive, dec) {
  const champs = {};
  const libelles = [];
  const mettre = (k, v, libelle) => {
    if (vide(v) || !vide(dive[k])) return false;
    champs[k] = v;
    if (libelle && !libelles.includes(libelle)) libelles.push(libelle);
    return true;
  };
  if (!dive.samples?.length && dec.samples?.length) { champs.samples = dec.samples; libelles.push('profil'); }
  mettre('profMax', dec.profMax, 'profondeur');
  mettre('profMoy', dec.profMoy, 'profondeur');
  mettre('dureeMin', dec.dureeMin, 'durée');
  mettre('tempFond', dec.tempFond != null ? Math.round(dec.tempFond) : null, 'température');
  // Pression : une fiche neuve est pré-remplie (200 → 50 bar). Ces
  // valeurs par défaut ne sont pas une mesure : le Tank POD les remplace.
  // Une pression réellement saisie, elle, n'est pas touchée.
  const preRemplie = Number(dive.pressionDepart) === PRE_REMPLI.pressionDepart && Number(dive.pressionFin) === PRE_REMPLI.pressionFin;
  if (dec.pressionDepart && ((vide(dive.pressionDepart) && vide(dive.pressionFin)) || preRemplie)) {
    champs.pressionDepart = dec.pressionDepart;
    if (dec.pressionFin) champs.pressionFin = dec.pressionFin;
    libelles.push('pression du bloc');
  }
  if (dec.lieu && vide(dive.lat) && vide(dive.lng)) {
    champs.lat = dec.lieu.lat; champs.lng = dec.lieu.lng; libelles.push('position GPS');
  }
  if (vide(dive.eau) && dec.eau) { champs.eau = dec.eau; libelles.push('type d’eau'); }
  // Le mélange : seulement si rien n'a été précisé (l'air par défaut d'une
  // fiche vide n'est pas un choix).
  if (vide(dive.gazO2) && dec.gazO2 && (dec.gazO2 !== 21 || dec.gazHe)) {
    champs.gazType = dec.gazHe ? 'trimix' : 'nitrox';
    champs.gazO2 = dec.gazO2;
    if (dec.gazHe) champs.gazHe = dec.gazHe;
    libelles.push('mélange');
  }
  return { champs, libelles };
}

/** Pareil pour une séance (fosse, piscine, apnée). */
export function completerSeance(seance, dec) {
  const champs = {};
  const libelles = [];
  if (vide(seance.dureeMin) && dec.dureeMin) { champs.dureeMin = Math.round(dec.dureeMin); libelles.push('durée'); }
  if (vide(seance.tempEau) && dec.tempFond != null) { champs.tempEau = Math.round(dec.tempFond); libelles.push('température'); }
  if (seance.type !== 'piscine' && vide(seance.profMax) && dec.profMax) { champs.profMax = dec.profMax; libelles.push('profondeur'); }
  if (!seance.samples?.length && dec.samples?.length) { champs.samples = dec.samples; libelles.push('profil'); }
  return { champs, libelles };
}

/** Genre FIT → genre attendu par suggererRangement. */
const genrePourRangement = g => (g === 'apnee' ? 'apnee' : g === 'natation' ? 'autre' : '');

/**
 * La proposition pour une activité décodée.
 * @returns {{action:'ajouter'|'completer'|'rien'|'ignorer', rangement?:string, entree?:object,
 *            champs?:object, libelles?:string[], comment?:string}}
 */
export function proposer(act, dec, connues, seances = []) {
  if (!dec) return { action: 'ignorer', comment: 'fichier illisible' };
  if (dec.genre === 'sport') return { action: 'ignorer', comment: 'autre sport' };
  const trouve = trouverDansCarnet(act, connues);
  if (trouve) {
    const c = trouve.entree.seance ? completerSeance(trouve.entree, dec) : completerPlongee(trouve.entree, dec);
    const lier = !trouve.liee;
    if (!c.libelles.length && !lier) return { action: 'rien', entree: trouve.entree, comment: trouve.comment };
    return { action: 'completer', entree: trouve.entree, champs: c.champs, libelles: c.libelles, comment: trouve.comment };
  }
  const rangement = suggererRangement({
    genre: genrePourRangement(dec.genre), profMax: dec.profMax, date: dec.start, lieu: dec.lieu,
  }, seances);
  return { action: 'ajouter', rangement };
}

/** Résumé suunto rangé avec la plongée (même esprit que l'import Bluetooth). */
export function metaSuunto(act, dec) {
  return {
    cle: CLE_SUUNTO(act.cle),
    source: 'suunto-cloud',
    activite: act.activite,
    lieLe: new Date().toISOString(),
    genre: dec.genre === 'natation' ? 'autre' : dec.genre,
    gf: dec.gf ? `${dec.gf.bas}/${dec.gf.haut}` : null,
    eau: dec.eau || null,
  };
}

/**
 * Numéros dans l'ordre des dates, en gardant le point de départ du
 * carnet (s'il commence au n°12, il recommence au n°12).
 * @returns {Map<id, numero>} seulement ceux qui changent
 */
export function numerotationChronologique(dives) {
  const cle = d => `${d.date || '9999-99-99'}T${d.heureImmersion || '99:99'}`;
  const tri = [...dives].sort((a, b) => (cle(a) < cle(b) ? -1 : cle(a) > cle(b) ? 1 : (Number(a.numero) || 0) - (Number(b.numero) || 0)));
  const nums = dives.map(d => Number(d.numero)).filter(n => Number.isFinite(n) && n > 0);
  const depart = nums.length ? Math.min(...nums) : 1;
  const out = new Map();
  tri.forEach((d, i) => { if (Number(d.numero) !== depart + i) out.set(d.id, depart + i); });
  return out;
}
