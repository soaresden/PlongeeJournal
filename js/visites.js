// ============================================================
//  Les visites de mon carnet partagé
//
//  Celui qui ouvre le lien donne son prénom, une date et un lieu où il
//  a plongé avec moi : c'est le « mot de passe » (il doit correspondre à
//  une de mes plongées), et c'est ce qui me dit qui regarde.
//
//  Le site est statique : pour me prévenir, la page envoie un petit
//  message sur un canal ntfy.sh (service public de notifications, sans
//  compte) dont le nom, tiré au hasard, n'est connu que de mon lien.
//  Mon appli relit ce canal à chaque ouverture et garde les visites dans
//  le carnet. ntfy.sh ne garde les messages que 12 heures : avec l'appli
//  ntfy abonnée au canal, je suis prévenu tout de suite et rien ne se perd.
// ============================================================

import { posterFeuille, lireFeuille } from './feuille.js';

export const NTFY = 'https://ntfy.sh';

// La feuille Google où chaque visite est aussi écrite (voir feuille.js) :
// donnée par le carnet partagé, côté visiteur.
let FEUILLE = '';
export const brancherFeuille = url => { FEUILLE = url || ''; };

/** Un numéro de message (le même sur ntfy et dans la feuille : pas de doublon). */
const numeroMessage = () => Math.random().toString(36).slice(2, 12);

const sansAccent = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mots = s => sansAccent(s).split(/[^a-z0-9]+/).filter(m => m.length >= 3);
const jour = iso => (/^\d{4}-\d\d-\d\d$/.test(iso || '') ? new Date(`${iso}T12:00:00Z`).getTime() / 86400000 : null);

/** Un nom de canal neuf (difficile à deviner). */
export function nouveauCanal() {
  const a = 'abcdefghijkmnopqrstuvwxyz23456789';
  const o = crypto.getRandomValues(new Uint8Array(20));
  return `pj-${[...o].map(x => a[x % a.length]).join('')}`;
}

/**
 * Le visiteur a-t-il plongé avec moi ? Une de mes plongées à 3 jours près
 * de sa date, dont le lieu (ou le pays, ou le centre) contient un mot de
 * ce qu'il a tapé.
 * @param {{date:string, lieu:string}} saisie
 * @param {Array} dives
 * @param {(d)=>string[]} [autresNoms] noms supplémentaires d'une plongée (pays…)
 * @returns {{ok:boolean, plongee:object|null}}
 */
export function verifierVisiteur({ date, lieu }, dives, autresNoms = () => []) {
  const j = jour(date);
  const cherches = mots(lieu);
  if (j == null || !cherches.length) return { ok: false, plongee: null };
  let meilleure = null, ecart = Infinity;
  for (const d of dives || []) {
    const jd = jour(d.date);
    if (jd == null || Math.abs(jd - j) > 3) continue;
    const texte = mots([d.lieuNom, d.site, d.lieuDetail, d.centreNom, ...autresNoms(d)].join(' '));
    const ok = cherches.some(m => texte.some(t => t.includes(m) || m.includes(t)));
    if (ok && Math.abs(jd - j) < ecart) { ecart = Math.abs(jd - j); meilleure = d; }
  }
  return { ok: !!meilleure, plongee: meilleure };
}

const fmt = iso => (iso ? iso.split('-').reverse().join('/') : '?');

/** Le message envoyé sur le canal (lisible tel quel dans l'appli ntfy). */
export function message({ prenom, date, lieu, plongee, ok, sid = null }) {
  return {
    titre: ok ? `👀 ${prenom} regarde ton carnet` : `❓ ${prenom || 'Quelqu’un'} n’a pas trouvé la plongée`,
    corps: [prenom || '?', fmt(date), lieu || '?', plongee ? `n°${plongee.numero ?? '?'} ${plongee.lieuNom || ''}`.trim() : ''].filter(Boolean).join(' · '),
    tags: [ok ? 'eyes' : 'question', ok ? 'pj-ok' : 'pj-ko', ...(plongee ? [`pj-plongee-${plongee.id}`] : []), ...(sid ? [`pj-s-${sid}`] : []),
      `pj-m-${numeroMessage()}`],
  };
}

