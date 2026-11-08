// ============================================================
//  Aperçu modifiable, sur le bord de l'écran
//
//  Toucher une plongée, une fosse, une séance ou un plongeur n'ouvre
//  plus une page : un panneau glisse depuis la droite (tablette) ou
//  depuis le bas (téléphone), la liste reste visible derrière. Les
//  champs courants s'y corrigent directement, enregistrés au fil de la
//  saisie. La fiche complète reste à un geste.
// ============================================================

import { el, fmtDate, fmtDateLong, fmtDuration, fullName, nomPlongeur, num, toast, debounce } from './lib.js';
import { store, TYPES_SEANCE, typeSeance, niveauALaDate, NIVEAUX } from './store.js';
import { DIVE_TYPES } from './config.js';
import { chercherEnElargissant, resolveResult } from './map.js';
import { navigate } from './router.js';
import { graphiquePlongee } from './courbes.js';
import { sectionVideos } from './views/videos.js';
import { ambianceDe, stylesAmbiance, vignetteLieu, etiquetteAmbiance } from './ambiance.js';
import { agendaBranche, agendaLisible, chargerAgenda, evenementsDu, lieuPropose, texteEvenement } from './agenda.js';
import { editeurPalanquee, champCentre, propositionsTexte } from './palanquee.js';
import { pageLisible } from './views/carnet-photo.js';

/**
 * « Ce jour-là dans ton agenda » : les événements du jour, chacun avec un
 * bouton pour en faire le lieu. Rien si l'agenda n'est pas relié.
 */
function blocAgenda(date, champLieu, appliquer, avecQui = null) {
  if (!agendaBranche() || !agendaLisible() || !date) return null;
  const bloc = el('div.apercu-bloc.agenda-jour', {}, el('div.apercu-lbl', { text: '📅 Ce jour-là dans ton agenda' }));
  const liste = el('div.agenda-liste', {}, el('div.hint', { text: 'Lecture de l’agenda…' }));
  bloc.append(liste);
  chargerAgenda().then(ev => {
    const du = evenementsDu(ev, date);
    liste.replaceChildren(...(du.length ? du.map(e => el('div.agenda-ev', {},
      el('div.agenda-ev-txt', {}, el('b', { text: e.titre || '(sans titre)' }),
        e.lieu ? el('span', { text: e.lieu }) : null,
        e.debut !== e.fin ? el('span', { text: `du ${fmtDate(e.debut)} au ${fmtDate(e.fin)}` }) : null),
      avecQui ? propositionsTexte(texteEvenement(e), avecQui.cible, avecQui.buddies,
        { exclure: avecQui.exclure, onAjout: avecQui.onAjout }) : null,
      el('button.btn.sm.ghost', { type: 'button', text: 'Comme lieu', onclick: () => {
        const l = lieuPropose(e);
        champLieu.value = l;
        appliquer(l);
        toast(`Lieu : ${l}`);
      } }))) : [el('div.hint', { text: 'Rien dans l’agenda ce jour-là.' })]));
  }).catch(e => liste.replaceChildren(el('div.hint', { text: e.message })));
  return bloc;
}

let racine = null;
let surFermeture = null;

/** Panneau unique : l'ouvrir à nouveau remplace son contenu. */
function panneau() {
  if (racine) return racine;
  const fond = el('div.apercu-fond', { onclick: () => fermerApercu() });
  const aside = el('aside.apercu', { role: 'dialog', 'aria-modal': 'false', tabindex: '-1' });
  racine = { fond, aside };
  document.body.append(fond, aside);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && estOuvert()) fermerApercu(); });
  // Changer de page referme l'aperçu.
  window.addEventListener('hashchange', () => fermerApercu({ silencieux: true }));
  return racine;
}

export const estOuvert = () => !!racine?.aside.classList.contains('ouvert');

export function fermerApercu({ silencieux = false } = {}) {
  if (!racine || !estOuvert()) return;
  racine.aside.classList.remove('ouvert');
  racine.fond.classList.remove('ouvert');
  document.documentElement.classList.remove('apercu-actif');
  const cb = surFermeture; surFermeture = null;
  if (cb && !silencieux) cb();
}

/**
 * Ouvre l'aperçu.
 * @param {{tete:Node, corps:Node, pied?:Node, style?:object, retour?:Function}} contenu
 * @param {{onClose?:Function}} options  appelée à la fermeture (pour rafraîchir la liste)
 */
