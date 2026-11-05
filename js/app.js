// ============================================================
//  Point d'entrée de l'application
// ============================================================

import { $, $$, el, toast } from './lib.js';
import { route, onRender, navigate, match, startRouter, currentPath } from './router.js';
import { initStore } from './store.js';
import { modeActuel, synchroniser, vider, erreurGitHub } from './store-github.js';
import { configGitHub, estConfigure } from './github.js';
import { appliquerTheme } from './theme.js';
import * as sync from './sync.js';
import { verifierEnFond, ecarter, telechargerApk } from './maj-apk.js';
import { envoyerEnAttente as envoyerPhotos } from './photos.js';

import { divesView, diveView }            from './views/dives.js';
import { diveFormView }                   from './views/dive-form.js';
import { diversView, diverFormView }      from './views/divers.js';
import { buddiesView, buddyFormView }     from './views/buddies.js';
import { statsView }                      from './views/stats.js';
import { reglagesView }                   from './views/reglages.js';
import { suuntoView }                     from './views/suunto.js';
import { suuntoCloudView }                from './views/suunto-cloud.js';
import { verifierEtat, chargerLiaison, echangerCode, sauverLiaison } from './suunto-cloud.js';
import { montreView }                     from './views/montre.js';
import { montreAideView }                 from './views/montre-aide.js';
import { urgenceView }                    from './views/urgence.js';
import { seanceFormView }                 from './views/seances.js';

// ---------- Routes ----------
route('dives',            divesView);
route('stats',            statsView);
route('dive/new',         diveFormView);
route('dive/:id',         diveView);
route('dive/:id/edit',    diveFormView);
route('divers',           diversView);
route('diver/new',        diverFormView);
route('diver/:id',        diverFormView);
route('buddies',          buddiesView);
route('buddy/new',        buddyFormView);
route('buddy/:id',        buddyFormView);
route('reglages',         reglagesView);
route('setup',            reglagesView);   // ancien lien
route('suunto',           suuntoView);
route('suunto-cloud',     suuntoCloudView);
route('montre',           montreView);
route('montre-aide',      montreAideView);
route('urgence',          urgenceView);
// Les séances s'affichent dans l'écran Plongées (onglet « Séances »).
route('seances',          () => { try { localStorage.setItem('plongee-journal:vue-dives', 'seances'); } catch { /* privé */ } return divesView(); });
route('seance/new',       seanceFormView);
route('seance/:id',       seanceFormView);

const viewEl  = $('#view');
const titleEl = $('#topTitle');
const backBtn = $('#backBtn');
const actions = $('#topActions');
const identEl = $('#topIdent');

appliquerTheme();

// ------------------------------------------------------------
//  Indicateur d'état du carnet : GitHub ou local, en un coup d'œil
// ------------------------------------------------------------

const syncBtn = el('button.etat-pill', { type: 'button', title: 'État du carnet' });

const ETATS = {
  ok:      { icone: 'i-cloud',   court: 'GitHub',     classe: 'ok',      label: 'Synchronisé avec GitHub' },
  syncing: { icone: 'i-sync',    court: 'Synchro…',   classe: 'syncing', label: 'Synchronisation en cours' },
  pending: { icone: 'i-sync',    court: 'En attente', classe: 'pending', label: 'Modifications à envoyer' },
  offline: { icone: 'i-offline', court: 'Hors ligne', classe: 'offline', label: 'GitHub injoignable' },
  local:   { icone: 'i-device',  court: 'Local',      classe: 'local',   label: 'Mode local' },
  error:   { icone: 'i-alert',   court: 'Erreur',     classe: 'error',   label: 'Problème de synchronisation' },
};

const svg = id => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', 'ico');
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', '#' + id);
  s.append(u);
  return s;
};

sync.onSyncChange(s => {
  const look = ETATS[s.state] ?? ETATS.local;
  syncBtn.className = `etat-pill ${look.classe}`;
  syncBtn.replaceChildren(svg(look.icone), el('span.etat-court', { text: look.court }));
  syncBtn.title = s.detail ? `${look.label} — ${s.detail}` : look.label;
  syncBtn.setAttribute('aria-label', syncBtn.title);
});

