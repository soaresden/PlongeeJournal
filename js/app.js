// ============================================================
//  Point d'entrée de l'application
// ============================================================

import { $, $$, el, toast } from './lib.js';
import { route, onRender, navigate, match, startRouter, currentPath } from './router.js';
import { initStore, backendKind, resetStore } from './store.js';
import { isSupabaseConfigured, settings, loadLocalCredentials } from './settings.js';
import { getSession, consumeRecovery } from './supabase.js';
import * as sync from './sync.js';
import * as bio from './biometric.js';

import { divesView, diveView }            from './views/dives.js';
import { diveFormView }                   from './views/dive-form.js';
import { diversView, diverFormView }      from './views/divers.js';
import { buddiesView, buddyFormView }     from './views/buddies.js';
import { statsView }                      from './views/stats.js';
import { lockView, passwordView }         from './views/lock.js';
import { setupView }                      from './views/setup.js';
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
route('verrou',           lockView);
route('login',            lockView);      // ancien lien
route('motdepasse',       passwordView);
route('setup',            setupView);
route('suunto',           suuntoView);
route('urgence',          urgenceView);

// Écrans accessibles carnet verrouillé
// « urgence » est public par nécessité : une fiche de secours
// verrouillée ne sert à rien.
const PUBLIC = new Set(['verrou', 'login', 'motdepasse', 'setup', 'urgence']);

const viewEl  = $('#view');
const titleEl = $('#topTitle');
const backBtn = $('#backBtn');
const actions = $('#topActions');
const identEl = $('#topIdent');

// ------------------------------------------------------------
//  Indicateur de synchronisation
// ------------------------------------------------------------

const syncBtn = el('button.icon-btn', {
  title: 'État de la synchronisation',
  style: { fontSize: '15px', padding: '6px 8px' },
});

const SYNC_LOOK = {
  ok:      { icon: '✓',  color: 'var(--ok)',      label: 'Tout est synchronisé' },
  syncing: { icon: '⟳',  color: 'var(--accent)',  label: 'Envoi en cours…' },
  pending: { icon: '⇡',  color: 'var(--warn)',    label: 'Écritures en attente' },
  offline: { icon: '⚡', color: 'var(--warn)',    label: 'Hors ligne — envoi différé' },
  error:   { icon: '!',  color: 'var(--danger)',  label: 'Échec de synchronisation' },
  local:   { icon: '▤',  color: 'var(--text-mute)', label: 'Stockage local' },
};

sync.onSyncChange(s => {
  const look = SYNC_LOOK[s.state] ?? SYNC_LOOK.ok;
  syncBtn.textContent = look.icon + (s.pending ? ` ${s.pending}` : '');
  syncBtn.style.color = look.color;
  syncBtn.title = s.detail ? `${look.label} — ${s.detail}` : look.label;
  syncBtn.classList.toggle('spin', s.state === 'syncing');
});

syncBtn.onclick = async () => {
  const s = sync.status();
  if (s.state === 'local') return toast('Aucune base branchée — ouvre les réglages');
  if (!s.pending) {
    try { await initStore({ force: true }); toast('Carnet rechargé depuis la base'); navigate(currentPath(), true); }
    catch (e) { toast(e.message, true); }
    return;
  }
  toast(`Envoi de ${s.pending} modification(s)…`);
  const r = await sync.flushNow();
  toast(r?.done ? `${r.done} envoyée(s)` : 'Toujours en attente', !r?.done);
};

const lockBtn = el('button.icon-btn', { text: '🔒', title: 'Verrouiller le carnet' });
lockBtn.onclick = async () => {
  const { signOut } = await import('./supabase.js');
  await signOut();
  resetStore();
  booted = false;
  toast('Carnet verrouillé');
  navigate('verrou', true);
};

const settingsBtn = el('button.icon-btn', { text: '⚙', title: 'Réglages',
  onclick: () => navigate('setup') });

actions.append(syncBtn, lockBtn, settingsBtn);

// ------------------------------------------------------------
//  Rendu
// ------------------------------------------------------------

const scrollMemory = new Map();
let lastPath = null;
let booted = false;

async function ensureStore() {
  if (booted) return true;
  if (!isSupabaseConfigured()) { await initStore(); booted = true; return true; }
  const session = await getSession().catch(() => null);
  if (!session) return false;
  await initStore();
  booted = true;
  await majFicheUrgence();
  return true;
}

/**
 * Recopie localement l'essentiel de la fiche plongeur, pour que les
 * secours y accèdent sans mot de passe.
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

  // Garde-fou : rien ne s'affiche tant qu'on n'est pas connecté.
  if (!PUBLIC.has(path.split('/')[0])) {
    let ready = false;
    try { ready = await ensureStore(); }
    catch (e) {
      viewEl.innerHTML = '';
      viewEl.append(el('div.empty', {},
        el('span.big', { text: '⚠️' }),
        'Impossible de charger le carnet.',
        el('div.hint', { text: e.message }),
        el('div', { style: { marginTop: '18px' } },
          el('button.btn.primary', { text: 'Réglages', onclick: () => navigate('setup') }))));
      titleEl.textContent = 'Erreur';
      return;
    }
    if (!ready) {
      navigate(isSupabaseConfigured() ? 'verrou' : 'setup', true);
      return;
    }
  }

  // Barre du haut : boutons masqués tant que le carnet est verrouillé.
  const ouvert = !PUBLIC.has(path.split('/')[0]);
  lockBtn.hidden = !ouvert;
  syncBtn.hidden = !ouvert;

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
    toast('Mémoire du navigateur pleine — synchronise puis allège les tampons.', true);
  }
});

// ------------------------------------------------------------
//  Démarrage
// ------------------------------------------------------------

// credentials.json (local, jamais publié) peut fournir les identifiants
// avant tout le reste — d'où le await ici.
await loadLocalCredentials();

// Lien de réinitialisation reçu par mail : à consommer AVANT le routeur,
// car Supabase place ses jetons dans le hash, là où l'app met ses routes.
if (isSupabaseConfigured()) {
  const ressemble = /access_token=|error_description=/.test(location.hash)
                 || /[?&]code=/.test(location.search);
  if (ressemble) {
    try {
      if (await consumeRecovery()) {
        booted = false;
        toast('Choisis ton nouveau mot de passe');
      }
    } catch (e) {
      toast(e.message, true);
    }
  }
}

// Première ouverture sans rien de configuré : on va droit à l'installation.
if (!isSupabaseConfigured() && !location.hash) {
  history.replaceState(null, '', '#/setup');
}

// Carnet verrouillé et empreinte activée : on la propose d'entrée.
if (isSupabaseConfigured() && bio.isEnrolled() && !location.hash) {
  history.replaceState(null, '', '#/verrou');
}

if (backendKind() === 'local') sync.setState('local', 'Données dans ce navigateur uniquement');

startRouter();
