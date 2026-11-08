// ============================================================
//  Réglages
//
//  Uniquement des réglages, rangés par thème :
//   - Comptes : GitHub (où vit le carnet) et Suunto (les clés et la
//     liaison ; l'import lui-même est dans Divers → Suunto) ;
//   - Apparence (thème) ;
//   - Sauvegarde manuelle, au cas où ;
//   - Application : version de l'APK, autres appareils.
// ============================================================

import { el, toast, confirmBox } from '../lib.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import {
  configGitHub, enregistrerConfigGitHub, oublierConfigGitHub, estConfigure,
  testerConnexion, lienCreationJeton,
} from '../github.js';
import { modeActuel, rebrancher, synchroniser, derniereSynchro, erreurGitHub } from '../store-github.js';
import { THEMES, themeChoisi } from '../theme.js';
import { pastilleTheme } from '../volet-theme.js';
import {
  chargerLiaison, sauverLiaison, estRelie, clesCompletes, lienAutorisation, nouvelEtat, RETOUR_DEFAUT,
} from '../suunto-cloud.js';
import {
  estApk, versionInstallee, verifier, nouveautes, telechargerApk, taillePropre,
} from '../maj-apk.js';

import {
  lienAgenda, enregistrerLienAgenda, oublierAgenda, lienValide, agendaLisible, chargerAgenda,
} from '../agenda.js';

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

  // Seulement des réglages, rangés par thème. Les actions (import Suunto,
  // ajout de plongées…) vivent dans leurs écrans.
  wrap.append(el('div.section', {},
    el('h2', { text: 'Comptes' }),
    carteGitHub(),
    carteSuunto(),
    carteAgenda()));

  wrap.append(await sectionPartage());
  {
    const { carteVideosReglages } = await import('./videos.js');
    wrap.append(el('div.section', {}, el('h2', { text: 'Vidéos' }), await carteVideosReglages()));
  }
  wrap.append(sectionDonnees());

  const appli = el('div.section', {}, el('h2', { text: 'Application' }));
  if (estApk()) appli.append(carteMiseAJour());
  appli.append(el('div.card', {},
    el('div.kv', {}, el('span.k', { text: 'Site web' }),
      el('a.v', { href: PAGES, target: '_blank', rel: 'noopener', text: 'soaresden.github.io/PlongeeJournal ↗' })),
    el('div.kv', {}, el('span.k', { text: 'Appli Android' }),
      el('a.v', { href: APK, target: '_blank', rel: 'noopener', text: 'Télécharger l’APK ↗' })),
    el('div.hint', { text: 'Même carnet partout : il suffit de brancher le même dépôt GitHub sur chaque appareil.' })));
  wrap.append(appli);

  return { title: 'Réglages', node: wrap, back: true };
}

/**
 * Carte de compte repliable : une ligne (icône, nom, état), le détail
 * en dessous. `etat` est un nœud, pour pouvoir le mettre à jour.
 */
function carteCompte({ classe, icone, titre, etat, ouvert = false }) {
  const corps = el('div.compte-corps');
  const pastille = ico(icone);
  const carte = el(`details.card.compte.${classe}`, { open: ouvert },
    el('summary.compte-ligne', {},
      pastille,
      el('div.compte-texte', {}, el('div.etat-titre', { text: titre }), etat),
      el('span.compte-chevron', { 'aria-hidden': 'true' })),
    corps);
  const changer = (nouvelle, nouvelleIcone) => {
    carte.className = `card compte ${nouvelle}`;
    if (nouvelleIcone) pastille.innerHTML = `<svg class="ico"><use href="#${nouvelleIcone}"/></svg>`;
  };
  return { carte, corps, changer };
}

