// ============================================================
//  Adaptateur « local » — tout reste dans le navigateur.
//  Sert de mode hors-ligne / bac à sable quand Supabase n'est
//  pas configuré.
// ============================================================

import { computeStats, sortDives, sortPeople, reconcileTimes } from './model.js';

const KEY = 'plongee-journal:v1';
const EMPTY = { divers: [], buddies: [], dives: [], certifs: [], settings: { activeDiverId: null } };

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    const data = JSON.parse(raw);
    return { ...structuredClone(EMPTY), ...data,
             settings: { ...EMPTY.settings, ...(data.settings || {}) } };
  } catch (e) {
    console.error('Données locales illisibles', e);
    return structuredClone(EMPTY);
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      throw new Error('Mémoire du navigateur pleine — allège les tampons (photos) ou exporte tes données.');
    }
    throw e;
  }
}

let cache = null;
const db = () => (cache ??= read());
const save = () => write(cache);

export const localStore = {
  kind: 'local',

  async init() { db(); return { ready: true }; },

  async listDivers() { return sortPeople(db().divers); },
  async getDiver(id) { return db().divers.find(d => d.id === id) || null; },

  async saveDiver(diver) {
    const d = db();
    const i = d.divers.findIndex(x => x.id === diver.id);
    if (i >= 0) d.divers[i] = diver; else d.divers.push(diver);
    if (!d.settings.activeDiverId) d.settings.activeDiverId = diver.id;
    save();
    return diver;
  },

  async deleteDiver(id) {
    const d = db();
    d.divers = d.divers.filter(x => x.id !== id);
    d.dives  = d.dives.filter(x => x.diverId !== id);
    d.certifs = (d.certifs || []).filter(x => x.diverId !== id);
    if (d.settings.activeDiverId === id) d.settings.activeDiverId = d.divers[0]?.id || null;
    save();
  },

  async getActiveDiverId() {
    const d = db();
    if (d.settings.activeDiverId && d.divers.some(x => x.id === d.settings.activeDiverId)) {
      return d.settings.activeDiverId;
    }
    return d.divers[0]?.id || null;
  },

  async setActiveDiver(id) { db().settings.activeDiverId = id; save(); },

  // ---- Certifications ----

  async listCertifications(diverId) {
    return (db().certifs || [])
      .filter(c => c.diverId === diverId)
      .sort((a, b) => (b.dateObtention || '').localeCompare(a.dateObtention || ''));
  },

  async saveCertification(certif) {
    const d = db(); d.certifs ||= [];
    const i = d.certifs.findIndex(c => c.id === certif.id);
    if (i >= 0) d.certifs[i] = certif; else d.certifs.push(certif);
    save();
    return certif;
  },

  async deleteCertification(id) {
    const d = db();
    d.certifs = (d.certifs || []).filter(c => c.id !== id);
    save();
  },

  async listBuddies() { return sortPeople(db().buddies); },
  async getBuddy(id) { return db().buddies.find(b => b.id === id) || null; },

  async saveBuddy(buddy) {
    const d = db();
    const i = d.buddies.findIndex(x => x.id === buddy.id);
    if (i >= 0) d.buddies[i] = buddy; else d.buddies.push(buddy);
    save();
    return buddy;
  },

  async deleteBuddy(id) {
    const d = db();
    d.buddies = d.buddies.filter(x => x.id !== id);
    d.dives.forEach(dv => {
      dv.buddyIds = (dv.buddyIds || []).filter(x => x !== id);
      if (dv.chefBuddyId === id) dv.chefBuddyId = '';
    });
    save();
  },

  async listDives(diverId) { return sortDives(db().dives.filter(d => d.diverId === diverId)); },
  async getDive(id) { return db().dives.find(d => d.id === id) || null; },

  async nextNumber(diverId) {
    const list = db().dives.filter(d => d.diverId === diverId);
    const max = list.reduce((m, d) => Math.max(m, Number(d.numero) || 0), 0);
    return Math.max(max + 1, list.length + 1);
  },

  async saveDive(dive) {
    const d = db();
    dive.updatedAt = new Date().toISOString();
    reconcileTimes(dive);          // durée ⇄ heure de sortie, toujours cohérentes
    const i = d.dives.findIndex(x => x.id === dive.id);
    if (i >= 0) d.dives[i] = dive; else d.dives.push(dive);
    save();
    return dive;
  },

  async deleteDive(id) {
    const d = db();
    d.dives = d.dives.filter(x => x.id !== id);
    save();
  },

  async findDiveBySuunto(workoutKey) {
    return db().dives.find(d => (d.suuntoKeys || []).includes(workoutKey)) || null;
  },

  async importedSuuntoKeys() {
    return [...new Set(db().dives.flatMap(d => d.suuntoKeys || []))];
  },

  async stats(diverId) {
    return computeStats(
      db().dives.filter(d => d.diverId === diverId),
      (db().certifs || []).filter(c => c.diverId === diverId));
  },

  async exportAll() {
    return JSON.stringify({ ...db(), _export: new Date().toISOString(), _version: 1 }, null, 2);
  },

  async importAll(json, { merge = false } = {}) {
    const incoming = JSON.parse(json);
    if (!incoming || !Array.isArray(incoming.dives)) throw new Error('Fichier de sauvegarde invalide');
    if (!merge) {
      cache = { ...structuredClone(EMPTY), ...incoming,
                settings: { ...EMPTY.settings, ...(incoming.settings || {}) } };
    } else {
      const d = db();
      const mergeList = (dest, src) => {
        const ids = new Set(dest.map(x => x.id));
        src.forEach(x => { if (!ids.has(x.id)) dest.push(x); });
      };
      mergeList(d.divers,  incoming.divers  || []);
      mergeList(d.buddies, incoming.buddies || []);
      mergeList(d.dives,   incoming.dives   || []);
    }
    save();
  },

  async wipe() { cache = structuredClone(EMPTY); save(); },

  /** Contenu brut, utilisé pour la migration vers Supabase. */
  async raw() { return structuredClone(db()); },
};