export function ouvrirApercu({ tete, corps, pied = null, style = null, retour = null }, { onClose = null } = {}) {
  const { fond, aside } = panneau();
  aside.innerHTML = '';
  aside.removeAttribute('style');
  if (style) for (const [k, v] of Object.entries(style)) aside.style.setProperty(k, v);
  if (onClose) surFermeture = onClose;

  aside.append(
    el('header.apercu-tete', {},
      retour ? el('button.apercu-btn', { type: 'button', title: 'Retour', 'aria-label': 'Retour', text: '‹', onclick: retour }) : null,
      el('div.apercu-titre', {}, tete),
      el('button.apercu-btn', { type: 'button', title: 'Fermer', 'aria-label': 'Fermer', text: '✕', onclick: () => fermerApercu() })),
    el('div.apercu-corps', {}, corps));
  if (pied) aside.append(el('footer.apercu-pied', {}, pied));

  aside.classList.add('ouvert');
  fond.classList.add('ouvert');
  document.documentElement.classList.add('apercu-actif');
  aside.scrollTop = 0;
  aside.querySelector('.apercu-corps').scrollTop = 0;
}

// ------------------------------------------------------------
//  Petits champs, enregistrés au fil de l'eau
// ------------------------------------------------------------

/** Enregistrement différé : on tape, ça part 500 ms après. */
function enregistreur(sauver, temoin) {
  let t = null;
  const dire = (txt, cls = '') => { temoin.textContent = txt; temoin.className = `apercu-temoin ${cls}`; };
  return {
    planifier() {
      dire('…');
      clearTimeout(t);
      t = setTimeout(async () => {
        try { await sauver(); dire('Enregistré ✓', 'ok'); }
        catch (e) { dire('Non enregistré', 'err'); toast(e.message || 'Enregistrement impossible', true); }
      }, 500);
    },
    async maintenant() { clearTimeout(t); await sauver(); },
  };
}

function champ(label, controle, { large = false } = {}) {
  return el(`label.apercu-champ${large ? '.large' : ''}`, {}, el('span', { text: label }), controle);
}

function saisie(type, valeur, surChange, attrs = {}) {
  const n = el(type === 'textarea' ? 'textarea' : 'input', type === 'textarea'
    ? { rows: 3, ...attrs } : { type, ...attrs });
  n.value = valeur ?? '';
  n.addEventListener('input', () => surChange(n.value));
  return n;
}

function liste(options, valeur, surChange) {
  const s = el('select');
  options.forEach(([v, t]) => s.append(el('option', { value: v, text: t })));
  s.value = valeur ?? '';
  s.addEventListener('change', () => surChange(s.value));
  return s;
}

const chiffre = (valeur, unite) => el('div.apercu-chiffre', {},
  el('b', { text: valeur }), el('span', { text: unite }));

const courbe = (samples, dive = {}) => samples?.length
  ? el('div.apercu-courbe', {}, graphiquePlongee(samples, { dive, hauteur: 160 })) : null;

// ------------------------------------------------------------
//  Plongée
// ------------------------------------------------------------

/**
 * @param {string} id
 * @param {{retour?:Function, onClose?:Function}} options
 */
