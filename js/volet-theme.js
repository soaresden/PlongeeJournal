// ============================================================
//  Le volet des thèmes
//
//  Un bouton 🎨 dans la barre du haut ouvre un volet léger, sans voile
//  sombre : la page reste visible derrière et change de couleurs en
//  direct à chaque thème touché (ou survolé à la souris). Le volet
//  reste ouvert pour en essayer d'autres ; ✕, Échap ou un toucher à
//  côté le ferment, sur le dernier choisi.
// ============================================================

import { el } from './lib.js';
import { THEMES, themeChoisi, choisirTheme, appliquerTheme } from './theme.js';

let volet = null;

/**
 * La vignette d'aperçu d'un thème : elle porte data-theme, elle s'affiche
 * donc avec les vraies couleurs de son thème (fond, décor, barre, carte, accent).
 */
export function pastilleTheme(t) {
  const v = el('span.theme-apercu', {},
    el('span.theme-barre'),
    el('span.theme-carte', {}, el('span.theme-trait'), el('span.theme-trait.court')),
    el('span.theme-rond'));
  v.dataset.theme = t.id;
  return v;
}

export const estOuvert = () => !!volet?.classList.contains('ouvert');

export function fermerVoletTheme() {
  if (!volet) return;
  appliquerTheme();                    // un survol en cours : on revient au choix
  volet.classList.remove('ouvert');
  document.removeEventListener('pointerdown', dehors, true);
  document.removeEventListener('keydown', echap);
}

function dehors(e) {
  if (volet?.contains(e.target) || e.target.closest?.('.btn-theme')) return;
  fermerVoletTheme();
}
function echap(e) { if (e.key === 'Escape') fermerVoletTheme(); }

export function basculerVoletTheme() {
  if (estOuvert()) fermerVoletTheme(); else ouvrirVoletTheme();
}

export function ouvrirVoletTheme() {
  if (!volet) {
    volet = el('aside.volet-theme', { role: 'dialog', 'aria-label': 'Thème' });
    document.body.append(volet);
  }
  const nomActuel = el('span.volet-theme-nom');
  const liste = el('div.volet-theme-liste');

  const marquer = () => {
    const id = themeChoisi();
    nomActuel.textContent = THEMES.find(t => t.id === id)?.nom || '';
    liste.querySelectorAll('.theme-choix').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
  };

  THEMES.forEach(t => {
    const b = el('button.theme-choix', { type: 'button', title: t.nom,
      onclick: () => { choisirTheme(t.id); marquer(); document.dispatchEvent(new window.CustomEvent('theme-change', { detail: t.id })); } },
      pastilleTheme(t), el('span.theme-nom', { text: `${t.emoji} ${t.nom}` }));
    b.dataset.id = t.id;
    // À la souris : un aperçu au survol, sans rien enregistrer.
    b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') appliquerTheme(t.id); });
    b.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') appliquerTheme(); });
    liste.append(b);
  });

  volet.replaceChildren(
    el('div.volet-theme-tete', {},
      el('b', { text: '🎨 Thème' }), nomActuel,
      el('button.apercu-btn', { type: 'button', text: '✕', title: 'Fermer', 'aria-label': 'Fermer', onclick: fermerVoletTheme })),
    liste,
    el('div.volet-theme-pied', { text: 'Touche un thème : l’écran change tout de suite. Propre à cet appareil.' }));
  marquer();

  requestAnimationFrame(() => {
    volet.classList.add('ouvert');
    liste.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  });
  document.addEventListener('pointerdown', dehors, true);
  document.addEventListener('keydown', echap);
}
