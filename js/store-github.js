// ============================================================
//  Adaptateur « GitHub » — le carnet vit dans ton dépôt privé
//
//  Principe :
//   - une copie (miroir) est TOUJOURS tenue sur l'appareil : l'app
//     s'ouvre instantanément et marche sans réseau, sur un bateau ;
//   - chaque modification part sur GitHub ~1 s plus tard (un commit
//     par lot de modifications) ;
//   - sans réseau, les modifications s'accumulent (« en attente »)
//     et partent toutes seules au retour du réseau ;
//   - si un autre appareil a écrit entre-temps, les deux versions
//     sont fusionnées (voir fusion.js), jamais écrasées.
//
//  Sans configuration GitHub, le même adaptateur fonctionne en
//  « mode local » : tout reste sur l'appareil.
// ============================================================

import { creerStore, normaliser } from './store-base.js';
import { fusionner, empreinte } from './fusion.js';
import * as gh from './github.js';
import * as etat from './sync.js';

const MIROIR = 'plongee-journal:miroir';          // même clé que l'ancien mode fichier
const ANCIEN_LOCAL = 'plongee-journal:v1';        // ancien mode navigateur
const ETAT = 'plongee-journal:gh-etat';           // { depot, sha, dirty, derniere }

/** 'local' | 'github' | 'github-hors-ligne' | 'github-erreur' */
let mode = 'local';
let suivi = { depot: '', sha: null, dirty: false, derniere: null };
let carnet = null;
let derniereErreur = '';
let resumeCommit = new Set();

export const modeActuel = () => mode;
export const derniereSynchro = () => suivi.derniere;
export const erreurGitHub = () => derniereErreur;
export const modifsEnAttente = () => suivi.dirty;

// ------------------------------------------------------------
//  Persistance locale
// ------------------------------------------------------------

function lireJSON(cle) {
  try { return JSON.parse(localStorage.getItem(cle) || 'null'); } catch { return null; }
}

function ecrireMiroir(data) {
  try { localStorage.setItem(MIROIR, JSON.stringify(data)); }
  catch (e) {
    if (e?.name === 'QuotaExceededError') {
      etat.setState('error', 'Mémoire de l’appareil pleine — allège les photos de tampons.');
    }
    console.warn('Miroir local non tenu à jour', e);
  }
}

function garderSuivi() {
  try { localStorage.setItem(ETAT, JSON.stringify(suivi)); } catch { /* plein */ }
}

/** Le meilleur carnet présent sur l'appareil, d'où qu'il vienne. */
function carnetDeLAppareil() {
  return lireJSON(MIROIR) || lireJSON(ANCIEN_LOCAL);
}

const compter = d => (d?.dives || []).length;

// ------------------------------------------------------------
//  État affiché
// ------------------------------------------------------------

function publier() {
  const cfg = gh.configGitHub();
  const depot = `${cfg.owner}/${cfg.repo}`;
  if (mode === 'local') {
    etat.setState('local', 'Mode local — les données restent sur cet appareil');
  } else if (mode === 'github-erreur') {
    etat.setState('error', derniereErreur || 'Problème avec GitHub', suivi.dirty ? 1 : 0);
  } else if (mode === 'github-hors-ligne') {
    etat.setState(suivi.dirty ? 'pending' : 'offline',
      suivi.dirty ? 'Hors ligne — modifications envoyées au retour du réseau'
                  : 'Hors ligne — copie de l’appareil', suivi.dirty ? 1 : 0);
  } else if (suivi.dirty) {
    etat.setState('pending', `Envoi vers ${depot} en attente`, 1);
  } else {
    etat.setState('ok', `Synchronisé avec ${depot}`);
  }
}

// ------------------------------------------------------------
//  Synchronisation
// ------------------------------------------------------------

let minuteur = null;
let enCours = null;

function planifier(delai = 1200) {
  clearTimeout(minuteur);
  minuteur = setTimeout(() => { envoyer().catch(() => {}); }, delai);
}

function messageCommit() {
  const morceaux = [...resumeCommit];
  resumeCommit = new Set();
  const appareil = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '')
    ? (/Tablet|iPad/i.test(navigator.userAgent) || (window.innerWidth >= 760) ? 'tablette' : 'téléphone')
    : 'ordinateur';
  return `Carnet : ${morceaux.length ? morceaux.slice(0, 4).join(', ') : 'mise à jour'} (${appareil})`;
}

/**
 * Pousse le carnet local vers GitHub. En cas de conflit : relit la
 * version distante, fusionne, réessaie. Jamais d'écrasement aveugle.
 */
