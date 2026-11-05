// ============================================================
//  Thèmes de couleurs
//
//  Chaque thème est un jeu de variables CSS (voir css/themes.css).
//  Le choix est propre à l'appareil : la tablette peut être en
//  « Plage » et le téléphone en « Abysse ».
// ============================================================

const CLE = 'plongee-journal:theme';

/** id, nom, et trois couleurs pour la pastille d'aperçu (fond, surface, accent). */
export const THEMES = [
  { id: 'auto',      nom: 'Automatique',   sous: 'Suit le réglage clair / sombre de l’appareil', apercu: ['#f4f8fb', '#0b1f33', '#1aa3c4'] },
  { id: 'plongee',   nom: 'Plongée',       sous: 'Bleu nuit, reflets cyan',        apercu: ['#06131f', '#102a41', '#24c6dc'] },
  { id: 'abysse',    nom: 'Abysse',        sous: 'Noir profond, bioluminescence',   apercu: ['#020409', '#0a0f1c', '#7af0ff'] },
  { id: 'clair',     nom: 'Clair',         sous: 'Blanc, net, lisible en plein soleil', apercu: ['#f4f7fa', '#ffffff', '#0a7bc2'] },
  { id: 'cousteau',  nom: 'Cousteau',      sous: 'Bonnet rouge, pont de la Calypso', apercu: ['#f3ecdc', '#fffaf0', '#c8102e'] },
  { id: 'plage',     nom: 'Plage',         sous: 'Sable chaud, coucher de soleil',  apercu: ['#fbf3e6', '#fffdf8', '#f26b3a'] },
  { id: 'lagon',     nom: 'Eau turquoise', sous: 'Lagon clair, fond de sable blanc', apercu: ['#e7f8f6', '#ffffff', '#0aa79c'] },
  { id: 'corail',    nom: 'Récif corallien', sous: 'Nuit tropicale, corail et anémone', apercu: ['#1a0f1d', '#2a1830', '#ff6f61'] },
  { id: 'epave',     nom: 'Épave',         sous: 'Acier rouillé, laiton, eau verte', apercu: ['#0f1512', '#1b2420', '#d99a3d'] },
  { id: 'kelp',      nom: 'Forêt de kelp', sous: 'Vert océan, lumière filtrée',     apercu: ['#071612', '#0f2620', '#5fd39a'] },
  { id: 'dauphin',   nom: 'Dauphin',       sous: 'Coucher de soleil : rose, violet, orangé', apercu: ['#f4f1fb', '#ffffff', '#f0427a'], barre: 'linear-gradient(105deg, #6e48f0, #ec4886 58%, #ff9254)' },
  { id: 'tortue',    nom: 'Tortue',        sous: 'Carapace verte et ambrée, eau turquoise', apercu: ['#f1f4e3', '#fffef6', '#1f8f5b'], barre: 'linear-gradient(105deg, #19684a, #4a843a 55%, #b87c22)' },
  { id: 'holi',      nom: 'Holi',          sous: 'La fête des couleurs : poudres magenta, safran, vert, indigo', apercu: ['#fff8f2', '#ffffff', '#e0157f'], barre: 'linear-gradient(105deg, #d6157f, #ef6c00 34%, #10965a 68%, #2d55dc)' },
  { id: 'clown',     nom: 'Poisson-clown', sous: 'Orange vif et blanc, dans son anémone', apercu: ['#fff6ee', '#ffffff', '#f2600c'], barre: 'linear-gradient(105deg, #ff7a1f, #f05a00)' },
  { id: 'nudibranche', nom: 'Nudibranche', sous: 'Nuit violette, orange fluo, bleu électrique', apercu: ['#140a24', '#22133b', '#ff8a1f'], barre: 'linear-gradient(105deg, #461a96, #2448cd)' },
];

const SOMBRES = new Set(['plongee', 'abysse', 'corail', 'epave', 'kelp', 'nudibranche']);

export function themeChoisi() {
  try { return localStorage.getItem(CLE) || 'plongee'; } catch { return 'plongee'; }
}

const systemeSombre = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches;

/** Thème réellement appliqué (« auto » résolu). */
export function themeEffectif(id = themeChoisi()) {
  if (id === 'auto') return systemeSombre() ? 'plongee' : 'clair';
  return THEMES.some(t => t.id === id) ? id : 'plongee';
}

export function appliquerTheme(id = themeChoisi()) {
  const eff = themeEffectif(id);
  const racine = document.documentElement;
  racine.dataset.theme = eff;
  racine.style.colorScheme = SOMBRES.has(eff) ? 'dark' : 'light';

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
  try { localStorage.setItem(CLE, id); } catch { /* mémoire pleine */ }
  appliquerTheme(id);
}


// « Automatique » suit l'appareil en direct.
window.matchMedia?.('(prefers-color-scheme: dark)')
  .addEventListener?.('change', () => { if (themeChoisi() === 'auto') appliquerTheme(); });
