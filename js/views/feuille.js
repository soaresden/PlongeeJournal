// ============================================================
//  Brancher le registre des visites sur une feuille Google
//  (Réglages → Partager mon carnet, et l'Historique des visites)
// ============================================================

import { el, toast, openModal, confirmBox } from '../lib.js';
import { store } from '../store.js';
import { estAdresseFeuille, nouvelleCle, scriptFeuille, lireFeuille } from '../feuille.js';

/** La clé secrète de relecture (créée une fois, gardée dans le carnet). */
async function cleFeuille() {
  const r = await store.getSettings();
  if (r.feuilleCle) return r.feuilleCle;
  const cle = nouvelleCle();
  await store.saveSettings({ feuilleCle: cle });
  return cle;
}

/**
 * Le guide pas à pas, puis l'adresse à coller.
 * @param {(feuille:string)=>Promise<void>} brancher  enregistre l'adresse et republie le lien
 */
export async function ouvrirBranchementFeuille(brancher) {
  const cle = await cleFeuille();
  const script = scriptFeuille(cle);
  const champ = el('input', { type: 'url', placeholder: 'https://script.google.com/macros/s/…/exec', autocomplete: 'off' });
  const message = el('div.hint');
  // Le texte du script, pour le copier à la main au besoin.
  const zone = el('textarea.feuille-script', { readOnly: true, hidden: true, rows: 8, value: script });
  const etape = (n, ...contenu) => el('div.feuille-etape', {}, el('span.feuille-num', { text: String(n) }), el('div', {}, ...contenu));
  openModal(close => {
    const valider = el('button.btn.primary', { type: 'button', text: 'Vérifier et brancher', onclick: async () => {
      const url = champ.value.trim();
      if (!estAdresseFeuille(url)) { message.textContent = 'Ce n’est pas une adresse d’application Web Google (elle finit par /exec).'; return; }
      valider.disabled = true; message.textContent = 'Vérification…';
      try {
        await lireFeuille(url, cle);
        message.textContent = 'Feuille trouvée ✓ Mise à jour du lien de partage…';
        await brancher(url);
        toast('📒 Feuille Google branchée : les visites y sont gardées');
        close();
      } catch (e) {
        message.textContent = `La feuille ne répond pas comme prévu : ${e.message}. Vérifie « Qui a accès : Tout le monde », et que le script collé est bien le dernier.`;
        valider.disabled = false;
      }
    } });
    return el('div.feuille-guide', {},
      el('h3', { text: '📒 Garder toutes les visites dans une feuille Google' }),
      el('div.hint', { text: 'À faire une seule fois (5 minutes), sur la tablette ou un ordinateur. '
        + 'Les visiteurs pourront seulement y ajouter une ligne ; toi seul peux la relire (avec une clé secrète, déjà dans le script).' }),
      etape(1, 'D’abord, copie le script :',
        el('div.btn-row', {},
          el('button.btn.sm', { type: 'button', text: '📋 Copier le script', onclick: async () => {
            try { await navigator.clipboard.writeText(script); toast('Script copié'); }
            catch { zone.hidden = false; zone.select(); toast('Sélectionné : copie-le'); }
          } }),
          el('button.btn.sm.ghost', { type: 'button', text: 'Voir', onclick: () => { zone.hidden = !zone.hidden; } })),
        zone),
      etape(2, 'Dans ', el('b', { text: 'Chrome' }), ' (pas l’appli Sheets), connecté à ton compte Google, ouvre ',
        el('a', { href: 'https://script.google.com/create', target: '_blank', rel: 'noopener', text: 'script.google.com/create' }),
        '. Sur tablette, si la page est réduite ou renvoie vers une appli : menu ⋮ → coche ', el('b', { text: 'Version pour ordinateur' }), '. ',
        'Efface tout ce qui est écrit dans l’éditeur et colle le script.'),
      etape(3, 'Clique sur 💾 (Enregistrer), puis en haut à droite ', el('b', { text: 'Déployer → Nouveau déploiement' }),
        '. Roue ⚙ « Sélectionnez le type » : ', el('b', { text: 'Application Web' }), '. ',
        'Exécuter en tant que : ', el('b', { text: 'Moi' }), ' ; Qui a accès : ', el('b', { text: 'Tout le monde' }), '. Puis Déployer.'),
      etape(4, 'Google demande l’autorisation : choisis ton compte. S’il affiche « Google n’a pas validé cette application », ',
        'clique sur ', el('b', { text: 'Paramètres avancés → Accéder à … (non sécurisé)' }), ' : c’est ton propre script, il n’écrit que dans cette feuille.'),
      etape(5, 'Copie l’', el('b', { text: 'URL de l’application Web' }), ' (elle finit par /exec) et colle-la ici :', champ,
        el('div.hint', { style: { margin: '6px 0 0' }, text: 'La feuille « Visites du carnet de plongée » se crée toute seule dans ton Google Drive, '
          + 'à la vérification : tu la retrouves dans l’appli Sheets.' })),
      message,
      el('div.btn-row', {}, el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }), valider));
  });
  setTimeout(() => champ.focus(), 300);
}

/**
 * Le bloc des réglages : branchée ou pas, et les boutons.
 * @param {object} p  le partage (p.feuille : l'adresse du script)
 * @param {(p:object)=>Promise<void>} republier  republie le lien avec ce partage
 */
export function blocFeuille(p, republier) {
  const brancher = async url => {
    const nouveau = { ...p, feuille: url };
    await store.saveSettings({ partage: nouveau });
    await republier(nouveau);
  };
  if (!p.feuille) {
    return el('div.feuille-bloc', {},
      el('div', { style: { fontWeight: '650' }, text: '📒 Ne perdre aucune visite' }),
      el('div.hint', { text: 'ntfy.sh n’en garde que 12 heures. Branche une feuille Google : chaque visite y est écrite, pour toujours, '
        + 'et l’appli la relit.' }),
      el('button.btn.sm', { type: 'button', text: '📒 Brancher une feuille Google', onclick: () => ouvrirBranchementFeuille(brancher) }));
  }
  return el('div.feuille-bloc', {},
    el('div', { style: { fontWeight: '650' }, text: '📒 Feuille Google branchée ✓' }),
    el('div.hint', { text: 'Chaque visite y est écrite (onglet « Visites ») ; l’appli la relit à chaque ouverture.' }),
    el('div.btn-row', {},
      el('button.btn.sm.ghost', { type: 'button', text: 'Changer de feuille', onclick: () => ouvrirBranchementFeuille(brancher) }),
      el('button.btn.sm.ghost.danger', { type: 'button', text: 'Débrancher', onclick: async () => {
        if (!(await confirmBox('Débrancher la feuille ? Les visites déjà relues restent dans ton carnet ; les nouvelles n’y seront plus écrites.', 'Débrancher'))) return;
        const { feuille, ...reste } = p;
        await store.saveSettings({ partage: reste });
        await republier(reste);
      } })));
}
