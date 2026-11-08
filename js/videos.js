// ============================================================
//  Les vidéos de plongée, rangées dans pCloud
//
//  Un lien public pCloud vers le dossier des vidéos ; dedans, un
//  dossier par jour (« 2026-08-30 Cap Vert », « 30.08.2026 »…). Chaque
//  plongée retrouve le dossier de sa date ; on peut aussi en lier un à
//  la main. Les aperçus et la lecture passent par l'API publique de
//  pCloud : rien n'est copié dans le carnet.
// ============================================================

const CLE_CACHE = 'plongee-journal:videos-cache';
const DUREE_CACHE = 30 * 60 * 1000;

/**
 * Le code et le serveur d'un lien public pCloud.
 * e.pcloud.link → serveurs européens (eapi), u.pcloud.link → américains (api).
 * @returns {{lien, code, api}|null}
 */
export function lirePublink(texte) {
  const t = String(texte || '').trim();
  if (!t) return null;
  let code = null, hote = '';
  try {
    const u = new URL(t);
    code = u.searchParams.get('code');
    hote = u.hostname;
  } catch {
    if (/^[A-Za-z0-9]{20,}$/.test(t)) code = t;
  }
  if (!code) return null;
  const api = /^u\.|\.pcloud\.com$/.test(hote) && !/^e\./.test(hote) ? 'api.pcloud.com' : 'eapi.pcloud.com';
  return { lien: t.startsWith('http') ? t : `https://e.pcloud.link/publink/show?code=${code}`, code, api };
}

const autreApi = api => (api === 'eapi.pcloud.com' ? 'api.pcloud.com' : 'eapi.pcloud.com');

// --- dates dans les noms ------------------------------------------

const pad = n => String(n).padStart(2, '0');
const valide = (a, m, j) => a >= 1990 && a <= 2100 && m >= 1 && m <= 12 && j >= 1 && j <= 31;

/**
 * La date contenue dans un nom de dossier (ou de fichier) : 2026-08-30,
 * 2026_08_30, 20260830, 30-08-2026, 30.08.2026, 30/08/26… Une année
 * donnée par un dossier parent complète « 08-30 » ou « 30-08 ».
 * @returns {string|null} AAAA-MM-JJ
 */
export function dateDuNom(nom, anneeParent = null) {
  const s = String(nom || '');
  let m = /(?:^|\D)((?:19|20)\d\d)[-_. ]?(0[1-9]|1[0-2])[-_. ]?(0[1-9]|[12]\d|3[01])(?!\d)/.exec(s);
  if (m && valide(+m[1], +m[2], +m[3])) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /(?:^|\D)(0?[1-9]|[12]\d|3[01])[-_./ ](0?[1-9]|1[0-2])[-_./ ]((?:19|20)?\d\d)(?!\d)/.exec(s);
  if (m) {
    const a = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (valide(a, +m[2], +m[1])) return `${a}-${pad(m[2])}-${pad(m[1])}`;
  }
  if (anneeParent) {
    m = /(?:^|\D)(0[1-9]|1[0-2])[-_. ](0[1-9]|[12]\d|3[01])(?!\d)/.exec(s);       // 08-30
    if (m && valide(anneeParent, +m[1], +m[2])) return `${anneeParent}-${m[1]}-${m[2]}`;
    m = /(?:^|\D)(0?[1-9]|[12]\d|3[01])[-_. ](0?[1-9]|1[0-2])(?!\d)/.exec(s);     // 30-08
    if (m && valide(anneeParent, +m[2], +m[1])) return `${anneeParent}-${pad(m[2])}-${pad(m[1])}`;
  }
  return null;
}

