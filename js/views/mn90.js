// ============================================================
//  MN90 — les outils de plongée (planificateur, Nitrox, DTR…)
//
//  Dans l'APK : la copie embarquée (www/mn90/), qui marche sans réseau.
//  Sur le site : la version en ligne ; son propre service worker la
//  garde ensuite pour le hors-ligne.
// ============================================================

import { el } from '../lib.js';

export const MN90_EN_LIGNE = 'https://soaresden.github.io/MN90Mobile/';

const natif = () => typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

export function adresseMn90() {
  return natif() ? './mn90/index.html' : MN90_EN_LIGNE;
}

export async function mn90View() {
  const cadre = el('iframe.mn90-cadre', {
    src: adresseMn90(),
    title: 'MN90 Mobile',
    allow: 'fullscreen',
  });
  return { title: 'MN90', node: el('div.mn90', {}, cadre), plein: true };
}
