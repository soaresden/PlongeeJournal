// ============================================================
//  Le carnet, indépendamment de l'endroit où il est rangé
//
//  Toutes les règles — numérotation, cohérence des horaires,
//  cascades de suppression — vivent ici, une seule fois. Un
//  adaptateur n'a plus qu'à savoir CHARGER et ENREGISTRER un
//  objet JSON ; il n'a aucune règle métier à connaître.
// ============================================================

import { TABLES as TABLES_ENTITES } from './fusion.js';
import { computeStats, sortDives, sortPeople, reconcileTimes, sortSeances, seanceDepuisPlongee, estBapteme } from './model.js';

export const CARNET_VIDE = {
  version: 1,
  divers: [], buddies: [], dives: [], certifs: [], seances: [],
  settings: { activeDiverId: null },
  _supprimes: {},          // id → date de suppression (voir fusion.js)
};

const maintenant = () => new Date().toISOString();

/** Note une suppression, pour qu'une autre copie du carnet ne la ressuscite pas. */
function enterrer(d, ...ids) {
  d._supprimes ||= {};
  const t = maintenant();
  ids.flat().filter(Boolean).forEach(id => { d._supprimes[id] = t; });
}

/** Complète un objet chargé pour qu'il ait toujours la bonne forme. */
export function normaliser(data) {
  const base = structuredClone(CARNET_VIDE);
  if (!data || typeof data !== 'object') return base;
  return {
    ...base, ...data,
    divers:   Array.isArray(data.divers)   ? data.divers   : [],
    buddies:  Array.isArray(data.buddies)  ? data.buddies  : [],
    dives:    Array.isArray(data.dives)    ? data.dives    : [],
    // Le champ s'est appelé « certifications » au début :
    // on accepte les deux pour ne casser aucun fichier existant.
    certifs:  Array.isArray(data.certifs) ? data.certifs
            : Array.isArray(data.certifications) ? data.certifications : [],
    seances:  Array.isArray(data.seances)  ? data.seances  : [],
    settings: { ...base.settings, ...(data.settings || {}) },
    _supprimes: (data._supprimes && typeof data._supprimes === 'object') ? data._supprimes : {},
  };
}

/**
 * Fabrique un adaptateur complet à partir d'un support de stockage.
 *
 * @param {object} support
 *   - kind        : nom court du mode, affiché dans l'interface
 *   - charger()   : renvoie l'objet carnet (ou null)
 *   - enregistrer(data, contexte) : le persiste
 *   - prepare?()  : appelé une fois avant le premier chargement
 */
