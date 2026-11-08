// ============================================================
//  Liste des plongées + fiche détaillée
// ============================================================

import { el, fmtDate, fmtDateLong, fmtDuration, fullName, nomPlongeur, nomAffiche, toast, confirmBox, openModal, debounce } from '../lib.js';
import { apercuPlongee, apercuSeance } from '../apercu.js';
import { store, TYPES_SEANCE } from '../store.js';
import { staticMap } from '../map.js';
import { navigate } from '../router.js';
import { consommation, libelleGaz } from '../store.js';
import { METEO, ETAT_MER, COURANTS, VISIBILITE_ICONES, RESSENTIS } from '../config.js';
import { graphiquePlongee, tuilesPlongee } from '../courbes.js';
import { analyserProfil } from '../profil-analyse.js';
import { ambianceDe, stylesAmbiance, vignetteLieu, etiquetteAmbiance } from '../ambiance.js';
import { plongeesARanger } from '../seances.js';
import { bilanDonnees, debutOrdinateur, listeMontre, LIBELLE_SOURCE } from '../donnees.js';
import { configVideos, sectionVideos } from './videos.js';
import { dossiersEnCache, videosDePlongee, chargerDossiers } from '../videos.js';
import { photoCarnetFiche } from './carnet-photo.js';

// ------------------------------------------------------------
//  Sur la carte d'une plongée : la courbe, et les chiffres en pictos
// ------------------------------------------------------------

const PICTO = {
  prof: '<svg class="ico-m" viewBox="0 0 24 24"><path d="M12 3v18M7.5 7.5 12 3l4.5 4.5M7.5 16.5 12 21l4.5-4.5"/></svg>',
  duree: '<svg class="ico-m" viewBox="0 0 24 24"><use href="#i-montre"/></svg>',
  eau: '<svg class="ico-m" viewBox="0 0 24 24"><path d="M10 13.6V5a2 2 0 1 1 4 0v8.6a4 4 0 1 1-4 0z"/><path d="M12 10.5v5"/></svg>',
};

/** « ↕ 21,4 m » : un picto et sa valeur. */
const chiffre = (picto, valeur, titre) => el('span.metr', { title: titre },
  el('span.metr-ico', { html: PICTO[picto] }), el('b', { text: valeur }));

/**
 * La plongée en petit, à droite de la carte. Même échelle de profondeur
 * pour toutes (la plus profonde du carnet) : une plongée à 12 m paraît
 * moins profonde qu'une à 40 m. Sans courbe de la montre, un profil type
 * en pointillés, d'après la profondeur et la durée.
 */
function miniCourbe(samples, { prof, duree, profRef }) {
  const H = 56, W = 100, HAUT = 3;
  const y = d => (HAUT + (Math.min(d, profRef) / profRef) * (H - HAUT - 3)).toFixed(1);
  let pts, type = false;
  if (samples?.length > 3) {
    const pas = Math.max(1, Math.ceil(samples.length / 90));
    const garde = samples.filter((_, i) => i % pas === 0 || i === samples.length - 1);
    const maxT = garde[garde.length - 1].t || 1;
    pts = garde.map(s => `${((s.t / maxT) * W).toFixed(1)},${y(s.d)}`);
  } else if (prof > 0 && duree > 0) {
    type = true;
    const palier = prof > 8 ? 4 : 0;
    pts = [[0, 0], [12, prof], [58, prof], [78, palier || prof * 0.4], [93, palier || prof * 0.2], [100, 0]]
      .map(([x, d]) => `${x},${y(d)}`);
  } else return null;
  const ligne = pts.join(' ');
  return el('div.dive-courbe', { title: type ? 'Profil type : pas de courbe de la montre' : 'Courbe de la montre',
    html: `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="${HAUT}" x2="${W}" y2="${HAUT}" class="dc-surface" vector-effect="non-scaling-stroke"/>
      <polygon points="0,${HAUT} ${ligne} ${W},${HAUT}" class="dc-eau${type ? ' type' : ''}"/>
      <polyline points="${ligne}" class="dc-ligne${type ? ' type' : ''}" vector-effect="non-scaling-stroke"/>
    </svg>` });
}
import { oublierPhoto } from '../photos.js';

/** Retrouve le pictogramme d'une condition à partir de sa valeur stockée. */
const picto = (liste, valeur) => {
  const o = liste.find(x => x.id === valeur || x.label === valeur);
  return o ? `${o.icone} ${o.label}` : (valeur || null);
};

/**
 * Le petit indicateur de données d'une plongée : 📈 la courbe, 🛢 la
 * sonde, et ce qu'on peut aller chercher (⌚ montre, ☁️ compte Suunto).
 */
