// ============================================================
//  Historique des visites de mon carnet partagé
//
//  Qui est entré (prénom donné, et si c'est un de mes plongeurs), quand,
//  avec quelle plongée faite ensemble, et ce qu'il a regardé ensuite.
//  Les tentatives refusées sont là aussi.
// ============================================================

import { el, openModal, nomAffiche, toast, confirmBox } from '../lib.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { regrouperVisites, identifier, supprimerVisites, clePersonne } from '../visites.js';

const quand = iso => new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const duree = (a, b) => {
  const m = Math.round((Date.parse(b) - Date.parse(a)) / 60000);
  return m >= 1 ? ` · ${m} min` : '';
};

/** Les visites, prêtes à afficher (identifiées). */
export async function visitesDuCarnet() {
  const reglages = await store.getSettings();
  const diverId = await store.getActiveDiverId();
  const [buddies, dives] = await Promise.all([store.listBuddies(), diverId ? store.listDives(diverId) : []]);
  const sessions = regrouperVisites(reglages.visites || []);
  return sessions.map(v => ({ ...v, qui: identifier(v, buddies, dives), dive: dives.find(d => d.id === v.plongeeId) || null }));
}

/** Le nombre de visites pas encore vues (pour le 👀 de la barre du haut). */
export async function visitesNonVues() {
  const reglages = await store.getSettings();
  const depuis = reglages.visitesVuesLe || '';
  return regrouperVisites(reglages.visites || []).filter(v => v.at > depuis && !v.sansEntree).length;
}

function carteVisite(v, { supprimer = null } = {}) {
  const nom = v.qui ? nomAffiche(v.qui.buddy) : null;
  return el(`div.card.visite${v.ok ? '' : '.refusee'}`, {},
    el('div.visite-tete', {},
      el('span.visite-ico', { text: v.ok ? (v.retour ? '↩️' : '👀') : '🚫' }),
      el('div', {},
        el('b', { text: v.prenom || 'Quelqu’un' }),
        nom ? el('span.visite-qui', { text: ` · ${v.qui.sur ? '✓' : '≈'} ${nom}${v.qui.sur ? ' (dans cette plongée)' : ''}` })
          : el('span.visite-qui.inconnu', { text: v.ok ? ' · pas dans tes plongeurs' : '' }),
        el('div.hint', { style: { margin: 0 }, text: `${quand(v.at)}${duree(v.at, v.fin)}${v.retour ? ' · revenu' : ''}` })),
      nom ? el('button.btn.sm.ghost', { type: 'button', text: 'Fiche', onclick: () => navigate(`buddy/${v.qui.buddy.id}`) }) : null,
      supprimer ? el('button.btn.sm.ghost.visite-suppr', { type: 'button', title: 'Supprimer cette visite', 'aria-label': 'Supprimer cette visite', text: '🗑',
        onclick: () => supprimer([v.id], 'cette visite') }) : null),
    v.sansEntree ? null : el('div.visite-ligne', {},
      v.ok ? '🔑 Entré avec : ' : '✗ Refusé avec : ',
      el('b', { text: [v.lieu?.replace(' (retour)', ''), v.date?.split('-').reverse().join('/')].filter(Boolean).join(', ') }),
      v.dive ? el('button.lien-texte', { type: 'button', text: ` → ta plongée n°${v.dive.numero ?? '?'} ${v.dive.lieuNom || ''}`,
        onclick: () => navigate(`dive/${v.dive.id}`) }) : null),
    v.rates?.length ? el('div.visite-ligne.hint', { style: { margin: 0 } },
      `après ${v.rates.length} essai${v.rates.length > 1 ? 's' : ''} raté${v.rates.length > 1 ? 's' : ''} : ${v.rates.join(' ; ')}`) : null,
    v.pages?.length ? el('div.visite-ligne', {}, '🧭 A regardé : ', el('span', { text: v.pages.join(' › ') })) : null);
}

/** Supprime des visites (avec confirmation) ; elles ne reviendront pas à la relecture. */
async function supprimerAvecConfirmation(ids, quoi) {
  if (!(await confirmBox(`Supprimer ${quoi} de l’historique ? Elle ne reviendra pas à la prochaine relecture.`, 'Supprimer'))) return false;
  const r = await store.getSettings();
  const { restants, supprimes } = supprimerVisites(r.visites || [], ids);
  await store.saveSettings({ visites: restants, visitesSupprimees: [...(r.visitesSupprimees || []), ...supprimes].slice(-5000) });
  document.dispatchEvent(new CustomEvent('pj-visites-vues'));
  toast(ids.length > 1 ? `${ids.length} visites supprimées` : 'Visite supprimée');
  return true;
}

/** Les visites rangées par personne : la plus récente d'abord. */
function parPersonne(visites) {
  const groupes = new Map();
  for (const v of visites) {
    const k = clePersonne(v);
    if (!groupes.has(k)) groupes.set(k, { cle: k, visites: [] });
    groupes.get(k).visites.push(v);
  }
  return [...groupes.values()].sort((a, b) => String(b.visites[0].at).localeCompare(String(a.visites[0].at)));
}