/** Compte GitHub : où vit le carnet. */
function carteGitHub() {
  const cfg = configGitHub();
  const mode = modeActuel();
  const info = ETAT[mode] || ETAT.local;
  const resume = {
    github: `${cfg.owner}/${cfg.repo} · synchro ${quand(derniereSynchro())}`,
    'github-hors-ligne': 'Injoignable : tu travailles hors ligne, rien n’est perdu',
    'github-erreur': 'Problème : ouvre pour voir le détail',
    local: 'Mode local : le carnet reste sur cet appareil',
  }[mode];
  const detail = {
    github: `Tout ce que tu saisis part en direct dans ${cfg.owner}/${cfg.repo} (${cfg.path}).`,
    'github-hors-ligne': 'Tu travailles sur la copie de l’appareil. Les modifications partiront toutes seules au retour du réseau.',
    'github-erreur': erreurGitHub() || 'GitHub a refusé la dernière opération.',
    local: 'Branche ton dépôt GitHub privé pour retrouver le carnet sur le téléphone, la tablette et le PC.',
  }[mode];

  const { carte, corps } = carteCompte({
    classe: info.classe, icone: info.icone, titre: 'GitHub',
    etat: el('div.hint.compte-etat', { text: resume }),
    ouvert: mode === 'local' || mode === 'github-erreur',
  });

  corps.append(el('div.hint', { style: { marginTop: 0 }, text: detail }));
  if (mode !== 'local') {
    corps.append(el('div.btn-row', { style: { marginTop: '10px' } },
      el('button.btn.sm', { type: 'button', text: '↻ Synchroniser maintenant', onclick: async e => {
        e.currentTarget.disabled = true;
        const change = await synchroniser().catch(() => false);
        toast(modeActuel() === 'github'
          ? (change ? 'Carnet mis à jour depuis GitHub' : 'Déjà à jour')
          : (erreurGitHub() || 'GitHub injoignable'), modeActuel() !== 'github');
        navigate('reglages', true);
      } }),
      el('a.btn.sm.ghost', { href: `https://github.com/${cfg.owner}/${cfg.repo}/commits/${cfg.branch}`,
        target: '_blank', rel: 'noopener', text: 'Historique ↗' })));
  }

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
  const lire = () => ({ owner: owner.value, repo: repo.value, branch: branch.value, path: path.value, token: token.value });
  const resultat = el('div.hint', { style: { minHeight: '1.4em' } });

  // append(null) écrirait « null » : les éléments facultatifs sont filtrés.
  const ajouter = (...n) => corps.append(...n.filter(x => x != null && x !== false));
  ajouter(
    el('div.compte-sous', { text: 'Dépôt GitHub privé' }),
    el('div.row', {}, champ('Compte', owner), champ('Dépôt', repo)),
    el('details.avance', {},
      el('summary', { text: 'Options avancées' }),
      el('div.row', {}, champ('Branche', branch), champ('Fichier', path))),
    champ('Jeton d’accès', el('div.inline', {}, token, voir),
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
    el('details.aide', { open: !estConfigure(cfg) },
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
        + 'ni à tes autres dépôts. Tu peux le révoquer à tout moment depuis GitHub.' })),
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
      : null);
  return carte;
}

function sectionApparence() {
  const bouton = el('button.card.theme-bouton', { type: 'button',
    onclick: async () => (await import('../volet-theme.js')).ouvrirVoletTheme() });
  const rendre = () => {
    const t = THEMES.find(x => x.id === themeChoisi()) || THEMES[0];
    bouton.replaceChildren(pastilleTheme(t),
      el('span', {}, el('b', { text: `🎨 Thème : ${t.nom}` }),
        el('span.hint', { style: { display: 'block', margin: '2px 0 0' },
          text: 'Toucher pour changer : les couleurs changent en direct. Aussi par « Thème » dans la barre du bas.' })));
  };
  rendre();
  const suivre = () => { if (!bouton.isConnected) document.removeEventListener('theme-change', suivre); else rendre(); };
  document.addEventListener('theme-change', suivre);
  return el('div.section', {}, el('h2', { text: 'Apparence' }), bouton);
}

/**
 * Un lien à donner (Alison…) : elle voit tout le carnet, ne peut rien
 * modifier. Le lien est gardé dans le carnet : on le retrouve ici, sur
 * chaque appareil.
 */
