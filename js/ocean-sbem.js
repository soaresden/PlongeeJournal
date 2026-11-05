// ============================================================
//  Suunto Ocean — décodage d'une plongée (conteneur SBEM0103)
//
//  Une plongée téléchargée = le profil (/Data, décompressé) suivi du
//  résumé (/Summary). Chacun commence par « SBEM0103 » puis enchaîne
//  des blocs [id:1][longueur:1][valeur] (longueur 255 → longueur sur 4
//  octets). Chaque bloc du profil commence par un écart de temps en ms
//  (int16) : l'horloge est la somme de ces écarts.
//
//  Blocs utiles du profil :
//    0x12  pression absolue / température (1 Hz)
//    0x16  profondeur, pression des blocs, NDL, remontée, plafond
//    0x0B  GPS (heure UTC absolue, position)
//    0x0F  fréquence cardiaque (Ocean)
//    0x1C  état : 0 surface, 1 en plongée, 2 récupération
//    0x08  activité (61/62 = apnée)
//    0x17  pression atmosphérique
//    0x1F  changement de gaz
//  Le résumé porte la configuration : gaz, gradients, type d'eau, et
//  les chiffres de la montre (durée, profondeurs, températures,
//  pression de fin du Tank POD).
//
//  Portage du parseur suunto_nautic de libdivecomputer (LGPL 2.1+),
//  version deepsealabs/libdivecomputer (corrections Ocean incluses).
// ============================================================

import { estimateStops } from './fit.js';

const MAGIC = [0x53, 0x42, 0x45, 0x4D, 0x30, 0x31, 0x30, 0x33];   // SBEM0103

const C = {
  BASE: 0x01, ACTIVITE: 0x08, GPS: 0x0B, GPS_PRECISION: 0x0E, FC: 0x0F,
  PROFIL_1HZ: 0x12, BATTERIE: 0x14, ETAT: 0x16, SURFACE: 0x17,
  PHASE: 0x1C, GAZ: 0x1F,
};

const PHASE_PLONGEE = 1;
const MAX_BLOCS = 8;

// Longueurs fixes connues : un en-tête qui annonce ces ids avec une autre
// longueur est un artefact de décompression, on se resynchronise.
const LONGUEUR_FIXE = { 0x08: 6, 0x0B: 20, 0x0E: 6, 0x14: 7, 0x17: 14 };

// Résumé (décalages depuis « SBEM0103 »).
const R = {
  GF_BAS: 0x35, GF_HAUT: 0x33, EAU: 0x3E,
  GAZ_BASE: 0xC7, GAZ_PAS: 45, GAZ_O2: 1, GAZ_HE: 3, GAZ_VOLUME: 9,
  // Fiche plongée : le dernier enregistrement assez long.
  TEMP_MIN: 313, TEMP_MAX: 317, DUREE: 321, PROF_MAX: 330, PROF_MOY: 338,
  // Pied de plongée (2e enregistrement) : pressions de fin par gaz.
  PIED: 1, PIED_GAZ: 282, PIED_FIN1: 29, PIED_FIN2: 37,
  // Fenêtres (enregistrements 2 à 4) : températures min/max.
  FENETRE: 2, FENETRES: 3, FEN_TMIN: 101, FEN_TMAX: 105,
};

function lecteur(b) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return {
    u8: o => b[o],
    i16: o => v.getInt16(o, true),
    u16: o => v.getUint16(o, true),
    i32: o => v.getInt32(o, true),
    u32: o => v.getUint32(o, true),
    f32: o => v.getFloat32(o, true),
    u64: o => v.getUint32(o, true) + v.getUint32(o + 4, true) * 4294967296,
  };
}

const estMagic = (b, o) => MAGIC.every((c, i) => b[o + i] === c);

/** Position du second « SBEM0103 » (le résumé), ou la taille totale. */
export function trouverResume(b) {
  for (let i = 8; i + 8 <= b.length; i++) if (estMagic(b, i)) return i;
  return b.length;
}

/** Les blocs du profil, avec resynchronisation. */
export function* blocs(b, debut, fin) {
  let pos = debut;
  const r = lecteur(b);
  while (pos + 2 <= fin) {
    const id = b[pos];
    let n = b[pos + 1];
    let tete = 2;
    if (n === 255) {
      if (pos + 6 > fin) { pos++; continue; }
      n = r.u32(pos + 2);
      tete = 6;
    }
    const fixe = LONGUEUR_FIXE[id];
    if ((fixe !== undefined && fixe !== n) || pos + tete + n > fin) { pos++; continue; }
    yield { id, o: pos + tete, n };
    pos += tete + n;
  }
}

