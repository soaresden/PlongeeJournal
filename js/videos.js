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

/**
 * Le jour et l'heure de prise de vue lus dans un nom de fichier :
 * 2026-11-08_08h49_4K, 2026-11-08 at 12.34.56 (WhatsApp), 2026-11-08 12:34,
 * VID_20260830_123805, IMG_20260830_1238, 20260622_11h46_Kayak…
 * Sans heure, le jour seul (min null).
 * @returns {{date:string, min:number|null}|null}
 */
export function dateHeureDuNom(nom) {
  const s = String(nom || '');
  let m = /((?:19|20)\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?:[ _T-]+|\s+at\s+)([01]\d|2[0-3])[hH:.]([0-5]\d)(?![\d])/i.exec(s);
  if (m && valide(+m[1], +m[2], +m[3])) return { date: `${m[1]}-${m[2]}-${m[3]}`, min: +m[4] * 60 + +m[5] };
  m = /((?:19|20)\d\d)(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[-_ T]?([01]\d|2[0-3])[hH]?([0-5]\d)([0-5]\d)?(?!\d)/.exec(s);
  if (m && valide(+m[1], +m[2], +m[3])) return { date: `${m[1]}-${m[2]}-${m[3]}`, min: +m[4] * 60 + +m[5] };
  const d = dateDuNom(s);
  return d ? { date: d, min: null } : null;
}

/** L'heure de prise de vue lue dans un nom de fichier (null sans heure). */
export function heureDuNom(nom) {
  const r = dateHeureDuNom(nom);
  return r && r.min != null ? r : null;
}

/**
 * L'heure d'un dossier rangé par plongée (« 2026-11-08 - 12h34 Kandooma Thila », « 2026-11-08 12:34 »), en minutes.
 * @returns {number|null}
 */
export function heureDossier(nom) {
  const s = String(nom || '').replace(/(?:19|20)\d\d[-_.]?\d\d[-_.]?\d\d/, ' ');
  const m = /(?:^|\D)([01]?\d|2[0-3]) ?[hH:] ?([0-5]\d)(?!\d)/.exec(s);
  return m ? +m[1] * 60 + +m[2] : null;
}

// Les fichiers à côté des vidéos GoPro (.LRV basse définition, .THM vignette) ne comptent pas.
const annexe = f => /\.(lrv|thm|srt|wav)$/i.test(f?.name || '');
export const estVideo = f => !annexe(f) && (/^video\//.test(f?.contenttype || '') || f?.category === 2 || /\.(mp4|mov|m4v|avi|mkv|insv|360)$/i.test(f?.name || ''));
/** Un dossier à trier plus tard (TOSORT, « À trier ») : SDManager s'en occupe, on n'y touche pas. */
export const aTrier = nom => /^\s*(to[ _-]?sort|[àa][ _-]?trier)\s*$/i.test(String(nom || ''));
export const estPhoto = f => !annexe(f) && /^image\//.test(f?.contenttype || '') || f?.category === 1 || /\.(jpe?g|png|heic|webp|gpr|dng)$/i.test(f?.name || '');

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
      if (x.isfolder) { if (!aTrier(x.name)) l.push(...medias(x)); }
      else if (estVideo(x) || estPhoto(x)) {
        l.push({ fileid: x.fileid, nom: x.name, video: estVideo(x), taille: x.size || 0,
          type: x.contenttype || '', miniature: x.thumb !== false, duree: x.duration ? Number(x.duration) : null });
      }
    }
    return l;
  };
  const parcourir = (dossier, chemin, annee) => {
    for (const x of dossier.contents || []) {
      if (!x.isfolder || aTrier(x.name)) continue;
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
const meme = (a, b) => String(a) === String(b);

/** Les dossiers reliés à la main à une plongée ou une séance (ancien format : un seul). */
export const dossiersLies = d => (d?.videoDossiers?.length ? d.videoDossiers
  : d?.videoDossier != null && d.videoDossier !== '' ? [d.videoDossier] : []);

/** Relier un dossier de plus (patch à appliquer). */
export function avecDossier(d, folderid) {
  return { videoDossiers: [...new Set([...dossiersLies(d).map(String), String(folderid)])],
    videoDossier: undefined, videoSans: (d.videoSans || []).filter(x => !meme(x, folderid)) };
}

/** Retirer un dossier, qu'il ait été relié à la main ou trouvé à la date. */
export function sansDossier(d, folderid) {
  return { videoDossiers: dossiersLies(d).filter(x => !meme(x, folderid)), videoDossier: undefined,
    videoSans: [...new Set([...(d.videoSans || []).map(String), String(folderid)])] };
}

/**
 * Les vidéos d'une plongée ou d'une séance : les dossiers reliés à la
 * main, sinon celui de sa date (sauf un dossier mis de côté — test
 * caméra… —, retiré de cette sortie, ou relié à la main à une autre).
 * Deux sorties le même jour : si les noms des fichiers donnent l'heure,
 * chacune ne garde que les siens. Les vidéos retirées une à une
 * (`videosRetirees`) ne s'affichent pas. Les fichiers assignés un à un
 * dans l'assistant (`affectations` : { fileid: id de la sortie, ou '' pour
 * aucune }) passent avant tout : ils viennent ici d'où qu'ils soient
 * rangés, et quittent les autres.
 * @param {object} dive  plongée ou séance
 * @param {Array} toutes plongées et séances (pour le partage d'un même jour)
 * @param {{autres?:object}} options  dossiers mis de côté : { folderid: libellé }
 * @returns {{dossier, dossiers, fichiers, retirees, parHeure:boolean, auto:boolean}|null}
 */
export function videosDePlongee(dive, dossiers, toutes = [], { autres = {}, affectations = null, fichiers: plats = null } = {}) {
  if (!dive || !dossiers?.length) return null;
  const aff = affectations || {};
  const lies = dossiersLies(dive);
  const sans = (dive.videoSans || []).map(String);
  let choisis = lies.map(id => dossiers.find(x => meme(x.folderid, id))).filter(Boolean);
  const auto = !lies.length;
  const h = s => (/^\d\d:\d\d/.test(s || '') ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null);
  const debut = h(heureDe(dive));
  let parDossier = false;
  if (auto) {
    const libres = dossiers.filter(y => y.date === dive.date && !(String(y.folderid) in (autres || {}))
      && !sans.includes(String(y.folderid))
      && !toutes.some(d => d.id !== dive.id && dossiersLies(d).some(id => meme(id, y.folderid))));
    // Un dossier par plongée (« 2026-11-08 - 12h34 Kandooma Thila ») : celui de son heure, à moins d'une heure près.
    // Sinon le dossier du jour, sans heure.
    let x = null;
    if (debut != null) {
      const ecart = y => Math.abs(heureDossier(y.nom) - debut);
      x = libres.filter(y => heureDossier(y.nom) != null && ecart(y) <= 60).sort((a, b) => ecart(a) - ecart(b))[0] || null;
      parDossier = !!x;
    }
    if (!x) x = libres.find(y => heureDossier(y.nom) == null) || null;
    choisis = x ? [x] : [];
  }
  let fichiers = choisis.flatMap(x => x.fichiers);
  const assignes = (plats || []).filter(f => meme(aff[f.fileid], dive.id));
  if (!choisis.length && !assignes.length) return null;
  let parHeure = false;
  const memeJour = toutes.filter(d => d.date === dive.date && d.id !== dive.id && !dossiersLies(d).length && /^\d\d:\d\d/.test(heureDe(d)));
  if (auto && !parDossier && memeJour.length && debut != null) {
    const dates = fichiers.map(f => heureDuNom(f.nom));
    if (dates.filter(Boolean).length >= fichiers.length / 2) {
      const fen = fenetres(dive);
      const garde = fichiers.filter((f, i) => dates[i] && fen.some(w => dates[i].min >= w.debut - AVANT && dates[i].min <= w.fin + APRES));
      if (garde.length) { fichiers = garde; parHeure = true; } else {
        // Rien à son heure : elle ne prend pas ce qui est à l'heure d'une autre plongée du jour.
        const autresFen = memeJour.flatMap(fenetres);
        const libres = fichiers.filter((f, i) => !dates[i] || !autresFen.some(w => dates[i].min >= w.debut - AVANT && dates[i].min <= w.fin + APRES));
        if (libres.length < fichiers.length) { fichiers = libres; parHeure = true; }
      }
    }
  }
  // Assignés ailleurs (ou à rien) dans l'assistant : ils s'en vont ; assignés ici : ils viennent.
  fichiers = fichiers.filter(f => !(String(f.fileid) in aff) || meme(aff[f.fileid], dive.id));
  const ajoutes = assignes.filter(f => !fichiers.some(g => meme(g.fileid, f.fileid)));
  fichiers.push(...ajoutes);
  const retirees = (dive.videosRetirees || []).map(String);
  const avant = fichiers.length;
  fichiers = fichiers.filter(f => !retirees.includes(String(f.fileid)));
  return { dossier: choisis[0] || null, dossiers: choisis, fichiers, retirees: avant - fichiers.length, parHeure, auto,
    assignes: ajoutes.length, dossierFichier: ajoutes[0]?.parent ?? null };
}

// --- l'assistant : chaque fichier, sa plongée --------------------

/** Marges autour d'une plongée (min) : la caméra tourne un peu avant la mise à l'eau, un peu après. */
export const AVANT = 20, APRES = 30;
const hm = s => (/^\d\d:\d\d/.test(s || '') ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null);

/**
 * Les moments sous l'eau d'une sortie, en minutes du jour : un seul, ou un
 * par drop pour deux plongées jumelées (`parties`).
 * @returns {Array<{debut, fin, partie:number|null}>}
 */
export function fenetres(d) {
  if (!d) return [];
  const parts = !d.seance && Array.isArray(d.parties) && d.parties.length > 1 ? d.parties : [d];
  return parts.map((p, i) => {
    const a = hm(heureDe(p));
    if (a == null) return null;
    let b = hm(p.heureSortie);
    if (b == null) b = a + (Number(p.dureeMin) || (d.seance ? 60 : 45));
    if (b < a) b += 1440;
    return { debut: a, fin: b, partie: parts.length > 1 ? i + 1 : null };
  }).filter(Boolean);
}

/**
 * Tous les fichiers (vidéos et photos) de l'arbre, avec le dossier qui
 * les contient, et le jour et l'heure lus dans leur nom ou, à défaut,
 * dans celui du dossier. TOSORT et compagnie sont laissés de côté.
 * @returns {Array<{fileid, nom, video, dossier, parent, dossierDate, dossierHeure, date, min, source}>}
 */
export function fichiersPlats(racine) {
  const out = [];
  const go = (d, chemin, dDate, dHeure, annee) => {
    for (const x of d.contents || []) {
      if (x.isfolder) {
        if (aTrier(x.name)) continue;
        const a = /^(19|20)\d\d$/.test(String(x.name).trim()) ? +x.name.trim() : annee;
        const dd = dateDuNom(x.name, a);
        go(x, [...chemin, x.name], dd || dDate, dd ? heureDossier(x.name) : dHeure, a);
      } else if (estVideo(x) || estPhoto(x)) {
        const n = dateHeureDuNom(x.name);
        out.push({ fileid: x.fileid, nom: x.name, video: estVideo(x), taille: x.size || 0, type: x.contenttype || '',
          miniature: x.thumb !== false, duree: x.duration ? Number(x.duration) : null,
          dossier: chemin.join(' / '), parent: x.parentfolderid ?? d.folderid,
          dossierDate: dDate || null, dossierHeure: dHeure ?? null,
          date: n?.date || dDate || null, min: n?.min ?? null,
          source: n?.min != null ? 'nom' : n ? 'nom-jour' : dDate ? 'dossier' : null });
      }
    }
  };
  go(racine || {}, [], null, null, null);
  return out;
}

const ecartA = (m, w) => (m < w.debut ? w.debut - m : m > w.fin ? m - w.fin : 0);

/**
 * La plongée (ou séance) que l'assistant propose pour un fichier, et pourquoi :
 *  - 'dossier'  : rangé dans le dossier d'une plongée (« 2026-11-08 - 12h34 … ») ;
 *  - 'pendant' / 'avant' / 'apres' : l'heure du nom tombe sous l'eau, ou juste autour ;
 *    pour deux drops jumelés, on dit lequel (partie 1, 2) ;
 *  - 'decalage' : à une heure près (montre de la caméra pas à l'heure locale) ;
 *  - 'jour'     : pas d'heure, mais une seule sortie ce jour-là.
 * Sinon dive null, avec les sorties du jour pour choisir à la main.
 * @returns {{dive:object|null, raison:string, confiance:'forte'|'bonne'|'moyenne'|'faible'|null, partie:number|null, ecart:number|null, decalage:number|null, jour:object[]}}
 */
export function proposer(f, sorties) {
  const avecDate = (sorties || []).filter(d => d && d.date);
  const jour = avecDate.filter(d => d.date === f.date || (f.dossierDate && d.date === f.dossierDate));
  const rien = raison => ({ dive: null, raison, confiance: null, partie: null, ecart: null, decalage: null, jour });
  const partieA = (d, m) => {
    const fen = fenetres(d);
    if (m == null || fen.length < 2) return null;
    return [...fen].sort((a, b) => ecartA(m, a) - ecartA(m, b))[0].partie;
  };
  // 1. Le dossier d'une plongée : son heure, à 20 min près.
  if (f.dossierHeure != null && f.dossierDate) {
    const c = avecDate.filter(d => d.date === f.dossierDate && hm(heureDe(d)) != null)
      .map(d => ({ d, e: Math.abs(hm(heureDe(d)) - f.dossierHeure) })).filter(x => x.e <= 20).sort((a, b) => a.e - b.e)[0];
    if (c) {
      const ok = f.date === f.dossierDate;
      return { ...rien('dossier'), dive: c.d, confiance: 'forte', partie: ok ? partieA(c.d, f.min) : null };
    }
  }
  // 2. L'heure du nom du fichier.
  if (f.min != null && f.date) {
    const duJour = avecDate.filter(d => d.date === f.date);
    const meilleur = decal => {
      let best = null;
      for (const d of duJour) for (const w of fenetres(d)) {
        const m = f.min + decal, e = ecartA(m, w);
        const dedans = m < w.debut ? e <= (decal ? 10 : AVANT) : e <= (decal ? 10 : APRES);
        if (dedans && (!best || e < best.e)) best = { d, w, e, m };
      }
      return best;
    };
    const b = meilleur(0);
    if (b) {
      return { ...rien(b.e === 0 ? 'pendant' : b.m < b.w.debut ? 'avant' : 'apres'), dive: b.d,
        confiance: b.e === 0 ? 'forte' : 'bonne', partie: b.w.partie, ecart: b.e };
    }
    for (const k of [-60, 60]) {
      const c = meilleur(k);
      if (c) return { ...rien('decalage'), dive: c.d, confiance: 'moyenne', partie: c.w.partie, ecart: c.e, decalage: k };
    }
    return rien(duJour.length ? 'hors' : 'aucune');
  }
  // 3. Pas d'heure : la seule sortie du jour.
  if (jour.length === 1) return { ...rien('jour'), dive: jour[0], confiance: 'faible' };
  return rien(jour.length ? 'plusieurs' : 'aucune');
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

/** Tous les fichiers du lien, à plat (après un chargerDossiers). */
export function fichiersEnCache(cfg) {
  const c = memoire || (() => { try { return JSON.parse(globalThis.localStorage?.getItem(CLE_CACHE) || 'null'); } catch { return null; } })();
  return c && cfg && c.code === cfg.code ? c.fichiers || [] : [];
}

/** L'heure de la dernière lecture de pCloud (ms), null sans cache. */
export function luA(cfg) {
  const c = memoire;
  return c && cfg && c.code === cfg.code ? c.at : null;
}

/**
 * Les dossiers datés du lien (mis en cache 30 min).
 * @returns {Promise<Array>}
 */
export async function chargerDossiers(cfg, { forcer = false, http = null } = {}) {
  if (!cfg?.code) return [];
  const c = memoire || (() => { try { return JSON.parse(globalThis.localStorage?.getItem(CLE_CACHE) || 'null'); } catch { return null; } })();
  if (!forcer && c && c.code === cfg.code && c.fichiers && Date.now() - c.at < DUREE_CACHE) { memoire = c; return c.dossiers; }
  const j = await appeler(cfg, 'showpublink', {}, http || await httpParDefaut());
  const dossiers = dossiersDates(j.metadata || {});
  memoire = { code: cfg.code, api: cfg.api, at: Date.now(), racine: j.metadata?.name || '', dossiers, fichiers: fichiersPlats(j.metadata || {}) };
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

/** L'adresse du fichier original (à télécharger, ou à donner à un autre lecteur). */
export async function urlTelechargement(cfg, fichier, { http = null } = {}) {
  const j = await appeler(cfg, 'getpublinkdownload', { fileid: fichier.fileid }, http || await httpParDefaut());
  if (!j.hosts?.length) throw new Error('Lien de téléchargement indisponible');
  return `https://${j.hosts[0]}${j.path}`;
}

/**
 * L'image est-elle figée alors que le son avance ? (4K en H.265 trop lourd
 * pour le lecteur de l'appli). Mesuré après quelques secondes de lecture.
 */
export function imageFigee(video) {
  if (!video || video.paused || video.currentTime < 2) return false;
  if (!video.videoWidth) return true;
  const q = video.getVideoPlaybackQuality?.();
  if (!q) return false;
  const vues = q.totalVideoFrames - q.droppedVideoFrames;
  // Moins de 2 images par seconde réellement affichées : c'est figé.
  return vues < Math.max(4, video.currentTime * 2);
}

/** Le dossier dans le site de pCloud. */
export const lienDossier = (cfg, folderid) => `${cfg.lien.split('#')[0]}#folder=${folderid}`;