export async function visitesView() {
  const wrap = el('div');
  const reglages = await store.getSettings();
  const vuesLe = reglages.visitesVuesLe || '';
  const ouverts = new Set();      // les personnes dépliées (gardé d'un affichage à l'autre)
  let premier = true;
  const liste = el('div');
  const rendre = async () => {
    const visites = await visitesDuCarnet();
    const entrees = visites.filter(v => v.ok && !v.sansEntree);
    const groupes = parPersonne(visites);
    // Au premier affichage : on déplie ceux qui ont du nouveau
    if (premier) { groupes.filter(g => g.visites.some(v => v.at > vuesLe && !v.sansEntree)).forEach(g => ouverts.add(g.cle)); premier = false; }
    const supprimer = async (ids, quoi) => { if (await supprimerAvecConfirmation(ids, quoi)) await rendre(); };
    liste.replaceChildren(
      el('div.hint', { style: { marginTop: 0 }, text: visites.length
        ? `${entrees.length} visite${entrees.length > 1 ? 's' : ''}, ${groupes.length} personne${groupes.length > 1 ? 's' : ''}`
          + `${visites.length > entrees.length ? ` · ${visites.length - entrees.length} refus ou suite` : ''}. Touche une personne pour voir ses visites.`
        : 'Personne n’est encore entré dans ton carnet partagé.' }),
      ...groupes.map(g => {
        const v0 = g.visites[0];
        const nom = v0.qui ? nomAffiche(v0.qui.buddy) : (v0.prenom || 'Quelqu’un');
        const n = g.visites.filter(v => v.ok && !v.sansEntree).length;
        const refus = g.visites.filter(v => !v.ok).length;
        const neuf = g.visites.some(v => v.at > vuesLe && !v.sansEntree);
        const det = el('details.visites-personne', { open: ouverts.has(g.cle) },
          el('summary', {},
            el('span.vp-ico', { text: v0.qui ? '🤿' : (n ? '👤' : '🚫') }),
            el('span.vp-txt', {},
              el('b', { text: nom }), neuf ? el('span.vp-neuf', { text: 'nouveau' }) : null,
              el('span.hint', { style: { margin: 0, display: 'block' }, text: [
                n ? `${n} visite${n > 1 ? 's' : ''}` : null, refus ? `${refus} refus` : null, `dernière : ${quand(v0.at)}`,
              ].filter(Boolean).join(' · ') })),
            el('button.btn.sm.ghost.visite-suppr', { type: 'button', title: 'Supprimer toutes ses visites', 'aria-label': 'Supprimer toutes ses visites', text: '🗑',
              onclick: e => { e.preventDefault(); e.stopPropagation(); supprimer(g.visites.map(v => v.id), `les ${g.visites.length} visite(s) de ${nom}`); } })),
          el('div.vp-liste', {}, ...g.visites.map(v => carteVisite(v, { supprimer }))));
        det.addEventListener('toggle', () => { if (det.open) ouverts.add(g.cle); else ouverts.delete(g.cle); });
        return det;
      }));
  };
  wrap.append(
    reglages.partage?.canal ? null : el('div.card.alerte', {}, 'Ton lien de partage n’a pas encore de suivi des visites : Réglages → Partager mon carnet → « ↻ Mettre à jour ».'),
    reglages.partage?.canal && !reglages.partage?.feuille
      ? el('div.card.alerte', {}, 'Les visites de plus de 12 heures sont perdues si l’appli n’a pas été ouverte entre-temps. ',
        el('button.lien-texte', { type: 'button', text: '📒 Brancher une feuille Google pour tout garder', onclick: () => navigate('reglages') }))
      : null,
    el('div.btn-row', {},
      el('button.btn.sm', { type: 'button', text: '↻ Relire les visites', onclick: async e => {
        e.currentTarget.disabled = true;
        try { const { relireLesVisites } = await import('../entretien.js'); await relireLesVisites(); } catch { /* hors ligne */ }
        e.currentTarget.disabled = false;
        await rendre();
      } }),
      el('button.btn.sm', { type: 'button', text: '📱 QR code', onclick: async () => (await import('./qr-partage.js')).ouvrirQrPartage() }),
      el('button.btn.sm.ghost', { type: 'button', text: '🔗 Mon lien de partage', onclick: () => navigate('reglages') })),
    liste);
  await rendre();
  // Vu : le 👀 de la barre du haut repart de zéro.
  await store.saveSettings({ visitesVuesLe: new Date().toISOString() });
  document.dispatchEvent(new CustomEvent('pj-visites-vues'));
  return { title: 'Historique des visites', node: wrap, back: true };
}

/** Le pop-up : « nouvelle visite », qui, quand, ce qu'il a regardé. */
export async function popupNouvellesVisites(ids) {
  const toutes = await visitesDuCarnet();
  const nouvelles = toutes.filter(v => ids.has(v.id) && !v.sansEntree);
  if (!nouvelles.length) return;
  openModal(close => el('div', {},
    el('h3', { text: nouvelles.length > 1 ? `👀 ${nouvelles.length} nouvelles visites de ton carnet` : '👀 Nouvelle visite de ton carnet' }),
    el('div.visites-popup', {}, ...nouvelles.slice(0, 5).map(carteVisite)),
    el('div.btn-row', {},
      el('button.btn.ghost', { type: 'button', text: 'Fermer', onclick: close }),
      el('button.btn.primary', { type: 'button', text: 'Historique des visites', onclick: () => { close(); navigate('visites'); } }))));
}
