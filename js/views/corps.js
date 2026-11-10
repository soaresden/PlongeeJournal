// ============================================================
//  « Azote & oxygène » : où en est mon corps, sur 7 jours glissants
//
//  Les feux (azote, rythme, oxygène, avion), la courbe de charge en azote
//  avec ses limites et les plongées en dessous, les 16 compartiments
//  maintenant, et la liste des plongées. Calculs : js/corps.js.
// ============================================================

import { el, fmtDate } from '../lib.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { bilanCorps, feux, conseils, ZHL16C, saturation } from '../corps.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...enfants) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  enfants.forEach(e => e != null && n.append(e));
  return n;
};
const couleurCharge = v => (v >= 85 ? 'var(--danger)' : v >= 50 ? 'var(--warn)' : 'var(--ok)');
const heure = ms => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

async function bilan() {
  const diverId = await store.getActiveDiverId();
  const dives = diverId ? await store.listDives(diverId) : [];
  return bilanCorps(dives);
}

/** L'assistant : le verdict et ses raisons. */
function assistant(b, { compact = false } = {}) {
  const a = conseils(b);
  const ico = { stop: '⛔', attention: '⚠️', ok: '✅', info: '✈️' };
  return el(`div.corps-assistant.${a.niveau}${compact ? '.compact' : ''}`, {},
    el('div.corps-verdict', { text: a.titre }),
    compact
      ? el('div.corps-raison', { text: a.points[0]?.texte || '' })
      : el('ul.corps-raisons', {}, ...a.points.map(p => el(`li.${p.niveau}`, {}, el('span', { text: ico[p.niveau] || '•' }), el('span', { text: p.texte })))));
}

/** Les quatre feux. */
function rangeeFeux(b, { compact = false } = {}) {
  return el(`div.corps-feux${compact ? '.compact' : ''}`, {}, ...feux(b).map(f => el(`div.corps-feu.${f.couleur}`, {},
    el('span.corps-lampe'),
    el('span.corps-feu-txt', {}, el('b', { text: f.titre }), compact ? null : el('span', { text: f.texte })))));
}

