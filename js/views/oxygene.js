// ============================================================
//  🫁 L'oxygène de la journée : le tableau du cours Nitrox
//  Confirmé (fond, remontée, palier, remontée surface, intervalle,
//  majoration…) rempli tout seul avec les plongées du jour, et le
//  même calcul sur la vraie courbe de la montre. Touche une case :
//  son calcul. Calculs : js/oxygene.js ; tables : MN90 Mobile.
// ============================================================

import { el, fmtDate } from '../lib.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { MN90_EN_LIGNE } from './mn90.js';
import { journeeO2, joursDePlongee } from '../oxygene.js';

const natif = () => !!window.Capacitor?.isNativePlatform?.();
const n = (x, d = 2) => (x == null || !isFinite(x) ? '—' : (Math.round(x * 10 ** d) / 10 ** d).toLocaleString('fr-FR', { maximumFractionDigits: d }));
const hm = m => `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`;
const gazNom = f => (f >= 0.995 ? 'O₂' : f <= 0.21 + 1e-9 ? 'Air' : `N${Math.round(f * 100)}`);

// Les tables de MN90 Mobile : la copie de l'APK, ou le site
let tables = null;
function chargerTables() {
  if (window.MN90Lib && window.NitroxExamen?.lire) return Promise.resolve();
  const base = natif() ? './mn90/' : MN90_EN_LIGNE;
  const script = src => new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => ko(new Error('Tables MN90 injoignables (pas de réseau ?)'));
    document.head.append(s);
  });
  tables ||= script(`${base}shared/mn90.js`).then(() => script(`${base}nitrox/examen.js`)).catch(e => { tables = null; throw e; });
  return tables;
}

const cel = (v, d = '') => ({ v, d });

/** Les lignes du tableau d'une plongée, comme sur la copie. */
function lignesPlongee(e, lettres) {
  const r = e.r, f = e.fo2, g = gazNom(f), [fond, rem, ...reste] = r.rows;
  const paC = z => cel(n(1 + z / 10, 2), `Pa = ${n(z, 1)} / 10 + 1 (atm) = ${n(1 + z / 10, 2)} bar`);
  const ppC = (row, pa, fx) => cel(n(row.pp, 3), `PpO₂ = ${n(pa, 2)} × ${n(fx, 2)} = ${n(row.pp, 3)} bar` + (row.c == null ? ' → sous 0,6 : rien' : ` → colonne NOAA ${n(row.c, 1)} (immédiatement supérieure)`));
  const noaaC = row => cel(row.c == null ? '0' : n(row.snc, 2), row.c == null ? 'sous 0,6 b : 0' : `colonne ${n(row.c, 1)} → ${n(row.snc, 2)} %/min · ${n(row.otu, 2)} OTU/min`);
  const pctC = row => cel(n(row.sncP, 2), `%SNC = ${n(row.snc, 2)} × ${n(row.d, 2)} = ${n(row.sncP, 2)} % · OTU = ${n(row.otu, 2)} × ${n(row.d, 2)} = ${n(row.otuP, 1)}`);
  const paAir = r.pn / 0.8;
  let eq = r.air ? `Air : ligne ${r.tab.d} m` : `(1 − ${n(f, 2)}) × ${n(r.pa, 2)} = ${n(r.pn, 3)} / 0,8 = ${n(paAir, 3)} = ${n(paAir - 1, 3)} + 1 (atm) → ${n(r.pea, 1)} m → ligne ${r.tab.d} m`;
  if (e.t1) eq += ` · Tableau I : GPS ${e.t1.gps} × ${hm(e.t1.col)} → azote ${e.t1.n2 == null ? 'normal' : n(e.t1.n2, 2)}`;
  if (e.t2) eq += ` · Tableau II : ligne ${n(e.t2.ligne, 2)} × ${e.t2.col} m → majoration ${e.t2.maj} min`;
  if (e.maj) eq += ` · durée fictive ${e.d.dureeMin} + ${e.maj} = ${e.d.dureeMin + e.maj} min`;
  eq += ` · ${e.d.dureeMin + (e.maj || 0)} min → ligne ${hm(r.tab.t)} : ${r.paliers.length ? r.paliers.map(p => `${p.tAir} min à ${p.z} m`).join(' + ') : 'pas de palier'} · GPS ${r.tab.gps}`;
  const premier = r.paliers[0]?.z ?? 0;
  const out = [
    [`${lettres[0]}-Fond`, cel(n(e.d.profMax, 1)), cel(String(e.d.dureeMin), 'durée de la plongée (descente comprise)'), cel(g), paC(+e.d.profMax), ppC(fond, r.pa, f), noaaC(fond), pctC(fond),
      cel(`${r.tab.d} m · ${r.tab.gps}${e.maj ? ` · +${e.maj}` : ''}`, eq), ''],
    [`${lettres[1]}-Remontée`, cel(`${n(e.d.profMax, 1)}→${premier}`), cel(n(rem.d, 2), `Durée = (${n(e.d.profMax, 1)} − ${premier}) / 15 = ${n(rem.d, 2)} min (15 m/min)`), cel(g), paC(+e.d.profMax), cel(n(rem.pp, 3), 'même PpO₂ qu’au fond'), noaaC(rem), pctC(rem), '', ''],
  ];
  if (r.paliers.length) {
    r.paliers.forEach((p, i) => out.push([`${lettres[2]}-Palier`, cel(String(p.z)), cel(String(p.t), `MN90 : ${p.tAir} min à ${p.z} m (au ${g})`), cel(g), paC(p.z), ppC(reste[i], 1 + p.z / 10, f), noaaC(reste[i]), pctC(reste[i]), '', '']));
    const s = reste[r.paliers.length], z = r.paliers[r.paliers.length - 1].z;
    out.push([`${lettres[3]}-Remontée`, cel(`${z}→0`), cel(n(s.d, 2), `Durée = ${z} / 6 = ${n(s.d, 2)} min (6 m/min)`), cel(g), paC(z), cel(n(s.pp, 3), 'PpO₂ du palier'), noaaC(s), pctC(s), '', '']);
  } else {
    out.push([`${lettres[2]}-Palier`, cel('—'), cel('0', 'pas de palier'), '', '', '', '', cel('0'), '', ''], [`${lettres[3]}-Remontée`, cel('—'), cel('0', `déjà comptée en ${lettres[1]}`), '', '', '', '', cel('0'), '', '']);
  }
  const reel = e.reel
    ? cel(n(e.reel.snc, 1), `Sur la courbe de la montre, point par point : %SNC ${n(e.reel.snc, 2)} % · OTU ${n(e.reel.otu, 1)} · PpO₂ max ${n(e.reel.ppMax, 2)} b`)
    : cel('—', 'Pas de courbe : le réel reprend le calcul du cours');
  out.push({ cls: 'tot', c: ['Total', '', '', '', '', '', '', cel(n(r.snc, 2), `%SNC = ${r.rows.map(x => n(x.sncP, 2)).join(' + ')} = ${n(r.snc, 2)} % · OTU ${n(r.otu, 1)}`), '', reel] });
  return out;
}

