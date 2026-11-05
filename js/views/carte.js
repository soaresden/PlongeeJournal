// ============================================================
//  Carte des plongées
//
//  Tous les points du carnet sur une seule carte. Les plongées
//  faites au même endroit sont regroupées en un seul repère —
//  sinon vingt marqueurs se superposent et on ne clique rien.
//
//  Le filtre par compagnon s'applique ici aussi : « où ai-je
//  plongé avec Untel ? » est une question qu'on se pose.
// ============================================================

import { el, fmtDate, fmtDuration, fullName } from '../lib.js';
import { zoomPourLargeurKm } from '../map.js';
import { navigate } from '../router.js';
import { apercuPlongee } from '../apercu.js';

/** Regroupe les plongées par lieu, à ~200 m près. */
function grouperParLieu(dives) {
  const groupes = new Map();

  dives.filter(d => d.lat != null && d.lng != null).forEach(d => {
    const cle = `${d.lat.toFixed(3)},${d.lng.toFixed(3)}`;
    if (!groupes.has(cle)) {
      groupes.set(cle, { lat: d.lat, lng: d.lng, nom: d.lieuNom || 'Sans nom', plongees: [] });
    }
    groupes.get(cle).plongees.push(d);
  });

  return [...groupes.values()].sort((a, b) => b.plongees.length - a.plongees.length);
}

/**
 * Les lieux trop proches À L'ÉCRAN, au zoom courant, se cumulent en un
 * seul repère : dézoomé, la Martinique est une bulle « 12 » ; zoomé, on
 * retrouve chaque spot. `projeter` donne la position en pixels d'un lieu.
 * @returns {{lat:number, lng:number, lieux:object[], n:number}[]}
 */
export function cumulerALEcran(groupes, projeter, rayonPx = 46) {
  const amas = [];
  // Les lieux les plus fréquentés d'abord : ils donnent le centre de l'amas.
  for (const g of groupes) {
    const p = projeter(g);
    const proche = amas.find(a => Math.hypot(a.x - p.x, a.y - p.y) < rayonPx);
    if (proche) {
      proche.lieux.push(g);
      proche.n += g.plongees.length;
    } else {
      amas.push({ x: p.x, y: p.y, lat: g.lat, lng: g.lng, lieux: [g], n: g.plongees.length });
    }
  }
  return amas;
}

