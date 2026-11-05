// ============================================================
//  Liste des plongées + fiche détaillée
// ============================================================

import { el, fmtDate, fmtDateLong, fmtDuration, fullName, toast, confirmBox, openModal, debounce } from '../lib.js';
import { apercuPlongee, apercuSeance } from '../apercu.js';
import { store, TYPES_SEANCE } from '../store.js';
import { staticMap } from '../map.js';
import { navigate } from '../router.js';
import { profileSvg } from '../fit.js';
import { consommation, libelleGaz } from '../store.js';
import { METEO, ETAT_MER, COURANTS, VISIBILITE_ICONES } from '../config.js';
import { ambianceDe, stylesAmbiance, vignetteLieu, etiquetteAmbiance } from '../ambiance.js';
import { plongeesARanger } from '../seances.js';
import { photoCarnetFiche } from './carnet-photo.js';
import { oublierPhoto } from '../photos.js';

/** Retrouve le pictogramme d'une condition à partir de sa valeur stockée. */
const picto = (liste, valeur) => {
  const o = liste.find(x => x.id === valeur || x.label === valeur);
  return o ? `${o.icone} ${o.label}` : (valeur || null);
};

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
  const buddyName = id => fullName(buddies.find(b => b.id === id)) || '?';

  const wrap = el('div');

  // Le bandeau d'identité vit dans la barre du haut : une carte pour deux
  // lignes de texte coûtait 80 px de hauteur sur chaque écran.
  const st = await store.stats(diverId);
  const identite = {
    nom: fullName(diver) || 'Carnet',
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
  const aRanger = plongeesARanger(dives, seances);
  const bandeauRanger = aRanger.length ? el('div.card.alerte.clickable', {
    onclick: () => { discipline = 'seances'; garder(CLE_DISC, discipline); rendreSegments(); afficher(); },
  },
    el('div', { style: { fontWeight: '650' }, text: `🏊 ${aRanger.length} plongée${aRanger.length > 1 ? 's' : ''} importée${aRanger.length > 1 ? 's' : ''} ressemble${aRanger.length > 1 ? 'nt' : ''} à des séances` }),
    el('div.hint', { text: 'Piscine, fosse : range-les dans Séances pour qu’elles ne comptent plus comme plongées ›' })) : null;

  outils.append(search);
  wrap.append(el('div.dives-barre', {}, segDisc, outils), bandeauRanger || '', contenu);

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

  // Profondeur de référence de la jauge : la plus profonde du carnet (40 m mini).
  const profRef = Math.max(40, ...dives.map(d => Number(d.profMax) || 0));
  const jauge = prof => prof ? el('div.jauge', { title: `${prof} m` },
    el('span', { style: { width: `${Math.min(100, (prof / profRef) * 100)}%` } })) : null;

  /** Après une retouche dans l'aperçu : la liste se remet à jour. */
  async function rafraichir() {
    const frais = await store.listDives(diverId);
    dives.splice(0, dives.length, ...frais);
    const fs = (await store.listSeances(diverId)).filter(s => s.type === 'fosse');
    fosses.splice(0, fosses.length, ...fs);
    afficher({ garderScroll: true });
  }

  function carte(d) {
    const a = ambianceDe(d);
    const prof = Number(d.profMax) || 0;
    return el('div.card.clickable.dive-card', { style: stylesAmbiance(a), onclick: () => apercuPlongee(d.id, { onClose: rafraichir }) },
      vignetteLieu(d, { boite: 84, contenu: d.numero ?? '—' }),
      el('div.dive-main', {},
        el('div.dive-title', { text: d.lieuNom || d.site || 'Lieu non précisé' }),
        el('div.dive-sub', {}, fmtDate(d.date), d.heureImmersion ? ` · ${d.heureImmersion}` : ''),
        el('div.dive-tags', {}, etiquetteAmbiance(d), d.type ? typeBadge(d.type) : null),
        el('div.dive-metrics', {},
          el('span', {}, el('b', { text: prof ? `${prof} m` : '—' }), ' prof.'),
          el('span', {}, el('b', { text: fmtDuration(d.dureeMin) }), ' fond'),
          d.tempFond != null ? el('span', {}, el('b', { text: `${d.tempFond}°` }), ' eau') : null,
        ),
        jauge(prof),
        (d.buddyIds || []).length
          ? el('div.dive-sub.dive-buddies', { text: '👥 ' + d.buddyIds.map(buddyName).join(', ') })
          : null,
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
        el('div.dive-metrics', {},
          el('span', {}, el('b', { text: prof ? `${prof} m` : '—' }), ' prof.'),
          el('span', {}, el('b', { text: fmtDuration(s.dureeMin) }), ' durée'),
          s.tempEau != null ? el('span', {}, el('b', { text: `${s.tempEau}°` }), ' eau') : null),
        jauge(prof),
        (s.buddyIds || []).length
          ? el('div.dive-sub.dive-buddies', { text: '👥 ' + s.buddyIds.map(buddyName).join(', ') })
          : null,
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
  const buddyName = bid => fullName(buddies.find(b => b.id === bid)) || '?';
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

  // Carte
  if (d.lat != null) {
    wrap.append(el('div.section', {},
      // 3 km de large : assez pour reconnaître la côte et le port.
      staticMap(d.lat, d.lng, { km: 3 }),
      el('div.hint', {},
        d.lieuDetail ? el('div', { text: d.lieuDetail }) : null,
        el('div', { text: `${d.lat.toFixed(5)}, ${d.lng.toFixed(5)}` }),
        el('a', {
          href: `https://www.google.com/maps?q=${d.lat},${d.lng}`,
          target: '_blank', rel: 'noopener',
          style: { color: 'var(--accent)' },
        }, 'Ouvrir dans Maps'),
      ),
    ));
  }

  // Courbe de profondeur (import ordinateur de plongée)
  if ((d.samples || d.profil)?.length) {
    wrap.append(el('div.section', {},
      el('h2', { text: 'Courbe de profondeur' }),
      el('div.card', {},
        el('div', { html: profileSvg(d.samples || d.profil) }),
        (d.suuntoKeys || []).length > 1
          ? el('div.hint', { text: `Fusion de ${d.suuntoKeys.length} enregistrements Suunto.` })
          : null,
      ),
    ));
  }

  // Profil
  const paliers = [
    d.palier9 ? `${d.palier9} min à 9 m` : null,
    d.palier6 ? `${d.palier6} min à 6 m` : null,
    d.palier3 ? `${d.palier3} min à 3 m` : null,
  ].filter(Boolean).join(' · ');

  wrap.append(el('div.section', {},
    el('h2', { text: 'Profil' }),
    el('div.card', {},
      kv('Durée', d.dureeMin ? fmtDuration(d.dureeMin) : null),
      kv('Profondeur max', d.profMax ? `${d.profMax} m` : null),
      kv('Immersion', d.heureImmersion || null),
      kv('Sortie', d.heureSortie || null),
      kv('Paliers', paliers || null),
      kv('Palier de sécurité', d.palierSecu ? `${d.palierSecuMin || 3} min` : null),
      kv('Eau', d.eau === 'salee' ? 'Salée' : d.eau === 'douce' ? 'Douce' : null),
      kv('Altitude', d.altitude != null ? `${Math.round(d.altitude)} m` : null),
      kv('Mon niveau', d.niveau || null),
    ),
  ));

  // Conditions & matériel
  const condCard = el('div.card', {},
    kv('Température fond', d.tempFond != null ? `${d.tempFond} °C` : null),
    kv('Température surface', d.tempSurface != null ? `${d.tempSurface} °C` : null),
    kv('Température air', d.tempAir != null ? `${d.tempAir} °C` : null),
    kv('Météo', picto(METEO, d.meteo)),
    kv('État de l’eau', picto(ETAT_MER, d.etatMer)),
    kv('Visibilité', d.visibilite
      ? `${VISIBILITE_ICONES[d.visibilite] || ''} ${d.visibilite}`.trim() : null),
    kv('Courant', picto(COURANTS, d.courant)),
    kv('Lestage', d.lestage || null),
    kv('Combinaison', [d.combiType, d.combiMm ? `${d.combiMm} mm` : null]
      .filter(Boolean).join(' ') || d.combinaison || null),
    kv('Bloc', d.blocLitres ? `${d.blocLitres} L` : null),
    kv('Pression', (d.pressionDepart || d.pressionFin)
      ? `${d.pressionDepart ?? '?'} → ${d.pressionFin ?? '?'} bar` : null),
  );
  if (condCard.children.length) {
    wrap.append(el('div.section', {}, el('h2', { text: 'Conditions & matériel' }), condCard));
  }

  // Consommation d'air
  const conso = consommation(d);
  if (conso) {
    wrap.append(el('div.section', {},
      el('h2', { text: 'Consommation' }),
      el('div.card', {},
        el('div.conso-chiffres', {},
          el('div.conso-bloc', {},
            el('div.conso-val', { text: `${conso.surface} L/min` }),
            el('div.conso-lbl', { text: 'à la surface' })),
          el('div.conso-bloc', {},
            el('div.conso-val.secondaire', { text: `${conso.brute} L/min` }),
            el('div.conso-lbl', { text: `à ${conso.profMoy} m` })),
          el('div.conso-bloc', {},
            el('div.conso-val.secondaire', { text: `${conso.litres} L` }),
            el('div.conso-lbl', { text: 'consommés' })),
        ),
        el('div.hint', { style: { marginBottom: 0 },
          text: [libelleGaz(d),
                 `${d.pressionDepart} → ${d.pressionFin} bar sur ${d.blocLitres} L`,
                 conso.estime ? 'profondeur moyenne estimée' : null]
            .filter(Boolean).join(' · ') }),
      ),
    ));
  }

  // Spécificités
  const tags = [...(d.options || []), ...(d.objectifs || []), d.objectifAutre].filter(Boolean);
  if (tags.length) {
    wrap.append(el('div.section', {},
      el('h2', { text: 'Spécificités & objectifs' }),
      el('div.card', {}, el('div.chips', {}, tags.map(t => el('span.chip.solid', { text: t })))),
    ));
  }

  // Palanquée
  if ((d.buddyIds || []).length || d.palanqueeMode || d.stampImage || d.stampId) {
    const modeLabel = {
      moniteur: 'Encadré par un moniteur', chef: 'Guide de palanquée',
      autonome2: 'Autonome à 2', autonome3: 'Autonome à 3',
      // « solo » n'est plus proposé, mais reste lisible sur les anciennes fiches.
      jeChef: 'J’étais chef de palanquée', solo: 'Solo',
    }[d.palanqueeMode];

    const stampImg = d.stampImage
      || buddies.flatMap(b => b.stamps || []).find(s => s.id === d.stampId)?.dataUrl;

    wrap.append(el('div.section', {},
      el('h2', { text: 'Palanquée' }),
      el('div.card', {},
        modeLabel ? el('div', { style: { marginBottom: '10px', color: 'var(--text-dim)' }, text: modeLabel }) : null,
        (d.buddyIds || []).length
          ? el('div.chips', {}, d.buddyIds.map(bid =>
              el('span.chip.solid', {
                text: buddyName(bid) + (bid === d.chefBuddyId ? ' ★' : ''),
              })))
          : null,
        stampImg
          ? el('div', { style: { marginTop: '14px' } },
              el('div.lbl', { text: 'Tampon' }),
              el('div.stamp', { style: { width: '130px', aspectRatio: '1' } },
                el('img', { src: stampImg, alt: 'Tampon' })))
          : null,
      ),
    ));
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
    ['Observations', d.observations],
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
