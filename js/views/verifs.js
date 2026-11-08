// ============================================================
//  Écrans des garde-fous : fusion de deux fiches, alertes de la
//  fiche, liste « à vérifier ».
// ============================================================

import { el, toast, openModal, fmtDate, fmtDuration, nomAffiche } from '../lib.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { doublonsPossibles, doublonsDuCarnet, incoherences, fusionnerPlongees, lieuParDefaut } from '../verifs.js';

const ordi = d => (d?.suuntoKeys || []).length > 0 || (d?.samples || []).length > 2;

function resume(d, buddies) {
  const noms = (d.buddyIds || []).map(id => nomAffiche(buddies.find(b => b.id === id))).filter(Boolean);
  return [
    `${fmtDate(d.date)}${d.heureImmersion ? ` · ${d.heureImmersion}` : ''}`,
    d.lieuNom || d.site || 'lieu non précisé',
    [d.profMax ? `${d.profMax} m` : null, d.dureeMin ? fmtDuration(d.dureeMin) : null].filter(Boolean).join(' · '),
    noms.length ? noms.join(', ') : 'palanquée vide',
    ordi(d) ? `⌚ ${(d.samples || []).length > 2 ? 'courbe de la montre' : 'importée'}` : '✍️ saisie à la main',
    d.photoCarnet?.ref ? '📓 page du carnet' : null,
  ].filter(Boolean);
}

/** Ce n'est pas un doublon : noté sur les deux fiches, on n'en parle plus. */
export async function pasUnDoublon(a, b) {
  for (const [x, y] of [[a, b], [b, a]]) {
    const d = await store.getDive(x.id);
    if (!d) continue;
    d.pasDoublon = [...new Set([...(d.pasDoublon || []), y.id])];
    await store.saveDive(d);
  }
  toast('Noté : deux plongées différentes');
}

/**
 * La fenêtre de fusion : les deux fiches côte à côte, le lieu à garder,
 * puis une seule fiche (celle de la montre, complétée de la saisie).
 */
export function ouvrirFusion(saisie, montre, { apres = null } = {}) {
  if (ordi(saisie) && !ordi(montre)) [saisie, montre] = [montre, saisie];
  openModal(close => {
    let lieu = lieuParDefaut(montre, saisie);
    const zone = el('div');
    (async () => {
      const buddies = await store.listBuddies();
      const carte = (d, titre) => el('div.fusion-carte', {}, el('b', { text: titre }),
        ...resume(d, buddies).map(t => el('div', { text: t })));
      const choixLieu = el('div.seg');
      const rendreLieu = () => {
        choixLieu.replaceChildren(...[['montre', montre], ['saisie', saisie]].map(([k, d]) => {
          const b = el('button', { type: 'button', text: d.lieuNom || d.site || (d.lat != null ? 'point GPS' : 'aucun'),
            class: lieu === k ? 'on' : null, onclick: () => { lieu = k; rendreLieu(); } });
          return b;
        }));
      };
      rendreLieu();
      zone.replaceChildren(
        el('div.fusion-cartes', {}, carte(montre, '⌚ De la montre'), carte(saisie, '✍️ Saisie')),
        el('div.lbl', { style: { marginTop: '12px' }, text: 'Le lieu à garder' }), choixLieu,
        el('div.hint', { text: 'On garde ce que la montre a mesuré (date, heure, durée, profondeur, courbe) et tout ce que tu as noté '
          + 'à la main (palanquée, centre, page du carnet, remarques, ce que tu as vu). La fiche saisie disparaît ensuite.' }),
        el('div.btn-row', {},
          el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }),
          el('button.btn.ghost', { type: 'button', text: 'Deux plongées différentes', onclick: async () => {
            await pasUnDoublon(saisie, montre); close(); apres?.(null);
          } }),
          el('button.btn.primary', { type: 'button', text: 'Fusionner', onclick: async e => {
            e.currentTarget.disabled = true;
            try {
              const m = await store.getDive(montre.id) || montre;
              const s = await store.getDive(saisie.id) || saisie;
              const f = fusionnerPlongees(m, s, { lieu });
              await store.saveDive(f);
              await store.deleteDive(s.id);
              toast(`Fusionnées : n°${f.numero ?? ''}`);
              close();
              apres ? apres(f) : navigate(`dive/${f.id}`, true);
            } catch (err) { toast(err.message, true); e.currentTarget.disabled = false; }
          } })));
    })();
    return el('div', {}, el('h3', { text: '🔀 La même plongée ?' }), zone);
  });
}

/**
 * Avant d'enregistrer une plongée saisie à la main : existe-t-elle déjà ?
 * @returns {Promise<'enregistrer'|'fusionner'|'annuler'>}
 */
