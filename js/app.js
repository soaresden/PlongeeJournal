// ============================================================
//  Point d'entrée de l'application
// ============================================================

import { $, $$, el, toast } from './lib.js';
import { route, onRender, navigate, match, startRouter, currentPath } from './router.js';
import { initStore } from './store.js';
import { modeActuel, synchroniser, vider, erreurGitHub } from './store-github.js';
import { configGitHub } from './github.js';
import { appliquerTheme } from './theme.js';
import * as sync from './sync.js';

import { divesView, diveView }            from './views/dives.js';
import { diveFormView }                   from './views/dive-form.js';
import { diversView, diverFormView }      from './views/divers.js';
import { buddiesView, buddyFormView }     from './views/buddies.js';
import { statsView }                      from './views/stats.js';
import { reglagesView }                   from './views/reglages.js';
import { suuntoView }                     from './views/suunto.js';
import { montreView }                     from './views/montre.js';
import { montreAideView }                 from './views/montre-aide.js';
import { urgenceView }                    from './views/urgence.js';

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
route('montre',           montreView);
route('montre-aide',      montreAideView);
route('urgence',          urgenceView);

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

function afficherBandeau({ classe, icone, titre, texte, action, duree = 5000 }) {
  clearTimeout(minuteurBandeau);
  bandeau.className = `bandeau ${classe}`;
  bandeau.replaceChildren(
    svg(icone),
    el('div.bandeau-txt', {}, el('b', { text: titre }), texte ? el('span', { text: texte }) : null),
    action ? el('button.btn.sm', { type: 'button', text: action.label, onclick: action.onclick }) : null,
    el('button.bandeau-x', { type: 'button', 'aria-label': 'Fermer', text: '×',
      onclick: () => { bandeau.hidden = true; } }),
  );
  bandeau.hidden = false;
  if (duree) minuteurBandeau = setTimeout(() => { bandeau.hidden = true; }, duree);
}

async function annoncerConnexion() {
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
    .finally(annoncerConnexion);
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
    reglages: 'reglages', suunto: 'divers', montre: 'divers', 'montre-aide': 'divers', urgence: 'divers',
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

startRouter();
