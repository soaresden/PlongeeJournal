// ============================================================
//  Le graphique d'une plongée
//
//  La profondeur en fond, et par-dessus une seule courbe à la fois
//  (température, bouteille, consommation, cœur, temps sans palier) :
//  deux courbes superposées sur un téléphone, on n'y lit plus rien.
//  Le doigt (ou la souris) sur le graphique donne tout à cet instant.
//
//  Et les « tuiles » : les chiffres que l'ordinateur donne déjà, pour
//  ne rien avoir à recopier.
// ============================================================

import { el } from './lib.js';
import { analyserProfil, pointsValables, SOUS_L_EAU } from './profil-analyse.js';

const NS = 'http://www.w3.org/2000/svg';

/** Les courbes possibles, dans l'ordre des boutons. */
export const SERIES = [
  { id: 'temp',       label: '🌡 Température', unite: '°C',    couleur: '#f59e0b', dec: 1 },
  { id: 'pression',   label: '🛢 Bouteille',   unite: 'bar',   couleur: '#10b981', dec: 0 },
  { id: 'sac',        label: '💨 Conso',       unite: 'L/min', couleur: '#8b5cf6', dec: 1 },
  { id: 'fc',         label: '❤️ Cœur',        unite: 'bpm',   couleur: '#ef4444', dec: 0 },
  { id: 'sansPalier', label: '⏱ Sans palier',  unite: 'min',   couleur: '#0ea5e9', dec: 0 },
];

function svg(tag, attrs = {}, ...enfants) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  enfants.forEach(e => e != null && n.append(e));
  return n;
}

const fmtMin = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Les valeurs d'une série, par instant (null si absente). */
function valeursSerie(id, pts, conso) {
  if (id === 'sac') return conso.map(c => ({ t: c.t, v: c.sac }));
  return pts.map(p => {
    let v = p[id];
    if (!Number.isFinite(v)) return { t: p.t, v: null };
    // Hors de l'eau, le temps sans palier et le cœur ne veulent rien dire.
    if ((id === 'sansPalier' || id === 'fc') && p.d < SOUS_L_EAU) return { t: p.t, v: null };
    if (id === 'sansPalier' && v >= 99) return { t: p.t, v: null };
    if (id === 'fc' && v < 30) return { t: p.t, v: null };
    return { t: p.t, v };
  });
}

/** Les séries qui ont quelque chose à montrer pour cette plongée. */
export function seriesDisponibles(samples, analyse) {
  const pts = pointsValables(samples);
  const conso = analyse?.conso || [];
  return SERIES.filter(s => {
    const v = valeursSerie(s.id, pts, conso).filter(x => x.v != null);
    if (v.length < 3) return false;
    if (s.id === 'temp') return true;
    const min = Math.min(...v.map(x => x.v)), max = Math.max(...v.map(x => x.v));
    return max > min;
  });
}

/**
 * @param {Array} samples
 * @param {{dive?:object, hauteur?:number, choix?:string}} options
 * @returns {HTMLElement|null}
 */
