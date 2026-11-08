// ============================================================
//  Ce qu'on sait d'une plongée, et où trouver ce qui manque
//
//  Trois sources, qui ne donnent pas la même chose :
//   • la montre en Bluetooth : tout — profil toutes les 10 s, courbe
//     de pression du bloc (sonde Tank POD), cœur, temps sans palier,
//     plafond, GPS, gaz. Mais seulement les plongées encore gardées
//     dans la montre (les plus récentes) ;
//   • le compte Suunto (et ses .fit) : profil, températures, pression
//     de début et de fin, GPS — pas la courbe de la sonde ;
//   • l'export Suunto (RGPD) : profil, plafond, temps sans palier,
//     parfois le cœur — pas la courbe de la sonde non plus.
//  Pur : testable sans navigateur.
// ============================================================

import { PRE_REMPLI } from './config.js';

const CLE_LISTE = 'plongee-journal:montre-liste';

/** Ce que la montre gardait, vu lors de la dernière connexion Bluetooth. */
export function listeMontre() {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(CLE_LISTE) || 'null');
    return v && Array.isArray(v.ids) ? v : null;
  } catch { return null; }
}

export function memoriserListeMontre(ids) {
  try { globalThis.localStorage?.setItem(CLE_LISTE, JSON.stringify({ le: new Date().toISOString(), ids })); } catch { /* stockage plein */ }
}

/** D'où vient la plongée. */
export function sourcePlongee(d) {
  const cles = d?.suuntoKeys || [];
  if (d?.suunto?.source === 'bluetooth' || cles.some(k => k.startsWith('ocean:'))) return 'montre';
  if (d?.suunto?.source === 'suunto-cloud' || cles.some(k => k.startsWith('suunto:'))) return 'compte';
  if (cles.some(k => k.startsWith('rgpd:'))) return 'export';
  if (cles.length) return 'fichier';
  return 'saisie';
}

export const LIBELLE_SOURCE = {
  montre: 'la montre (Bluetooth)', compte: 'le compte Suunto', export: 'l’export Suunto',
  fichier: 'un fichier .fit', saisie: 'saisie à la main',
};

/** Heure de début (s UNIX) d'une plongée du carnet, si on la connaît. */
function debutS(d) {
  const o = (d.suuntoKeys || []).map(k => /^ocean:(\d+)$/.exec(k)).find(Boolean);
  if (o) return Number(o[1]);
  if (!/^\d{4}-\d\d-\d\d$/.test(d.date || '') || !/^\d\d:\d\d/.test(d.heureImmersion || '')) return null;
  return new Date(`${d.date}T${d.heureImmersion.slice(0, 5)}:00`).getTime() / 1000;
}

/** Cette plongée est-elle encore dans la montre (d'après la dernière liste lue) ? */
export function dansLaMontre(d, liste = listeMontre()) {
  if (!liste?.ids?.length) return false;
  const cle = (d.suuntoKeys || []).find(k => k.startsWith('ocean:'));
  if (cle) return liste.ids.includes(Number(cle.slice(6)));
  const t = debutS(d);
  return t != null && liste.ids.some(id => Math.abs(id - t) <= 600);
}

/**
 * Le bilan d'une plongée.
 * @returns {{source, courbe, sonde:'courbe'|'debut-fin'|'defaut'|'aucune', temp, coeur, ndl, gps,
 *            manque:string[], recuperer:Array<{ou:'montre'|'compte', quoi:string}>, niveau:'complet'|'partiel'|'vide'}}
 */