/** Prévient le propriétaire (ne lève jamais : une visite ne doit pas échouer pour ça). */
export async function annoncerVisite(canal, visite, f = fetch) {
  if (!canal) return false;
  const m = message(visite);
  posterFeuille(FEUILLE, m);
  try {
    const r = await f(`${NTFY}/${encodeURIComponent(canal)}?title=${encodeURIComponent(m.titre)}&tags=${encodeURIComponent(m.tags.join(','))}`, {
      // Le titre et les étiquettes en paramètres d'URL (un en-tête ne prend
      // pas d'accents, et une requête « simple » évite le contrôle CORS).
      method: 'POST', body: m.corps,
    });
    return !!r?.ok;
  } catch { return false; }
}

/** Le message ntfy relu → une visite. */
export function lireMessage(m) {
  const tags = m.tags || [];
  const s = tags.find(t => t.startsWith('pj-s-'))?.slice(5) || null;
  const id = tags.find(t => t.startsWith('pj-m-'))?.slice(5) || m.id;
  if (tags.includes('pj-parcours')) {
    const [prenom = '', , pages = ''] = String(m.message || '').split(' · ');
    return { id, at: new Date((m.time || 0) * 1000).toISOString(), genre: 'parcours', prenom, sid: s, pages: pages ? pages.split(' › ') : [] };
  }
  const [prenom = '', date = '', lieu = '', plongee = ''] = String(m.message || '').split(' · ');
  const d = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(date);
  return {
    id, at: new Date((m.time || 0) * 1000).toISOString(),
    prenom, date: d ? `${d[3]}-${d[2]}-${d[1]}` : '', lieu, plongee,
    plongeeId: (tags.find(t => t.startsWith('pj-plongee-')) || '').slice(11) || null,
    ok: tags.includes('pj-ok'), genre: 'entree', sid: s,
  };
}

/** Relit le canal (12 dernières heures sur ntfy.sh). */
export async function relireVisites(canal, f = fetch) {
  if (!canal) return [];
  const r = await f(`${NTFY}/${encodeURIComponent(canal)}/json?poll=1&since=all`);
  if (!r.ok) throw new Error(`ntfy a répondu ${r.status}`);
  const texte = await r.text();
  return texte.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(m => m && m.event === 'message').map(lireMessage);
}

/**
 * Relit tout : le canal ntfy (12 dernières heures) et la feuille Google
 * (tout l'historique), sans doublon. Lève seulement si rien n'a pu être lu.
 */
export async function relireToutesVisites({ canal = '', feuille = '', cle = '' } = {}, f = fetch) {
  const sources = [canal ? relireVisites(canal, f) : null, feuille && cle ? lireFeuille(feuille, cle, f).then(l => l.map(lireMessage)) : null].filter(Boolean);
  const res = await Promise.allSettled(sources);
  const lues = res.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
  if (sources.length && !res.some(r => r.status === 'fulfilled')) throw res[0].reason;
  return fusionnerVisites([], lues, 5000);
}

/** Ajoute les nouvelles aux visites gardées (sans doublon), les plus récentes d'abord. */
export function fusionnerVisites(anciennes = [], nouvelles = [], max = 2000) {
  const parId = new Map(anciennes.map(v => [v.id, v]));
  for (const v of nouvelles) if (v?.id && !parId.has(v.id)) parId.set(v.id, v);
  return [...parId.values()].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, max);
}

// ------------------------------------------------------------
//  Le parcours du visiteur : ce qu'il regarde (côté visiteur)
// ------------------------------------------------------------

/** Un numéro de visite (pour rassembler l'entrée et le parcours). */
export const nouvelleSession = () => Math.random().toString(36).slice(2, 10);

/** Le message « parcours » : les écrans vus, dans l'ordre. */
export function messageParcours({ prenom, sid, pages }) {
  return {
    titre: `🧭 ${prenom || 'Un visiteur'} a regardé`,
    corps: [prenom || '?', 'parcours', pages.join(' › ')].join(' · '),
    tags: ['compass', 'pj-parcours', `pj-s-${sid}`, `pj-m-${numeroMessage()}`],
  };
}

/**
 * Suit ce que regarde le visiteur (changements d'écran et fiches ouvertes,
 * signalées par l'évènement « pj-vue ») et l'envoie de temps en temps, et
 * quand il quitte la page.
 * @param {{canal, prenom, sid, nommer:(chemin)=>string}} o
 */
