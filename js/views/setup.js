// ============================================================
//  Installation guidée & réglages
//
//  Ce dépôt est public et ne contient aucune clé. Cet écran conduit
//  pas à pas : créer sa base, la remplir, choisir son mot de passe.
//  Chaque étape se coche toute seule quand elle est faite, et
//  l'ensemble n'est à parcourir qu'une fois.
// ============================================================

import { el, toast, confirmBox, openModal } from '../lib.js';
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

async function probeSchema() {
  const sb = await getClient();
  const { data, error } = await sb.from('app_meta').select('value').eq('key', 'schema_version').maybeSingle();
  if (error) {
    if (/does not exist|schema cache|relation|not find the table/i.test(error.message)) {
      return { ready: false, reason: 'absent' };
    }
    return { ready: false, reason: error.message };
  }
  return { ready: true, version: data?.value ?? '?' };
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

export async function setupView() {
  const s = settings();
  const wrap = el('div');

  const session = isSupabaseConfigured() ? await getSession().catch(() => null) : null;
  const aLesCles = isSupabaseConfigured();
  let schemaOk = false;

  // ---------- Bandeau d'état ----------
  wrap.append(el('div.card', {},
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } },
      el('div', {},
        el('div', { style: { fontWeight: '650' },
          text: session ? 'Carnet ouvert' : aLesCles ? 'Base branchée, carnet verrouillé' : 'Installation à faire' }),
        el('div', { style: { color: 'var(--text-dim)', fontSize: '13px' },
          text: aLesCles ? projectId() || s.supabaseUrl : 'Aucune base Supabase reliée' }),
      ),
      el('span', { class: 'badge ' + (session ? 'ens' : aLesCles ? 'jour' : 'nuit'),
        text: session ? 'en ligne' : aLesCles ? 'verrouillé' : 'à installer' }),
    ),
  ));

  if (!aLesCles) {
    wrap.append(el('div.card', {},
      el('div.hint', { style: { marginTop: 0 } },
        'Tes plongées seront stockées dans ', el('b', { text: 'ta propre base Supabase' }),
        ' — gratuite, et à toi seul. Il y a trois choses à faire, une seule fois. '
      + 'Compte cinq minutes.'),
    ));
  }

  // ============================================================
  //  Étape 1 — le projet Supabase
  // ============================================================

  const urlIn = el('input', { type: 'text', value: projectId(s.supabaseUrl) || s.supabaseUrl,
                              placeholder: 'kwodqmaathesvqrnkvhn',
                              autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const keyIn = el('input', { type: 'text', value: s.supabaseKey, placeholder: 'sb_publishable_…',
                              autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const credMsg = el('div.hint');
  const urlPreview = el('div.hint');

  const refreshPreview = () => {
    const u = toSupabaseUrl(urlIn.value);
    urlPreview.textContent = u ? `→ ${u}` : '';
  };
  urlIn.addEventListener('input', refreshPreview);
  refreshPreview();

  const saveCreds = el('button.btn.primary', { type: 'button', text: 'Enregistrer et tester' });
  saveCreds.onclick = async () => {
    const url = toSupabaseUrl(urlIn.value);
    const key = keyIn.value.trim();
    const errs = checkCredentials(url, key);
    if (errs.length) {
      credMsg.innerHTML = '';
      errs.forEach(e => credMsg.append(el('div', { style: { color: 'var(--danger)' }, text: e })));
      return;
    }
    saveCreds.textContent = 'Test en cours…'; saveCreds.disabled = true;
    saveSettings({ supabaseUrl: url, supabaseKey: key });
    try {
      const sb = await getClient();
      const { error } = await sb.auth.getSession();
      if (error) throw error;
      toast('Projet joignable');
      navigate('setup', true);
    } catch (e) {
      credMsg.innerHTML = '';
      credMsg.append(el('div', { style: { color: 'var(--danger)' }, text: 'Échec : ' + e.message }));
      saveCreds.textContent = 'Enregistrer et tester'; saveCreds.disabled = false;
    }
  };

  wrap.append(step(1, 'Créer ta base Supabase', aLesCles ? 'fait' : 'encours',
    el('div.card', {},
      el('ol', { style: { margin: '0 0 14px', paddingLeft: '20px', color: 'var(--text-dim)',
                          fontSize: '14px', lineHeight: '1.8' } },
        el('li', {}, 'Ouvre ', el('a', { href: 'https://supabase.com/dashboard', target: '_blank',
          rel: 'noopener', style: { color: 'var(--accent)' } }, 'supabase.com/dashboard'),
          ' et crée un compte (gratuit).'),
        el('li', {}, 'Bouton ', el('b', { text: 'New project' }), '. Donne-lui un nom, choisis une '
          + 'région proche (Europe), et note le mot de passe de base qu’il te demande — '
          + 'l’app n’en aura pas besoin, mais Supabase peut te le redemander.'),
        el('li', {}, 'Attends que le projet soit prêt (une à deux minutes).'),
        el('li', {}, el('b', { text: 'Project Settings → General' }), ' : copie le ',
          el('b', { text: 'Project ID' }), '.'),
        el('li', {}, el('b', { text: 'Project Settings → API Keys' }), ' : copie la clé ',
          el('b', { text: 'publishable' }), ' (elle commence par ', el('code', { text: 'sb_publishable_' }), ').'),
      ),
      field('Project ID', urlIn, urlPreview),
      field('Clé publiable', keyIn,
        el('span', {}, 'Cette clé est ', el('b', { text: 'faite pour être publique' }),
          ' : elle n’ouvre que ce que les règles de sécurité de la base autorisent. '
        + 'En revanche, ne colle jamais ici la clé ', el('b', { text: 'secret' }),
          ' — l’app la refuserait.')),
      credMsg,
      el('div.btn-row', {}, saveCreds),
      el('div.hint', {}, 'Astuce : en local, tu peux préremplir ces deux champs via le fichier ',
        el('code', { text: 'credentials.json' }), ' à la racine du projet. Il est ignoré par git.'),
    ),
  ));

  if (!aLesCles) {
    wrap.append(el('div.hint', { style: { textAlign: 'center' },
      text: 'Les étapes 2 et 3 apparaîtront une fois cette première validée.' }));
    return { title: 'Installation', node: wrap, back: !!session };
  }

  // ============================================================
  //  Étape 2 — les tables
  // ============================================================

  const schemaBox = el('div.card');
  const etape2 = step(2, 'Préparer les tables', 'encours', schemaBox);
  wrap.append(etape2);

  async function showScript() {
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

  async function renderSchemaStep() {
    schemaBox.innerHTML = '';
    schemaBox.append(el('div.hint', { style: { marginTop: 0 }, text: 'Vérification…' }));

    const probe = await probeSchema();
    schemaOk = probe.ready;
    schemaBox.innerHTML = '';

    // met à jour la pastille de l'étape
    const puce = etape2.querySelector('span');
    if (probe.ready) {
      puce.textContent = '✓';
      puce.style.background = 'var(--ok)'; puce.style.borderColor = 'var(--ok)'; puce.style.color = '#05202a';
    }

    if (probe.ready) {
      saveSettings({ schemaReady: true });
      schemaBox.append(
        el('div', { style: { color: 'var(--ok)', fontWeight: '600' },
          text: `Tables en place (schéma v${probe.version})` }),
        el('div.hint', { text: 'Rien à refaire : ce contrôle est automatique.' }),
        el('div.btn-row', {},
          el('button.btn.sm.ghost', { type: 'button', text: 'Revoir le script', onclick: showScript })),
      );
      return;
    }

    schemaBox.append(
      el('ol', { style: { margin: '0 0 14px', paddingLeft: '20px', color: 'var(--text-dim)',
                          fontSize: '14px', lineHeight: '1.8' } },
        el('li', {}, 'Copie le script ci-dessous.'),
        el('li', {}, 'Dans Supabase : ', el('b', { text: 'SQL Editor → New query' }),
          ', colle, puis ', el('b', { text: 'Run' }), '.'),
        el('li', {}, 'Reviens ici et clique sur « J’ai exécuté le script ».'),
      ),
      el('div.hint', { style: { marginTop: 0 },
        text: 'Le script crée les tables, les règles de sécurité qui rendent tes plongées '
            + 'illisibles sans ton mot de passe, et le dossier de stockage des tampons. '
            + 'Le relancer plus tard ne casse rien.' }),
      el('div.btn-row', {},
        copyBtn(loadSchema, '📋 Copier le script SQL'),
        el('a', { class: 'btn sm ghost', target: '_blank', rel: 'noopener',
          href: dashboardLink('/sql/new') }, 'Ouvrir SQL Editor'),
      ),
      el('div.btn-row', {},
        el('button.btn.primary', { type: 'button', text: 'J’ai exécuté le script', onclick: renderSchemaStep }),
        el('button.btn.sm.ghost', { type: 'button', text: 'Voir le script', onclick: showScript }),
      ),
      probe.reason && probe.reason !== 'absent'
        ? el('div.hint', { style: { color: 'var(--warn)' }, text: probe.reason }) : null,
    );
  }

  await renderSchemaStep();

  // ============================================================
  //  Étape 3 — le mot de passe
  // ============================================================

  // Si le schéma est en place, la base a déjà été installée — donc un
  // mot de passe existe, même si CET appareil ne le sait pas.
  const dejaInstalle = carnetDejaInstalle(schemaOk);
  const motDePasseFait = !!session;

  wrap.append(step(3, dejaInstalle ? 'Déverrouiller le carnet' : 'Choisir ton mot de passe',
    motDePasseFait ? 'fait' : schemaOk ? 'encours' : 'attente',
    session
      ? await securitySection()
      : el('div.card', {},
          // Une base déjà initialisée a presque toujours son mot de passe :
          // sur un appareil neuf, c'est « déverrouiller » qu'il faut proposer,
          // pas « créer ». L'inverse menait droit à « ce carnet a déjà un
          // mot de passe ».
          el('div.hint', { style: { marginTop: 0 },
            text: dejaInstalle
              ? 'Ce carnet a déjà un mot de passe. Déverrouille-le : ton adresse te sera '
              + 'demandée une fois sur ce nouvel appareil, puis mémorisée.'
              : 'Un seul mot de passe protège tout le carnet. Une adresse email te sera '
              + 'demandée une fois, uniquement pour pouvoir le réinitialiser si tu l’oublies.' }),
          !schemaOk
            ? el('div.hint', { style: { color: 'var(--warn)' }, text: 'Termine d’abord l’étape 2.' })
            : el('div.btn-row', {},
                el('button.btn.primary', {
                  text: dejaInstalle ? 'Déverrouiller mon carnet' : 'Définir mon mot de passe',
                  onclick: () => navigate(dejaInstalle ? 'verrou' : 'motdepasse'),
                }),
                el('button.btn.sm.ghost', {
                  text: dejaInstalle ? 'Première installation' : 'J’ai déjà un mot de passe',
                  onclick: () => navigate(dejaInstalle ? 'motdepasse' : 'verrou'),
                })),
          el('div.card', { style: { background: 'rgba(255,180,84,.09)', borderColor: 'var(--warn)',
                                    margin: '14px 0 0' } },
            el('div', { style: { fontWeight: '650', marginBottom: '6px' },
              text: '⚠ À faire AVANT de créer ton mot de passe' }),
            el('div.hint', { style: { marginTop: 0 } },
              'Par défaut, Supabase exige de confirmer son adresse par email avant d’autoriser '
            + 'la connexion. Tant que le lien n’est pas cliqué, le mot de passe est refusé — '
            + 'et le message affiché est trompeur : « mot de passe incorrect ».'),
            el('div.hint', {}, 'Pour un carnet personnel, le plus simple est de désactiver cette '
            + 'confirmation : ',
              el('a', { href: dashboardLink('/auth/providers'), target: '_blank', rel: 'noopener',
                style: { color: 'var(--accent)' } }, 'Authentication → Sign In / Providers → Email'),
              ' → décoche ', el('b', { text: 'Confirm email' }), '.'),
            el('div.hint', {}, 'Puis, ton mot de passe une fois créé, décoche aussi ',
              el('b', { text: 'Allow new users to sign up' }),
              ' au même endroit : personne d’autre ne pourra créer de compte sur ta base.'),
          ),
        ),
  ));

  // ============================================================
  //  Options
  // ============================================================

  const gmapIn = el('input', { type: 'text', value: s.googleMapsKey,
                               placeholder: 'Vide = OpenStreetMap (gratuit)',
                               autocapitalize: 'off', spellcheck: 'false' });

  wrap.append(el('div.section', { style: { marginTop: '28px' } },
    el('h2', { text: 'Options' }),

    el('div.card', {},
      el('div', { style: { fontWeight: '650', marginBottom: '4px' }, text: '🗺 Cartes' }),
      field('Clé Google Maps (optionnelle)', gmapIn,
        'Sans clé, l’app utilise OpenStreetMap avec fond satellite — largement suffisant '
      + 'pour poser un point dans l’eau.'),
      el('div.hint', { style: { color: 'var(--warn)' },
        text: '⚠ Une « Maps Demo Key » (obtenue sans carte bancaire) ne convient pas : '
            + 'c’est un bac à sable bridé, filigrané, sans Places API — donc sans '
            + 'autocomplétion de lieux — et elle n’apparaît pas dans tes Identifiants, '
            + 'ce qui la rend impossible à restreindre. Reste sur OpenStreetMap.' }),
      el('div.btn-row', {},
        el('button.btn.sm', { type: 'button', text: 'Enregistrer',
          onclick: () => { saveSettings({ googleMapsKey: gmapIn.value.trim() }); toast('Réglage enregistré'); } }),
        el('button.btn.sm.ghost', { type: 'button', text: '🔐 Comment la protéger', onclick: tutoGoogleMaps }),
      ),
      el('div.hint', { style: { color: 'var(--warn)' },
        text: '⚠ Une clé Google Maps est forcément visible dans le navigateur : c’est ainsi que '
            + 'Google l’a conçue. Ce qui la protège, c’est de la restreindre à TON site. '
            + 'Sans restriction, n’importe qui peut la récupérer et consommer ton quota.' }),
    ),

    el('div.card', {},
      el('div', { style: { fontWeight: '650', marginBottom: '4px' }, text: '⌚ Ordinateur de plongée Suunto' }),
      el('div.hint', { style: { marginTop: 0 },
        text: 'Optionnel, et à faire plus tard : la liaison exige un compte développeur Suunto '
            + 'et le déploiement d’une fonction côté serveur. La marche à suivre est dans le README.' }),
      field('URL de redirection à déclarer chez Suunto',
        el('input', { type: 'text', readonly: true, value: suuntoRedirectUri() })),
      el('div.btn-row', {},
        copyBtn(suuntoRedirectUri(), '📋 Copier la redirection'),
        copyBtn(appUrl(), '📋 Copier l’URL de l’app'),
      ),
    ),
  ));

  // ============================================================
  //  Maintenance
  // ============================================================

  wrap.append(el('div.section', {},
    el('h2', { text: 'Maintenance' }),
    el('div.card', {},
      session
        ? el('div.btn-row', { style: { marginTop: 0 } },
            el('button.btn.sm', { type: 'button', text: 'Recharger depuis la base',
              onclick: async () => {
                try { await initStore({ force: true }); toast('Carnet rechargé'); }
                catch (e) { toast(e.message, true); }
              } }))
        : null,
      el('div.hint', { text: 'Oublier la configuration efface les identifiants de CET appareil. '
        + 'Ta base Supabase et tes plongées ne sont pas touchées : il suffira de recoller le '
        + 'Project ID et la clé pour les retrouver.' }),
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

  return { title: session ? 'Réglages' : 'Installation', node: wrap, back: !!session };
}
