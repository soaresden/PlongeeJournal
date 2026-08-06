// ============================================================
//  Façade de la couche de données
//
//  Les écrans importent uniquement `store` depuis ce fichier et
//  ignorent totalement où vivent les données.
//
//  Le carnet est un fichier JSON. L'adaptateur « fichier » sait le
//  lire via le serveur local, via un partage en lecture seule, ou
//  depuis le miroir du navigateur — et choisit tout seul lequel.
// ============================================================

import { fileStore } from './store-fichier.js';
import { localStore } from './store-local.js';

export * from './model.js';

let adapter = null;
let initPromise = null;

/** Mode en cours : 'fichier' ou 'local'. */
export function backendKind() { return adapter?.kind ?? 'fichier'; }

export async function initStore({ force = false } = {}) {
  if (initPromise && !force) return initPromise;

  initPromise = (async () => {
    await fileStore.init();
    adapter = fileStore;
    return adapter;
  })();

  try { return await initPromise; }
  catch (e) {
    // Un carnet injoignable ne doit pas empêcher d'ouvrir l'app :
    // on retombe sur le navigateur, en le disant.
    console.error('Carnet injoignable, repli sur le navigateur', e);
    await localStore.init();
    adapter = localStore;
    initPromise = Promise.resolve(adapter);
    return adapter;
  }
}

export function resetStore() { adapter = null; initPromise = null; }

/**
 * `store.machin(...)` attend l'initialisation puis délègue.
 */
export const store = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'kind') return backendKind();
    return async (...args) => {
      const a = adapter ?? (await initStore().catch(() => localStore));
      const fn = a[prop];
      if (typeof fn !== 'function') throw new Error(`Méthode inconnue : ${String(prop)}`);
      return fn.apply(a, args);
    };
  },
});