syncBtn.onclick = async () => {
  const s = sync.status();
  if (s.state === 'local' || s.state === 'error') return navigate('reglages');
  toast('Synchronisation…');
  const change = await synchroniser().catch(() => false);
  const apres = sync.status();
  toast(apres.state === 'ok' ? 'Carnet à jour avec GitHub' : (apres.detail || 'GitHub injoignable'),
    apres.state === 'error');
  if (change) navigate(currentPath(), true);
};

const settingsBtn = el('button.icon-btn.btn-reglages', { title: 'Réglages', 'aria-label': 'Réglages',
  onclick: () => navigate('reglages') }, svg('i-gear'));

actions.append(syncBtn, settingsBtn);

// ------------------------------------------------------------
//  Bandeau d'ouverture : « connecté à GitHub » ou « mode local »
// ------------------------------------------------------------

const bandeau = $('#bandeau');
let minuteurBandeau = null;

function afficherBandeau({ classe, icone, titre, texte, action, duree = 5000, surFermer }) {
  clearTimeout(minuteurBandeau);
  bandeau.className = `bandeau ${classe}`;
  bandeau.replaceChildren(
    svg(icone),
    el('div.bandeau-txt', {}, el('b', { text: titre }), texte ? el('span', { text: texte }) : null),
    action ? el('button.btn.sm', { type: 'button', text: action.label, onclick: action.onclick }) : null,
    el('button.bandeau-x', { type: 'button', 'aria-label': 'Fermer', text: '×',
      onclick: () => { bandeau.hidden = true; surFermer?.(); } }),
  );
  bandeau.hidden = false;
  if (duree) minuteurBandeau = setTimeout(() => { bandeau.hidden = true; }, duree);
}

async function annoncerConnexion() {
  annoncerMiseAJour().catch(() => {});
  const cfg = configGitHub();
  const depot = `${cfg.owner}/${cfg.repo}`;
  const { store } = await import('./store.js');
  const id = await store.getActiveDiverId();
  const n = id ? (await store.listDives(id)).length : 0;
  const plongees = `${n} plongée${n > 1 ? 's' : ''}`;
  const m = modeActuel();

  if (m === 'github') {
    afficherBandeau({ classe: 'ok', icone: 'i-cloud', titre: 'Connecté à GitHub',
      texte: `${depot} · ${plongees} · sauvegarde en direct` });
  } else if (m === 'local') {
    afficherBandeau({ classe: 'local', icone: 'i-device', titre: 'Mode local',
      texte: `${plongees} sur cet appareil uniquement — rien n’est envoyé sur GitHub`,
      action: { label: 'Brancher GitHub', onclick: () => { bandeau.hidden = true; navigate('reglages'); } },
      duree: 9000 });
  } else if (m === 'github-hors-ligne') {
    afficherBandeau({ classe: 'offline', icone: 'i-offline', titre: 'Hors ligne',
      texte: `Copie de l’appareil (${plongees}). Tes modifications partiront sur ${depot} au retour du réseau.`,
      duree: 8000 });
  } else {
    afficherBandeau({ classe: 'error', icone: 'i-alert', titre: 'GitHub ne répond pas comme prévu',
      texte: erreurGitHub(),
      action: { label: 'Réglages', onclick: () => { bandeau.hidden = true; navigate('reglages'); } },
      duree: 0 });
  }
}

// ------------------------------------------------------------
//  Nouvelle version de l'APK : annoncée une fois par jour au plus,
//  après le bandeau de connexion pour ne pas le recouvrir.
// ------------------------------------------------------------

async function annoncerMiseAJour() {
  const res = await verifierEnFond();
  if (!res) return;
  const d = res.derniere;
  const montrer = () => afficherBandeau({
    classe: 'ok', icone: 'i-sync', titre: `Nouvelle version de l’appli : ${d.version}`,
    texte: `Tu as la ${res.installee.version}. Téléchargement depuis ton GitHub, Android te demandera de confirmer.`,
    action: { label: 'Mettre à jour', onclick: () => {
      bandeau.hidden = true;
      telechargerApk(d.url);
      toast('Téléchargement lancé : ouvre le fichier quand il est arrivé, puis « Installer ».');
    } },
    duree: 0,
    surFermer: () => ecarter(d.build),
  });
  // Le bandeau de connexion part tout seul ; une erreur GitHub, elle, reste.
  const attendre = (essais) => {
    if (bandeau.hidden) return montrer();
    if (essais > 0) setTimeout(() => attendre(essais - 1), 1500);
  };
  attendre(20);
}

