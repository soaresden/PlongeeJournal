// ============================================================
//  Garde-fous : doublons possibles et incohérences
//
//  Une plongée recopiée du carnet papier peut exister déjà, importée
//  de la montre : date mal lue, pas d'heure, lieu différent… Rien ne
//  les relie, sauf la ressemblance (profondeur, durée, quelques
//  semaines d'écart). Et certaines fiches se contredisent : 23 °C dans
//  un lac d'Île-de-France en mars, de l'eau douce « en mer ».
//  Pur : testable sans navigateur.
// ============================================================

import { guessWater } from './model.js';

const ordi = d => (d?.suuntoKeys || []).length > 0 || (d?.samples || []).length > 2;
const jour = s => (/^\d{4}-\d\d-\d\d$/.test(s || '') ? new Date(`${s}T12:00:00Z`).getTime() / 86400000 : null);
const minutes = s => (/^\d\d:\d\d/.test(s || '') ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null);
const proche = (a, b, abs, rel) => a != null && b != null && Math.abs(a - b) <= Math.max(abs, rel * Math.max(a, b));

export const ECART_JOURS = 45;

/**
 * Les plongées qui pourraient être la même que `dive` : l'une vient de
 * l'ordinateur, l'autre est saisie à la main, quelques semaines d'écart
 * au plus, profondeur et durée voisines.
 * @returns {Array<{dive, jours, raisons:string[], score}>} du plus probable au moins probable
 */
export function doublonsPossibles(dive, dives) {
  const j0 = jour(dive?.date);
  if (j0 == null) return [];
  const refus = new Set(dive.pasDoublon || []);
  const out = [];
  for (const d of dives) {
    if (!d || d.id === dive.id || refus.has(d.id) || (d.pasDoublon || []).includes(dive.id)) continue;
    // Deux plongées de l'ordinateur : l'import sait déjà les distinguer.
    // Deux saisies à la main : rien ne permet de trancher.
    if (ordi(d) === ordi(dive)) continue;
    const j = jour(d.date);
    if (j == null) continue;
    const jours = Math.round(Math.abs(j - j0));
    if (jours > ECART_JOURS) continue;
    // Même jour, deux heures bien différentes : deux plongées.
    const h1 = minutes(dive.heureImmersion), h2 = minutes(d.heureImmersion);
    if (jours === 0 && h1 != null && h2 != null && Math.abs(h1 - h2) > 30) continue;
    const pA = Number(dive.profMax) || null, pB = Number(d.profMax) || null;
    const dA = Number(dive.dureeMin) || null, dB = Number(d.dureeMin) || null;
    if (!proche(pA, pB, 2.5, 0.2) || !proche(dA, dB, 12, 0.3)) continue;
    const raisons = [
      jours === 0 ? 'même jour' : `${jours} jour${jours > 1 ? 's' : ''} d’écart`,
      `${pA} m / ${pB} m`, `${dA} / ${dB} min`,
    ];
    const memeLieu = String(dive.lieuNom || '').trim().toLowerCase() === String(d.lieuNom || '').trim().toLowerCase() && dive.lieuNom;
    if (memeLieu) raisons.push('même lieu');
    const score = jours + Math.abs(pA - pB) * 2 + Math.abs(dA - dB) / 2 - (memeLieu ? 10 : 0);
    out.push({ dive: d, jours, raisons, score });
  }
  return out.sort((a, b) => a.score - b.score).slice(0, 3);
}

/** Toutes les paires suspectes du carnet (chaque paire une seule fois). */
export function doublonsDuCarnet(dives) {
  const vues = new Set(), out = [];
  for (const d of dives.filter(x => !ordi(x))) {
    for (const c of doublonsPossibles(d, dives)) {
      const cle = [d.id, c.dive.id].sort().join('|');
      if (vues.has(cle)) continue;
      vues.add(cle);
      out.push({ saisie: d, montre: c.dive, raisons: c.raisons });
    }
  }
  return out;
}

/** Les températures relevées (profil de la montre, sinon la fiche). */
function temperatures(d) {
  const t = (d?.samples || []).filter(p => p && p.d >= 1.2 && Number.isFinite(p.temp)).map(p => p.temp);
  if (t.length) return { min: Math.min(...t), max: Math.max(...t) };
  const f = Number.isFinite(Number(d?.tempFond)) && d?.tempFond !== '' && d?.tempFond != null ? Number(d.tempFond) : null;
  return f != null ? { min: f, max: f } : null;
}

/**
 * Ce qui se contredit sur une fiche.
 * @returns {Array<{code, texte}>}
 */
