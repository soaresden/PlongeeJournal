// ============================================================
//  Historique des changements : de quoi revenir en arrière
//
//  Avant chaque modification d'une plongée ou d'une séance (et avant
//  chaque suppression), l'ancienne version est gardée ici, sur
//  l'appareil. Plusieurs modifications rapprochées (l'enregistrement
//  automatique pendant qu'on tape) ne font qu'une version : celle d'avant
//  la séance de modifications. Pur, sauf le stockage (injectable).
// ============================================================

const CLE = 'plongee-journal:historique';
const MAX = 400;                   // versions gardées en tout
const MAX_PAR_FICHE = 25;
const REGROUPER_MS = 10 * 60 * 1000;

let stockage = {
  lire() { try { return JSON.parse(globalThis.localStorage?.getItem(CLE) || '[]'); } catch { return []; } },
  ecrire(v) {
    for (let n = v.length; n > 0; n = Math.floor(n * 0.7)) {
      try { globalThis.localStorage?.setItem(CLE, JSON.stringify(v.slice(-n))); return; } catch { /* plein : on garde moins */ }
    }
  },
};
/** Pour les tests. */
export function utiliserStockage(s) { stockage = s; }

/** Ce qui ne compte pas comme un changement. */
const IGNORE = new Set(['updatedAt', 'createdAt', 'numero']);   // le numéro suit les dates, tout seul
const LOURD = new Set(['samples', 'profil']);

export function signature(o) {
  return JSON.stringify(Object.keys(o || {}).filter(k => !IGNORE.has(k)).sort().map(k => [k, o[k]]));
}

/**
 * Garde l'ancienne version (avant une modification ou une suppression).
 * @param {'dive'|'seance'} type
 * @param {object} avant   la version qui va être remplacée ou supprimée
 * @param {object} [apres] la nouvelle version (rien n'est gardé si identique)
 */
export function noter(type, avant, { apres = null, quoi = 'modif', maintenant = Date.now() } = {}) {
  if (!avant?.id) return false;
  if (apres && signature(avant) === signature(apres)) return false;
  const liste = stockage.lire();
  const derniere = [...liste].reverse().find(e => e.id === avant.id);
  // Une rafale de modifications : on garde la version d'avant la rafale.
  if (quoi === 'modif' && derniere && derniere.quoi === 'modif' && maintenant - Date.parse(derniere.at) < REGROUPER_MS) return false;
  const donnees = structuredClone(avant);
  // La courbe ne change pas quand on retouche une fiche : inutile de la
  // copier à chaque version (on la garde pour une suppression).
  if (quoi === 'modif') for (const k of LOURD) if (k in donnees) { delete donnees[k]; donnees[`_${k}Retire`] = true; }
  liste.push({ id: avant.id, type, quoi, at: new Date(maintenant).toISOString(), donnees });
  // Bornes : par fiche, puis en tout.
  const parFiche = liste.filter(e => e.id === avant.id);
  if (parFiche.length > MAX_PAR_FICHE) liste.splice(liste.indexOf(parFiche[0]), 1);
  stockage.ecrire(liste.slice(-MAX));
  return true;
}

/** Les versions d'une fiche, de la plus récente à la plus ancienne. */
export function versions(id) {
  return stockage.lire().filter(e => e.id === id).reverse();
}

/** Tout l'historique, du plus récent au plus ancien. */
export function tout() { return stockage.lire().reverse(); }

/** La version à réécrire : l'ancienne, avec la courbe d'aujourd'hui si elle n'avait pas été copiée. */
export function aRestaurer(entree, actuelle = null) {
  const d = structuredClone(entree.donnees);
  for (const k of LOURD) {
    if (d[`_${k}Retire`]) { delete d[`_${k}Retire`]; if (actuelle?.[k] !== undefined) d[k] = actuelle[k]; }
  }
  return d;
}

const LIBELLES = {
  date: 'date', heureImmersion: 'heure', heureSortie: 'heure de sortie', dureeMin: 'durée', profMax: 'profondeur',
  profMoy: 'profondeur', lieuNom: 'lieu', lieuDetail: 'lieu', lat: 'point GPS', lng: 'point GPS', site: 'site', eau: 'eau',
  centreNom: 'centre', buddyIds: 'palanquée', chefBuddyId: 'palanquée', palanqueeMode: 'palanquée', moniteurSansNom: 'palanquée',
  type: 'type', niveau: 'niveau', options: 'spécificités', observations: 'notes', notes: 'notes', note: 'note', ressenti: 'ressenti',
  lestage: 'lestage', combiType: 'combinaison', combiMm: 'combinaison', blocType: 'bloc', blocMatiere: 'bloc', blocLitres: 'bloc',
  gazType: 'gaz', gazO2: 'gaz', gazHe: 'gaz', pressionDepart: 'pression', pressionFin: 'pression', materielIds: 'matériel',
  equipement: 'matériel', meteo: 'conditions', etatMer: 'conditions', visibilite: 'conditions', courant: 'conditions',
  tempAir: 'températures', tempSurface: 'températures', tempFond: 'températures', photoCarnet: 'page du carnet',
  videoDossiers: 'vidéos', videoDossier: 'vidéos', videoSans: 'vidéos', videosRetirees: 'vidéos', numero: 'numéro',
  palier3: 'paliers', palier6: 'paliers', palier9: 'paliers', palierSecu: 'paliers', palierSecuMin: 'paliers',
  lieu: 'lieu', heure: 'heure', tempEau: 'température',
};

/** Ce qui diffère entre deux versions, en mots (« lieu, palanquée, notes »). */
export function differences(a, b) {
  const cles = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = new Set();
  for (const k of cles) {
    if (IGNORE.has(k) || LOURD.has(k) || k.startsWith('_')) continue;
    if (JSON.stringify(a?.[k] ?? null) !== JSON.stringify(b?.[k] ?? null)) out.add(LIBELLES[k] || k);
  }
  return [...out];
}
