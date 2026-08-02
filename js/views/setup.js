// ============================================================
//  Installation guidée & réglages
//
//  Ce dépôt est public et ne contient aucune clé. Cet écran conduit
//  pas à pas : créer sa base, la remplir, choisir son mot de passe.
//  Chaque étape se coche toute seule quand elle est faite, et
//  l'ensemble n'est à parcourir qu'une fois.
// ============================================================

import { el, toast, confirmBox, openModal, scrollTo } from '../lib.js';
import { settings, saveSettings, resetSettings, checkCredentials,
         isSupabaseConfigured, suuntoRedirectUri, appUrl,
         toSupabaseUrl, projectId, carnetDejaInstalle } from '../settings.js';
import { getClient, getSession } from '../supabase.js';
import { initStore, resetStore, backendKind } from '../store.js';
import { securitySection } from './lock.js';
import { navigate } from '../router.js';

const field = (label, control, hint) => el('div.field', {},
  label ? el('label.lbl', { text: label }) : null, control,
  hint ? el('div.hint', {}, hint) : null);

function copyBtn(getText, label = 'Copier') {
  const b = el('button.btn.sm', { type: 'button', text: label });
  b.onclick = async () => {
    const text = typeof getText === 'function' ? await getText() : getText;
    const done = () => { b.textContent = '✓ Copié'; setTimeout(() => (b.textContent = label), 1800); };
    try { await navigator.clipboard.writeText(text); done(); }
    catch {
      const ta = el('textarea', { style: { position: 'fixed', opacity: '0' } });
      ta.value = text; document.body.append(ta); ta.select();
      document.execCommand('copy'); ta.remove(); done();
    }
  };
  return b;
}

/** Le script SQL est lu depuis le dépôt : une seule source de vérité. */
async function loadSchema() {
  const res = await fetch(new URL('../../supabase/schema.sql', import.meta.url));
  if (!res.ok) throw new Error('Script SQL introuvable dans le dépôt');
  return res.text();
}

/**
 * Le schéma est-il en place ?
 * Ne lève jamais : si le client Supabase lui-même ne peut pas se charger
 * (hors ligne, CDN bloqué), l'assistant doit le dire, pas s'effacer.
 */
async function probeSchema() {
  let sb;
  try {
    sb = await getClient();
  } catch (e) {
    return { ready: false, reason: `Client Supabase injoignable : ${e.message}` };
  }

  try {
    const { data, error } = await sb.from('app_meta')
      .select('value').eq('key', 'schema_version').maybeSingle();
    if (error) {
      if (/does not exist|schema cache|relation|not find the table/i.test(error.message)) {
        return { ready: false, reason: 'absent' };
      }
      return { ready: false, reason: error.message };
    }
    return { ready: true, version: data?.value ?? '?' };
  } catch (e) {
    return { ready: false, reason: e.message };
  }
}

const dashboardLink = (suffixe = '') => {
  const id = projectId();
  return id ? `https://supabase.com/dashboard/project/${id}${suffixe}` : 'https://supabase.com/dashboard';
};

/** En-tête d'étape, avec sa pastille d'état. */
function step(n, titre, etat, ...contenu) {
  const couleurs = { fait: 'var(--ok)', encours: 'var(--accent)', attente: 'var(--text-mute)' };
  const puce = el('span', {
    style: {
      display: 'grid', placeItems: 'center', flex: '0 0 26px',
      width: '26px', height: '26px', borderRadius: '50%',
      background: etat === 'fait' ? 'var(--ok)' : 'transparent',
      border: `1.5px solid ${couleurs[etat]}`,
      color: etat === 'fait' ? '#05202a' : couleurs[etat],
      fontSize: '13px', fontWeight: '700',
    },
    text: etat === 'fait' ? '✓' : String(n),
  });

  return el('div.section', {},
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 8px 2px' } },
      puce,
      el('h2', { style: { margin: 0, color: etat === 'attente' ? 'var(--text-mute)' : 'var(--text)' },
        text: titre })),
    ...contenu);
}

// ------------------------------------------------------------
//  Restreindre une clé Google Maps
//
//  Une clé de carte est publique par nature : elle part dans le
//  navigateur de chaque visiteur. On ne peut pas la cacher — on
//  peut seulement la rendre inutilisable ailleurs que chez soi.
// ------------------------------------------------------------