export function incoherences(d) {
  const out = [];
  if (!d) return out;
  const t = temperatures(d);
  const lat = d.lat != null && Math.abs(d.lat) > 0.01 ? Number(d.lat) : null;
  const mois = /^\d{4}-(\d\d)/.exec(d.date || '')?.[1];
  const m = mois ? Number(mois) : null;
  // Hiver de l'hémisphère du lieu (nord par défaut).
  const hiver = m != null && (lat != null && lat < 0 ? [5, 6, 7, 8, 9].includes(m) : [11, 12, 1, 2, 3, 4].includes(m));
  const fosse = (d.options || []).includes('Plongée en fosse') || /fosse|piscine|nemo|todi|y-?40/i.test(`${d.lieuNom} ${d.site}`);

  if (t && lat != null && !fosse) {
    if (Math.abs(lat) > 43 && hiver && t.min >= 18) {
      out.push({ code: 'chaud', texte: `Eau à ${Math.round(t.min)} °C ou plus, en ${NOMS_MOIS[m - 1]}, à une latitude de ${Math.round(Math.abs(lat))}° : ce n’est pas cet endroit-là, ou pas cette date.` });
    } else if (Math.abs(lat) > 43 && t.min >= 26) {
      out.push({ code: 'chaud', texte: `Eau à ${Math.round(t.min)} °C ou plus à une latitude de ${Math.round(Math.abs(lat))}° : le lieu est-il le bon ?` });
    }
    if (Math.abs(lat) < 23.5 && t.max <= 18) {
      out.push({ code: 'froid', texte: `Eau à ${Math.round(t.max)} °C au plus, sous les tropiques : le lieu est-il le bon ?` });
    }
  }
  if (t && lat == null && d.eau === 'douce' && !fosse && hiver && t.min >= 20) {
    out.push({ code: 'chaud', texte: `Eau douce à ${Math.round(t.min)} °C en ${NOMS_MOIS[m - 1]} : le lieu est-il le bon ?` });
  }
  // Eau douce / salée contredite par le nom du lieu (quand ce n'est pas l'utilisateur qui l'a choisie).
  const nom = `${d.lieuNom || ''} ${d.site || ''}`;
  const devine = guessWater(nom);
  // Pas quand l'eau vient du point GPS (plus sûr que le nom) ou d'un choix à la main.
  if (d.eau && devine && devine !== d.eau && !d.eauManuelle && !d.eauAuto) {
    out.push({ code: 'eau', texte: `Noté « eau ${d.eau === 'douce' ? 'douce' : 'salée'} », mais « ${String(d.lieuNom || d.site).trim()} » fait penser à de l’eau ${devine === 'douce' ? 'douce' : 'salée'}.` });
  }
  return out;
}

const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// ------------------------------------------------------------
//  Fusion
// ------------------------------------------------------------

/** Ce qui se mesure : la montre a raison. */
const MESURES = ['date', 'heureImmersion', 'heureSortie', 'dureeMin', 'profMax', 'profMoy', 'samples', 'profil',
  'suuntoKeys', 'suunto', 'suuntoId', 'paliersEstimes', 'palier3', 'palier6', 'palier9', 'palierSecu', 'palierSecuMin',
  'tempFond', 'tempSurface', 'gazType', 'gazO2', 'gazHe', 'blocLitres'];
/** Ce qui est un choix ou un souvenir : la saisie a raison quand elle dit quelque chose. */
const SOUVENIRS = ['buddyIds', 'chefBuddyId', 'palanqueeMode', 'moniteurSansNom', 'centreNom', 'centreAdresse', 'centreLat', 'centreLng',
  'photoCarnet', 'niveau', 'type', 'fait', 'vu', 'observations', 'vuFaune', 'vuFlore', 'vuEpaves', 'lestage', 'combiType', 'combiMm',
  'combinaison', 'materielIds', 'meteo', 'etatMer', 'visibilite', 'courant', 'tempAir', 'objectifs', 'objectifAutre', 'exercices',
  'ressenti', 'note', 'options', 'blocType', 'blocMatiere', 'videoDossier'];
const LIEU = ['lieuNom', 'lieuDetail', 'lat', 'lng', 'site', 'eau', 'eauAuto', 'eauManuelle', 'indiceEau', 'altitude', 'lieuAuto'];

const plein = v => !(v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length));

/**
 * Deux fiches de la même plongée → une seule (celle de la montre, qui
 * garde son identifiant).
 * @param {object} montre  la fiche venue de l'ordinateur
 * @param {object} saisie  la fiche saisie à la main
 * @param {{lieu:'montre'|'saisie'}} options
 * @returns {object} la fiche fusionnée
 */
export function fusionnerPlongees(montre, saisie, { lieu = lieuParDefaut(montre, saisie) } = {}) {
  const f = structuredClone(montre);
  for (const k of MESURES) if (!plein(f[k]) && plein(saisie[k])) f[k] = structuredClone(saisie[k]);
  for (const k of SOUVENIRS) if (plein(saisie[k])) f[k] = structuredClone(saisie[k]);
  // Les plongeurs des deux fiches.
  f.buddyIds = [...new Set([...(saisie.buddyIds || []), ...(montre.buddyIds || [])])];
  if (!f.chefBuddyId && montre.chefBuddyId) f.chefBuddyId = montre.chefBuddyId;
  // La pression : une vraie mesure de la montre, sinon celle saisie.
  const defaut = d => Number(d.pressionDepart) === 200 && Number(d.pressionFin) === 50;
  if ((!plein(montre.pressionDepart) || defaut(montre)) && plein(saisie.pressionDepart) && !defaut(saisie)) {
    f.pressionDepart = saisie.pressionDepart; f.pressionFin = saisie.pressionFin;
  }
  if (lieu === 'saisie') for (const k of LIEU) { if (k in saisie) f[k] = structuredClone(saisie[k]); else delete f[k]; }
  for (const k of ['fait', 'observations']) {
    if (plein(montre[k]) && plein(saisie[k]) && montre[k] !== saisie[k]) f[k] = `${saisie[k]}\n${montre[k]}`;
  }
  f.pasDoublon = [...new Set([...(montre.pasDoublon || []), ...(saisie.pasDoublon || [])])].filter(id => id !== saisie.id);
  if (!f.pasDoublon.length) delete f.pasDoublon;
  return f;
}

/** Le lieu à garder par défaut : le GPS de la montre s'il vient d'elle, sinon celui de la saisie. */
export function lieuParDefaut(montre, saisie) {
  const gpsMontre = montre.lat != null && (montre.suunto?.source === 'bluetooth' || montre.lieuAuto);
  if (gpsMontre) return 'montre';
  return plein(saisie.lieuNom) || saisie.lat != null ? 'saisie' : 'montre';
}