export async function envoyer() {
  if (!gh.estConfigure() || !carnet) return false;
  if (enCours) { planifier(); return enCours; }

  enCours = (async () => {
    const cfg = gh.configGitHub();
    etat.setState('syncing', `Envoi vers ${cfg.owner}/${cfg.repo}…`);
    const message = messageCommit();
    for (let essai = 0; essai < 4; essai++) {
      try {
        const sha = await gh.ecrireCarnet(carnet, suivi.sha, message, cfg);
        suivi = { ...suivi, sha, dirty: false, derniere: new Date().toISOString() };
        garderSuivi();
        mode = 'github';
        derniereErreur = '';
        publier();
        return true;
      } catch (e) {
        if (e.conflit) {
          const distant = await gh.lireCarnet(cfg);
          carnet = normaliser(fusionner(distant.data, carnet));
          suivi.sha = distant.sha;
          ecrireMiroir(carnet);
          await adaptateur.remplacer(carnet);
          continue;
        }
        mode = e.reseau ? 'github-hors-ligne' : 'github-erreur';
        derniereErreur = e.message;
        publier();
        return false;
      }
    }
    mode = 'github-erreur';
    derniereErreur = 'Conflits répétés avec GitHub — réessaie dans un instant.';
    publier();
    return false;
  })();

  try { return await enCours; } finally { enCours = null; }
}

/**
 * Relit GitHub et fond avec l'appareil. Appelé au démarrage, au
 * retour au premier plan, au retour du réseau, ou à la main.
 * Renvoie true si le contenu affiché a changé.
 */
export async function synchroniser() {
  if (!gh.estConfigure()) { mode = 'local'; publier(); return false; }
  const cfg = gh.configGitHub();
  const avant = empreinte(carnet);

  if (suivi.depot !== gh.cleDepot(cfg)) {
    // Nouveau dépôt (ou premier branchement) : on ne connaît pas sa version.
    suivi = { depot: gh.cleDepot(cfg), sha: null, dirty: compter(carnet) > 0, derniere: null };
  }

  etat.setState('syncing', `Lecture de ${cfg.owner}/${cfg.repo}…`);
  let distant;
  try {
    distant = await gh.lireCarnet(cfg);
  } catch (e) {
    mode = e.reseau ? 'github-hors-ligne' : 'github-erreur';
    derniereErreur = e.message;
    publier();
    return false;
  }

  if (!distant.data) {
    // Dépôt neuf : le carnet de l'appareil devient le carnet de référence.
    suivi.sha = null;
    suivi.dirty = true;
    resumeCommit.add('création du carnet');
  } else if (suivi.dirty || suivi.sha !== distant.sha) {
    // Même sans rien en attente, on passe par la fusion : elle applique les
    // suppressions, au cas où un appareil aurait renvoyé une vieille fiche.
    const fondu = fusionner(distant.data, suivi.dirty ? carnet : {});
    carnet = normaliser(fondu);
    suivi.sha = distant.sha;
    // Après fusion, il reste à pousser si le local apportait quelque chose.
    suivi.dirty = suivi.dirty && empreinte(carnet) !== empreinte(normaliser(distant.data));
  }

  garderSuivi();
  ecrireMiroir(carnet);
  await adaptateur.remplacer(carnet);
  mode = 'github';
  derniereErreur = '';
  if (suivi.dirty) await envoyer();
  else { suivi.derniere = new Date().toISOString(); garderSuivi(); publier(); }
  return empreinte(carnet) !== avant;
}

// ------------------------------------------------------------

const adaptateur = creerStore({
  kind: 'github',

  async prepare() {
    suivi = { ...suivi, ...(lireJSON(ETAT) || {}) };
  },

  async charger() {
    carnet = normaliser(carnetDeLAppareil());
    if (!gh.estConfigure()) { mode = 'local'; publier(); return carnet; }
    // Le miroir s'affiche tout de suite ; GitHub est consulté juste après
    // (voir demarrer), pour ne jamais bloquer l'ouverture sur le réseau.
    mode = 'github-hors-ligne';
    return carnet;
  },

  enregistrer(data, quoi = {}) {
    carnet = data;
    ecrireMiroir(data);
    if (!gh.estConfigure()) { mode = 'local'; publier(); return; }

    const libelle = {
      dives: quoi.supprime ? 'plongée supprimée'
        : quoi.plongee?.numero ? `plongée n°${quoi.plongee.numero}` : 'plongée',
      buddies: quoi.supprime ? 'plongeur supprimé' : 'plongeur',
      divers: quoi.supprime ? 'profil supprimé' : 'profil',
      certifs: 'certification',
      settings: 'réglages',
      tout: 'import / remise à zéro',
    }[quoi.table];
    if (libelle) resumeCommit.add(libelle);

    suivi.dirty = true;
    garderSuivi();
    publier();
    planifier();
  },
});

export const githubStore = adaptateur;

/** Écrit tout de suite ce qui attend (avant de quitter l'app). */
export function vider() {
  if (suivi.dirty && gh.estConfigure()) { clearTimeout(minuteur); return envoyer(); }
  return Promise.resolve(true);
}

/** Après un changement de réglages GitHub : repart sur le nouveau dépôt. */
export async function rebrancher() {
  if (!gh.estConfigure()) { mode = 'local'; publier(); return { mode }; }
  await synchroniser();
  return { mode, plongees: compter(carnet) };
}
