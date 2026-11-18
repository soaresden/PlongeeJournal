// ============================================================
//  L'assistant des vidéos, dans les deux sens :
//   - Vidéos → plongée : chaque fichier, son dossier, le jour et
//     l'heure lus dans son nom, la plongée que l'appli PROPOSE (et
//     pourquoi) ; on valide, on refuse, ou on en choisit une autre ;
//   - Plongées → vidéos : chaque plongée, ses vidéos, ou rien
//     (pas de caméra en enseignement, c'est normal).
//  Rien n'est assigné sans qu'on l'ait validé.
// ============================================================

import { el, fmtDate } from '../lib.js';
import { proposer, videosDePlongee } from '../videos.js';
import { typeSeance } from '../store.js';

const hhmm = m => (m == null ? '' : `${String(Math.floor(m / 60) % 24).padStart(2, '0')}h${String(m % 60).padStart(2, '0')}`);
const lire = (k, def) => { try { return localStorage.getItem(k) || def; } catch { return def; } };
const garder = (k, v) => { try { localStorage.setItem(k, v); } catch { /* privé */ } };

/** « n°212 · Five Rocks 07:11 » */
export const nomSortie = d => (d.seance
  ? `${typeSeance(d.type).icone} ${typeSeance(d.type).label}${d.lieu ? ` · ${d.lieu}` : ''}${d.heure ? ` ${d.heure}` : ''}`
  : `n°${d.numero ?? '?'} · ${d.lieuNom || d.site || '—'}${d.heureImmersion ? ` ${d.heureImmersion}` : ''}`);

const RAISONS = {
  dossier: () => '📁 rangée dans le dossier de cette plongée',
  pendant: p => `⏱ filmée pendant la plongée${p.partie ? ` (drop ${p.partie})` : ''}`,
  avant: p => `⏱ ${p.ecart} min avant la mise à l’eau${p.partie ? ` (drop ${p.partie})` : ''}`,
  apres: p => `⏱ ${p.ecart} min après la sortie${p.partie ? ` (drop ${p.partie})` : ''}`,
  decalage: p => `⏱ à 1 h près (caméra ${p.decalage > 0 ? 'en retard' : 'en avance'} d’1 h ?)${p.partie ? ` · drop ${p.partie}` : ''}`,
  jour: () => '📅 pas d’heure, mais seule plongée du jour',
  hors: () => 'aucune plongée à cette heure-là',
  plusieurs: () => 'pas d’heure, plusieurs plongées ce jour-là',
  aucune: () => 'rien dans le carnet ce jour-là',
};
export const raisonTexte = p => (RAISONS[p.raison] || (() => ''))(p);

/**
 * Pour chaque fichier : sa proposition, son état (validé, refusé, à
 * valider) et la sortie qui le montre aujourd'hui.
 */
export function etatsFichiers({ plats, dossiers, toutes, autres, aff }) {
  // Qui montre quoi aujourd'hui (rapprochement par dossiers + assignations).
  const montre = new Map();
  for (const d of toutes) {
    const v = videosDePlongee(d, dossiers, toutes, { autres, affectations: aff, fichiers: plats });
    for (const f of v?.fichiers || []) {
      const k = String(f.fileid);
      if (!montre.has(k)) montre.set(k, []);
      montre.get(k).push(d);
    }
  }
  return plats.map(f => {
    const k = String(f.fileid);
    const p = proposer(f, toutes);
    const a = k in aff ? aff[k] : undefined;
    const valide = a === undefined ? null : a === '' ? { aucune: true } : { dive: toutes.find(d => String(d.id) === String(a)) || null };
    return { f, p, valide, sur: montre.get(k) || [],
      statut: valide ? (valide.aucune ? 'refusee' : 'validee') : p.dive ? 'proposee' : 'seule' };
  });
}