export function badgeDonnees(b) {
  const bouts = [];
  if (b.courbe) bouts.push(el('span', { text: '📈', title: 'Courbe de plongée' }));
  if (b.sonde === 'courbe') bouts.push(el('span', { text: '🛢', title: 'Courbe de la sonde (pression du bloc)' }));
  const r = b.recuperer[0];
  if (r) bouts.push(el('span.donnees-recup', { text: r.ou === 'montre' ? '⌚ à récupérer' : '☁️ à compléter',
    title: r.ou === 'montre' ? 'Encore dans la montre : le Bluetooth donnerait tout' : 'Le compte Suunto a la courbe' }));
  if (!bouts.length) return el('span.donnees.vide', { title: 'Ni courbe, ni sonde' }, '·');
  return el(`span.donnees.${b.niveau}`, { title: b.manque.length ? `Manque : ${b.manque.join(', ')}` : 'Tout y est' }, ...bouts);
}

function typeBadge(type = '') {
  const t = type.toLowerCase();
  const cls = t.includes('nuit') ? 'nuit' : t.includes('enseign') ? 'ens' : t.includes('explo') ? 'jour' : 'tek';
  return el(`span.badge.${cls}`, { text: type || 'Non précisé' });
}

// ------------------------------------------------------------
//  Liste
// ------------------------------------------------------------

