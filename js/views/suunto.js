// ============================================================
//  Liaison Suunto
//
//  Le secret client et la clé d'abonnement vivent dans l'Edge
//  Function, jamais ici : le navigateur ne fait qu'appeler des
//  actions (« authorize », « workouts », « fit »).
//
//  Une plongée réelle peut correspondre à PLUSIEURS enregistrements
//  Suunto — remontée en surface puis réimmersion. On peut donc en
//  cocher plusieurs : ils sont fusionnés en une seule plongée, et
//  chaque clé reste rattachée pour ne jamais réimporter deux fois.
// ============================================================

import { el, toast, fmtDate, fmtDuration, pad, confirmBox } from '../lib.js';
import { callFunction } from '../supabase.js';
import { isSupabaseConfigured } from '../settings.js';
import { store } from '../store.js';
import { fitToDive, mergeDives } from '../fit.js';
import { setDraft } from '../draft.js';
import { navigate, currentQuery } from '../router.js';

/** Les charges utiles Suunto varient : on lit tolérant. */
function normalizeWorkout(w) {
  const key = w.workoutKey ?? w.workoutId ?? w.id ?? w.key;
  const startMs = w.startTime ?? w.startTimeMillis ?? w.start ?? null;
  const totalS = w.totalTime ?? w.duration ?? w.totalTimeSeconds ?? null;
  return {
    key: String(key ?? ''),
    raw: w,
    start: startMs ? new Date(Number(startMs)) : null,
    dureeMin: totalS ? Math.round(Number(totalS) / 60) : null,
    activityId: w.activityId ?? w.activityType ?? null,
    maxDepth: w.maxDepth ?? w.maxDepthMeters ?? null,
    description: w.description ?? w.activityName ?? '',
  };
}

/** Identifiants d'activité « plongée » côté Suunto (plongée bouteille, apnée, etc.). */
const DIVE_ACTIVITIES = new Set([26, 27, 61, 62, 63, 64, 65, 82, 83]);

const looksLikeDive = w =>
  DIVE_ACTIVITIES.has(Number(w.activityId))
  || /div|plong|apn|scuba|freedi/i.test(`${w.description} ${w.raw?.activityName ?? ''}`)
  || w.maxDepth != null;

