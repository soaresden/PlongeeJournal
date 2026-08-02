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
import { navigate } from '../router.js';

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

    if (!groupes.length) return;

    groupes.forEach(g => {
      const n = g.plongees.length;
      // Un disque dont la taille suit le nombre de plongées : on repère
      // ses spots habituels sans rien lire.
      const taille = Math.min(46, 24 + Math.log2(n) * 8);

      const marqueur = L.marker([g.lat, g.lng], {
        icon: L.divIcon({
          className: 'carte-pin',
          html: `<div class="carte-pin-bulle" style="width:${taille}px;height:${taille}px">${n}</div>`,
          iconSize: [taille, taille],
          iconAnchor: [taille / 2, taille / 2],
        }),
        title: `${g.nom} — ${n} plongée${n > 1 ? 's' : ''}`,
      });

      marqueur.on('click', () => afficherLieu(g));
      couche.addLayer(marqueur);
    });

    const bornes = L.latLngBounds(groupes.map(g => [g.lat, g.lng]));
    carte.fitBounds(bornes, { padding: [36, 36], maxZoom: 12 });
  }

  function afficherLieu(g) {
    detail.innerHTML = '';
    const triees = g.plongees.slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    detail.append(el('div.card', {},
      el('div', { style: { fontWeight: '650', fontSize: '16px' }, text: g.nom }),
      el('div.hint', { style: { marginTop: '2px' },
        text: `${g.plongees.length} plongée(s) · ${g.lat.toFixed(4)}, ${g.lng.toFixed(4)}` }),
      ...triees.map(d => el('div.jour-ligne', { onclick: () => navigate(`dive/${d.id}`) },
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
    const sat = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19 });
    plan.addTo(carte);
    L.control.layers({ Plan: plan, Satellite: sat }, {}, { position: 'topright' }).addTo(carte);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(carte);

    setTimeout(() => { carte.invalidateSize(); dessiner(); }, 80);
  });

  dessiner();
  return wrap;
}
