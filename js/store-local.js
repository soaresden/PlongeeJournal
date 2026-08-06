// ============================================================
//  Adaptateur « navigateur » — tout reste dans localStorage.
//
//  C'est le filet de sécurité : pas de serveur, pas de fichier
//  joignable, mais l'app reste utilisable et rien n'est perdu.
// ============================================================

import { creerStore } from './store-base.js';

const KEY = 'plongee-journal:v1';

export const localStore = creerStore({
  kind: 'local',

  charger() {
    try {
      const brut = localStorage.getItem(KEY);
      return brut ? JSON.parse(brut) : null;
    } catch (e) {
      console.error('Données locales illisibles', e);
      return null;
    }
  },

  enregistrer(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        throw new Error('Mémoire du navigateur pleine — allège les tampons '
                      + '(photos) ou exporte tes données.');
      }
      throw e;
    }
  },
});