function fmtDateTime(d) {
  if (!d) return '—';
  return `${fmtDate(d.toISOString().slice(0, 10))} à ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * La fonction n'est pas déployée : ce n'est pas une panne, c'est une étape
 * d'installation qui n'a pas encore été faite. On l'annonce comme telle.
 */
function pasEncoreDeployee(erreur) {
  const absente = /failed to send|failed to fetch|not found|404/i.test(erreur?.message || '');

  const etape = (n, titre, ...contenu) => el('div', { style: { marginBottom: '14px' } },
    el('div', { style: { fontWeight: '650', marginBottom: '4px' }, text: `${n}. ${titre}` }),
    ...contenu);

  const code = txt => el('div', {
    style: { fontFamily: 'monospace', fontSize: '12px', background: 'var(--bg-2)',
             border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 10px',
             margin: '6px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' },
    text: txt,
  });

  return el('div', {},
    el('div.card', {},
      el('div', { style: { fontSize: '34px', textAlign: 'center' }, text: '⌚' }),
      el('div', { style: { fontWeight: '650', textAlign: 'center', marginBottom: '6px' },
        text: absente ? 'Liaison Suunto pas encore installée' : 'Fonction Suunto injoignable' }),
      el('div.hint', { style: { marginTop: 0, textAlign: 'center' },
        text: absente
          ? 'Rien d’anormal : c’est une étape facultative, à faire quand tu auras tes '
          + 'identifiants développeur Suunto. Le reste du carnet fonctionne sans.'
          : erreur.message }),
    ),

    el('div.section', {},
      el('h2', { text: 'Ce qu’il reste à faire' }),
      el('div.card', {},
        etape(1, 'Obtenir tes identifiants Suunto',
          el('div.hint', { style: { marginTop: 0 } },
            'Sur ', el('a', { href: 'https://apizone.suunto.com/how-to-start', target: '_blank',
              rel: 'noopener', style: { color: 'var(--accent)' } }, 'apizone.suunto.com'),
            ' : abonne-toi à ', el('i', { text: 'Developer API' }),
            ' pour la clé d’abonnement, puis crée une application dans ton profil pour '
          + 'obtenir un client id et un client secret.')),

        etape(2, 'Déposer les secrets dans Supabase',
          el('div.hint', { style: { marginTop: 0 },
            text: 'Edge Functions → Secrets. Six valeurs : SUUNTO_CLIENT_ID, '
                + 'SUUNTO_CLIENT_SECRET, SUUNTO_SUBSCRIPTION_KEY, SUUNTO_REDIRECT_URI, '
                + 'SUUNTO_STATE_SECRET (une longue chaîne au hasard) et APP_URL. '
                + 'Les deux URL sont à copier depuis l’écran Réglages.' })),

        etape(3, 'Déployer la fonction',
          el('div.hint', { style: { marginTop: 0 },
            text: 'Dans le dossier du projet, en remplaçant l’identifiant par le tien '
                + '(sans chevrons) :' }),
          code('npx supabase login\n'
             + 'npx supabase link --project-ref kwodqmaathesvqrnkvhn\n'
             + 'npx supabase functions deploy suunto --no-verify-jwt'),
          el('div.hint', { style: { marginTop: 0 },
            text: 'Le project ref est la partie variable de ton URL Supabase. '
                + '--no-verify-jwt est nécessaire : la redirection Suunto arrive sans '
                + 'en-tête d’authentification, et la fonction vérifie elle-même la session.' })),

        el('div.hint', {},
          'Le code de la fonction est déjà dans le dépôt, sous ',
          el('code', { text: 'supabase/functions/suunto/' }),
          '. Il n’y a rien à écrire.'),
      ),
    ),

    el('div.section', {},
      el('h2', { text: 'En attendant' }),
      el('div.card', {},
        el('div.hint', { style: { marginTop: 0 },
          text: 'Rien ne bloque : profondeurs, horaires et paliers se saisissent à la main '
              + 'dans le formulaire de plongée. L’import Suunto ne fera que les pré-remplir.' }),
        el('div.btn-row', {},
          el('button.btn.primary', { text: 'Saisir une plongée', onclick: () => navigate('dive/new') }),
          el('button.btn.sm.ghost', { text: 'Réglages', onclick: () => navigate('setup') }),
        ),
      ),
    ),
  );
}

// ============================================================

export async function suuntoView() {
  const wrap = el('div');

  if (!isSupabaseConfigured()) {
    return {
      title: 'Suunto',
      node: el('div.empty', {},
        el('span.big', { text: '⌚' }),
        'La liaison Suunto passe par ta base Supabase.',
        el('div', { style: { marginTop: '18px' } },
          el('button.btn.primary', { onclick: () => navigate('setup') }, 'Configurer ma base'))),
      back: true,
    };
  }

  // Retour de la redirection OAuth
  const q = currentQuery();
  if (q.get('ok')) toast('Compte Suunto relié');
  if (q.get('erreur')) toast('Suunto : ' + q.get('erreur'), true);

  // ---------- État de la liaison ----------
  const statusCard = el('div.card', {}, el('div.hint', { style: { marginTop: 0 }, text: 'Vérification…' }));
  wrap.append(statusCard);

  const listBox = el('div');
  wrap.append(listBox);

  let status = null;
  try {
    status = await callFunction('suunto', { action: 'status' });
  } catch (e) {
    statusCard.remove();
    wrap.append(pasEncoreDeployee(e));
    return { title: 'Suunto', node: wrap, back: true };
  }

  function renderStatus() {
    statusCard.innerHTML = '';
    if (!status.connected) {
      statusCard.append(
        el('div', { style: { fontWeight: '650' }, text: 'Compte Suunto non relié' }),
        el('div.hint', { text: 'Tu seras redirigé vers Suunto pour autoriser l’accès en lecture à tes '
          + 'enregistrements. Aucun mot de passe Suunto ne transite par cette app.' }),
        el('div.btn-row', {},
          el('button.btn.primary', { text: 'Relier mon compte Suunto', onclick: connect })),
      );
      listBox.innerHTML = '';
      return;
    }
    statusCard.append(
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } },
        el('div', {},
          el('div', { style: { fontWeight: '650' }, text: status.user || 'Compte Suunto relié' }),
          el('div', { style: { color: 'var(--text-dim)', fontSize: '13px' },
            text: status.lastSync ? `Dernière lecture : ${fmtDateTime(new Date(status.lastSync))}` : 'Jamais lu' }),
        ),
        el('span.badge.ens', { text: 'relié' }),
      ),
      el('div.btn-row', {},
        el('button.btn.primary', { text: 'Voir mes plongées', onclick: loadWorkouts }),
        el('button.btn.sm.ghost', { text: 'Délier', onclick: disconnect }),
      ),
    );
  }

  async function connect() {
    try {
      const { url } = await callFunction('suunto', { action: 'authorize' });
      location.href = url;
    } catch (e) { toast(e.message, true); }
  }

  async function disconnect() {
    if (!await confirmBox('Délier le compte Suunto ? Les plongées déjà importées restent dans le carnet.', 'Délier')) return;
    try {
      await callFunction('suunto', { action: 'disconnect' });
      status = { connected: false };
      renderStatus();
      toast('Compte délié');
    } catch (e) { toast(e.message, true); }
  }

  // ---------- Liste des enregistrements ----------
  const selected = new Set();

  async function loadWorkouts() {
    listBox.innerHTML = '';
    listBox.append(el('div.card', {}, el('div.hint', { style: { marginTop: 0 }, text: 'Lecture du compte Suunto…' })));

    let payload;
    try {
      payload = await callFunction('suunto', { action: 'workouts', limit: 50 });
    } catch (e) {
      listBox.innerHTML = '';
      listBox.append(el('div.card', {},
        el('div', { style: { color: 'var(--danger)' }, text: 'Lecture impossible' }),
        el('div.hint', { text: e.message })));
      return;
    }

    const rows = (payload.payload ?? payload.workouts ?? payload.data ?? payload ?? []);
    const all = (Array.isArray(rows) ? rows : []).map(normalizeWorkout).filter(w => w.key);
    const imported = new Set(await store.importedSuuntoKeys().catch(() => []));

    listBox.innerHTML = '';
    if (!all.length) {
      listBox.append(el('div.card', {},
        el('div.hint', { style: { marginTop: 0 },
          text: 'Aucun enregistrement renvoyé par Suunto. Synchronise d’abord ta montre avec l’app Suunto.' })));
      return;
    }

    const dives = all.filter(looksLikeDive);
    let showAll = dives.length === 0;

    const header = el('div.card', {},
      el('div', { style: { fontWeight: '650' }, text: 'Enregistrements Suunto' }),
      el('div.hint', { style: { marginBottom: 0 },
        text: 'Coche plusieurs lignes si une même plongée a été coupée en deux par un passage en surface : '
            + 'elles seront fusionnées en une seule plongée.' }),
    );
    const rowsBox = el('div');
    const actions = el('div.btn-row');

    function renderRows() {
      const list = showAll ? all : dives;
      rowsBox.innerHTML = '';

      if (!showAll && dives.length < all.length) {
        rowsBox.append(el('div.hint', { style: { textAlign: 'center' } },
          el('button.btn.sm.ghost', {
            text: `Afficher les ${all.length - dives.length} autres activités`,
            onclick: () => { showAll = true; renderRows(); },
          })));
      }

      list.forEach(w => {
        const already = imported.has(w.key);
        const card = el('div.card', { style: already ? { opacity: '.55' } : null },
          el('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } },
            already
              ? el('span.badge.ens', { text: 'importé' })
              : (() => {
                  const cb = el('input', { type: 'checkbox' });
                  cb.style.width = '20px'; cb.style.height = '20px'; cb.style.accentColor = 'var(--accent)';
                  cb.checked = selected.has(w.key);
                  cb.onchange = () => {
                    cb.checked ? selected.add(w.key) : selected.delete(w.key);
                    renderActions();
                  };
                  return cb;
                })(),
            el('div', { style: { flex: 1, minWidth: 0 } },
              el('div', { style: { fontWeight: '600' }, text: fmtDateTime(w.start) }),
              el('div', { style: { color: 'var(--text-dim)', fontSize: '13px' },
                text: [
                  w.dureeMin ? fmtDuration(w.dureeMin) : null,
                  w.maxDepth ? `${Math.round(w.maxDepth * 10) / 10} m` : null,
                  w.description || null,
                ].filter(Boolean).join(' · ') || 'Sans détail' }),
            ),
          ),
        );
        rowsBox.append(card);
      });
      renderActions();
    }

    function renderActions() {
      actions.innerHTML = '';
      const n = selected.size;
      const btn = el('button.btn.primary.block', {
        text: n === 0 ? 'Coche au moins un enregistrement'
            : n === 1 ? 'Importer cette plongée'
            : `Fusionner ${n} enregistrements en une plongée`,
        disabled: n === 0,
        onclick: () => importSelected(all),
      });
      actions.append(btn);
    }

    listBox.append(header, rowsBox, actions);
    renderRows();
  }

  async function importSelected(all) {
    const keys = [...selected];
    const btnBox = listBox.querySelector('.btn-row');
    const btn = btnBox?.querySelector('button');
    if (btn) { btn.disabled = true; btn.textContent = 'Téléchargement…'; }

    try {
      const parts = [];
      const meta = [];
      for (const key of keys) {
        const { fit } = await callFunction('suunto', { action: 'fit', workoutKey: key });
        const bytes = Uint8Array.from(atob(fit), c => c.charCodeAt(0));
        const parsed = fitToDive(bytes);
        if (!parsed) { toast(`Aucune donnée de plongée dans ${key}`, true); continue; }
        parts.push(parsed);
        const w = all.find(x => x.key === key);
        meta.push({
          key,
          startTime: parsed.start ? parsed.start.toISOString() : null,
          dureeMin: parsed.dureeMin,
          profMax: parsed.profMax,
          resume: { activityId: w?.activityId ?? null, description: w?.description ?? '' },
        });
      }

      if (!parts.length) throw new Error('Aucun enregistrement exploitable');

      const merged = mergeDives(parts);
      const start = merged.start;

      setDraft({
        date: start ? start.toISOString().slice(0, 10) : '',
        heureImmersion: start ? `${pad(start.getHours())}:${pad(start.getMinutes())}` : '',
        dureeMin: merged.dureeMin,
        profMax: merged.profMax,
        profMoy: merged.profMoy,
        tempFond: merged.tempFond,
        tempSurface: merged.tempSurface,
        palier3: merged.paliers.p3,
        palier6: merged.paliers.p6,
        palier9: merged.paliers.p9,
        profil: merged.samples,
        suuntoKeys: keys,
        suuntoImports: meta,
        suuntoSyncedAt: new Date().toISOString(),
        _suuntoNote: merged.partCount > 1
          ? `Fusion de ${merged.partCount} enregistrements Suunto.` : '',
      });

      selected.clear();
      toast('Données importées — complète le lieu et la palanquée');
      navigate('dive/new');

    } catch (e) {
      toast(e.message, true);
      if (btn) { btn.disabled = false; btn.textContent = 'Réessayer'; }
    }
  }

  renderStatus();
  if (status.connected) loadWorkouts();

  return { title: 'Suunto', node: wrap, back: true };
}
