// ============================================================
//  Routeur minimaliste basé sur le hash (#/dives, #/dive/xxx…)
//  Le hash est indispensable pour GitHub Pages : aucune règle
//  de réécriture serveur n'est nécessaire.
// ============================================================

const routes = [];
let renderFn = null;

/** Déclare une route : pattern 'dive/:id/edit'. */
export function route(pattern, handler) {
  const parts = pattern.split('/');
  routes.push({ pattern, parts, handler });
}

/** Chemin courant, sans la chaîne de requête. */
export function currentPath() {
  const raw = location.hash.replace(/^#\/?/, '') || 'dives';
  return raw.split('?')[0].replace(/\/$/, '') || 'dives';
}

/** Navigue vers un chemin. `replace` évite d'empiler dans l'historique. */
export function navigate(path, replace = false) {
  const target = '#/' + String(path).replace(/^\/+/, '');
  if (location.hash === target) { render(); return; }
  if (replace) {
    history.replaceState(null, '', target);
    render();
  } else {
    location.hash = target;
  }
}

export function match(path) {
  const parts = path.split('/');
  for (const r of routes) {
    if (r.parts.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (r.parts[i].startsWith(':')) params[r.parts[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (r.parts[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return { handler: r.handler, params, pattern: r.pattern };
  }
  return null;
}

export function onRender(fn) { renderFn = fn; }

export function render() {
  if (renderFn) renderFn(currentPath());
}

export function startRouter() {
  window.addEventListener('hashchange', () => render());
  if (!location.hash) history.replaceState(null, '', '#/dives');
  render();
}
