// ============================================================
//  Ce que j'ai vu — découverte dynamique par le lieu
//
//  Aucune liste d'espèces n'est écrite dans ce fichier. Tout est
//  déduit à la demande, à partir du point de plongée, en croisant
//  trois bases publiques et gratuites :
//
//   1. iNaturalist  — QUOI a été observé ici, et à quelle fréquence.
//                     Fournit nom français, photo, et un classement
//                     par nombre d'observations (le meilleur indice
//                     de probabilité de rencontre disponible).
//
//   2. WoRMS        — EST-CE aquatique ? Le registre mondial des
//     (marine-        espèces marines porte, pour chaque espèce, des
//      species.org)   drapeaux isMarine / isBrackish / isFreshwater /
//                     isTerrestrial. C'est ce qui écarte le goéland
//                     et la criste marine, présents en bord de mer
//                     mais qu'aucun plongeur ne croise sous l'eau.
//
//   3. GBIF         — filet de rattrapage pour l'eau douce, que
//                     WoRMS ne couvre que partiellement.
//
//   4. OpenStreetMap — les épaves cartographiées autour du point.
//
//  Une recherche web libre aurait été moins fiable : pas d'API de
//  recherche sans clé payante, pas de CORS depuis un site statique,
//  et des pages à analyser dont la structure change sans prévenir.
//  Ces bases-là sont faites pour être interrogées.
// ============================================================

const INAT = 'https://api.inaturalist.org/v1';
const WORMS = 'https://www.marinespecies.org/rest';
const GBIF = 'https://api.gbif.org/v1';

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// ------------------------------------------------------------
//  Caches
//
//  L'habitat d'une espèce ne change jamais : ce cache-là est
//  permanent, et se remplit au fil des plongées. Le relevé d'un
//  lieu, lui, vieillit doucement : un mois.
// ------------------------------------------------------------

const CLE_HABITAT = 'plongee-journal:habitats';
const CLE_ZONE    = 'plongee-journal:zones';
const TTL_ZONE    = 30 * 24 * 3600 * 1000;
const MAX_ZONES   = 30;

function lire(cle) {
  try { return JSON.parse(localStorage.getItem(cle) || '{}'); } catch { return {}; }
}
function ecrire(cle, valeur) {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch { /* cache optionnel */ }
}

let habitats = null;
const cacheHabitats = () => (habitats ??= lire(CLE_HABITAT));
const sauverHabitats = () => ecrire(CLE_HABITAT, habitats);

function lireZone(cle) {
  const z = lire(CLE_ZONE)[cle];
  return z && Date.now() - z.at < TTL_ZONE ? z.data : null;
}

function ecrireZone(cle, data) {
  const zones = lire(CLE_ZONE);
  zones[cle] = { at: Date.now(), data };
  const gardees = Object.keys(zones)
    .sort((a, b) => zones[b].at - zones[a].at)
    .slice(0, MAX_ZONES);
  ecrire(CLE_ZONE, Object.fromEntries(gardees.map(k => [k, zones[k]])));
}

export function viderCache() {
  localStorage.removeItem(CLE_ZONE);
  localStorage.removeItem(CLE_HABITAT);
  habitats = null;
}

const cleZone = (lat, lng, suffixe) =>
  `${suffixe}|${lat.toFixed(2)},${lng.toFixed(2)}`;

// ------------------------------------------------------------
//  1. iNaturalist — ce qui a été observé ici
// ------------------------------------------------------------

function normaliser(taxon, count = 0) {
  const photo = taxon.default_photo || {};
  return {
    id: taxon.id,
    nom: taxon.preferred_common_name || taxon.name,
    sci: taxon.name,
    rang: taxon.rank || '',
    groupe: taxon.iconic_taxon_name || '',
    photo: photo.square_url || photo.url || '',
    photoGrande: photo.medium_url || photo.url || '',
    credit: photo.attribution || '',
    observations: count,
    source: 'inat',
  };
}

