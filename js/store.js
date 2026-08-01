// ============================================================
//  Façade de la couche de données
//
//  Les écrans importent uniquement `store` depuis ce fichier et
//  ignorent totalement où vivent les données. Deux adaptateurs :
//    - Supabase, dès que les identifiants sont renseignés
//    - local (navigateur), sinon
// ============================================================

import { localStore } from './store-local.js';
import { isSupabaseConfigured } from './settings.js';
import * as sync from './sync.js';

export * from './model.js';

let adapter = null;
let initPromise = null;

/** Adaptateur en cours ('local' ou 'supabase'). */
export function backendKind() { return adapter?.kind ?? (isSupabaseConfigured() ? 'supabase' : 'local'); }

/**
 * Choisit et initialise l'adaptateur.
 * Appelé au démarrage et après connexion/déconnexion.
 */
export async function initStore({ force = false } = {}) {
  if (initPromise && !force) return initPromise;

  initPromise = (async () => {
    if (isSupabaseConfigured()) {
      const { supabaseStore } = await import('./store-supabase.js');
      await supabaseStore.init();
      adapter = supabaseStore;
    } else {
      await localStore.init();
      adapter = localStore;
      sync.setState('local', 'Données dans ce navigateur uniquement');
    }
    return adapter;
  })();

  try { return await initPromise; }
  catch (e) { initPromise = null; throw e; }
}

export function resetStore() { adapter = null; initPromise = null; }

/**
 * `store.machin(...)` attend l'initialisation puis délègue.
 * Tant que rien n'est initialisé, on retombe sur l'adaptateur local
 * pour que l'app reste utilisable (mode découverte).
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