export function graphiquePlongee(samples, { dive = {}, hauteur = 210, choix = null } = {}) {
  const pts = pointsValables(samples);
  if (pts.length < 3) return null;
  const analyse = analyserProfil(pts, dive);
  const dispo = seriesDisponibles(pts, analyse);
  let active = choix && dispo.some(s => s.id === choix) ? choix
    : (dispo.find(s => s.id === 'pression') || dispo.find(s => s.id === 'temp') || dispo[0])?.id || null;

  const boutons = el('div.courbe-choix');
  const zone = el('div.courbe-zone');
  const bulle = el('div.courbe-bulle', { hidden: true });
  const wrap = el('div.courbe', {}, dispo.length ? boutons : null, el('div.courbe-cadre', {}, zone, bulle));

  function rendreBoutons() {
    boutons.replaceChildren(...dispo.map(s => el('button.chip', {
      type: 'button', class: s.id === active ? 'on' : null,
      style: { '--serie': s.couleur },
      onclick: () => { active = active === s.id ? null : s.id; rendreBoutons(); dessiner(); },
    }, s.label)));
  }

  let largeur = 0;
  function dessiner() {
    largeur = Math.max(260, Math.round(zone.clientWidth || wrap.clientWidth || 340));
    const W = largeur, H = hauteur;
    const pad = { l: 34, r: active ? 40 : 10, t: 10, b: 22 };
    const w = W - pad.l - pad.r, h = H - pad.t - pad.b;
    const t0 = pts[0].t, t1 = pts.at(-1).t || 1;
    const maxD = Math.max(...pts.map(p => p.d)) || 1;
    const x = t => pad.l + ((t - t0) / ((t1 - t0) || 1)) * w;
    const y = d => pad.t + (d / (maxD * 1.08)) * h;

    const racine = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'courbe-svg' });

    // Grille de profondeur
    for (const d of [0, maxD / 2, maxD]) {
      const yy = y(d).toFixed(1);
      racine.append(svg('line', { x1: pad.l, y1: yy, x2: W - pad.r, y2: yy, class: 'courbe-grille' }),
        svg('text', { x: 4, y: +yy + 4, class: 'courbe-axe' }, document.createTextNode(`${Math.round(d)} m`)));
    }
    // Minutes
    const total = (t1 - t0) / 60;
    const pas = total > 90 ? 20 : total > 40 ? 10 : 5;
    for (let m = pas; m < total; m += pas) {
      const xx = x(t0 + m * 60).toFixed(1);
      racine.append(svg('line', { x1: xx, y1: pad.t, x2: xx, y2: H - pad.b, class: 'courbe-grille fine' }),
        svg('text', { x: xx, y: H - 6, class: 'courbe-axe', 'text-anchor': 'middle' }, document.createTextNode(`${m}′`)));
    }

    const ligne = pts.map(p => `${x(p.t).toFixed(1)},${y(p.d).toFixed(1)}`).join(' ');
    racine.append(
      svg('polygon', { points: `${x(t0)},${pad.t} ${ligne} ${x(t1)},${pad.t}`, class: 'courbe-aire' }),
      svg('polyline', { points: ligne, class: 'courbe-prof' }));

    // La courbe choisie, avec son échelle à droite
    let serie = null, vals = [], vy = null;
    if (active) {
      serie = SERIES.find(s => s.id === active);
      vals = valeursSerie(active, pts, analyse?.conso || []).filter(v => v.v != null);
      if (vals.length >= 2) {
        let lo = Math.min(...vals.map(v => v.v)), hi = Math.max(...vals.map(v => v.v));
        if (active === 'pression') lo = 0;
        if (hi - lo < (active === 'temp' ? 2 : 1)) { const m = (hi + lo) / 2; lo = m - (active === 'temp' ? 1 : 0.5); hi = m + (active === 'temp' ? 1 : 0.5); }
        vy = v => pad.t + (1 - (v - lo) / (hi - lo)) * h;
        // Une rupture (surface, trou) coupe la ligne.
        const morceaux = [];
        let cour = [];
        vals.forEach((v, i) => {
          if (i && v.t - vals[i - 1].t > 120) { morceaux.push(cour); cour = []; }
          cour.push(`${x(v.t).toFixed(1)},${vy(v.v).toFixed(1)}`);
        });
        morceaux.push(cour);
        morceaux.filter(m => m.length > 1).forEach(m =>
          racine.append(svg('polyline', { points: m.join(' '), class: 'courbe-serie', style: `stroke:${serie.couleur}` })));
        for (const v of [hi, lo]) {
          racine.append(svg('text', { x: W - pad.r + 4, y: vy(v) + 4, class: 'courbe-axe', style: `fill:${serie.couleur}` },
            document.createTextNode(`${v.toFixed(serie.dec)}`)));
        }
        racine.append(svg('text', { x: W - 2, y: H - 6, class: 'courbe-axe', 'text-anchor': 'end', style: `fill:${serie.couleur}` },
          document.createTextNode(serie.unite)));
      }
    }

    // Le curseur
    const curseur = svg('line', { x1: 0, y1: pad.t, x2: 0, y2: H - pad.b, class: 'courbe-curseur', visibility: 'hidden' });
    const point = svg('circle', { r: 4, class: 'courbe-point', visibility: 'hidden' });
    const pointSerie = svg('circle', { r: 4, visibility: 'hidden', style: serie ? `fill:${serie.couleur}` : null });
    racine.append(curseur, point, pointSerie);

    const montrer = ev => {
      const r = racine.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (W / r.width);
      const t = t0 + Math.min(1, Math.max(0, (px - pad.l) / w)) * (t1 - t0);
      let p = pts[0];
      for (const q of pts) { if (Math.abs(q.t - t) < Math.abs(p.t - t)) p = q; }
      const xx = x(p.t);
      curseur.setAttribute('x1', xx); curseur.setAttribute('x2', xx); curseur.setAttribute('visibility', 'visible');
      point.setAttribute('cx', xx); point.setAttribute('cy', y(p.d)); point.setAttribute('visibility', 'visible');
      const sac = (analyse?.conso || []).reduce((m, c) => (!m || Math.abs(c.t - p.t) < Math.abs(m.t - p.t) ? c : m), null);
      const sv = serie && vy ? vals.reduce((m, v) => (!m || Math.abs(v.t - p.t) < Math.abs(m.t - p.t) ? v : m), null) : null;
      if (sv && Math.abs(sv.t - p.t) <= 60) {
        pointSerie.setAttribute('cx', x(sv.t)); pointSerie.setAttribute('cy', vy(sv.v)); pointSerie.setAttribute('visibility', 'visible');
      } else pointSerie.setAttribute('visibility', 'hidden');
      const bouts = [
        el('b', { text: `${fmtMin(p.t - t0)}` }),
        `${p.d.toFixed(1)} m`,
        Number.isFinite(p.temp) ? `${p.temp.toFixed(1)} °C` : null,
        Number.isFinite(p.pression) ? `${Math.round(p.pression)} bar` : null,
        sac && Math.abs(sac.t - p.t) <= 60 && p.d >= SOUS_L_EAU ? `${sac.sac} L/min` : null,
        Number.isFinite(p.fc) && p.fc > 30 && p.d >= SOUS_L_EAU ? `❤ ${p.fc}` : null,
        Number.isFinite(p.sansPalier) && p.sansPalier < 99 && p.d >= SOUS_L_EAU ? `NDL ${p.sansPalier}′` : null,
        p.plafond > 0 ? `plafond ${p.plafond} m` : null,
      ].filter(Boolean);
      bulle.replaceChildren(...bouts.flatMap((b, i) => (i ? [' · ', b] : [b])));
      bulle.hidden = false;
      const gauche = (xx / W) * r.width;
      bulle.style.left = `${Math.min(Math.max(0, gauche - 80), Math.max(0, r.width - 170))}px`;
    };
    const cacher = () => {
      bulle.hidden = true;
      [curseur, point, pointSerie].forEach(n => n.setAttribute('visibility', 'hidden'));
    };
    racine.addEventListener('pointermove', montrer);
    racine.addEventListener('pointerdown', montrer);
    racine.addEventListener('pointerleave', cacher);
    zone.replaceChildren(racine);
  }

  rendreBoutons();
  // Dessiné à la vraie largeur une fois dans la page, et à chaque
  // changement de taille (rotation du téléphone).
  requestAnimationFrame(dessiner);
  if (typeof ResizeObserver !== 'undefined') {
    let avant = 0;
    new ResizeObserver(() => {
      const l = Math.round(zone.clientWidth);
      if (l && Math.abs(l - avant) > 8) { avant = l; dessiner(); }
    }).observe(zone);
  }
  dessiner();
  return wrap;
}

