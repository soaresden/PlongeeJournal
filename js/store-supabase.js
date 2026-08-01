// ============================================================
//  Adaptateur Supabase
//
//  Même API que l'adaptateur local, donc aucun écran ne change.
//  Les lectures viennent d'un instantané chargé au démarrage ; les
//  écritures partent immédiatement vers Supabase, et sont mises en
//  file d'attente si le réseau manque (voir sync.js).
// ============================================================

import { getClient, getUser } from './supabase.js';
import { computeStats, sortDives, sortPeople, reconcileTimes } from './model.js';
import * as sync from './sync.js';
import { uid } from './lib.js';

const ACTIVE_KEY = 'plongee-journal:active-diver';

// suuntoKeys est un tableau (et non un Set) pour survivre au miroir JSON.
let mem = { divers: [], buddies: [], dives: [], certifs: [], suuntoKeys: [] };
let ownerId = null;
let loaded = false;

// ------------------------------------------------------------
//  Conversions base ⇄ application
// ------------------------------------------------------------

const nz  = v => (v === '' || v === undefined ? null : v);      // '' -> null
const ns  = v => (v ?? '');                                     // null -> ''
const nnum = v => (v === '' || v === null || v === undefined ? null : Number(v));

function diverToRow(d) {
  return {
    id: d.id, owner_id: ownerId,
    prenom: ns(d.prenom), nom: ns(d.nom), licence: ns(d.licence), niveau: ns(d.niveau),
    nationalite: ns(d.nationalite), groupe_sanguin: ns(d.groupeSanguin),
    rue: ns(d.rue), cp: ns(d.cp), ville: ns(d.ville), pays: ns(d.pays),
    urg_prenom: ns(d.urgPrenom), urg_nom: ns(d.urgNom), urg_tel: ns(d.urgTel), urg_lien: ns(d.urgLien),
    materiel: d.materiel || [], combi_type: ns(d.combiType), combi_mm: ns(d.combiMm),
  };
}

function rowToDiver(r) {
  return {
    id: r.id, prenom: ns(r.prenom), nom: ns(r.nom), licence: ns(r.licence), niveau: ns(r.niveau),
    nationalite: ns(r.nationalite), groupeSanguin: ns(r.groupe_sanguin),
    rue: ns(r.rue), cp: ns(r.cp), ville: ns(r.ville), pays: ns(r.pays),
    urgPrenom: ns(r.urg_prenom), urgNom: ns(r.urg_nom), urgTel: ns(r.urg_tel), urgLien: ns(r.urg_lien),
    materiel: r.materiel || [], combiType: ns(r.combi_type), combiMm: ns(r.combi_mm),
    createdAt: r.created_at,
  };
}

// ---- Certifications ----

function certifToRow(c) {
  return {
    id: c.id, owner_id: ownerId, diver_id: c.diverId,
    nom: ns(c.nom), numero: ns(c.numero), organisme: ns(c.organisme),
    date_obtention: nz(c.dateObtention),
  };
}

function rowToCertif(r) {
  return {
    id: r.id, diverId: r.diver_id,
    nom: ns(r.nom), numero: ns(r.numero), organisme: ns(r.organisme),
    dateObtention: ns(r.date_obtention), createdAt: r.created_at,
  };
}

function buddyToRow(b) {
  return {
    id: b.id, owner_id: ownerId,
    prenom: ns(b.prenom), nom: ns(b.nom), licence: ns(b.licence),
    club: ns(b.club), moniteur: !!b.moniteur, niveau: ns(b.niveau), note: ns(b.note),
  };
}

function rowToBuddy(r) {
  return {
    id: r.id, prenom: ns(r.prenom), nom: ns(r.nom), licence: ns(r.licence),
    club: ns(r.club), moniteur: !!r.moniteur, niveau: ns(r.niveau), note: ns(r.note),
    stamps: [], createdAt: r.created_at,
  };
}

