// ============================================================
//  Préférences propres à CET appareil (navigateur ou APK)
//
//  Le dépôt GitHub se règle dans js/github.js, le thème dans
//  js/theme.js. Ne reste ici que la clé Google Maps, facultative :
//  sans elle, OpenStreetMap fait le travail, gratuitement.
// ============================================================

const KEY = 'plongee-journal:settings';

const DEFAUTS = {
  googleMapsKey: '',
};

let cache = null;

export function settings() {
  if (cache) return cache;
  try { cache = { ...DEFAUTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { cache = { ...DEFAUTS }; }
  return cache;
}
