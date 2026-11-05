// ============================================================
//  Calendrier des plongées
//
//  Une grille par année : les mois d'un côté, les jours de l'autre, un
//  carré par jour qui se colore quand on a plongé.
//
//  L'ORIENTATION N'EST PAS FIXE. Un bloc 12 × 31 est trois fois plus haut
//  que large ; transposé, il est trois fois plus large que haut. Aucune des
//  deux formes ne convient à tous les écrans : sur un téléphone en portrait
//  c'est la transposée qui gagne, mais dès que les filtres passent en
//  colonne à droite, la grille reçoit toute la hauteur et c'est l'inverse.
//  On calcule donc le carré qu'on obtiendrait dans chaque sens et on garde
//  le plus grand. Les carrés sont toujours aussi gros que possible, et
//  aucun des deux axes ne déborde : jamais de scroll.
//
//  Quatre échelles :
//   • Tout     — toutes les années du carnet, empilées.
//   • Année    — une année, sélectionnable.
//   • Mois     — le mois en grand, avec les numéros.
//   • Période  — de telle date (ou tel numéro) à telle autre.
// ============================================================

import { el, fmtDate, fmtDuration, fmtDateLong, fullName, scrollTo } from '../lib.js';
import { navigate } from '../router.js';
import { TYPES_SEANCE, typeSeance } from '../model.js';

