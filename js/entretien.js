// ============================================================
//  Petits travaux de fond, à l'ouverture
//
//  - les numéros suivent les dates (une plongée ajoutée sur un autre
//    appareil, un ancien carnet) ;
//  - l'eau douce ou salée se déduit du point GPS des plongées qui
//    n'en ont pas encore (imports de la montre, anciennes fiches).
//
//  Rien ne bloque : sans réseau, on réessaiera à la prochaine ouverture.
// ============================================================

import { store, premierMoniteur } from './store.js';

const PAR_OUVERTURE = 25;      // les services OSM n'aiment pas être pressés
const PAUSE_MS = 1200;

const attendre = ms => new Promise(r => setTimeout(r, ms));

/** Les plongées dont l'eau reste à reconnaître d'après le GPS. */
export function eauxAReconnaitre(dives) {
  return dives.filter(d => d.lat != null && d.lng != null && !d.eauManuelle && !d.eauAuto
    && Math.abs(d.lat) > 0.01);   // « au large du Gabon » : un GPS sans signal
}

export async function entretenir({ analyser = null } = {}) {
  const diverId = await store.getActiveDiverId();
  if (!diverId) return { numeros: 0, eaux: 0, chefs: 0 };
  const numeros = await store.numeroterAuto(diverId).catch(() => 0);

  // Le moniteur avec qui j'étais : le premier de la palanquée.
  const buddies = await store.listBuddies();
  const chefs = [];
  for (const d of await store.listDives(diverId)) {
    const chef = premierMoniteur(d, buddies);
    if ((d.chefBuddyId || '') !== chef) { d.chefBuddyId = chef; chefs.push(d); }
  }
  if (chefs.length) await store.savePlongees(chefs).catch(() => {});

  let eaux = 0;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { numeros, eaux, chefs: chefs.length };
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
  return { numeros, eaux, chefs: chefs.length, partage };
}

/**
 * Le lien de partage montre une copie : si le carnet a changé depuis, on
 * la republie (une fois par ouverture, en silence).
 */
export async function majPartage() {
  const reglages = await store.getSettings();
  const p = reglages.partage;
  if (!p?.gistId) return false;
  const carnet = await store.raw();
  const derniere = ['dives', 'buddies', 'seances', 'certifs', 'divers']
    .flatMap(t => (carnet[t] || []).map(x => x.updatedAt || ''))
    .reduce((a, b) => (b > a ? b : a), '');
  if (!derniere || derniere <= p.majLe) return false;
  const { publierPartage } = await import('./partage.js');
  const moi = (carnet.divers || []).find(d => d.id === carnet.settings?.activeDiverId);
  const nouveau = await publierPartage(carnet, p, { auteur: moi?.prenom || '' });
  await store.saveSettings({ partage: { gistId: nouveau.gistId, cle: nouveau.cle, majLe: nouveau.majLe } });
  return true;
}