function tutoGoogleMaps() {
  const site = appUrl().replace(/index\.html$/, '');
  const referents = [`${site}*`, 'http://localhost:*/*', 'http://127.0.0.1:*/*'];

  openModal(close => el('div', {},
    el('h3', { text: '🔐 Protéger sa clé Google Maps' }),

    el('div.hint', { style: { marginTop: 0 } },
      'Une clé Maps ne peut pas rester secrète : elle est envoyée au navigateur de chaque '
    + 'visiteur, donc lisible dans le code source de la page. C’est normal et prévu. '
    + 'La protection consiste à la ', el('b', { text: 'restreindre' }),
      ' : Google refuse alors toute requête qui ne vient pas de ton site.'),

    el('div', { style: { fontWeight: '650', margin: '16px 0 6px' }, text: '1 · Restriction par site' }),
    el('ol', { style: { margin: 0, paddingLeft: '20px', color: 'var(--text-dim)',
                        fontSize: '14px', lineHeight: '1.8' } },
      el('li', {}, 'Ouvre ', el('a', { href: 'https://console.cloud.google.com/apis/credentials',
        target: '_blank', rel: 'noopener', style: { color: 'var(--accent)' } },
        'Google Cloud → API et services → Identifiants'), '.'),
      el('li', {}, 'Clique sur ta clé.'),
      el('li', {}, 'Section ', el('b', { text: 'Restrictions relatives aux applications' }),
        ' → choisis ', el('b', { text: 'Sites Web' }), '.'),
      el('li', {}, 'Ajoute ces référents, un par ligne :'),
    ),
    el('div.card', { style: { margin: '8px 0', background: 'var(--bg-2)' } },
      ...referents.map(r => el('div', { style: { fontFamily: 'monospace', fontSize: '12.5px',
        wordBreak: 'break-all', padding: '2px 0' }, text: r })),
    ),
    el('div.btn-row', { style: { marginTop: 0 } }, copyBtn(referents.join('\n'), '📋 Copier les référents')),
    el('div.hint', { text: 'Les deux dernières lignes servent à tes essais en local via lancer.bat. '
      + 'Retire-les si tu ne développes pas.' }),

    el('div', { style: { fontWeight: '650', margin: '16px 0 6px' }, text: '2 · Restriction par API' }),
    el('ol', { style: { margin: 0, paddingLeft: '20px', color: 'var(--text-dim)',
                        fontSize: '14px', lineHeight: '1.8' } },
      el('li', {}, 'Section ', el('b', { text: 'Restrictions relatives aux API' }),
        ' → ', el('b', { text: 'Restreindre la clé' }), '.'),
      el('li', {}, 'Coche uniquement ', el('b', { text: 'Maps JavaScript API' }), ' et ',
        el('b', { text: 'Places API' }), '. Rien d’autre.'),
      el('li', {}, 'Enregistre. La prise d’effet peut demander quelques minutes.'),
    ),

    el('div', { style: { fontWeight: '650', margin: '16px 0 6px' }, text: '3 · Plafond de dépense' }),
    el('div.hint', { style: { marginTop: 0 } },
      'Même restreinte, une clé peut coûter cher si un script s’emballe. Dans ',
      el('a', { href: 'https://console.cloud.google.com/billing/budgets', target: '_blank',
        rel: 'noopener', style: { color: 'var(--accent)' } }, 'Facturation → Budgets et alertes'),
      ', crée un budget avec une alerte à quelques euros. C’est le vrai filet de sécurité.'),

    el('div', { style: { fontWeight: '650', margin: '16px 0 6px' }, text: 'Si la clé a fuité' }),
    el('div.hint', { style: { marginTop: 0 } },
      'Une clé restreinte qui traîne quelque part n’est pas exploitable ailleurs que sur ton site : '
    + 'il n’y a rien à faire. Une clé ', el('b', { text: 'non restreinte' }),
      ' qui a circulé doit être régénérée (bouton ', el('i', { text: 'Réinitialiser la clé' }),
      ' dans la console) — puis restreinte.'),

    el('div.hint', {}, 'Rappel : tout ceci est optionnel. Sans clé, l’app fonctionne avec '
    + 'OpenStreetMap, gratuitement et sans compte.'),

    el('div.btn-row', {}, el('button.btn.primary', { type: 'button', text: 'Compris', onclick: close })),
  ));
}