// ------------------------------------------------------------
//  Rendu
// ------------------------------------------------------------

const scrollMemory = new Map();
let lastPath = null;
let booted = false;

async function ensureStore() {
  if (booted) return;
  await initStore();
  booted = true;
  await majFicheUrgence();

  // Le carnet de l'appareil est affiché tout de suite ; GitHub est
  // consulté en parallèle et l'écran se met à jour s'il apporte du neuf.
  if (modeActuel() === 'local') { annoncerConnexion(); return; }
  synchroniser()
    .then(change => { if (change) navigate(currentPath(), true); })
    .catch(() => {})
    .finally(() => { annoncerConnexion(); envoyerPhotos().catch(() => {}); });
}

/**
 * Recopie localement l'essentiel de la fiche plongeur, pour que les
 * secours y accèdent même sans réseau.
 */
async function majFicheUrgence() {
  try {
    const { store } = await import('./store.js');
    const { memoriser } = await import('./urgence.js');
    const id = await store.getActiveDiverId();
    if (!id) return;
    const [diver, st] = await Promise.all([store.getDiver(id), store.stats(id)]);
    memoriser(diver, st?.niveau || '');
  } catch { /* jamais bloquant */ }
}

onRender(async path => {
  if (lastPath) scrollMemory.set(lastPath, viewEl.scrollTop);

  const m = match(path);
  if (!m) { navigate('dives', true); return; }

  // La fiche d'urgence reste lisible quoi qu'il arrive : elle n'attend
  // pas le chargement du carnet.
  if (path.split('/')[0] !== 'urgence') {
    try {
      await ensureStore();
    } catch (e) {
      viewEl.innerHTML = '';
      viewEl.append(el('div.empty', {},
        el('span.big', { text: '⚠️' }),
        'Impossible de charger le carnet.',
        el('div.hint', { text: e.message }),
        el('div', { style: { marginTop: '18px' } },
          el('button.btn.primary', { text: 'Réglages', onclick: () => navigate('reglages') }))));
      titleEl.textContent = 'Erreur';
      return;
    }
  }

  viewEl.setAttribute('aria-busy', 'true');

  let result;
  try {
    result = await m.handler(m.params);
  } catch (e) {
    console.error(e);
    result = {
      title: 'Erreur',
      node: el('div.empty', {},
        el('span.big', { text: '⚠️' }),
        'Un problème est survenu.',
        el('div.hint', { text: e.message })),
    };
  }

  viewEl.innerHTML = '';
  viewEl.append(result.node);
  viewEl.removeAttribute('aria-busy');
  titleEl.textContent = result.title || 'Carnet de plongée';

  // Identité du carnet dans la barre du haut : ces deux lignes n'ont pas
  // besoin d'une carte à elles seules, et la place gagnée revient au
  // contenu — c'est visible sur le calendrier.
  identEl.innerHTML = '';
  identEl.hidden = !result.identite;
  if (result.identite) {
    const { nom, compte, derniere } = result.identite;
    identEl.append(
      el('span.ident-nom', { text: nom }),
      el('span.ident-sous', { text: derniere ? `${compte} · ${derniere}` : String(compte) }));
    identEl.onclick = () => navigate('divers');
    document.body.classList.add('avec-ident');
  } else {
    document.body.classList.remove('avec-ident');
  }
  document.title = (result.title ? result.title + ' · ' : '') + 'Carnet de plongée';
  backBtn.hidden = !result.back;

  const root = path.split('/')[0];
  const tabFor = {
    dives: 'dives', dive: path === 'dive/new' ? 'dive/new' : 'dives',
    divers: 'divers', diver: 'divers',
    buddies: 'buddies', buddy: 'buddies', stats: 'stats',
    reglages: 'reglages', suunto: 'divers', 'suunto-cloud': 'divers', montre: 'divers', 'montre-aide': 'divers', urgence: 'divers',
    seances: 'dives', seance: 'dives',
  }[root];
  $$('#tabbar .tab').forEach(t => t.classList.toggle('active', t.dataset.route === tabFor));

  viewEl.scrollTop = scrollMemory.get(path) ?? 0;
  lastPath = path;
});