async function sectionPartage() {
  const carte = el('div.card.partage-carte');
  const rendre = async () => {
    const reglages = await store.getSettings();
    const p = reglages.partage || null;
    carte.replaceChildren();
    if (!estConfigure()) {
      carte.append(el('div.hint', { style: { margin: 0 }, text: 'Branche d’abord ton dépôt GitHub (ci-dessus) : le partage passe par ton compte.' }));
      return;
    }
    if (!p) {
      carte.append(
        el('div', { style: { fontWeight: '650' }, text: '🔗 Un lien en lecture seule' }),
        el('div.hint', { text: 'La personne voit tes plongées, stats, carte, plongeurs et « Qui je suis », sur son téléphone, '
          + 'sans rien installer ni pouvoir modifier. La copie est déposée sur ton site, sous un numéro tiré au hasard. '
          + 'Pour entrer, la personne donne son prénom et une plongée faite avec toi (date et lieu) : tu sais qui regarde. '
          + 'Ton contact d’urgence est montré ; restent cachés : les numéros de licence (les tiens et ceux des autres), '
          + 'ton adresse, ton groupe sanguin, les notes sur les plongeurs, les photos.' }),
        el('button.btn.primary.sm', { type: 'button', text: 'Créer le lien', onclick: e => publier(e.currentTarget, null) }));
      return;
    }
    const { lienPartage, qrSvg } = await import('../partage.js');
    const { blocFeuille } = await import('./feuille.js');
    const lien = lienPartage(p);
    // Le QR code du lien : à montrer sur le bateau, ou à imprimer.
    const qr = el('div.partage-qr');
    qrSvg(lien).then(svg => { qr.innerHTML = svg; }).catch(() => {});
    // Les visites : qui est entré (prénom, plongée faite ensemble).
    const visites = el('div.partage-visites');
    const rendreVisites = () => {
      const liste = (reglages.visites || []).slice(0, 30);
      const fmt = iso => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      visites.replaceChildren(
        el('div', { style: { fontWeight: '650', marginTop: '14px' }, text: `👀 Visites${liste.length ? ` (${(reglages.visites || []).length})` : ''}` }),
        liste.length
          ? el('div.histo-liste', {}, ...liste.map(v => el('div.histo-ligne', {},
              el('div', {}, el('b', { text: `${v.ok ? '✓' : '✗'} ${v.prenom || '?'}` }),
                el('div.hint', { style: { margin: 0 }, text: v.ok
                  ? `a plongé avec toi : ${v.plongee || `${v.lieu} le ${v.date?.split('-').reverse().join('/')}`}`
                  : `n’a pas trouvé : ${v.lieu} le ${v.date?.split('-').reverse().join('/')}` })),
              el('span.hint', { style: { margin: 0, whiteSpace: 'nowrap' }, text: fmt(v.at) }))))
          : el('div.hint', { text: 'Personne pour l’instant.' }),
        p.canal ? el('div.hint', { text: `Pour être prévenu tout de suite sur ton téléphone : installe l’appli « ntfy » et abonne-toi au canal « ${p.canal} ». `
          + (p.feuille ? '' : 'Sinon, les visites des 12 dernières heures sont relues à chaque ouverture du carnet.') }) : null,
        el('button.btn.sm', { type: 'button', text: '👀 Historique des visites', onclick: () => navigate('visites') }),
        el('button.btn.sm.ghost', { type: 'button', text: '↻ Relire les visites', onclick: async e => {
          e.currentTarget.disabled = true;
          try {
            const { relireLesVisites } = await import('../entretien.js');
            const n = await relireLesVisites();
            toast(n.length ? `${n.length} nouvelle(s) visite(s)` : 'Rien de nouveau');
            rendre();
          } catch (err) { toast(err.message, true); }
        } }));
    };
    rendreVisites();
    const champ = el('input', { type: 'text', readOnly: true, value: lien, class: 'partage-lien' });
    champ.onclick = () => champ.select();
    carte.append(
      el('div', { style: { fontWeight: '650' }, text: '🔗 Ton lien de partage (lecture seule)' }),
      p.gistId && !p.siteId ? el('div.hint', { text: 'Ancien lien (gist) : « Mettre à jour » en crée un nouveau, sur le site.' }) : null,
      champ, qr,
      el('div.hint', { text: `Mis à jour le ${new Date(p.majLe).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}. `
        + 'Il se met à jour tout seul quand tu ouvres l’appli après des changements.' }),
      el('div.btn-row', {},
        el('button.btn.primary.sm', { type: 'button', text: '📋 Copier', onclick: async () => {
          try { await navigator.clipboard.writeText(lien); toast('Lien copié'); } catch { champ.select(); toast('Sélectionné : copie-le'); }
        } }),
        navigator.share ? el('button.btn.sm', { type: 'button', text: '📤 Envoyer…', onclick: () =>
          navigator.share({ title: 'Mon carnet de plongée', text: 'Mon carnet de plongée (lecture seule)', url: lien }).catch(() => {}) }) : null,
        el('button.btn.sm.ghost', { type: 'button', text: '↻ Mettre à jour', onclick: e => publier(e.currentTarget, p.siteId ? p : null) }),
        el('button.btn.sm.danger', { type: 'button', text: 'Arrêter le partage', onclick: async () => {
          if (!(await confirmBox('Arrêter le partage ? Le lien ne mènera plus à rien (il faudra en redonner un nouveau).', 'Arrêter'))) return;
          try {
            const { arreterPartage } = await import('../partage.js');
            await arreterPartage(p);
            await store.saveSettings({ partage: null });
            toast('Partage arrêté');
            rendre();
          } catch (err) { toast(err.message, true); }
        } })),
      visites,
      // La feuille Google qui garde toutes les visites (ntfy : 12 h seulement).
      blocFeuille(p, async actuel => {
        try {
          const { publierPartage } = await import('../partage.js');
          const moi = await store.getDiver(await store.getActiveDiverId());
          const n = await publierPartage(await store.raw(), actuel, { auteur: moi?.prenom || '' });
          await store.saveSettings({ partage: { ...actuel, siteId: n.siteId, majLe: n.majLe, canal: n.canal } });
        } catch (e) { toast(e.message, true); }
        rendre();
      }));
  };
  async function publier(bouton, actuel) {
    bouton.disabled = true;
    const texte = bouton.textContent;
    bouton.textContent = 'Chiffrement et envoi…';
    try {
      const { publierPartage } = await import('../partage.js');
      const moi = await store.getDiver(await store.getActiveDiverId());
      const p = await publierPartage(await store.raw(), actuel || {}, { auteur: moi?.prenom || '' });
      await store.saveSettings({ partage: { ...(actuel || {}), siteId: p.siteId, majLe: p.majLe, canal: p.canal } });
      toast(actuel ? 'Lien mis à jour' : 'Lien créé : copie-le et envoie-le');
      rendre();
    } catch (e) {
      toast(e.message, true);
      bouton.disabled = false; bouton.textContent = texte;
    }
  }
  await rendre();
  return el('div.section', {}, el('h2', { text: 'Partager mon carnet' }), carte);
}