/** L'onglet « Vidéos → plongée ». */
export function ongletVideosPlongee(ctx) {
  const { cfg, toutes, lecture, choisirSorties, sauverAff, rendreTout } = ctx;
  const etats = etatsFichiers(ctx);
  let filtre = lire('plongee-journal:videos-filtre', 'a-valider');
  let photos = lire('plongee-journal:videos-photos', '') === '1';
  const zone = el('div.va');

  const compter = statut => etats.filter(e => (photos || e.f.video) && (statut === 'tout' || groupe(e) === statut)).length;
  const groupe = e => (e.statut === 'proposee' ? 'a-valider' : e.statut === 'seule' ? 'sans' : e.statut === 'validee' ? 'validees' : 'refusees');

  const assigner = async (rows, valeur) => {
    const patch = {};
    for (const e of rows) patch[e.f.fileid] = valeur(e);
    await sauverAff(patch);
    rendreTout();
  };

  const rendre = () => {
    const visibles = etats.filter(e => (photos || e.f.video) && (filtre === 'tout' || groupe(e) === filtre))
      .sort((a, b) => (b.f.date || '').localeCompare(a.f.date || '') || (b.f.min ?? -1) - (a.f.min ?? -1) || a.f.nom.localeCompare(b.f.nom));
    const sures = visibles.filter(e => e.statut === 'proposee' && ['forte', 'bonne'].includes(e.p.confiance));
    const chips = [['a-valider', '🧭 À valider'], ['sans', '❔ Sans plongée'], ['validees', '✓ Validées'], ['refusees', '✗ Aucune plongée'], ['tout', 'Toutes']]
      .map(([id, t]) => el(`button.chip${filtre === id ? '.solid' : ''}`, { type: 'button', text: `${t} (${compter(id)})`,
        onclick: () => { filtre = id; garder('plongee-journal:videos-filtre', id); rendre(); } }));
    const ligne = e => {
      const { f, p } = e;
      const choix = el('select.va-autre', { title: 'Une autre plongée' },
        el('option', { value: '', text: 'Autre…' }),
        ...p.jour.filter(d => d !== p.dive).map(d => el('option', { value: d.id, text: nomSortie(d) })),
        el('option', { value: '*', text: '🔎 Chercher dans le carnet…' }));
      choix.onchange = () => {
        const v = choix.value;
        if (v === '*') { choix.value = ''; choisirSorties(f, c => c[0] && assigner([e], () => String(c[0].id))); return; }
        if (v) assigner([e], () => v);
      };
      let cellAssign;
      if (lecture) cellAssign = el('td', { text: e.valide ? (e.valide.aucune ? '—' : nomSortie(e.valide.dive || {})) : '' });
      else if (e.valide) {
        cellAssign = el('td.va-ok', {},
          el('span', { text: e.valide.aucune ? '✗ aucune plongée' : `✓ ${e.valide.dive ? nomSortie(e.valide.dive) : 'plongée supprimée'}` }),
          el('button.btn.sm.ghost', { type: 'button', text: '↺', title: 'Annuler : revenir à la proposition', onclick: () => assigner([e], () => null) }));
      } else {
        cellAssign = el('td.va-boutons', {},
          p.dive ? el('button.btn.sm.primary', { type: 'button', text: '✓', title: `Valider : ${nomSortie(p.dive)}`, onclick: () => assigner([e], () => String(p.dive.id)) }) : null,
          el('button.btn.sm.ghost', { type: 'button', text: '✗', title: 'Aucune plongée (snorkeling, bateau, test…)', onclick: () => assigner([e], () => '') }),
          choix);
      }
      const ailleurs = e.sur.filter(d => d !== (e.valide?.dive || p.dive));
      return el(`tr.va-${e.statut}.va-${p.confiance || 'rien'}`, {},
        el('td.va-dossier', { text: f.dossier || '(racine)', title: f.dossier || 'À la racine du lien' }),
        el('td.va-fichier', {},
          el('button.lien-texte', { type: 'button', text: `${f.video ? '🎬' : '🖼'} ${f.nom}`, title: 'Voir', onclick: () => ctx.lireFichier(f) })),
        el('td.va-quand', {},
          el('b', { text: f.date ? fmtDate(f.date) : '?' }), f.min != null ? ` ${hhmm(f.min)}` : '',
          el('small', { text: f.source === 'nom' ? 'lu dans le nom' : f.source === 'nom-jour' ? 'jour lu dans le nom' : f.source === 'dossier' ? 'jour du dossier' : 'introuvable' })),
        el('td.va-candidate', {},
          p.dive ? el('b', { text: nomSortie(p.dive) }) : el('span.hint', { style: { margin: 0 }, text: '—' }),
          el('small', { text: raisonTexte(p) }),
          ailleurs.length ? el('small.va-sur', { text: `aujourd’hui sur ${ailleurs.map(nomSortie).join(', ')}` }) : null),
        cellAssign);
    };
    zone.replaceChildren(
      el('div.va-barre', {},
        el('div.chips', {}, ...chips,
          el('label.chip', {}, el('input', { type: 'checkbox', checked: photos, onchange: ev => { photos = ev.target.checked; garder('plongee-journal:videos-photos', photos ? '1' : ''); rendre(); } }), ' Photos aussi')),
        !lecture && sures.length ? el('button.btn.sm.primary', { type: 'button', text: `✓ Valider les ${sures.length} propositions sûres`,
          title: 'Dossier de la plongée, ou heure pendant / juste autour de la plongée', onclick: () => assigner(sures, e => String(e.p.dive.id)) }) : null),
      visibles.length ? el('div.va-table.va-cartes', {}, el('table', {},
        el('thead', {}, el('tr', {}, ...['Dossier', 'Fichier', 'Jour et heure', 'Plongée proposée', 'Assignation'].map(t => el('th', { text: t })))),
        el('tbody', {}, ...visibles.map(ligne))))
        : el('div.hint', { text: filtre === 'a-valider' ? 'Plus rien à valider 👌' : 'Rien ici.' }));
  };
  rendre();
  return zone;
}