/** La courbe : charge en azote (compartiment le plus chargé) sur 7 jours, limites, plongées. */
function courbe(b, { hauteur = 300, mini = false, debut = b.debut } = {}) {
  const W = 700, H = hauteur, haut = mini ? 6 : 22, bas = mini ? H - 6 : H - 92, gauche = mini ? 4 : 46, droite = W - 6;
  const x = t => gauche + (t - debut) / (b.fin - debut) * (droite - gauche);
  const court = b.fin - debut <= 36 * 36e5;
  const y = v => bas - Math.min(110, v) / 110 * (bas - haut);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'corps-courbe', role: 'img', 'aria-label': 'Charge en azote sur 7 jours' });
  // Les jours
  if (!mini) {
    // Une ligne par jour (ou toutes les 6 h sur une courte période)
    const pas = court ? 6 * 36e5 : 864e5;
    const d0 = new Date(debut); if (court) d0.setMinutes(0, 0, 0); else d0.setHours(24, 0, 0, 0);
    let t0 = d0.getTime(); if (court) while (new Date(t0).getHours() % 6) t0 += 36e5;
    for (let t = t0; t < b.fin; t += pas) {
      svg.append(s('line', { x1: x(t), x2: x(t), y1: haut, y2: H - 4, class: 'corps-jour' }),
        s('text', { x: x(t) + 4, y: H - 6, class: 'corps-lbl' }, court
          ? new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
          : new Date(t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })));
    }
    // Les limites
    for (const [v, cls, txt] of [[100, 'corps-limite', 'limite 100 %'], [85, 'corps-prudence', 'prudence 85 %'], [50, 'corps-repere', '50 %']]) {
      svg.append(s('line', { x1: gauche, x2: droite, y1: y(v), y2: y(v), class: cls }),
        s('text', { x: gauche - 6, y: y(v) + 6, class: 'corps-lbl', 'text-anchor': 'end' }, String(v)));
      if (v !== 50) svg.append(s('text', { x: gauche + 6, y: y(v) - 5, class: `corps-lbl ${cls}-txt` }, txt));
    }
  }
  // La charge : au plus haut par colonne de pixels (un pic ne se perd pas)
  const colonnes = new Map();
  for (const p of b.serie) {
    if (p.t < debut) continue;
    const c = Math.round(x(p.t));
    if (!colonnes.has(c) || colonnes.get(c) < p.sat) colonnes.set(c, p.sat);
  }
  const pts = [...colonnes.entries()].sort((a, c) => a[0] - c[0]);
  if (pts.length) {
    const ligne = pts.map(([cx, v], i) => `${i ? 'L' : 'M'}${cx},${y(v).toFixed(1)}`).join('');
    svg.append(s('path', { d: `${ligne}L${pts[pts.length - 1][0]},${bas}L${pts[0][0]},${bas}Z`, class: 'corps-aire' }),
      s('path', { d: ligne, class: 'corps-ligne' }));
  }
  // Les plongées, en dessous : une barre par plongée (sa profondeur max)
  if (!mini) {
    const pmax = Math.max(30, ...b.plongees.map(p => +p.d.profMax || 0));
    for (const p of b.plongees.filter(q => q.fin >= debut)) {
      const h = (+p.d.profMax || 10) / pmax * 52, x0 = Math.max(gauche, x(p.debut)), x1 = Math.max(x0 + 4, x(p.fin));
      const r = s('rect', { x: x0, y: bas + 8, width: x1 - x0, height: h, rx: 2, class: 'corps-plongee', fill: couleurCharge(p.pic) });
      r.append(s('title', {}, `${fmtDate(p.d.date)} ${heure(p.debut)} · ${p.d.lieuNom || ''} · ${p.d.profMax || '?'} m · pic ${Math.round(p.pic)} %`));
      svg.append(r);
    }
    svg.append(s('text', { x: gauche - 6, y: bas + 28, class: 'corps-lbl', 'text-anchor': 'end' }, '🤿'));
  }
  return svg;
}

/** Les 16 compartiments maintenant, chacun avec sa limite. */
function compartiments(b) {
  const W = 700, H = 210, haut = 26, bas = 160, l = (W - 44) / 16;
  const y = v => bas - Math.min(110, v) / 110 * (bas - haut);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'corps-comp', role: 'img', 'aria-label': 'Les 16 compartiments maintenant' });
  svg.append(s('line', { x1: 40, x2: W - 6, y1: y(100), y2: y(100), class: 'corps-limite' }),
    s('text', { x: 36, y: y(100) + 6, class: 'corps-lbl', 'text-anchor': 'end' }, '100'));
  b.maintenant.T.forEach((Ti, i) => {
    const v = saturation(Ti, i), x0 = 42 + i * l;
    svg.append(s('rect', { x: x0, y: haut, width: l - 6, height: bas - haut, rx: 3, class: 'corps-case' }),
      s('rect', { x: x0, y: y(v), width: l - 6, height: Math.max(1, bas - y(v)), rx: 3, fill: couleurCharge(v) }),
      s('text', { x: x0 + (l - 6) / 2, y: y(v) - 4, class: 'corps-lbl', 'text-anchor': 'middle' }, v >= 1 ? `${Math.round(v)}` : ''),
      s('text', { x: x0 + (l - 6) / 2, y: H - 26, class: 'corps-lbl petit', 'text-anchor': 'middle' }, `${ZHL16C[i][0]}′`));
  });
  svg.append(s('text', { x: W / 2, y: H - 3, class: 'corps-lbl', 'text-anchor': 'middle' }, 'tissus rapides ← période (min) → tissus lents'));
  return svg;
}

/** La carte de l'onglet Stats : les feux et la courbe en petit ; un toucher ouvre l'écran. */
export async function carteCorps() {
  const b = await bilan();
  return el('button.card.corps-carte', { type: 'button', onclick: () => navigate('corps') },
    el('div.corps-carte-tete', {}, el('b', { text: '🫁 Azote & oxygène' }), el('span.hint', { style: { margin: 0 }, text: '7 jours · voir le détail ›' })),
    assistant(b, { compact: true }),
    rangeeFeux(b, { compact: true }),
    b.plongees.length ? courbe(b, { hauteur: 70, mini: true }) : el('div.hint', { style: { margin: '6px 0 0' }, text: 'Aucune plongée ces 7 derniers jours : tout est au vert.' }));
}

