// ============================================================
//  Adaptateur « fichier » — le carnet est un JSON, point.
//
//  Trois situations, détectées au démarrage, dans cet ordre :
//
//   1. SERVEUR   — lancer.bat tourne et répond. Lecture et
//                  écriture directes, sur le PC comme sur le
//                  téléphone en Wi-Fi. Rien à faire à la main.
//   2. LECTURE   — pas de serveur, mais donnees/carnet.json est
//                  joignable (partage pCloud). On consulte tout ;
//                  une saisie produit un fichier à déposer dans
//                  PlongeeAImporter.
//   3. HORS LIGNE— rien n'est joignable. On travaille sur le
//                  miroir gardé dans le navigateur.
//
//  Dans TOUS les cas un miroir est tenu dans le navigateur : sur
//  un bateau sans réseau, le carnet reste consultable.
// ============================================================

import { creerStore, normaliser } from './store-base.js';
import * as etat from './sync.js';

const MIROIR = 'plongee-journal:miroir';
const ATTENTE = 'plongee-journal:a-exporter';

const CHEMIN_API = './api/carnet';
const CHEMIN_ETAT = './api/etat';
const CHEMIN_FICHIER = './donnees/carnet.json';

/** Mode courant : 'serveur' | 'lecture' | 'hors-ligne'. */
let mode = 'hors-ligne';
export const modeActuel = () => mode;
export const enEcriture = () => mode === 'serveur';

/** Identifiants des plongées saisies sans serveur, à exporter. */
let aExporter = new Set();

function chargerAttente() {
  try { aExporter = new Set(JSON.parse(localStorage.getItem(ATTENTE) || '[]')); }
  catch { aExporter = new Set(); }
}
function garderAttente() {
  try { localStorage.setItem(ATTENTE, JSON.stringify([...aExporter])); } catch { /* plein */ }
}

export const enAttenteDExport = () => [...aExporter];
export function oublierAttente(ids = null) {
  if (ids === null) aExporter.clear();
  else ids.forEach(id => aExporter.delete(id));
  garderAttente();
  publierEtat();
}

function publierEtat() {
  if (mode === 'serveur') {
    etat.setState('ok', 'Enregistré dans le carnet du PC');
  } else if (mode === 'lecture') {
    etat.setState(aExporter.size ? 'pending' : 'lecture',
      aExporter.size
        ? `${aExporter.size} saisie(s) à exporter vers PlongeeAImporter`
        : 'Carnet en lecture seule — le PC n’est pas joignable',
      aExporter.size);
  } else {
    etat.setState(aExporter.size ? 'pending' : 'local',
      aExporter.size
        ? `${aExporter.size} saisie(s) à exporter vers PlongeeAImporter`
        : 'Hors ligne — données dans ce navigateur',
      aExporter.size);
  }
}

// ------------------------------------------------------------
//  Accès réseau, tous tolérants à l'échec
// ------------------------------------------------------------

async function recuperer(url, options = {}, delai = 2500) {
  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), delai);
  try {
    const r = await fetch(url, { cache: 'no-store', signal: stop.signal, ...options });
    return r.ok ? r : null;
  } catch {
    return null;                       // hors ligne, serveur éteint, CORS…
  } finally {
    clearTimeout(minuteur);
  }
}

function lireMiroir() {
  try { return JSON.parse(localStorage.getItem(MIROIR) || 'null'); }
  catch { return null; }
}

function ecrireMiroir(data) {
  try { localStorage.setItem(MIROIR, JSON.stringify(data)); }
  catch (e) {
    // Le miroir est un confort, pas la source de vérité : s'il ne tient
    // pas, on le dit mais on ne bloque pas la saisie.
    console.warn('Miroir local non tenu à jour', e);
  }
}

// ------------------------------------------------------------
//  Envoi différé : on n'écrit pas le fichier à chaque frappe
// ------------------------------------------------------------

let minuteurEnvoi = null;
let envoiEnCours = null;
let carnetCourant = null;

function planifierEnvoi() {
  clearTimeout(minuteurEnvoi);
  minuteurEnvoi = setTimeout(envoyer, 400);
}

