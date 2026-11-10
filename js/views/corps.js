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
import { bilanCorps, conseils, zonesDuCorps, prochainePlongee, risques, LIMITES_O2 } from '../corps.js';

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
const niveauAzote = v => (v >= 50 ? 'rouge' : v >= 20 ? 'orange' : 'vert');
const niveauCns = v => (v >= LIMITES_O2.cnsPrudence ? 'rouge' : v >= 40 ? 'orange' : 'vert');
const niveauOtu = m => { const r = Math.max(m.otu24 / LIMITES_O2.otu24, m.otu7 / LIMITES_O2.otu7); return r >= 0.85 ? 'rouge' : r >= 0.5 ? 'orange' : 'vert'; };
const pire = (...n) => (n.includes('rouge') ? 'rouge' : n.includes('orange') ? 'orange' : 'vert');
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
  const etat = {
    tete: pire(niveauAzote(z('sang').charge), niveauCns(m.cns)),
    poumons: niveauOtu(m),
    muscles: niveauAzote(z('muscles').charge),
    graisses: niveauAzote(z('graisses').charge),
    articulations: niveauAzote(z('articulations').charge),
  };
  return { m, zones, etat, verdict: conseils(b), suite: prochainePlongee(b) };
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
  const sous20 = h => (h > 0 ? `OK à ${quand(b.fin + h * 36e5)}` : 'OK');

  // 1. Le bonhomme et ses zones
  const zones = el('div.corps-zones', {},
    ...[['tete', 'Tête', `sang & cerveau · azote ${Math.round(L.zones[0].charge)} % · CNS ${Math.round(m.cns)} %`],
      ['poumons', 'Poumons', `oxygène · ${Math.round(m.otu24)} OTU sur 24 h`],
      ['muscles', 'Muscles', `azote ${Math.round(L.zones[1].charge)} % · ${sous20(L.zones[1].heuresSous20)}`],
      ['graisses', 'Peau & graisses', `azote ${Math.round(L.zones[2].charge)} % · ${sous20(L.zones[2].heuresSous20)}`],
      ['articulations', 'Articulations & os', `azote ${Math.round(L.zones[3].charge)} % · ${sous20(L.zones[3].heuresSous20)}`]]
      .map(([k, nom, txt]) => el('div.corps-zone', {}, pastille(L.etat[k]), el('div', {}, el('b', { text: nom }), el('span', { text: txt })))));

  // 2. Relevé · limite · conseil
  const ligne = (niv, quoi, releve, limite, conseil) => el('tr', {}, el('td', {}, pastille(niv), el('b', { text: quoi })),
    el('td', { text: releve }), el('td', { text: limite }), el('td', { text: conseil }));
  const azoteNiv = niveauAzote(m.sat);
  const tableau = el('table.corps-table', {},
    el('thead', {}, el('tr', {}, ...['', 'Relevé', 'Limite', 'Conseil'].map(t => el('th', { text: t })))),
    el('tbody', {},
      ligne(azoteNiv, 'Azote', `${Math.round(m.sat)} %`, '100 % · prudence 85',
        m.sat >= 20 ? `Sous 20 % à ${quand(n.aPartirDe)}` : m.sat >= 5 ? `Désaturé à ${quand(b.fin + m.desatH * 36e5)}` : 'Désaturé'),
      ligne(niveauCns(m.cns), 'CNS · cerveau', `${Math.round(m.cns)} %`, `100 % · prudence ${LIMITES_O2.cnsPrudence}`,
        m.cns >= 40 ? 'Évite le nitrox riche pour la prochaine' : 'RAS · se divise par 2 toutes les 90 min'),
      ligne(niveauOtu(m), 'OTU · poumons', `${Math.round(m.otu24)}/24 h · ${Math.round(m.otu7)}/7 j`,
        `${LIMITES_O2.otu24}/24 h · ${LIMITES_O2.otu7}/7 j`,
        niveauOtu(m) === 'vert' ? 'RAS' : 'Moins de nitrox, plongées moins longues')));

  // 2 bis. Vers quoi je vais : chaque effet, jusqu'à son seuil
  const versQuoi = el('div.card', {},
    el('div.corps-bloc-titre', { text: '🧭 Vers quoi je vais' }),
    ...risques(b).map(r => el('div.corps-risque', {},
      el('div.corps-risque-tete', {}, el(`span.corps-pt.${r.niveau}`), el('b', { text: r.nom }),
        el('span.corps-risque-pct', { text: `${Math.round(r.pct)} % du seuil` })),
      el('div.corps-jauge', {}, el(`span.${r.niveau}`, { style: { width: `${Math.min(100, r.pct)}%` } })),
      el('div.corps-risque-txt', { text: `${r.releve} · seuil : ${r.seuil}` }),
      el('div.corps-risque-effet', { text: r.effet }))));

  // 3. La prochaine plongée
  const prochaine = el('div.corps-bloc', {},
    el('div.corps-bloc-titre', { text: '🤿 Prochaine plongée' }),
    el('div', { text: n.reposConseille ? `Demain plutôt : journée de repos conseillée (${b.rythme.sur24h} plongées en 24 h, ${b.rythme.joursDAffilee} jour(s) d’affilée).`
      : n.attenteH > 0 ? `À partir de ${quand(n.aPartirDe)} (azote sous 20 %).` : 'Possible dès maintenant.' }),
    el('div.corps-ndl', {}, ...n.ndl.map(x => el('span.chip', { text: `${x.prof} m : ${x.min >= 120 ? '> 2 h' : `${x.min} min`}` }))),
    el('div.hint', { style: { margin: '4px 0 0' }, text: `Sans palier, ${n.fo2 > 0.215 ? `au nitrox ${Math.round(n.fo2 * 100)}` : 'à l’air'}, à cette heure-là — palier de sécurité de 3 min à 3-5 m en plus.` }));

  // 4. Les conseils
  const avion = m.avion?.attente > 0 ? `✈️ Ni avion ni altitude avant ${quand(m.avion.jusqua)}.` : null;
  const charge = m.sat >= 20 || b.rythme.sur24h >= 2;
  const conseilsListe = [
    ...L.verdict.points.filter(p => p.niveau !== 'info' && p.niveau !== 'ok').map(p => `⚠️ ${p.texte}`),
    charge ? '💧 Bois de l’eau (1,5 à 2 L dans la journée) : un plongeur déshydraté élimine moins bien l’azote.' : null,
    charge ? '😴 Repose-toi : pas d’effort, d’apnée ni de sauna dans les 3 h après la plongée.' : null,
    avion,
    !charge && !avion ? '✅ Rien à signaler : bonne plongée !' : null,
  ].filter(Boolean);
  const conseilsBloc = el('div.corps-bloc', {}, el('div.corps-bloc-titre', { text: '💡 Conseils' }),
    el('ul.corps-conseils', {}, ...conseilsListe.map(t => el('li', { text: t }))));

  // 5. Le détail, replié
  const zoom = el('div.corps-zoom');
  const montrerZoom = h => {
    zoom.replaceChildren(
      el('div.corps-zoom-boutons', {}, ...[[168, '7 jours'], [72, '3 jours'], [24, '24 h']].map(([hh, txt]) =>
        el(`button.chip${hh === h ? '.on' : ''}`, { type: 'button', text: txt, onclick: () => montrerZoom(hh) }))),
      courbe(b, { debut: b.fin - h * 36e5 }));
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
    el('div.card.corps-haut', {}, bonhomme(L.etat), zones),
    el('div.card', {}, tableau),
    versQuoi,
    el('div.corps-deux', {}, el('div.card', {}, prochaine), el('div.card', {}, conseilsBloc)),
    el('details.card.corps-plie', {}, el('summary', { text: '📈 La charge en azote sur 7 jours, avec ses limites' }), zoom),
    b.plongees.length ? el('details.card.corps-plie', {}, el('summary', { text: `🤿 Mes plongées des 7 jours (${b.plongees.length})` }), ...liste) : null,
    el('div.hint', { text: 'Estimation pour comprendre et anticiper (Bühlmann ZHL-16C sur les courbes de tes plongées, CNS : tables NOAA, OTU : REPEX, avion : DAN). Ton ordinateur fait foi.' }));
  return { title: 'Mon corps · azote & oxygène', node, back: true };
}