function diveToRow(d) {
  return {
    id: d.id, owner_id: ownerId, diver_id: d.diverId,
    numero: nnum(d.numero), date: nz(d.date),
    lieu_nom: ns(d.lieuNom), lieu_detail: ns(d.lieuDetail),
    lat: nnum(d.lat), lng: nnum(d.lng), eau: nz(d.eau), site: ns(d.site),
    heure_immersion: nz(d.heureImmersion), heure_sortie: nz(d.heureSortie),
    duree_min: nnum(d.dureeMin),
    type: ns(d.type), options: d.options || [], objectifs: d.objectifs || [],
    objectif_autre: ns(d.objectifAutre),
    options_refusees: d.optionsRefusees || [], options_manuelles: d.optionsManuelles || [],
    palier3: nnum(d.palier3), palier6: nnum(d.palier6), palier9: nnum(d.palier9),
    palier_secu: !!d.palierSecu, palier_secu_min: nnum(d.palierSecuMin),
    prof_max: nnum(d.profMax), prof_moy: nnum(d.profMoy),
    niveau: ns(d.niveau), altitude: nnum(d.altitude), indice_eau: ns(d.indiceEau),
    lestage: ns(d.lestage),
    combi_type: ns(d.combiType), combi_mm: ns(d.combiMm), combinaison: ns(d.combinaison),
    gaz_type: ns(d.gazType) || 'air', gaz_o2: nnum(d.gazO2), gaz_he: nnum(d.gazHe),
    gaz_setpoint: nnum(d.gazSetpoint),
    bloc_type: ns(d.blocType), bloc_matiere: ns(d.blocMatiere),
    bloc_litres: nnum(d.blocLitres),
    materiel_ids: d.materielIds ?? null, tampons: d.tampons || {},
    pression_depart: nnum(d.pressionDepart), pression_fin: nnum(d.pressionFin),
    temp_air: nnum(d.tempAir), temp_surface: nnum(d.tempSurface), temp_fond: nnum(d.tempFond),
    visibilite: ns(d.visibilite), courant: ns(d.courant),
    palanquee_mode: ns(d.palanqueeMode), chef_buddy_id: nz(d.chefBuddyId),
    stamp_id: nz(d.stampId), stamp_path: nz(d.stampPath),
    fait: ns(d.fait), vu: ns(d.vu), observations: ns(d.observations),
    vu_faune: d.vuFaune || [], vu_flore: d.vuFlore || [], vu_epaves: d.vuEpaves || [],
    suunto_synced_at: nz(d.suuntoSyncedAt),
    profil: d.profil ?? null,
  };
}

