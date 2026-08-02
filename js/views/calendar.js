// ============================================================
//  Calendrier des plongées
//
//  Une seule grille de lecture, celle des calendriers muraux :
//  douze colonnes (les mois), trente-et-une lignes (les jours).
//  Chaque jour est un carré ; il se colore quand on a plongé.
//
//  Quatre échelles :
//   • Tout     — toutes les années du carnet, empilées.
//   • Année    — une année, sélectionnable.
//   • Mois     — le mois en grand, avec les numéros.
//   • Période  — de telle date (ou tel numéro) à telle autre.
//
//  La taille des carrés se déduit de la hauteur disponible, jamais
//  de la largeur : c'est ce qui garantit qu'on ne scrolle pas.
// ============================================================

import { el, fmtDate, fmtDuration, fmtDateLong, fullName, scrollTo } from '../lib.js';
import { navigate } from '../router.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
              'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURT = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const pad = n => String(n).padStart(2, '0');
const cle = (a, m, j) => `${a}-${pad(m + 1)}-${pad(j)}`;
const iso = d => cle(d.getFullYear(), d.getMonth(), d.getDate());

/** 0 à 4 : plus il y a de plongées ce jour-là, plus le carré est chaud. */
const chaleur = n => (n ? Math.min(4, n) : 0);

// ============================================================