export async function apercuPlongee(id, { retour = null, onClose = null } = {}) {
  const d = structuredClone(await store.getDive(id));
  if (!d) return toast('Plongée introuvable', true);
  const certifs = await store.listCertifications(d.diverId);
  const buddies = await store.listBuddies();

  const temoin = el('span.apercu-temoin');
  const sauvegarde = enregistreur(() => store.saveDive(d), temoin);
  const maj = p => { Object.assign(d, p); sauvegarde.planifier(); };

  const niveauAuto = () => niveauALaDate(certifs, d.date);
  const optAuto = el('option', { value: '' });
  const majNiveau = () => { optAuto.textContent = niveauAuto() ? `${niveauAuto()} (diplômes)` : '—'; };
  const selNiveau = el('select');
  selNiveau.append(optAuto, ...NIVEAUX.map(n => el('option', { value: n, text: n })));
  majNiveau();
  selNiveau.value = d.niveau || '';
  selNiveau.onchange = () => maj({ niveau: selNiveau.value });

  const date = saisie('date', d.date, v => { maj({ date: v }); majNiveau(); });
  // Le lieu : le taper cherche l'endroit ; choisir une proposition déplace
  // le point GPS, et l'ambiance (Mer Rouge, Manche…) suit en direct.
  const lieuDive = saisie('search', d.lieuNom, v => { maj({ lieuNom: v }); texteSeul = true; majTete(); chercherLieu(); },
    { autocomplete: 'off', enterkeyhint: 'search' });
  const lieuResultats = el('div.geo-results', { hidden: true });
  const lieuAlerte = el('div.hint.lieu-alerte', { hidden: true });
  let texteSeul = false;
  const chercherLieu = debounce(async () => {
    const q = lieuDive.value.trim();
    if (q.length < 3) { lieuResultats.hidden = true; return; }
    lieuResultats.hidden = false;
    lieuResultats.replaceChildren(el('button', { type: 'button', disabled: true, text: 'Recherche du lieu…' }));
    try {
      const { resultats } = await chercherEnElargissant(q);
      lieuResultats.replaceChildren(...(resultats.length ? resultats.map(r => el('button', { type: 'button',
        onclick: async () => {
          try { await resolveResult(r); } catch { return toast('Impossible de récupérer ce lieu', true); }
          lieuResultats.hidden = true;
          await placerPoint(r.lat, r.lng, r.detail || r.label);
        } }, r.label, r.detail && r.detail !== r.label ? el('small', { text: r.detail }) : null))
        : [el('button', { type: 'button', disabled: true, text: 'Aucun lieu trouvé : corrige le point dans « Tout modifier ».' })]));
    } catch {
      lieuResultats.replaceChildren(el('button', { type: 'button', disabled: true, text: 'Recherche indisponible (hors ligne ?)' }));
    }
  }, 600);

  /** Nouveau point : eau douce / salée reconnue de nouveau, ambiance à jour. */
  async function placerPoint(lat, lng, detail = '') {
    texteSeul = false;
    maj({ lat, lng, lieuDetail: detail, ...(d.eauManuelle ? {} : { eau: '', eauAuto: false, indiceEau: '' }) });
    majTete();
    toast('Point déplacé — l’ambiance suit');
    if (d.eauManuelle) return;
    try {
      const { analyserPoint } = await import('./geo.js');
      const info = await analyserPoint(lat, lng);
      if (info?.eau && d.lat === lat) { maj({ eau: info.eau, eauAuto: true, altitude: info.altitude ?? d.altitude }); majTete(); }
    } catch { /* hors ligne : on reconnaîtra plus tard */ }
  }
  const centre = champCentre(d, await store.listDives(d.diverId), () => sauvegarde.planifier());
  const palanquee = editeurPalanquee(d, buddies, () => sauvegarde.planifier());
  const moi = await store.getDiver(d.diverId);

  const a = ambianceDe(d);
  const vignette = el('span.apercu-vignette', {}, vignetteLieu(d, { boite: 52, contenu: d.numero ?? '—' }));
  const titre = el('div.apercu-t1', { text: d.lieuNom || d.site || 'Lieu non précisé' });
  const tags = el('div.dive-tags', { style: { margin: '2px 0 10px' } }, etiquetteAmbiance(d));
  const tete = el('div.apercu-tete-plongee', {},
    vignette,
    el('div', {}, titre,
      el('div.apercu-t2', { text: `${fmtDateLong(d.date)}${d.heureImmersion ? ` · ${d.heureImmersion}` : ''}` })));

  /** L'en-tête, l'étiquette et les couleurs suivent le lieu en direct. */
  let derniereVignette = `${d.lat},${d.lng}`;
  function majTete() {
    const amb = ambianceDe(d);
    titre.textContent = d.lieuNom || d.site || 'Lieu non précisé';
    tags.replaceChildren(etiquetteAmbiance(d));
    const cle = `${d.lat},${d.lng}`;
    if (cle !== derniereVignette) {
      derniereVignette = cle;
      vignette.replaceChildren(vignetteLieu(d, { boite: 52, contenu: d.numero ?? '—' }));
    } else {
      const v = vignette.firstElementChild;
      if (v) for (const [k, val] of Object.entries(stylesAmbiance(amb))) v.style.setProperty(k, val);
    }
    const aside = document.querySelector('aside.apercu');
    if (aside) for (const [k, val] of Object.entries(stylesAmbiance(amb))) aside.style.setProperty(k, val);
    // Le texte a changé mais le point est resté ailleurs : on le dit.
    lieuAlerte.hidden = !(texteSeul && d.lat != null);
    if (!lieuAlerte.hidden) {
      lieuAlerte.replaceChildren(
        `⚠ Le point GPS est toujours l’ancien (${amb.nom}). Choisis le lieu dans la liste pour le déplacer, ou `,
        el('button.lien-texte', { type: 'button', text: 'efface l’ancien point', onclick: () => {
          texteSeul = false; maj({ lat: null, lng: null, lieuDetail: '' }); majTete(); toast('Ancien point effacé');
        } }), '.');
    }
  }

  const corps = el('div', {},
    el('div.apercu-chiffres', {},
      chiffre(d.profMax ? `${d.profMax}` : '—', 'm max'),
      chiffre(d.dureeMin ? fmtDuration(d.dureeMin) : '—', 'au fond'),
      chiffre(d.tempFond != null ? `${d.tempFond}°` : '—', 'eau'),
      chiffre(niveauDeLaPlongee(d, certifs) || '—', 'niveau')),
    tags,
    // La page du carnet papier, pour relire et corriger en la regardant.
    d.photoCarnet?.ref ? el('div.apercu-bloc', {}, el('div.apercu-lbl', { text: '📓 Page du carnet' }),
      pageLisible(d.photoCarnet.ref, { hauteur: 'min(48vh, 420px)' })) : null,
    // Et ses vidéos (pCloud), juste à côté.
    sectionVideos(d, await store.listDives(d.diverId), { lecture: document.documentElement.classList.contains('partage') }),
    courbe(d.samples?.length ? d.samples : d.profil, d),
    el('div.apercu-grille', {},
      champ('N° (auto)', el('input', { type: 'text', readOnly: true, tabIndex: -1, value: d.numero ?? '—', class: 'lecture-seule' })),
      champ('Date', date),
      el('div.apercu-champ.large', {}, el('span', { text: 'Lieu' }), lieuDive, lieuResultats, lieuAlerte),
      champ('Site', saisie('text', d.site, v => { maj({ site: v }); majTete(); }), { large: true }),
      champ('Immersion', saisie('time', d.heureImmersion, v => maj({ heureImmersion: v }))),
      champ('Durée (min)', saisie('text', d.dureeMin, v => maj({ dureeMin: num(v) }), { inputmode: 'numeric' })),
      champ('Prof. max (m)', saisie('text', d.profMax, v => maj({ profMax: num(v) }), { inputmode: 'decimal' })),
      champ('Eau (°C)', saisie('text', d.tempFond, v => maj({ tempFond: num(v) }), { inputmode: 'decimal' })),
      champ('Type', liste([['', '—'], ...DIVE_TYPES.map(t => [t, t])], d.type, v => { maj({ type: v }); majTete(); })),
      champ('Niveau', selNiveau)),
    el('div.apercu-bloc', {}, el('div.apercu-lbl', { text: 'Palanquée' }), palanquee),
    el('div.apercu-grille', {},
      el('div.apercu-champ.large', {}, el('span', { text: 'Centre de plongée' }), centre),
      champ('Ce que j’ai fait', saisie('textarea', d.fait, v => maj({ fait: v })), { large: true }),
      champ('Ce que j’ai vu', saisie('textarea', d.vu, v => maj({ vu: v })), { large: true }),
      champ('Notes', saisie('textarea', d.observations, v => maj({ observations: v })), { large: true })),
    blocAgenda(d.date, lieuDive, v => { maj({ lieuNom: v }); texteSeul = true; majTete(); chercherLieu(); }, {
      cible: d, buddies, exclure: moi ? [fullName(moi)] : [],
      onAjout: () => { palanquee.rafraichir(); sauvegarde.planifier(); } }));

  const pied = el('div.apercu-actions', {},
    temoin,
    el('button.btn.ghost.sm', { type: 'button', text: '↪ Snorkeling…', title: 'Ce n’était pas une plongée : la ranger en séance',
      onclick: async () => {
        await sauvegarde.maintenant();
        const { rangerUnePlongee } = await import('./views/seances.js');
        fermerApercu({ silencieux: true });
        rangerUnePlongee(d);
      } }),
    el('button.btn.ghost.sm', { type: 'button', text: 'Tout modifier',
      onclick: async () => { await sauvegarde.maintenant(); navigate(`dive/${d.id}/edit`); } }),
    el('button.btn.primary.sm', { type: 'button', text: 'Fiche complète ›',
      onclick: async () => { await sauvegarde.maintenant(); navigate(`dive/${d.id}`); } }));

  ouvrirApercu({ tete, corps, pied, retour, style: stylesAmbiance(a) }, { onClose });
}

