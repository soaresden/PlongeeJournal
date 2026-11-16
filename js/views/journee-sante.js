// ============================================================
//  📈 Ma journée sous l'eau (Stats, rubrique santé)
//
//  Un jour de plongée à la loupe : les courbes de profondeur de
//  toutes les plongées du jour (jusqu'à 4), et en dessous la charge
//  en azote (le tissu le plus chargé) et le %SNC qui montent pendant
//  les plongées et redescendent en surface. Un curseur pour se mettre
//  à une heure précise : profondeur, PpO₂, azote, %SNC, OTU et les
//  16 tissus à cet instant. Calculs : js/corps.js (Bühlmann ZHL-16C,
//  NOAA, OTU) sur les vraies courbes de la montre.
// ============================================================

import { el, fmtDate } from '../lib.js';
import { navigate } from '../router.js';
import { bilanCorps, ZHL16C } from '../corps.js';
import { compartiments } from './corps.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...enfants) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  enfants.forEach(e => e != null && n.append(e));
  return n;
};
const H = 36e5;
const hhmm = ms => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const f1 = x => (Math.round(x * 10) / 10).toLocaleString('fr-FR');
const duree = ms => { const m = Math.round(ms / 6e4); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`; };

/** Les jours avec des plongées (avec une heure d'immersion), du plus récent au plus ancien. */
const joursDe = dives => [...new Set(dives.filter(d => d.date && !d.seance && /^\d\d:\d\d/.test(d.heureImmersion || '')).map(d => d.date))].sort().reverse();

export async function carteJournee(dives, { droite = null } = {}) {
  const jours = joursDe(dives);
  if (!jours.length) return null;
  let jour = jours[0], zoom = null;
  const corps = el('div');
  const titre = el('div.tb-titre', {}, el('h2', { text: '📈 Ma journée sous l’eau' }), el('span.tb-aide', { text: 'choisis un jour, glisse sur l’heure' }));
  const carte = el('div.tb-carte.plein.js-carte', {}, titre, corps);

  const afficher = () => {
    const i = jours.indexOf(jour);
    const nav = el('div.js-nav', {},
      el('button.btn.sm.ghost', { type: 'button', text: '‹', title: 'Jour de plongée précédent', disabled: i >= jours.length - 1, onclick: () => { jour = jours[i + 1]; zoom = null; afficher(); } }),
      el('select.js-jour', { onchange: e => { jour = e.target.value; zoom = null; afficher(); } },
        ...jours.map(j => el('option', { value: j, selected: j === jour, text: `${new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' })} ${fmtDate(j)}` }))),
      el('button.btn.sm.ghost', { type: 'button', text: '›', title: 'Jour de plongée suivant', disabled: i <= 0, onclick: () => { jour = jours[i - 1]; zoom = null; afficher(); } }));

    // Le bilan jusqu'à 3 h après la dernière plongée du jour (les jours d'avant comptent)
    const b0 = bilanCorps(dives, { maintenant: new Date(jour + 'T23:59:00').getTime(), jours: 1 });
    const pl = b0.plongees.filter(p => p.d.date === jour);
    if (!pl.length) { corps.replaceChildren(nav, el('div.hint', { text: 'Pas de courbe pour ce jour.' })); return; }
    const finJour = pl[pl.length - 1].fin + 3 * H;
    const b = bilanCorps(dives, { maintenant: finJour, jours: 1 });
    const plongees = b.plongees.filter(p => p.d.date === jour);
    // La fenêtre : la journée, ou une plongée (zoom) avec un peu d'avant et d'après
    const zp = zoom != null ? plongees[zoom] : null;
    const debut = zp ? zp.debut - 10 * 6e4 : pl[0].debut - 30 * 6e4, fin = zp ? zp.fin + 40 * 6e4 : finJour;
    const serie = b.serie.filter(p => p.t >= debut - 6e4 && p.t <= fin + 6e4);
    const zoomer = el('div.js-zoom', {}, el('span', { text: '🔍' }),
      el('button.chip', { type: 'button', text: 'Journée', class: zoom == null ? 'chip on' : 'chip', onclick: () => { zoom = null; afficher(); } }),
      ...plongees.map((p, k) => el('button.chip', { type: 'button', text: `n°${p.d.numero ?? '—'}`, class: zoom === k ? 'chip on' : 'chip', onclick: () => { zoom = k; afficher(); } })));

    // Le dessin : la profondeur en haut, l'azote et le %SNC en dessous
    // Les proportions suivent la place disponible (grand écran : la courbe prend la hauteur)
    const large = window.matchMedia?.('(min-width: 1000px)').matches;
    const dispoW = Math.max(400, innerWidth - 640), dispoH = Math.max(220, innerHeight - (innerWidth < 1150 ? 470 : 420));
    const W = 720, HT = large ? Math.round(Math.min(620, Math.max(330, W * dispoH / dispoW))) : 330;
    const g = 40, d = W - 8, p1 = [18, Math.round(HT * 0.37)], p2 = [Math.round(HT * 0.44), HT - 34];
    const x = t => g + (t - debut) / (fin - debut) * (d - g);
    const pmax = Math.max(10, ...plongees.map(p => p.prof || +p.d.profMax || 0));
    const yP = z => p1[0] + Math.min(z, pmax) / pmax * (p1[1] - p1[0]);
    const yS = v => p2[1] - Math.min(110, Math.max(0, v)) / 110 * (p2[1] - p2[0]);
    const svg = s('svg', { viewBox: `0 0 ${W} ${HT}`, class: 'js-courbe', role: 'img', 'aria-label': 'Profondeur, azote et %SNC de la journée' });
    // les heures
    const h0 = new Date(debut); h0.setMinutes(0, 0, 0);
    const pas = fin - debut > 10 * H ? 2 * H : fin - debut > 3 * H ? H : 15 * 6e4;
    for (let t = h0.getTime() + pas; t < fin; t += pas) {
      if (t <= debut) continue;
      svg.append(s('line', { x1: x(t), x2: x(t), y1: p1[0], y2: p2[1], class: 'js-heure' }),
        s('text', { x: x(t), y: HT - 14, class: 'js-lbl', 'text-anchor': 'middle' }, hhmm(t)));
    }
    // panneau 1 : profondeur
    svg.append(s('line', { x1: g, x2: d, y1: p1[0], y2: p1[0], class: 'js-surface' }),
      s('text', { x: g - 6, y: p1[0] + 4, class: 'js-lbl', 'text-anchor': 'end' }, '0'),
      s('text', { x: g - 6, y: p1[1] + 4, class: 'js-lbl', 'text-anchor': 'end' }, `${Math.round(pmax)} m`));
    for (const p of plongees) {
      const pts = serie.filter(q => q.t >= p.debut - 6e4 && q.t <= p.fin + 6e4 && q.prof != null);
      if (pts.length < 2) continue;
      const ligne = `M${x(p.debut)},${yP(0)}` + pts.map(q => `L${x(q.t).toFixed(1)},${yP(q.prof).toFixed(1)}`).join('') + `L${x(p.fin)},${yP(0)}`;
      svg.append(s('path', { d: ligne + 'Z', class: 'js-aire-prof' }), s('path', { d: ligne, class: 'js-prof' }));
      const lbl = s('text', { x: (x(p.debut) + x(p.fin)) / 2, y: yP(p.prof || 0) + 14, class: 'js-lbl js-plongee', 'text-anchor': 'middle' }, `n°${p.d.numero ?? '—'} · ${Math.round(p.prof || p.d.profMax || 0)} m`);
      lbl.addEventListener('click', () => navigate(`dive/${p.d.id}`));
      svg.append(lbl);
    }
    // panneau 2 : azote (tissu le plus chargé) et %SNC
    for (const [v, cls] of [[100, 'js-limite'], [85, 'js-prudence'], [50, 'js-repere']]) {
      svg.append(s('line', { x1: g, x2: d, y1: yS(v), y2: yS(v), class: cls }), s('text', { x: g - 6, y: yS(v) + 4, class: 'js-lbl', 'text-anchor': 'end' }, `${v}`));
    }
    svg.append(s('text', { x: g - 6, y: p2[1] + 4, class: 'js-lbl', 'text-anchor': 'end' }, '0'));
    const trace = (cle, cls) => {
      const cols = new Map();
      for (const q of serie) { const c = Math.round(x(q.t)); if (!cols.has(c) || cols.get(c) < q[cle]) cols.set(c, q[cle] || 0); }
      const pts = [...cols.entries()].sort((a, c) => a[0] - c[0]);
      if (pts.length) svg.append(s('path', { d: pts.map(([cx, v], i) => `${i ? 'L' : 'M'}${cx},${yS(v).toFixed(1)}`).join(''), class: cls }));
    };
    trace('sat', 'js-azote');
    trace('cns', 'js-snc');
    svg.append(s('text', { x: d, y: p2[0] - 4, class: 'js-lbl', 'text-anchor': 'end' },
      s('tspan', { class: 'js-leg-azote' }, '━ azote (tissu le plus chargé)'), s('tspan', { dx: 12, class: 'js-leg-snc' }, '━ %SNC')));
    // le curseur
    const curseurL = s('line', { y1: p1[0] - 6, y2: p2[1] + 4, class: 'js-curseur' });
    svg.append(curseurL);

    const lecture = el('div.js-lecture');
    const tissus = el('div.js-tissus');
    const range = el('input.corps-curseur', { type: 'range', min: debut, max: fin, step: 6e4, value: plongees[0].fin });
    const sauts = el('div.corps-timeline-sauts', {},
      ...plongees.filter(p => p.fin >= debut && p.debut <= fin).flatMap(p => [
        el('button.chip', { type: 'button', text: `n°${p.d.numero ?? '—'} · ${hhmm(p.debut)}`, onclick: () => montrerA(p.debut + (p.fin - p.debut) / 2) }),
        el('button.chip', { type: 'button', text: `sortie ${hhmm(p.fin)}`, onclick: () => montrerA(p.fin) })]));

    let attendu = null;
    function montrerA(t) {
      t = Math.max(debut, Math.min(fin, +t));
      range.value = t;
      curseurL.setAttribute('x1', x(t)); curseurL.setAttribute('x2', x(t));
      const bb = bilanCorps(dives, { maintenant: t, jours: 1 });
      const m = bb.maintenant;
      const enCours = plongees.find(p => t >= p.debut && t < p.fin);
      const avant = plongees.filter(p => p.fin <= t).pop();
      let ou;
      if (enCours) {
        const q = serie.filter(z => z.t <= t && z.t >= enCours.debut).pop();
        const z = q?.prof ?? 0, pp = (1 + z / 10) * enCours.fo2;
        ou = [el('b', { text: `🤿 En plongée n°${enCours.d.numero ?? '—'}` }), ` · ${enCours.d.lieuNom || ''} · depuis ${duree(t - enCours.debut)}`,
          el('div.js-chiffres', {}, el('span', {}, el('b', { text: `${f1(z)} m` }), 'profondeur'), el('span', {}, el('b', { text: f1(pp) }), `PpO₂ (${enCours.fo2 > 0.215 ? 'Nx' + Math.round(enCours.fo2 * 100) : 'air'})`))];
      } else if (avant) ou = [el('b', { text: '⛵ En surface' }), ` · depuis ${duree(t - avant.fin)} (sortie de la n°${avant.d.numero ?? '—'} à ${hhmm(avant.fin)})`];
      else ou = [el('b', { text: '⛵ Avant la première plongée' })];
      lecture.replaceChildren(
        el('div.js-instant', {}, el('b', { text: hhmm(t) }), ' · ', ...ou),
        el('div.js-chiffres', {},
          el('span', {}, el('b', { text: `${Math.round(m.sat)} %` }), `azote · tissu ${m.comp != null && ZHL16C[m.comp] ? f1(ZHL16C[m.comp][0]) : '—'}′`),
          el('span', {}, el('b', { text: `${f1(m.cns)} %` }), '%SNC'),
          el('span', {}, el('b', { text: `${Math.round(m.otu24)}` }), 'OTU (24 h glissantes)')));
      tissus.replaceChildren(compartiments(bb));
    }
    range.addEventListener('input', () => {
      if (attendu) return;
      attendu = requestAnimationFrame(() => { attendu = null; montrerA(range.value); });
    });
    svg.addEventListener('click', e => {
      const r = svg.getBoundingClientRect(), xx = (e.clientX - r.left) / r.width * W;
      if (xx >= g) montrerA(debut + (xx - g) / (d - g) * (fin - debut));
    });

    const infos = [lecture,
      el('details.js-details', {}, el('summary', { text: 'Les 16 tissus à cet instant' }), tissus),
      el('div.hint', { text: 'Sur les courbes de ta montre : Bühlmann ZHL-16C pour l’azote (100 % = la limite du tissu le plus chargé), table NOAA pour le %SNC, qui se divise par deux toutes les 90 min en surface. Pour comprendre : ton ordinateur fait foi.' })];
    // Sur grand écran, l'état à l'instant choisi va dans la colonne de droite (pas de défilement)
    if (droite) droite.replaceChildren(el('div.tb-carte.js-etat', {}, el('div.tb-titre', {}, el('h2', { text: '⏱ À cet instant' })), ...infos));
    corps.replaceChildren(nav, zoomer, el('div.js-svg', {}, svg), el('div.corps-timeline-ligne', {}, range), sauts, ...(droite ? [] : infos));
    montrerA(zp ? zp.debut + (zp.fin - zp.debut) / 2 : plongees[0].debut + (plongees[0].fin - plongees[0].debut) / 2);
  };
  afficher();
  return carte;
}