// ============================================================
//  Assistant d'installation — un écran par étape
//
//  Un long formulaire à faire défiler donne l'impression qu'il y a
//  tout à faire d'un coup. Ici, chaque étape occupe l'écran, la
//  suivante n'apparaît qu'une fois la précédente franchie, et une
//  barre de progression dit où on en est.
// ============================================================

const ETAPES = [
  { id: 1, titre: 'Ta base', sousTitre: 'Créer le projet Supabase' },
  { id: 2, titre: 'Les tables', sousTitre: 'Exécuter le script SQL' },
  { id: 3, titre: 'Ton accès', sousTitre: 'Mot de passe du carnet' },
];

/** Barre de progression cliquable : on peut revenir en arrière. */
function progression(courante, faites, aller) {
  const barre = el('div.wiz-barre');

  ETAPES.forEach((e, i) => {
    if (i) barre.append(el('div.wiz-trait', { class: faites.has(e.id) ? 'wiz-trait fait' : 'wiz-trait' }));

    const fait = faites.has(e.id);
    const active = e.id === courante;
    const puce = el('button.wiz-puce', {
      type: 'button',
      class: `wiz-puce${fait ? ' fait' : ''}${active ? ' active' : ''}`,
      text: fait && !active ? '✓' : String(e.id),
      title: e.sousTitre,
      // On ne saute pas vers une étape qu'on n'a pas encore atteinte.
      disabled: !fait && !active,
      onclick: () => aller(e.id),
    });

    barre.append(el('div.wiz-etape', {},
      puce,
      el('div.wiz-label', { class: active ? 'wiz-label active' : 'wiz-label', text: e.titre })));
  });

  return barre;
}