/** L'heure de prise de vue lue dans un nom de fichier (VID_20260830_123805, 20260830_123805…). */
export function heureDuNom(nom) {
  const m = /((?:19|20)\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[-_ T]?([01]\d|2[0-3])([0-5]\d)([0-5]\d)?/.exec(String(nom || ''));
  return m ? { date: `${m[1]}-${m[2]}-${m[3]}`, min: +m[4] * 60 + +m[5] } : null;
}

export const estVideo = f => /^video\//.test(f?.contenttype || '') || f?.category === 2 || /\.(mp4|mov|m4v|avi|mkv|insv|360)$/i.test(f?.name || '');
export const estPhoto = f => /^image\//.test(f?.contenttype || '') || f?.category === 1 || /\.(jpe?g|png|heic|webp|gpr|dng)$/i.test(f?.name || '');

/**
 * L'arbre pCloud → les dossiers datés, chacun avec ses vidéos et photos
 * (sous-dossiers compris).
 * @returns {Array<{date, nom, chemin, folderid, fichiers}>}
 */
export function dossiersDates(racine) {
  const out = [];
  const medias = dossier => {
    const l = [];
    for (const x of dossier.contents || []) {
      if (x.isfolder) l.push(...medias(x));
      else if (estVideo(x) || estPhoto(x)) {
        l.push({ fileid: x.fileid, nom: x.name, video: estVideo(x), taille: x.size || 0,
          type: x.contenttype || '', miniature: x.thumb !== false, duree: x.duration ? Number(x.duration) : null });
      }
    }
    return l;
  };
  const parcourir = (dossier, chemin, annee) => {
    for (const x of dossier.contents || []) {
      if (!x.isfolder) continue;
      const ici = [...chemin, x.name];
      const a = /^(19|20)\d\d$/.test(String(x.name).trim()) ? +x.name.trim() : annee;
      const date = dateDuNom(x.name, a);
      if (date) {
        out.push({ date, nom: x.name, chemin: ici.join(' / '), folderid: x.folderid, fichiers: medias(x) });
      } else {
        parcourir(x, ici, a);
      }
    }
  };
  parcourir(racine, [], null);
  // Fichiers posés en vrac, avec la date dans leur nom : un dossier par jour.
  const vrac = new Map();
  for (const x of racine.contents || []) {
    if (x.isfolder || !(estVideo(x) || estPhoto(x))) continue;
    const d = heureDuNom(x.name)?.date || dateDuNom(x.name);
    if (!d) continue;
    if (!vrac.has(d)) vrac.set(d, { date: d, nom: d, chemin: d, folderid: racine.folderid, fichiers: [] });
    vrac.get(d).fichiers.push({ fileid: x.fileid, nom: x.name, video: estVideo(x), taille: x.size || 0, type: x.contenttype || '', miniature: x.thumb !== false });
  }
  out.push(...[...vrac.values()].filter(v => !out.some(o => o.date === v.date)));
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** L'heure de début d'une plongée (heureImmersion) ou d'une séance (heure). */
const heureDe = d => d?.heureImmersion || d?.heure || '';

/**
 * Les vidéos d'une plongée ou d'une séance : le dossier lié à la main,
 * sinon celui de sa date (sauf un dossier mis de côté : test caméra…).
 * Deux sorties le même jour : si les noms des fichiers donnent l'heure,
 * chacune ne garde que les siens.
 * @param {object} dive  plongée ou séance
 * @param {Array} toutes plongées et séances (pour le partage d'un même jour)
 * @param {{autres?:object}} options  dossiers mis de côté : { folderid: libellé }
 * @returns {{dossier, fichiers, parHeure:boolean}|null}
 */
export function videosDePlongee(dive, dossiers, toutes = [], { autres = {} } = {}) {
  if (!dive || !dossiers?.length) return null;
  const dossier = dive.videoDossier
    ? dossiers.find(x => String(x.folderid) === String(dive.videoDossier))
    : dossiers.find(x => x.date === dive.date && !(String(x.folderid) in (autres || {}))
      && !toutes.some(d => d.id !== dive.id && String(d.videoDossier) === String(x.folderid)));
  if (!dossier) return null;
  let fichiers = dossier.fichiers;
  let parHeure = false;
  const memeJour = toutes.filter(d => d.date === dive.date && d.id !== dive.id && !d.videoDossier && /^\d\d:\d\d/.test(heureDe(d)));
  const h = s => (/^\d\d:\d\d/.test(s || '') ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null);
  const debut = h(heureDe(dive));
  if (!dive.videoDossier && memeJour.length && debut != null) {
    const dates = fichiers.map(f => heureDuNom(f.nom));
    if (dates.filter(Boolean).length >= fichiers.length / 2) {
      const fin = debut + (Number(dive.dureeMin) || 60);
      const garde = fichiers.filter((f, i) => dates[i] && dates[i].min >= debut - 20 && dates[i].min <= fin + 20);
      if (garde.length) { fichiers = garde; parHeure = true; }
    }
  }
  return { dossier, fichiers, parHeure };
}

// --- API publique pCloud ------------------------------------------

async function appeler(cfg, methode, params, http) {
  const q = new URLSearchParams({ code: cfg.code, ...params }).toString();
  let api = cfg.api;
  for (let essai = 0; essai < 2; essai++) {
    const r = await http(`https://${api}/${methode}?${q}`);
    if (!r.ok) throw new Error(`pCloud ne répond pas (${r.status})`);
    const j = JSON.parse(r.texte || '{}');
    if (j.result === 0) { cfg.api = api; return j; }
    // Lien d'une autre région (code 7001…) : on essaie l'autre serveur.
    if (essai === 0 && [7001, 7002, 2000].includes(j.result)) { api = autreApi(api); continue; }
    throw new Error(j.error || `pCloud : erreur ${j.result}`);
  }
  throw new Error('Lien pCloud introuvable');
}

/** Requêtes : CapacitorHttp dans l'APK (pas de souci de CORS), fetch sur le site. */
async function httpParDefaut() {
  const { httpParDefaut: h } = await import('./suunto-cloud.js');
  return h();
}

let memoire = null;

/** Le cache de la liste des dossiers (pour un badge instantané dans la liste). */
export function dossiersEnCache(cfg) {
  const c = memoire || (() => { try { return JSON.parse(globalThis.localStorage?.getItem(CLE_CACHE) || 'null'); } catch { return null; } })();
  return c && cfg && c.code === cfg.code ? c.dossiers : null;
}

/**
 * Les dossiers datés du lien (mis en cache 30 min).
 * @returns {Promise<Array>}
 */
export async function chargerDossiers(cfg, { forcer = false, http = null } = {}) {
  if (!cfg?.code) return [];
  const c = memoire || (() => { try { return JSON.parse(globalThis.localStorage?.getItem(CLE_CACHE) || 'null'); } catch { return null; } })();
  if (!forcer && c && c.code === cfg.code && Date.now() - c.at < DUREE_CACHE) { memoire = c; return c.dossiers; }
  const j = await appeler(cfg, 'showpublink', {}, http || await httpParDefaut());
  const dossiers = dossiersDates(j.metadata || {});
  memoire = { code: cfg.code, api: cfg.api, at: Date.now(), racine: j.metadata?.name || '', dossiers };
  try { globalThis.localStorage?.setItem(CLE_CACHE, JSON.stringify(memoire)); } catch { /* trop gros : mémoire seule */ }
  return dossiers;
}

/** L'aperçu d'un fichier (image servie directement par pCloud). */
export const urlMiniature = (cfg, fileid, taille = '320x240') =>
  `https://${cfg.api}/getpubthumb?code=${encodeURIComponent(cfg.code)}&fileid=${fileid}&size=${taille}&crop=1&type=jpg`;

/**
 * Une adresse lisible par <video> : la version allégée que pCloud
 * prépare pour le web si elle existe, sinon le fichier lui-même.
 */
export async function urlLecture(cfg, fichier, { http = null } = {}) {
  const h = http || await httpParDefaut();
  if (fichier.video) {
    try {
      const j = await appeler(cfg, 'getpubvideolinks', { fileid: fichier.fileid }, h);
      const v = (j.variants || []).filter(x => x.hosts?.length && x.path)
        .sort((a, b) => (a.transcoded === b.transcoded ? 0 : a.transcoded ? -1 : 1)
          || Math.abs((a.width || 1280) - 1280) - Math.abs((b.width || 1280) - 1280))[0];
      if (v) return `https://${v.hosts[0]}${v.path}`;
    } catch { /* pas de version web : le fichier brut */ }
  }
  const j = await appeler(cfg, 'getpublinkdownload', { fileid: fichier.fileid }, h);
  if (!j.hosts?.length) throw new Error('Lien de lecture indisponible');
  return `https://${j.hosts[0]}${j.path}`;
}

/** Le dossier dans le site de pCloud. */
export const lienDossier = (cfg, folderid) => `${cfg.lien.split('#')[0]}#folder=${folderid}`;
