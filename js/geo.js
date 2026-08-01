// ============================================================
//  Reconnaissance du plan d'eau
//
//  Quand tu poses le point, l'app va voir ce qu'il y a là, plutôt
//  que de deviner d'après le nom :
//
//   • OpenStreetMap (Overpass) — y a-t-il un plan d'eau, une
//     rivière, ou un trait de côte à cet endroit ?
//   • Open-Meteo — quelle altitude ? Le niveau de la mer est à 0 ;
//     un lac de montagne à 450 m ne peut pas être salé, et au-delà
//     de 300 m la plongée est réglementairement « en altitude ».
//
//  Tout est facultatif : si les services ne répondent pas, on
//  retombe sur le nom du lieu, et rien ne bloque la saisie.
// ============================================================

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const CLE_CACHE = 'plongee-journal:lieux';
const TTL = 180 * 24 * 3600 * 1000;      // six mois : un lac ne bouge pas

function cache() {
  try { return JSON.parse(localStorage.getItem(CLE_CACHE) || '{}'); } catch { return {}; }
}
function ecrire(c) {
  const cles = Object.keys(c).sort((a, b) => c[b].at - c[a].at).slice(0, 60);
  try { localStorage.setItem(CLE_CACHE, JSON.stringify(Object.fromEntries(cles.map(k => [k, c[k]])))); }
  catch { /* cache optionnel */ }
}

const cle = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

// ------------------------------------------------------------
//  Altitude
// ------------------------------------------------------------

export async function altitude(lat, lng) {
  const res = await fetch(
    `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`,
    { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Altitude indisponible (${res.status})`);
  const json = await res.json();
  const v = (json.elevation || [])[0];
  return typeof v === 'number' ? v : null;
}

// ------------------------------------------------------------
//  Ce qu'il y a dans l'eau autour du point
// ------------------------------------------------------------

async function elementsAutour(lat, lng) {
  const requete = '[out:json][timeout:20];('
    + `way(around:200,${lat},${lng})["natural"="water"];`
    + `relation(around:200,${lat},${lng})["natural"="water"];`
    + `way(around:500,${lat},${lng})["natural"="coastline"];`
    + `way(around:200,${lat},${lng})["waterway"~"^(river|canal|stream|riverbank|dock)$"];`
    + `way(around:300,${lat},${lng})["leisure"="swimming_pool"];`
    + ');out tags 30;';

  for (const point of OVERPASS) {
    try {
      const res = await fetch(point, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: requete }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      return (json.elements || []).map(e => e.tags || {});
    } catch { /* on essaie le miroir suivant */ }
  }
  return null;                      // service indisponible, pas « rien trouvé »
}

// ------------------------------------------------------------
//  Décision
// ------------------------------------------------------------

const EAUX_DOUCES = new Set([
  'lake', 'pond', 'reservoir', 'basin', 'canal', 'river', 'stream_pool',
  'oxbow', 'moat', 'wastewater', 'fishpond', 'reflecting_pool',
]);

/**
 * @returns {{eau:'douce'|'salee'|'', altitude:number|null, indice:string,
 *            certitude:'sûre'|'probable'|'incertaine', nomPlanEau:string,
 *            fosse:boolean, piscine:boolean}}
 */
export function conclure(tags, alt) {
  const resultat = {
    eau: '', altitude: alt ?? null, indice: '', certitude: 'incertaine',
    nomPlanEau: '', fosse: false, piscine: false,
  };

  const plansEau = (tags || []).filter(t => t.natural === 'water');
  const cotes    = (tags || []).filter(t => t.natural === 'coastline');
  const cours    = (tags || []).filter(t => t.waterway);
  const piscines = (tags || []).filter(t => t.leisure === 'swimming_pool');

  const nomme = plansEau.find(t => t.name) || cours.find(t => t.name) || piscines.find(t => t.name);
  if (nomme) resultat.nomPlanEau = nomme.name || '';

  resultat.piscine = piscines.length > 0;
  resultat.fosse = /fosse/i.test(resultat.nomPlanEau)
                || piscines.some(t => /fosse|dive|plong/i.test(t.name || ''));

  // 1. Un tag explicite tranche tout de suite.
  const sale = plansEau.find(t => t.salt === 'yes' || t.water === 'lagoon');
  if (sale) {
    return { ...resultat, eau: 'salee', certitude: 'sûre',
             indice: `plan d’eau salé cartographié${sale.name ? ` : ${sale.name}` : ''}` };
  }

  // 2. Piscine ou fosse : toujours de l'eau douce.
  if (resultat.piscine) {
    return { ...resultat, eau: 'douce', certitude: 'sûre',
             indice: resultat.fosse ? 'fosse de plongée' : 'bassin artificiel' };
  }

  // 3. Plan d'eau ou cours d'eau cartographié → douce.
  const douce = plansEau.find(t => !t.water || EAUX_DOUCES.has(t.water)) || cours[0];
  if (douce) {
    return { ...resultat, eau: 'douce', certitude: 'sûre',
             indice: douce.name ? `dans ${douce.name}` : 'plan d’eau cartographié' };
  }

  // 4. Trait de côte à proximité et niveau de la mer → salée.
  if (cotes.length && (alt == null || alt <= 3)) {
    return { ...resultat, eau: 'salee', certitude: 'sûre', indice: 'bord de mer cartographié' };
  }

  // 5. Rien de cartographié : l'altitude tranche raisonnablement.
  if (alt != null) {
    if (alt > 5) {
      return { ...resultat, eau: 'douce', certitude: 'probable',
               indice: `${Math.round(alt)} m d’altitude — trop haut pour la mer` };
    }
    if (cotes.length) {
      return { ...resultat, eau: 'salee', certitude: 'probable', indice: 'proche du littoral' };
    }
    return { ...resultat, eau: 'salee', certitude: 'incertaine',
             indice: 'au niveau de la mer, rien de cartographié' };
  }

  return resultat;
}

/**
 * Analyse complète du point. Ne lève jamais : en cas de service
 * indisponible, renvoie ce qui a pu être obtenu.
 */
export async function analyserPoint(lat, lng, { forcer = false } = {}) {
  if (lat == null || lng == null) return null;

  const k = cle(lat, lng);
  const c = cache();
  if (!forcer && c[k] && Date.now() - c[k].at < TTL) return c[k].data;

  const [tags, alt] = await Promise.all([
    elementsAutour(lat, lng).catch(() => null),
    altitude(lat, lng).catch(() => null),
  ]);

  const data = conclure(tags, alt);
  data.horsLigne = tags === null && alt === null;

  c[k] = { at: Date.now(), data };
  ecrire(c);
  return data;
}

/** Seuil réglementaire français de la plongée en altitude. */
export const EN_ALTITUDE = 300;
