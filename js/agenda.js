// ============================================================
//  Ton agenda : ce que tu faisais le jour d'une plongée
//
//  Le lien « adresse secrète au format iCal » de Google Agenda donne
//  accès à tout l'agenda : il reste sur l'appareil (jamais dans le
//  carnet, jamais sur GitHub). Google ne laisse pas une page web le
//  lire : seule l'APK, qui passe par Android, y arrive.
//
//  Usage : proposer un lieu pour une plongée ou une séance d'après
//  l'événement du même jour (« TODI Belgique », « Malte WeRoad »…),
//  et les plongeurs dont le nom y est écrit (« Fosse avec Marc »).
// ============================================================

import { httpParDefaut } from './suunto-cloud.js';

const CLE_LIEN = 'plongee-journal:agenda-lien';
const CLE_CACHE = 'plongee-journal:agenda-cache';
const FRAICHEUR_MS = 6 * 3600 * 1000;

const lire = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const ecrire = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* plein ou privé */ } };

export const lienAgenda = () => lire(CLE_LIEN);
export const agendaBranche = () => !!lienAgenda();
export const agendaLisible = () => typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

/** Un lien iCal plausible : https, et une adresse d'agenda. */
export function lienValide(url = '') {
  return /^https:\/\/\S+$/.test(url) && (/\/ical\//.test(url) || /\.ics(\?|$)/.test(url));
}

export function enregistrerLienAgenda(url) {
  ecrire(CLE_LIEN, url.trim());
  ecrire(CLE_CACHE, '');
  memoire = null;
}

export function oublierAgenda() {
  ecrire(CLE_LIEN, '');
  ecrire(CLE_CACHE, '');
  memoire = null;
}

// ------------------------------------------------------------
//  Lecture du format iCal
// ------------------------------------------------------------

const pad = n => String(n).padStart(2, '0');
const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** « 20231103T183000Z », « 20230318 », avec ou sans fuseau → AAAA-MM-JJ. */
function dateIcs(valeur, { finJournee = false } = {}) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/.exec(valeur || '');
  if (!m) return '';
  const [, a, mo, j, h, mi, s, z] = m;
  if (!h) {
    // Journée entière : la fin est exclusive (le lendemain).
    if (!finJournee) return `${a}-${mo}-${j}`;
    const d = new Date(Number(a), Number(mo) - 1, Number(j) - 1);
    return isoLocal(d);
  }
  if (z) return isoLocal(new Date(Date.UTC(+a, +mo - 1, +j, +h, +mi, +s)));
  return `${a}-${mo}-${j}`;
}

const texte = v => (v || '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

/**
 * Les événements d'un fichier iCal.
 * @returns {{debut:string, fin:string, titre:string, lieu:string}[]}  dates AAAA-MM-JJ, fin incluse
 */
export function lireIcs(contenu = '') {
  // Les lignes longues sont repliées : une ligne qui commence par un
  // espace prolonge la précédente.
  const lignes = contenu.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const out = [];
  let ev = null;
  for (const l of lignes) {
    if (l === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (l === 'END:VEVENT') {
      if (ev?.debut) {
        const fin = ev.fin && ev.fin >= ev.debut ? ev.fin : ev.debut;
        const e = { debut: ev.debut, fin, titre: ev.titre || '', lieu: ev.lieu || '' };
        // La description : c'est souvent là qu'on note avec qui.
        if (ev.desc) e.desc = ev.desc.slice(0, 300);
        out.push(e);
      }
      ev = null;
      continue;
    }
    if (!ev) continue;
    const i = l.indexOf(':');
    if (i < 0) continue;
    const nom = l.slice(0, i).split(';')[0].toUpperCase();
    const val = l.slice(i + 1);
    const journee = /VALUE=DATE(?!-)/i.test(l.slice(0, i)) || /^\d{8}$/.test(val);
    if (nom === 'DTSTART') ev.debut = dateIcs(val);
    else if (nom === 'DTEND') ev.fin = dateIcs(val, { finJournee: journee });
    else if (nom === 'SUMMARY') ev.titre = texte(val);
    else if (nom === 'LOCATION') ev.lieu = texte(val);
    else if (nom === 'DESCRIPTION') ev.desc = texte(val).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return out;
}

// ------------------------------------------------------------
//  Chargement (APK) et recherche par jour
// ------------------------------------------------------------

let memoire = null;

/** Télécharge l'agenda (ou le reprend du cache de moins de 6 h). */
export async function chargerAgenda({ forcer = false, http = httpParDefaut() } = {}) {
  const lien = lienAgenda();
  if (!lien) return [];
  if (memoire && !forcer) return memoire;

  if (!forcer) {
    try {
      const c = JSON.parse(lire(CLE_CACHE) || 'null');
      if (c && Date.now() - c.le < FRAICHEUR_MS && Array.isArray(c.ev)) return (memoire = c.ev);
    } catch { /* cache abîmé */ }
  }
  const r = await http(lien);
  if (!r.ok) throw new Error(`Agenda illisible (HTTP ${r.status})`);
  if (!/BEGIN:VCALENDAR/.test(r.texte || '')) throw new Error('Ce lien ne renvoie pas un agenda iCal');
  memoire = lireIcs(r.texte);
  // Le cache ne garde que l'essentiel ; s'il ne tient pas, tant pis.
  ecrire(CLE_CACHE, JSON.stringify({ le: Date.now(), ev: memoire }));
  return memoire;
}

/** Les événements qui couvrent ce jour, les plus courts d'abord. */
export function evenementsDu(evenements, date) {
  if (!date) return [];
  const duree = e => (Date.parse(e.fin) - Date.parse(e.debut)) || 0;
  return evenements.filter(e => e.debut <= date && date <= e.fin)
    .sort((a, b) => duree(a) - duree(b))
    .slice(0, 6);
}

/** Le lieu qu'on peut en tirer : l'adresse si l'événement en a une, sinon son titre. */
export function lieuPropose(e) {
  const adresse = (e.lieu || '').split(',')[0].trim();
  return adresse || e.titre;
}

/** Le texte où chercher des noms : titre, lieu, description. */
export const texteEvenement = e => [e.titre, e.desc, e.lieu].filter(Boolean).join(' — ');