async function observationsBrutes(lat, lng, rayon, limite) {
  const url = `${INAT}/observations/species_counts`
    + `?lat=${lat}&lng=${lng}&radius=${rayon}`
    + `&locale=fr&photos=true&per_page=${Math.min(limite, 200)}`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`iNaturalist a répondu ${res.status}`);

  const json = await res.json();
  return (json.results || [])
    .map(r => normaliser(r.taxon, r.count))
    .filter(t => t.photo && t.sci);
}

// ------------------------------------------------------------
//  2. WoRMS — l'espèce vit-elle dans l'eau, et laquelle ?
// ------------------------------------------------------------

const TAILLE_LOT = 25;      // au-delà, WoRMS renvoie une erreur 400

/**
 * Complète le cache d'habitats pour les noms encore inconnus.
 * `like=false` impose une correspondance exacte : sans ça, WoRMS
 * rapproche « Thymus vulgaris » d'une espèce marine homonyme.
 */
async function resoudreWorms(noms) {
  const cache = cacheHabitats();
  const inconnus = noms.filter(n => !cache[n]);
  if (!inconnus.length) return;

  for (let i = 0; i < inconnus.length; i += TAILLE_LOT) {
    const lot = inconnus.slice(i, i + TAILLE_LOT);
    const q = lot.map(n => `scientificnames[]=${encodeURIComponent(n)}`).join('&');

    try {
      const res = await fetch(`${WORMS}/AphiaRecordsByNames?${q}&like=false&marine_only=false`,
        { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;

      const groupes = await res.json();
      lot.forEach((nom, j) => {
        const fiche = (groupes[j] || [])[0];
        cache[nom] = fiche
          ? {
              marin: fiche.isMarine === 1,
              saumatre: fiche.isBrackish === 1,
              douce: fiche.isFreshwater === 1,
              terrestre: fiche.isTerrestrial === 1,
              regne: fiche.kingdom || '',
              via: 'worms',
            }
          : { via: 'absent-worms' };
      });
    } catch {
      /* lot perdu : les noms restent inconnus, on réessaiera plus tard */
    }
  }
  sauverHabitats();
}

// ------------------------------------------------------------
//  3. GBIF — rattrapage pour l'eau douce
// ------------------------------------------------------------

async function habitatGbif(nom) {
  const m = await fetch(`${GBIF}/species/match?name=${encodeURIComponent(nom)}`,
    { headers: { Accept: 'application/json' } });
  if (!m.ok) return null;
  const { usageKey } = await m.json();
  if (!usageKey) return null;

  const p = await fetch(`${GBIF}/species/${usageKey}/speciesProfiles`,
    { headers: { Accept: 'application/json' } });
  if (!p.ok) return null;

  const profils = (await p.json()).results || [];
  if (!profils.length) return null;

  return {
    marin: profils.some(x => x.marine),
    douce: profils.some(x => x.freshwater),
    terrestre: profils.some(x => x.terrestrial),
    saumatre: false,
    regne: '',
    via: 'gbif',
  };
}

/** Exécute les tâches par petits paquets, pour ne pas saturer l'API. */
async function parPaquets(items, taille, tache) {
  for (let i = 0; i < items.length; i += taille) {
    await Promise.all(items.slice(i, i + taille).map(x => tache(x).catch(() => null)));
  }
}

async function resoudreGbif(noms) {
  const cache = cacheHabitats();
  const aFaire = noms.filter(n => (cache[n]?.via ?? '') === 'absent-worms').slice(0, 60);
  if (!aFaire.length) return;

  await parPaquets(aFaire, 6, async nom => {
    const h = await habitatGbif(nom);
    cache[nom] = h || { via: 'inconnu' };
  });
  sauverHabitats();
}

// ------------------------------------------------------------
//  Décision : garde-t-on l'espèce pour cette plongée ?
// ------------------------------------------------------------

function estAquatique(habitat, eau) {
  if (!habitat) return false;

  // Une espèce à la fois marine et terrestre est un oiseau de mer ou une
  // plante du littoral : on ne la croise pas en plongée.
  if (habitat.terrestre) return false;

  // « Saumâtre » seul ne suffit pas à trancher : le brochet est marqué
  // saumâtre alors qu'il ne vit qu'en eau douce, la rascasse aussi alors
  // qu'elle est strictement marine. On ne l'accepte donc que pour les
  // espèces réellement estuariennes, sans autre milieu déclaré.
  if (eau === 'douce') {
    return habitat.douce === true
        || (habitat.saumatre === true && habitat.marin !== true);
  }
  return habitat.marin === true
      || (habitat.saumatre === true && habitat.douce !== true);
}

/**
 * Positivement terrestre : l'espèce est déclarée terrestre ET n'a aucun
 * milieu aquatique renseigné. Un habitat inconnu ne compte pas — c'est le
 * cas de beaucoup d'espèces d'eau douce, qu'il serait faux d'écarter.
 */
function estTerrestre(habitat) {
  if (!habitat || habitat.terrestre !== true) return false;
  return !(habitat.marin || habitat.douce || habitat.saumatre);
}

const REGNES_FLORE = new Set(['Plantae', 'Chromista', 'Fungi', 'Protozoa', 'Bacteria']);
const GROUPES_FLORE = new Set(['Plantae', 'Fungi', 'Chromista', 'Protozoa']);

function estFlore(taxon, habitat) {
  if (habitat?.regne) return REGNES_FLORE.has(habitat.regne);
  return GROUPES_FLORE.has(taxon.groupe);
}

// ------------------------------------------------------------
//  API publique
// ------------------------------------------------------------

/**
 * Ce qu'on peut voir sous l'eau à cet endroit, faune et flore
 * séparées, du plus fréquemment observé au plus rare.
 *
 * @param {object} opts { lat, lng, eau:'douce'|'salee', rayon, onEtape }
 * @returns {Promise<{faune:Array, flore:Array, total:number, filtres:number}>}
 */
export async function observationsProches({ lat, lng, eau = 'salee', rayon = 12,
                                            limite = 200, onEtape = () => {} } = {}) {
  if (lat == null || lng == null) throw new Error('Pose d’abord le point de plongée sur la carte');

  const cle = cleZone(lat, lng, `vu|${eau}|${rayon}`);
  const enCache = lireZone(cle);
  if (enCache) return enCache;

  onEtape('Lecture des observations du secteur…');
  const brut = await observationsBrutes(lat, lng, rayon, limite);

  onEtape(`${brut.length} espèces relevées — tri des espèces aquatiques…`);
  const noms = brut.map(t => t.sci);
  await resoudreWorms(noms);
  if (eau === 'douce') {
    onEtape('Vérification des espèces d’eau douce…');
    await resoudreGbif(noms);
  }

  const cache = cacheHabitats();

  // Deux niveaux de tri, parce que la qualité des données varie énormément.
  //
  //  strict  : seulement ce qui est POSITIVEMENT aquatique. Excellent en mer,
  //            où WoRMS est exhaustif.
  //  large   : tout sauf ce qui est POSITIVEMENT terrestre. Nécessaire en eau
  //            douce, où la plupart des espèces n'ont aucun habitat renseigné
  //            et disparaîtraient à tort.
  const strict = brut.filter(t => estAquatique(cache[t.sci], eau));
  const large  = brut.filter(t => !estTerrestre(cache[t.sci]));

  const separer = liste => ({
    faune: liste.filter(t => !estFlore(t, cache[t.sci])),
    flore: liste.filter(t => estFlore(t, cache[t.sci])),
  });

  const resultat = {
    ...separer(strict),
    large: separer(large),
    total: brut.length,
    filtres: brut.length - strict.length,
    // En dessous de ce seuil, la liste stricte est trop maigre pour être utile :
    // l'écran proposera d'emblée la liste large, en le disant.
    maigre: strict.length < 8 && large.length > strict.length,
  };

  ecrireZone(cle, resultat);
  return resultat;
}

/** Recherche libre par nom, français ou scientifique, dans le catalogue mondial. */
export async function chercherEspece(q) {
  const texte = String(q || '').trim();
  if (texte.length < 3) return [];

  const res = await fetch(
    `${INAT}/taxa?q=${encodeURIComponent(texte)}&locale=fr&per_page=20&is_active=true`,
    { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`iNaturalist a répondu ${res.status}`);

  const json = await res.json();
  return (json.results || []).map(t => normaliser(t, t.observations_count || 0));
}

// ------------------------------------------------------------
//  4. Épaves — OpenStreetMap
// ------------------------------------------------------------

export async function epavesProches({ lat, lng, rayon = 20 } = {}) {
  if (lat == null || lng == null) throw new Error('Pose d’abord le point de plongée sur la carte');

  const cle = cleZone(lat, lng, `epaves|${rayon}`);
  const enCache = lireZone(cle);
  if (enCache) return enCache;

  const m = Math.round(rayon * 1000);
  const requete = '[out:json][timeout:25];('
    + `node["historic"="wreck"](around:${m},${lat},${lng});`
    + `way["historic"="wreck"](around:${m},${lat},${lng});`
    + `node["seamark:type"="wreck"](around:${m},${lat},${lng});`
    + `way["seamark:type"="wreck"](around:${m},${lat},${lng});`
    + ');out center 60;';

  let json = null, derniere = null;
  for (const point of OVERPASS) {
    try {
      const res = await fetch(point, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: requete }),
      });
      if (!res.ok) { derniere = new Error(`Overpass a répondu ${res.status}`); continue; }
      json = await res.json();
      break;
    } catch (e) { derniere = e; }
  }
  if (!json) throw derniere || new Error('Service des épaves injoignable');

  const vus = new Set();
  const liste = (json.elements || []).map(e => {
    const t = e.tags || {};
    const nom = t.name || t['seamark:name'] || t['seamark:wreck:name'] || '';
    const pos = e.type === 'node' ? e : (e.center || {});
    return {
      id: `osm-${e.type}-${e.id}`,
      nom: nom || 'Épave sans nom',
      anonyme: !nom,
      type: t['wreck:type'] || t['seamark:wreck:category'] || '',
      profondeur: t['seamark:wreck:depth'] || t.depth || '',
      date: t['wreck:date_sunk'] || t.start_date || '',
      lat: pos.lat, lng: pos.lon,
      distance: pos.lat != null ? distanceKm(lat, lng, pos.lat, pos.lon) : null,
      source: 'osm',
    };
  })
  .filter(e => {
    if (e.anonyme) return true;
    const k = e.nom.toLowerCase();
    if (vus.has(k)) return false;
    vus.add(k);
    return true;
  })
  .sort((a, b) => (a.anonyme !== b.anonyme)
    ? (a.anonyme ? 1 : -1)
    : (a.distance ?? 1e9) - (b.distance ?? 1e9));

  ecrireZone(cle, liste);
  return liste;
}

