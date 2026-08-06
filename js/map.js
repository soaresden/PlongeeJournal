// ============================================================
//  Sélecteur de lieu
//
//  Principe : on cherche un lieu par son nom (« Lac de Beaumont-
//  sur-Oise »), l'app garde ce libellé tel quel, puis on clique
//  sur la carte pour poser le point EXACT dans l'eau. Le libellé
//  cherché et les coordonnées cliquées sont deux données
//  distinctes, conservées toutes les deux.
//
//  Deux moteurs :
//   - OpenStreetMap / Leaflet + Nominatim  (par défaut, gratuit)
//   - Google Maps + Places  (si CONFIG.googleMapsKey est renseignée)
//  L'interface est identique dans les deux cas.
// ============================================================

import { CONFIG } from './config.js';
import { el, debounce, toast } from './lib.js';
import { guessWater } from './store.js';

// ------------------------------------------------------------
//  Chargement paresseux de l'API Google Maps
// ------------------------------------------------------------
let googlePromise = null;
function loadGoogle() {
  if (!CONFIG.googleMapsKey) return Promise.reject(new Error('no-key'));
  if (googlePromise) return googlePromise;
  googlePromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://maps.googleapis.com/maps/api/js'
          + `?key=${encodeURIComponent(CONFIG.googleMapsKey)}`
          + '&libraries=places&language=fr&region=FR&loading=async&callback=__gmapsReady';
    window.__gmapsReady = () => resolve(window.google);
    s.onerror = () => reject(new Error('Google Maps injoignable'));
    document.head.append(s);
  });
  return googlePromise;
}

// ------------------------------------------------------------
//  Recherche de lieux
// ------------------------------------------------------------

/** Renvoie [{ label, detail, lat, lng }] */
async function searchPlaces(query) {
  if (CONFIG.googleMapsKey) {
    try { return await searchGoogle(query); }
    catch (e) { console.warn('Google Places indisponible, repli sur OSM', e); }
  }
  return searchNominatim(query);
}

/**
 * Découpe une saisie en recherches de plus en plus larges.
 *
 * « Fort du Centre - Cherbourg » n'existe dans aucune base de lieux : on
 * essaie donc successivement la chaîne entière, puis chaque segment séparé
 * par un tiret ou une virgule, puis les derniers mots. Le premier essai qui
 * donne quelque chose gagne — et le libellé tapé, lui, est conservé tel quel.
 */
export function pistesDeRecherche(saisie) {
  const texte = String(saisie || '').trim();
  if (!texte) return [];

  // Un tiret ne sépare que s'il est entouré d'espaces : « Beaumont-sur-Oise »
  // et « Port-Cros » sont des noms entiers, pas deux morceaux.
  const SEPARATEURS = /\s+[-–—|/]\s+|\s*[,;]\s*/g;

  const pistes = [texte];

  const segments = texte.split(SEPARATEURS).map(s => s.trim()).filter(s => s.length > 2);
  if (segments.length > 1) {
    // Du dernier segment vers le premier : la partie géographique est
    // presque toujours en fin de saisie.
    for (let i = segments.length - 1; i >= 0; i--) pistes.push(segments[i]);
    for (let i = 1; i < segments.length; i++) pistes.push(segments.slice(i).join(' '));
  }

  // En dernier recours, les derniers mots — séparateurs déjà retirés.
  const mots = texte.replace(SEPARATEURS, ' ').split(/\s+/).filter(Boolean);
  if (mots.length > 1) {
    pistes.push(mots.slice(-2).join(' '));
    pistes.push(mots[mots.length - 1]);
  }

  const vues = new Set();
  return pistes.filter(p => {
    const k = p.toLowerCase();
    if (p.length < 3 || vues.has(k)) return false;
    vues.add(k);
    return true;
  });
}

/**
 * Cherche en élargissant tant que rien ne sort.
 * @returns {{resultats:Array, piste:string, approx:boolean}}
 */
async function chercherEnElargissant(saisie) {
  const pistes = pistesDeRecherche(saisie);

  for (let i = 0; i < pistes.length; i++) {
    const resultats = await searchPlaces(pistes[i]);
    if (resultats.length) {
      return { resultats, piste: pistes[i], approx: i > 0 };
    }
  }
  return { resultats: [], piste: saisie, approx: false };
}

