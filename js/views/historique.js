// ============================================================
//  L'historique à l'écran : les anciennes versions, et « Restaurer ».
// ============================================================

import { el, toast, openModal, confirmBox, fmtDate } from '../lib.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { versions, tout, aRestaurer, differences } from '../historique.js';

const quand = iso => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const titre = e => {
  const x = e.donnees;
  if (e.type === 'seance') return `Séance · ${fmtDate(x.date)}${x.lieu ? ` · ${x.lieu}` : ''}`;
  return `${x.numero != null ? `n°${x.numero} · ` : ''}${fmtDate(x.date)}${x.lieuNom ? ` · ${x.lieuNom}` : ''}`;
};

async function actuelle(e) {
  return e.type === 'seance' ? store.getSeance(e.id) : store.getDive(e.id);
}

async function restaurer(e, apres) {
  const a = await actuelle(e);
  const version = aRestaurer(e, a);
  const quoi = a ? `Remettre la fiche comme le ${quand(e.at)} ? La version d’aujourd’hui reste dans l’historique.`
    : 'Remettre cette fiche supprimée dans le carnet ?';
  if (!(await confirmBox(quoi, 'Restaurer'))) return;
  try {
    if (e.type === 'seance') await store.saveSeance(version); else await store.saveDive(version);
    toast(a ? 'Version restaurée' : 'Fiche remise dans le carnet');
    apres?.(version);
  } catch (err) { toast(err.message, true); }
}

function ligne(e, actuel, apres) {
  const changes = actuel ? differences(e.donnees, actuel) : [];
  return el('div.histo-ligne', {},
    el('div', {},
      el('b', { text: e.quoi === 'suppression' ? `🗑 Supprimée le ${quand(e.at)}` : `Avant le ${quand(e.at)}` }),
      el('div.hint', { style: { margin: 0 }, text: e.quoi === 'suppression' ? titre(e)
        : changes.length ? `Différent d’aujourd’hui : ${changes.join(', ')}` : 'Identique à aujourd’hui' })),
    el('button.btn.sm', { type: 'button', text: e.quoi === 'suppression' ? '↺ Remettre' : '↺ Restaurer',
      onclick: () => restaurer(e, apres) }));
}

/** L'historique d'une fiche (plongée ou séance). */
export async function ouvrirHistoriqueFiche(id, { apres = null } = {}) {
  const liste = versions(id);
  const a = liste.length ? await actuelle(liste[0]) : null;
  openModal(close => el('div', {},
    el('h3', { text: '🕘 Historique de la fiche' }),
    el('div.hint', { style: { marginTop: 0 }, text: 'Chaque série de modifications garde la version d’avant. Gardé sur cet appareil.' }),
    liste.length ? el('div.histo-liste', {}, ...liste.map(e => ligne(e, a, v => { close(); apres?.(v); })))
      : el('div.hint', { text: 'Aucune ancienne version pour l’instant.' }),
    el('div.btn-row', {}, el('button.btn.primary', { type: 'button', text: 'Fermer', onclick: close }))));
}

/** Tout l'historique du carnet (Réglages) : modifications et suppressions. */
export async function ouvrirHistoriqueCarnet() {
  const liste = tout().slice(0, 120);
  const actuelles = new Map();
  for (const e of liste) if (!actuelles.has(e.id)) actuelles.set(e.id, await actuelle(e));
  openModal(close => el('div', {},
    el('h3', { text: '🕘 Historique des changements' }),
    el('div.hint', { style: { marginTop: 0 }, text: 'Les dernières modifications et suppressions, sur cet appareil. Une fiche supprimée se remet d’un geste.' }),
    liste.length ? el('div.histo-liste', {}, ...liste.map(e => el('div', {},
      el('div.histo-fiche', {}, el('button.lien-texte', { type: 'button', text: titre(e), onclick: () => {
        if (!actuelles.get(e.id)) return;
        close(); navigate(e.type === 'seance' ? `seance/${e.id}` : `dive/${e.id}`);
      } })),
      ligne(e, actuelles.get(e.id), () => { close(); }))))
      : el('div.hint', { text: 'Rien pour l’instant.' }),
    el('div.btn-row', {}, el('button.btn.primary', { type: 'button', text: 'Fermer', onclick: close }))));
}
