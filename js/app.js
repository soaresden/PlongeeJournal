// ============================================================
//  Point d'entrée de l'application
// ============================================================

import { $, $$, el, toast } from './lib.js';
import { route, onRender, navigate, match, startRouter, currentPath } from './router.js';
import { initStore } from './store.js';
import { modeActuel, enAttenteDExport, rafraichir } from './store-fichier.js';
import * as sync from './sync.js';

import { divesView, diveView }            from './views/dives.js';
import { diveFormView }                   from './views/dive-form.js';
import { diversView, diverFormView }      from './views/divers.js';
import { buddiesView, buddyFormView }     from './views/buddies.js';
import { statsView }                      from './views/stats.js';
import { reglagesView }                   from './views/reglages.js';
import { suuntoView }                     from './views/suunto.js';
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
route('urgence',          urgenceView);

const viewEl  = $('#view');
const titleEl = $('#topTitle');
const backBtn = $('#backBtn');
const actions = $('#topActions');
const identEl = $('#topIdent');

// ------------------------------------------------------------
//  Indicateur d'état du carnet
// ------------------------------------------------------------

const syncBtn = el('button.icon-btn', {
  title: 'État du carnet',
  style: { fontSize: '15px', padding: '6px 8px' },
});

const ETATS = {
  ok:      { icon: '✓',  color: 'var(--ok)',        label: 'Écrit dans le carnet du PC' },
  syncing: { icon: '⟳',  color: 'var(--accent)',    label: 'Écriture en cours…' },
  pending: { icon: '⇡',  color: 'var(--warn)',      label: 'Saisies à exporter' },
  lecture: { icon: '👁', color: 'var(--text-dim)',  label: 'Lecture seule' },
  local:   { icon: '▤',  color: 'var(--text-mute)', label: 'Hors ligne' },
  error:   { icon: '!',  color: 'var(--danger)',    label: 'Problème' },
};

sync.onSyncChange(s => {
  const look = ETATS[s.state] ?? ETATS.ok;
  syncBtn.textContent = look.icon + (s.pending ? ` ${s.pending}` : '');
  syncBtn.style.color = look.color;
  syncBtn.title = s.detail ? `${look.label} — ${s.detail}` : look.label;
  syncBtn.classList.toggle('spin', s.state === 'syncing');
});

syncBtn.onclick = async () => {
  const s = sync.status();
  if (s.pending) return navigate('reglages');

  toast('Recherche du carnet…');
  try {
    const r = await rafraichir();
    toast(r.mode === 'serveur'
      ? `Carnet rechargé — ${r.plongees} plongée(s)`
      : 'PC non joignable, carnet en lecture seule');
    navigate(currentPath(), true);
  } catch (e) {
    toast(e.message, true);
  }
};

const settingsBtn = el('button.icon-btn', { text: '⚙', title: 'Réglages',
  onclick: () => navigate('reglages') });

actions.append(syncBtn, settingsBtn);

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
}

/**
 * Recopie localement l'essentiel de la fiche plongeur, pour que les
 * secours y accèdent même sans réseau ni serveur.
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
//  Retour du serveur
//
//  Le PC vient d'être allumé, ou le téléphone a rejoint le Wi-Fi :
//  on retente le carnet plutôt que d'attendre que l'utilisateur y pense.
// ------------------------------------------------------------

let dernierEssai = 0;
async function retenterLeServeur() {
  if (modeActuel() === 'serveur') return;
  if (document.hidden || Date.now() - dernierEssai < 20000) return;
  dernierEssai = Date.now();

  const avant = enAttenteDExport().length;
  const r = await rafraichir().catch(() => null);
  if (r?.mode === 'serveur') {
    const parties = avant - enAttenteDExport().length;
    toast(parties > 0
      ? `PC retrouvé — ${parties} saisie(s) enregistrée(s)`
      : 'PC retrouvé — carnet à jour');
    navigate(currentPath(), true);
  }
}

window.addEventListener('online', retenterLeServeur);
document.addEventListener('visibilitychange', retenterLeServeur);

// ------------------------------------------------------------
//  Service worker (mode hors-ligne)
// ------------------------------------------------------------

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
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