async function envoyer() {
  if (mode !== 'serveur' || !carnetCourant) return;
  if (envoiEnCours) { planifierEnvoi(); return; }

  etat.setState('syncing', 'Écriture du carnet…');
  envoiEnCours = recuperer(CHEMIN_API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(carnetCourant),
  }, 15000);

  const r = await envoiEnCours;
  envoiEnCours = null;

  if (r) {
    publierEtat();
  } else {
    // Le serveur s'est arrêté en cours de route. On repasse en lecture
    // seule et la saisie en cours rejoint la file d'export : elle n'est
    // pas perdue, elle change juste de chemin.
    mode = 'lecture';
    publierEtat();
  }
}

// ------------------------------------------------------------

export const fileStore = creerStore({
  kind: 'fichier',

  async prepare() {
    chargerAttente();
  },

  async charger() {
    const miroir = lireMiroir();

    // 1. Le serveur local, s'il tourne.
    const vivant = await recuperer(CHEMIN_ETAT);
    if (vivant) {
      const r = await recuperer(CHEMIN_API, {}, 15000);
      if (r) {
        mode = 'serveur';
        const data = normaliser(await r.json());

        // Des saisies faites hors serveur attendent peut-être : elles
        // partent maintenant, l'utilisateur n'a rien à déplacer.
        if (miroir && aExporter.size) {
          const parId = new Map((miroir.dives || []).map(d => [d.id, d]));
          let repris = 0;
          aExporter.forEach(id => {
            const local = parId.get(id);
            if (!local) return;
            const i = data.dives.findIndex(d => d.id === id);
            if (i >= 0) data.dives[i] = local; else data.dives.push(local);
            repris++;
          });
          if (repris) {
            (miroir.buddies || []).forEach(b => {
              if (!data.buddies.some(x => x.id === b.id)) data.buddies.push(b);
            });
            carnetCourant = data;
            await recuperer(CHEMIN_API, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            }, 15000);
            oublierAttente();
          }
        }

        carnetCourant = data;
        ecrireMiroir(data);
        publierEtat();
        return data;
      }
    }

    // 2. Le fichier seul (pCloud, dossier partagé) : lecture uniquement.
    const fichier = await recuperer(CHEMIN_FICHIER, {}, 8000);
    if (fichier) {
      try {
        const data = normaliser(await fichier.json());
        mode = 'lecture';

        // Le miroir peut contenir des saisies plus récentes que le
        // fichier publié : elles ne doivent pas disparaître à l'écran.
        if (miroir) {
          (miroir.dives || []).forEach(local => {
            if (!aExporter.has(local.id)) return;
            const i = data.dives.findIndex(d => d.id === local.id);
            if (i >= 0) data.dives[i] = local; else data.dives.push(local);
          });
          (miroir.buddies || []).forEach(b => {
            if (!data.buddies.some(x => x.id === b.id)) data.buddies.push(b);
          });
        }

        carnetCourant = data;
        ecrireMiroir(data);
        publierEtat();
        return data;
      } catch (e) {
        console.error('carnet.json illisible', e);
      }
    }

    // 3. Rien de joignable : le miroir fait foi.
    mode = 'hors-ligne';
    carnetCourant = normaliser(miroir);
    publierEtat();
    return carnetCourant;
  },

  enregistrer(data, quoi = {}) {
    carnetCourant = data;
    ecrireMiroir(data);

    if (mode === 'serveur') {
      planifierEnvoi();
      return;
    }

    // Sans serveur, une plongée modifiée devra être exportée à la main.
    // On note laquelle : au retour du serveur, elle partira toute seule.
    if (quoi.table === 'dives' && quoi.id && !quoi.supprime) {
      aExporter.add(quoi.id);
      garderAttente();
    }
    publierEtat();
  },
});

/**
 * Redemande le carnet au serveur ou au fichier. Utile après un import,
 * ou quand le PC vient d'être allumé.
 */
export async function rafraichir() {
  const data = await fileStore.support.charger();
  await fileStore.remplacer(data);
  return { mode, plongees: (data.dives || []).length };
}
