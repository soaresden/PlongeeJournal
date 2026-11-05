// ============================================================
//  Statistiques du carnet
//
//  Un tableau de bord. Tout ce qui se compte se touche : une tuile, une
//  barre, une année ouvre sur le bord de l'écran la liste des plongées
//  en question — un filtre, en somme.
// ============================================================

import { el, fmtDuration, fmtDate, fullName } from '../lib.js';
import { store, TYPES_SEANCE, statsSeances, sortDives } from '../store.js';
import { navigate } from '../router.js';
import { apercuListe, apercuSeance } from '../apercu.js';
import { statsApnee } from '../seances.js';
import { ambianceDe, AMBIANCES } from '../ambiance.js';
import { niveauDeLaPlongee } from '../apercu.js';
import { rangNiveau } from '../config.js';

const TRANCHES = [
  ['0 – 12 m', 0, 12], ['12 – 20 m', 12, 20], ['20 – 30 m', 20, 30],
  ['30 – 40 m', 30, 40], ['40 m et plus', 40, Infinity],
];

export async function statsView() {
  const diverId = await store.getActiveDiverId();
  if (!diverId) {
    return { title: 'Statistiques',
      node: el('div.empty', {}, el('span.big', { text: '📊' }), 'Crée d’abord un profil.') };
  }

  const st = await store.stats(diverId);
  const dives = sortDives(await store.listDives(diverId));
  const seances = await store.listSeances(diverId);
  const certifs = await store.listCertifications(diverId);
  const buddies = await store.listBuddies();

  if (!st.count) {
    return { title: 'Statistiques',
      node: el('div.empty', {}, el('span.big', { text: '📊' }),
        'Pas encore de plongée dans ce carnet.',
        el('div', { style: { marginTop: '18px' } },
          el('button.btn.primary', { onclick: () => navigate('dive/new') }, 'Saisir une plongée'))) };
  }

  /** Ouvre la liste filtrée sur le bord de l'écran. */
  const montrer = (titre, filtre, tri = null) => {
    let liste = dives.filter(filtre);
    if (tri) liste = liste.slice().sort(tri);
    apercuListe(titre, liste);
  };

  // ---------- Tuiles ----------
  const tuile = (n, l, onclick) => onclick
    ? el('button.tuile', { type: 'button', onclick, title: 'Voir les plongées' }, el('div.n', { text: String(n) }), el('div.l', { text: l }))
    : el('div.tuile', {}, el('div.n', { text: String(n) }), el('div.l', { text: l }));

  const parProf = (a, b) => (Number(b.profMax) || 0) - (Number(a.profMax) || 0);
  const parDuree = (a, b) => (Number(b.dureeMin) || 0) - (Number(a.dureeMin) || 0);
  const nuit = d => (d.type || '').toLowerCase().includes('nuit');

  const tuiles = el('div.tuiles.plein', {},
    tuile(st.count, 'plongées', () => montrer('Toutes les plongées', () => true)),
    tuile(fmtDuration(Math.round(st.totalMin)), 'sous l’eau', () => montrer('Les plus longues', () => true, parDuree)),
    tuile(st.maxDepth ? `${st.maxDepth} m` : '—', 'profondeur max', () => montrer('Les plus profondes', d => d.profMax, parProf)),
    tuile(st.avgDepth ? `${Math.round(st.avgDepth)} m` : '—', 'profondeur moyenne', () => montrer('Par profondeur', d => d.profMax, parProf)),
    tuile(fmtDuration(Math.round(st.avgDuration)), 'durée moyenne', () => montrer('Par durée', d => d.dureeMin, parDuree)),
    tuile(st.nuit, 'de nuit', () => montrer('Plongées de nuit', nuit)),
    tuile(st.salee, 'en mer', () => montrer('En mer', d => d.eau === 'salee')),
    tuile(st.douce, 'en eau douce', () => montrer('En eau douce', d => d.eau === 'douce')),
  );

  // ---------- Barres ----------
  /** entries : [label, n, filtre, {b1,b2}?] */
  const barres = (entries, max = Math.max(1, ...entries.map(e => e[1]))) => el('div.barres', {},
    ...entries.map(([label, n, filtre, couleurs]) => el('button.barre', {
      type: 'button', onclick: () => montrer(label, filtre),
      style: couleurs ? { '--b1': couleurs.c1, '--b2': couleurs.c2 } : null,
    },
      el('span.barre-lbl', { text: label }),
      el('span.barre-piste', {}, el('span', { style: { width: `${Math.max(2, (n / max) * 100)}%` } })),
      el('span.barre-n', { text: String(n) }))));

  const carte = (titre, contenu, { aide = '', classe = '' } = {}) => el(`div.tb-carte${classe}`, {},
    el('div.tb-titre', {}, el('h2', { text: titre }), aide ? el('span.tb-aide', { text: aide }) : null),
    contenu);

  // Années : un histogramme, chaque colonne ouvre son année.
  const annees = Object.entries(st.years).sort((a, b) => a[0].localeCompare(b[0]));
  const maxAn = Math.max(1, ...annees.map(a => a[1]));
  const histo = el('div.histo', {},
    ...annees.map(([an, n]) => el('button.histo-col', {
      type: 'button', title: `${n} plongée${n > 1 ? 's' : ''} en ${an}`,
      onclick: () => montrer(`Plongées de ${an}`, d => (d.date || '').startsWith(an)),
    },
      el('div.histo-barre', { style: { height: `${(n / maxAn) * 100}%` } }, el('b', { text: String(n) })),
      el('span', { text: `’${an.slice(2)}` }))));

  // Niveau : déduit des diplômes, sauf s'il a été saisi sur la plongée.
  const niveauxCompte = {};
  dives.forEach(d => { const n = niveauDeLaPlongee(d, certifs); if (n) niveauxCompte[n] = (niveauxCompte[n] || 0) + 1; });
  const niveaux = Object.entries(niveauxCompte).sort((a, b) => rangNiveau(b[0]) - rangNiveau(a[0]))
    .map(([n, c]) => [n, c, d => niveauDeLaPlongee(d, certifs) === n]);

  // Régions (les ambiances des vignettes)
  const regionsCompte = {};
  dives.forEach(d => { const id = ambianceDe(d).id; regionsCompte[id] = (regionsCompte[id] || 0) + 1; });
  const regions = Object.entries(regionsCompte).sort((a, b) => b[1] - a[1])
    .map(([id, n]) => [AMBIANCES[id].nom, n, d => ambianceDe(d).id === id, AMBIANCES[id]]);

  // Profondeur par tranche
  const tranches = TRANCHES.map(([l, a, b]) => {
    const f = d => { const p = Number(d.profMax) || 0; return p > 0 && p >= a && p < b; };
    return [l, dives.filter(f).length, f];
  }).filter(t => t[1]);

  // Compagnons
  const top = Object.entries(st.buddyCount).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([id, n]) => [fullName(buddies.find(b => b.id === id)) || '?', n, d => (d.buddyIds || []).includes(id)]);

  // Types
  const types = Object.entries(st.byType).sort((a, b) => b[1] - a[1])
    .map(([t, n]) => [t, n, d => d.type === t]);

  // Séances, à part : elles ne sont pas des plongées.
  const ss = statsSeances(seances);
  const seancesBloc = el('div.tuiles', {},
    ...TYPES_SEANCE.map(t => el('button.tuile', { type: 'button', onclick: () => {
      try { localStorage.setItem('plongee-journal:discipline', t.id === 'fosse' ? 'fosses' : 'seances'); } catch { /* privé */ }
      navigate('dives');
    } },
      el('div.n', { text: `${t.icone} ${ss.parType[t.id].total}` }),
      el('div.l', { text: `${t.pluriel} · ${ss.parType[t.id].annee} en ${ss.annee}` }))));

  // Apnée : le temps vraiment passé sous l'eau, d'après les courbes.
  const ap = statsApnee(seances);
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const hms = s => (s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`);
  const apneeBloc = ap.seances || ap.record ? el('div', {},
    el('div.tuiles', {},
      tuile(hms(ap.sousLEauS), 'cumulés vraiment sous l’eau'),
      ap.record ? tuile(mmss(ap.record.s), `record · ${fmtDate(ap.record.seance.date)}`, () => apercuSeance(ap.record.seance.id)) : null,
      ap.profond ? tuile(`${ap.profond.m.toFixed(1)} m`, `plus profond · ${fmtDate(ap.profond.seance.date)}`, () => apercuSeance(ap.profond.seance.id)) : null,
      tuile(ap.immersions, `immersions en ${ap.seances} séance${ap.seances > 1 ? 's' : ''}`)),
    el('div.hint', { style: { marginBottom: 0 },
      text: 'D’après la courbe de la montre, sous 1,2 m, relevée toutes les 10 s : à 10 s près. La statique en surface ne se mesure pas.' }))
    : el('div.hint', { text: 'Aucune séance avec la courbe de la montre pour l’instant.' });

  const tb = el('div.tb', {},
    tuiles,
    carte('Par année', histo, { aide: 'touche une année', classe: '.plein' }),
    niveaux.length ? carte('Par niveau', barres(niveaux), { aide: st.niveau ? `aujourd’hui : ${st.niveau}` : '' }) : null,
    carte('Par région', barres(regions)),
    tranches.length ? carte('Par profondeur', barres(tranches)) : null,
    top.length ? carte('Compagnons', barres(top)) : null,
    types.length ? carte('Par type', barres(types)) : null,
    carte('Apnée', apneeBloc, { aide: 'vraiment sous l’eau', classe: '.plein' }),
    carte('Séances', seancesBloc, { aide: 'fosse, piscine, apnée…', classe: '.plein' }),
  );

  const wrap = el('div', {}, tb,
    st.lastDate ? el('div.hint', { style: { marginTop: '14px' }, text: `Dernière plongée le ${fmtDate(st.lastDate)}.` }) : null);
  return { title: 'Statistiques', node: wrap };
}