// ------------------------------------------------------------
//  Tuiles
// ------------------------------------------------------------

const tuile = (valeur, legende, { alerte = false, titre = '' } = {}) => (valeur == null || valeur === '' ? null
  : el('div.tuile', { class: alerte ? 'alerte' : null, title: titre || null },
    el('div.tuile-val', { text: valeur }), el('div.tuile-lbl', { text: legende })));

/**
 * Les chiffres de la plongée, tirés du profil quand il existe, sinon de
 * la fiche. Rien à saisir.
 */
export function tuilesPlongee(dive, analyse = analyserProfil(dive?.samples || dive?.profil, dive)) {
  const a = analyse || {};
  const duree = dive.dureeMin || (a.dureeS ? Math.round(a.dureeS / 60) : null);
  const t = a.temp;
  const bloc = a.bloc || ((dive.pressionDepart && dive.pressionFin) ? { debut: dive.pressionDepart, fin: dive.pressionFin } : null);
  const gaz = dive.gazType === 'nitrox' && dive.gazO2 ? `Nitrox ${dive.gazO2}`
    : dive.gazType === 'trimix' ? `Trimix ${dive.gazO2 || '?'}/${dive.gazHe || '?'}` : null;
  const tuiles = [
    tuile(duree ? `${duree} min` : null, 'au fond'),
    tuile(dive.profMax ? `${dive.profMax} m` : null, 'prof. max'),
    tuile((dive.profMoy || a.profMoy) ? `${dive.profMoy || a.profMoy} m` : null, 'prof. moyenne'),
    tuile(t ? (t.max - t.min >= 1 ? `${Math.round(t.min)}–${Math.round(t.max)} °C` : `${Math.round(t.moy)} °C`)
      : dive.tempFond != null ? `${dive.tempFond} °C` : null,
      t?.thermocline ? `eau · thermocline ${t.thermocline} m` : 'eau'),
    tuile(bloc ? `${bloc.debut} → ${bloc.fin}` : null, dive.blocLitres ? `bar · bloc ${dive.blocLitres} L` : 'bar',
      { alerte: bloc && bloc.fin < 50, titre: bloc && bloc.fin < 50 ? 'Sortie sous 50 bar' : '' }),
    tuile(a.bloc?.sac ? `${a.bloc.sac} L/min` : null, 'conso (surface)'),
    tuile(a.bloc?.litres ? `${a.bloc.litres} L` : null, 'd’air respiré'),
    tuile(a.bloc?.a50 != null ? `${a.bloc.a50}′` : null, 'réserve 50 bar'),
    tuile(a.remontee?.max ? `${a.remontee.max} m/min` : null,
      a.remontee?.rapides ? `remontée max · ${a.remontee.rapides} trop vite` : 'remontée max',
      { alerte: a.remontee?.max > 12, titre: 'Au-delà de 10 à 12 m/min, la montre alerte' }),
    tuile(a.deco ? `${a.tempsDecoMin || 1} min` : a.palierSecuMin ? `${a.palierSecuMin} min` : null,
      a.deco ? `décompression (plafond ${a.plafondMax} m)` : 'palier de sécurité', { alerte: !!a.deco }),
    tuile(a.ndlMin != null && !a.deco ? `${a.ndlMin} min` : null, 'sans palier (mini)'),
    tuile(a.fc ? `${a.fc.moy} / ${a.fc.max}` : null, 'cœur moy. / max'),
    tuile(gaz, dive.suunto?.gf ? `GF ${dive.suunto.gf}` : 'gaz'),
  ].filter(Boolean);
  return tuiles.length ? el('div.tuiles', {}, ...tuiles) : null;
}