/** L'enregistrement n°`index` du résumé (TLV simples, sans resynchro). */
function enregistrementResume(b, debut, fin, index) {
  const r = lecteur(b);
  let pos = debut + 8;
  let dernier = null;
  for (let i = 0; pos + 2 <= fin; i++) {
    let n = b[pos + 1], tete = 2;
    if (n === 255) { if (pos + 6 > fin) break; n = r.u32(pos + 2); tete = 6; }
    if (n > fin - pos - tete) break;
    if (index === i) return { o: pos + tete, n };
    if (index === 'dernier-long' && n >= R.PROF_MOY + 4) dernier = { o: pos + tete, n };
    pos += tete + n;
  }
  return index === 'dernier-long' ? dernier : null;
}

function lireResume(b, s, fin, res) {
  const r = lecteur(b);
  const taille = fin - s;
  if (taille >= R.GF_BAS + 2) {
    // Hors plongée bouteille le résumé n'a pas cette forme : des
    // « gradients » de 52084/9216 ne veulent rien dire.
    const bas = r.u16(s + R.GF_BAS), haut = r.u16(s + R.GF_HAUT);
    if (bas >= 10 && bas <= haut && haut <= 100) res.gf = { bas, haut };
  }
  if (taille > R.EAU && b[s + R.EAU] <= 2) res.eau = ['douce', 'en13319', 'salee'][b[s + R.EAU]];
  for (let i = 0; i < 4; i++) {
    const base = s + R.GAZ_BASE + i * R.GAZ_PAS;
    if (base + R.GAZ_HE + 2 > fin) break;
    const o2 = r.i16(base + R.GAZ_O2), he = r.i16(base + R.GAZ_HE);
    if (o2 < 1 || o2 > 100 || he < 0 || he > 100 || o2 + he > 100) break;
    let litres = null;
    if (base + R.GAZ_VOLUME + 4 <= fin) {
      const m3 = r.f32(base + R.GAZ_VOLUME);
      if (m3 > 0 && m3 < 1) litres = Math.round(m3 * 10000) / 10;
    }
    res.gaz.push({ o2, he, litres });
  }
}

/**
 * Décode une plongée.
 * @param {Uint8Array} b  profil (+ résumé accolé)
 * @param {{logId?:number}} [opts] l'id de la fiche, qui est l'heure de début
 */
