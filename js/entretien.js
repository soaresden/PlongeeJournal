// ============================================================
//  Petits travaux de fond, à l'ouverture
//
//  - les numéros suivent les dates (une plongée ajoutée sur un autre
//    appareil, un ancien carnet) ;
//  - l'eau douce ou salée se déduit du point GPS des plongées qui
//    n'en ont pas encore (imports de la montre, anciennes fiches) ;
//  - le lieu d'une plongée importée sans nom se déduit de son point
//    (une plongée voisine du carnet, sinon OpenStreetMap) ;
//  - les paliers « estimés » d'une plongée dont la montre donne le
//    plafond sont corrigés : jamais de plafond, pas de décompression.
//
//  Rien ne bloque : sans réseau, on réessaiera à la prochaine ouverture.
// ============================================================

import { store, premierMoniteur } from './store.js';
import { paliersDuProfil } from './profil-analyse.js';
import { lieuxANommer, lieuDuCarnet, lieuOsm } from './lieu-auto.js';

const PAR_OUVERTURE = 25;      // les services OSM n'aiment pas être pressés
const LIEUX_PAR_OUVERTURE = 6;
const PAUSE_MS = 1200;

const attendre = ms => new Promise(r => setTimeout(r, ms));

/** Les plongées dont l'eau reste à reconnaître d'après le GPS. */
export function eauxAReconnaitre(dives) {
  return dives.filter(d => d.lat != null && d.lng != null && !d.eauManuelle && !d.eauAuto
    && Math.abs(d.lat) > 0.01);   // « au large du Gabon » : un GPS sans signal
}

/** Paliers estimés à corriger d'après le plafond de la montre. */
export function paliersACorriger(dives) {
  const out = [];
  for (const d of dives) {
    if (!d.paliersEstimes || !d.samples?.length) continue;
    const p = paliersDuProfil(d.samples);
    if (!p) continue;
    const copie = { ...d, ...p, paliersEstimes: false };
    // « Décompression » posée d'après les faux paliers s'en va, sauf si
    // elle avait été choisie à la main.
    if (!(d.optionsManuelles || []).includes('Décompression')) {
      copie.options = (d.options || []).filter(o => o !== 'Décompression');
    }
    out.push(copie);
  }
  return out;
}

export async function entretenir({ analyser = null, nommer = null } = {}) {
  const diverId = await store.getActiveDiverId();
  if (!diverId) return { numeros: 0, eaux: 0, chefs: 0, lieux: 0 };
  const numeros = await store.numeroterAuto(diverId).catch(() => 0);

  // Le moniteur avec qui j'étais : le premier de la palanquée.
  const buddies = await store.listBuddies();
  const chefs = [];
  for (const d of await store.listDives(diverId)) {
    const chef = premierMoniteur(d, buddies);
    if ((d.chefBuddyId || '') !== chef) { d.chefBuddyId = chef; chefs.push(d); }
  }
  if (chefs.length) await store.savePlongees(chefs).catch(() => {});

  // Jour ou nuit, pour les plongées sans type (d'après l'heure et le soleil).
  {
    const { typeSelonHeure } = await import('./soleil.js');
    const typees = [];
    for (const d of await store.listDives(diverId)) {
      if (d.type || d.typeAuto === false) continue;
      const t = typeSelonHeure(d);
      if (t) typees.push({ ...d, type: t.type, typeAuto: true });
    }
    if (typees.length) await store.savePlongees(typees).catch(() => {});
  }

  const paliers = paliersACorriger(await store.listDives(diverId));
  if (paliers.length) await store.savePlongees(paliers).catch(() => {});

  // Le lieu, d'après le carnet : sans réseau, tout de suite.
  let lieux = 0;
  {
    const toutes = await store.listDives(diverId);
    const nommees = [];
    for (const d of lieuxANommer(toutes)) {
      const patch = lieuDuCarnet(d, toutes);
      if (patch) { Object.assign(d, patch); nommees.push(d); }
    }
    if (nommees.length) { await store.savePlongees(nommees).catch(() => {}); lieux += nommees.length; }
  }

  let eaux = 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { numeros, eaux, chefs: chefs.length, lieux };

  // Le lieu, d'après OpenStreetMap : quelques-unes par ouverture.
  {
    const nom = nommer || lieuOsm;
    const restantes = lieuxANommer(await store.listDives(diverId)).slice(0, LIEUX_PAR_OUVERTURE);
    const nommees = [];
    for (const d0 of restantes) {
      let patch = null;
      try { patch = await nom(d0.lat, d0.lng); } catch { /* service indisponible */ }
      const d = await store.getDive(d0.id);
      if (!d || String(d.lieuNom || '').trim()) continue;
      // Rien trouvé : on ne redemandera pas à chaque ouverture.
      Object.assign(d, patch || { lieuEssaye: true });
      nommees.push(d);
      if (!nommer) await attendre(PAUSE_MS);
    }
    if (nommees.length) await store.savePlongees(nommees).catch(() => {});
    lieux += nommees.filter(d => d.lieuNom).length;
  }

  const a = analyser || (await import('./geo.js')).analyserPoint;
  const liste = eauxAReconnaitre(await store.listDives(diverId)).slice(0, PAR_OUVERTURE);
  const modifiees = [];
  for (const d0 of liste) {
    let info = null;
    try { info = await a(d0.lat, d0.lng); } catch { /* service indisponible */ }
    if (info?.horsLigne) break;
    const d = await store.getDive(d0.id);
    if (!d || d.eauManuelle) continue;
    if (info?.eau) {
      Object.assign(d, { eau: info.eau, eauAuto: true });
      if (info.altitude != null) d.altitude = info.altitude;
      d.indiceEau = [`${info.eau === 'douce' ? 'Eau douce' : 'Eau salée'} — ${info.indice}`,
        info.certitude !== 'sûre' ? `(${info.certitude}, vérifie)` : null].filter(Boolean).join(' ');
      modifiees.push(d);
    } else if (info) {
      d.eauAuto = true;          // rien de concluant : on ne redemandera pas
      modifiees.push(d);
    }
    if (!analyser) await attendre(PAUSE_MS);
  }
  if (modifiees.length) await store.savePlongees(modifiees);
  eaux = modifiees.filter(d => d.eau).length;
  const partage = await majPartage().catch(() => false);
  return { numeros, eaux, chefs: chefs.length, lieux, partage };
}

/**
 * Le lien de partage montre une copie : si le carnet a changé depuis, on
 * la republie (une fois par ouverture, en silence).
 */
export async function majPartage() {
  const reglages = await store.getSettings();
  const p = reglages.partage;
  if (!p?.siteId) return false;           // (un ancien partage en gist se met à jour à la main)
  const carnet = await store.raw();
  const derniere = ['dives', 'buddies', 'seances', 'certifs', 'divers']
    .flatMap(t => (carnet[t] || []).map(x => x.updatedAt || ''))
    .reduce((a, b) => (b > a ? b : a), '');
  if (!derniere || derniere <= p.majLe) return false;
  const { publierPartage } = await import('./partage.js');
  const moi = (carnet.divers || []).find(d => d.id === carnet.settings?.activeDiverId);
  const nouveau = await publierPartage(carnet, p, { auteur: moi?.prenom || '' });
  await store.saveSettings({ partage: { siteId: nouveau.siteId, majLe: nouveau.majLe } });
  return true;
}
