// ============================================================
//  Le centre de plongée d'une plongée : un seul champ
//
//  On tape le nom ou l'adresse : les centres déjà notés au carnet
//  sont proposés, puis ce que trouve OpenStreetMap autour du lieu de
//  la plongée. Choisir remplit le nom ET l'adresse.
//
//  Ou bien la carte : on zoome sur l'endroit, on écrit « plongée »
//  ou « dive », les centres de plongée de la zone s'affichent, on
//  touche le bon.
// ============================================================

import { el, debounce, toast, openModal } from './lib.js';
import { CONFIG } from './config.js';
import { OVERPASS } from './geo.js';

const sansAccent = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** « plongée », « dive », « scuba »… : on cherche des centres de plongée. */
export const chercheCentres = q => !sansAccent(q)
  || /\b(plong\w*|dive|diving|diver|scuba|buceo|tauch\w*|immersion|subaqu\w*|club)\b/.test(sansAccent(q));

/** Les mots qui restent une fois « plongée », « club »… retirés. */
const motsUtiles = q => sansAccent(q).split(/[^a-z0-9]+/)
  .filter(m => m.length > 1 && !chercheCentres(m) && !['de', 'du', 'la', 'le', 'les', 'centre', 'center', 'centro'].includes(m));

/** Les centres déjà notés dans le carnet, avec leur dernière adresse. */
export function centresConnus(dives) {
  const m = new Map();
  dives.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(d => {
    const nom = (d.centreNom || '').trim();
    if (!nom) return;
    const avant = m.get(nom) || {};
    m.set(nom, {
      nom,
      adresse: (d.centreAdresse || '').trim() || avant.adresse || '',
      lat: d.centreLat ?? avant.lat ?? null,
      lng: d.centreLng ?? avant.lng ?? null,
      n: (avant.n || 0) + 1,
    });
  });
  return [...m.values()];
}

/** Adresse lisible à partir des étiquettes OSM (addr:*). */
export function adresseOsm(t = {}) {
  const rue = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  const ville = [t['addr:postcode'], t['addr:city'] || t['addr:place']].filter(Boolean).join(' ');
  return [rue, ville, t['addr:country']].filter(Boolean).join(', ');
}

/** Les centres de plongée d'OpenStreetMap dans un cadre [sud, ouest, nord, est]. */
export async function centresOsm([s, o, n, e], f = fetch) {
  const bb = `${s},${o},${n},${e}`;
  const requete = '[out:json][timeout:25];('
    + `nwr["shop"="scuba_diving"](${bb});`
    + `nwr["amenity"="dive_centre"](${bb});`
    + `nwr["sport"="scuba_diving"]["name"](${bb});`
    + `nwr["club"~"^(scuba_diving|diving|sport)$"]["sport"~"diving"](${bb});`
    + ');out center tags 80;';
  for (const point of OVERPASS) {
    try {
      const r = await f(point, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: requete }),
      });
      if (!r.ok) continue;
      const json = await r.json();
      const vus = new Set();
      return (json.elements || []).map(x => {
        const t = x.tags || {};
        const lat = x.lat ?? x.center?.lat, lng = x.lon ?? x.center?.lon;
        return { nom: t.name || t.operator || 'Centre de plongée', adresse: adresseOsm(t), lat, lng,
                 site: t.website || t['contact:website'] || '' };
      }).filter(c => c.lat != null && !vus.has(c.nom + c.lat.toFixed(3)) && vus.add(c.nom + c.lat.toFixed(3)));
    } catch { /* miroir suivant */ }
  }
  throw new Error('OpenStreetMap ne répond pas');
}