// ------------------------------------------------------------
//  Liens vers les sources, pour aller plus loin à la main
// ------------------------------------------------------------

export const lienWrecksite = nom =>
  `https://www.wrecksite.eu/wreckSearchResult.aspx?q=${encodeURIComponent(nom || '')}`;

export const lienINat = (lat, lng) =>
  `https://www.inaturalist.org/observations?lat=${lat}&lng=${lng}&radius=12&subview=map`;

/** Recherche web classique — l'app ne peut pas la lire, mais toi si. */
export const lienRechercheWeb = (lieu, quoi = 'faune flore plongée') =>
  `https://duckduckgo.com/?q=${encodeURIComponent(`${lieu} ${quoi}`)}`;

export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const r = x => x * Math.PI / 180;
  const dLat = r(lat2 - lat1), dLng = r(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}

/** Forme allégée conservée dans la plongée. */
export function versObservation(t) {
  return {
    id: t.id, nom: t.nom, sci: t.sci || '', photo: t.photo || '',
    source: t.source || 'inat',
    ...(t.distance != null ? { distance: t.distance } : {}),
    ...(t.lat != null ? { lat: t.lat, lng: t.lng } : {}),
  };
}

// Exporté pour les tests.
export const _interne = { estAquatique, estTerrestre, estFlore, normaliser };