export async function setupView() {
  const wrap = el('div');
  const scene = el('div');

  const session = isSupabaseConfigured() ? await getSession().catch(() => null) : null;

  // Carnet ouvert : ce n'est plus une installation, ce sont des réglages.
  if (session) return { title: 'Réglages', node: await ecranReglages(session), back: true };

  let schemaOk = false;
  let etape = isSupabaseConfigured() ? 2 : 1;

  const faites = () => {
    const f = new Set();
    if (isSupabaseConfigured()) f.add(1);
    if (schemaOk) f.add(2);
    return f;
  };

  async function afficher(n) {
    etape = n;
    scene.innerHTML = '';
    scene.append(progression(etape, faites(), aller));

    if (etape === 1) scene.append(ecranBase());
    else if (etape === 2) scene.append(await ecranTables());
    else scene.append(ecranAcces());

    scrollTo(scene, { behavior: 'auto', block: 'start' });
  }

  const aller = n => afficher(n);

  // ============================================================
  //  Étape 1 — le projet Supabase
  // ============================================================

  function ecranBase() {
    const s = settings();

    const urlIn = el('input', { type: 'text', value: projectId(s.supabaseUrl) || s.supabaseUrl,
                                placeholder: 'kwodqmaathesvqrnkvhn',
                                autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    const keyIn = el('input', { type: 'text', value: s.supabaseKey, placeholder: 'sb_publishable_…',
                                autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    const credMsg = el('div.hint');
    const apercu = el('div.hint');

    const majApercu = () => {
      const u = toSupabaseUrl(urlIn.value);
      apercu.textContent = u ? `→ ${u}` : '';
    };
    urlIn.addEventListener('input', majApercu);
    majApercu();

    const valider = el('button.btn.primary.block', { type: 'button', text: 'Vérifier et continuer' });
    valider.onclick = async () => {
      const url = toSupabaseUrl(urlIn.value);
      const key = keyIn.value.trim();
      const errs = checkCredentials(url, key);
      if (errs.length) {
        credMsg.innerHTML = '';
        errs.forEach(e => credMsg.append(el('div', { style: { color: 'var(--danger)' }, text: e })));
        return;
      }
      valider.disabled = true; valider.textContent = 'Vérification…';
      saveSettings({ supabaseUrl: url, supabaseKey: key });
      try {
        const sb = await getClient();
        const { error } = await sb.auth.getSession();
        if (error) throw error;
        toast('Projet joignable');
        await afficher(2);
      } catch (e) {
        credMsg.innerHTML = '';
        credMsg.append(el('div', { style: { color: 'var(--danger)' }, text: 'Échec : ' + e.message }));
        valider.disabled = false; valider.textContent = 'Vérifier et continuer';
      }
    };

    return el('div', {},
      el('div.wiz-titre', { text: 'Créer ta base Supabase' }),
      el('div.wiz-intro', { text: 'Tes plongées seront stockées dans ta propre base — gratuite, '
        + 'et à toi seul. Trois étapes, une seule fois, cinq minutes.' }),

      el('div.card', {},
        el('ol.wiz-liste', {},
          el('li', {}, 'Ouvre ', el('a', { href: 'https://supabase.com/dashboard', target: '_blank',
            rel: 'noopener', style: { color: 'var(--accent)' } }, 'supabase.com/dashboard'),
            ' et crée un compte (gratuit).'),
          el('li', {}, 'Bouton ', el('b', { text: 'New project' }), '. Nom au choix, région Europe.'),
          el('li', {}, 'Attends une à deux minutes que le projet soit prêt.'),
          el('li', {}, el('b', { text: 'Project Settings → General' }), ' : copie le ',
            el('b', { text: 'Project ID' }), '.'),
          el('li', {}, el('b', { text: 'Project Settings → API Keys' }), ' : copie la clé ',
            el('b', { text: 'publishable' }), '.'),
        ),
      ),

      el('div.card', {},
        field('Project ID', urlIn, apercu),
        field('Clé publiable', keyIn,
          el('span', {}, 'Cette clé est ', el('b', { text: 'faite pour être publique' }),
            ' : elle n’ouvre que ce que les règles de sécurité autorisent. '
          + 'Jamais la clé ', el('b', { text: 'secret' }), ' — l’app la refuserait.')),
        credMsg,
      ),

      el('div.wiz-actions', {}, valider),
      el('div.hint', { style: { textAlign: 'center' } },
        'En local, tu peux préremplir ces champs via le fichier ',
        el('code', { text: 'credentials.json' }), ' — ignoré par git.'),
    );
  }

  // ============================================================
  //  Étape 2 — les tables
  // ============================================================

  async function ecranTables() {
    const bloc = el('div');
    const etat = el('div.card', {}, el('div.hint', { style: { marginTop: 0 }, text: 'Vérification…' }));

    const rendre = async () => {
      const probe = await probeSchema();
      schemaOk = probe.ready;
      etat.innerHTML = '';

      if (probe.ready) {
        saveSettings({ schemaReady: true });
        etat.append(
          el('div', { style: { color: 'var(--ok)', fontWeight: '650', fontSize: '15px' },
            text: `✓ Tables en place (schéma v${probe.version})` }),
          el('div.hint', { text: 'Rien à refaire. Ce contrôle est automatique à chaque ouverture.' }),
        );
        actions.innerHTML = '';
        actions.append(
          el('button.btn.primary.block', { type: 'button', text: 'Continuer',
            onclick: () => afficher(3) }),
          el('button.btn.sm.ghost.block', { type: 'button', text: 'Revoir le script',
            style: { marginTop: '8px' }, onclick: montrerScript }),
        );
        return;
      }

      etat.append(
        el('div', { style: { color: 'var(--warn)', fontWeight: '650' }, text: '⚠ Tables absentes' }),
        el('div.hint', { text: 'Le script crée les tables, les règles de sécurité qui rendent tes '
          + 'plongées illisibles sans ton mot de passe, et le dossier des tampons. '
          + 'Le relancer plus tard ne casse rien.' }),
        probe.reason && probe.reason !== 'absent'
          ? el('div.hint', { style: { color: 'var(--warn)' }, text: probe.reason }) : null,
      );

      actions.innerHTML = '';
      actions.append(
        el('button.btn.primary.block', { type: 'button', text: 'J’ai exécuté le script — vérifier',
          onclick: async () => { etat.innerHTML = ''; etat.append(
            el('div.hint', { style: { marginTop: 0 }, text: 'Vérification…' })); await rendre(); } }),
      );
    };

    const actions = el('div.wiz-actions');

    bloc.append(
      el('div.wiz-titre', { text: 'Préparer les tables' }),
      el('div.wiz-intro', { text: 'Une seule manipulation, une seule fois.' }),

      el('div.card', {},
        el('ol.wiz-liste', {},
          el('li', {}, 'Copie le script ci-dessous.'),
          el('li', {}, 'Dans Supabase : ', el('b', { text: 'SQL Editor → New query' }),
            ', colle, puis ', el('b', { text: 'Run' }), '.'),
          el('li', {}, 'Reviens ici et valide.'),
        ),
        el('div.btn-row', {},
          copyBtn(loadSchema, '📋 Copier le script SQL'),
          el('a', { class: 'btn sm ghost', target: '_blank', rel: 'noopener',
            href: dashboardLink('/sql/new') }, 'Ouvrir SQL Editor'),
        ),
      ),

      etat, actions,
      el('div.hint', { style: { textAlign: 'center' } },
        el('button.btn.sm.ghost', { type: 'button', text: '← Revenir aux identifiants',
          onclick: () => afficher(1) })),
    );

    await rendre();
    return bloc;
  }

  async function montrerScript() {
    let sql = '';
    try { sql = await loadSchema(); } catch (e) { return toast(e.message, true); }
    openModal(close => el('div', {},
      el('h3', { text: 'Script d’initialisation' }),
      el('textarea', { readonly: true, value: sql,
        style: { height: '46vh', fontSize: '11px', fontFamily: 'monospace' } }),
      el('div.btn-row', {}, copyBtn(sql, '📋 Copier'),
        el('button.btn.ghost', { type: 'button', text: 'Fermer', onclick: close })),
    ));
  }

  // ============================================================
  //  Étape 3 — l'accès
  // ============================================================

  function ecranAcces() {
    // Une base déjà initialisée a forcément servi : un mot de passe existe,
    // même si CET appareil ne le sait pas. On propose donc de déverrouiller.
    const deja = carnetDejaInstalle(schemaOk);

    return el('div', {},
      el('div.wiz-titre', { text: deja ? 'Déverrouiller ton carnet' : 'Choisir ton mot de passe' }),
      el('div.wiz-intro', { text: deja
        ? 'Ce carnet a déjà un mot de passe. Ton adresse te sera demandée une fois sur '
        + 'ce nouvel appareil, puis mémorisée.'
        : 'Un seul mot de passe protège tout le carnet. Une adresse email est demandée '
        + 'une fois, uniquement pour pouvoir le réinitialiser si tu l’oublies.' }),

      el('div.card', { style: { background: 'rgba(255,180,84,.09)', borderColor: 'var(--warn)' } },
        el('div', { style: { fontWeight: '650', marginBottom: '6px' },
          text: '⚠ À vérifier dans Supabase' }),
        el('div.hint', { style: { marginTop: 0 },
          text: 'Par défaut, Supabase exige de confirmer son adresse par email avant '
              + 'd’autoriser la connexion. Tant que le lien n’est pas cliqué, le mot de passe '
              + 'est refusé — avec un message trompeur.' }),
        el('div.hint', {}, 'Pour un carnet personnel : ',
          el('a', { href: dashboardLink('/auth/providers'), target: '_blank', rel: 'noopener',
            style: { color: 'var(--accent)' } }, 'Authentication → Sign In / Providers → Email'),
          ' → décoche ', el('b', { text: 'Confirm email' }), '.'),
        el('div.hint', {}, 'Une fois ton mot de passe créé, décoche aussi ',
          el('b', { text: 'Allow new users to sign up' }), ' : personne d’autre ne pourra '
          + 'créer de compte sur ta base.'),
      ),

      el('div.wiz-actions', {},
        el('button.btn.primary.block', {
          type: 'button',
          text: deja ? 'Déverrouiller mon carnet' : 'Définir mon mot de passe',
          onclick: () => navigate(deja ? 'verrou' : 'motdepasse'),
        }),
        el('button.btn.ghost.block', { type: 'button', style: { marginTop: '8px' },
          text: deja ? 'Première installation : créer le mot de passe' : 'J’ai déjà un mot de passe',
          onclick: () => navigate(deja ? 'motdepasse' : 'verrou'),
        }),
      ),

      el('div.hint', { style: { textAlign: 'center' } },
        el('button.btn.sm.ghost', { type: 'button', text: '← Revenir aux tables',
          onclick: () => afficher(2) })),
    );
  }

  wrap.append(scene);
  await afficher(etape);

  return { title: 'Installation', node: wrap };
}

// ============================================================
//  Réglages — carnet ouvert
// ============================================================

async function ecranReglages(session) {
  const s = settings();
  const wrap = el('div');

  wrap.append(el('div.card', {},
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } },
      el('div', {},
        el('div', { style: { fontWeight: '650' }, text: 'Carnet ouvert' }),
        el('div', { style: { color: 'var(--text-dim)', fontSize: '13px' },
          text: projectId() || s.supabaseUrl }),
      ),
      el('span.badge.ens', { text: 'en ligne' }),
    ),
  ));

  wrap.append(el('div.section', {},
    el('h2', { text: 'Sécurité' }),
    await securitySection(),
  ));

  // ---------- Cartes ----------
  const gmapIn = el('input', { type: 'text', value: s.googleMapsKey,
                               placeholder: 'Vide = OpenStreetMap (gratuit)',
                               autocapitalize: 'off', spellcheck: 'false' });

  wrap.append(el('div.section', {},
    el('h2', { text: 'Cartes' }),
    el('div.card', {},
      field('Clé Google Maps (optionnelle)', gmapIn,
        'Sans clé, l’app utilise OpenStreetMap avec fond satellite — largement suffisant '
      + 'pour poser un point dans l’eau.'),
      el('div.btn-row', {},
        el('button.btn.sm', { type: 'button', text: 'Enregistrer',
          onclick: () => { saveSettings({ googleMapsKey: gmapIn.value.trim() }); toast('Réglage enregistré'); } }),
        el('button.btn.sm.ghost', { type: 'button', text: '🔐 Comment la protéger', onclick: tutoGoogleMaps }),
      ),
      el('div.hint', { style: { color: 'var(--warn)' },
        text: '⚠ Une « Maps Demo Key » (obtenue sans carte bancaire) ne convient pas : bac à '
            + 'sable bridé, sans Places API, impossible à restreindre. Reste sur OpenStreetMap.' }),
    ),
  ));

  // ---------- Suunto ----------
  wrap.append(el('div.section', {},
    el('h2', { text: 'Ordinateur de plongée' }),
    el('div.card', {},
      el('div.hint', { style: { marginTop: 0 },
        text: 'Optionnel : la liaison Suunto exige un compte développeur et le déploiement '
            + 'd’une fonction côté serveur. Marche à suivre dans le README.' }),
      field('URL de redirection à déclarer chez Suunto',
        el('input', { type: 'text', readonly: true, value: suuntoRedirectUri() })),
      el('div.btn-row', {},
        copyBtn(suuntoRedirectUri(), '📋 Copier la redirection'),
        copyBtn(appUrl(), '📋 Copier l’URL de l’app'),
      ),
    ),
  ));

  // ---------- Maintenance ----------
  wrap.append(el('div.section', {},
    el('h2', { text: 'Maintenance' }),
    el('div.card', {},
      el('div.btn-row', { style: { marginTop: 0 } },
        el('button.btn.sm', { type: 'button', text: 'Recharger depuis la base',
          onclick: async () => {
            try { await initStore({ force: true }); toast('Carnet rechargé'); }
            catch (e) { toast(e.message, true); }
          } }),
        el('button.btn.sm.ghost', { type: 'button', text: 'Revoir le script SQL',
          onclick: async () => {
            let sql = '';
            try { sql = await loadSchema(); } catch (e) { return toast(e.message, true); }
            openModal(close => el('div', {},
              el('h3', { text: 'Script d’initialisation' }),
              el('textarea', { readonly: true, value: sql,
                style: { height: '46vh', fontSize: '11px', fontFamily: 'monospace' } }),
              el('div.btn-row', {}, copyBtn(sql, '📋 Copier'),
                el('button.btn.ghost', { type: 'button', text: 'Fermer', onclick: close })),
            ));
          } }),
      ),
      el('div.hint', { text: 'Oublier la configuration efface les identifiants de CET appareil. '
        + 'Ta base et tes plongées ne sont pas touchées : il suffira de recoller le Project ID '
        + 'et la clé pour les retrouver.' }),
      el('div.btn-row', {},
        el('button.btn.danger', { type: 'button', text: 'Oublier cette configuration',
          onclick: async () => {
            if (!await confirmBox('Oublier les identifiants sur cet appareil ?', 'Oublier')) return;
            try { const sb = await getClient(); await sb.auth.signOut(); } catch { /* pas de session */ }
            resetSettings(); resetStore();
            toast('Configuration effacée');
            navigate('setup', true);
          } })),
    ),
  ));

  return wrap;
}