export function parseOcean(b, { logId = null } = {}) {
  if (!estMagic(b, 0)) throw new Error('Pas une plongée Suunto (SBEM0103 attendu)');
  const r = lecteur(b);
  const finProfil = trouverResume(b);

  let tempsMs = 0;          // somme brute des écarts
  let horloge = 0;          // vue monotone : le GPS recule l'horloge de quelques centaines de ms
  let phase = 0, debutPhase = -1, totalPlongeeMs = 0;
  let premierePlongeeMs = null, dernierePlongeeMs = null;

  let profMax = 0, somme = 0, nb = 0;
  let temp = null, tempMin = null, tempMax = null, tempSurface = null;
  let fc = null;
  const blocsGaz = [];      // {gaz, champ, debut, fin, finPlongee}
  const carte = new Map();  // `${emplacement}:${champ}` → index
  const p2premier = new Map();
  let debutUtc = null, lieu = null, atmos = null, genre = 'bouteille', sport = null;
  const points = [];
  const changementsGaz = [];

  for (const k of blocs(b, 8, finProfil)) {
    if (k.id !== C.BASE && k.n >= 2) tempsMs += r.i16(k.o);
    if (tempsMs > horloge) horloge = tempsMs;

    switch (k.id) {
      case C.PROFIL_1HZ: {
        if (k.n < 18) break;
        temp = r.u16(k.o + 16) / 100 - 273.15;
        if (tempSurface === null) tempSurface = tempMin = tempMax = temp;
        else { tempMin = Math.min(tempMin, temp); tempMax = Math.max(tempMax, temp); }
        break;
      }
      case C.ETAT: {
        if (k.n < 6) break;
        const d = r.f32(k.o + 2);
        if (d > profMax) profMax = d;
        if (phase === PHASE_PLONGEE) { somme += d; nb++; }

        let pression = null;
        for (let i = 0; i < MAX_BLOCS; i++) {
          const base = k.o + 42 + i * 18;
          if (42 + i * 18 + 18 > k.n || b[base] !== i) break;
          for (let champ = 0; champ < 2; champ++) {
            const pa = r.u32(base + 2 + champ * 4);
            if (!pa) continue;
            const cle = `${i}:${champ}`;
            // Un 2e émetteur fantôme n'envoie qu'une valeur isolée : on
            // attend sa deuxième lecture non nulle avant d'y croire.
            if (champ === 1 && !carte.has(cle) && !p2premier.has(i)) { p2premier.set(i, pa); continue; }
            const bar = pa / 100000;
            if (!carte.has(cle)) {
              if (blocsGaz.length >= MAX_BLOCS) continue;
              carte.set(cle, blocsGaz.length);
              const depart = champ === 1 && p2premier.has(i) ? p2premier.get(i) / 100000 : bar;
              blocsGaz.push({ gaz: i, champ, debut: depart, fin: bar, finPlongee: null });
            }
            const t = blocsGaz[carte.get(cle)];
            t.fin = bar;
            if (phase === PHASE_PLONGEE) t.finPlongee = bar;
            // La pression ne fait que baisser : la plus haute lue est le
            // départ (un émetteur pas encore appairé lit ~9 bar au début).
            if (bar > t.debut) t.debut = bar;
            if (carte.get(cle) === 0) pression = bar;
          }
        }

        const point = { t: horloge, d, temp, pression, fc, plongee: phase === PHASE_PLONGEE };
        if (k.n >= 42) {
          point.remonteeS = r.u16(k.o + 22);
          const ndl = r.i16(k.o + 30);
          const plafond = r.f32(k.o + 38);
          point.plafond = plafond > 0 ? Math.round(plafond * 10) / 10 : 0;
          point.ndlS = plafond > 0 ? 0 : Math.max(0, ndl);
        }
        points.push(point);
        break;
      }
      case C.GPS: {
        if (k.n < 18) break;
        // Sans signal (piscine couverte, montre sous l'eau), la montre écrit
        // quand même un bloc GPS, rempli de n'importe quoi : heure absurde,
        // position au large du Gabon. On n'y croit que si l'heure est
        // plausible, à deux jours près de celle de la fiche.
        const utc = r.u64(k.o + 2);
        const debut = Math.floor((utc - horloge) / 1000);
        const plausible = utc > horloge && debut > 1.4e9 && debut < 4.2e9
          && (logId == null || Math.abs(debut - logId) < 2 * 86400);
        if (!plausible) break;
        if (debutUtc === null) debutUtc = debut;
        if (!lieu) {
          const lat = r.i32(k.o + 10) / 1e7, lng = r.i32(k.o + 14) / 1e7;
          if (Math.abs(lat) > 0.01 && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) lieu = { lat, lng };
        }
        break;
      }
      case C.FC:
        if (k.n >= 3 && b[k.o + 2]) fc = b[k.o + 2];
        break;
      case C.PHASE: {
        if (k.n < 3) break;
        const nouvelle = b[k.o + 2];
        if (nouvelle === PHASE_PLONGEE && phase !== PHASE_PLONGEE) {
          debutPhase = tempsMs;
          if (premierePlongeeMs === null) premierePlongeeMs = horloge;
        } else if (nouvelle !== PHASE_PLONGEE && phase === PHASE_PLONGEE) {
          if (debutPhase >= 0) totalPlongeeMs += tempsMs - debutPhase;
          debutPhase = -1;
          dernierePlongeeMs = horloge;
        }
        phase = nouvelle;
        break;
      }
      case C.SURFACE:
        if (k.n >= 6) atmos = r.f32(k.o + 2) / 100000;
        break;
      case C.ACTIVITE:
        // Type d'activité de l'appli Suunto : 51 plongée bouteille,
        // 61/62 apnée. Le reste (natation…) n'est pas une plongée.
        if (k.n >= 3) {
          sport = b[k.o + 2];
          genre = sport === 51 ? 'bouteille' : [61, 62].includes(sport) ? 'apnee' : 'autre';
        }
        break;
      case C.GAZ:
        if (k.n >= 4 && r.i16(k.o + 2) >= 0) changementsGaz.push({ t: horloge, gaz: r.i16(k.o + 2) });
        break;
      default:
        break;
    }
  }

  if (phase === PHASE_PLONGEE && debutPhase >= 0) {
    totalPlongeeMs += tempsMs - debutPhase;
    dernierePlongeeMs = horloge;
  }

  const res = {
    dureeS: Math.floor((totalPlongeeMs > 0 ? totalPlongeeMs : Math.max(0, tempsMs)) / 1000),
    profMax, profMoy: nb ? somme / nb : 0,
    tempMin, tempMax, tempSurface,
    blocs: blocsGaz.map(t => ({ gaz: t.gaz, champ: t.champ, debut: t.debut, fin: t.finPlongee ?? t.fin })),
    gaz: [], gf: null, eau: null, atmos, lieu, genre, sport,
    debutFluxS: debutUtc ?? logId ?? null,
    heureDepuisGps: debutUtc !== null,
    premierePlongeeMs, dernierePlongeeMs,
    points, changementsGaz,
    resume: finProfil < b.length,
  };

  if (finProfil < b.length) {
    const s = finProfil, fin = b.length;
    lireResume(b, s, fin, res);

    // Les chiffres de la montre (ceux que montre l'appli Suunto), pris
    // seulement s'ils concordent avec le profil.
    const fiche = enregistrementResume(b, s, fin, 'dernier-long');
    if (fiche && res.dureeS > 0) {
      const duree = r.f32(fiche.o + R.DUREE);
      const prof = r.f32(fiche.o + R.PROF_MAX);
      const tolerance = Math.max(30, res.dureeS * 0.1);
      if (duree > 0 && duree < 86400 && Math.abs(duree - res.dureeS) <= tolerance) {
        res.dureeS = Math.floor(duree);
        if (profMax > 0 && prof >= profMax - 0.5 && prof <= profMax + 3) res.profMax = prof;
        const moy = r.f32(fiche.o + R.PROF_MOY);
        if (moy > 0 && moy <= res.profMax) res.profMoy = moy;

        let tmin = null, tmax = null;
        for (let i = 0; i < R.FENETRES; i++) {
          const f = enregistrementResume(b, s, fin, R.FENETRE + i);
          if (!f || f.n < R.FEN_TMAX + 4) continue;
          const lo = r.f32(f.o + R.FEN_TMIN), hi = r.f32(f.o + R.FEN_TMAX);
          if (!(lo > 250 && hi < 330 && lo <= hi)) continue;
          tmin = tmin === null ? lo : Math.min(tmin, lo);
          tmax = tmax === null ? hi : Math.max(tmax, hi);
        }
        if (tmin === null) { tmin = r.f32(fiche.o + R.TEMP_MIN); tmax = r.f32(fiche.o + R.TEMP_MAX); }
        if (tmin > tmax) [tmin, tmax] = [tmax, tmin];        // l'Ocean les range parfois à l'envers
        if (tempSurface !== null && tmin > 250 && tmax < 330) {
          res.tempMin = tmin - 273.15;
          res.tempMax = tmax - 273.15;
        }

        const pied = enregistrementResume(b, s, fin, R.PIED);
        if (pied) {
          for (const t of res.blocs) {
            const base = R.PIED_GAZ + t.gaz * R.GAZ_PAS;
            if (base + R.GAZ_PAS > pied.n) continue;
            const bar = r.i32(pied.o + base + (t.champ ? R.PIED_FIN2 : R.PIED_FIN1)) / 100000;
            if (bar > 0 && bar <= t.debut + 1) t.fin = bar;
          }
        }
      }
    }
  }
  return res;
}

