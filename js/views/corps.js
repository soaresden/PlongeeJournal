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
import { bilanCorps, conseils, zonesDuCorps, prochainePlongee, risques, niveauDe } from '../corps.js';

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

// Les couleurs d'état (vert / orange / rouge)
// (une seule échelle partout : vert < 50 %, orange 50-85 %, rouge ≥ 85 % du seuil — voir niveauDe)
const COUL = { vert: '#22c55e', orange: '#f59e0b', rouge: '#ef4444' };
const quand = ms => {
  const d = new Date(ms), auj = new Date();
  const j = d.toDateString() === auj.toDateString() ? '' : `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })} `;
  return `${j}${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};

/** Le bonhomme plongeur : chaque zone colorée selon son état. */
function bonhomme(etat, { taille = 130 } = {}) {
  const c = k => COUL[etat[k]];
  const svg = s('svg', { viewBox: '0 0 120 230', width: taille, height: taille * 230 / 120, class: 'corps-bonhomme', role: 'img', 'aria-label': 'Mon corps par zones' });
  svg.append(
    s('rect', { x: 43, y: 50, width: 34, height: 74, rx: 10, fill: '#6b7280' }),                       // le bloc, derrière
    // jambes et bras : les muscles
    s('rect', { x: 41, y: 128, width: 16, height: 62, rx: 7, fill: c('muscles') }),
    s('rect', { x: 63, y: 128, width: 16, height: 62, rx: 7, fill: c('muscles') }),
    s('rect', { x: 19, y: 58, width: 13, height: 60, rx: 6, fill: c('muscles'), transform: 'rotate(8 25 58)' }),
    s('rect', { x: 88, y: 58, width: 13, height: 60, rx: 6, fill: c('muscles'), transform: 'rotate(-8 95 58)' }),
    // les palmes
    s('path', { d: 'M38 188 L60 188 L64 222 L30 222 Z', fill: 'var(--text-mute)' }),
    s('path', { d: 'M60 188 L82 188 L90 222 L56 222 Z', fill: 'var(--text-mute)' }),
    // le tronc : poumons (OTU), ventre et hanches (graisses)
    s('rect', { x: 34, y: 52, width: 52, height: 46, rx: 14, fill: c('poumons') }),
    s('rect', { x: 37, y: 96, width: 46, height: 34, rx: 12, fill: c('graisses') }),
    // les articulations : épaules, coudes, genoux
    ...[[33, 58], [87, 58], [26, 92], [94, 92], [49, 160], [71, 160]].map(([cx, cy]) => s('circle', { cx, cy, r: 6.5, fill: c('articulations'), stroke: 'var(--surface)', 'stroke-width': 2 })),
    // la tête : sang & cerveau, et le masque
    s('circle', { cx: 60, cy: 28, r: 20, fill: c('tete') }),
    s('rect', { x: 46, y: 20, width: 28, height: 12, rx: 5, fill: '#bfe7ff', stroke: '#1f2937', 'stroke-width': 2 }),
    s('path', { d: 'M66 38 q10 2 12 10', fill: 'none', stroke: '#1f2937', 'stroke-width': 3, 'stroke-linecap': 'round' }));
  return svg;
}

/** L'état de chaque zone, et le verdict. */
function lecture(b) {
  const m = b.maintenant, zones = zonesDuCorps(b), z = id => zones.find(x => x.id === id);
  const rq = risques(b), r = id => rq.find(x => x.id === id);
  const pct = {
    tete: Math.max(z('sang').charge, r('paul-bert').pct),
    poumons: r('lorrain-smith').pct,
    muscles: z('muscles').charge,
    graisses: z('graisses').charge,
    articulations: z('articulations').charge,
  };
  const etat = Object.fromEntries(Object.entries(pct).map(([k, v]) => [k, niveauDe(v)]));
  return { m, zones, rq, pct, etat, verdict: conseils(b), suite: prochainePlongee(b) };
}

/** Le verdict, sur une ligne. */
function verdict(L) {
  return el(`div.corps-verdict.${L.verdict.niveau}`, {}, el('b', { text: L.verdict.titre }),
    L.verdict.points[0] ? el('span', { text: L.verdict.points[0].texte }) : null);
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

/** La carte de l'onglet Stats : le verdict et le bonhomme ; un toucher ouvre l'écran. */
export async function carteCorps() {
  const b = await bilan();
  const L = lecture(b);
  return el('button.card.corps-carte', { type: 'button', onclick: () => navigate('corps') },
    el('div.corps-carte-tete', {}, el('b', { text: '🫁 Mon corps · 7 jours' }), el('span.hint', { style: { margin: 0 }, text: 'détail ›' })),
    el('div.corps-carte-corps', {}, bonhomme(L.etat, { taille: 54 }), verdict(L)));
}

export async function corpsView() {
  const b = await bilan();
  const L = lecture(b), m = L.m, n = L.suite;
  const pastille = niv => el(`span.corps-pt.${niv}`);
  const jauge = pct => el('span.corps-jauge.mini', {}, el(`span.${niveauDe(pct)}`, { style: { width: `${Math.min(100, pct)}%` } }));
  const legende = el('div.corps-legende', {},
    el('span', {}, pastille('vert'), 'moins de 50 %'), el('span', {}, pastille('orange'), '50 à 85 %'), el('span', {}, pastille('rouge'), '85 % et plus'),
    el('span.hint', { style: { margin: 0 }, text: 'du seuil' }));

  // 1. Le bonhomme et ses zones (mêmes couleurs que partout)
  const zones = el('div.corps-zones', {},
    ...[['tete', 'Tête', 'sang & cerveau'], ['poumons', 'Poumons', 'oxygène (OTU)'], ['muscles', 'Muscles', 'azote'],
      ['graisses', 'Peau & graisses', 'azote'], ['articulations', 'Articulations & os', 'azote, tissus lents']]
      .map(([k, nom, quoi]) => el('div.corps-zone', {}, pastille(L.etat[k]),
        el('div', { style: { flex: 1, minWidth: 0 } }, el('b', { text: `${nom} · ${Math.round(L.pct[k])} %` }), el('span', { text: quoi }), jauge(L.pct[k])))));

  // 2. Où j'en suis : un effet par ligne — relevé, limite, jauge
  const tableau = el('div.card', {},
    el('div.corps-bloc-titre', { text: '🧭 Où j’en suis, et vers quoi je vais' }),
    ...L.rq.map(r => el('div.corps-risque', {},
      el('div.corps-risque-tete', {}, pastille(r.niveau), el('b', { text: r.nom }), el('span.corps-risque-pct', { text: `${Math.round(r.pct)} %` })),
      jauge(r.pct),
      el('div.corps-risque-txt', {}, el('span', { text: `Relevé : ${r.releve}` }), el('span', { text: `Limite : ${r.seuil}` })),
      el('div.corps-risque-effet', { text: r.effet }))));

  // 3. Ta prochaine plongée : quand, et combien de temps au fond
  const h = x => (x >= 1 ? `${Math.round(x)} h` : `${Math.max(1, Math.round(x * 60))} min`);
  const quandPlonger = n.reposConseille
    ? { titre: `Pas avant demain, ${new Date(n.aPartirDe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`, pourquoi: `${b.rythme.sur24h} plongées en 24 h, ${b.rythme.joursDAffilee} jour(s) d’affilée : une journée de repos.` }
    : n.attenteH > 0
      ? { titre: `À partir de ${quand(n.aPartirDe)}`, pourquoi: `dans ${h(n.attenteH)}, quand ton azote sera repassé sous 20 %.` }
      : { titre: 'Possible maintenant', pourquoi: 'ton azote est sous 20 %.' };
  const heurePlongee = n.reposConseille || n.attenteH > 0 ? `à ${quand(n.aPartirDe)}` : 'maintenant';
  const prochaine = el('div.card.corps-prochaine', {},
    el('div.corps-bloc-titre', { text: '🤿 Ta prochaine plongée' }),
    el('div.corps-quand', { text: quandPlonger.titre }),
    el('div.hint', { style: { margin: '0 0 8px' }, text: quandPlonger.pourquoi }),
    el('table.corps-table', {},
      el('thead', {}, el('tr', {}, el('th', { text: 'Profondeur' }), el('th', { text: `Temps max au fond sans palier (${heurePlongee})` }))),
      el('tbody', {}, ...n.ndl.map(x => el('tr', {}, el('td', {}, el('b', { text: `${x.prof} m` })),
        el('td', { text: x.min >= 120 ? 'plus de 2 h (le bloc s’arrêtera avant)' : `${x.min} min` }))))),
    el('div.hint', { style: { margin: '6px 0 0' }, text: `${n.fo2 > 0.215 ? `Au nitrox ${Math.round(n.fo2 * 100)}` : 'À l’air'} (ton dernier mélange), en gardant une marge (85 % de la limite). Palier de sécurité en plus.` }));

  // 4. Les recommandations, en trois temps
  const recentH = b.plongees.length ? (b.fin - b.plongees[b.plongees.length - 1].fin) / 36e5 : Infinity;
  const mod14 = n.fo2 > 0.215 ? Math.floor((1.4 / n.fo2 - 1) * 10) : null;
  const alertes = L.verdict.points.filter(p => p.niveau === 'attention' || p.niveau === 'stop').map(p => p.texte)
    .filter(t => !/plongées en 24 h|azote en réserve|très chargés/.test(t));     // déjà dit plus haut
  const temps = [
    ['🕐 Maintenant', [
      recentH < 6 ? '😴 Repos : pas d’effort, d’apnée, de sauna ni de bain chaud dans les 3 h après la plongée.' : null,
      recentH < 24 ? '💧 Bois 1,5 à 2 L d’eau dans la journée (pas d’alcool) : l’azote s’élimine mieux.' : null,
      m.avion?.attente > 0 ? `✈️ Ni avion ni altitude (col, montagne) avant ${quand(m.avion.jusqua)}.` : null,
      '🆘 Douleur, fourmillements, fatigue anormale ? Oxygène et secours (112) : c’est peut-être un accident de décompression.',
    ]],
    ['🗓 Avant de replonger', [
      n.reposConseille ? '🛑 Une journée sans plonger : tes tissus lents en ont besoin.' : n.attenteH > 0 ? `⏳ Attends ${quand(n.aPartirDe)}.` : null,
      'La plus profonde en premier, puis de moins en moins profond ; au moins 2 h de surface entre deux plongées.',
      ...alertes,
    ]],
    ['🌊 Pendant la plongée', [
      'Reste sous les temps du tableau, avec 5 min de marge.',
      'Remontée à 10-15 m/min, palier de sécurité de 3 à 5 min à 3-5 m.',
      mod14 ? `Au nitrox ${Math.round(n.fo2 * 100)} : pas plus bas que ${mod14} m (PpO2 1,4 bar).` : 'À l’air, au-delà de 30 m : attention à la narcose.',
    ]],
  ];
  const recos = el('div.card', {}, el('div.corps-bloc-titre', { text: '💡 Recommandations' }),
    ...temps.map(([titre, liste]) => el('div.corps-temps', {}, el('b', { text: titre }),
      el('ul.corps-conseils', {}, ...liste.filter(Boolean).map(t => el('li', { text: t }))))));

  // 5. Le détail, replié
  const zoom = el('div.corps-zoom');
  const montrerZoom = hh => {
    zoom.replaceChildren(
      el('div.corps-zoom-boutons', {}, ...[[168, '7 jours'], [72, '3 jours'], [24, '24 h']].map(([x, txt]) =>
        el(`button.chip${x === hh ? '.on' : ''}`, { type: 'button', text: txt, onclick: () => montrerZoom(x) }))),
      courbe(b, { debut: b.fin - hh * 36e5 }));
  };
  montrerZoom(168);
  const liste = b.plongees.slice().reverse().map(p => el('div.corps-ligne', {},
    el('span.corps-pastille', { style: { background: couleurCharge(p.pic) } }),
    el('div', { style: { flex: 1, minWidth: 0 } },
      el('b', { text: `${fmtDate(p.d.date)} · ${heure(p.debut)}` }), ` ${p.d.lieuNom || ''}`,
      el('div.hint', { style: { margin: 0 }, text: [p.d.profMax ? `${p.d.profMax} m` : null, p.d.dureeMin ? `${p.d.dureeMin} min` : null,
        p.fo2 > 0.215 ? `nitrox ${Math.round(p.fo2 * 100)} %` : 'air', `pic ${Math.round(p.pic)} %`].filter(Boolean).join(' · ') })),
    el('button.btn.sm.ghost', { type: 'button', text: 'Voir', onclick: () => navigate(`dive/${p.d.id}`) })));

  const node = el('div.corps', {},
    verdict(L),
    el('div.card', {}, el('div.corps-haut', {}, bonhomme(L.etat), zones), legende),
    tableau,
    prochaine,
    recos,
    el('details.card.corps-plie', {}, el('summary', { text: '📈 La charge en azote sur 7 jours, avec ses limites' }), zoom),
    b.plongees.length ? el('details.card.corps-plie', {}, el('summary', { text: `🤿 Mes plongées des 7 jours (${b.plongees.length})` }), ...liste) : null,
    el('div.hint', { text: 'Estimation pour comprendre et anticiper (Bühlmann ZHL-16C sur les courbes de tes plongées, CNS : tables NOAA, OTU : REPEX, avion : DAN). Ton ordinateur fait foi.' }));
  return { title: 'Mon corps · azote & oxygène', node, back: true };
}
