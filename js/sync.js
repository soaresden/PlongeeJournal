// ============================================================
//  Synchronisation
//
//  Supabase est la source de vérité. Le navigateur ne garde que :
//   - un miroir de lecture (pour afficher le carnet hors ligne)
//   - une file d'attente d'écritures qui n'ont pas pu partir
//
//  Rien n'est donc « stocké en local » au sens d'une base parallèle :
//  la file se vide dès que le réseau revient, et l'indicateur de la
//  barre du haut dit toujours où on en est.
// ============================================================

const OUTBOX_KEY = 'plongee-journal:outbox';
const MIRROR_KEY = 'plongee-journal:mirror';

/** 'ok' | 'syncing' | 'pending' | 'offline' | 'error' | 'local' */
let state = 'ok';
let detail = '';
const listeners = new Set();

export function onSyncChange(fn) { listeners.add(fn); fn(status()); return () => listeners.delete(fn); }

export function status() {
  return { state, detail, pending: Object.keys(outbox()).length, online: navigator.onLine !== false };
}

function emit() { const s = status(); listeners.forEach(fn => { try { fn(s); } catch { /* ignore */ } }); }

export function setState(next, info = '') {
  state = next; detail = info; emit();
}

// ------------------------------------------------------------
//  File d'attente d'écritures
// ------------------------------------------------------------

let _outbox = null;

function outbox() {
  if (_outbox) return _outbox;
  try { _outbox = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '{}'); }
  catch { _outbox = {}; }
  return _outbox;
}

function persistOutbox() {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(_outbox ?? {})); }
  catch (e) { console.warn('File d’attente non persistée', e); }
}

/**
 * Ajoute une écriture en attente. La clé table:id fait que la dernière
 * version d'un même objet écrase la précédente — on ne rejoue jamais
 * deux fois la même plongée.
 */
export function enqueue(op) {
  const box = outbox();
  box[`${op.table}:${op.id}`] = { ...op, at: Date.now() };
  persistOutbox();
  setState('pending', `${Object.keys(box).length} en attente`);
}

export function pendingOps() { return Object.values(outbox()); }

export function clearOutbox() { _outbox = {}; persistOutbox(); }

/**
 * Rejoue la file. `runner(op)` doit écrire dans Supabase et lever en cas
 * d'échec. Les erreurs réseau laissent l'opération en file ; les erreurs
 * métier (400, contrainte…) la retirent pour ne pas bloquer les suivantes.
 */
export async function flush(runner) {
  const box = outbox();
  const keys = Object.keys(box);
  if (!keys.length) { setState('ok'); return { done: 0, failed: 0 }; }
  if (navigator.onLine === false) { setState('offline', `${keys.length} en attente`); return { done: 0, failed: keys.length }; }

  setState('syncing', `${keys.length} à envoyer`);
  let done = 0, failed = 0, lastError = '';

  for (const key of keys.sort((a, b) => box[a].at - box[b].at)) {
    try {
      await runner(box[key]);
      delete box[key];
      done++;
    } catch (e) {
      const network = e?.name === 'TypeError' || /fetch|network|réseau/i.test(e?.message || '');
      lastError = e?.message || String(e);
      if (network) { failed++; break; }         // on réessaiera plus tard
      delete box[key]; failed++;                 // écriture définitivement refusée
      console.error('Écriture abandonnée', box[key], e);
    }
  }

  persistOutbox();
  const left = Object.keys(box).length;
  if (left) setState(navigator.onLine === false ? 'offline' : 'error', lastError || `${left} en attente`);
  else setState('ok');
  return { done, failed };
}

// ------------------------------------------------------------
//  Miroir de lecture
// ------------------------------------------------------------

export function saveMirror(data) {
  try { localStorage.setItem(MIRROR_KEY, JSON.stringify({ at: Date.now(), data })); }
  catch (e) { console.warn('Miroir non enregistré (mémoire pleine ?)', e); }
}

export function readMirror() {
  try {
    const raw = localStorage.getItem(MIRROR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearMirror() { localStorage.removeItem(MIRROR_KEY); }

// ------------------------------------------------------------
//  Déclencheurs automatiques
// ------------------------------------------------------------

let autoRunner = null;
let timer = null;

export function startAutoFlush(runner) {
  autoRunner = runner;
  const go = () => { if (autoRunner && pendingOps().length) flush(autoRunner); };

  window.addEventListener('online', () => { setState('syncing'); go(); });
  window.addEventListener('offline', () => setState('offline'));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) go(); });

  clearInterval(timer);
  timer = setInterval(go, 30_000);

  // Prévient la fermeture d'onglet s'il reste des écritures non parties.
  window.addEventListener('beforeunload', e => {
    if (pendingOps().length) { e.preventDefault(); e.returnValue = ''; }
  });

  go();
}

export function flushNow() { return autoRunner ? flush(autoRunner) : Promise.resolve(); }