const arrondi = (v, n = 1) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** n) / 10 ** n);

/**
 * Ramène les points (≈ 1 par seconde) à un échantillon toutes les
 * `pasS` secondes, au format du carnet : t (s depuis l'immersion), d,
 * temp, pression, plafond, sansPalier (min), remonteeS, fc.
 */
export function echantillonner(points, { debutMs = 0, finMs = Infinity, pasS = 10 } = {}) {
  const out = [];
  // Les états arrivent toutes les ~10 s, pas pile : on prend le premier
  // point de chaque créneau (à 1 s près), sur une grille fixe, pour ne
  // pas sauter un état sur deux quand il arrive à 9,9 s.
  const pas = pasS * 1000;
  let prochain = debutMs;
  let dernier = null, pris = null;
  for (const p of points) {
    if (p.t < debutMs || p.t > finMs) continue;
    dernier = p;
    if (p.t < prochain - 1000) continue;
    const s = versEchantillon(p, debutMs);
    if (out.length && s.t <= out.at(-1).t) continue;
    out.push(s);
    pris = p;
    while (prochain <= p.t + 1000) prochain += pas;
  }
  if (dernier && dernier !== pris) {
    const s = versEchantillon(dernier, debutMs);
    if (!out.length || s.t > out.at(-1).t) out.push(s);
  }
  // Température : la sonde n'écrit qu'au changement ; on reporte la
  // dernière connue (et la première sur le début du profil).
  let temp = out.find(s => s.temp != null)?.temp ?? null;
  for (const s of out) { if (s.temp == null) s.temp = temp; else temp = s.temp; }
  return out;
}

