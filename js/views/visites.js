// ============================================================
//  Historique des visites de mon carnet partagé
//
//  Qui est entré (prénom donné, et si c'est un de mes plongeurs), quand,
//  avec quelle plongée faite ensemble, et ce qu'il a regardé ensuite.
//  Les tentatives refusées sont là aussi.
// ============================================================

import { el, openModal, nomAffiche } from '../lib.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { regrouperVisites, identifier } from '../visites.js';

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

function carteVisite(v) {
  const nom = v.qui ? nomAffiche(v.qui.buddy) : null;
  return el(`div.card.visite${v.ok ? '' : '.refusee'}`, {},
    el('div.visite-tete', {},
      el('span.visite-ico', { text: v.ok ? (v.retour ? '↩️' : '👀') : '🚫' }),
      el('div', {},
        el('b', { text: v.prenom || 'Quelqu’un' }),
        nom ? el('span.visite-qui', { text: ` · ${v.qui.sur ? '✓' : '≈'} ${nom}${v.qui.sur ? ' (dans cette plongée)' : ''}` })
          : el('span.visite-qui.inconnu', { text: v.ok ? ' · pas dans tes plongeurs' : '' }),
        el('div.hint', { style: { margin: 0 }, text: `${quand(v.at)}${duree(v.at, v.fin)}${v.retour ? ' · revenu' : ''}` })),
      nom ? el('button.btn.sm.ghost', { type: 'button', text: 'Fiche', onclick: () => navigate(`buddy/${v.qui.buddy.id}`) }) : null),
    v.sansEntree ? null : el('div.visite-ligne', {},
      v.ok ? '🔑 Entré avec : ' : '✗ Refusé avec : ',
      el('b', { text: [v.lieu?.replace(' (retour)', ''), v.date?.split('-').reverse().join('/')].filter(Boolean).join(', ') }),
      v.dive ? el('button.lien-texte', { type: 'button', text: ` → ta plongée n°${v.dive.numero ?? '?'} ${v.dive.lieuNom || ''}`,
        onclick: () => navigate(`dive/${v.dive.id}`) }) : null),
    v.rates?.length ? el('div.visite-ligne.hint', { style: { margin: 0 } },
      `après ${v.rates.length} essai${v.rates.length > 1 ? 's' : ''} raté${v.rates.length > 1 ? 's' : ''} : ${v.rates.join(' ; ')}`) : null,
    v.pages?.length ? el('div.visite-ligne', {}, '🧭 A regardé : ', el('span', { text: v.pages.join(' › ') })) : null);
}

export async function visitesView() {
  const wrap = el('div');
  const reglages = await store.getSettings();
  const liste = el('div');
  const rendre = async () => {
    const visites = await visitesDuCarnet();
    const entrees = visites.filter(v => v.ok && !v.sansEntree);
    const personnes = new Set(entrees.map(v => (v.qui ? v.qui.buddy.id : v.prenom?.toLowerCase())));
    liste.replaceChildren(
      el('div.hint', { style: { marginTop: 0 }, text: visites.length
        ? `${entrees.length} visite${entrees.length > 1 ? 's' : ''}, ${personnes.size} personne${personnes.size > 1 ? 's' : ''}`
          + `${visites.length > entrees.length ? ` · ${visites.length - entrees.length} refus ou suite` : ''}.`
        : 'Personne n’est encore entré dans ton carnet partagé.' }),
      ...visites.map(carteVisite));
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