export function carteDesPlongees(dives, { buddies = [] } = {}) {
  const wrap = el('div');
  const nomCompagnon = id => fullName(buddies.find(b => b.id === id)) || '?';

  const filtre = el('div');
  const boite = el('div.carte-plein');
  const infos = el('div.hint');
  const detail = el('div');

  const compagnonsFiltre = new Set();

  const retenues = () => (compagnonsFiltre.size
    ? dives.filter(d => (d.buddyIds || []).some(id => compagnonsFiltre.has(id)))
    : dives);

  let carte = null;
  let couche = null;

  function dessiner() {
    const groupes = grouperParLieu(retenues());
    const sansPoint = retenues().length - groupes.reduce((s, g) => s + g.plongees.length, 0);

    infos.innerHTML = '';
    infos.append(el('div', {
      text: groupes.length
        ? `${groupes.length} lieu${groupes.length > 1 ? 'x' : ''} · `
          + `${groupes.reduce((s, g) => s + g.plongees.length, 0)} plongée(s)`
        : 'Aucune plongée géolocalisée.',
    }));
    if (sansPoint > 0) {
      infos.append(el('div', { style: { color: 'var(--text-mute)' },
        text: `${sansPoint} plongée(s) sans point sur la carte.` }));
    }

    if (!carte || typeof L === 'undefined') return;

    if (couche) couche.remove();
    couche = L.layerGroup().addTo(carte);
    groupesAffiches = groupes;

    if (!groupes.length) return;
    placerReperes();

    // Un seul lieu : fitBounds collerait au maximum de zoom et on ne
    // verrait qu'une tache d'eau. On cadre alors sur ~15 km.
    if (groupes.length === 1) {
      const g = groupes[0];
      carte.setView([g.lat, g.lng], zoomPourLargeurKm(15, g.lat, boite.clientWidth));
    } else {
      const bornes = L.latLngBounds(groupes.map(g => [g.lat, g.lng]));
      carte.fitBounds(bornes, { padding: [36, 36], maxZoom: 12 });
    }
  }

  let groupesAffiches = [];

  /** Les repères du zoom courant : un lieu seul, ou plusieurs cumulés. */
  function placerReperes() {
    if (!carte || !couche) return;
    couche.clearLayers();
    const z = carte.getZoom();
    const amas = cumulerALEcran(groupesAffiches, g => carte.project([g.lat, g.lng], z));
    amas.forEach(a => {
      const seul = a.lieux.length === 1;
      // Un disque dont la taille suit le nombre de plongées : on repère
      // ses spots habituels sans rien lire.
      const taille = Math.min(seul ? 46 : 58, (seul ? 24 : 30) + Math.log2(a.n) * 8);
      const nomLieux = seul ? a.lieux[0].nom : `${a.lieux.length} lieux`;
      const marqueur = L.marker([a.lat, a.lng], {
        icon: L.divIcon({
          className: 'carte-pin',
          html: `<div class="carte-pin-bulle${seul ? '' : ' amas'}" style="width:${taille}px;height:${taille}px">${a.n}</div>`,
          iconSize: [taille, taille],
          iconAnchor: [taille / 2, taille / 2],
        }),
        title: `${nomLieux} — ${a.n} plongée${a.n > 1 ? 's' : ''}`,
      });
      marqueur.on('click', () => {
        if (seul) return afficherLieu(a.lieux[0]);
        // Plusieurs lieux : on zoome dessus. S'ils sont trop serrés pour
        // se séparer, on montre leurs plongées ensemble.
        const bornes = L.latLngBounds(a.lieux.map(g => [g.lat, g.lng]));
        const zCible = Math.min(carte.getBoundsZoom(bornes.pad(0.3)), carte.getMaxZoom());
        if (zCible > carte.getZoom()) carte.flyToBounds(bornes.pad(0.3), { duration: 0.6 });
        else afficherLieu({ nom: a.lieux.map(g => g.nom).filter((v, i, t) => t.indexOf(v) === i).join(' · '),
          lat: a.lat, lng: a.lng, plongees: a.lieux.flatMap(g => g.plongees) });
      });
      couche.addLayer(marqueur);
    });
  }

  function afficherLieu(g) {
    detail.innerHTML = '';
    const triees = g.plongees.slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    detail.append(el('div.card', {},
      el('div', { style: { fontWeight: '650', fontSize: '16px' }, text: g.nom }),
      el('div.hint', { style: { marginTop: '2px' },
        text: `${g.plongees.length} plongée(s) · ${g.lat.toFixed(4)}, ${g.lng.toFixed(4)}` }),
      ...triees.map(d => el('div.jour-ligne', { onclick: () => apercuPlongee(d.id) },
        el('div.dive-num', { style: { width: '38px', height: '38px', flex: '0 0 38px',
          fontSize: '13px' }, text: d.numero ?? '—' }),
        el('div', { style: { flex: 1, minWidth: 0 } },
          el('div', { style: { fontWeight: '600', fontSize: '14.5px' }, text: fmtDate(d.date) }),
          el('div', { style: { color: 'var(--text-dim)', fontSize: '12.5px' },
            text: [d.profMax ? `${d.profMax} m` : null,
                   d.dureeMin ? fmtDuration(d.dureeMin) : null,
                   (d.buddyIds || []).length ? d.buddyIds.map(nomCompagnon).join(', ') : null]
              .filter(Boolean).join(' · ') })),
        el('span', { style: { color: 'var(--text-mute)' }, text: '›' }),
      )),
      el('div.btn-row', {},
        el('a.btn.sm.ghost', { href: `https://www.google.com/maps?q=${g.lat},${g.lng}`,
          target: '_blank', rel: 'noopener' }, 'Ouvrir dans Maps')),
    ));
  }

  // ---------- filtre par compagnon ----------
  function rendreFiltre() {
    filtre.innerHTML = '';
    const compte = new Map();
    dives.forEach(d => (d.buddyIds || []).forEach(id =>
      compte.set(id, (compte.get(id) || 0) + 1)));
    if (!compte.size) return;

    const chips = el('div.chips', { hidden: !compagnonsFiltre.size });
    [...compte.entries()].sort((a, b) => b[1] - a[1]).forEach(([id, n]) => {
      const c = el('button.chip', { type: 'button', text: `${nomCompagnon(id)} · ${n}` });
      if (compagnonsFiltre.has(id)) c.classList.add('on');
      c.onclick = () => {
        compagnonsFiltre.has(id) ? compagnonsFiltre.delete(id) : compagnonsFiltre.add(id);
        c.classList.toggle('on', compagnonsFiltre.has(id));
        majEntete();
        detail.innerHTML = '';
        dessiner();
      };
      chips.append(c);
    });

    const entete = el('button.filtre-entete', { type: 'button' });
    const majEntete = () => {
      entete.innerHTML = '';
      entete.append(
        el('span', { text: '👥' }),
        el('span', { style: { flex: 1, textAlign: 'left' },
          text: compagnonsFiltre.size
            ? `Avec ${[...compagnonsFiltre].map(nomCompagnon).join(', ')}`
            : 'Filtrer par compagnon' }),
        compagnonsFiltre.size
          ? el('span.chip.sm', { text: 'tout voir',
              onclick: e => {
                e.stopPropagation();
                compagnonsFiltre.clear();
                rendreFiltre(); detail.innerHTML = ''; dessiner();
              } })
          : el('span.sec-fleche', { text: chips.hidden ? '▸' : '▾' }),
      );
    };
    entete.onclick = () => { chips.hidden = !chips.hidden; majEntete(); };
    majEntete();

    filtre.append(el('div.card.filtre-card', {}, entete, chips));
  }

  rendreFiltre();
  wrap.append(filtre, boite, infos, detail);

  requestAnimationFrame(() => {
    if (typeof L === 'undefined') {
      boite.textContent = 'Carte indisponible.';
      return;
    }
    carte = L.map(boite, { zoomControl: true, attributionControl: false, gestureHandling: true })
             .setView([46.6, 2.4], 5);

    const plan = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 });
    // Satellite seul : de l'eau bleue sans nom. On pose les étiquettes dessus.
    const sat = L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19 }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 19 }),
    ]);
    plan.addTo(carte);
    L.control.layers({ Plan: plan, Satellite: sat }, {}, { position: 'topright' }).addTo(carte);
    carte.on('zoomend', placerReperes);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(carte);

    setTimeout(() => { carte.invalidateSize(); dessiner(); }, 80);
  });

  dessiner();
  return wrap;
}