function sectionDonnees() {
  return el('div.section', {},
    el('h2', { text: 'Sauvegarde' }),
    el('div.card', {},
      el('div.hint', { style: { marginTop: 0, marginBottom: '10px' },
        text: estConfigure()
          ? 'GitHub garde déjà chaque version du carnet (un commit par modification). '
          + 'Un export reste utile comme copie hors de GitHub.'
          : 'En mode local, exporte régulièrement : si l’appareil est perdu, le carnet l’est aussi.' }),
      el('div.btn-row', { style: { marginTop: 0 } },
        el('button.btn.sm', { type: 'button', text: '🕘 Historique des changements', onclick: async () =>
          (await import('./historique.js')).ouvrirHistoriqueCarnet() }),
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
            } })))));
}

/** Compte Suunto : les clés de l'appli Suunto, puis la connexion. L'import, lui, est dans Divers → Suunto. */
/**
 * Mon agenda Google : le lien iCal secret, gardé sur l'appareil. Sert à
 * proposer un lieu d'après l'événement du jour de la plongée.
 */
function carteAgenda() {
  const etat = el('div.hint.compte-etat');
  const { carte, corps, changer } = carteCompte({ classe: 'local', icone: 'i-cloud', titre: 'Mon agenda', etat });

  const rendre = () => {
    corps.replaceChildren();
    const lien = lienAgenda();
    if (lien) {
      changer('ok');
      etat.textContent = agendaLisible() ? 'Relié sur cet appareil' : 'Relié · lisible seulement dans l’APK';
      const resultat = el('div.hint');
      corps.append(...[
        el('div.hint', { style: { marginTop: 0 }, text: 'Sur la fiche d’une plongée ou d’une séance sans lieu, l’appli te montre ce que dit ton agenda ce jour-là et te propose d’en faire le lieu.' }),
        agendaLisible() ? null : el('div.hint', { style: { color: 'var(--warn)' },
          text: 'Google ne laisse pas une page web lire ton agenda : ça ne marche que dans l’appli Android.' }),
        resultat,
        el('div.btn-row', {},
          agendaLisible() ? el('button.btn.sm', { type: 'button', text: 'Relire maintenant', onclick: async () => {
            resultat.textContent = 'Lecture…';
            try { const ev = await chargerAgenda({ forcer: true }); resultat.textContent = `${ev.length} événements lus.`; }
            catch (e) { resultat.textContent = e.message; }
          } }) : null,
          el('button.btn.sm.danger', { type: 'button', text: 'Oublier le lien', onclick: async () => {
            if (!(await confirmBox('Oublier le lien de ton agenda sur cet appareil ?', 'Oublier'))) return;
            oublierAgenda(); toast('Lien oublié'); rendre();
          } }))].filter(Boolean));     // append(null) écrirait « null »
      return;
    }

    changer('local');
    etat.textContent = 'Pas relié';
    const champ = el('input', { type: 'password', autocomplete: 'off', spellcheck: 'false',
      placeholder: 'https://calendar.google.com/calendar/ical/…/basic.ics' });
    corps.append(
      el('div.hint', { style: { marginTop: 0 }, text: 'Pour retrouver où tu étais le jour d’une plongée. Dans Google Agenda sur ordinateur : Paramètres → ton agenda → « Adresse secrète au format iCal ». Copie-la ici.' }),
      el('div.hint', { style: { color: 'var(--warn)' }, text: 'Ce lien donne accès à tout ton agenda : il reste sur cet appareil, il n’est jamais envoyé sur GitHub. À coller sur chaque appareil.' }),
      el('div.field', { style: { marginTop: '10px' } }, el('label.lbl', { text: 'Adresse secrète iCal' }), champ),
      el('button.btn.primary.sm', { type: 'button', text: 'Relier mon agenda', onclick: async () => {
        const url = champ.value.trim();
        if (!lienValide(url)) return toast('Ce n’est pas une adresse iCal (https://…/ical/…)', true);
        enregistrerLienAgenda(url);
        champ.value = '';
        if (agendaLisible()) {
          try { const ev = await chargerAgenda({ forcer: true }); toast(`Agenda relié : ${ev.length} événements`); }
          catch (e) { toast(e.message, true); }
        } else toast('Lien gardé : il servira dans l’appli Android');
        rendre();
      } }));
  };
  rendre();
  return carte;
}