function rowToDive(r, buddyIds, suuntoKeys) {
  return {
    id: r.id, diverId: r.diver_id, numero: r.numero, date: ns(r.date),
    lieuNom: ns(r.lieu_nom), lieuDetail: ns(r.lieu_detail),
    lat: r.lat, lng: r.lng, eau: ns(r.eau), site: ns(r.site),
    heureImmersion: (r.heure_immersion || '').slice(0, 5),
    heureSortie: (r.heure_sortie || '').slice(0, 5),
    dureeMin: r.duree_min,
    type: ns(r.type), options: r.options || [], objectifs: r.objectifs || [],
    objectifAutre: ns(r.objectif_autre),
    optionsRefusees: r.options_refusees || [], optionsManuelles: r.options_manuelles || [],
    palier3: r.palier3, palier6: r.palier6, palier9: r.palier9,
    palierSecu: !!r.palier_secu, palierSecuMin: r.palier_secu_min,
    profMax: r.prof_max === null ? null : Number(r.prof_max),
    profMoy: r.prof_moy === null ? null : Number(r.prof_moy),
    niveau: ns(r.niveau),
    altitude: r.altitude === null ? null : Number(r.altitude),
    indiceEau: ns(r.indice_eau),
    lestage: ns(r.lestage),
    combiType: ns(r.combi_type), combiMm: ns(r.combi_mm), combinaison: ns(r.combinaison),
    gazType: ns(r.gaz_type) || 'air', gazO2: r.gaz_o2, gazHe: r.gaz_he,
    gazSetpoint: r.gaz_setpoint === null ? null : Number(r.gaz_setpoint),
    blocType: ns(r.bloc_type), blocMatiere: ns(r.bloc_matiere),
    blocLitres: r.bloc_litres === null ? null : Number(r.bloc_litres),
    materielIds: r.materiel_ids ?? null, tampons: r.tampons || {},
    pressionDepart: r.pression_depart, pressionFin: r.pression_fin,
    tempAir: r.temp_air === null ? null : Number(r.temp_air),
    tempSurface: r.temp_surface === null ? null : Number(r.temp_surface),
    tempFond: r.temp_fond === null ? null : Number(r.temp_fond),
    visibilite: ns(r.visibilite), courant: ns(r.courant),
    palanqueeMode: ns(r.palanquee_mode), chefBuddyId: ns(r.chef_buddy_id),
    stampId: ns(r.stamp_id), stampPath: ns(r.stamp_path), stampImage: '',
    buddyIds: buddyIds || [],
    fait: ns(r.fait), vu: ns(r.vu), observations: ns(r.observations),
    vuFaune: r.vu_faune || [], vuFlore: r.vu_flore || [], vuEpaves: r.vu_epaves || [],
    suuntoKeys: suuntoKeys || [], suuntoSyncedAt: r.suunto_synced_at, profil: r.profil,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// ------------------------------------------------------------
//  Images de tampons
// ------------------------------------------------------------

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(head)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function uploadImage(dataUrl, path) {
  const sb = await getClient();
  const { error } = await sb.storage.from('stamps')
    .upload(path, dataUrlToBlob(dataUrl), { upsert: true, contentType: 'image/jpeg' });
  if (error) throw new Error(`Envoi du tampon impossible : ${error.message}`);
  return path;
}

/** Une URL signée par chemin (les tampons sont dans un bucket privé). */
async function signPaths(paths) {
  const list = [...new Set(paths.filter(Boolean))];
  if (!list.length) return {};
  const sb = await getClient();
  const { data, error } = await sb.storage.from('stamps').createSignedUrls(list, 3600);
  if (error) { console.warn('Signature des tampons impossible', error); return {}; }
  const out = {};
  data.forEach(d => { if (d.signedUrl && !d.error) out[d.path] = d.signedUrl; });
  return out;
}

// ------------------------------------------------------------
//  Chargement
// ------------------------------------------------------------

async function pull() {
  const sb = await getClient();

  const [divers, buddies, stamps, dives, links, suuntoLinks, certifs] = await Promise.all([
    sb.from('divers').select('*'),
    sb.from('buddies').select('*'),
    sb.from('buddy_stamps').select('*'),
    sb.from('dives').select('*'),
    sb.from('dive_buddies').select('*'),
    sb.from('dive_suunto').select('*'),
    sb.from('certifications').select('*'),
  ]);

  for (const r of [divers, buddies, stamps, dives, links, suuntoLinks, certifs]) {
    if (r.error) throw new Error(r.error.message);
  }

  const signed = await signPaths([
    ...stamps.data.map(s => s.storage_path),
    ...dives.data.map(d => d.stamp_path),
  ]);

  const buddyById = {};
  mem.buddies = buddies.data.map(r => { const b = rowToBuddy(r); buddyById[b.id] = b; return b; });
  stamps.data.forEach(s => {
    buddyById[s.buddy_id]?.stamps.push({
      id: s.id, label: ns(s.label), path: s.storage_path, dataUrl: signed[s.storage_path] || '',
    });
  });

  const linksByDive = {};
  links.data.forEach(l => (linksByDive[l.dive_id] ??= []).push(l.buddy_id));

  const suuntoByDive = {};
  suuntoLinks.data.forEach(l => (suuntoByDive[l.dive_id] ??= []).push(l.workout_key));
  mem.suuntoKeys = [...new Set(suuntoLinks.data.map(l => l.workout_key))];

  mem.divers = divers.data.map(rowToDiver);
  mem.certifs = certifs.data.map(rowToCertif);
  mem.dives  = dives.data.map(r => {
    const d = rowToDive(r, linksByDive[r.id], suuntoByDive[r.id]);
    if (d.stampPath) d.stampImage = signed[d.stampPath] || '';
    return d;
  });

  loaded = true;
  sync.saveMirror(mem);
  return mem;
}

// ------------------------------------------------------------
//  Exécution des écritures en attente
// ------------------------------------------------------------

async function runOp(op) {
  const sb = await getClient();
  const fail = (err, quoi) => { if (err) throw new Error(`${quoi} : ${err.message}`); };

  if (op.type === 'delete') {
    const { error } = await sb.from(op.table).delete().eq('id', op.id);
    fail(error, `Suppression dans ${op.table}`);
    return;
  }

  if (op.table === 'certifications') {
    const { error } = await sb.from('certifications').upsert(op.payload.row);
    fail(error, 'Enregistrement de la certification');
    return;
  }

  if (op.table === 'divers') {
    const { error } = await sb.from('divers').upsert(op.payload.row);
    fail(error, 'Enregistrement du plongeur');
    return;
  }

  if (op.table === 'buddies') {
    const { row, stamps = [], removed = [] } = op.payload;
    fail((await sb.from('buddies').upsert(row)).error, 'Enregistrement du compagnon');

    for (const sid of removed) {
      const { data } = await sb.from('buddy_stamps').select('storage_path').eq('id', sid).maybeSingle();
      await sb.from('buddy_stamps').delete().eq('id', sid);
      if (data?.storage_path) await sb.storage.from('stamps').remove([data.storage_path]);
    }

    for (const s of stamps) {
      if (!s.dataUrl?.startsWith('data:')) continue;          // déjà envoyé
      const path = `${ownerId}/${s.id}.jpg`;
      await uploadImage(s.dataUrl, path);
      fail((await sb.from('buddy_stamps').upsert({
        id: s.id, owner_id: ownerId, buddy_id: row.id, storage_path: path, label: ns(s.label),
      })).error, 'Enregistrement du tampon');
    }
    return;
  }

  if (op.table === 'dives') {
    const { row, buddyIds = [], stampImage, suunto = [] } = op.payload;

    if (stampImage?.startsWith('data:')) {
      row.stamp_path = await uploadImage(stampImage, `${ownerId}/dive-${row.id}.jpg`);
    }

    fail((await sb.from('dives').upsert(row)).error, 'Enregistrement de la plongée');

    fail((await sb.from('dive_buddies').delete().eq('dive_id', row.id)).error, 'Mise à jour de la palanquée');
    if (buddyIds.length) {
      fail((await sb.from('dive_buddies').insert(
        buddyIds.map(bid => ({ dive_id: row.id, buddy_id: bid, owner_id: ownerId })),
      )).error, 'Mise à jour de la palanquée');
    }

    // Enregistrements Suunto rattachés (une plongée peut en compter plusieurs).
    fail((await sb.from('dive_suunto').delete().eq('dive_id', row.id)).error, 'Liens Suunto');
    if (suunto.length) {
      fail((await sb.from('dive_suunto').upsert(
        suunto.map(s => ({
          workout_key: s.key, owner_id: ownerId, dive_id: row.id,
          start_time: s.startTime ?? null, duree_min: s.dureeMin ?? null,
          prof_max: s.profMax ?? null, resume: s.resume ?? null,
        })),
        { onConflict: 'owner_id,workout_key' },
      )).error, 'Liens Suunto');
    }
    return;
  }

  throw new Error(`Table inconnue : ${op.table}`);
}

/** Écrit tout de suite si possible, sinon met en file d'attente. */
async function push(op) {
  sync.enqueue(op);
  return sync.flushNow();
}

// ------------------------------------------------------------
//  API publique
// ------------------------------------------------------------

export const supabaseStore = {
  kind: 'supabase',

  async init() {
    const user = await getUser();
    if (!user) throw new Error('Non connecté');
    ownerId = user.id;

    sync.startAutoFlush(runOp);

    try {
      await pull();
      sync.setState(sync.status().pending ? 'pending' : 'ok');
    } catch (e) {
      // Hors ligne au démarrage : on repart du miroir pour rester utilisable.
      const mirror = sync.readMirror();
      if (mirror?.data) {
        mem = mirror.data; loaded = true;
        sync.setState('offline', 'Affichage de la dernière copie connue');
      } else {
        throw e;
      }
    }
    return { ready: true, ownerId };
  },

  async refresh() { await pull(); sync.setState(sync.status().pending ? 'pending' : 'ok'); },

  async listDivers() { return sortPeople(mem.divers); },
  async getDiver(id) { return mem.divers.find(d => d.id === id) || null; },

  async saveDiver(diver) {
    const i = mem.divers.findIndex(x => x.id === diver.id);
    if (i >= 0) mem.divers[i] = diver; else mem.divers.push(diver);
    sync.saveMirror(mem);
    if (!localStorage.getItem(ACTIVE_KEY)) localStorage.setItem(ACTIVE_KEY, diver.id);
    await push({ table: 'divers', id: diver.id, type: 'upsert', payload: { row: diverToRow(diver) } });
    return diver;
  },

  async deleteDiver(id) {
    mem.divers = mem.divers.filter(x => x.id !== id);
    mem.dives  = mem.dives.filter(x => x.diverId !== id);   // cascade côté base aussi
    sync.saveMirror(mem);
    if (localStorage.getItem(ACTIVE_KEY) === id) localStorage.removeItem(ACTIVE_KEY);
    await push({ table: 'divers', id, type: 'delete' });
  },

  async getActiveDiverId() {
    const saved = localStorage.getItem(ACTIVE_KEY);
    if (saved && mem.divers.some(d => d.id === saved)) return saved;
    return mem.divers[0]?.id || null;
  },

  async setActiveDiver(id) { localStorage.setItem(ACTIVE_KEY, id); },

  // ---- Certifications ----

  async listCertifications(diverId) {
    return (mem.certifs || [])
      .filter(c => c.diverId === diverId)
      .sort((a, b) => (b.dateObtention || '').localeCompare(a.dateObtention || ''));
  },

  async saveCertification(certif) {
    mem.certifs ||= [];
    const i = mem.certifs.findIndex(c => c.id === certif.id);
    if (i >= 0) mem.certifs[i] = certif; else mem.certifs.push(certif);
    sync.saveMirror(mem);
    await push({ table: 'certifications', id: certif.id, type: 'upsert',
                 payload: { row: certifToRow(certif) } });
    return certif;
  },

  async deleteCertification(id) {
    mem.certifs = (mem.certifs || []).filter(c => c.id !== id);
    sync.saveMirror(mem);
    await push({ table: 'certifications', id, type: 'delete' });
  },

  async listBuddies() { return sortPeople(mem.buddies); },
  async getBuddy(id) { return mem.buddies.find(b => b.id === id) || null; },

  async saveBuddy(buddy) {
    const before = mem.buddies.find(x => x.id === buddy.id);
    const removed = (before?.stamps || [])
      .filter(s => !(buddy.stamps || []).some(x => x.id === s.id)).map(s => s.id);

    const i = mem.buddies.findIndex(x => x.id === buddy.id);
    if (i >= 0) mem.buddies[i] = buddy; else mem.buddies.push(buddy);
    sync.saveMirror(mem);

    await push({
      table: 'buddies', id: buddy.id, type: 'upsert',
      payload: {
        row: buddyToRow(buddy),
        stamps: (buddy.stamps || []).map(s => ({ id: s.id, label: s.label, dataUrl: s.dataUrl })),
        removed,
      },
    });
    return buddy;
  },

  async deleteBuddy(id) {
    mem.buddies = mem.buddies.filter(x => x.id !== id);
    mem.dives.forEach(dv => {
      dv.buddyIds = (dv.buddyIds || []).filter(x => x !== id);
      if (dv.chefBuddyId === id) dv.chefBuddyId = '';
    });
    sync.saveMirror(mem);
    await push({ table: 'buddies', id, type: 'delete' });
  },

  async listDives(diverId) { return sortDives(mem.dives.filter(d => d.diverId === diverId)); },
  async getDive(id) { return mem.dives.find(d => d.id === id) || null; },

  async nextNumber(diverId) {
    const list = mem.dives.filter(d => d.diverId === diverId);
    const max = list.reduce((m, d) => Math.max(m, Number(d.numero) || 0), 0);
    return Math.max(max + 1, list.length + 1);
  },

  async saveDive(dive) {
    dive.updatedAt = new Date().toISOString();
    reconcileTimes(dive);          // durée ⇄ heure de sortie, toujours cohérentes
    const i = mem.dives.findIndex(x => x.id === dive.id);
    if (i >= 0) mem.dives[i] = dive; else mem.dives.push(dive);
    sync.saveMirror(mem);

    mem.suuntoKeys = [...new Set([...(mem.suuntoKeys || []), ...(dive.suuntoKeys || [])])];

    await push({
      table: 'dives', id: dive.id, type: 'upsert',
      payload: {
        row: diveToRow(dive),
        buddyIds: dive.buddyIds || [],
        stampImage: dive.stampImage,
        suunto: dive.suuntoImports || (dive.suuntoKeys || []).map(k => ({ key: k })),
      },
    });
    return dive;
  },

  async deleteDive(id) {
    mem.dives = mem.dives.filter(x => x.id !== id);
    sync.saveMirror(mem);
    await push({ table: 'dives', id, type: 'delete' });
  },

  /** Retrouve la plongée qui contient déjà cet enregistrement Suunto. */
  async findDiveBySuunto(workoutKey) {
    return mem.dives.find(d => (d.suuntoKeys || []).includes(workoutKey)) || null;
  },

  /** Clés Suunto déjà importées, pour griser la liste. */
  async importedSuuntoKeys() { return mem.suuntoKeys || []; },

  async stats(diverId) { return computeStats(mem.dives.filter(d => d.diverId === diverId)); },

  async exportAll() {
    return JSON.stringify({ ...mem, _export: new Date().toISOString(), _version: 2 }, null, 2);
  },

  /** Importe un export local vers Supabase (migration ou restauration). */
  async importAll(json) {
    const incoming = JSON.parse(json);
    if (!incoming || !Array.isArray(incoming.dives)) throw new Error('Fichier de sauvegarde invalide');

    for (const d of incoming.divers || []) {
      if (!mem.divers.some(x => x.id === d.id)) await this.saveDiver(d);
    }
    for (const b of incoming.buddies || []) {
      if (!mem.buddies.some(x => x.id === b.id)) await this.saveBuddy(b);
    }
    for (const dv of incoming.dives || []) {
      if (!mem.dives.some(x => x.id === dv.id)) await this.saveDive(dv);
    }
    await sync.flushNow();
  },

  async wipe() {
    const sb = await getClient();
    for (const t of ['dive_suunto', 'dive_buddies', 'dives', 'certifications',
                     'buddy_stamps', 'buddies', 'divers']) {
      await sb.from(t).delete().eq('owner_id', ownerId);
    }
    mem = { divers: [], buddies: [], dives: [], certifs: [], suuntoKeys: [] };
    sync.clearOutbox(); sync.saveMirror(mem);
  },

  async raw() { return structuredClone(mem); },

  get isLoaded() { return loaded; },
};

export { uid };