export async function divesView() {
  const diverId = await store.getActiveDiverId();
  if (!diverId) {
    return {
      title: 'Carnet de plongée',
      node: el('div.empty', {},
        el('span.big', { text: '🤿' }),
        'Bienvenue !', el('br'),
        'Commence par créer ton profil de plongeur.',
        el('div', { style: { marginTop: '20px' } },
          el('button.btn.primary', { onclick: () => navigate('diver/new') }, 'Créer mon profil')),
      ),
    };
  }

  const diver = await store.getDiver(diverId);
  const dives = await store.listDives(diverId);
  const seances = await store.listSeances(diverId);
  const buddies = await store.listBuddies();
  const buddyName = id => nomAffiche(buddies.find(b => b.id === id));

  const wrap = el('div');

  // Le bandeau d'identité vit dans la barre du haut : une carte pour deux
  // lignes de texte coûtait 80 px de hauteur sur chaque écran.
  const st = await store.stats(diverId);
  const identite = {
    nom: fullName(diver) || 'Carnet',
    prenom: diver?.prenom || '',
    compte: `${st.count} plongée${st.count > 1 ? 's' : ''}`,
    derniere: st.lastDate ? fmtDate(st.lastDate) : '',
  };

  if (!dives.length && !seances.length) {
    wrap.append(el('div.empty', {},
      el('span.big', { text: '🌊' }),
      'Ton carnet est vide.', el('br'),
      'Appuie sur + pour saisir ta première plongée.',
    ));
    return { title: 'Plongées', node: wrap, identite };
  }

  // ------------------------------------------------------------
  //  Deux niveaux de choix, toujours au même endroit :
  //   1. la discipline : Plongées · Fosses · Séances (piscine, apnée…)
  //   2. la vue : Liste · Agenda · Carte
  // ------------------------------------------------------------
  const lire = (k, def) => { try { return localStorage.getItem(k) || def; } catch { return def; } };
  const garder = (k, v) => { try { localStorage.setItem(k, v); } catch { /* privé */ } };
  const CLE_DISC = 'plongee-journal:discipline', CLE_VUE = 'plongee-journal:vue-dives';

  const fosses = seances.filter(s => s.type === 'fosse');
  const autres = seances.filter(s => s.type !== 'fosse');

  let discipline = lire(CLE_DISC, 'plongees');
  let vue = lire(CLE_VUE, 'liste');
  if (vue === 'seances') { discipline = 'seances'; vue = 'liste'; }      // ancien réglage
  if (!['plongees', 'fosses', 'seances'].includes(discipline)) discipline = 'plongees';
  if (!['liste', 'calendrier', 'carte'].includes(vue)) vue = 'liste';

  const segDisc = el('div.seg.seg-discipline');
  const segVue = el('div.seg.seg-vue');
  const outils = el('div.dives-outils', {}, segVue);
  const contenu = el('div.dives-contenu');
  const search = el('input', { type: 'search', placeholder: 'Chercher un lieu, un compagnon, une observation…' });

  const nb = { plongees: dives.length, fosses: fosses.length, seances: autres.length };
  function rendreSegments() {
    segDisc.innerHTML = '';
    [['plongees', '🤿', 'Plongées'], ['fosses', '🎯', 'Fosses'], ['seances', '🏊', 'Séances']].forEach(([id, ico, label]) => {
      const b = el('button', { type: 'button' }, el('span.seg-ico', { text: ico }), label, el('span.seg-n', { text: String(nb[id]) }));
      if (id === discipline) b.classList.add('on');
      b.onclick = () => { discipline = id; garder(CLE_DISC, id); rendreSegments(); afficher(); };
      segDisc.append(b);
    });

    segVue.innerHTML = '';
    segVue.hidden = discipline === 'seances';
    const vues = [['liste', '☰ Liste'], ['calendrier', '▦ Agenda'], ...(discipline === 'plongees' ? [['carte', '🗺 Carte']] : [])];
    if (!vues.some(([id]) => id === vue)) vue = 'liste';
    vues.forEach(([id, label]) => {
      const b = el('button', { type: 'button', text: label });
      if (id === vue) b.classList.add('on');
      b.onclick = () => { vue = id; garder(CLE_VUE, id); rendreSegments(); afficher(); };
      segVue.append(b);
    });
    search.hidden = vue !== 'liste' || discipline === 'seances';
  }

  // Des « plongées » importées qui étaient des piscines ou des fosses.
  // Les vidéos pCloud : d'après la liste en cache (elle se rafraîchit en fond).
  const cfgVideos = await configVideos().catch(() => null);
  const dossiersVideos = cfgVideos ? dossiersEnCache(cfgVideos) : null;
  if (cfgVideos) chargerDossiers(cfgVideos).catch(() => {});
  const aDesVideos = d => !!(dossiersVideos && videosDePlongee(d, dossiersVideos)?.fichiers.length);

  // Ce qui manque, et ce qu'on peut aller chercher.
  const liste = listeMontre();
  const debutMontre = debutOrdinateur(dives);
  const bilans = new Map(dives.map(d => [d.id, bilanDonnees(d, { liste, debutMontre })]));
  const parMontre = dives.filter(d => bilans.get(d.id).recuperer.some(r => r.ou === 'montre'));
  const parCompte = dives.filter(d => bilans.get(d.id).recuperer.some(r => r.ou === 'compte'));
  const bandeauDonnees = parMontre.length || parCompte.length ? el('div.card.donnees-bandeau', {},
    el('div', { style: { fontWeight: '650' }, text: '📥 Des données à récupérer' }),
    parMontre.length ? el('button.btn.sm', { type: 'button', onclick: () => navigate('montre'),
      text: `⌚ ${parMontre.length} plongée${parMontre.length > 1 ? 's' : ''} encore dans la montre : courbe, sonde, cœur` }) : null,
    parCompte.length ? el('button.btn.sm', { type: 'button', onclick: () => navigate('suunto-cloud'),
      text: `☁️ ${parCompte.length} sans courbe : à compléter depuis le compte Suunto` }) : null,
  ) : null;

  const aRanger = plongeesARanger(dives, seances);
  const bandeauRanger = aRanger.length ? el('div.card.alerte.clickable', {
    onclick: () => { discipline = 'seances'; garder(CLE_DISC, discipline); rendreSegments(); afficher(); },
  },
    el('div', { style: { fontWeight: '650' }, text: `🏊 ${aRanger.length} plongée${aRanger.length > 1 ? 's' : ''} importée${aRanger.length > 1 ? 's' : ''} ressemble${aRanger.length > 1 ? 'nt' : ''} à des séances` }),
    el('div.hint', { text: 'Piscine, fosse : range-les dans Séances pour qu’elles ne comptent plus comme plongées ›' })) : null;

  outils.append(search);
  wrap.append(el('div.dives-barre', {}, segDisc, outils), bandeauRanger || '', bandeauDonnees || '', contenu);

  function matches(d, q) {
    if (!q) return true;
    const hay = [
      d.lieuNom, d.lieuDetail, d.site, d.lieu, d.type, d.fait, d.vu, d.observations, d.notes,
      d.objectifAutre, ...(d.options || []), ...(d.objectifs || []),
      ...(d.buddyIds || []).map(buddyName), String(d.numero ?? ''),
    ].join(' ').toLowerCase();
    return hay.includes(q);
  }

  // Années repliées / dépliées : retenu sur l'appareil, par discipline.
  const ouvertesDe = cle => {
    let s;
    try { s = new Set(JSON.parse(localStorage.getItem(cle) || 'null')); } catch { s = null; }
    return s && s.size ? s : null;
  };
  const etats = {
    plongees: { cle: 'plongee-journal:annees-ouvertes' },
    fosses: { cle: 'plongee-journal:annees-ouvertes-fosses' },
  };
  etats.plongees.ouvertes = ouvertesDe(etats.plongees.cle) || new Set([(dives[0]?.date || '').slice(0, 4)]);
  etats.fosses.ouvertes = ouvertesDe(etats.fosses.cle) || new Set([(fosses[0]?.date || '').slice(0, 4)]);

  // Profondeur de référence des courbes : la plus profonde du carnet (40 m mini).
  const profRef = Math.max(40, ...dives.map(d => Number(d.profMax) || 0));

  /** Après une retouche dans l'aperçu : la liste se remet à jour. */
  async function rafraichir() {
    const frais = await store.listDives(diverId);
    dives.splice(0, dives.length, ...frais);
    // Des plongeurs ont pu être ajoutés dans l'aperçu : sans eux, leurs
    // noms manqueraient sur les cartes.
    buddies.splice(0, buddies.length, ...(await store.listBuddies()));
    const fs = (await store.listSeances(diverId)).filter(s => s.type === 'fosse');
    fosses.splice(0, fosses.length, ...fs);
    afficher({ garderScroll: true });
  }

  /** Les compagnons, toujours là : « à compléter » tant qu'il n'y en a pas. */
  const palanquee = (ids, sansNom = false) => {
    const noms = (ids || []).map(buddyName).filter(Boolean);
    if (sansNom) noms.push('Moniteur');
    return el(`div.dive-sub.dive-buddies${noms.length ? '' : '.vide'}`, { title: noms.join(', ') || 'Palanquée à compléter' },
      el('span.metr-ico', { html: '<svg class="ico-m" viewBox="0 0 24 24"><use href="#i-buddies"/></svg>' }),
      el('span', { text: noms.length ? noms.join(', ') : 'Palanquée à compléter' }));
  };

  function carte(d) {
    const a = ambianceDe(d);
    const prof = Number(d.profMax) || 0;
    return el('div.card.clickable.dive-card', { style: stylesAmbiance(a), onclick: () => apercuPlongee(d.id, { onClose: rafraichir }) },
      vignetteLieu(d, { boite: 84, contenu: d.numero ?? '—' }),
      el('div.dive-main', {},
        el('div.dive-title', { text: d.lieuNom || d.site || 'Lieu non précisé' }),
        el('div.dive-sub', {}, fmtDate(d.date), d.heureImmersion ? ` · ${d.heureImmersion}` : ''),
        el('div.dive-tags', {}, etiquetteAmbiance(d), d.type ? typeBadge(d.type) : null,
          bilans.get(d.id) ? badgeDonnees(bilans.get(d.id)) : null,
          aDesVideos(d) ? el('span.donnees', { title: 'Vidéos dans pCloud', text: '🎬' }) : null),
        el('div.dive-bas', {},
          el('div.dive-metrics', {},
            chiffre('prof', prof ? `${prof} m` : '—', 'Profondeur max'),
            chiffre('duree', fmtDuration(d.dureeMin), 'Durée'),
            d.tempFond != null ? chiffre('eau', `${d.tempFond}°`, 'Eau au fond') : null),
          miniCourbe(d.samples || d.profil, { prof, duree: Number(d.dureeMin) || 0, profRef })),
        palanquee(d.buddyIds, d.moniteurSansNom),
      ),
    );
  }

  /** Une fosse, présentée comme une plongée : même carte, mêmes repères. */
  const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  function carteFosse(s) {
    const commePlongee = { ...s, lieuNom: s.lieu, options: ['Plongée en fosse'] };
    const a = ambianceDe(commePlongee);
    const prof = Number(s.profMax) || 0;
    const jour = s.date ? new Date(`${s.date}T12:00:00`) : null;
    return el('div.card.clickable.dive-card', { style: stylesAmbiance(a), onclick: () => apercuSeance(s.id, { onClose: rafraichir }) },
      vignetteLieu(commePlongee, { boite: 84, contenu: jour ? el('span.vj', {}, el('small', { text: JOURS_COURTS[jour.getDay()] }), String(jour.getDate())) : '—' }),
      el('div.dive-main', {},
        el('div.dive-title', { text: s.lieu || 'Fosse' }),
        el('div.dive-sub', {}, fmtDate(s.date), s.heure ? ` · ${s.heure}` : ''),
        el('div.dive-bas', {},
          el('div.dive-metrics', {},
            chiffre('prof', prof ? `${prof} m` : '—', 'Profondeur max'),
            chiffre('duree', fmtDuration(s.dureeMin), 'Durée'),
            s.tempEau != null ? chiffre('eau', `${s.tempEau}°`, 'Eau') : null),
          miniCourbe(s.samples, { prof, duree: Number(s.dureeMin) || 0, profRef })),
        palanquee(s.buddyIds),
        s.notes ? el('div.dive-sub.dive-buddies', { text: s.notes }) : null));
  }

  /** Liste par année, repliable — plongées et fosses partagent le rendu. */
  function listeParAnnee(elements, { etat, fabrique, mot }) {
    const q = search.value.trim().toLowerCase();
    const shown = elements.filter(d => matches(d, q));
    const box = el('div.dive-list');
    if (!shown.length) {
      box.append(el('div.empty', { text: elements.length ? 'Rien ne correspond.' : `Aucune ${mot} pour l’instant.` }));
      return box;
    }
    const parAnnee = new Map();
    shown.forEach(d => {
      const y = (d.date || '').slice(0, 4) || 'Sans date';
      if (!parAnnee.has(y)) parAnnee.set(y, []);
      parAnnee.get(y).push(d);
    });

    parAnnee.forEach((lot, y) => {
      const prof = Math.max(0, ...lot.map(d => Number(d.profMax) || 0));
      const ambiances = mot === 'plongée'
        ? [...new Map(lot.map(d => { const a = ambianceDe(d); return [a.id, a]; })).values()] : [];
      const ouvert = q ? true : etat.ouvertes.has(y);
      const heures = Math.round(lot.reduce((t, d) => t + (Number(d.dureeMin) || 0), 0) / 60);

      const groupe = el('details.annee-groupe', { open: ouvert },
        el('summary.annee-tete', {},
          el('span.annee-num', { text: y }),
          el('span.annee-info', {},
            `${lot.length} ${mot}${lot.length > 1 ? 's' : ''}`,
            prof ? ` · max ${prof} m` : '', heures ? ` · ${heures} h` : ''),
          el('span.annee-pastilles', {}, ambiances.map(a =>
            el('span.amb-point', { style: stylesAmbiance(a), title: a.nom }))),
          el('span.annee-chevron', { 'aria-hidden': 'true', text: '›' })),
        el('div.annee-cartes'));

      // Les cartes ne sont construites qu'à l'ouverture (vignettes satellite).
      const remplir = () => {
        const zone = groupe.querySelector('.annee-cartes');
        if (!zone.childNodes.length) zone.append(...lot.map(fabrique));
      };
      if (ouvert) remplir();
      groupe.addEventListener('toggle', () => {
        if (groupe.open) remplir();
        if (q) return;
        if (groupe.open) etat.ouvertes.add(y); else etat.ouvertes.delete(y);
        garder(etat.cle, JSON.stringify([...etat.ouvertes]));
      });
      box.append(groupe);
    });
    box.append(el('div.hint.credit-sat', { text: 'Vignettes satellite © Esri, Maxar, Earthstar Geographics' }));
    return box;
  }

  async function afficher({ garderScroll = false } = {}) {
    const vueEl = document.getElementById('view');
    const y = garderScroll ? vueEl?.scrollTop : 0;
    if (bandeauRanger) bandeauRanger.hidden = discipline !== 'plongees' || vue !== 'liste';
    contenu.innerHTML = '';

    if (discipline === 'seances') {
      const { seancesPanneau } = await import('./seances.js');
      contenu.append(seancesPanneau({ seances: autres, dives, types: TYPES_SEANCE.filter(t => t.id !== 'fosse') }));
    } else if (vue === 'calendrier') {
      const { calendrier } = await import('./calendar.js');
      contenu.append(discipline === 'fosses'
        ? calendrier([], { buddies, seances: fosses, couches: ['fosse'] })
        : calendrier(dives, { buddies, seances }));
    } else if (vue === 'carte') {
      const { carteDesPlongees } = await import('./carte.js');
      contenu.append(carteDesPlongees(dives, { buddies }));
    } else if (discipline === 'fosses') {
      contenu.append(listeParAnnee(fosses, { etat: etats.fosses, fabrique: carteFosse, mot: 'fosse' }));
    } else {
      contenu.append(listeParAnnee(dives, { etat: etats.plongees, fabrique: carte, mot: 'plongée' }));
    }
    if (garderScroll && vueEl) vueEl.scrollTop = y;
  }

  search.addEventListener('input', debounce(() => afficher(), 200));
  rendreSegments();
  await afficher();

  return { title: 'Plongées', node: wrap, identite };
}