export async function corpsView() {
  const b = await bilan();
  const m = b.maintenant;
  const liste = b.plongees.slice().reverse().map(p => el('div.corps-ligne', {},
    el('span.corps-pastille', { style: { background: couleurCharge(p.pic) } }),
    el('div', { style: { flex: 1, minWidth: 0 } },
      el('b', { text: `${fmtDate(p.d.date)} · ${heure(p.debut)}` }), ` ${p.d.lieuNom || ''}`,
      el('div.hint', { style: { margin: 0 }, text: [
        p.d.profMax ? `${p.d.profMax} m` : null, p.d.dureeMin ? `${p.d.dureeMin} min` : null,
        p.fo2 > 0.215 ? `nitrox ${Math.round(p.fo2 * 100)} %` : 'air',
        `pic ${Math.round(p.pic)} %`, p.deco ? 'paliers obligatoires' : null, p.estime ? 'profil estimé (pas de courbe)' : null,
      ].filter(Boolean).join(' · ') })),
    el('button.btn.sm.ghost', { type: 'button', text: 'Voir', onclick: () => navigate(`dive/${p.d.id}`) })));
  // Le zoom : 7 jours, 3 jours, 24 h
  const zoom = el('div.corps-zoom');
  const montrerZoom = h => {
    zoom.replaceChildren(
      el('div.corps-zoom-boutons', {}, ...[[168, '7 jours'], [72, '3 jours'], [24, '24 h']].map(([hh, txt]) =>
        el(`button.chip${hh === h ? '.on' : ''}`, { type: 'button', text: txt, onclick: () => montrerZoom(hh) }))),
      courbe(b, { debut: b.fin - h * 36e5 }));
  };
  montrerZoom(168);
  const node = el('div.corps', {},
    assistant(b),
    rangeeFeux(b),
    el('div.card', {},
      el('h3.corps-titre', { text: 'Charge en azote · 7 derniers jours' }),
      el('div.hint', { style: { marginTop: 0 }, text: 'Le tissu le plus chargé, en % de sa marge : 0 % = revenu à l’équilibre, 100 % = à la limite. En dessous, tes plongées (couleur : le pic atteint).' }),
      zoom),
    el('div.card', {},
      el('h3.corps-titre', { text: `Mes 16 compartiments maintenant${m.sat >= 5 ? ` · désaturation dans ~${m.desatH >= 1 ? `${Math.round(m.desatH)} h` : `${Math.round(m.desatH * 60)} min`}` : ' · désaturé'}` }),
      compartiments(b)),
    el('div.card', {},
      el('h3.corps-titre', { text: 'Oxygène' }),
      el('div.corps-chiffres', {},
        el('div', {}, el('b', { text: `${Math.round(m.cns)} %` }), el('span', { text: 'CNS maintenant (s’efface de moitié toutes les 90 min)' })),
        el('div', {}, el('b', { text: `${Math.round(m.otu24)}` }), el('span', { text: 'OTU sur 24 h' })),
        el('div', {}, el('b', { text: `${Math.round(m.otu7)}` }), el('span', { text: 'OTU sur 7 jours' })))),
    b.plongees.length ? el('div.card', {}, el('h3.corps-titre', { text: `Mes plongées des 7 derniers jours (${b.plongees.length})` }), ...liste) : null,
    el('div.hint', { text: 'Estimation pour comprendre et anticiper : modèle Bühlmann ZHL-16C sur les courbes de tes plongées (air ou nitrox), '
      + 'CNS (tables NOAA) et OTU ; avion selon les recommandations DAN (12 h, 18 h après des plongées successives, 24 h après des paliers obligatoires). '
      + 'Ton ordinateur de plongée fait foi.' }));
  return { title: 'Azote & oxygène', node, back: true };
}
