// ============================================================
//  Liste des plongées + fiche détaillée
// ============================================================

import { el, fmtDate, fmtDateLong, fmtDuration, fullName, toast, confirmBox } from '../lib.js';
import { store } from '../store.js';
import { staticMap } from '../map.js';
import { navigate } from '../router.js';
import { profileSvg } from '../fit.js';
import { consommation, libelleGaz } from '../store.js';
import { METEO, ETAT_MER, COURANTS, VISIBILITE_ICONES } from '../config.js';

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

  if (!dives.length) {
    wrap.append(el('div.empty', {},
      el('span.big', { text: '🌊' }),
      'Ton carnet est vide.', el('br'),
      'Appuie sur + pour saisir ta première plongée.',
    ));
    return { title: 'Plongées', node: wrap, identite };
  }

  // Bascule liste / calendrier
  const vueMemoire = 'plongee-journal:vue-dives';
  let vue = localStorage.getItem(vueMemoire) || 'liste';

  const search = el('input', { type: 'search', placeholder: 'Chercher un lieu, un compagnon, une observation…' });
  const zoneRecherche = el('div.field', {}, search);
  const list = el('div');
  const cal = el('div');

  const carteBox = el('div');

  const bascule = el('div.seg', { style: { marginBottom: '12px' } });
  function rendreBascule() {
    bascule.innerHTML = '';
    [['liste', '☰ Liste'], ['calendrier', '▦ Calendrier'], ['carte', '🗺 Carte']].forEach(([id, label]) => {
      const b = el('button', { type: 'button', text: label });
      if (id === vue) b.classList.add('on');
      b.onclick = async () => {
        vue = id;
        localStorage.setItem(vueMemoire, id);
        rendreBascule();
        await afficherVue();
      };
      bascule.append(b);
    });
  }

  async function afficherVue() {
    zoneRecherche.hidden = vue !== 'liste';
    list.hidden = vue !== 'liste';
    cal.hidden = vue !== 'calendrier';
    carteBox.hidden = vue !== 'carte';

    if (vue === 'calendrier' && !cal.childNodes.length) {
      const { calendrier } = await import('./calendar.js');
      cal.append(calendrier(dives, { buddies }));
    }
    if (vue === 'carte' && !carteBox.childNodes.length) {
      const { carteDesPlongees } = await import('./carte.js');
      carteBox.append(carteDesPlongees(dives, { buddies }));
    }
  }

  rendreBascule();
  wrap.append(bascule, zoneRecherche, list, cal, carteBox);

  function matches(d, q) {
    if (!q) return true;
    const hay = [
      d.lieuNom, d.lieuDetail, d.site, d.type, d.fait, d.vu, d.observations,
      d.objectifAutre, ...(d.options || []), ...(d.objectifs || []),
      ...(d.buddyIds || []).map(buddyName), String(d.numero),
    ].join(' ').toLowerCase();
    return hay.includes(q);
  }

  function renderList() {
    const q = search.value.trim().toLowerCase();
    const shown = dives.filter(d => matches(d, q));
    list.innerHTML = '';
    if (!shown.length) { list.append(el('div.empty', { text: 'Aucune plongée ne correspond.' })); return; }

    let currentYear = null;
    shown.forEach(d => {
      const y = (d.date || '').slice(0, 4);
      if (y && y !== currentYear) {
        currentYear = y;
        list.append(el('h2', { text: y, style: {
          fontSize: '12px', letterSpacing: '1.1px', color: 'var(--text-mute)',
          margin: '18px 0 8px 2px', textTransform: 'uppercase' } }));
      }
      list.append(el('div.card.clickable', { onclick: () => navigate(`dive/${d.id}`) },
        el('div.dive-row', {},
          el('div.dive-num', { text: d.numero ?? '—' }),
          el('div.dive-main', {},
            el('div.dive-title', { text: d.lieuNom || d.site || 'Lieu non précisé' }),
            el('div.dive-sub', {},
              fmtDate(d.date),
              d.heureImmersion ? ` · ${d.heureImmersion}` : '',
              '  ', typeBadge(d.type),
            ),
            el('div.dive-metrics', {},
              el('span', {}, el('b', { text: d.profMax ? `${d.profMax} m` : '—' }), ' prof.'),
              el('span', {}, el('b', { text: fmtDuration(d.dureeMin) }), ' fond'),
              d.tempFond != null ? el('span', {}, el('b', { text: `${d.tempFond}°` }), ' eau') : null,
            ),
            (d.buddyIds || []).length
              ? el('div.dive-sub', { style: { marginTop: '6px' },
                  text: '👥 ' + d.buddyIds.map(buddyName).join(', ') })
              : null,
          ),
        ),
      ));
    });
  }

  search.addEventListener('input', renderList);
  renderList();
  await afficherVue();

  return { title: 'Plongées', node: wrap, identite };
}

// ------------------------------------------------------------
//  Fiche détaillée
// ------------------------------------------------------------

export async function diveView({ id }) {
  const d = await store.getDive(id);
  if (!d) return { title: 'Introuvable', node: el('div.empty', { text: 'Plongée introuvable.' }), back: true };

  const buddies = await store.listBuddies();
  const buddyName = bid => fullName(buddies.find(b => b.id === bid)) || '?';
  const wrap = el('div');

  const kv = (k, v) => (v === null || v === undefined || v === '' || v === '—')
    ? null : el('div.kv', {}, el('span.k', { text: k }), el('span.v', {}, v));

  // En-tête
  wrap.append(el('div.card', {},
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' } },
      el('div', {},
        el('div', { style: { fontSize: '19px', fontWeight: '680' },
          text: d.lieuNom || d.site || 'Lieu non précisé' }),
        el('div', { style: { color: 'var(--text-dim)', fontSize: '13.5px', marginTop: '3px' },
          text: fmtDateLong(d.date) }),
        el('div', { style: { marginTop: '8px' } }, typeBadge(d.type)),
      ),
      el('div.dive-num', { text: d.numero ?? '—' }),
    ),
  ));

  // Actions en tête : on ouvre une fiche pour la lire ou la corriger.
  // Les chercher en bas d'une page longue n'avait aucun sens.
  wrap.append(el('div.btn-row.actions-fiche', {},
    el('button.btn.primary', { text: '✎ Modifier', onclick: () => navigate(`dive/${d.id}/edit`) }),
    el('button.btn.danger', {
      text: '🗑 Supprimer',
      onclick: async () => {
        if (await confirmBox(
          `Supprimer la plongée n°${d.numero ?? ''} du ${fmtDate(d.date)} ?`, 'Supprimer')) {
          await store.deleteDive(d.id);
          toast('Plongée supprimée');
          navigate('dives', true);
        }
      },
    }),
  ));

  // Carte
  if (d.lat != null) {
    wrap.append(el('div.section', {},
      staticMap(d.lat, d.lng),
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
  if (d.profil?.length) {
    wrap.append(el('div.section', {},
      el('h2', { text: 'Courbe de profondeur' }),
      el('div.card', {},
        el('div', { html: profileSvg(d.profil) }),
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