export function niveauDeLaPlongee(d, certifs) {
  return String(d.niveau || '').trim() || niveauALaDate(certifs, d.date);
}

// ------------------------------------------------------------
//  Séance (fosse, piscine, apnée, snorkeling)
// ------------------------------------------------------------

export async function apercuSeance(id, { retour = null, onClose = null } = {}) {
  const s = structuredClone(await store.getSeance(id));
  if (!s) return toast('Séance introuvable', true);
  const t = typeSeance(s.type);

  const temoin = el('span.apercu-temoin');
  const sauvegarde = enregistreur(() => store.saveSeance(s), temoin);
  const maj = p => { Object.assign(s, p); sauvegarde.planifier(); };
  const lieuSeance = saisie('text', s.lieu, v => maj({ lieu: v }));
  const buddies = await store.listBuddies();
  const moi = await store.getDiver(s.diverId);
  s.buddyIds ||= [];
  const avecQui = editeurPalanquee(s, buddies, () => sauvegarde.planifier(), { anonyme: false, chef: false, placeholder: 'Avec qui : prénom nom…' });

  const tete = el('div.apercu-tete-plongee', {},
    el('span.seance-pastille', { class: `s-${t.id}`, style: { width: '52px', height: '52px', flex: '0 0 52px', fontSize: '26px' }, text: t.icone }),
    el('div', {},
      el('div.apercu-t1', { text: `${t.label}${s.lieu ? ` · ${s.lieu}` : ''}` }),
      el('div.apercu-t2', { text: `${fmtDateLong(s.date)}${s.heure ? ` · ${s.heure}` : ''}` })));

  const corps = el('div', {},
    el('div.apercu-chiffres', {},
      chiffre(s.dureeMin ? fmtDuration(s.dureeMin) : '—', 'durée'),
      chiffre(s.profMax ? `${s.profMax}` : '—', 'm max'),
      chiffre(s.tempEau != null ? `${s.tempEau}°` : '—', 'eau')),
    courbe(s.samples),
    el('div.apercu-grille', {},
      champ('Type', liste(TYPES_SEANCE.map(x => [x.id, `${x.icone} ${x.label}`]), s.type, v => maj({ type: v }))),
      champ('Date', saisie('date', s.date, v => maj({ date: v }))),
      champ('Lieu', lieuSeance, { large: true }),
      champ('Heure', saisie('time', s.heure, v => maj({ heure: v }))),
      champ('Durée (min)', saisie('text', s.dureeMin, v => maj({ dureeMin: num(v) }), { inputmode: 'numeric' })),
      champ('Prof. max (m)', saisie('text', s.profMax, v => maj({ profMax: num(v) }), { inputmode: 'decimal' })),
      champ('Eau (°C)', saisie('text', s.tempEau, v => maj({ tempEau: num(v) }), { inputmode: 'decimal' })),
      champ('Notes', saisie('textarea', s.notes, v => maj({ notes: v })), { large: true })),
    el('div.apercu-bloc', {}, el('div.apercu-lbl', { text: 'Avec qui' }), avecQui),
    blocAgenda(s.date, lieuSeance, v => maj({ lieu: v }), {
      cible: s, buddies, exclure: moi ? [fullName(moi)] : [],
      onAjout: () => { avecQui.rafraichir(); sauvegarde.planifier(); } }));

  const pied = el('div.apercu-actions', {},
    temoin,
    el('button.btn.primary.sm', { type: 'button', text: 'Fiche complète ›',
      onclick: async () => { await sauvegarde.maintenant(); navigate(`seance/${s.id}`); } }));

  ouvrirApercu({ tete, corps, pied, retour }, { onClose });
}

