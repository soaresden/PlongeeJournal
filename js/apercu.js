// ============================================================
//  Aperçu modifiable, sur le bord de l'écran
//
//  Toucher une plongée, une fosse, une séance ou un plongeur n'ouvre
//  plus une page : un panneau glisse depuis la droite (tablette) ou
//  depuis le bas (téléphone), la liste reste visible derrière. Les
//  champs courants s'y corrigent directement, enregistrés au fil de la
//  saisie. La fiche complète reste à un geste.
// ============================================================

import { el, fmtDate, fmtDateLong, fmtDuration, fullName, num, toast } from './lib.js';
import { store, TYPES_SEANCE, typeSeance, niveauALaDate, NIVEAUX } from './store.js';
import { DIVE_TYPES } from './config.js';
import { navigate } from './router.js';
import { profileSvg } from './fit.js';
import { ambianceDe, stylesAmbiance, vignetteLieu, etiquetteAmbiance } from './ambiance.js';

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

const courbe = samples => samples?.length
  ? el('div.apercu-courbe', { html: profileSvg(samples, { width: 520, height: 150 }) }) : null;

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
  const nom = bid => fullName(buddies.find(b => b.id === bid)) || '?';

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

  const a = ambianceDe(d);
  const tete = el('div.apercu-tete-plongee', {},
    vignetteLieu(d, { boite: 52, contenu: d.numero ?? '—' }),
    el('div', {},
      el('div.apercu-t1', { text: d.lieuNom || d.site || 'Lieu non précisé' }),
      el('div.apercu-t2', { text: `${fmtDateLong(d.date)}${d.heureImmersion ? ` · ${d.heureImmersion}` : ''}` })));

  const corps = el('div', {},
    el('div.apercu-chiffres', {},
      chiffre(d.profMax ? `${d.profMax}` : '—', 'm max'),
      chiffre(d.dureeMin ? fmtDuration(d.dureeMin) : '—', 'au fond'),
      chiffre(d.tempFond != null ? `${d.tempFond}°` : '—', 'eau'),
      chiffre(niveauDeLaPlongee(d, certifs) || '—', 'niveau')),
    el('div.dive-tags', { style: { margin: '2px 0 10px' } }, etiquetteAmbiance(d)),
    courbe(d.samples || d.profil),
    el('div.apercu-grille', {},
      champ('N°', saisie('text', d.numero, v => maj({ numero: num(v) }), { inputmode: 'numeric' })),
      champ('Date', date),
      champ('Lieu', saisie('text', d.lieuNom, v => maj({ lieuNom: v })), { large: true }),
      champ('Site', saisie('text', d.site, v => maj({ site: v })), { large: true }),
      champ('Immersion', saisie('time', d.heureImmersion, v => maj({ heureImmersion: v }))),
      champ('Durée (min)', saisie('text', d.dureeMin, v => maj({ dureeMin: num(v) }), { inputmode: 'numeric' })),
      champ('Prof. max (m)', saisie('text', d.profMax, v => maj({ profMax: num(v) }), { inputmode: 'decimal' })),
      champ('Eau (°C)', saisie('text', d.tempFond, v => maj({ tempFond: num(v) }), { inputmode: 'decimal' })),
      champ('Type', liste([['', '—'], ...DIVE_TYPES.map(t => [t, t])], d.type, v => maj({ type: v }))),
      champ('Niveau', selNiveau),
      champ('Ce que j’ai fait', saisie('textarea', d.fait, v => maj({ fait: v })), { large: true }),
      champ('Ce que j’ai vu', saisie('textarea', d.vu, v => maj({ vu: v })), { large: true }),
      champ('Notes', saisie('textarea', d.observations, v => maj({ observations: v })), { large: true })),
    (d.buddyIds || []).length
      ? el('div.apercu-bloc', {}, el('div.apercu-lbl', { text: 'Palanquée' }),
          el('div.chips', {}, ...d.buddyIds.map(b => el('span.chip', { text: nom(b) }))))
      : null);

  const pied = el('div.apercu-actions', {},
    temoin,
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
      champ('Lieu', saisie('text', s.lieu, v => maj({ lieu: v })), { large: true }),
      champ('Heure', saisie('time', s.heure, v => maj({ heure: v }))),
      champ('Durée (min)', saisie('text', s.dureeMin, v => maj({ dureeMin: num(v) }), { inputmode: 'numeric' })),
      champ('Prof. max (m)', saisie('text', s.profMax, v => maj({ profMax: num(v) }), { inputmode: 'decimal' })),
      champ('Eau (°C)', saisie('text', s.tempEau, v => maj({ tempEau: num(v) }), { inputmode: 'decimal' })),
      champ('Notes', saisie('textarea', s.notes, v => maj({ notes: v })), { large: true })));

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