/** Recherche libre (Nominatim), de préférence dans un cadre. */
export async function chercherNominatim(q, { cadre = null, borne = false, f = fetch } = {}) {
  let url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8'
    + `&accept-language=fr&q=${encodeURIComponent(q)}`;
  if (cadre) {
    const [s, o, n, e] = cadre;
    url += `&viewbox=${o},${n},${e},${s}${borne ? '&bounded=1' : ''}`;
  }
  const r = await f(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Recherche indisponible');
  return (await r.json()).map(x => ({
    nom: x.name || x.display_name.split(',')[0],
    adresse: x.display_name,
    lat: parseFloat(x.lat), lng: parseFloat(x.lon),
  }));
}

/** L'adresse d'un point, quand OSM ne la donne pas sur le centre lui-même. */
async function adresseDuPoint(lat, lng, f = fetch) {
  try {
    const r = await f(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=fr&lat=${lat}&lon=${lng}`,
      { headers: { Accept: 'application/json' } });
    if (!r.ok) return '';
    return (await r.json()).display_name || '';
  } catch { return ''; }
}

/** Filtre des centres sur les mots tapés (en plus de « plongée »). */
export function filtrerCentres(centres, q) {
  const mots = motsUtiles(q);
  if (!mots.length) return centres;
  return centres.filter(c => mots.every(m => sansAccent(`${c.nom} ${c.adresse}`).includes(m)));
}

const cadreAutour = (lat, lng, km) => {
  const dLat = km / 111, dLng = km / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  return [lat - dLat, lng - dLng, lat + dLat, lng + dLng];
};

/**
 * Le champ unique.
 * @param {object} dive  centreNom, centreAdresse, centreLat, centreLng (modifiés en place)
 * @param {object[]} dives  le carnet (pour les centres déjà notés)
 * @param {Function} onChange
 */
export function champCentre(dive, dives, onChange = () => {}) {
  const connus = centresConnus(dives.filter(d => d.id !== dive.id));
  const champ = el('input', { type: 'search', placeholder: 'Nom ou adresse du centre… (ou « plongée »)',
    autocomplete: 'off', enterkeyhint: 'search' });
  champ.value = dive.centreNom || '';
  const adresse = el('div.hint.centre-adresse');
  const resultats = el('div.geo-results', { hidden: true });

  const majAdresse = () => {
    adresse.textContent = dive.centreAdresse ? `📍 ${dive.centreAdresse}` : '';
    adresse.hidden = !dive.centreAdresse;
  };
  majAdresse();

  async function choisir(c) {
    if (!c.adresse && c.lat != null) c.adresse = await adresseDuPoint(c.lat, c.lng);
    Object.assign(dive, { centreNom: c.nom, centreAdresse: c.adresse || '',
      centreLat: c.lat ?? null, centreLng: c.lng ?? null });
    champ.value = c.nom;
    resultats.hidden = true;
    majAdresse();
    onChange();
  }

  const bouton = c => el('button', { type: 'button', onclick: () => choisir(c) },
    c.n ? `★ ${c.nom}` : c.nom, c.adresse ? el('small', { text: c.adresse }) : null);

  let tour = 0;
  const chercher = debounce(async () => {
    const q = champ.value.trim();
    const moi = ++tour;
    const locaux = connus.filter(c => !q || sansAccent(`${c.nom} ${c.adresse}`).includes(sansAccent(q)))
      .sort((a, b) => b.n - a.n).slice(0, 5);
    resultats.replaceChildren(...locaux.map(bouton));
    resultats.hidden = !locaux.length;
    if (q.length < 3 || !navigator.onLine) return;

    resultats.append(el('button', { type: 'button', disabled: true, text: 'Recherche en ligne…' }));
    resultats.hidden = false;
    const ici = dive.lat != null ? { lat: dive.lat, lng: dive.lng } : null;
    let trouves = [];
    try {
      if (ici && chercheCentres(q)) {
        trouves = filtrerCentres(await centresOsm(cadreAutour(ici.lat, ici.lng, 25)), q);
      }
      if (trouves.length < 3) {
        trouves.push(...await chercherNominatim(q, { cadre: ici ? cadreAutour(ici.lat, ici.lng, 60) : null }));
      }
    } catch { /* hors ligne : les centres connus suffisent */ }
    if (moi !== tour) return;
    resultats.querySelector('button[disabled]')?.remove();
    const deja = new Set(locaux.map(c => sansAccent(c.nom)));
    trouves.filter(c => !deja.has(sansAccent(c.nom))).slice(0, 8).forEach(c => resultats.append(bouton(c)));
    if (!resultats.children.length) resultats.append(el('button', { type: 'button', disabled: true,
      text: 'Rien trouvé : le nom tapé est gardé tel quel. Essaie la carte.' }));
  }, 500);

  champ.addEventListener('input', () => {
    dive.centreNom = champ.value;
    if (!champ.value.trim()) Object.assign(dive, { centreAdresse: '', centreLat: null, centreLng: null });
    majAdresse();
    onChange();
    chercher();
  });
  champ.addEventListener('focus', () => { if (!champ.value.trim()) chercher(); });

  const carte = el('button.btn.sm.ghost', { type: 'button', text: '🗺 Sur la carte',
    onclick: () => carteDesCentres(dive, choisir) });

  return el('div.centre-champ', {},
    el('div.centre-ligne', {}, champ, carte), resultats, adresse);
}

/**
 * La carte : on zoome, on tape « plongée » (ou un nom), les centres de la
 * zone visible apparaissent ; on touche le bon.
 */
export function carteDesCentres(dive, surChoix) {
  openModal(close => {
    const boite = el('div.centre-carte');
    const q = el('input', { type: 'search', placeholder: 'plongée, dive, ou un nom…', value: 'plongée',
      enterkeyhint: 'search', autocomplete: 'off' });
    const go = el('button.btn.primary.sm', { type: 'button', text: 'Chercher ici' });
    const etat = el('div.hint', { text: 'Zoome sur l’endroit, puis « Chercher ici ».' });
    const liste = el('div.geo-results', { hidden: true });
    let map = null, couche = null;

    requestAnimationFrame(() => {
      if (typeof L === 'undefined') { boite.textContent = 'Carte indisponible.'; return; }
      const depart = dive.centreLat != null ? [dive.centreLat, dive.centreLng, 13]
        : dive.lat != null ? [dive.lat, dive.lng, 11] : [CONFIG.defaultCenter.lat, CONFIG.defaultCenter.lng, CONFIG.defaultZoom];
      map = L.map(boite).setView([depart[0], depart[1]], depart[2]);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      couche = L.layerGroup().addTo(map);
      setTimeout(() => map.invalidateSize(), 60);
      if (dive.lat != null) lancer();
    });

    async function lancer() {
      if (!map) return;
      const b = map.getBounds();
      const cadre = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
      const texte = q.value.trim();
      if (map.getZoom() < 8 && chercheCentres(texte)) { etat.textContent = 'Zoome un peu plus : la zone est trop grande.'; return; }
      etat.textContent = 'Recherche…';
      go.disabled = true;
      let trouves = [];
      try {
        if (chercheCentres(texte)) trouves = filtrerCentres(await centresOsm(cadre), texte);
        const libre = texte && (!chercheCentres(texte) || trouves.length < 3);
        if (libre) trouves.push(...await chercherNominatim(texte, { cadre, borne: true }));
      } catch (e) { etat.textContent = e.message; go.disabled = false; return; }
      go.disabled = false;
      couche.clearLayers();
      liste.replaceChildren();
      etat.textContent = trouves.length
        ? `${trouves.length} résultat${trouves.length > 1 ? 's' : ''} : touche le tien (sur la carte ou dans la liste).`
        : 'Rien dans cette zone. Déplace la carte ou change le mot.';
      trouves.forEach(c => {
        const prendre = () => { surChoix(c); close(); toast(`Centre : ${c.nom}`); };
        L.marker([c.lat, c.lng], { title: c.nom }).addTo(couche)
          .bindPopup(el('div', {}, el('b', { text: c.nom }), el('br'), c.adresse || '',
            el('div', { style: { marginTop: '6px' } }, el('button.btn.sm.primary', { type: 'button', text: 'C’est celui-là', onclick: prendre }))));
        liste.append(el('button', { type: 'button', onclick: prendre }, c.nom, c.adresse ? el('small', { text: c.adresse }) : null));
      });
      liste.hidden = !trouves.length;
    }

    go.onclick = lancer;
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); lancer(); } });

    return el('div', {},
      el('h3', { text: '🗺 Trouver le centre sur la carte' }),
      el('div.centre-ligne', {}, q, go),
      etat, boite, liste,
      el('div.btn-row', {}, el('button.btn.ghost', { type: 'button', text: 'Fermer', onclick: close })));
  });
}
