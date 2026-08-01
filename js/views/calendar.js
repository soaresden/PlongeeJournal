// ============================================================
//  Calendrier des plongées
//
//  Vue mensuelle : chaque jour plongé est mis en évidence, avec un
//  point par plongée. Un appui ouvre la plongée, ou la liste du jour
//  s'il y en a eu plusieurs.
// ============================================================

import { el, fmtDate, fmtDuration, fmtDateLong, scrollTo } from '../lib.js';
import { navigate } from '../router.js';

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const cleJour = d => (d.date || '').slice(0, 10);
const iso = (a, m, j) => `${a}-${String(m + 1).padStart(2, '0')}-${String(j).padStart(2, '0')}`;

/**
 * @param {Array}  dives    plongées du carnet
 * @param {object} options  { moisInitial: 'AAAA-MM' }
 * @returns {HTMLElement}
 */
export function calendrier(dives, { moisInitial } = {}) {
  const parJour = new Map();
  dives.forEach(d => {
    const k = cleJour(d);
    if (!k) return;
    if (!parJour.has(k)) parJour.set(k, []);
    parJour.get(k).push(d);
  });

  // On ouvre sur le mois de la dernière plongée : c'est celui qui intéresse.
  const derniere = dives.map(d => d.date).filter(Boolean).sort().pop();
  const depart = moisInitial || (derniere ? derniere.slice(0, 7) : new Date().toISOString().slice(0, 7));
  let [annee, mois] = depart.split('-').map(Number);
  mois -= 1;

  const wrap = el('div');
  const nav = el('div.cal-nav');
  const grille = el('div.cal-grid');
  const detail = el('div');
  const bilan = el('div.hint');

  const aujourdhui = new Date().toISOString().slice(0, 10);

  function bouger(delta) {
    mois += delta;
    if (mois < 0) { mois = 11; annee--; }
    if (mois > 11) { mois = 0; annee++; }
    detail.innerHTML = '';
    rendre();
  }

  function rendre() {
    const libelle = new Date(annee, mois, 1)
      .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    nav.innerHTML = '';
    nav.append(
      el('button.btn.sm.ghost', { type: 'button', text: '‹', onclick: () => bouger(-1),
        'aria-label': 'Mois précédent' }),
      el('div.mois', { text: libelle }),
      el('button.btn.sm.ghost', { type: 'button', text: '›', onclick: () => bouger(1),
        'aria-label': 'Mois suivant' }),
    );

    grille.innerHTML = '';
    JOURS.forEach(j => grille.append(el('div.cal-jour-nom', { text: j })));

    // getDay() : 0 = dimanche. On veut une semaine qui commence le lundi.
    const premier = new Date(annee, mois, 1);
    const decalage = (premier.getDay() + 6) % 7;
    const nbJours = new Date(annee, mois + 1, 0).getDate();

    for (let i = 0; i < decalage; i++) grille.append(el('div.cal-case.vide'));

    let plongeesDuMois = 0;

    for (let j = 1; j <= nbJours; j++) {
      const date = iso(annee, mois, j);
      const duJour = parJour.get(date) || [];
      plongeesDuMois += duJour.length;

      const case_ = el('button.cal-case', { type: 'button' },
        el('span', { text: String(j) }),
        duJour.length
          ? el('div.cal-points', {}, duJour.slice(0, 4).map(() => el('div.cal-point')))
          : null,
      );

      if (date === aujourdhui) case_.classList.add('aujourdhui');

      if (duJour.length) {
        case_.classList.add('a-plonge');
        case_.title = `${duJour.length} plongée(s) le ${fmtDate(date)}`;
        case_.onclick = () => afficherJour(date, duJour);
      } else {
        case_.disabled = true;
      }

      grille.append(case_);
    }

    bilan.textContent = plongeesDuMois
      ? `${plongeesDuMois} plongée${plongeesDuMois > 1 ? 's' : ''} ce mois-ci.`
      : 'Aucune plongée ce mois-ci.';
  }

  function afficherJour(date, duJour) {
    detail.innerHTML = '';
    detail.append(el('div.card', {},
      el('div.lbl', { text: fmtDateLong(date) }),
      ...duJour.map(d => el('div', {
        style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0',
                 borderTop: '1px solid var(--line)', cursor: 'pointer' },
        onclick: () => navigate(`dive/${d.id}`),
      },
        el('div.dive-num', { style: { width: '38px', height: '38px', flex: '0 0 38px',
          fontSize: '13px' }, text: d.numero ?? '—' }),
        el('div', { style: { flex: 1, minWidth: 0 } },
          el('div', { style: { fontWeight: '600', fontSize: '14.5px' },
            text: d.lieuNom || 'Lieu non précisé' }),
          el('div', { style: { color: 'var(--text-dim)', fontSize: '12.5px' },
            text: [d.heureImmersion, d.profMax ? `${d.profMax} m` : null,
                   d.dureeMin ? fmtDuration(d.dureeMin) : null].filter(Boolean).join(' · ') })),
        el('span', { style: { color: 'var(--text-mute)' }, text: '›' }),
      )),
    ));
    scrollTo(detail, { behavior: 'smooth', block: 'nearest' });
  }

  rendre();
  wrap.append(el('div.card', {}, nav, grille, bilan), detail);
  return wrap;
}
