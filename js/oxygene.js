// ============================================================
//  L'oxygène d'une journée de plongée, comme au cours Nitrox
//  Confirmé : le tableau par étape (fond, remontée, palier,
//  remontée surface), l'intervalle, la majoration MN90 de la
//  suivante… et, à côté, le même %SNC et les mêmes OTU calculés
//  sur la vraie courbe de la montre.
//
//  Les tables (MN90, Tableaux I et II, NOAA, OTU) viennent de MN90
//  Mobile (shared/mn90.js et nitrox/examen.js), passées en
//  paramètres : ce module ne charge rien, testé par
//  outils/oxygene-test.mjs.
// ============================================================

const minutes = h => (/^\d\d:\d\d/.test(h || '') ? +h.slice(0, 2) * 60 + +h.slice(3, 5) : null);

/** Le % d'O₂ respiré (0,21 à l'air), null si on ne sait pas (trimix, recycleur). */
export function fo2De(d) {
  if (d.gazType === 'nitrox') return +d.gazO2 > 0 ? +d.gazO2 / 100 : null;
  if (d.gazType === 'trimix' || d.gazType === 'recycleur') return null;
  return 0.21;
}

/** Les jours où il y a des plongées (AAAA-MM-JJ, du plus récent au plus ancien). */
export function joursDePlongee(dives) {
  return [...new Set(dives.filter(d => d.date && !d.seance).map(d => d.date))].sort().reverse();
}

/**
 * Le %SNC et les OTU sur la vraie courbe : à chaque point, la PpO₂ à la
 * profondeur moyenne du segment, lue dans la table du cours (colonne
 * immédiatement supérieure, rien sous 0,6 b).
 * @returns {{snc:number, otu:number, ppMax:number}|null}
 */
export function reelO2(d, fo2, lire) {
  const s = Array.isArray(d.samples) ? d.samples.filter(p => p && p.t != null && p.d != null) : [];
  if (s.length < 2) return null;
  let snc = 0, otu = 0, ppMax = 0;
  for (let i = 1; i < s.length; i++) {
    const dt = (+s[i].t - +s[i - 1].t) / 60;
    if (!(dt > 0) || dt > 10) continue;                  // trou dans l'enregistrement
    const z = Math.max(0, (+s[i].d + +s[i - 1].d) / 2);
    const pp = (1 + z / 10) * fo2;
    ppMax = Math.max(ppMax, pp);
    const r = lire(pp);
    snc += r.snc * dt;
    otu += r.otu * dt;
  }
  return { snc, otu, ppMax };
}

/**
 * La journée : chaque plongée lue comme au cours (profondeur max pendant
 * toute la durée, table MN90 à la PEA, majoration des successives,
 * paliers au mélange du fond), et sur la vraie courbe.
 * @param {object[]} dives  les plongées du jour
 * @param {object} lib  window.MN90Lib
 * @param {object} ex   window.NitroxExamen
 */
export function journeeO2(dives, lib, ex) {
  const liste = dives.filter(d => !d.seance && +d.profMax > 0 && +d.dureeMin > 0 && minutes(d.heureImmersion) != null)
    .sort((a, b) => minutes(a.heureImmersion) - minutes(b.heureImmersion));
  const out = [];
  let cours = 0, reel = 0, gps = null, fin = null, otuCours = 0, otuReel = 0;
  for (const d of liste) {
    const fo2 = fo2De(d);
    const e = { d, fo2, interval: null };
    if (fo2 == null) { e.err = 'Mélange inconnu (trimix ou % d’O₂ non noté)'; out.push(e); continue; }
    const debut = minutes(d.heureImmersion);
    if (fin != null) e.interval = Math.max(0, debut - fin);
    // Majoration de la successive : Tableau I (GPS × intervalle, colonne inférieure), Tableau II (azote, PEA du dessus)
    let maj = 0;
    const p = 1 + d.profMax / 10, pea = fo2 <= 0.21 + 1e-9 ? +d.profMax : (p * (1 - fo2) / 0.8 - 1) * 10;
    if (e.interval != null && gps && gps !== '*' && e.interval < 720) {
      let k = -1;
      lib.T1_COLS.forEach((c, i) => { if (c <= e.interval) k = i; });
      if (k < 0) { k = 0; e.consecutive = true; }       // moins de 15 min : on lit la 1re colonne (prudent)
      const n2 = k < (lib.TABLE_I[gps] || []).length ? lib.TABLE_I[gps][k] : null;
      e.t1 = { gps, col: lib.T1_COLS[k], n2 };
      if (n2 != null && n2 > 0.81 + 1e-9) {
        const row = lib.TABLE_II.find(x => x[0] >= n2 - 1e-9) || lib.TABLE_II[lib.TABLE_II.length - 1];
        const di = lib.T2_DEPTHS.findIndex(z => z >= pea - 1e-9);
        if (di >= 0) { maj = row[1 + di]; e.t2 = { ligne: row[0], col: lib.T2_DEPTHS[di], maj }; }
      }
    } else if (e.interval != null && gps === '*') e.gpsEtoile = true;
    e.maj = maj;
    e.r = ex.plongee({ prof: +d.profMax, duree: +d.dureeMin, fo2, o2: false }, { fictive: +d.dureeMin + maj });
    if (e.r.err) { e.err = e.r.err; out.push(e); gps = null; fin = debut + +d.dureeMin; continue; }
    // L'intervalle : le %SNC diminue (coefficient du cours, colonne inférieure ; réel : moitié toutes les 90 min)
    if (e.interval != null) {
      e.coef = ex.coefIntervalle(e.interval);
      e.coursAvant = cours; e.reelAvant = reel;
      cours *= e.coef.coef;
      reel *= Math.pow(0.5, e.interval / 90);
    }
    e.coursDepart = cours; e.reelDepart = reel;
    e.reel = reelO2(d, fo2, ex.lire);
    cours += e.r.snc;
    reel += e.reel ? e.reel.snc : e.r.snc;
    otuCours += e.r.otu;
    otuReel += e.reel ? e.reel.otu : e.r.otu;
    e.coursFin = cours; e.reelFin = reel;
    gps = e.r.tab.gps;
    fin = minutes(d.heureSortie) ?? debut + +d.dureeMin;
    out.push(e);
  }
  return { plongees: out, cours, reel, otuCours, otuReel };
}
