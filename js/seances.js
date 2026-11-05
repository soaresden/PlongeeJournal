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
 * Plongée ou séance ? D'après ce que la montre en dit.
 * @param {{genre?:string, profMax?:number|null, date?:Date|string, lieu?:{lat,lng}|null}} a
 * @param {object[]} seances  les séances déjà rangées (pour reconnaître le lieu)
 * @returns {'plongee'|'fosse'|'piscine'|'apnee'}
 */
export function suggererRangement({ genre = '', profMax = null, date = null, lieu = null } = {}, seances = []) {
  const prof = Number(profMax) || 0;
  const connu = lieu ? typeDuLieu(lieu, seances) : null;

  if (genre === 'apnee') return connu === 'fosse' ? 'fosse' : 'apnee';
  // Natation (pas de profondeur) ou petit bain : une séance de piscine,
  // ou ce qui se fait d'habitude à cet endroit.
  if (genre === 'autre' || prof < 3) return connu && connu !== 'fosse' ? connu : 'piscine';
  if (connu) return connu;
  // Le jeudi soir, entre 3 et 25 m : la fosse.
  const jour = date ? new Date(typeof date === 'string' ? `${date}T12:00:00` : date).getDay() : null;
  if (jour === 4 && prof <= 25) return 'fosse';
  return 'plongee';
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