function carteSuunto() {
  const etat = el('div.hint.compte-etat', { text: 'Chargement…' });
  const { carte, corps, changer } = carteCompte({ classe: 'local', icone: 'i-montre', titre: 'Compte Suunto', etat });
  let liaison = null, sha = null;
  const kv = (k, v) => el('div.kv', {}, el('span.k', { text: k }), el('span.v', { text: v }));
  const dateHeure = iso => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

  const rendre = () => {
    corps.replaceChildren();
    if (estRelie(liaison)) {
      changer('ok');
      etat.textContent = `Relié${liaison.compte ? ` · ${liaison.compte}` : ''}`;
      corps.append(
        ...[kv('Compte', liaison.compte || 'relié'),
          liaison.lieLe ? kv('Relié le', dateHeure(liaison.lieLe)) : null,
          liaison.derniereRecup ? kv('Dernière récupération', dateHeure(liaison.derniereRecup)) : null].filter(Boolean),
        el('div.hint', { text: 'Pour importer : Plongées → « + » → « Depuis mon compte Suunto ».' }),
        el('button.btn.sm.danger', { type: 'button', style: { marginTop: '12px' }, text: 'Délier le compte Suunto',
          onclick: async () => {
            if (!(await confirmBox('Délier le compte Suunto ? Le carnet ne bouge pas ; tu pourras le relier à nouveau.'))) return;
            try {
              ({ liaison, sha } = await sauverLiaison({ ...liaison, jeton: null, compte: null, delieLe: new Date().toISOString() },
                { sha, message: 'Suunto : compte délié' }));
              toast('Compte Suunto délié');
            } catch (e) { toast(e.message, true); }
            rendre();
          } }));
      return;
    }

    changer('local');
    etat.textContent = clesCompletes(liaison) ? 'Clés enregistrées · compte pas encore relié' : 'Pas encore configuré';
    const champ = (nom, libelle, type = 'text') => {
      const input = el('input', { type, value: liaison[nom] || '', autocomplete: 'off', spellcheck: 'false',
        oninput: () => { liaison[nom] = input.value.trim(); } });
      return el('div.field', {}, el('label.lbl', { text: libelle }), input);
    };
    const retour = liaison.redirectUri || RETOUR_DEFAUT;
    corps.append(
      el('div.hint', { style: { marginTop: 0, marginBottom: '8px' }, text: 'Les clés de ton appli Suunto sont dans ton profil sur apizone.suunto.com : '
        + 'identifiant et secret client dans « OAuth and application settings », clé d’abonnement dans « Your subscriptions ».' }),
      champ('clientId', 'Identifiant client (Client Id)'),
      champ('clientSecret', 'Secret client (Client secret)', 'password'),
      champ('cleAbonnement', 'Clé d’abonnement (Subscription key)', 'password'),
      el('div.kv', {}, el('span.k', { text: 'Adresse de retour (Redirect URI)' }),
        el('button.btn.sm', { type: 'button', text: '📋 Copier', onclick: async () => {
          try { await navigator.clipboard.writeText(retour); toast('Adresse copiée'); } catch { toast(retour); }
        } })),
      el('div', { style: { fontFamily: 'monospace', fontSize: '12.5px', wordBreak: 'break-all' }, text: retour }),
      el('div.hint', { text: 'À déclarer telle quelle dans les réglages OAuth de ton appli Suunto. '
        + (estConfigure()
          ? 'Les clés et la connexion sont gardées dans ton dépôt privé (suunto.json, à côté du carnet) : chaque appareil les retrouve tout seul.'
          : 'Sans dépôt GitHub branché, elles restent sur cet appareil.') }),
      // Dans l'APK, Suunto renverrait vers le site dans le navigateur du
      // téléphone, pas dans l'appli : on y enregistre seulement les clés
      // (suunto.json), et la connexion se termine sur le site, au PC.
      el('button.btn.primary.block', { type: 'button', style: { marginTop: '12px' },
        text: estApk() ? 'Enregistrer les clés' : 'Connecter mon compte Suunto',
        onclick: async (e) => {
          if (!liaison.clientId || !liaison.clientSecret || !liaison.cleAbonnement) {
            toast('Il manque une des trois clés', true); return;
          }
          const b = e.currentTarget;
          b.disabled = true;
          try {
            ({ liaison, sha } = await sauverLiaison({ ...liaison, redirectUri: retour }, { sha, message: 'Suunto : clés de l’appli' }));
            if (!estApk()) { location.href = lienAutorisation(liaison, nouvelEtat()); return; }
            toast(estConfigure() ? 'Clés enregistrées dans ton dépôt — termine la connexion sur le PC'
              : 'Clés enregistrées sur ce téléphone seulement : branche GitHub pour les retrouver sur le PC', !estConfigure());
            etat.textContent = 'Clés enregistrées · compte pas encore relié';
          } catch (err) {
            toast(err.message, true);
          }
          b.disabled = false;
        } }),
      estApk() ? el('div.hint', { text: 'Ensuite, sur le PC, ouvre le site → Réglages → Compte Suunto : les clés y sont déjà, '
        + 'clique « Connecter mon compte Suunto ». Suunto renvoie vers le site, pas vers l’appli ; '
        + 'le téléphone récupère ensuite la liaison tout seul.' }) : null);
  };

  chargerLiaison()
    .then(r => { liaison = r.liaison; sha = r.sha; rendre(); })
    .catch(e => { etat.textContent = e.message; });

  return carte;
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
  const progresZone = el('div');
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
        bouton.onclick = async () => {
          // Une vraie barre de chargement, à la place du bouton.
          bouton.hidden = true;
          const { lancerMiseAJour } = await import('./maj-progres.js');
          lancerMiseAJour(progresZone, d, { surFin: r => { if (r === 'erreur') bouton.hidden = false; } });
        };
        if (res.etat === 'nouvelle') {
          const titres = await nouveautes(installee?.commit, d.commit);
          if (titres.length) {
            const lignes = titres.slice(0, 8).map(t => el('li', { text: t }));
            if (titres.length > 8) lignes.push(el('li.hint', { text: `… et ${titres.length - 8} autre${titres.length > 9 ? 's' : ''}` }));
            liste.replaceChildren(...lignes);
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

  return el('div.card.carte-maj', {},
      el('div.compte-sous', { style: { marginTop: 0 }, text: 'Appli Android' }),
      el('div.kv', {}, el('span.k', { text: 'Installée' }), vInstallee),
      el('div.kv', {}, el('span.k', { text: 'Dernière sur GitHub' }), vGitHub),
      message, liste, bouton, progresZone,
      el('div.hint', { text: 'Le fichier se télécharge depuis ton dépôt GitHub ; Android te demande '
        + 'ensuite de confirmer l’installation. Ton carnet et tes réglages sont conservés.' }));
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