export function calendrier(dives, { buddies = [] } = {}) {
  const wrap = el('div');

  const avecDate = dives.filter(d => (d.date || '').length >= 10);
  if (!avecDate.length) {
    wrap.append(el('div.empty', { text: 'Aucune plongée datée.' }));
    return wrap;
  }

  const nomCompagnon = id => fullName(buddies.find(b => b.id === id)) || '?';

  const dates = avecDate.map(d => d.date.slice(0, 10)).sort();
  const premier = dates[0];
  const dernier = dates[dates.length - 1];
  const anneeMin = Number(premier.slice(0, 4));
  const anneeMax = Number(dernier.slice(0, 4));

  let mode = localStorage.getItem('plongee-journal:cal-mode') || 'tout';
  let mois = Number(dernier.slice(5, 7)) - 1;
  let annee = anneeMax;
  let debut = premier;
  let fin = dernier;
  const compagnonsFiltre = new Set();

  const barre = el('div');
  const filtre = el('div');
  const scene = el('div');
  const detail = el('div');

  /** Plongées après application du filtre par compagnon. */
  const retenues = () => (compagnonsFiltre.size
    ? avecDate.filter(d => (d.buddyIds || []).some(id => compagnonsFiltre.has(id)))
    : avecDate);

  function parJour(liste) {
    const m = new Map();
    liste.forEach(d => {
      const k = d.date.slice(0, 10);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(d);
    });
    return m;
  }

  // ---------- un carré ----------
  function carre(dateStr, duJour, extra = '') {
    const c = el('button', {
      type: 'button',
      class: `j n${chaleur(duJour.length)}${extra}`,
      title: duJour.length
        ? `${fmtDate(dateStr)} — ${duJour.length} plongée${duJour.length > 1 ? 's' : ''}`
        : fmtDate(dateStr),
    });
    if (dateStr === iso(new Date())) c.classList.add('auj');
    if (duJour.length) c.onclick = () => afficherJour(dateStr, duJour);
    else c.disabled = true;
    return c;
  }

  function afficherJour(date, duJour) {
    detail.innerHTML = '';
    detail.append(el('div.card', {},
      el('div.lbl', { text: fmtDateLong(date) }),
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
    ));
    scrollTo(detail, { behavior: 'smooth', block: 'nearest' });
  }

  // ============================================================
  //  La grille d'une année : 12 colonnes × 31 lignes
  // ============================================================

  function grilleAnnee(an, { jours, borne = null }) {
    const g = el('div.an12');

    // Ligne d'en-tête : le coin vide, puis les initiales des mois.
    g.append(el('div.an12-coin'));
    MOIS.forEach((nom, m) => g.append(
      el('div.an12-mois', { title: nom, text: MOIS_COURT[m] })));

    for (let j = 1; j <= 31; j++) {
      // La gouttière ne porte qu'un repère sur cinq : au-delà, à cette
      // taille, les chiffres se marchent dessus.
      g.append(el('div.an12-num', { text: (j === 1 || j % 5 === 0) ? String(j) : '' }));

      for (let m = 0; m < 12; m++) {
        const dansLeMois = j <= new Date(an, m + 1, 0).getDate();
        if (!dansLeMois) { g.append(el('div.j.vide')); continue; }

        const k = cle(an, m, j);
        const horsBorne = borne && (k < borne.debut || k > borne.fin);
        const duJour = horsBorne ? [] : (jours.get(k) || []);

        const jourSemaine = new Date(an, m, j).getDay();     // 0 = dimanche
        let extra = '';
        if (jourSemaine === 0 || jourSemaine === 6) extra += ' we';
        if (horsBorne) extra += ' hors';

        const c = carre(k, duJour, extra);
        if (horsBorne) c.disabled = true;
        g.append(c);
      }
    }
    return g;
  }

  // ------------------------------------------------------------
  //  Hauteur : mesurée, jamais devinée.
  //
  //  Un `svh` compte le viewport entier — barre du haut, barre d'onglets,
  //  sélecteur de vue et filtres compris. C'est exactement ce qui faisait
  //  déborder la grille. On mesure donc la place qui reste réellement
  //  sous le haut de la grille et au-dessus de la barre d'onglets.
  // ------------------------------------------------------------

  /** Nombre d'années actuellement affichées. */
  let nbAnnees = 1;

  function ajusterHauteur() {
    if (!scene.isConnected || !scene.querySelector('.an12')) return;

    const premiere = scene.querySelector('.an12-entete') || scene.querySelector('.an12');
    const haut = premiere.getBoundingClientRect().top;

    // Le bas utile : le sommet de la barre d'onglets, qui est fixe et
    // recouvre la fin de la zone de défilement.
    const tabs = document.getElementById('tabbar');
    const bas = tabs ? tabs.getBoundingClientRect().top : window.innerHeight;

    // Ce qu'il faut laisser : la légende et le rembourrage bas de la carte.
    const reserve = 34;
    const dispo = bas - haut - reserve;

    // Chaque année emporte son étiquette (~26 px) en plus de sa grille.
    const parAnnee = Math.floor(dispo / nbAnnees) - 26;
    scene.style.setProperty('--hpx', `${Math.max(72, parAnnee)}px`);
  }

  function vueAnnees(deLAn, aLAn, borne = null) {
    const liste = retenues();
    const jours = parJour(liste);
    const bloc = el('div');
    nbAnnees = Math.max(1, aLAn - deLAn + 1);

    for (let an = deLAn; an <= aLAn; an++) {
      const compte = liste.filter(d => d.date.startsWith(String(an))
        && (!borne || (d.date.slice(0, 10) >= borne.debut && d.date.slice(0, 10) <= borne.fin))).length;

      bloc.append(
        el('div.an12-entete', {},
          el('span.an12-an', { text: String(an) }),
          el('span.an12-n', { text: compte ? `${compte} plongée${compte > 1 ? 's' : ''}` : '—' })),
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
    JOURS.forEach(j => grille.append(el('div.mois-jour-nom', { text: j })));
    for (let i = 0; i < decalage; i++) grille.append(el('div'));

    let total = 0;
    for (let j = 1; j <= nbJours; j++) {
      const k = cle(annee, mois, j);
      const duJour = jours.get(k) || [];
      total += duJour.length;

      const jourSemaine = new Date(annee, mois, j).getDay();
      const c = carre(k, duJour, ' grand' + (jourSemaine % 6 === 0 ? ' we' : ''));
      c.append(el('span.mois-num', { text: String(j) }));
      if (duJour.length > 1) c.append(el('span.mois-badge', { text: String(duJour.length) }));
      grille.append(c);
    }

    bloc.append(grille, el('div.hint', {
      text: total ? `${total} plongée${total > 1 ? 's' : ''} en ${MOIS[mois]} ${annee}.`
                  : `Aucune plongée en ${MOIS[mois]} ${annee}.`,
    }));
    return bloc;
  }

  // ============================================================
  //  Barre de contrôle
  // ============================================================

  function rendreBarre() {
    barre.innerHTML = '';

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
    barre.append(el('div.cal-tete', {}, seg,
      el('div.legende', {},
        ...[0, 1, 2, 3, 4].map(n => el('div', { class: `j n${n}` })),
        el('span', { text: 'plongées' }))));

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
      const par = el('div.seg', { style: { marginBottom: '10px' } });
      let parNumero = false;
      const zone = el('div');

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
          zone.append(el('div.row', {},
            el('div.field', {}, el('label.lbl', { text: 'De la plongée n°' }), de),
            el('div.field', {}, el('label.lbl', { text: 'À la plongée n°' }), a)));
          appliquer();
        } else {
          const de = el('input', { type: 'date', value: debut });
          const a = el('input', { type: 'date', value: fin });
          de.addEventListener('change', () => { debut = de.value || premier; rendreScene(); });
          a.addEventListener('change', () => { fin = a.value || dernier; rendreScene(); });
          zone.append(el('div.row', {},
            el('div.field', {}, el('label.lbl', { text: 'Du' }), de),
            el('div.field', {}, el('label.lbl', { text: 'Au' }), a)));
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
      requestAnimationFrame(ajusterHauteur);
    };
    majEntete();

    filtre.append(el('div.card.filtre-card', {}, entete, chips));
  }

  // ============================================================

  function rendreScene() {
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

    // La grille est en place : on peut mesurer et dimensionner les carrés.
    requestAnimationFrame(ajusterHauteur);
  }

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
    ajusterHauteur();
  };
  window.addEventListener('resize', surRedimensionnement);
  window.addEventListener('orientationchange', surRedimensionnement);

  wrap.append(barre, filtre, el('div.card.cal-carte', {}, scene), detail);
  return wrap;
}
