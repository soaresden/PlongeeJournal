// ============================================================
//  « Joindre » : deux plongées qui n'en font qu'une (site pas trouvé,
//  on remonte, un peu de bateau, on redescend). Calcul : js/joindre.js.
// ============================================================

import { el, toast, openModal, fmtDate, fmtDuration } from '../lib.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { joindrePlongees, ordreEtSurface } from '../joindre.js';

const lieuDe = d => d.lieuNom || d.site || 'Lieu non précisé';
const ligne = d => `n°${d.numero ?? '—'} · ${d.heureImmersion || '?'} · ${d.profMax ? `${String(d.profMax).replace('.', ',')} m` : '? m'} · ${fmtDuration(d.dureeMin)}`;

/**
 * La confirmation, puis la jonction.
 * @param {object} a
 * @param {object} b
 * @param {{apres?: (jointe:object)=>void}} options
 */
export function ouvrirJoindre(a, b, { apres = null } = {}) {
  const { premiere: p, seconde: q, surfaceMin } = ordreEtSurface(a, b);
  const lieuxDifferents = lieuDe(p) !== lieuDe(q) || p.lat !== q.lat;
  let lieu = 'seconde';
  const apercu = el('div.joindre-apercu');
  const montrer = () => {
    const f = joindrePlongees(p, q, { lieu });
    apercu.replaceChildren(
      el('div.joindre-titre', { text: '= Une seule plongée' }),
      el('div', {}, el('b', { text: lieuDe(f) })),
      el('div.hint', { style: { margin: 0 }, text: `${fmtDate(f.date)} · ${f.heureImmersion} → ${f.heureSortie}` }),
      el('div.joindre-chiffres', {},
        el('span', {}, el('b', { text: f.profMax ? `${String(f.profMax).replace('.', ',')} m` : '—' }), 'prof. max'),
        el('span', {}, el('b', { text: fmtDuration(f.dureeMin) }), 'sous l’eau'),
        surfaceMin != null ? el('span', {}, el('b', { text: `${surfaceMin} min` }), 'en surface') : null));
  };
  openModal(close => {
    const choixLieu = lieuxDifferents ? el('div.joindre-lieux', {},
      el('div.hint', { style: { margin: '0 0 6px' }, text: 'Le lieu à garder :' }),
      ...[['premiere', p], ['seconde', q]].map(([k, d]) => el('label.joindre-lieu', {},
        el('input', { type: 'radio', name: 'joindre-lieu', checked: k === lieu, onchange: () => { lieu = k; montrer(); } }),
        el('span', { text: `${lieuDe(d)}${k === 'seconde' ? ' (la seconde, le vrai site ?)' : ''}` })))) : null;
    const go = el('button.btn.primary', { type: 'button', text: '🔗 Joindre', onclick: async () => {
      go.disabled = true;
      try {
        const f = joindrePlongees(await store.getDive(p.id) || p, await store.getDive(q.id) || q, { lieu });
        const jointe = await store.joindreDives(f, q.id);
        close();
        toast(`🔗 Jointes : n°${jointe.numero ?? ''}, ${fmtDuration(jointe.dureeMin)} sous l’eau`);
        if (apres) apres(jointe); else navigate(`dive/${jointe.id}`, true);
      } catch (e) {
        toast(e.message, true);
        go.disabled = false;
      }
    } });
    montrer();
    return el('div.joindre', {},
      el('h3', { text: '🔗 Joindre ces deux plongées' }),
      el('div.hint', { text: 'Remontée puis redescente (site pas trouvé, un bout de bateau…) : c’était une seule plongée. '
        + 'Comme en MN90 pour des plongées consécutives : les deux temps sous l’eau s’additionnent, la profondeur est la plus grande.' }),
      el('div.joindre-parts', {},
        el('div.joindre-part', {}, el('b', { text: lieuDe(p) }), el('span', { text: ligne(p) })),
        el('div.joindre-surface', { text: surfaceMin != null ? `⛵ ${surfaceMin} min en surface` : '⛵ surface' }),
        el('div.joindre-part', {}, el('b', { text: lieuDe(q) }), el('span', { text: ligne(q) }))),
      surfaceMin != null && surfaceMin > 30 ? el('div.hint', { style: { color: 'var(--warn)' },
        text: `⚠ ${surfaceMin} min en surface : c’est long pour une seule plongée (en MN90, au-delà de 15 min ce sont deux plongées successives).` }) : null,
      p.date !== q.date ? el('div.hint', { style: { color: 'var(--warn)' }, text: '⚠ Les deux ne sont pas le même jour.' }) : null,
      choixLieu,
      apercu,
      el('div.hint', { text: 'La courbe met les deux bout à bout ; notes, compagnons et vidéos des deux sont gardés. '
        + 'La seconde fiche disparaît (🕘 Historique pour revenir en arrière).' }),
      el('div.btn-row', {}, el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }), go));
  });
}

/** Les plongées du même jour, à moins de 2 h avant ou après : candidates à joindre. */
export function voisinesAJoindre(d, toutes) {
  const t = x => (/^\d\d:\d\d/.test(x.heureImmersion || '') ? +x.heureImmersion.slice(0, 2) * 60 + +x.heureImmersion.slice(3, 5) : null);
  const fin = x => (t(x) == null ? null : t(x) + (+x.dureeMin || 0));
  return toutes.filter(o => o.id !== d.id && o.date === d.date && !o.seance && t(o) != null && t(d) != null
    && (t(o) >= t(d) ? t(o) - fin(d) : t(d) - fin(o)) <= 120)
    .sort((x, y) => t(x) - t(y));
}
