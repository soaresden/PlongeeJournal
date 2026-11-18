// ============================================================
//  Les plongées en tableau, façon tableur : des chips pour filtrer
//  (année, pays, type, niveau, gaz, eau, vidéos), des colonnes à
//  trier, des totaux, et des vues filtrées qu'on enregistre.
// ============================================================

import { el, fmtDate, fmtDuration, openModal } from '../lib.js';
import { store } from '../store.js';

const CLE = 'plongee-journal:tableau';
const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || 'null') || {}; } catch { return {}; } };
const garder = v => { try { localStorage.setItem(CLE, JSON.stringify(v)); } catch { /* privé */ } };

const typeCourt = t => {
  const s = String(t || '').toLowerCase();
  return s.includes('enseign') ? '🎓 Enseignement' : s.includes('nuit') ? '🌙 Explo de nuit' : s.includes('explo') ? '☀️ Explo de jour' : t ? t : '—';
};

/**
 * @param {object[]} dives
 * @param {{pays:(d)=>string|null, drapeau:(c)=>string, nomPays:(c)=>string, buddyName:(id)=>string,
 *          aDesVideos:(d)=>boolean, ouvrir:(d)=>void, chercher:()=>string}} o
 */
export function tableauPlongees(dives, o) {
  const etat = { filtres: {}, tri: { col: 'date', sens: -1 }, ...lire() };
  const lignes = dives.map(d => {
    const pays = o.pays(d);
    return { d, annee: (d.date || '').slice(0, 4), pays, type: typeCourt(d.type), niveau: d.niveau || '',
      gaz: d.gazType === 'nitrox' ? `Nitrox${d.gazO2 ? ` ${d.gazO2}` : ''}` : d.gazType === 'trimix' ? 'Trimix' : 'Air',
      gazGroupe: d.gazType === 'nitrox' ? 'Nitrox' : d.gazType === 'trimix' ? 'Trimix' : 'Air',
      eau: d.eau === 'douce' ? 'Douce' : d.eau === 'salee' ? 'Salée' : d.eau === 'piscine' ? 'Piscine' : '',
      video: o.aDesVideos(d) ? 'Avec vidéos' : 'Sans vidéo',
      palanquee: (d.buddyIds || []).map(o.buddyName).filter(Boolean).join(', ') };
  });

  // Les groupes de chips : chaque valeur présente dans le carnet, avec son nombre.
  const GROUPES = [
    { id: 'annee', titre: 'Année', val: l => l.annee, ordre: (a, b) => b.localeCompare(a) },
    { id: 'pays', titre: 'Pays', val: l => l.pays || '', libelle: c => (c ? `${o.drapeau(c)} ${o.nomPays(c)}` : '📍 ?') },
    { id: 'type', titre: 'Type', val: l => l.type, raccourcis: [{ texte: '🤿 Explo (jour + nuit)', valeurs: ['☀️ Explo de jour', '🌙 Explo de nuit'] }] },
    { id: 'niveau', titre: 'Niveau', val: l => l.niveau, libelle: v => v || 'sans' },
    { id: 'gaz', titre: 'Gaz', val: l => l.gazGroupe },
    { id: 'eau', titre: 'Eau', val: l => l.eau, libelle: v => (v === 'Douce' ? '💧 Douce' : v === 'Salée' ? '🌊 Salée' : v === 'Piscine' ? '🏊 Piscine' : '?') },
    { id: 'video', titre: 'Vidéos', val: l => l.video, libelle: v => (v === 'Avec vidéos' ? '🎬 Avec' : '🚫 Sans') },
  ];
  const COLONNES = [
    { id: 'numero', titre: 'N°', val: l => Number(l.d.numero) || 0, txt: l => l.d.numero ?? '—', cls: 'num' },
    { id: 'date', titre: 'Date', val: l => `${l.d.date || ''} ${l.d.heureImmersion || ''}`, txt: l => fmtDate(l.d.date) },
    { id: 'heure', titre: 'Heure', val: l => l.d.heureImmersion || '', txt: l => l.d.heureImmersion || '' },
    { id: 'lieu', titre: 'Lieu', val: l => (l.d.lieuNom || l.d.site || '').toLowerCase(), txt: l => l.d.lieuNom || l.d.site || '—', cls: 'lieu' },
    { id: 'pays', titre: 'Pays', val: l => (l.pays ? o.nomPays(l.pays) : 'zz'), txt: l => (l.pays ? o.drapeau(l.pays) : ''), titreCase: l => (l.pays ? o.nomPays(l.pays) : '') },
    { id: 'type', titre: 'Type', val: l => l.type, txt: l => l.type },
    { id: 'niveau', titre: 'Niveau', val: l => l.niveau || 'zz', txt: l => l.niveau },
    { id: 'prof', titre: 'Prof.', val: l => Number(l.d.profMax) || 0, txt: l => (l.d.profMax ? `${l.d.profMax} m` : '—'), cls: 'num' },
    { id: 'duree', titre: 'Durée', val: l => Number(l.d.dureeMin) || 0, txt: l => fmtDuration(l.d.dureeMin), cls: 'num' },
    { id: 'gaz', titre: 'Gaz', val: l => l.gaz, txt: l => l.gaz },
    { id: 'temp', titre: 'Eau', val: l => (l.d.tempFond == null ? 99 : Number(l.d.tempFond)), txt: l => (l.d.tempFond != null ? `${l.d.tempFond}°` : ''), cls: 'num' },
    { id: 'palanquee', titre: 'Palanquée', val: l => l.palanquee.toLowerCase(), txt: l => l.palanquee, cls: 'pal' },
    { id: 'video', titre: '🎬', val: l => l.video, txt: l => (l.video === 'Avec vidéos' ? '🎬' : ''), cls: 'num' },
  ];

  const zone = el('div.tableau-plongees');
  let vues = [];
  store.getSettings().then(r => { vues = r.vuesTableau || []; rendre(); }).catch(() => {});

  const garde = l => GROUPES.every(g => {
    const f = etat.filtres[g.id];
    return !f?.length || f.includes(g.val(l));
  });
  const cherche = l => {
    const q = (o.chercher() || '').trim().toLowerCase();
    if (!q) return true;
    return [l.d.lieuNom, l.d.site, l.d.lieuDetail, l.d.observations, l.d.notes, l.palanquee, l.type, l.niveau, l.gaz, String(l.d.numero ?? '')]
      .join(' ').toLowerCase().includes(q);
  };
  const changer = () => { garder({ filtres: etat.filtres, tri: etat.tri }); rendre(); };

  const demanderNom = () => new Promise(ok => openModal(close => {
    const champ = el('input', { type: 'text', placeholder: 'ex. Maldives nitrox' });
    const valider = () => { close(); ok(champ.value.trim()); };
    champ.addEventListener('keydown', e => { if (e.key === 'Enter') valider(); });
    setTimeout(() => champ.focus(), 50);
    return el('div', {}, el('h3', { text: '💾 Nom de la vue' }), el('div.field', {}, champ),
      el('div.btn-row', {}, el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: () => { close(); ok(''); } }),
        el('button.btn.primary', { type: 'button', text: 'Enregistrer', onclick: valider })));
  }));
  const enregistrerVue = async () => {
    const nom = await demanderNom();
    if (!nom) return;
    vues = [...vues.filter(v => v.nom !== nom), { nom, filtres: etat.filtres, tri: etat.tri }];
    await store.saveSettings({ vuesTableau: vues });
    rendre();
  };
  const oublierVue = async nom => {
    vues = vues.filter(v => v.nom !== nom);
    await store.saveSettings({ vuesTableau: vues });
    rendre();
  };

  let ouvert = null;     // le groupe dont la liste est ouverte
  const fermer = e => { if (ouvert && !e.target.closest('.tp-deroulant')) { ouvert = null; rendre(); } };
  document.addEventListener('pointerdown', fermer);
  const appliquerVue = v => { etat.filtres = { ...v.filtres }; etat.tri = { ...(v.tri || etat.tri) }; ouvert = null; changer(); };
  function rendre() {
    if (!zone.isConnected && zone.dejaRendu) { document.removeEventListener('pointerdown', fermer); return; }
    zone.dejaRendu = true;
    const avantFiltre = lignes.filter(cherche);
    const vis = avantFiltre.filter(garde);
    const c = COLONNES.find(x => x.id === etat.tri.col) || COLONNES[1];
    vis.sort((a, b) => { const x = c.val(a), y = c.val(b); return (x < y ? -1 : x > y ? 1 : 0) * etat.tri.sens; });
    const actifs = GROUPES.filter(g => etat.filtres[g.id]?.length).length;
    const nom = (g, v) => (g.libelle ? g.libelle(v) : v) || '—';
    const basculer = (g, v) => {
      const s = new Set(etat.filtres[g.id] || []);
      s.has(v) ? s.delete(v) : s.add(v);
      etat.filtres = { ...etat.filtres, [g.id]: [...s] };
      changer();
    };

    // Un bouton par groupe ; il ouvre sa liste de chips (avec le nombre de
    // plongées de chaque valeur, les AUTRES filtres appliqués).
    const deroulant = g => {
      const autres = avantFiltre.filter(l => GROUPES.every(h => h === g || !etat.filtres[h.id]?.length || etat.filtres[h.id].includes(h.val(l))));
      const n = new Map();
      lignes.forEach(l => n.set(g.val(l), 0));
      autres.forEach(l => n.set(g.val(l), (n.get(g.val(l)) || 0) + 1));
      const valeurs = [...n.keys()].sort(g.ordre || ((a, b) => (n.get(b) - n.get(a)) || String(a).localeCompare(String(b))));
      const choisis = etat.filtres[g.id] || [];
      if (valeurs.length < 2 && !choisis.length) return null;
      const estOuvert = ouvert === g.id;
      return el(`div.tp-deroulant${estOuvert ? '.ouvert' : ''}`, {},
        el(`button.chip${choisis.length ? '.solid' : ''}`, { type: 'button', onclick: () => { ouvert = estOuvert ? null : g.id; rendre(); } },
          g.titre, choisis.length ? el('small', { text: ` ${choisis.length}` }) : null, ' ▾'),
        estOuvert ? el('div.tp-liste', {},
          ...(g.raccourcis || []).map(r => {
            const tous = r.valeurs.every(v => choisis.includes(v));
            return el(`button.chip.tp-raccourci${tous ? '.solid' : ''}`, { type: 'button', text: r.texte, onclick: () => {
              const s = new Set(choisis);
              r.valeurs.forEach(v => (tous ? s.delete(v) : s.add(v)));
              etat.filtres = { ...etat.filtres, [g.id]: [...s] };
              changer();
            } });
          }),
          ...valeurs.map(v => el(`button.chip${choisis.includes(v) ? '.solid' : ''}${n.get(v) ? '' : '.tp-vide'}`, { type: 'button', onclick: () => basculer(g, v) },
            nom(g, v), el('small', { text: ` ${n.get(v)}` }))),
          choisis.length ? el('button.lien-texte.tp-aucun', { type: 'button', text: 'Effacer', onclick: () => { etat.filtres = { ...etat.filtres, [g.id]: [] }; changer(); } }) : null) : null);
    };
    const deroulantVues = () => {
      if (!vues.length && !actifs) return null;
      const estOuvert = ouvert === 'vues';
      return el(`div.tp-deroulant${estOuvert ? '.ouvert' : ''}`, {},
        el('button.chip', { type: 'button', onclick: () => { ouvert = estOuvert ? null : 'vues'; rendre(); } }, `⭐ Mes vues${vues.length ? ` ${vues.length}` : ''} ▾`),
        estOuvert ? el('div.tp-liste', {},
          ...vues.map(v => el('span.chip.tp-vue', {},
            el('button.lien-texte', { type: 'button', text: v.nom, onclick: () => appliquerVue(v) }),
            el('button.x', { type: 'button', text: '×', title: 'Oublier cette vue', onclick: () => oublierVue(v.nom) }))),
          actifs ? el('button.chip', { type: 'button', text: '💾 Enregistrer les filtres', onclick: () => { ouvert = null; enregistrerVue(); } }) : null,
          !vues.length && !actifs ? el('span.hint', { text: 'Choisis des filtres, puis enregistre-les ici.' }) : null) : null);
    };

    const prof = Math.max(0, ...vis.map(l => Number(l.d.profMax) || 0));
    const minutes = vis.reduce((t, l) => t + (Number(l.d.dureeMin) || 0), 0);
    const moy = vis.length ? vis.reduce((t, l) => t + (Number(l.d.profMax) || 0), 0) / vis.length : 0;

    zone.replaceChildren(...[
      el('div.tp-filtres', {},
        el('div.tp-boutons', {}, ...GROUPES.map(deroulant).filter(Boolean), deroulantVues()),
        actifs ? el('div.tp-actifs', {},
          ...GROUPES.flatMap(g => (etat.filtres[g.id] || []).map(v => el('span.chip.solid.tp-vue', {},
            el('span', { text: nom(g, v) }),
            el('button.x', { type: 'button', text: '×', title: 'Retirer ce filtre', onclick: () => basculer(g, v) })))),
          el('button.lien-texte.tp-aucun', { type: 'button', text: 'Tout effacer', onclick: () => { etat.filtres = {}; changer(); } })) : null),
      el('div.tp-resume', { text: `${vis.length} plongée${vis.length > 1 ? 's' : ''}${vis.length !== lignes.length ? ` sur ${lignes.length}` : ''}`
        + (vis.length ? ` · ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} sous l’eau · max ${prof} m · moy. ${moy.toFixed(1).replace('.', ',')} m` : '') }),
      vis.length ? el('div.va-table.tp-table', {}, el('table', {},
        el('thead', {}, el('tr', {}, ...COLONNES.map(col => el(`th.${col.cls || 'txt'}${etat.tri.col === col.id ? '.trie' : ''}`, {
          onclick: () => { etat.tri = { col: col.id, sens: etat.tri.col === col.id ? -etat.tri.sens : (col.id === 'date' || col.id === 'prof' || col.id === 'duree' || col.id === 'numero' ? -1 : 1) }; changer(); },
          text: col.titre + (etat.tri.col === col.id ? (etat.tri.sens > 0 ? ' ▲' : ' ▼') : '') })))),
        el('tbody', {}, ...vis.map(l => el('tr.clickable', { onclick: () => o.ouvrir(l.d) },
          ...COLONNES.map(col => el(`td.${col.cls || 'txt'}`, { text: col.txt(l), title: col.titreCase ? col.titreCase(l) : undefined })))))))
        : el('div.empty', { text: 'Aucune plongée avec ces filtres.' })].filter(Boolean));
  }
  rendre();
  zone.rafraichir = rendre;
  return zone;
}
