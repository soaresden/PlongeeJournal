// ============================================================
//  Façade de la couche de données
//
//  Les écrans importent uniquement `store` depuis ce fichier et
//  ignorent totalement où vivent les données.
//
//  Un seul adaptateur : il garde une copie sur l'appareil et, si un
//  dépôt GitHub est configuré, la synchronise avec lui.
// ============================================================

import { githubStore, modeActuel } from './store-github.js';

export * from './model.js';

let initPromise = null;

/** 'github' si un dépôt est branché, sinon 'local'. */
export function backendKind() { return modeActuel() === 'local' ? 'local' : 'github'; }

export async function initStore({ force = false } = {}) {
  if (initPromise && !force) return initPromise;
  initPromise = githubStore.init().then(() => githubStore);
  return initPromise;
}

export function resetStore() { initPromise = null; }

/**
 * `store.machin(...)` attend l'initialisation puis délègue.
 */
export const store = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'kind') return backendKind();
    return async (...args) => {
      const a = await initStore();
      const fn = a[prop];
      if (typeof fn !== 'function') throw new Error(`Méthode inconnue : ${String(prop)}`);
      return fn.apply(a, args);
    };
  },
});
