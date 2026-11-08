// ============================================================
//  Le QR code de mon carnet partagé, en grand (à montrer sur le bateau)
//  — depuis le menu Divers et l'Historique des visites.
// ============================================================

import { el, toast, openModal } from '../lib.js';
import { store } from '../store.js';
import { navigate } from '../router.js';

export async function ouvrirQrPartage() {
  const p = (await store.getSettings()).partage;
  const { lienPartage, qrSvg } = await import('../partage.js');
  if (!p?.siteId && !p?.gistId) {
    openModal(close => el('div', {},
      el('h3', { text: '📱 QR code de mon carnet' }),
      el('div.hint', { text: 'Tu n’as pas encore de lien de partage : crée-le une fois dans Réglages → Partager mon carnet, le QR code sera ensuite ici.' }),
      el('div.btn-row', {},
        el('button.btn.ghost', { type: 'button', text: 'Fermer', onclick: close }),
        el('button.btn.primary', { type: 'button', text: 'Créer le lien', onclick: () => { close(); navigate('reglages'); } }))));
    return;
  }
  const lien = lienPartage(p);
  const qr = el('div.partage-qr.grand');
  qrSvg(lien).then(svg => { qr.innerHTML = svg; }).catch(() => { qr.textContent = 'QR code indisponible'; });
  openModal(close => el('div.qr-modal', {},
    el('h3', { text: '📱 Mon carnet de plongée' }),
    el('div.hint', { style: { marginTop: 0 }, text: 'À scanner avec l’appareil photo : la personne donne son prénom et une plongée faite ensemble, et entre.' }),
    qr,
    el('div.hint.qr-lien', { text: lien }),
    el('div.btn-row', {},
      el('button.btn.sm', { type: 'button', text: '📋 Copier le lien', onclick: async () => {
        try { await navigator.clipboard.writeText(lien); toast('Lien copié'); } catch { toast(lien); }
      } }),
      navigator.share ? el('button.btn.sm', { type: 'button', text: '📤 Envoyer…', onclick: () =>
        navigator.share({ title: 'Mon carnet de plongée', text: 'Mon carnet de plongée (lecture seule)', url: lien }).catch(() => {}) }) : null,
      el('button.btn.sm.primary', { type: 'button', text: 'Fermer', onclick: close }))));
}