export function creerStore(support) {
  let cache = null;
  const db = () => cache;

  /** `quoi` décrit ce qui vient de changer : l'adaptateur peut s'en servir. */
  const save = (quoi = {}) => support.enregistrer(cache, quoi);

  return {
    get kind() { return support.kind; },
    get support() { return support; },

    async init() {
      if (support.prepare) await support.prepare();
      cache = normaliser(await support.charger());
      return { ready: true };
    },

    /** Remplace tout le contenu en mémoire (rechargement, import). */
    async remplacer(data) { cache = normaliser(data); },

    // ---- Plongeurs ----

    async listDivers() { return sortPeople(db().divers); },
    async getDiver(id) { return db().divers.find(d => d.id === id) || null; },

    async saveDiver(diver) {
      const d = db();
      diver.updatedAt = maintenant();
      const i = d.divers.findIndex(x => x.id === diver.id);
      if (i >= 0) d.divers[i] = diver; else d.divers.push(diver);
      if (!d.settings.activeDiverId) d.settings.activeDiverId = diver.id;
      await save({ table: 'divers', id: diver.id });
      return diver;
    },

    async deleteDiver(id) {
      const d = db();
      enterrer(d, id,
        d.dives.filter(x => x.diverId === id).map(x => x.id),
        (d.certifs || []).filter(x => x.diverId === id).map(x => x.id),
        (d.seances || []).filter(x => x.diverId === id).map(x => x.id));
      d.divers = d.divers.filter(x => x.id !== id);
      d.dives  = d.dives.filter(x => x.diverId !== id);
      d.certifs = (d.certifs || []).filter(x => x.diverId !== id);
      d.seances = (d.seances || []).filter(x => x.diverId !== id);
      if (d.settings.activeDiverId === id) d.settings.activeDiverId = d.divers[0]?.id || null;
      await save({ table: 'divers', id, supprime: true });
    },

    async getActiveDiverId() {
      const d = db();
      if (d.settings.activeDiverId && d.divers.some(x => x.id === d.settings.activeDiverId)) {
        return d.settings.activeDiverId;
      }
      return d.divers[0]?.id || null;
    },

    async setActiveDiver(id) {
      db().settings.activeDiverId = id;
      await save({ table: 'settings' });
    },

    // ---- Certifications ----

    async listCertifications(diverId) {
      return (db().certifs || [])
        .filter(c => c.diverId === diverId)
        .sort((a, b) => (b.dateObtention || '').localeCompare(a.dateObtention || ''));
    },

    async saveCertification(certif) {
      const d = db(); d.certifs ||= [];
      certif.updatedAt = maintenant();
      const i = d.certifs.findIndex(c => c.id === certif.id);
      if (i >= 0) d.certifs[i] = certif; else d.certifs.push(certif);
      await save({ table: 'certifs', id: certif.id });
      return certif;
    },

    async deleteCertification(id) {
      const d = db();
      enterrer(d, id);
      d.certifs = (d.certifs || []).filter(c => c.id !== id);
      await save({ table: 'certifs', id, supprime: true });
    },

    // ---- Compagnons ----

    async listBuddies() { return sortPeople(db().buddies); },
    async getBuddy(id) { return db().buddies.find(b => b.id === id) || null; },

    async saveBuddy(buddy) {
      const d = db();
      buddy.updatedAt = maintenant();
      const i = d.buddies.findIndex(x => x.id === buddy.id);
      if (i >= 0) d.buddies[i] = buddy; else d.buddies.push(buddy);
      await save({ table: 'buddies', id: buddy.id });
      return buddy;
    },

    async deleteBuddy(id) {
      const d = db();
      enterrer(d, id);
      d.buddies = d.buddies.filter(x => x.id !== id);
      // Un compagnon supprimé ne doit pas laisser de référence fantôme
      // dans les plongées passées.
      d.dives.forEach(dv => {
        dv.buddyIds = (dv.buddyIds || []).filter(x => x !== id);
        if (dv.chefBuddyId === id) dv.chefBuddyId = '';
      });
      (d.seances || []).forEach(s => { s.buddyIds = (s.buddyIds || []).filter(x => x !== id); });
      await save({ table: 'buddies', id, supprime: true });
    },

    // ---- Plongées ----

    async listDives(diverId) { return sortDives(db().dives.filter(d => d.diverId === diverId)); },
    async getDive(id) { return db().dives.find(d => d.id === id) || null; },

    async nextNumber(diverId) {
      const list = db().dives.filter(d => d.diverId === diverId && !estBapteme(d));
      const max = list.reduce((m, d) => Math.max(m, Number(d.numero) || 0), 0);
      return Math.max(max + 1, list.length + 1);
    },

    async saveDive(dive) {
      const d = db();
      dive.updatedAt = maintenant();
      reconcileTimes(dive);          // durée ⇄ heure de sortie, toujours cohérentes
      const i = d.dives.findIndex(x => x.id === dive.id);
      if (i >= 0) d.dives[i] = dive; else d.dives.push(dive);
      await save({ table: 'dives', id: dive.id, plongee: dive });
      return dive;
    },

    async deleteDive(id) {
      const d = db();
      enterrer(d, id);
      d.dives = d.dives.filter(x => x.id !== id);
      await save({ table: 'dives', id, supprime: true });
    },

    /** Applique des numéros (Map id → numéro), en une seule écriture. */
    async renumeroter(diverId, numeros) {
      const t = maintenant();
      let n = 0;
      for (const dv of db().dives) {
        if (dv.diverId !== diverId || !numeros.has(dv.id)) continue;
        dv.numero = numeros.get(dv.id);
        dv.updatedAt = t;
        n++;
      }
      if (n) await save({ table: 'dives' });
      return n;
    },

    async findDiveBySuunto(workoutKey) {
      return db().dives.find(d => (d.suuntoKeys || []).includes(workoutKey)) || null;
    },

    async importedSuuntoKeys() {
      return [...new Set(db().dives.flatMap(d => d.suuntoKeys || []))];
    },

    // ---- Séances (fosse, piscine, apnée) ----

    async listSeances(diverId) { return sortSeances((db().seances || []).filter(s => s.diverId === diverId)); },
    async getSeance(id) { return (db().seances || []).find(s => s.id === id) || null; },

    async saveSeance(seance) {
      const d = db(); d.seances ||= [];
      seance.updatedAt = maintenant();
      const i = d.seances.findIndex(s => s.id === seance.id);
      if (i >= 0) d.seances[i] = seance; else d.seances.push(seance);
      await save({ table: 'seances', id: seance.id });
      return seance;
    },

    async deleteSeance(id) {
      const d = db();
      enterrer(d, id);
      d.seances = (d.seances || []).filter(s => s.id !== id);
      await save({ table: 'seances', id, supprime: true });
    },

    /** Une plongée qui était une séance : elle quitte le carnet, en une seule écriture. */
    async plongeeEnSeance(diveId, type) {
      const d = db(); d.seances ||= [];
      const dive = d.dives.find(x => x.id === diveId);
      if (!dive) throw new Error('Plongée introuvable');
      const seance = seanceDepuisPlongee(dive, type);
      seance.updatedAt = maintenant();
      d.seances.push(seance);
      enterrer(d, diveId);
      d.dives = d.dives.filter(x => x.id !== diveId);
      await save({ table: 'seances', id: seance.id });
      return seance;
    },

    async stats(diverId) {
      return computeStats(
        db().dives.filter(d => d.diverId === diverId),
        (db().certifs || []).filter(c => c.diverId === diverId));
    },

    // ---- Sauvegarde et restauration ----

    async exportAll() {
      return JSON.stringify({ ...db(), _export: new Date().toISOString(), _version: 1 }, null, 2);
    },

    async importAll(json, { merge = false } = {}) {
      const entrant = typeof json === 'string' ? JSON.parse(json) : json;
      if (!entrant || !Array.isArray(entrant.dives)) {
        throw new Error('Fichier de sauvegarde invalide');
      }

      if (!merge) {
        cache = normaliser(entrant);
      } else {
        const d = db();
        // À identifiant égal, la version la plus récemment modifiée gagne :
        // même règle que la synchro GitHub (voir fusion.js).
        const fondre = (dest, src) => {
          const place = new Map(dest.map((x, i) => [x.id, i]));
          (src || []).forEach(x => {
            if (!x?.id) return;
            const i = place.get(x.id);
            if (i === undefined) { dest.push(x); place.set(x.id, dest.length - 1); }
            else if (String(x.updatedAt || '') >= String(dest[i].updatedAt || '')) dest[i] = x;
          });
        };
        fondre(d.divers,  entrant.divers);
        fondre(d.buddies, entrant.buddies);
        fondre(d.dives,   entrant.dives);
        fondre(d.certifs, entrant.certifs || entrant.certifications);
        d.seances ||= [];
        fondre(d.seances, entrant.seances);
      }
      await save({ table: 'tout' });
    },

    async wipe() {
      const ancien = db();
      cache = structuredClone(CARNET_VIDE);
      // Effacer tout doit aussi valoir pour les autres appareils.
      if (ancien) enterrer(cache, ...TABLES_ENTITES.map(t => (ancien[t] || []).map(x => x.id)));
      await save({ table: 'tout' });
    },

    /** Contenu brut, pour l'export et les migrations. */
    async raw() { return structuredClone(db()); },
  };
}