function versEchantillon(p, debutMs) {
  const s = { t: Math.round((p.t - debutMs) / 1000), d: arrondi(p.d, 2), temp: arrondi(p.temp, 1) };
  if (p.pression != null) s.pression = arrondi(p.pression, 1);
  if (p.plafond != null) s.plafond = p.plafond;
  if (p.ndlS != null) s.sansPalier = Math.round(p.ndlS / 60);
  if (p.remonteeS != null) s.remonteeS = p.remonteeS;
  if (p.fc != null) s.fc = p.fc;
  return s;
}

/**
 * Plongée décodée → forme commune aux imports (comme fitToDive).
 * Le profil commence à l'immersion (passage en phase « plongée »).
 */
export function oceanToDive(dec) {
  const debutMs = dec.premierePlongeeMs ?? 0;
  const finMs = dec.dernierePlongeeMs != null ? dec.dernierePlongeeMs + 1000 : Infinity;
  const samples = echantillonner(dec.points, { debutMs, finMs });
  let start = dec.debutFluxS != null ? new Date((dec.debutFluxS * 1000) + debutMs) : null;
  if (start && Number.isNaN(start.getTime())) start = null;
  const bloc = dec.blocs[0] || null;
  const gaz = dec.gaz[bloc?.gaz ?? 0] || null;
  return {
    start,
    dureeMin: dec.dureeS ? Math.round(dec.dureeS / 60) : null,
    profMax: dec.profMax ? arrondi(dec.profMax) : null,
    profMoy: dec.profMoy ? arrondi(dec.profMoy) : null,
    tempFond: dec.tempMin != null ? dec.tempMin : null,
    tempSurface: dec.tempSurface,
    pressionDepart: bloc ? Math.round(bloc.debut) : null,
    pressionFin: bloc ? Math.round(bloc.fin) : null,
    gazO2: gaz?.o2 ?? null,
    gazHe: gaz?.he ?? null,
    blocLitres: gaz?.litres ?? null,
    gf: dec.gf,
    lieu: dec.lieu,
    genre: dec.genre,
    samples,
    paliers: estimateStops(samples),
  };
}

// ============================================================
//  Rapprochement avec le carnet
// ============================================================

/** Clé anti-doublon d'une plongée importée en Bluetooth. */
export const CLE_OCEAN = id => `ocean:${id}`;

/** Clé .fit « rgpd:2026-06-24_11.27.06-… » → secondes UNIX (heure UTC). */
function heureCleFit(cle) {
  const m = /(\d{4})-(\d\d)-(\d\d)_(\d\d)\.(\d\d)\.(\d\d)/.exec(cle || '');
  return m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000 : null;
}

/** La plongée du carnet qui correspond à cette fiche de la montre, s'il y en a une. */
export function plongeeCorrespondante(fiche, dives) {
  const cle = CLE_OCEAN(fiche.id);
  for (const d of dives) {
    const cles = d.suuntoKeys || [];
    if (cles.includes(cle)) return { dive: d, comment: 'déjà importée en Bluetooth' };
    if (cles.some(k => { const t = heureCleFit(k); return t !== null && Math.abs(t - fiche.id) <= 300; })) {
      return { dive: d, comment: 'déjà importée depuis un .fit' };
    }
  }
  for (const d of dives) {
    if (!d.date || !d.heureImmersion) continue;
    const t = new Date(`${d.date}T${d.heureImmersion}:00`).getTime() / 1000;
    if (Math.abs(t - fiche.id) <= 600) return { dive: d, comment: 'même date et même heure' };
  }
  return null;
}