export function avantEnregistrement(dive, toutes) {
  if (ordi(dive)) return Promise.resolve('enregistrer');
  const cands = doublonsPossibles(dive, toutes);
  if (!cands.length) return Promise.resolve('enregistrer');
  return new Promise(resolve => {
    let reponse = 'annuler';
    openModal(close => el('div', {},
      el('h3', { text: '🔀 Cette plongée existe peut-être déjà' }),
      el('div.hint', { style: { marginTop: 0 }, text: 'La montre a enregistré une plongée qui lui ressemble beaucoup :' }),
      ...cands.map(c => el('div.fusion-candidat', {},
        el('div', {}, el('b', { text: `n°${c.dive.numero ?? '?'} · ${fmtDate(c.dive.date)}${c.dive.heureImmersion ? ` ${c.dive.heureImmersion}` : ''}` }),
          el('div.hint', { style: { margin: 0 }, text: `${c.dive.lieuNom || 'lieu non précisé'} — ${c.raisons.join(', ')}` })),
        el('button.btn.sm.primary', { type: 'button', text: 'C’est elle', onclick: () => {
          reponse = 'fusionner'; close();
          resolve({ action: 'fusionner', montre: c.dive });
        } }))),
      el('div.btn-row', {},
        el('button.btn.ghost', { type: 'button', text: 'Revenir à la fiche', onclick: () => { close(); } }),
        el('button.btn', { type: 'button', text: 'Non, c’est une autre plongée', onclick: () => {
          reponse = 'enregistrer'; dive.pasDoublon = [...new Set([...(dive.pasDoublon || []), ...cands.map(c => c.dive.id)])];
          close(); resolve({ action: 'enregistrer' });
        } }))), { onClose: () => { if (reponse === 'annuler') resolve({ action: 'annuler' }); } });
  });
}

/** Les alertes d'une fiche (incohérences, doublons possibles). */
export function alertesFiche(d, toutes, { lecture = false, rafraichir = () => {} } = {}) {
  const inc = incoherences(d);
  const dbl = doublonsPossibles(d, toutes);
  if (!inc.length && !dbl.length) return null;
  return el('div.card.alertes-fiche', {},
    el('div', { style: { fontWeight: '650', marginBottom: '6px' }, text: '⚠ À vérifier' }),
    ...inc.map(i => el('div.alerte-ligne', {}, el('span', { text: i.texte }),
      lecture ? null : i.code === 'eau'
        ? el('button.btn.sm', { type: 'button', text: `Passer en eau ${d.eau === 'douce' ? 'salée' : 'douce'}`, onclick: async () => {
            const x = await store.getDive(d.id);
            Object.assign(x, { eau: d.eau === 'douce' ? 'salee' : 'douce', eauManuelle: true });
            await store.saveDive(x); toast('Corrigé'); rafraichir();
          } })
        : el('button.btn.sm.ghost', { type: 'button', text: 'Corriger la fiche', onclick: () => navigate(`dive/${d.id}/edit`) }))),
    ...dbl.map(c => el('div.alerte-ligne', {},
      el('span', { text: `Peut-être la même plongée que la n°${c.dive.numero ?? '?'} (${fmtDate(c.dive.date)}, ${c.dive.lieuNom || 'lieu non précisé'}) : ${c.raisons.join(', ')}.` }),
      lecture ? null : el('div.btn-row', { style: { margin: 0 } },
        el('button.btn.sm.primary', { type: 'button', text: '🔀 Fusionner…', onclick: () => ouvrirFusion(d, c.dive) }),
        el('button.btn.sm.ghost', { type: 'button', text: 'Non', onclick: async () => { await pasUnDoublon(d, c.dive); rafraichir(); } })))));
}

/** Ce qui est à vérifier dans tout le carnet. */
export function aVerifier(dives) {
  const paires = doublonsDuCarnet(dives);
  const inc = dives.map(d => ({ dive: d, liste: incoherences(d) })).filter(x => x.liste.length);
  const ids = new Set([...paires.flatMap(p => [p.saisie.id, p.montre.id]), ...inc.map(x => x.dive.id)]);
  return { paires, inc, ids };
}

export function ouvrirAVerifier(dives, { rafraichir = () => {} } = {}) {
  const { paires, inc } = aVerifier(dives);
  openModal(close => el('div', {},
    el('h3', { text: '⚠ À vérifier' }),
    paires.length ? el('div.lbl', { text: 'Doublons possibles' }) : null,
    ...paires.map(p => el('div.fusion-candidat', {},
      el('div', {}, el('b', { text: `n°${p.saisie.numero ?? '?'} ✍️ et n°${p.montre.numero ?? '?'} ⌚` }),
        el('div.hint', { style: { margin: 0 }, text: `${p.saisie.lieuNom || '?'} / ${p.montre.lieuNom || '?'} — ${p.raisons.join(', ')}` })),
      el('button.btn.sm.primary', { type: 'button', text: '🔀 Voir', onclick: () => { close(); ouvrirFusion(p.saisie, p.montre, { apres: () => rafraichir() }); } }))),
    inc.length ? el('div.lbl', { style: { marginTop: '12px' }, text: 'Fiches qui se contredisent' }) : null,
    ...inc.map(x => el('div.fusion-candidat', {},
      el('div', {}, el('b', { text: `n°${x.dive.numero ?? '?'} · ${fmtDate(x.dive.date)} · ${x.dive.lieuNom || ''}` }),
        el('div.hint', { style: { margin: 0 }, text: x.liste.map(i => i.texte).join(' ') })),
      el('button.btn.sm', { type: 'button', text: 'Ouvrir', onclick: () => { close(); navigate(`dive/${x.dive.id}`); } }))),
    el('div.btn-row', {}, el('button.btn.primary', { type: 'button', text: 'Fermer', onclick: close }))));
}