async function searchNominatim(query) {
  const url = 'https://nominatim.openstreetmap.org/search'
            + `?format=jsonv2&limit=6&accept-language=fr&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('Recherche indisponible');
  const json = await res.json();
  return json.map(r => ({
    label:  r.name || r.display_name.split(',')[0],
    detail: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
  }));
}

async function searchGoogle(query) {
  const g = await loadGoogle();
  const { AutocompleteSuggestion, AutocompleteSessionToken } = await g.maps.importLibrary('places');
  const token = new AutocompleteSessionToken();
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: query, sessionToken: token, language: 'fr',
  });
  const out = [];
  for (const s of suggestions.slice(0, 6)) {
    const pred = s.placePrediction;
    if (!pred) continue;
    out.push({
      label: pred.mainText?.text || pred.text?.text || query,
      detail: pred.text?.text || '',
      _place: pred.toPlace(),
      lat: null, lng: null,
    });
  }
  return out;
}

/** Complète lat/lng d'un résultat Google (les prédictions n'ont pas les coordonnées). */
async function resolveResult(r) {
  if (r.lat != null && r.lng != null) return r;
  if (r._place) {
    await r._place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress'] });
    const loc = r._place.location;
    r.lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
    r.lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
    r.detail = r._place.formattedAddress || r.detail;
  }
  return r;
}

// ------------------------------------------------------------
//  Composant
// ------------------------------------------------------------

/**
 * @param {object}   value     { lieuNom, lieuDetail, lat, lng }
 * @param {Function} onChange  reçoit le patch { lieuNom?, lieuDetail?, lat?, lng?, eau? }
 * @returns {HTMLElement}
 */
export function locationPicker(value, onChange) {
  const state = {
    lieuNom:    value.lieuNom || '',
    lieuDetail: value.lieuDetail || '',
    lat: value.lat ?? null,
    lng: value.lng ?? null,
  };

  const input = el('input', {
    type: 'search', placeholder: 'Lac de Beaumont-sur-Oise, Calanque de Sormiou…',
    value: state.lieuNom, autocomplete: 'off', enterkeyhint: 'search',
  });

  const results = el('div.geo-results', { hidden: true });
  const mapBox  = el('div.map-box');
  const coordsLine = el('div.hint');
  const searchWrap = el('div');

  const gpsBtn = el('button.btn.sm', { type: 'button', title: 'Utiliser ma position actuelle' }, '📍 Ma position');
  const clearBtn = el('button.btn.sm.ghost', { type: 'button' }, 'Effacer');

  let map = null, marker = null, engine = null;

  // ---- rendu des coordonnées ----
  function refreshCoords() {
    if (state.lat == null) {
      coordsLine.textContent = 'Cherche un lieu puis clique sur la carte pour poser le point exact de mise à l’eau.';
    } else {
      coordsLine.innerHTML =
        `Point enregistré : <b>${state.lat.toFixed(5)}, ${state.lng.toFixed(5)}</b>`
        + (state.lieuDetail ? `<br><span style="opacity:.7">${state.lieuDetail}</span>` : '');
    }
  }

  function emit(patch) {
    Object.assign(state, patch);
    refreshCoords();
    onChange(patch);
  }

  // ---- carte ----
  async function initMap() {
    const start = state.lat != null
      ? { lat: state.lat, lng: state.lng, zoom: 13 }   // recalculé plus bas
      : { ...CONFIG.defaultCenter, zoom: CONFIG.defaultZoom };

    if (CONFIG.googleMapsKey) {
      try { await initGoogleMap(start); engine = 'google'; return; }
      catch (e) { console.warn('Repli carte OSM', e); }
    }
    initLeafletMap(start);
    engine = 'leaflet';
  }

  function initLeafletMap(start) {
    if (typeof L === 'undefined') { mapBox.textContent = 'Carte indisponible (Leaflet non chargé).'; return; }
    map = L.map(mapBox, { zoomControl: true, attributionControl: true })
           .setView([start.lat, start.lng], start.zoom);

    const plan = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    });
    const sat = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: '© Esri',
    });
    plan.addTo(map);
    L.control.layers({ 'Plan': plan, 'Satellite': sat }, {}, { position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

    if (state.lat != null) setMarker(state.lat, state.lng);

    map.on('click', e => setMarker(e.latlng.lat, e.latlng.lng, true));
    setTimeout(() => map.invalidateSize(), 60);
  }

  async function initGoogleMap(start) {
    const g = await loadGoogle();
    const { Map } = await g.maps.importLibrary('maps');
    map = new Map(mapBox, {
      center: { lat: start.lat, lng: start.lng },
      zoom: start.zoom,
      mapTypeId: 'hybrid',
      mapTypeControl: true,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: 'greedy',
    });
    if (state.lat != null) setMarker(state.lat, state.lng);
    map.addListener('click', e => setMarker(e.latLng.lat(), e.latLng.lng(), true));
  }

  function setMarker(lat, lng, fromUser = false) {
    if (engine === 'google' && map) {
      if (marker) marker.setMap(null);
      marker = new google.maps.Marker({ position: { lat, lng }, map, draggable: true });
      marker.addListener('dragend', ev => emit({ lat: ev.latLng.lat(), lng: ev.latLng.lng() }));
    } else if (map) {
      if (marker) marker.remove();
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        emit({ lat: p.lat, lng: p.lng });
      });
    }
    emit({ lat, lng });
    if (fromUser) toast('Point de mise à l’eau enregistré');
  }

  function centerOn(lat, lng, zoom = 15) {
    if (!map) return;
    if (engine === 'google') { map.setCenter({ lat, lng }); map.setZoom(zoom); }
    else { map.setView([lat, lng], zoom); }
  }

  // ---- recherche ----
  const doSearch = debounce(async () => {
    const q = input.value.trim();
    emit({ lieuNom: q, eau: guessWater(q) || undefined });
    if (q.length < 3) { results.hidden = true; results.innerHTML = ''; return; }

    results.innerHTML = '';
    results.hidden = false;
    results.append(el('button', { type: 'button', disabled: true }, 'Recherche…'));

    try {
      const { resultats, piste, approx } = await chercherEnElargissant(q);
      results.innerHTML = '';

      if (!resultats.length) {
        results.append(el('button', { type: 'button', disabled: true },
          'Aucun lieu trouvé — déplace la carte et clique à l’endroit exact. '
        + 'Ton libellé est conservé.'));
        return;
      }

      // On dit franchement qu'on a élargi, et sur quoi.
      if (approx) {
        results.append(el('button', { type: 'button', disabled: true, style: { cursor: 'default' } },
          `Rien pour « ${q} »`,
          el('small', { text: `Résultats pour « ${piste} » — choisis-en un pour t’en approcher, `
                            + 'puis clique le point exact sur la carte.' })));
      }

      resultats.forEach(r => {
        results.append(el('button', {
          type: 'button',
          onclick: async () => {
            try {
              await resolveResult(r);

              // Le libellé tapé est TOUJOURS conservé : c'est lui qui a un sens
              // pour toi. Le lieu reconnu part dans le détail, avec les coordonnées.
              const saisi = input.value.trim() || r.label;
              emit({
                lieuNom: saisi,
                lieuDetail: r.detail || r.label,
                lat: r.lat, lng: r.lng,
                eau: guessWater(`${saisi} ${r.label} ${r.detail}`) || undefined,
              });

              // Zoom volontairement large : on doit reconnaître le secteur
              // avant d'affiner. Environ 2 km de large à 13.
              centerOn(r.lat, r.lng, approx ? 12 : 13);
              setMarker(r.lat, r.lng);
              results.hidden = true;
              toast(approx
                ? `Centré sur ${r.label} — place le point dans l’eau`
                : 'Affine le point en cliquant dans l’eau');
            } catch {
              toast('Impossible de récupérer ce lieu', true);
            }
          },
        }, r.label, r.detail && r.detail !== r.label ? el('small', { text: r.detail }) : null));
      });
    } catch {
      results.innerHTML = '';
      results.append(el('button', { type: 'button', disabled: true },
        'Recherche indisponible — pose le point à la main sur la carte.'));
    }
  }, 550);

  input.addEventListener('input', doSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });

  gpsBtn.onclick = () => {
    if (!navigator.geolocation) return toast('GPS non disponible sur cet appareil', true);
    gpsBtn.textContent = '📍 …';
    navigator.geolocation.getCurrentPosition(
      pos => {
        gpsBtn.textContent = '📍 Ma position';
        const { latitude: lat, longitude: lng } = pos.coords;
        centerOn(lat, lng, 14);
        setMarker(lat, lng);
      },
      err => {
        gpsBtn.textContent = '📍 Ma position';
        toast(err.code === 1 ? 'Accès à la position refusé' : 'Position introuvable', true);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  clearBtn.onclick = () => {
    input.value = '';
    results.hidden = true;
    if (marker) { engine === 'google' ? marker.setMap(null) : marker.remove(); marker = null; }
    emit({ lieuNom: '', lieuDetail: '', lat: null, lng: null });
  };

  searchWrap.append(
    el('label.lbl', { text: 'Lieu de plongée' }),
    input,
    results,
    el('div.inline', { style: { marginTop: '8px' } }, gpsBtn, clearBtn),
    el('div', { style: { marginTop: '10px' } }, mapBox),
    coordsLine,
  );

  refreshCoords();
  // La carte doit être initialisée une fois le noeud dans le DOM.
  requestAnimationFrame(() => initMap());

  return searchWrap;
}

/**
 * Le zoom qui donne EXACTEMENT la largeur voulue sur le terrain.
 *
 * Fixer « zoom : 13 » ne veut rien dire : à cette valeur, un écran de
 * téléphone couvre 1,5 km et un écran de PC 5 km, et la même carte est
 * deux fois plus large à Marseille qu'à Oslo — la résolution d'une tuile
 * dépend de la latitude. On part donc de ce qu'on veut voir, en km, et
 * on en déduit le zoom.
 *
 * Résolution Web Mercator : 156543,03 × cos(latitude) / 2^zoom mètres
 * par pixel.
 */
export function zoomPourLargeurKm(km, lat, largeurPx) {
  const metresVoulus = Math.max(0.05, km) * 1000;
  const largeur = Math.max(120, largeurPx || 320);
  const parPixel = metresVoulus / largeur;
  const brut = Math.log2(156543.03392 * Math.cos(lat * Math.PI / 180) / parPixel);
  // Bornes du fond de carte : au-delà, les tuiles n'existent pas.
  return Math.max(2, Math.min(18, Math.round(brut * 10) / 10));
}

const TUILES = {
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  // Noms de lieux et limites, à poser PAR-DESSUS l'image satellite : une
  // vue aérienne de plan d'eau est bleue et muette, on n'y reconnaît rien.
  etiquettes: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
  plan: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
};

/**
 * Carte de la fiche d'une plongée.
 *
 * `km` est la largeur de terrain visée. 3 km : on voit la côte, le port,
 * la route — de quoi reconnaître l'endroit. Plus serré, il ne reste
 * qu'une tache d'eau ; plus large, le point se perd.
 *
 * Une vignette de situation, en haut à droite, montre la région : c'est
 * elle qui répond vraiment à « c'est où, ça ? ».
 */
export function staticMap(lat, lng, options = {}) {
  // Ancienne signature (lat, lng, hauteur, zoom) : on la tolère.
  if (typeof options === 'number') options = { hauteur: options };

  const { hauteur = 240, km = 3, situation = true } = options;

  const box = el('div.map-box', { style: { height: hauteur + 'px' } });

  requestAnimationFrame(() => {
    if (typeof L === 'undefined') return;

    const zoom = zoomPourLargeurKm(km, lat, box.clientWidth);

    const m = L.map(box, {
      zoomControl: true, attributionControl: false,
      dragging: true, scrollWheelZoom: false, doubleClickZoom: true, touchZoom: true,
    }).setView([lat, lng], zoom);

    const satellite = L.layerGroup([
      L.tileLayer(TUILES.satellite, { maxZoom: 19 }),
      L.tileLayer(TUILES.etiquettes, { maxZoom: 19 }),
    ]);
    const plan = L.tileLayer(TUILES.plan, { maxZoom: 19 });
    satellite.addTo(m);

    L.control.layers({ 'Satellite': satellite, 'Plan': plan }, {},
      { position: 'topleft', collapsed: true }).addTo(m);
    L.marker([lat, lng]).addTo(m);
    // Barre d'échelle : sans elle, on ne sait pas ce qu'on regarde.
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m);

    // Revenir au cadrage d'origine après avoir zoomé : sans ça, on se
    // perd et il faut recharger la fiche.
    const recadrer = L.control({ position: 'bottomright' });
    recadrer.onAdd = () => {
      const b = L.DomUtil.create('button', 'map-recadrer');
      b.type = 'button';
      b.textContent = `⊙ ${km} km`;
      b.title = `Revenir à une vue de ${km} km`;
      L.DomEvent.disableClickPropagation(b);
      b.onclick = () => m.setView([lat, lng], zoomPourLargeurKm(km, lat, box.clientWidth));
      return b;
    };
    recadrer.addTo(m);

    if (situation) ajouterSituation(m, lat, lng);

    setTimeout(() => m.invalidateSize(), 60);
  });

  return box;
}

/**
 * Vignette de situation : la même position, mais à 400 km de large.
 * Non interactive — elle informe, elle ne se manipule pas.
 */
function ajouterSituation(carte, lat, lng) {
  const vignette = L.control({ position: 'topright' });

  vignette.onAdd = () => {
    const hote = L.DomUtil.create('div', 'map-situation');
    L.DomEvent.disableClickPropagation(hote);

    // La carte imbriquée doit être créée une fois le noeud dans le DOM.
    setTimeout(() => {
      if (!hote.isConnected) return;
      const mini = L.map(hote, {
        zoomControl: false, attributionControl: false, dragging: false,
        scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false,
        boxZoom: false, keyboard: false,
      }).setView([lat, lng], zoomPourLargeurKm(400, lat, 110));

      L.tileLayer(TUILES.plan, { maxZoom: 19 }).addTo(mini);
      L.circleMarker([lat, lng], {
        radius: 5, color: '#e04b3c', fillColor: '#e04b3c', fillOpacity: 1, weight: 2,
      }).addTo(mini);
      setTimeout(() => mini.invalidateSize(), 40);
    }, 0);

    return hote;
  };

  vignette.addTo(carte);
}