// ------------------------------------------------------------
//  Navigation
// ------------------------------------------------------------

$$('#tabbar .tab').forEach(tab => tab.addEventListener('click', () => navigate(tab.dataset.route)));

backBtn.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else navigate('dives', true);
});

// ------------------------------------------------------------
//  Retour au premier plan, retour du réseau
//
//  Un autre appareil a peut-être écrit entre-temps, ou des
//  modifications attendent le réseau : on synchronise sans rien
//  demander.
// ------------------------------------------------------------

let dernierEssai = 0;
async function resynchroniser(force = false) {
  if (!booted || modeActuel() === 'local') return;
  if (document.hidden) { vider(); return; }          // on part : on pousse ce qui attend
  if (!force && Date.now() - dernierEssai < 15000) return;
  dernierEssai = Date.now();
  const avant = modeActuel();
  const change = await synchroniser().catch(() => false);
  // Les photos du carnet papier prises hors ligne partent aussi.
  envoyerPhotos().catch(() => {});
  if (change) {
    toast('Carnet mis à jour depuis GitHub');
    navigate(currentPath(), true);
  } else if (avant !== 'github' && modeActuel() === 'github') {
    toast('GitHub retrouvé — carnet synchronisé');
  }
}

window.addEventListener('online', () => resynchroniser(true));
document.addEventListener('visibilitychange', () => resynchroniser());
window.addEventListener('pagehide', () => { vider(); });
// Filet : des modifications en attente sont retentées chaque minute.
setInterval(() => {
  const s = sync.status().state;
  if (s === 'pending' || s === 'offline') resynchroniser(true);
}, 60000);

// ------------------------------------------------------------
//  Service worker (mode hors-ligne)
// ------------------------------------------------------------

// Dans l'APK, les fichiers sont déjà dans l'application : pas de cache à tenir.
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.Capacitor) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('../sw.js', import.meta.url))
      .catch(err => console.warn('Service worker non enregistré', err));
  });
}

window.addEventListener('error', e => {
  if (String(e.message || '').includes('QuotaExceeded')) {
    toast('Mémoire du navigateur pleine — exporte tes saisies puis allège les tampons.', true);
  }
});

// ------------------------------------------------------------
//  Retour de Suunto après « Connecter mon compte » :
//  …/PlongeeJournal/?code=…&state=… → jetons, puis Réglages.
// ------------------------------------------------------------

async function retourSuunto() {
  const q = new URLSearchParams(location.search);
  if (!q.has('state') || !(q.has('code') || q.has('error'))) return;
  const code = q.get('code');
  const etatOk = verifierEtat(q.get('state'));
  const refus = q.get('error');
  // L'adresse est nettoyée tout de suite : le code ne sert qu'une fois.
  history.replaceState(null, '', `${location.pathname}#/reglages`);
  if (refus) { toast(`Suunto : connexion refusée (${refus})`, true); return; }
  if (!etatOk) { toast('Retour de Suunto inattendu ou trop ancien : relance « Connecter mon compte ».', true); return; }
  let reliee = null;
  try {
    const { liaison, sha } = await chargerLiaison();
    reliee = await echangerCode(liaison, code);
    await sauverLiaison(reliee, { sha, message: 'Suunto : compte relié' });
    toast(estConfigure()
      ? `Compte Suunto relié${reliee.compte ? ` (${reliee.compte})` : ''} ✓`
      : 'Compte Suunto relié sur cet appareil seulement : branche GitHub ici pour que le téléphone le retrouve.',
      !estConfigure());
  } catch (e) {
    // Relié ici, mais l'écriture sur GitHub a échoué : la copie locale
    // sera remontée au prochain chargement des réglages.
    toast(reliee ? `Compte Suunto relié ici, mais pas encore sur GitHub (${e.message}) : rouvre les réglages.`
      : `Suunto : ${e.message}`, true);
  }
  if (currentPath() === 'reglages') navigate('reglages', true);
}

retourSuunto();
startRouter();
