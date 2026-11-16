// ============================================================
//  Des onglets plutôt qu'une longue page à faire défiler
//  (Stats, Réglages…). L'onglet choisi est retenu.
// ============================================================

import { el } from './lib.js';

/**
 * @param {string} cle  où retenir l'onglet choisi
 * @param {{id:string, titre:string, contenu:(Node|null|Array<Node|null>)}[]} liste
 * @returns {HTMLElement}
 */
export function onglets(cle, liste) {
  const tous = liste.filter(o => o && (Array.isArray(o.contenu) ? o.contenu.some(Boolean) : o.contenu));
  let actif = null;
  try { actif = localStorage.getItem(`plongee-journal:onglet:${cle}`); } catch { /* privé */ }
  if (!tous.some(o => o.id === actif)) actif = tous[0]?.id;
  const barre = el('div.onglets', { role: 'tablist' });
  const corps = el('div.onglets-corps');
  const panneaux = new Map(tous.map(o => [o.id, el('div.onglet-panneau', { role: 'tabpanel' }, ...[].concat(o.contenu).filter(Boolean))]));
  const montrer = id => {
    actif = id;
    try { localStorage.setItem(`plongee-journal:onglet:${cle}`, id); } catch { /* privé */ }
    barre.querySelectorAll('button').forEach(b => { b.classList.toggle('on', b.dataset.id === id); b.setAttribute('aria-selected', b.dataset.id === id); });
    corps.replaceChildren(panneaux.get(id));
  };
  tous.forEach(o => barre.append(el('button.onglet', { type: 'button', role: 'tab', 'data-id': o.id, text: o.titre, onclick: () => montrer(o.id) })));
  montrer(actif);
  return el('div.onglets-wrap', {}, barre, corps);
}