export async function oxygeneView({ date } = {}) {
  const diverId = await store.getActiveDiverId();
  const toutes = diverId ? await store.listDives(diverId) : [];
  const jours = joursDePlongee(toutes);
  if (!jours.length) return { title: 'Oxygène', node: el('div.empty', { text: 'Aucune plongée.' }), back: true };
  const jour = jours.includes(date) ? date : jours[0];
  const i = jours.indexOf(jour);
  const wrap = el('div.oxy');
  const detail = el('div.oxy-detail', { text: 'Touche une case du tableau : son calcul s’affiche ici.' });

  wrap.append(el('div.oxy-nav', {},
    el('button.btn.sm.ghost', { type: 'button', text: '‹', title: 'Jour précédent', disabled: i >= jours.length - 1, onclick: () => navigate(`oxygene/${jours[i + 1]}`, true) }),
    el('select.oxy-jour', { onchange: ev => navigate(`oxygene/${ev.target.value}`, true) },
      ...jours.map(j => el('option', { value: j, selected: j === jour, text: fmtDate(j) }))),
    el('button.btn.sm.ghost', { type: 'button', text: '›', title: 'Jour suivant', disabled: i <= 0, onclick: () => navigate(`oxygene/${jours[i - 1]}`, true) })));

  const corps = el('div', {}, el('div.hint', { text: 'Chargement des tables MN90…' }));
  wrap.append(corps, detail);

  chargerTables().then(() => {
    const j = journeeO2(toutes.filter(d => d.date === jour), window.MN90Lib, window.NitroxExamen);
    const lignes = [];
    const lettres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    let k = 0;
    j.plongees.forEach((e, idx) => {
      lignes.push({ cls: 'titre', titre: `Plongée ${idx + 1} · n°${e.d.numero ?? '—'} · ${e.d.heureImmersion} · ${e.d.lieuNom || e.d.site || ''}${e.fo2 ? ` · ${gazNom(e.fo2)}` : ''}`, id: e.d.id });
      if (e.err) { lignes.push({ cls: 'titre', titre: `⚠ ${e.err}` }); return; }
      if (e.interval != null) {
        const L = lettres[k++];
        lignes.push([`${L}-IntSurf`, '', cel(String(e.interval), hm(e.interval)), '', '', '', cel(n(e.coef.coef, 3), `${hm(e.interval)} → colonne ${hm(e.coef.col)} (inférieure) → coefficient ${n(e.coef.coef, 3)}`),
          cel(n(e.coursDepart, 2), `%SNC = ${n(e.coursAvant, 2)} × ${n(e.coef.coef, 3)} = ${n(e.coursDepart, 2)} % au départ`), e.gpsEtoile ? cel('GPS *', 'pas de successive avant 12 h') : '',
          cel(n(e.reelDepart, 1), `Réel : ${n(e.reelAvant, 2)} × 0,5^(${e.interval} / 90) = ${n(e.reelDepart, 2)} % (moitié toutes les 90 min)`)]);
      }
      lignes.push(...lignesPlongee(e, lettres.slice(k, k + 4)));
      k += 4;
      if (e.interval != null) lignes.push({ cls: 'tot', c: ['Cumul', '', '', '', '', '', '', cel(n(e.coursFin, 2), `${n(e.coursDepart, 2)} + ${n(e.r.snc, 2)} = ${n(e.coursFin, 2)} %`), '', cel(n(e.reelFin, 1), `${n(e.reelDepart, 2)} + ${n(e.reel?.snc ?? e.r.snc, 2)} = ${n(e.reelFin, 2)} %`)] });
    });
    const tete = ['', 'Prof', 'Durée', 'Gaz', 'Pa', 'PpO₂', 'NOAA', '%', 'EqAir', 'Réel'];
    const td = (c, cle) => {
      if (c == null || c === '') return el('td');
      if (typeof c === 'string') return el('td', { text: c });
      const t = el('td', { text: c.v });
      if (c.d) {
        t.classList.add('clic');
        t.onclick = () => { wrap.querySelectorAll('td.sel').forEach(x => x.classList.remove('sel')); t.classList.add('sel'); detail.textContent = c.d; detail.classList.add('on'); };
      }
      return t;
    };
    const table = el('table.oxy-tab', {},
      el('thead', {}, el('tr', {}, ...tete.map(h => el('th', { text: h })))),
      el('tbody', {}, ...lignes.map(l => {
        if (l.titre) return el('tr.oxy-titre', {}, el('td', { colSpan: tete.length }, l.id ? el('a', { href: `#/dive/${l.id}`, text: l.titre }) : el('span', { text: l.titre })));
        const cs = l.c || l;
        return el(`tr${l.cls ? '.' + l.cls : ''}`, {}, ...cs.map(td));
      })));
    const niveau = x => (x > 100 ? 'rouge' : x > 50 ? 'orange' : 'vert');
    corps.replaceChildren(
      el('div.oxy-bilan', {},
        el('div', { class: `oxy-chiffre ${niveau(j.cours)}` }, el('b', { text: `${n(j.cours, 1)} %` }), el('span', { text: '%SNC fin de journée · cours' })),
        el('div', { class: `oxy-chiffre ${niveau(j.reel)}` }, el('b', { text: `${n(j.reel, 1)} %` }), el('span', { text: '%SNC fin de journée · réel' })),
        el('div', { class: `oxy-chiffre ${j.otuCours > 850 ? 'rouge' : 'vert'}` }, el('b', { text: `${n(j.otuCours, 0)} / ${n(j.otuReel, 0)}` }), el('span', { text: 'OTU du jour · cours / réel (limite 850)' }))),
      el('div.oxy-scroll', {}, table),
      el('p.hint', { text: 'Cours : la profondeur max pendant toute la durée (profil carré), table MN90 à la PEA (ligne immédiatement supérieure), majoration des successives, paliers au mélange du fond (sans le palier de sécurité). Réel : la vraie courbe de la montre, point par point, avec la même table NOAA. C’est pour comprendre : ton ordinateur fait foi.' }));
  }).catch(err => corps.replaceChildren(el('div.empty', { text: err.message })));

  return { title: `Oxygène · ${fmtDate(jour)}`, node: wrap, back: true };
}
