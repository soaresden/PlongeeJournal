// ============================================================
//  Le nom du lieu, d'après le point GPS de la montre
//
//  1. Une de mes plongées à moins de 2 km porte déjà un nom : on le
//     reprend (même orthographe que d'habitude, sans réseau).
//  2. Sinon OpenStreetMap : le site de plongée cartographié tout près,
//     et la localité la plus proche (« Maafushi, Maldives »).
//  Le nom posé est marqué `lieuAuto` : la fiche dit d'où il vient, et
//  on le corrige d'un geste.
// ============================================================

const R = 6371;
export function distanceKm(a, b) {
  const rad = x => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Un point GPS valable (pas « au large du Gabon », signe d'un GPS sans signal). */
export const pointValable = d => d && d.lat != null && d.lng != null
  && Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lng)) && Math.abs(d.lat) > 0.01;

/** Les plongées dont le lieu reste à nommer. */
export const lieuxANommer = dives => dives.filter(d => pointValable(d)
  && !String(d.lieuNom || '').trim() && !String(d.site || '').trim() && !d.lieuEssaye);

/**
 * La plongée nommée la plus proche, à moins de `km`.
 * @returns {{dive, km}|null}
 */
export function voisineNommee(dive, dives, km = 2) {
  if (!pointValable(dive)) return null;
  let meilleure = null;
  for (const d of dives) {
    if (d.id === dive.id || !pointValable(d) || !String(d.lieuNom || '').trim()) continue;
    const k = distanceKm(dive, d);
    if (k <= km && (!meilleure || k < meilleure.km)) meilleure = { dive: d, km: k };
  }
  return meilleure;
}

/** Le même jour, au même endroit : la plongée du matin (pour le centre, la palanquée). */
export function memeSortie(dive, dives, km = 15) {
  if (!dive?.date) return null;
  const candidates = dives.filter(d => d.id !== dive.id && d.date === dive.date
    && (!pointValable(dive) || !pointValable(d) || distanceKm(dive, d) <= km));
  // La plus proche dans le temps, de préférence avant.
  const h = s => (/^\d\d:\d\d/.test(s || '') ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null);
  const moi = h(dive.heureImmersion);
  candidates.sort((a, b) => {
    const da = moi == null || h(a.heureImmersion) == null ? 0 : Math.abs(moi - h(a.heureImmersion));
    const db = moi == null || h(b.heureImmersion) == null ? 0 : Math.abs(moi - h(b.heureImmersion));
    return da - db;
  });
  return candidates[0] || null;
}

/** Sans réseau : ce que le carnet sait déjà de cet endroit. */
export function lieuDuCarnet(dive, dives) {
  const v = voisineNommee(dive, dives);
  if (!v) return null;
  const patch = { lieuNom: v.dive.lieuNom, lieuAuto: 'carnet' };
  if (v.dive.lieuDetail) patch.lieuDetail = v.dive.lieuDetail;
  if (v.dive.site && v.km <= 0.4) patch.site = v.dive.site;
  return patch;
}

// --- OpenStreetMap ---------------------------------------------

/** Les départements et régions d'outre-mer : on dit « Martinique », pas « France ». */
const OUTRE_MER = /martinique|guadeloupe|réunion|reunion|guyane|mayotte|polynésie|polynesie|nouvelle-calédonie|nouvelle-caledonie|saint-martin|saint-barthélemy|wallis/i;

/** « Saint-Pierre, Martinique », « Maafushi, Maldives », « Beaumont-sur-Oise, France ». */
export function libelleAdresse(a = {}) {
  const lieu = a.island || a.islet || a.village || a.town || a.city || a.hamlet || a.suburb
    || a.municipality || a.atoll || a.archipelago || a.county || a.state_district || a.state || '';
  const region = [a.state, a.region, a.territory].find(x => x && OUTRE_MER.test(x));
  const pays = region || a.country || '';
  return [lieu, pays].filter((x, i, t) => x && t.indexOf(x) === i).join(', ');
}

const ENTETES = { headers: { Accept: 'application/json' } };

async function nominatimInverse(lat, lng, zoom, f) {
  const r = await f(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=${zoom}`
    + `&accept-language=fr&lat=${lat}&lon=${lng}`, ENTETES);
  if (!r.ok) throw new Error('Nominatim indisponible');
  const j = await r.json();
  return j?.error ? null : j;
}

/**
 * Le plus proche dans OSM : site de plongée (moins de 1,5 km) et
 * localité (moins de 30 km), en une requête Overpass. En mer, loin de
 * tout, Nominatim ne répond rien : c'est la localité qui donne le nom.
 */
async function autourOverpass(lat, lng, f) {
  const q = `[out:json][timeout:20];(`
    + `node(around:1500,${lat},${lng})["sport"="scuba_diving"]["name"][!"shop"][!"amenity"][!"club"];`
    + `node(around:1500,${lat},${lng})["scuba_diving:divespot"]["name"];`
    + `node(around:30000,${lat},${lng})["place"~"^(island|islet|village|town|city|hamlet)$"]["name"];`
    + `);out tags center 60;`;
  const r = await f('https://overpass-api.de/api/interpreter', {
    method: 'POST', body: `data=${encodeURIComponent(q)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
  });
  if (!r.ok) throw new Error('Overpass indisponible');
  const els = (await r.json()).elements || [];
  const loin = e => distanceKm({ lat, lng }, { lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon });
  const nom = e => e.tags?.['name:fr'] || e.tags?.name;
  const plus = liste => liste.sort((a, b) => loin(a) - loin(b))[0] || null;
  const site = plus(els.filter(e => !e.tags?.place));
  const place = plus(els.filter(e => e.tags?.place));
  return {
    site: site ? nom(site) : '',
    place: place ? { nom: nom(place), lat: place.lat ?? place.center?.lat, lng: place.lon ?? place.center?.lon } : null,
  };
}

/**
 * Le nom du lieu d'après OSM. Ne lève pas : null si rien de concluant.
 * @returns {Promise<{lieuNom, lieuDetail?, site?}|null>}
 */
export async function lieuOsm(lat, lng, { f = fetch } = {}) {
  let adresse = null, autour = null;
  try { adresse = await nominatimInverse(lat, lng, 12, f); } catch { /* hors ligne */ }
  try { autour = await autourOverpass(lat, lng, f); } catch { /* service chargé */ }

  let lieuNom = adresse ? libelleAdresse(adresse.address) : '';
  let lieuDetail = adresse?.display_name || '';
  // En mer : la localité la plus proche, et son pays.
  if (!lieuNom && autour?.place) {
    let pays = '';
    try {
      const a = await nominatimInverse(autour.place.lat, autour.place.lng, 10, f);
      pays = a ? libelleAdresse({ country: a.address?.country, state: a.address?.state }) : '';
      lieuDetail = a?.display_name || '';
    } catch { /* tant pis pour le pays */ }
    lieuNom = [autour.place.nom, pays].filter(Boolean).join(', ');
  }
  if (!lieuNom) return null;
  const patch = { lieuNom, lieuAuto: 'osm' };
  if (lieuDetail) patch.lieuDetail = lieuDetail;
  if (autour?.site) patch.site = autour.site;
  return patch;
}

/**
 * Le nom à poser sur une plongée : le carnet d'abord, OSM ensuite.
 * @returns {Promise<object|null>} patch
 */
export async function lieuAuto(dive, dives, { reseau = true, f = fetch } = {}) {
  if (!pointValable(dive)) return null;
  const local = lieuDuCarnet(dive, dives);
  if (local || !reseau) return local;
  return lieuOsm(dive.lat, dive.lng, { f });
}