// Ce que le calendrier montre : les plongées, et chaque type de séance,
// au choix (cases à cocher). Retenu sur l'appareil.
const CLE_COUCHES = 'plongee-journal:cal-couches';
function lireCouches() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_COUCHES) || 'null');
    if (Array.isArray(v)) return new Set(v);
  } catch { /* stockage indisponible */ }
  return new Set(['plongees']);
}
function garderCouches(c) {
  try { localStorage.setItem(CLE_COUCHES, JSON.stringify([...c])); } catch { /* plein ou privé */ }
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
              'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURT = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun',
                    'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const pad = n => String(n).padStart(2, '0');
const cle = (a, m, j) => `${a}-${pad(m + 1)}-${pad(j)}`;
const iso = d => cle(d.getFullYear(), d.getMonth(), d.getDate());

/** 0 à 4 : plus il y a de plongées ce jour-là, plus le carré est chaud. */
const chaleur = n => (n ? Math.min(4, n) : 0);

// Géométrie de la grille, en pixels. La gouttière porte les noms de mois
// (sens vertical) ou les mois en ligne (sens horizontal) ; la règle porte
// les numéros de jours.
export const GEO = { gouttiere: 30, regle: 11, gap: 2, minCote: 4 };

/**
 * Le plus grand carré possible dans un sens donné.
 *  - 'v' : 12 colonnes (les mois) × 31 lignes (les jours)
 *  - 'h' : 31 colonnes (les jours) × 12 lignes (les mois)
 */
export function coteDansLeSens(sens, largeur, hauteur, geo = GEO) {
  const [cols, lignes] = sens === 'v' ? [12, 31] : [31, 12];
  const parLaLargeur = (largeur - geo.gouttiere - cols * geo.gap) / cols;
  const parLaHauteur = (hauteur - geo.regle - lignes * geo.gap) / lignes;
  return Math.max(geo.minCote, Math.floor(Math.min(parLaLargeur, parLaHauteur)));
}

/**
 * Le sens qui donne les plus gros carrés. À égalité on prend l'horizontal :
 * les noms de mois y tiennent en toutes lettres.
 */
export function meilleurSens(largeur, hauteur, geo = GEO) {
  const h = coteDansLeSens('h', largeur, hauteur, geo);
  const v = coteDansLeSens('v', largeur, hauteur, geo);
  return { sens: v > h ? 'v' : 'h', cote: Math.max(h, v) };
}

// ============================================================

export function calendrier(dives, { buddies = [], seances = [] } = {}) {
  const wrap = el('div');

  const datee = x => /^\d{4}-\d\d-\d\d/.test(x.date || '');
  const avecDate = dives.filter(datee);
  const seancesDatees = seances.filter(datee);
  if (!avecDate.length && !seancesDatees.length) {
    wrap.append(el('div.empty', { text: 'Aucune plongée datée.' }));
    return wrap;
  }

  const nomCompagnon = id => fullName(buddies.find(b => b.id === id)) || '?';
  const couches = lireCouches();
  const voitPlongees = () => couches.has('plongees');

  // Les années couvrent plongées ET séances ; le mois affiché et la
  // période par défaut suivent les plongées (le carnet), s'il y en a.
  const toutes = [...avecDate, ...seancesDatees].map(d => d.date.slice(0, 10)).sort();
  const dates = avecDate.length ? avecDate.map(d => d.date.slice(0, 10)).sort() : toutes;
  const premier = dates[0];
  const dernier = dates[dates.length - 1];
  const anneeMin = Number(toutes[0].slice(0, 4));
  const anneeMax = Number(toutes[toutes.length - 1].slice(0, 4));

  let mode = localStorage.getItem('plongee-journal:cal-mode') || 'tout';
  let mois = Number(dernier.slice(5, 7)) - 1;
  let annee = anneeMax;
  let debut = premier;
  let fin = dernier;
  const compagnonsFiltre = new Set();

  const echelles = el('div.cal-tete');        // Tout / Année / Mois / Période
  const barre = el('div.cal-barre');          // commandes propres à l'échelle
  const zoneCouches = el('div.cal-zone-couches');   // plongées / fosse / piscine / apnée
  const filtre = el('div.cal-filtre');
  const scene = el('div');
  const detail = el('div.cal-detail');

  /** Plongées après application du filtre par compagnon (et de la case « Plongées »). */
  const retenues = () => (!voitPlongees() ? []
    : compagnonsFiltre.size
      ? avecDate.filter(d => (d.buddyIds || []).some(id => compagnonsFiltre.has(id)))
      : avecDate);

  /** Séances des types cochés. */
  const seancesVues = () => seancesDatees.filter(s => couches.has(s.type));

  const VIDE = { p: [], s: [] };

  /** jour → { p: plongées, s: séances } */
  function parJour(liste) {
    const m = new Map();
    const case_ = k => { if (!m.has(k)) m.set(k, { p: [], s: [] }); return m.get(k); };
    liste.forEach(d => case_(d.date.slice(0, 10)).p.push(d));
    seancesVues().forEach(s => case_(s.date.slice(0, 10)).s.push(s));
    return m;
  }

  /** « 2 plongées, 1 fosse » */
  function libelleJour(jour) {
    const parts = [];
    if (jour.p.length) parts.push(`${jour.p.length} plongée${jour.p.length > 1 ? 's' : ''}`);
    for (const t of TYPES_SEANCE) {
      const n = jour.s.filter(s => s.type === t.id).length;
      if (n) parts.push(n > 1 ? `${n} ${t.pluriel}` : `1 ${t.label.toLowerCase()}`);
    }
    return parts.join(', ');
  }

  // ---------- un carré ----------
  function carre(dateStr, jour = VIDE, extra = '', { toujours = false } = {}) {
    const n = jour.p.length;
    const types = [...new Set(jour.s.map(s => s.type))];
    // Une plongée garde sa couleur de chaleur ; un jour de séance seule
    // prend la couleur de la séance ; les deux : un coin de couleur.
    let classe = `j n${chaleur(n)}${extra}`;
    if (!n && types.length) classe += ` s-${types[0]}`;
    else if (n && types.length) classe += ` avec-s pt-${types[0]}`;
    const c = el('button', {
      type: 'button',
      class: classe,
      title: n || types.length ? `${fmtDate(dateStr)} — ${libelleJour(jour)}` : fmtDate(dateStr),
    });
    if (dateStr === iso(new Date())) c.classList.add('auj');
    if (n || types.length || toujours) c.onclick = () => afficherJour(dateStr, jour);
    else c.disabled = true;
    return c;
  }

  function afficherJour(date, jour) {
    const duJour = jour.p;
    detail.innerHTML = '';
    detail.append(el('div.card', {},
      el('div.lbl', { text: fmtDateLong(date) }),
      ...jour.s.map(s => el('div.jour-ligne', { onclick: () => navigate(`seance/${s.id}`) },
        el('span.seance-pastille', { class: `s-${s.type}`, style: { width: '38px', height: '38px', flex: '0 0 38px', fontSize: '18px' }, text: typeSeance(s.type).icone }),
        el('div', { style: { flex: 1, minWidth: 0 } },
          el('div', { style: { fontWeight: '600', fontSize: '14.5px' }, text: `${typeSeance(s.type).label}${s.lieu ? ` · ${s.lieu}` : ''}` }),
          el('div', { style: { color: 'var(--text-dim)', fontSize: '12.5px' },
            text: [s.heure, s.dureeMin ? fmtDuration(s.dureeMin) : null, s.profMax ? `${s.profMax} m` : null,
                   s.distanceM ? `${s.distanceM} m nagés` : null].filter(Boolean).join(' · ') })),
        el('span', { style: { color: 'var(--text-mute)' }, text: '›' }))),
      !duJour.length && !jour.s.length ? el('div.hint', { text: 'Rien ce jour-là.' }) : null,
      ...duJour.map(d => el('div.jour-ligne', { onclick: () => navigate(`dive/${d.id}`) },
        el('div.dive-num', { style: { width: '38px', height: '38px', flex: '0 0 38px',
          fontSize: '13px' }, text: d.numero ?? '—' }),
        el('div', { style: { flex: 1, minWidth: 0 } },
          el('div', { style: { fontWeight: '600', fontSize: '14.5px' },
            text: d.lieuNom || 'Lieu non précisé' }),
          el('div', { style: { color: 'var(--text-dim)', fontSize: '12.5px' },
            text: [d.heureImmersion, d.profMax ? `${d.profMax} m` : null,
                   d.dureeMin ? fmtDuration(d.dureeMin) : null,
                   (d.buddyIds || []).length ? d.buddyIds.map(nomCompagnon).join(', ') : null]
              .filter(Boolean).join(' · ') })),
        el('span', { style: { color: 'var(--text-mute)' }, text: '›' }),
      )),
      // Pointer une séance ce jour-là (la fosse du jeudi oubliée…).
      el('div.chips', { style: { marginTop: '10px' } },
        ...TYPES_SEANCE.map(t => el('button.chip', { type: 'button', text: `＋ ${t.icone} ${t.label}`,
          onclick: () => navigate(`seance/new?type=${t.id}&date=${date}`) }))),
    ));
    scrollTo(detail, { behavior: 'smooth', block: 'nearest' });
  }

  // ============================================================
  //  La grille d'une année : 12 colonnes × 31 lignes
  // ============================================================

  /** Une case : soit un jour réel, soit un trou (31 février). */
  function caseDe(an, m, j, jours, borne) {
    if (j > new Date(an, m + 1, 0).getDate()) return el('div.j.vide');

    const k = cle(an, m, j);
    const horsBorne = borne && (k < borne.debut || k > borne.fin);
    const duJour = horsBorne ? VIDE : (jours.get(k) || VIDE);

    const jourSemaine = new Date(an, m, j).getDay();     // 0 = dimanche
    let extra = '';
    if (jourSemaine === 0 || jourSemaine === 6) extra += ' we';
    if (horsBorne) extra += ' hors';

    const c = carre(k, duJour, extra);
    if (horsBorne) c.disabled = true;
    return c;
  }

  const etiquetteJour = j => (j === 1 || j % 5 === 0 || j === 31) ? String(j) : '';

  function grilleAnnee(an, { jours, borne = null }) {
    const g = el('div.an12', { class: `sens-${sens}` });

    if (sens === 'h') {
      // Les jours en règle horizontale, les mois en gouttière verticale.
      g.append(el('div.an12-coin'));
      for (let j = 1; j <= 31; j++) g.append(el('div.an12-num', { text: etiquetteJour(j) }));

      for (let m = 0; m < 12; m++) {
        g.append(el('div.an12-mois', { title: MOIS[m], text: MOIS_COURT[m] }));
        for (let j = 1; j <= 31; j++) g.append(caseDe(an, m, j, jours, borne));
      }
    } else {
      // Les mois en règle horizontale, les jours en gouttière verticale.
      g.append(el('div.an12-coin'));
      for (let m = 0; m < 12; m++) {
        g.append(el('div.an12-mois', { title: MOIS[m], text: MOIS_COURT[m] }));
      }
      for (let j = 1; j <= 31; j++) {
        g.append(el('div.an12-num', { text: etiquetteJour(j) }));
        for (let m = 0; m < 12; m++) g.append(caseDe(an, m, j, jours, borne));
      }
    }
    return g;
  }

  // ------------------------------------------------------------
  //  Mesure. Une unité `svh` compte le viewport entier — barre du haut,
  //  barre d'onglets, sélecteur de vue et filtres compris — donc elle
  //  déborde toujours. On mesure la place réellement libre : la largeur
  //  utile de la colonne du calendrier, et la hauteur jusqu'au sommet de
  //  la barre d'onglets.
  // ------------------------------------------------------------

  /** Sens courant de la grille, et nombre d'années affichées. */
  let sens = 'h';
  let nbAnnees = 1;

  /**
   * Le bas de la place utile. Sur téléphone la barre d'onglets est en bas :
   * c'est son bord haut. Sur tablette elle devient un rail à gauche, dont le
   * bord haut vaut 0 — le prendre réduisait la grille à des carrés de 4 px.
   * On ne la compte donc que si elle est bien dans la moitié basse.
   */
  function basUtile() {
    const tabs = document.getElementById('tabbar');
    const haut = tabs ? tabs.getBoundingClientRect().top : Infinity;
    return haut > window.innerHeight / 2 ? Math.min(haut, window.innerHeight) : window.innerHeight;
  }

  function placeDisponible() {
    const repere = scene.querySelector('.an12-entete') || scene.querySelector('.an12') || scene;
    const bas = basUtile();

    return {
      largeur: scene.clientWidth,
      // 24 px de marge basse ; chaque année emporte son étiquette (26 px).
      hauteur: (bas - repere.getBoundingClientRect().top - 24) / nbAnnees - 26,
    };
  }

  /**
   * Applique la taille des carrés. Renvoie true si le sens a changé —
   * auquel cas la grille doit être reconstruite, l'ordre du DOM diffère.
   */
  function ajusterHauteur() {
    if (!scene.isConnected || !scene.querySelector('.an12')) return false;

    const { largeur, hauteur } = placeDisponible();
    // Avant la première mise en page (ou hors navigateur) la mesure ne veut
    // rien dire : on garde le sens en place plutôt que d'osciller.
    if (largeur <= 0 || !Number.isFinite(hauteur)) return false;

    const choix = meilleurSens(largeur, hauteur);
    scene.style.setProperty('--cell', `${choix.cote}px`);

    if (choix.sens !== sens) { sens = choix.sens; return true; }
    return false;
  }

  /**
   * La vue « mois » se dimensionne sur le même principe : le plus grand
   * carré tenant à la fois dans la largeur et dans la hauteur restante.
   * Sans ça, ses cases gardaient leur taille et débordaient vers le bas.
   */
  function ajusterMois() {
    const grille = scene.querySelector('.mois-grille');
    if (!grille || !scene.isConnected) return;

    const largeur = scene.clientWidth;
    if (largeur <= 0) return;

    const bas = basUtile();
    // 34 px : la ligne de résumé sous la grille, plus la marge basse.
    const hauteur = bas - grille.getBoundingClientRect().top - 34;

    const lignes = Number(grille.dataset.lignes) || 6;
    const GAP = 5, ENTETE = 18;
    const cote = Math.max(18, Math.floor(Math.min(
      (largeur - 6 * GAP) / 7,
      (hauteur - ENTETE - lignes * GAP) / lignes)));

    scene.style.setProperty('--cellm', `${cote}px`);
  }

  /** Mesure, puis reconstruit si l'orientation doit changer. */
  function mesurerPuisEventuellementRefaire() {
    ajusterMois();
    if (ajusterHauteur()) {
      rendreScene({ sansMesure: true });
      ajusterHauteur();
    }
  }

  function vueAnnees(deLAn, aLAn, borne = null) {
    const liste = retenues();
    const jours = parJour(liste);
    const bloc = el('div');
    nbAnnees = Math.max(1, aLAn - deLAn + 1);

    for (let an = deLAn; an <= aLAn; an++) {
      const dans = d => d.date.startsWith(String(an))
        && (!borne || (d.date.slice(0, 10) >= borne.debut && d.date.slice(0, 10) <= borne.fin));
      const compte = libelleJour({ p: liste.filter(dans), s: seancesVues().filter(dans) });

      bloc.append(
        el('div.an12-entete', {},
          el('span.an12-an', { text: String(an) }),
          el('span.an12-n', { text: compte || '—' })),
        grilleAnnee(an, { jours, borne }));
    }
    return bloc;
  }

  // ============================================================
  //  Vue « mois » — la seule où les numéros tiennent
  // ============================================================

  function vueMois() {
    const jours = parJour(retenues());
    const bloc = el('div');

    const nbJours = new Date(annee, mois + 1, 0).getDate();
    const decalage = (new Date(annee, mois, 1).getDay() + 6) % 7;   // lundi en tête

    const grille = el('div.mois-grille');
    // Le nombre de semaines varie de 4 à 6 : la mesure en a besoin.
    grille.dataset.lignes = String(Math.ceil((decalage + nbJours) / 7));
    JOURS.forEach(j => grille.append(el('div.mois-jour-nom', { text: j })));
    for (let i = 0; i < decalage; i++) grille.append(el('div'));

    const total = { p: [], s: [] };
    for (let j = 1; j <= nbJours; j++) {
      const k = cle(annee, mois, j);
      const duJour = jours.get(k) || VIDE;
      total.p.push(...duJour.p);
      total.s.push(...duJour.s);

      const jourSemaine = new Date(annee, mois, j).getDay();
      // En vue mois tout jour se touche : pour y pointer une séance.
      const c = carre(k, duJour, ' grand' + (jourSemaine % 6 === 0 ? ' we' : ''), { toujours: true });
      c.append(el('span.mois-num', { text: String(j) }));
      const n = duJour.p.length + duJour.s.length;
      if (n > 1) c.append(el('span.mois-badge', { text: String(n) }));
      if (duJour.s.length) {
        c.append(el('span.mois-seances', {},
          ...[...new Set(duJour.s.map(s => s.type))].map(t => el('span', { text: typeSeance(t).icone }))));
      }
      grille.append(c);
    }

    const resume = libelleJour(total);
    bloc.append(grille, el('div.hint', {
      text: resume ? `${resume} en ${MOIS[mois]} ${annee}.` : `Rien en ${MOIS[mois]} ${annee}.`,
    }));
    return bloc;
  }

  // ============================================================
  //  Barre de contrôle
  // ============================================================

  function rendreBarre() {
    barre.innerHTML = '';
    echelles.innerHTML = '';

    const seg = el('div.seg');
    [['tout', 'Tout'], ['annee', 'Année'], ['mois', 'Mois'], ['periode', 'Période']]
      .forEach(([id, label]) => {
        const b = el('button', { type: 'button', text: label });
        if (id === mode) b.classList.add('on');
        b.onclick = () => {
          mode = id;
          localStorage.setItem('plongee-journal:cal-mode', id);
          detail.innerHTML = '';
          rendreBarre(); rendreScene();
        };
        seg.append(b);
      });

    // La légende voyage avec le sélecteur : en bas, elle mangeait la
    // hauteur que la grille réclamait.
    echelles.append(seg, el('div.legende', {},
      ...[0, 1, 2, 3, 4].map(n => el('div', { class: `j n${n}` })),
      el('span', { text: 'plongées' })));

    if (mode === 'annee') {
      const sel = el('select');
      for (let a = anneeMin; a <= anneeMax; a++) sel.append(el('option', { value: String(a), text: String(a) }));
      sel.value = String(annee);
      sel.onchange = () => { annee = Number(sel.value); detail.innerHTML = ''; rendreScene(); };

      barre.append(el('div.cal-nav', {},
        el('button.btn.sm.ghost', { type: 'button', text: '‹',
          onclick: () => { annee = Math.max(anneeMin, annee - 1); detail.innerHTML = ''; rendreBarre(); rendreScene(); } }),
        sel,
        el('button.btn.sm.ghost', { type: 'button', text: '›',
          onclick: () => { annee = Math.min(anneeMax, annee + 1); detail.innerHTML = ''; rendreBarre(); rendreScene(); } }),
      ));
    }

    if (mode === 'mois') {
      const selMois = el('select');
      MOIS.forEach((m, i) => selMois.append(el('option', { value: String(i), text: m })));
      selMois.value = String(mois);
      selMois.onchange = () => { mois = Number(selMois.value); detail.innerHTML = ''; rendreScene(); };

      const selAn = el('select');
      for (let a = anneeMin; a <= anneeMax; a++) selAn.append(el('option', { value: String(a), text: String(a) }));
      selAn.value = String(annee);
      selAn.onchange = () => { annee = Number(selAn.value); detail.innerHTML = ''; rendreScene(); };

      barre.append(el('div.cal-nav', {},
        el('button.btn.sm.ghost', { type: 'button', text: '‹',
          onclick: () => { if (--mois < 0) { mois = 11; annee--; } detail.innerHTML = ''; rendreBarre(); rendreScene(); } }),
        el('div', { style: { display: 'flex', gap: '8px', flex: 1 } }, selMois, selAn),
        el('button.btn.sm.ghost', { type: 'button', text: '›',
          onclick: () => { if (++mois > 11) { mois = 0; annee++; } detail.innerHTML = ''; rendreBarre(); rendreScene(); } }),
      ));
    }

    if (mode === 'periode') {
      const par = el('div.seg');
      let parNumero = false;
      const zone = el('div.cal-champs');

      // Une paire « de … à … » sur une seule ligne : dans une colonne de
      // 200 px, deux blocs de formulaire complets mangeaient la moitié de
      // la hauteur que la grille réclame.
      const paire = (etiqA, champA, etiqB, champB) => el('div.cal-paire', {},
        el('label', {}, el('span', { text: etiqA }), champA),
        el('label', {}, el('span', { text: etiqB }), champB));

      const rendreChamps = () => {
        zone.innerHTML = '';
        if (parNumero) {
          const nums = avecDate.map(d => Number(d.numero) || 0).filter(Boolean).sort((a, b) => a - b);
          const de = el('input', { type: 'text', inputmode: 'numeric', value: String(nums[0] ?? 1) });
          const a = el('input', { type: 'text', inputmode: 'numeric', value: String(nums[nums.length - 1] ?? 1) });

          const appliquer = () => {
            const min = Number(de.value) || 0, max = Number(a.value) || 0;
            const dans = avecDate.filter(d => {
              const n = Number(d.numero) || 0;
              return n >= Math.min(min, max) && n <= Math.max(min, max);
            }).map(d => d.date.slice(0, 10)).sort();
            if (dans.length) { debut = dans[0]; fin = dans[dans.length - 1]; rendreScene(); }
          };
          de.addEventListener('change', appliquer);
          a.addEventListener('change', appliquer);
          zone.append(paire('de la n°', de, 'à la n°', a));
          appliquer();
        } else {
          const de = el('input', { type: 'date', value: debut });
          const a = el('input', { type: 'date', value: fin });
          de.addEventListener('change', () => { debut = de.value || premier; rendreScene(); });
          a.addEventListener('change', () => { fin = a.value || dernier; rendreScene(); });
          zone.append(paire('du', de, 'au', a));
        }
      };

      [['dates', 'Par dates'], ['numeros', 'Par numéros']].forEach(([id, label], i) => {
        const b = el('button', { type: 'button', text: label });
        if (i === 0) b.classList.add('on');
        b.onclick = () => {
          par.querySelectorAll('button').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          parNumero = id === 'numeros';
          rendreChamps();
          rendreScene();
        };
        par.append(b);
      });

      rendreChamps();
      barre.append(par, zone);
    }
  }

  // ============================================================
  //  Ce qu'on affiche : plongées, fosses, piscines, apnées
  // ============================================================

  function rendreCouches() {
    zoneCouches.innerHTML = '';
    const lignes = [
      { id: 'plongees', label: 'Plongées', n: avecDate.length, carreClasse: 'j n2' },
      ...TYPES_SEANCE.map(t => ({ id: t.id, label: `${t.icone} ${t.label}`, n: seancesDatees.filter(s => s.type === t.id).length, carreClasse: `j n0 s-${t.id}` })),
    ];
    const boite = el('div.card.filtre-card.cal-couches', {},
      ...lignes.map(l => {
        const coche = el('input', { type: 'checkbox' });
        coche.checked = couches.has(l.id);
        coche.onchange = () => {
          if (coche.checked) couches.add(l.id); else couches.delete(l.id);
          garderCouches(couches);
          detail.innerHTML = '';
          rendreScene();
        };
        return el('label.cal-couche', {}, coche, el('span', { class: l.carreClasse }), el('span', { text: l.label }),
          el('span.cal-couche-n', { text: String(l.n) }));
      }));
    zoneCouches.append(boite);
  }

  // ============================================================
  //  Filtre par compagnon, commun à toutes les vues
  // ============================================================

  function rendreFiltre() {
    filtre.innerHTML = '';

    const compte = new Map();
    avecDate.forEach(d => (d.buddyIds || []).forEach(id =>
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
        rendreScene();
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
                rendreFiltre(); detail.innerHTML = ''; rendreScene();
              } })
          : el('span.sec-fleche', { text: chips.hidden ? '▸' : '▾' }),
      );
    };
    entete.onclick = () => {
      chips.hidden = !chips.hidden;
      majEntete();
      requestAnimationFrame(mesurerPuisEventuellementRefaire);
    };
    majEntete();

    filtre.append(el('div.card.filtre-card', {}, entete, chips));
  }

  // ============================================================

  function rendreScene({ sansMesure = false } = {}) {
    scene.innerHTML = '';

    if (mode === 'mois') {
      scene.append(vueMois());
    } else if (mode === 'annee') {
      scene.append(vueAnnees(annee, annee));
    } else if (mode === 'periode') {
      if (fin < debut) {
        scene.append(el('div.hint', { text: 'La fin est avant le début.' }));
      } else {
        scene.append(vueAnnees(Number(debut.slice(0, 4)), Number(fin.slice(0, 4)), { debut, fin }));
      }
    } else {
      scene.append(vueAnnees(anneeMin, anneeMax));
    }

    // La grille est en place : on peut mesurer, dimensionner les carrés,
    // et changer d'orientation si l'autre sens fait mieux.
    if (!sansMesure) requestAnimationFrame(mesurerPuisEventuellementRefaire);
  }

  rendreCouches();
  rendreFiltre();
  rendreBarre();
  rendreScene();

  // Rotation de l'écran, clavier qui s'ouvre, barre d'adresse qui se
  // rétracte : la place disponible bouge, la grille suit.
  const surRedimensionnement = () => {
    if (!scene.isConnected) {
      window.removeEventListener('resize', surRedimensionnement);
      window.removeEventListener('orientationchange', surRedimensionnement);
      return;
    }
    mesurerPuisEventuellementRefaire();
  };
  window.addEventListener('resize', surRedimensionnement);
  window.addEventListener('orientationchange', surRedimensionnement);

  // Dès qu'il y a la place, les commandes passent en colonne à droite :
  // elles s'appliquent en direct, donc les garder sous les yeux ne coûte
  // rien, et la grille récupère toute la hauteur.
  wrap.append(echelles, el('div.cal-wrap', {},
    el('div.cal-carte', {}, scene),
    el('div.cal-panneau', {}, barre, zoneCouches, filtre, detail)));
  return wrap;
}