// ------------------------------------------------------------
//  Une liste de plongées (un filtre des statistiques…)
// ------------------------------------------------------------

/**
 * @param {string} titre
 * @param {object[]} dives
 * @param {{sousTitre?:string, onClose?:Function}} options
 */
export function apercuListe(titre, dives, { sousTitre = '', onClose = null } = {}) {
  const rouvrir = () => apercuListe(titre, dives, { sousTitre, onClose });
  const tete = el('div', {},
    el('div.apercu-t1', { text: titre }),
    el('div.apercu-t2', { text: sousTitre || `${dives.length} plongée${dives.length > 1 ? 's' : ''}` }));

  const corps = el('div.apercu-liste', {},
    dives.length ? null : el('div.hint', { text: 'Aucune plongée.' }),
    ...dives.map(d => ligneApercu(d, () => apercuPlongee(d.id, { retour: rouvrir, onClose }))));

  ouvrirApercu({ tete, corps }, { onClose });
}

/** Ligne compacte d'une plongée, réutilisée par l'agenda et les stats. */
export function ligneApercu(d, onclick) {
  return el('button.apercu-ligne', { type: 'button', style: stylesAmbiance(ambianceDe(d)), onclick },
    vignetteLieu(d, { boite: 40, contenu: d.numero ?? '—' }),
    el('span.apercu-ligne-txt', {},
      el('b', { text: d.lieuNom || d.site || 'Lieu non précisé' }),
      el('span', { text: [fmtDate(d.date), d.profMax ? `${d.profMax} m` : null,
        d.dureeMin ? fmtDuration(d.dureeMin) : null].filter(Boolean).join(' · ') })),
    el('span.apercu-ligne-fleche', { text: '›' }));
}
