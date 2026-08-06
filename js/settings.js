// ============================================================
//  Réglages de l'installation
//
//  Le carnet est un fichier : il n'y a plus ni compte, ni clé, ni
//  service à configurer. Ne restent ici que des préférences propres
//  à CET appareil, conservées dans le navigateur.
// ============================================================

const KEY = 'plongee-journal:settings';

const DEFAUTS = {
  googleMapsKey: '',        // facultatif ; OpenStreetMap suffit et ne coûte rien
  // Rappel du nom du dossier d'import, affiché dans l'aide.
  dossierImport: 'PlongeeAImporter',
};

let cache = null;

export function settings() {
  if (cache) return cache;
  try { cache = { ...DEFAUTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { cache = { ...DEFAUTS }; }
  return cache;
}

export function saveSettings(patch) {
  cache = { ...settings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* mémoire pleine */ }
  return cache;
}

export function resetSettings() {
  cache = { ...DEFAUTS };
  localStorage.removeItem(KEY);
}

/** URL publique de l'app, utile pour déclarer la redirection Suunto. */
export function appUrl() {
  return location.href.split('#')[0];
}