/** L'onglet « Plongées → vidéos ». */
export function ongletPlongeesVideos(ctx) {
  const { dives, dossiers, toutes, autres, aff, plats, navigate } = ctx;
  const etats = etatsFichiers(ctx);
  const enAttente = new Map();
  for (const e of etats) if (e.statut === 'proposee') {
    const k = String(e.p.dive.id);
    enAttente.set(k, (enAttente.get(k) || 0) + 1);
  }
  let filtre = lire('plongee-journal:plongees-videos-filtre', 'tout');
  const annees = [...new Set(dives.map(d => (d.date || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  let annee = lire('plongee-journal:plongees-videos-annee', annees[0] || '');
  if (annee && !annees.includes(annee)) annee = annees[0] || '';
  const lignes = dives.filter(d => d.date).map(d => {
    const v = videosDePlongee(d, dossiers, toutes, { autres, affectations: aff, fichiers: plats });
    const fs = v?.fichiers || [];
    return { d, v: fs.filter(f => f.video).length, p: fs.filter(f => !f.video).length, att: enAttente.get(String(d.id)) || 0 };
  }).sort((a, b) => (b.d.date + (b.d.heureImmersion || '')).localeCompare(a.d.date + (a.d.heureImmersion || '')));
  const zone = el('div.va');
  const rendre = () => {
    const dansAnnee = lignes.filter(l => !annee || l.d.date.startsWith(annee));
    const groupe = l => (l.att ? 'attente' : l.v + l.p ? 'avec' : 'sans');
    const visibles = dansAnnee.filter(l => filtre === 'tout' || groupe(l) === filtre);
    const n = id => dansAnnee.filter(l => id === 'tout' || groupe(l) === id).length;
    zone.replaceChildren(
      el('div.va-barre', {},
        el('div.chips', {},
          ...[['tout', 'Toutes'], ['avec', '🎬 Avec vidéos'], ['sans', '🚫 Sans vidéo'], ['attente', '🧭 Propositions à valider']].map(([id, t]) =>
            el(`button.chip${filtre === id ? '.solid' : ''}`, { type: 'button', text: `${t} (${n(id)})`,
              onclick: () => { filtre = id; garder('plongee-journal:plongees-videos-filtre', id); rendre(); } }))),
        el('div.chips', {}, ...['', ...annees].map(a => el(`button.chip${annee === a ? '.solid' : ''}`, { type: 'button', text: a || 'Toutes années',
          onclick: () => { annee = a; garder('plongee-journal:plongees-videos-annee', a); rendre(); } })))),
      visibles.length ? el('div.va-table', {}, el('table', {},
        el('thead', {}, el('tr', {}, ...['Date', 'Plongée', 'Type', 'Vidéos', 'Photos', 'À valider'].map(t => el('th', { text: t })))),
        el('tbody', {}, ...visibles.map(l => el(`tr.clickable${l.v + l.p ? '' : '.va-vide'}`, { onclick: () => navigate(`dive/${l.d.id}`) },
          el('td.va-quand', { text: `${fmtDate(l.d.date)}${l.d.heureImmersion ? ` ${l.d.heureImmersion}` : ''}` }),
          el('td', { text: nomSortie(l.d).replace(/ \d\d:\d\d$/, '') }),
          el('td', { text: [l.d.type, ...(l.d.objectifs || [])].filter(Boolean).slice(0, 2).join(' · ') }),
          el('td.num', { text: l.v || '—' }),
          el('td.num', { text: l.p || '—' }),
          el('td.num', {}, l.att ? el('button.btn.sm', { type: 'button', text: `🧭 ${l.att}`, onclick: ev => { ev.stopPropagation(); ctx.allerVers('videos'); } }) : '—'))))))
        : el('div.hint', { text: 'Rien ici.' }));
  };
  rendre();
  return zone;
}