export function bilanDonnees(d, { liste = listeMontre(), debutMontre = null } = {}) {
  const s = (d?.samples?.length ? d.samples : d?.profil) || [];
  const a = champ => s.some(p => p && Number.isFinite(p[champ]));
  const courbe = s.length >= 3;
  const preRemplie = Number(d.pressionDepart) === PRE_REMPLI.pressionDepart && Number(d.pressionFin) === PRE_REMPLI.pressionFin;
  const sonde = a('pression') ? 'courbe'
    : (d.pressionDepart && d.pressionFin && !preRemplie) ? 'debut-fin'
    : (d.pressionDepart && d.pressionFin) ? 'defaut' : 'aucune';
  const source = sourcePlongee(d);
  const gps = d.lat != null && Math.abs(d.lat) > 0.01;
  const bilan = {
    source, courbe, sonde,
    temp: a('temp') || d.tempFond != null,
    coeur: a('fc'),
    ndl: a('sansPalier'),
    gps,
  };
  bilan.manque = [
    !courbe && 'courbe de plongée',
    sonde !== 'courbe' && (sonde === 'debut-fin' ? 'courbe de la sonde' : 'pression du bloc'),
    !gps && 'point GPS',
  ].filter(Boolean);

  bilan.recuperer = [];
  if ((!courbe || sonde !== 'courbe' || !gps) && dansLaMontre(d, liste)) {
    bilan.recuperer.push({ ou: 'montre', quoi: 'tout : courbe, sonde, cœur, GPS' });
  } else if (!courbe && (source === 'compte' || source === 'export' || source === 'fichier'
    || (source === 'saisie' && debutMontre && (d.date || '') >= debutMontre))) {
    bilan.recuperer.push({ ou: 'compte', quoi: 'la courbe de plongée' });
  }
  bilan.niveau = courbe && sonde === 'courbe' ? 'complet' : courbe ? 'partiel' : 'vide';
  return bilan;
}

/** La date de la première plongée venue d'un ordinateur Suunto (avant : rien à récupérer). */
export function debutOrdinateur(dives) {
  return dives.filter(d => sourcePlongee(d) !== 'saisie' && d.date).map(d => d.date).sort()[0] || null;
}

/**
 * Ce que la montre (Bluetooth) apporte à une plongée déjà au carnet : la
 * courbe complète remplace une courbe sans sonde ; le reste ne remplit que
 * ce qui est vide (ou les 200 → 50 bar pré-remplis).
 * @param {object} dive    la plongée du carnet
 * @param {object} decode  oceanToDive()
 * @returns {{champs:object, libelles:string[]}}
 */
export function completerDepuisMontre(dive, decode) {
  const champs = {}, libelles = [];
  const vide = v => v == null || v === '' || (typeof v === 'number' && Number.isNaN(v));
  const ancienne = dive.samples || [];
  const avecSonde = s => (s || []).some(p => Number.isFinite(p?.pression));
  if (decode.samples?.length && (!ancienne.length || (!avecSonde(ancienne) && avecSonde(decode.samples))
    || decode.samples.length > ancienne.length * 1.3)) {
    champs.samples = decode.samples;
    libelles.push(avecSonde(decode.samples) ? 'courbe et sonde' : 'courbe');
  }
  const preRemplie = Number(dive.pressionDepart) === PRE_REMPLI.pressionDepart && Number(dive.pressionFin) === PRE_REMPLI.pressionFin;
  if (decode.pressionDepart && (preRemplie || vide(dive.pressionDepart))) {
    champs.pressionDepart = decode.pressionDepart;
    if (decode.pressionFin) champs.pressionFin = decode.pressionFin;
    libelles.push('pression du bloc');
  }
  const mettre = (k, v, lib) => { if (!vide(v) && vide(dive[k])) { champs[k] = v; if (!libelles.includes(lib)) libelles.push(lib); } };
  mettre('profMax', decode.profMax, 'profondeur');
  mettre('profMoy', decode.profMoy, 'profondeur');
  mettre('dureeMin', decode.dureeMin, 'durée');
  mettre('tempFond', decode.tempFond != null ? Math.round(decode.tempFond) : null, 'température');
  mettre('blocLitres', decode.blocLitres, 'bloc');
  if (decode.lieu && (vide(dive.lat) || Math.abs(dive.lat) <= 0.01)) {
    champs.lat = decode.lieu.lat; champs.lng = decode.lieu.lng; libelles.push('GPS');
  }
  if (vide(dive.gazO2) && decode.gazO2 && (decode.gazO2 !== 21 || decode.gazHe)) {
    champs.gazType = decode.gazHe ? 'trimix' : 'nitrox';
    champs.gazO2 = decode.gazO2;
    if (decode.gazHe) champs.gazHe = decode.gazHe;
    libelles.push('mélange');
  }
  return { champs, libelles };
}