export function suivreParcours({ canal, prenom, sid, nommer }) {
  if (!canal || typeof window === 'undefined') return () => {};
  const pages = [];
  let envoyees = 0;
  const noter = libelle => {
    if (!libelle || pages.at(-1) === libelle) return;
    pages.push(libelle);
    if (pages.length > 60) pages.splice(0, pages.length - 60);
  };
  const envoyer = (aLaFin = false) => {
    if (pages.length === envoyees) return;
    envoyees = pages.length;
    const m = messageParcours({ prenom, sid, pages });
    posterFeuille(FEUILLE, m, { fin: aLaFin });
    const url = `${NTFY}/${encodeURIComponent(canal)}?title=${encodeURIComponent(m.titre)}&tags=${encodeURIComponent(m.tags.join(','))}`;
    try {
      if (aLaFin && navigator.sendBeacon) navigator.sendBeacon(url, m.corps);
      else fetch(url, { method: 'POST', body: m.corps, keepalive: true }).catch(() => {});
    } catch { /* tant pis */ }
  };
  const surChemin = () => noter(nommer(location.hash.replace(/^#\/?/, '') || 'cv'));
  const surVue = e => noter(e.detail);
  window.addEventListener('hashchange', surChemin);
  window.addEventListener('pj-vue', surVue);
  const tic = setInterval(() => envoyer(), 90000);
  const cache = () => { if (document.hidden) envoyer(true); };
  document.addEventListener('visibilitychange', cache);
  window.addEventListener('pagehide', () => envoyer(true));
  surChemin();
  return () => { clearInterval(tic); window.removeEventListener('hashchange', surChemin); window.removeEventListener('pj-vue', surVue); };
}

// ------------------------------------------------------------
//  Côté propriétaire : les visites rassemblées et identifiées
// ------------------------------------------------------------

/**
 * Les messages relus → des visites : une entrée (réussie ou non), et ce
 * qui a été regardé ensuite. Les plus récentes d'abord.
 */
export function regrouperVisites(messages = []) {
  const parSession = new Map(), seules = [];
  const tri = [...messages].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  for (const m of tri) {
    const s = m.sid || null;
    if (m.genre === 'parcours') {
      const v = s && parSession.get(s);
      if (v) { v.pages = m.pages; v.fin = m.at; }
      else if (s) parSession.set(s, { id: s, prenom: m.prenom, at: m.at, fin: m.at, ok: true, pages: m.pages, sansEntree: true });
      continue;
    }
    const v = { id: s || m.id, prenom: m.prenom, at: m.at, fin: m.at, ok: m.ok, date: m.date, lieu: m.lieu, plongee: m.plongee,
      plongeeId: m.plongeeId, retour: /\(retour\)/.test(m.lieu || ''), pages: [] };
    const avant = s && parSession.get(s);
    if (avant && !avant.sansEntree && !avant.ok) {
      // Des essais ratés avant d'entrer : gardés pour savoir ce qu'il a tenté.
      v.rates = [...(avant.rates || []), [avant.lieu, fmt(avant.date)].filter(Boolean).join(', ')];
      v.at = avant.at;
    }
    if (s) parSession.set(s, Object.assign(avant || {}, v, { pages: avant?.pages || [] }));
    else seules.push(v);
  }
  return [...parSession.values(), ...seules].sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/**
 * Qui est-ce ? Un de mes plongeurs dont le prénom (ou le nom complet)
 * correspond ; de préférence quelqu'un de la palanquée de la plongée donnée.
 * @returns {{buddy, sur:boolean}|null}  sur : il était dans cette plongée
 */
export function identifier(visite, buddies = [], dives = []) {
  // « Jean-Marie », « jean marie », « JEAN MARIE » : la même chose.
  const norm = x => sansAccent(x).replace(/[^a-z]+/g, ' ').trim();
  const n = norm(visite.prenom);
  if (!n) return null;
  const possibles = buddies.filter(b => {
    if (b.structure) return false;
    const p = norm(b.prenom), complet = norm(`${b.prenom || ''} ${b.nom || ''}`);
    return p && (p === n || complet === n || n.startsWith(`${p} `));
  });
  if (!possibles.length) return null;
  // Prénom + nom donnés en entier : c'est lui, pas un homonyme.
  const exacts = possibles.filter(b => b.nom && norm(`${b.prenom} ${b.nom}`) === n);
  const candidats = exacts.length ? exacts : possibles;
  const plongee = dives.find(d => d.id === visite.plongeeId);
  const dedans = candidats.find(b => (plongee?.buddyIds || []).includes(b.id));
  if (dedans) return { buddy: dedans, sur: true };
  return candidats.length === 1 ? { buddy: candidats[0], sur: false } : { buddy: candidats[0], sur: false, plusieurs: candidats.length };
}