/** Une « plongée » qui était une séance : on la range, elle quitte le carnet. */
function versSeance(d) {
  openModal(close => el('div', {},
    el('h3', { text: 'C’était une séance ?' }),
    el('div.hint', { style: { marginBottom: '12px' },
      text: `La plongée n°${d.numero ?? ''} quitte le carnet et devient une séance : `
          + 'elle ne compte plus comme plongée. Date, heure, durée, profil et notes sont gardés.' }),
    el('div.btn-row', { style: { flexWrap: 'wrap' } },
      ...TYPES_SEANCE.map(t => el('button.btn', {
        type: 'button', text: `${t.icone} ${t.label}`,
        onclick: async () => {
          const s = await store.plongeeEnSeance(d.id, t.id);
          close();
          toast(`Rangée en séance : ${t.label}`);
          navigate(`seance/${s.id}`, true);
        },
      }))),
    el('div.btn-row', {}, el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }))));
}

// ------------------------------------------------------------
//  Fiche détaillée
// ------------------------------------------------------------

export async function diveView({ id }) {
  const d = await store.getDive(id);
  if (!d) return { title: 'Introuvable', node: el('div.empty', { text: 'Plongée introuvable.' }), back: true };

  const buddies = await store.listBuddies();
  const buddyName = bid => nomAffiche(buddies.find(b => b.id === bid));
  const wrap = el('div.fiche');

  const kv = (k, v) => (v === null || v === undefined || v === '' || v === '—')
    ? null : el('div.kv', {}, el('span.k', { text: k }), el('span.v', {}, v));

  // En-tête
  const amb = ambianceDe(d);
  wrap.append(el('div.card.fiche-tete', { style: stylesAmbiance(amb) },
    el('div.fiche-tete-texte', {},
      el('div.fiche-lieu', { text: d.lieuNom || d.site || 'Lieu non précisé' }),
      el('div.fiche-date', { text: fmtDateLong(d.date) }),
      el('div.dive-tags', {}, etiquetteAmbiance(d), d.type ? typeBadge(d.type) : null),
      el('div.fiche-chiffres', {},
        d.profMax ? el('span', {}, el('b', { text: `${d.profMax} m` }), 'prof. max') : null,
        d.dureeMin ? el('span', {}, el('b', { text: fmtDuration(d.dureeMin) }), 'au fond') : null,
        d.tempFond != null ? el('span', {}, el('b', { text: `${d.tempFond}°C` }), 'eau') : null),
    ),
    vignetteLieu(d, { boite: 112, zoom: 11, contenu: d.numero ?? '—', classe: 'grande' }),
  ));

  // Actions en tête : on ouvre une fiche pour la lire ou la corriger.
  // Les chercher en bas d'une page longue n'avait aucun sens.
  wrap.append(el('div.btn-row.actions-fiche', {},
    el('button.btn.primary', { text: '✎ Modifier', onclick: () => navigate(`dive/${d.id}/edit`) }),
    el('button.btn.ghost', {
      text: '↪ En séance', title: 'C’était une fosse, une piscine ou une apnée',
      onclick: () => versSeance(d),
    }),
    el('button.btn.danger', {
      text: '🗑 Supprimer',
      onclick: async () => {
        if (await confirmBox(
          `Supprimer la plongée n°${d.numero ?? ''} du ${fmtDate(d.date)} ?`, 'Supprimer')) {
          await store.deleteDive(d.id);
          if (d.photoCarnet?.ref) oublierPhoto(d.photoCarnet.ref).catch(() => {});
          toast('Plongée supprimée');
          navigate('dives', true);
        }
      },
    }),
  ));

  // La page du carnet papier, telle qu'elle a été photographiée
  const pageCarnet = photoCarnetFiche(d);
  if (pageCarnet) wrap.append(pageCarnet);

  // ---------- Ce que dit la montre : chiffres et courbes ----------
  const courbe = d.samples?.length ? d.samples : d.profil;
  const analyse = analyserProfil(courbe, d);
  const tuiles = tuilesPlongee(d, analyse);
  const paliersTxt = [d.palier9 && `${d.palier9}′ à 9 m`, d.palier6 && `${d.palier6}′ à 6 m`, d.palier3 && `${d.palier3}′ à 3 m`]
    .filter(Boolean).join(', ');
  if (tuiles || courbe?.length) {
    wrap.append(el('div.section', {},
      el('h2', { text: courbe?.length ? 'La plongée, d’après la montre' : 'Les chiffres' }),
      el('div.card', {},
        tuiles,
        courbe?.length ? el('div', { style: { marginTop: '12px' } }, graphiquePlongee(courbe, { dive: d })) : null,
        (d.suuntoKeys || []).length > 1
          ? el('div.hint', { text: `Fusion de ${d.suuntoKeys.length} enregistrements Suunto.` }) : null,
        el('div.hint', { style: { marginBottom: 0 }, text: [
          d.heureImmersion ? `Immersion ${d.heureImmersion}${d.heureSortie ? `, sortie ${d.heureSortie}` : ''}` : null,
          paliersTxt ? `paliers : ${paliersTxt}${d.paliersEstimes ? ' (estimés)' : ''}` : null,
          d.palierSecu && !analyse?.palierSecuMin ? `palier de sécurité ${d.palierSecuMin || 3} min` : null,
          d.niveau ? `niveau ${d.niveau}` : null,
          d.altitude != null && d.altitude > 300 ? `altitude ${Math.round(d.altitude)} m` : null,
        ].filter(Boolean).join(' · ') || null }),
      ),
    ));
  }

  // ---------- Vidéos (pCloud) ----------
  const toutesPlongees = await store.listDives(d.diverId);
  wrap.append(sectionVideos(d, toutesPlongees, { lecture: document.documentElement.classList.contains('partage') }));

  // ---------- Les données : ce qu'on a, ce qui manque, où le trouver ----------
  {
    const toutes = toutesPlongees;
    const b = bilanDonnees(d, { debutMontre: debutOrdinateur(toutes) });
    const ligne = (ok, texte, detail = '') => el('div.donnee', { class: ok === true ? 'ok' : ok === 'moyen' ? 'moyen' : 'non' },
      el('span.donnee-ico', { text: ok === true ? '✓' : ok === 'moyen' ? '◐' : '✗' }),
      el('span', {}, texte, detail ? el('small', { text: ` — ${detail}` }) : null));
    const sonde = {
      courbe: [true, 'Sonde : courbe de pression du bloc'],
      'debut-fin': ['moyen', 'Sonde : pression de début et de fin seulement', 'pas la courbe'],
      defaut: [false, 'Sonde : 200 → 50 bar par défaut', 'pas une mesure'],
      aucune: [false, 'Sonde : pas de pression du bloc'],
    }[b.sonde];
    wrap.append(el('details.section.donnees-fiche', { open: b.recuperer.length ? true : null },
      el('summary', {}, el('h2', { text: 'Données' }), badgeDonnees(b)),
      el('div.card', {},
        el('div.hint', { style: { marginTop: 0 }, text: LIBELLE_SOURCE[b.source] }),
        ligne(b.courbe, 'Courbe de plongée'),
        ligne(...sonde),
        ligne(b.temp, 'Température'),
        ligne(b.ndl, 'Temps sans palier / plafond'),
        ligne(b.coeur, 'Cœur'),
        ligne(b.gps, 'Point GPS'),
        ...b.recuperer.map(r => el('button.btn.sm', { type: 'button', style: { marginTop: '10px' },
          onclick: () => navigate(r.ou === 'montre' ? 'montre' : 'suunto-cloud'),
          text: r.ou === 'montre' ? `⌚ Récupérer depuis la montre : ${r.quoi}` : `☁️ Compléter depuis le compte Suunto : ${r.quoi}` })),
        !b.recuperer.length && b.niveau !== 'complet' ? el('div.hint', { style: { marginBottom: 0 }, text:
          b.source === 'montre' ? 'C’est tout ce que la montre a enregistré.'
          : 'La courbe de la sonde ne vient que de la montre en Bluetooth, tant qu’elle garde la plongée. '
          + 'Connecte-toi à la montre : si la plongée y est encore, elle sera proposée pour compléter.' }) : null,
      )));
  }

  // ---------- Ma plongée : ce qui a été coché ----------
  const ressentis = (d.ressenti || []).map(id => RESSENTIS.find(r => r.id === id)).filter(Boolean);
  const coches = [...(d.objectifs || []), ...(d.exercices || []), d.objectifAutre].filter(Boolean);
  const options = d.options || [];
  if (d.note || ressentis.length || coches.length || options.length || d.observations) {
    wrap.append(el('div.section', {},
      el('h2', { text: 'Ma plongée' }),
      el('div.card', {},
        d.note ? el('div.etoiles.lecture', { 'aria-label': `${d.note} sur 5` },
          ...[1, 2, 3, 4, 5].map(n => el('button', { type: 'button', tabindex: '-1', class: d.note >= n ? 'on' : null, text: '★' }))) : null,
        ressentis.length ? el('div.fiche-coches', { style: { marginTop: d.note ? '8px' : 0 } },
          ...ressentis.map(r => el('span.chip.solid', { text: `${r.icone} ${r.label}` }))) : null,
        coches.length ? el('div.fiche-coches', { style: { marginTop: '8px' } },
          ...coches.map(t => el('span.chip.solid', { text: t }))) : null,
        options.length ? el('div.fiche-coches', { style: { marginTop: '8px' } },
          ...options.map(t => el('span.chip', { text: t }))) : null,
        d.observations ? el('div.prose', { style: { marginTop: '10px' }, text: d.observations }) : null,
      ),
    ));
  }

  // ---------- Conditions, en une ligne de pictos ----------
  const conditions = [
    picto(METEO, d.meteo), picto(ETAT_MER, d.etatMer),
    d.visibilite ? `${VISIBILITE_ICONES[d.visibilite] || '👁'} visibilité ${d.visibilite.toLowerCase()}` : null,
    d.courant ? `${COURANTS.find(c => c.id === d.courant)?.icone || ''} courant ${String(picto(COURANTS, d.courant) || '').replace(/^\S+\s*/, '').toLowerCase()}`.trim() : null,
    d.tempAir != null ? `🌡 air ${d.tempAir} °C` : null,
    d.tempSurface != null ? `🌊 surface ${d.tempSurface} °C` : null,
    d.eau ? (d.eau === 'salee' ? '🧂 eau salée' : '💧 eau douce') : null,
  ].filter(Boolean);
  if (conditions.length) {
    wrap.append(el('div.section', {}, el('h2', { text: 'Conditions' }),
      el('div.card', {}, el('div.fiche-conditions', {}, ...conditions.map(c => el('span', { text: c }))))));
  }

  // ---------- Palanquée ----------
  if ((d.buddyIds || []).length || d.palanqueeMode || d.moniteurSansNom || d.centreNom) {
    const modeLabel = {
      moniteur: 'Encadré par un moniteur', chef: 'Guide de palanquée',
      autonome2: 'Autonome à 2', autonome3: 'Autonome à 3',
      // « solo » n'est plus proposé, mais reste lisible sur les anciennes fiches.
      jeChef: 'J’étais chef de palanquée', solo: 'Solo',
    }[d.palanqueeMode];

    wrap.append(el('div.section', {},
      el('h2', { text: 'Palanquée' }),
      el('div.card', {},
        modeLabel ? el('div', { style: { marginBottom: '10px', color: 'var(--text-dim)' }, text: modeLabel }) : null,
        d.centreNom ? el('div', { style: { marginBottom: '10px' } }, el('b', { text: d.centreNom }),
          d.centreAdresse ? el('span', { style: { color: 'var(--text-dim)' }, text: ` · ${d.centreAdresse}` }) : null) : null,
        (d.buddyIds || []).length || d.moniteurSansNom
          ? el('div.chips', {}, ...(d.buddyIds || []).filter(bid => buddyName(bid)).map(bid =>
              el('span.chip.solid', {
                text: buddyName(bid) + (bid === d.chefBuddyId ? ' ★' : ''),
              })),
              d.moniteurSansNom ? el('span.chip.solid', { text: 'Moniteur (nom inconnu)' }) : null)
          : null,
      ),
    ));
  }

  // ---------- Lieu ----------
  if (d.lat != null) {
    wrap.append(el('div.section', {},
      el('h2', { text: d.site ? `Lieu · ${d.site}` : 'Lieu' }),
      // 3 km de large : assez pour reconnaître la côte et le port.
      staticMap(d.lat, d.lng, { km: 3 }),
      el('div.hint', {},
        d.lieuDetail ? el('div', { text: d.lieuDetail }) : null,
        el('div', { text: `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}${d.lieuAuto ? ' · nom trouvé d’après le GPS' : ''}` }),
        el('a', {
          href: `https://www.google.com/maps?q=${d.lat},${d.lng}`,
          target: '_blank', rel: 'noopener',
          style: { color: 'var(--accent)' },
        }, 'Ouvrir dans Maps'),
      ),
    ));
  }

  // ---------- Matériel & bouteille ----------
  const conso = analyse?.bloc?.sac ? null : consommation(d);
  const matCard = el('div.card', {},
    kv('Gaz', libelleGaz(d) || null),
    kv('Bloc', [d.blocType, d.blocMatiere, d.blocLitres ? `${d.blocLitres} L` : null].filter(Boolean).join(' · ') || null),
    kv('Pression', (d.pressionDepart || d.pressionFin) && !analyse?.bloc
      ? `${d.pressionDepart ?? '?'} → ${d.pressionFin ?? '?'} bar` : null),
    kv('Consommation', conso ? `${conso.surface} L/min en surface · ${conso.litres} L${conso.estime ? ' (estimé)' : ''}` : null),
    kv('Lestage', d.lestage ? `${String(d.lestage).replace(/\s*kg$/i, '')} kg` : null),
    kv('Combinaison', [d.combiType, d.combiMm ? `${d.combiMm} mm` : null]
      .filter(Boolean).join(' ') || d.combinaison || null),
  );
  if (matCard.children.length) {
    wrap.append(el('div.section', {}, el('h2', { text: 'Matériel' }), matCard));
  }

  // Ce que j'ai vu
  const categories = [
    ['🐟 Faune', d.vuFaune], ['🌿 Flore', d.vuFlore], ['⚓ Épaves', d.vuEpaves],
  ].filter(([, v]) => v?.length);

  if (categories.length) {
    wrap.append(el('div.section', {},
      el('h2', { text: 'Ce que j’ai vu' }),
      ...categories.map(([titre, liste]) => el('div.card', {},
        el('div.lbl', { text: `${titre} · ${liste.length}` }),
        el('div.obs-grid', {}, liste.map(o => el('div.obs', {},
          o.photo
            ? el('img', { src: o.photo, alt: o.nom, loading: 'lazy' })
            : el('div.obs-noimg', { text: titre.split(' ')[0] }),
          el('div.obs-nom', { text: o.nom }),
          o.sci && o.sci !== o.nom ? el('div.obs-sci', { text: o.sci }) : null,
        ))),
      )),
    ));
  }

  // Comptes-rendus
  const notes = [
    ['Ce que j’ai fait', d.fait],
    ['Note', d.vu],           // ancien champ libre, conservé s'il est rempli
  ].filter(([, v]) => v);
  if (notes.length) {
    wrap.append(el('div.section', {},
      el('h2', { text: 'Comptes-rendus' }),
      ...notes.map(([k, v]) => el('div.card', {},
        el('div.lbl', { text: k }),
        el('div.prose', { text: v }))),
    ));
  }

  return { title: `Plongée n°${d.numero ?? ''}`, node: wrap, back: true };
}
