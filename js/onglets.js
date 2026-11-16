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
    panneaux.forEach((p, k) => { p.hidden = k !== id; });
    window.dispatchEvent(new Event('resize'));   // les cartes et courbes de l'onglet se recalent
  };
  panneaux.forEach(p => corps.append(p));
  tous.forEach(o => barre.append(el('button.onglet', { type: 'button', role: 'tab', 'data-id': o.id, text: o.titre, onclick: () => montrer(o.id) })));
  montrer(actif);
  return el('div.onglets-wrap', {}, barre, corps);
}

/**
 * Range en onglets les blocs d'une page déjà construite : on garde les `garder` premiers en tête
 * (en-tête, boutons), et chaque bloc suivant va dans l'onglet dont le motif reconnaît son titre.
 * @param {HTMLElement} wrap
 * @param {string} cle
 * @param {{id:string, titre:string, motif:RegExp}[]} groupes  (le premier reçoit ce qui n'est reconnu par aucun)
 */
export function enOnglets(wrap, cle, groupes, { garder = 0 } = {}) {
  const blocs = [...wrap.children].slice(garder);
  const titreDe = b => (b.querySelector('h2, .corps-bloc-titre, summary, .tb-titre')?.textContent || b.textContent.slice(0, 60)).trim();
  const contenu = new Map(groupes.map(g => [g.id, []]));
  for (const b of blocs) {
    const g = groupes.find(x => x.motif && x.motif.test(titreDe(b))) || groupes[0];
    contenu.get(g.id).push(b);
    b.remove();
  }
  wrap.append(onglets(cle, groupes.map(g => ({ id: g.id, titre: g.titre, contenu: contenu.get(g.id).length ? el('div.onglet-grille', {}, ...contenu.get(g.id)) : null }))));
  return wrap;
}
