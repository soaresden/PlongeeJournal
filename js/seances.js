// ============================================================
//  Séances (fosse, piscine, apnée) : ce qui ne dépend pas de l'écran
//
//  - deviner si une activité de la montre est une plongée ou une
//    séance, et de quel type ;
//  - fabriquer la séance correspondante ;
//  - retrouver, dans le carnet, les « plongées » qui étaient en fait
//    des séances (une piscine importée par erreur).
// ============================================================

import { emptySeance } from './model.js';

/** Distance en mètres entre deux points {lat, lng}. */
export function distanceM(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

const PRES = 400;   // m : « au même endroit » qu'une séance déjà rangée

/** Le type des séances déjà rangées à cet endroit, s'il n'y en a qu'un. */
function typeDuLieu(lieu, seances) {
  const proches = seances.filter(s => s.lat != null && distanceM(lieu, s) < PRES);
  const types = new Set(proches.map(s => s.type));
  return types.size === 1 ? [...types][0] : null;
}

/**
 * Ce que dit la courbe de profondeur, quand la montre l'a enregistrée.
 * Une « immersion » commence sous 1,2 m et finit en remontant au-dessus.
 * @returns {{immersions:number, plusLongueS:number, profMax:number, dureeS:number, sonde:boolean}|null}
 */
export function lireProfil(samples = []) {
  if (!samples?.length) return null;
  const SEUIL = 1.2;
  const immersions = [];
  let debut = null;
  for (const s of samples) {
    const d = Number(s.d) || 0;
    if (d > SEUIL && debut === null) debut = s.t;
    else if (d <= SEUIL && debut !== null) { immersions.push(s.t - debut); debut = null; }
  }
  const dernier = samples[samples.length - 1];
  if (debut !== null) immersions.push(dernier.t - debut);
  return {
    immersions: immersions.length,
    sousLEauS: immersions.reduce((a, b) => a + b, 0),
    plusLongueS: Math.max(0, ...immersions),
    profMax: Math.max(0, ...samples.map(s => Number(s.d) || 0)),
    dureeS: dernier.t - samples[0].t,
    // La sonde de bouteille : une pression relevée pendant la plongée.
    sonde: samples.some(s => s.p != null || s.pression != null || s.bar != null),
  };
}

/**
 * L'apnée, vraiment sous l'eau : le temps passé en immersion (sous 1,2 m),
 * d'après la courbe de la montre, sur toutes les séances sans bouteille.
 * Une immersion de plus de 8 minutes n'est pas une apnée : écartée.
 * La montre relève la profondeur toutes les 10 s : les durées sont à 10 s près.
 * @returns {{seances:number, immersions:number, sousLEauS:number,
 *            record:{s:number, seance:object}|null, profond:{m:number, seance:object}|null}}
 */
export function statsApnee(seances = []) {
  const out = { seances: 0, immersions: 0, sousLEauS: 0, record: null, profond: null };
  for (const s of seances) {
    if (s.type === 'fosse') continue;
    const p = lireProfil(s.samples);
    if (p && p.immersions && p.plusLongueS < 8 * 60) {
      out.seances++;
      out.immersions += p.immersions;
      out.sousLEauS += p.sousLEauS;
      if (!out.record || p.plusLongueS > out.record.s) out.record = { s: p.plusLongueS, seance: s };
      if (!out.profond || p.profMax > out.profond.m) out.profond = { m: p.profMax, seance: s };
    }
    // Une statique chronométrée et saisie à la main compte aussi.
    const saisie = Number(s.apneeMaxS) || 0;
    if (saisie && (!out.record || saisie > out.record.s)) out.record = { s: saisie, seance: s };
  }
  return out;
}

/**
 * Le verdict de la courbe, d'après la façon dont on pratique :
 *  - la piscine, ce sont des longueurs : pas de profondeur, une séance longue ;
 *  - l'apnée, des immersions répétées (canards, statique…) de deux ou trois
 *    minutes au plus, jusqu'à une dizaine de mètres, en fosse ou en bassin ;
 *  - le snorkeling, pareil mais dehors (la montre a un point GPS) ;
 *  - une immersion longue, ou la sonde de bouteille : une plongée.
 * @returns {'plongee'|'piscine'|'apnee'|'snorkeling'|null}  null : la courbe ne tranche pas
 */
export function verdictProfil(p, { lieu = null } = {}) {
  if (!p) return null;
  if (p.sonde) return 'plongee';
  if (!p.immersions) return 'piscine';
  if (p.plusLongueS >= 8 * 60 && p.profMax >= 3) return 'plongee';
  if (p.immersions >= 3 && p.plusLongueS <= 4 * 60) return lieu ? 'snorkeling' : 'apnee';
  return null;
}

/**
 * Le jeudi, c'est la fosse… à la maison. La fosse est sous un toit : la
 * montre n'y prend pas de point GPS. Un jeudi avec un point GPS, c'est
 * dehors (vacances, sortie en mer) : une plongée, sauf si ce point est
 * celui d'une fosse déjà connue. Et la fosse, c'est le soir : un jeudi
 * à midi, c'est une plongée (en voyage, la montre n'a pas toujours le GPS).
 */
function jeudiDeFosse(date, lieu, connu, prof) {
  if (!date || prof > 25) return false;
  const quand = new Date(typeof date === 'string' && !date.includes('T') ? `${date}T20:00:00` : date);
  if (quand.getDay() !== 4 || quand.getHours() < 18) return false;
  return !lieu || connu === 'fosse';
}

/**
 * Plongée ou séance ? D'après ce que la montre en dit.
 * @param {{genre?:string, profMax?:number|null, date?:Date|string, lieu?:{lat,lng}|null}} a
 * @param {object[]} seances  les séances déjà rangées (pour reconnaître le lieu)
 * @returns {'plongee'|'fosse'|'piscine'|'apnee'|'snorkeling'}
 */
export function suggererRangement({ genre = '', profMax = null, date = null, lieu = null, samples = null } = {}, seances = []) {
  const prof = Number(profMax) || 0;
  const connu = lieu ? typeDuLieu(lieu, seances) : null;

  // La courbe passe avant le mode choisi sur la montre : on oublie souvent
  // de le changer, la courbe, elle, ne ment pas.
  // Seule exception : la montre dit natation ou apnée (le type d'activité
  // officiel) — il faut alors la sonde de bouteille pour parler de plongée.
  const profil = lireProfil(samples);
  let courbe = verdictProfil(profil, { lieu });
  if (courbe === 'plongee' && (genre === 'apnee' || genre === 'autre') && !profil.sonde) courbe = null;
  if (courbe === 'plongee') {
    if (connu === 'fosse') return 'fosse';
    return jeudiDeFosse(date, lieu, connu, prof) ? 'fosse' : 'plongee';
  }
  if (courbe === 'piscine') return connu && connu !== 'fosse' ? connu : 'piscine';
  if (courbe) return connu && connu !== 'piscine' ? connu : courbe;

  // Snorkeling : souvent le mode choisi sur la montre pour un
  // entraînement en piscine ou en fosse. Au même endroit qu'une séance
  // déjà rangée, on reprend son type.
  if (genre === 'snorkeling') return connu || 'snorkeling';
  if (genre === 'apnee') return connu === 'fosse' ? 'fosse' : 'apnee';
  // Natation (pas de profondeur) ou petit bain : une séance de piscine,
  // ou ce qui se fait d'habitude à cet endroit.
  if (genre === 'autre' || prof < 3) return connu && connu !== 'fosse' ? connu : 'piscine';
  if (connu) return connu;
  // Le jeudi soir, entre 3 et 25 m, sans GPS : la fosse.
  return jeudiDeFosse(date, lieu, connu, prof) ? 'fosse' : 'plongee';
}

const pad = n => String(n).padStart(2, '0');

/** Séance tirée d'une activité de la montre (même forme que oceanToDive). */
export function seanceDepuisImport(diverId, type, decode, { cles = [], suunto = null } = {}) {
  const s = emptySeance(diverId, type, '');
  if (decode.start) {
    const d = decode.start;
    s.date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    s.heure = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (decode.dureeMin) s.dureeMin = Math.round(decode.dureeMin);
  if (decode.profMax && type !== 'piscine') s.profMax = decode.profMax;
  if (decode.samples?.length) s.samples = decode.samples;
  if (decode.lieu) { s.lat = decode.lieu.lat; s.lng = decode.lieu.lng; }
  if (decode.tempFond != null) s.tempEau = Math.round(decode.tempFond);
  s.suuntoKeys = [...cles];
  if (suunto) s.suunto = suunto;
  s.source = 'bluetooth';
  return s;
}

/**
 * Les séances, vues comme des plongées pour le rapprochement avec la
 * montre (plongeeCorrespondante lit date, heureImmersion, suuntoKeys).
 */
export const commePlongees = seances => seances.map(s => ({ ...s, heureImmersion: s.heure, numero: null, seance: true }));

/**
 * Les plongées du carnet qui ressemblent à des séances : importées d'un
 * ordinateur, et sans profondeur, en petit bain, ou en fosse.
 * @returns {{dive:object, type:string}[]}
 */
export function plongeesARanger(dives, seances = []) {
  const out = [];
  for (const d of dives) {
    const enFosse = (d.options || []).includes('Plongée en fosse');
    const bluetooth = d.suunto?.source === 'bluetooth';
    const fit = !bluetooth && (d.suuntoKeys || []).length > 0;
    let type = 'plongee';
    if (enFosse) type = 'fosse';
    else if (bluetooth) {
      type = suggererRangement({
        genre: d.suunto?.genre === 'apnee' || d.suunto?.genre === 'autre' ? d.suunto.genre : '',
        profMax: d.profMax, date: d.date, lieu: d.lat != null ? { lat: d.lat, lng: d.lng } : null,
      }, seances);
    } else if (fit && (Number(d.profMax) || 0) < 3) {
      // Un vieux .fit : seul le petit bain est sans ambiguïté.
      type = 'piscine';
    }
    if (type !== 'plongee') out.push({ dive: d, type });
  }
  return out;
}
