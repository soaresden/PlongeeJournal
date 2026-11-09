// ============================================================
//  Thèmes de couleurs
//
//  Chaque thème est un jeu de variables CSS (voir css/themes.css).
//  Le choix est propre à l'appareil : la tablette peut être en
//  « Plage » et le téléphone en « Abysse ».
// ============================================================

const CLE = 'plongee-journal:theme';
const CLE_MN90 = 'mn90-theme';   // le thème de MN90 Mobile : les deux applis partagent le même

/**
 * Les thèmes de MN90 Mobile, à l'identique (couleurs : css/themes.css,
 * générées depuis le style.css de MN90). id, nom, emoji, sombre ou clair.
 */
export const THEMES = [
  { id: 'submarine-light', emoji: '☀️', nom: 'Sous-marin clair' },
  { id: 'dark', emoji: '🌑', nom: 'Nuit', sombre: true },
  { id: 'deep-ocean', emoji: '🌊', nom: 'Grands fonds', sombre: true },
  { id: 'sunset', emoji: '🌅', nom: 'Coucher de soleil' },
  { id: 'octobre-rose', emoji: '🎗️', nom: 'Octobre rose' },
  { id: 'ouistreham', emoji: '⛵', nom: 'Ouistreham' },
  { id: 'tortue', emoji: '🐢', nom: 'Tortue' },
  { id: 'hippocampe', emoji: '🐉', nom: 'Hippocampe', sombre: true },
  { id: 'crevette', emoji: '🦐', nom: 'Crevette' },
  { id: 'nudibranche', emoji: '🐌', nom: 'Nudibranche', sombre: true },
  { id: 'poisson-globe', emoji: '🐡', nom: 'Poisson-globe' },
  { id: 'poisson-clown', emoji: '🐠', nom: 'Poisson-clown' },
  { id: 'axolotl', emoji: '🦎', nom: 'Axolotl' },
  { id: 'abysses', emoji: '🦑', nom: 'Créature des abysses', sombre: true },
  { id: 'lochness', emoji: '🦕', nom: 'Loch Ness', sombre: true },
];
const DEFAUT = 'nudibranche';

// Les anciens thèmes du carnet → le plus proche de MN90.
const ANCIENS = { auto: 'submarine-light', plongee: 'dark', abysse: 'abysses', clair: 'submarine-light', cousteau: 'ouistreham',
  plage: 'sunset', lagon: 'submarine-light', corail: 'octobre-rose', epave: 'lochness', kelp: 'lochness', dauphin: 'octobre-rose',
  holi: 'axolotl', clown: 'poisson-clown' };

export function themeChoisi() {
  // Sans choix sur cet appareil (et pour qui ouvre un lien de partage) : Nudibranche.
  let id = null;
  try { id = localStorage.getItem(CLE) || localStorage.getItem(CLE_MN90); } catch { /* navigation privée */ }
  id = ANCIENS[id] || id;
  return THEMES.some(t => t.id === id) ? id : DEFAUT;
}

/** Thème réellement appliqué. */
export function themeEffectif(id = themeChoisi()) {
  id = ANCIENS[id] || id;
  return THEMES.some(t => t.id === id) ? id : DEFAUT;
}

export function appliquerTheme(id = themeChoisi()) {
  const eff = themeEffectif(id);
  const racine = document.documentElement;
  racine.dataset.theme = eff;
  racine.style.colorScheme = THEMES.find(t => t.id === eff)?.sombre ? 'dark' : 'light';

  // Couleur de la barre d'état Android / iOS : celle du fond du thème.
  requestAnimationFrame(() => {
    const style = window.getComputedStyle?.(racine);
    const fond = (style?.getPropertyValue('--status') || style?.getPropertyValue('--bg') || '').trim();
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta && fond) meta.setAttribute('content', fond);
    window.Capacitor?.Plugins?.StatusBar?.setBackgroundColor?.({ color: fond }).catch?.(() => {});
  });
}

export function choisirTheme(id) {
  try { localStorage.setItem(CLE, id); localStorage.setItem(CLE_MN90, id); } catch { /* mémoire pleine */ }
  appliquerTheme(id);
  // L'onglet MN90 ouvert (même origine) change aussi, en direct
  document.querySelectorAll('iframe.mn90-cadre').forEach(f => { try { f.contentWindow?.MN90Theme?.apply(id); } catch { /* autre origine */ } });
}

// Choisi dans MN90 (l'onglet MN90, ou MN90 dans un autre onglet) : le carnet suit.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key !== CLE_MN90 || !e.newValue || !THEMES.some(t => t.id === e.newValue) || e.newValue === themeChoisi()) return;
    try { localStorage.setItem(CLE, e.newValue); } catch { /* */ }
    appliquerTheme(e.newValue);
    document.dispatchEvent(new CustomEvent('theme-change', { detail: e.newValue }));
  });
}


