// ============================================================
//  Réglages
//
//  Trois choses à régler, toutes propres à CET appareil :
//   - où vit le carnet (dépôt GitHub privé, ou appareil seul) ;
//   - l'apparence (thème) ;
//   - une sauvegarde manuelle, au cas où.
// ============================================================

import { el, toast, confirmBox } from '../lib.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import {
  configGitHub, enregistrerConfigGitHub, oublierConfigGitHub, estConfigure,
  testerConnexion, lienCreationJeton,
} from '../github.js';
import { modeActuel, rebrancher, synchroniser, derniereSynchro, erreurGitHub } from '../store-github.js';
import { THEMES, themeChoisi, choisirTheme } from '../theme.js';
import {
  estApk, versionInstallee, verifier, nouveautes, telechargerApk, taillePropre,
} from '../maj-apk.js';

const PAGES = 'https://soaresden.github.io/PlongeeJournal/';
const APK = 'https://github.com/soaresden/PlongeeJournal/releases/latest/download/PlongeeJournal.apk';

function quand(iso) {
  if (!iso) return 'jamais';
  const d = new Date(iso);
  const min = Math.round((Date.now() - d) / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

const ETAT = {
  github:              { classe: 'ok',      icone: 'i-cloud',   titre: 'Connecté à GitHub' },
  'github-hors-ligne': { classe: 'offline', icone: 'i-offline', titre: 'GitHub injoignable — hors ligne' },
  'github-erreur':     { classe: 'error',   icone: 'i-alert',   titre: 'Problème avec GitHub' },
  local:               { classe: 'local',   icone: 'i-device',  titre: 'Mode local' },
};

const ico = id => el('span.ico-wrap', { html: `<svg class="ico"><use href="#${id}"/></svg>` });

export async function reglagesView() {
  const wrap = el('div.reglages');
  const cfg = configGitHub();
  const mode = modeActuel();
  const info = ETAT[mode] || ETAT.local;

  // ---------- État ----------
  const texteEtat = {
    github: `Tout ce que tu saisis part en direct dans ${cfg.owner}/${cfg.repo} (${cfg.path}). `
          + `Dernière synchro : ${quand(derniereSynchro())}.`,
    'github-hors-ligne': 'Tu travailles sur la copie de l’appareil. Rien n’est perdu : '
          + 'les modifications partiront toutes seules au retour du réseau.',
    'github-erreur': erreurGitHub() || 'GitHub a refusé la dernière opération.',
    local: 'Le carnet reste sur cet appareil uniquement. Branche ton dépôt GitHub privé '
          + 'ci-dessous pour le retrouver sur le téléphone, la tablette et le PC.',
  }[mode];

  wrap.append(el(`div.card.etat-carte.${info.classe}`, {},
    el('div.etat-ligne', {},
      ico(info.icone),
      el('div', { style: { flex: 1, minWidth: 0 } },
        el('div.etat-titre', { text: info.titre }),
        el('div.hint', { style: { marginTop: '2px' }, text: texteEtat }))),
    mode !== 'local'
      ? el('div.btn-row', { style: { marginTop: '12px' } },
          el('button.btn.sm', { type: 'button', text: '↻ Synchroniser maintenant', onclick: async e => {
            e.currentTarget.disabled = true;
            const change = await synchroniser().catch(() => false);
            toast(modeActuel() === 'github'
              ? (change ? 'Carnet mis à jour depuis GitHub' : 'Déjà à jour')
              : (erreurGitHub() || 'GitHub injoignable'), modeActuel() !== 'github');
            navigate('reglages', true);
          } }),
          el('a.btn.sm.ghost', { href: `https://github.com/${cfg.owner}/${cfg.repo}/commits/${cfg.branch}`,
            target: '_blank', rel: 'noopener', text: 'Historique sur GitHub ↗' }))
      : null));

  // ---------- Dépôt GitHub ----------
  const champ = (label, input, aide) => el('div.field', {},
    el('label.lbl', { text: label }), input, aide ? el('div.hint', { text: aide }) : null);

  const owner  = el('input', { type: 'text', value: cfg.owner, placeholder: 'soaresden',
    autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
  const repo   = el('input', { type: 'text', value: cfg.repo, placeholder: 'PlongeeJournal-data',
    autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
  const branch = el('input', { type: 'text', value: cfg.branch, autocapitalize: 'off', spellcheck: 'false' });
  const path   = el('input', { type: 'text', value: cfg.path, autocapitalize: 'off', spellcheck: 'false' });
  const token  = el('input', { type: 'password', value: cfg.token,
    placeholder: 'github_pat_…', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
  const voir = el('button.btn.sm.ghost', { type: 'button', text: '👁', 'aria-label': 'Afficher le jeton',
    onclick: () => { token.type = token.type === 'password' ? 'text' : 'password'; } });

  const lire = () => ({ owner: owner.value, repo: repo.value, branch: branch.value,
    path: path.value, token: token.value });

  const resultat = el('div.hint', { style: { minHeight: '1.4em' } });

  const avance = el('details.avance', {},
    el('summary', { text: 'Options avancées' }),
    el('div.row', {}, champ('Branche', branch), champ('Fichier', path)));

  wrap.append(el('div.section', {},
    el('h2', { text: 'Dépôt GitHub privé' }),
    el('div.card', {},
      el('div.row', {},
        champ('Compte', owner),
        champ('Dépôt', repo)),
      avance,
      champ('Jeton d’accès',
        el('div.inline', {}, token, voir),
        'Gardé uniquement sur cet appareil. Jamais dans le carnet ni dans le code.'),
      resultat,
      el('div.btn-row', {},
        el('button.btn.primary', { type: 'button', text: estConfigure(cfg) ? 'Enregistrer' : 'Connecter', onclick: async e => {
          const b = e.currentTarget;
          const c = lire();
          if (!c.owner || !c.repo || !c.token) { resultat.textContent = 'Compte, dépôt et jeton sont nécessaires.'; return; }
          b.disabled = true;
          resultat.textContent = 'Vérification auprès de GitHub…';
          try {
            const r = await testerConnexion({ ...configGitHub(), ...c });
            if (!r.prive && !(await confirmBox(
              `${r.nom} est PUBLIC : n’importe qui pourrait lire ton carnet. Continuer quand même ?`,
              'Continuer', true))) { b.disabled = false; resultat.textContent = ''; return; }
            enregistrerConfigGitHub(c);
            const st = await rebrancher();
            toast(st.mode === 'github' ? `Connecté — ${st.plongees} plongée(s) sur GitHub` : (erreurGitHub() || 'Enregistré'),
              st.mode !== 'github');
            navigate('reglages', true);
          } catch (err) {
            resultat.textContent = '⚠ ' + err.message;
            b.disabled = false;
          }
        } }),
        el('button.btn.ghost', { type: 'button', text: 'Tester', onclick: async () => {
          resultat.textContent = 'Test…';
          try {
            const r = await testerConnexion({ ...configGitHub(), ...lire() });
            resultat.textContent = `✓ ${r.nom} ${r.prive ? '(privé)' : '(⚠ public)'} — lecture et écriture OK`;
          } catch (err) { resultat.textContent = '⚠ ' + err.message; }
        } })),
      estConfigure(cfg)
        ? el('button.btn.sm.danger', { type: 'button', style: { marginTop: '12px' },
            text: 'Débrancher (passer en mode local)', onclick: async () => {
              if (!(await confirmBox('Débrancher GitHub sur cet appareil ? Le carnet reste sur GitHub '
                + 'et une copie reste ici ; seul le jeton est oublié.', 'Débrancher', false))) return;
              oublierConfigGitHub();
              await rebrancher();
              toast('Mode local');
              navigate('reglages', true);
            } })
        : null),

    el('details.card.aide', { open: !estConfigure(cfg) },
      el('summary', { text: 'Comment obtenir le jeton (2 minutes, une seule fois)' }),
      el('ol.wiz-liste', {},
        el('li', {}, 'Ouvre ', el('a', { href: lienCreationJeton(), target: '_blank', rel: 'noopener',
          text: 'la page de création de jeton GitHub ↗' }), '.'),
        el('li', {}, 'Repository access : ', el('b', { text: 'Only select repositories' }), ' → ',
          el('code', { text: cfg.repo || 'PlongeeJournal-data' }), '.'),
        el('li', {}, 'Permissions → Repository → ', el('b', { text: 'Contents : Read and write' }),
          '. Rien d’autre.'),
        el('li', {}, 'Generate token, copie la valeur ', el('code', { text: 'github_pat_…' }),
          ' et colle-la ci-dessus. Fais pareil sur chaque appareil (ou crée un jeton par appareil).')),
      el('div.hint', { text: 'Ce jeton ne donne accès qu’au dépôt du carnet : ni à ton mot de passe, '
        + 'ni à tes autres dépôts. Tu peux le révoquer à tout moment depuis GitHub.' }))));

  // ---------- Apparence ----------
  const actuel = themeChoisi();
  const grille = el('div.themes');
  THEMES.forEach(t => {
    const [fond, surface, accent] = t.apercu;
    const b = el('button.theme-choix', { type: 'button', 'aria-pressed': String(t.id === actuel),
      onclick: () => {
        choisirTheme(t.id);
        grille.querySelectorAll('.theme-choix').forEach(x => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
      } },
      el('span.theme-apercu', { style: { background: fond } },
        el('span.theme-carte', { style: { background: surface } },
          el('span.theme-trait', { style: { background: accent } }),
          el('span.theme-trait.court', { style: { background: accent, opacity: '.45' } })),
        el('span.theme-rond', { style: { background: accent } })),
      el('span.theme-nom', { text: t.nom }),
      el('span.theme-sous', { text: t.sous }));
    grille.append(b);
  });
  wrap.append(el('div.section', {}, el('h2', { text: 'Apparence' }), grille));

  // ---------- Sauvegarde manuelle ----------
  wrap.append(el('div.section', {},
    el('h2', { text: 'Sauvegarde' }),
    el('div.card', {},
      el('div.hint', { style: { marginTop: 0, marginBottom: '10px' },
        text: estConfigure(cfg)
          ? 'GitHub garde déjà chaque version du carnet (un commit par modification). '
          + 'Un export reste utile comme copie hors de GitHub.'
          : 'En mode local, exporte régulièrement : si l’appareil est perdu, le carnet l’est aussi.' }),
      el('div.btn-row', { style: { marginTop: 0 } },
        el('button.btn.sm', { type: 'button', text: '⬇ Exporter le carnet', onclick: async () => {
          const json = await store.exportAll();
          await telecharger(json, `carnet-${new Date().toISOString().slice(0, 10)}.json`);
        } }),
        el('label.btn.sm', { style: { cursor: 'pointer' } }, '⬆ Importer un fichier',
          el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' },
            onchange: async e => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                await store.importAll(await f.text(), { merge: true });
                toast('Import terminé — fusionné avec le carnet');
                navigate('dives', true);
              } catch (err) { toast(err.message, true); }
            } }))))));

  // ---------- Mise à jour de l'APK ----------
  if (estApk()) wrap.append(carteMiseAJour());

  // ---------- Applis ----------
  wrap.append(el('div.section', {},
    el('h2', { text: 'Sur tes autres appareils' }),
    el('div.card', {},
      el('div.kv', {}, el('span.k', { text: 'Site web' }),
        el('a.v', { href: PAGES, target: '_blank', rel: 'noopener', text: 'soaresden.github.io/PlongeeJournal ↗' })),
      el('div.kv', {}, el('span.k', { text: 'Appli Android' }),
        el('a.v', { href: APK, target: '_blank', rel: 'noopener', text: 'Télécharger l’APK ↗' })),
      el('div.hint', { text: 'Même carnet partout : il suffit de brancher le même dépôt dans les réglages de chaque appareil.' }))));

  return { title: 'Réglages', node: wrap, back: true };
}

function dateCourte(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(+d) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Carte « Appli Android » : version installée, dernière sur GitHub, bouton. */
function carteMiseAJour() {
  const vInstallee = el('span.v', { text: '…' });
  const vGitHub = el('span.v', { text: '…' });
  const message = el('div.maj-message');
  const liste = el('ul.maj-nouveautes');
  const bouton = el('button.btn.block', { type: 'button', text: 'Vérifier les mises à jour' });
  let installee = null;

  async function lancer() {
    bouton.disabled = true;
    bouton.className = 'btn block';
    bouton.textContent = 'Vérification…';
    message.className = 'maj-message';
    message.textContent = '';
    liste.replaceChildren();
    try {
      const res = await verifier();
      installee = res.installee;
      const d = res.derniere;
      vGitHub.textContent = `${d.version}${d.date ? ` · ${dateCourte(d.date)}` : ''}`;
      if (res.etat === 'a-jour') {
        message.className = 'maj-message ok';
        message.textContent = '✓ Tu as la dernière version.';
        bouton.textContent = 'Vérifier à nouveau';
        bouton.onclick = lancer;
      } else {
        message.className = 'maj-message neuf';
        message.textContent = res.etat === 'nouvelle'
          ? `Nouvelle version disponible : ${d.version}.`
          : 'Impossible de savoir quelle version est installée — tu peux reprendre la dernière par sécurité.';
        bouton.className = 'btn primary block';
        bouton.textContent = `Télécharger la ${d.version}${d.taille ? ` (${taillePropre(d.taille)})` : ''}`;
        bouton.onclick = () => {
          telechargerApk(d.url);
          toast('Téléchargement lancé : ouvre le fichier quand il est arrivé, puis « Installer ».');
        };
        if (res.etat === 'nouvelle') {
          const titres = await nouveautes(installee?.commit, d.commit);
          if (titres.length) {
            liste.replaceChildren(...titres.slice(0, 8).map(t => el('li', { text: t })),
              titres.length > 8 ? el('li.hint', { text: `… et ${titres.length - 8} autre${titres.length > 9 ? 's' : ''}` }) : null);
          }
        }
      }
    } catch (err) {
      vGitHub.textContent = '—';
      message.className = 'maj-message erreur';
      message.textContent = err.message;
      bouton.textContent = 'Réessayer';
      bouton.onclick = lancer;
    } finally {
      bouton.disabled = false;
    }
  }

  versionInstallee().then(v => {
    installee = v;
    vInstallee.textContent = v
      ? `${v.version}${v.date ? ` · ${dateCourte(v.date)}` : ''}`
      : 'inconnue';
  });
  bouton.onclick = lancer;
  lancer();

  return el('div.section', {},
    el('h2', { text: 'Appli Android' }),
    el('div.card.carte-maj', {},
      el('div.kv', {}, el('span.k', { text: 'Installée' }), vInstallee),
      el('div.kv', {}, el('span.k', { text: 'Dernière sur GitHub' }), vGitHub),
      message, liste, bouton,
      el('div.hint', { text: 'Le fichier se télécharge depuis ton dépôt GitHub ; Android te demande '
        + 'ensuite de confirmer l’installation. Ton carnet et tes réglages sont conservés.' })));
}

/** Téléchargement qui marche aussi dans l'APK (où <a download> est ignoré). */
async function telecharger(texte, nom) {
  const blob = new Blob([texte], { type: 'application/json' });
  const fichier = typeof File === 'function' ? new File([blob], nom, { type: 'application/json' }) : null;
  if (window.Capacitor && fichier && navigator.canShare?.({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier], title: nom }); return; } catch { /* annulé */ }
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: nom });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
