// ============================================================
//  L'ambiance d'une plongée, d'après son lieu
//
//  Chaque plongée reçoit une « ambiance » déduite de ses
//  coordonnées et du type d'eau : Caraïbes, Méditerranée, Mer
//  Rouge, Atlantique, Manche, Lac & carrière… Elle donne ses
//  couleurs à la vignette satellite, au liseré de la carte et à
//  l'étiquette. Rien n'est stocké : tout est recalculé.
// ============================================================

import { el } from './lib.js';

/** c1 / c2 : les deux teintes du dégradé ; nom : l'étiquette affichée. */
export const AMBIANCES = {
  caraibes:  { nom: 'Caraïbes',            c1: '#14c9bd', c2: '#ff8a5c' },
  tropiques: { nom: 'Tropiques',           c1: '#00bfa5', c2: '#ffb300' },
  merRouge:  { nom: 'Mer Rouge',           c1: '#ff6b4a', c2: '#18b3c8' },
  med:       { nom: 'Méditerranée',        c1: '#1e88e5', c2: '#22c7dc' },
  atlantique:{ nom: 'Îles atlantiques',    c1: '#00897b', c2: '#4fc3f7' },
  nord:      { nom: 'Manche & Atlantique', c1: '#3f6ea8', c2: '#5fb8a0' },
  ocean:     { nom: 'Océan',               c1: '#0288d1', c2: '#4dd0e1' },
  douce:     { nom: 'Lac & carrière',      c1: '#2e9d5b', c2: '#a3c94a' },
  fosse:     { nom: 'Fosse',               c1: '#7e57c2', c2: '#42a5f5' },
  aPreciser: { nom: 'Eau à préciser',      c1: '#5c7184', c2: '#8aa1b4' },
};

const entre = (v, a, b) => v >= a && v <= b;

/** Identifiant d'ambiance d'une plongée. */
export function ambianceId(d = {}) {
  const lieu = `${d.lieuNom || ''} ${d.site || ''}`.toLowerCase();
  if ((d.options || []).includes('Plongée en fosse') || /\bfosse\b/.test(lieu)) return 'fosse';
  if (d.eau === 'douce') return 'douce';

  const { lat, lng } = d;
  if (lat == null || lng == null) return 'ocean';
  if (entre(lat, 12, 30.5) && entre(lng, 32, 44)) return 'merRouge';
  if (Math.abs(lat) <= 23.5) {
    return entre(lat, 8, 28) && entre(lng, -90, -55) ? 'caraibes' : 'tropiques';
  }
  if (entre(lat, 30, 46.5) && entre(lng, -5.6, 36.5)) return 'med';
  if (entre(lat, 25, 42) && entre(lng, -35, -12)) return 'atlantique';
  // Au nord, la mer n'est qu'une bande côtière : sans type d'eau connu, un
  // point en Île-de-France n'a rien de la Manche (une piscine importée
  // de la montre, par exemple).
  if (lat > 43) return d.eau === 'salee' ? 'nord' : 'aPreciser';
  return 'ocean';
}

export function ambianceDe(d) {
  const id = ambianceId(d);
  return { id, ...AMBIANCES[id], nuit: /nuit/i.test(d?.type || '') };
}

/** Variables CSS à poser sur un élément pour qu'il prenne l'ambiance. */
export function stylesAmbiance(a) {
  return { '--amb1': a.c1, '--amb2': a.c2 };
}

// ------------------------------------------------------------
//  Vignette satellite (une tuile Esri, centrée sur le site)
// ------------------------------------------------------------

const SATELLITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';

/**
 * Tuiles nécessaires pour une boîte de `boite` px centrée exactement sur
 * le point, chaque tuile étant affichée à `echelle` px (2× la boîte : net
 * sur écran dense). Une seule tuile en général, deux ou quatre quand le
 * site est près d'un bord de tuile.
 */
export function tuiles(lat, lng, { zoom = 12, boite = 84, echelle = boite * 2 } = {}) {
  const n = 2 ** zoom;
  const r = (lat * Math.PI) / 180;
  const gx = ((lng + 180) / 360) * n * echelle;
  const gy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n * echelle;
  const gauche = gx - boite / 2, haut = gy - boite / 2;
  const liste = [];
  for (let ty = Math.floor(haut / echelle); ty <= Math.floor((haut + boite - 1) / echelle); ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = Math.floor(gauche / echelle); tx <= Math.floor((gauche + boite - 1) / echelle); tx++) {
      const x = ((tx % n) + n) % n;
      liste.push({ url: `${SATELLITE}/${zoom}/${ty}/${x}`, x: tx * echelle - gauche, y: ty * echelle - haut });
    }
  }
  return { liste, taille: echelle };
}

/**
 * Vignette d'un lieu de plongée : image satellite teintée aux couleurs
 * de l'ambiance, repère du site au centre, et un contenu par-dessus.
 */
export function vignetteLieu(d, { boite = 84, zoom = 12, contenu = null, classe = '' } = {}) {
  const a = ambianceDe(d);
  const v = el(`div.vignette${classe ? '.' + classe : ''}${a.nuit ? '.nuit' : ''}`, {
    style: { ...stylesAmbiance(a), width: `${boite}px`, height: `${boite}px` },
    'aria-hidden': 'true',
  });
  if (d.lat != null && d.lng != null) {
    const { liste, taille } = tuiles(d.lat, d.lng, { zoom, boite });
    liste.forEach(t => {
      const img = el('img.vignette-sat', {
        src: t.url, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer',
        style: { width: `${taille}px`, height: `${taille}px`, left: `${t.x}px`, top: `${t.y}px` },
      });
      img.onerror = () => img.remove();          // hors ligne : le dégradé suffit
      v.append(img);
    });
    v.append(el('span.vignette-pin'));
  }
  v.append(el('span.vignette-teinte'));
  if (contenu !== null) v.append(el('span.vignette-contenu', {}, contenu));
  return v;
}

/** Étiquette colorée de l'ambiance. */
export function etiquetteAmbiance(d) {
  const a = ambianceDe(d);
  return el('span.amb-chip', { style: stylesAmbiance(a), text: a.nuit ? `${a.nom} · nuit` : a.nom });
}
