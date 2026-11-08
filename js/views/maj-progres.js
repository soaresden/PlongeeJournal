// ============================================================
//  La barre de chargement d'une mise à jour de l'APK
//  (dans Réglages, ou en bas de l'écran depuis l'annonce).
// ============================================================

import { el } from '../lib.js';
import { telechargerApk, ouvrirDansNavigateur, taillePropre } from '../maj-apk.js';

/**
 * Lance le téléchargement et affiche sa progression dans `zone`.
 * @param {HTMLElement} zone   où dessiner la barre
 * @param {{url, version, build, taille}} d  la version à installer
 * @param {{surFin?:Function}} options
 */
export function lancerMiseAJour(zone, d, { surFin = null } = {}) {
  const texte = el('div.maj-etat', { text: `Téléchargement de la ${d.version}…` });
  const rempli = el('div.maj-rempli');
  const barre = el('div.maj-barre.indetermine', {}, rempli);
  const detail = el('div.hint.maj-detail');
  const actions = el('div.btn-row', { hidden: true });
  zone.replaceChildren(el('div.maj-progres', {}, texte, barre, detail, actions));

  const progres = e => {
    if (e.etape === 'telechargement') {
      const total = e.total || d.taille || null;
      const pourcent = e.pourcent ?? (total && e.octets ? Math.round(e.octets * 100 / total) : null);
      barre.classList.toggle('indetermine', pourcent == null);
      rempli.style.width = pourcent == null ? '' : `${pourcent}%`;
      texte.textContent = `Téléchargement de la ${d.version}…${pourcent != null ? ` ${pourcent} %` : ''}`;
      detail.textContent = e.octets ? `${taillePropre(e.octets)}${total ? ` sur ${taillePropre(total)}` : ''}` : '';
    } else if (e.etape === 'verification') {
      barre.classList.remove('indetermine');
      rempli.style.width = '100%';
      texte.textContent = 'Vérification du fichier…';
    } else if (e.etape === 'installation') {
      barre.classList.remove('indetermine');
      rempli.style.width = '100%';
      barre.classList.add('fini');
      texte.textContent = '✓ Téléchargée. Android ouvre l’installateur : touche « Mettre à jour ».';
      detail.textContent = 'S’il demande d’abord d’« autoriser cette source », accepte puis reviens : '
        + 'l’installateur s’ouvre. Ton carnet et tes réglages sont conservés.';
    } else if (e.etape === 'erreur' || e.etape === 'secours') {
      barre.classList.remove('indetermine');
      barre.classList.add('erreur');
      texte.textContent = `✗ Le téléchargement n’a pas abouti (${e.message}).`;
      detail.textContent = 'Réessaie (réseau plus stable, Wi-Fi), ou passe par le navigateur du téléphone.';
      actions.hidden = e.etape === 'secours';
      actions.replaceChildren(
        el('button.btn.primary.sm', { type: 'button', text: '↻ Réessayer', onclick: () => lancerMiseAJour(zone, d, { surFin }) }),
        el('button.btn.sm', { type: 'button', text: 'Ouvrir dans le navigateur', onclick: () => ouvrirDansNavigateur(d.url) }));
    }
  };

  return telechargerApk(d.url, { build: d.build, navigateurSiEchec: false, progres })
    .then(r => { surFin?.(r); return r; });
}

/** La barre en bas de l'écran (depuis l'annonce d'une nouvelle version). */
export function miseAJourFlottante(d) {
  let boite = document.getElementById('maj-flottante');
  if (!boite) {
    boite = el('div#maj-flottante.card');
    document.body.append(boite);
  }
  const zone = el('div');
  const fermer = el('button.maj-fermer', { type: 'button', 'aria-label': 'Fermer', text: '×', onclick: () => boite.remove() });
  boite.replaceChildren(fermer, zone);
  return lancerMiseAJour(zone, d);
}
