// ============================================================
//  Joindre deux plongées en une seule
//
//  On plonge, on ne trouve pas le site, on remonte, 5-10 minutes de
//  bateau et on redescend : la montre enregistre deux plongées, mais
//  c'en est une. Comme en MN90 pour deux plongées « consécutives »
//  (moins de 15 min de surface) : la durée est la somme des deux temps
//  sous l'eau, la profondeur la plus grande des deux.
//
//  La fiche gardée est la première (son identifiant, sa place dans le
//  carnet) ; la courbe met les deux bout à bout, avec la surface entre
//  les deux ; les clés de la montre des deux restent, pour qu'un nouvel
//  import ne recrée pas la seconde.
//
//  Aucune dépendance : testé tel quel par outils/joindre-test.mjs.
// ============================================================

const LIEU = ['lieuNom', 'lieuDetail', 'lat', 'lng', 'site', 'eau', 'eauAuto', 'eauManuelle', 'indiceEau', 'altitude', 'lieuAuto'];
/** Des textes : mis l'un sous l'autre quand les deux disent quelque chose. */
const TEXTES = ['fait', 'vu', 'observations', 'objectifAutre'];
/** Calculés ici, pas repris de l'une ou de l'autre. */
const CALCULES = ['id', 'numero', 'createdAt', 'updatedAt', 'date', 'heureImmersion', 'heureSortie', 'dureeMin', 'profMax', 'profMoy',
  'samples', 'profil', 'suuntoKeys', 'suunto', 'tempFond', 'tempSurface', 'pressionDepart', 'pressionFin', 'parties',
  'palier3', 'palier6', 'palier9', 'palierSecu', 'palierSecuMin', 'paliersEstimes', 'note', 'repriseDe', 'pasDoublon', ...LIEU, ...TEXTES];

const plein = v => !(v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length));
const minutes = h => (/^\d\d:\d\d/.test(h || '') ? +h.slice(0, 2) * 60 + +h.slice(3, 5) : null);
const cleOcean = d => Number((d.suuntoKeys || []).find(k => /^ocean:\d+$/.test(k))?.slice(6)) || null;

/** Le début d'une plongée, en secondes (la clé de la montre, sinon date + heure). */
export function debutS(d) {
  const o = cleOcean(d);
  if (o) return o;
  const m = minutes(d.heureImmersion);
  if (!d.date || m == null) return null;
  return Date.UTC(+d.date.slice(0, 4), +d.date.slice(5, 7) - 1, +d.date.slice(8, 10)) / 1000 + m * 60;
}

/** La fin d'une plongée, en secondes (heure de sortie, sinon début + durée, sinon dernier point de la courbe). */
function finS(d) {
  const deb = debutS(d);
  if (deb == null) return null;
  const s = Array.isArray(d.samples) ? d.samples : [];
  if (s.length) return deb + (+s[s.length - 1].t || 0);
  if (+d.dureeMin) return deb + d.dureeMin * 60;
  return deb;
}

/** Les deux plongées dans l'ordre, et la surface entre elles (minutes, ou null si inconnue). */
export function ordreEtSurface(a, b) {
  const [p, q] = (debutS(a) ?? 0) <= (debutS(b) ?? 0) ? [a, b] : [b, a];
  const f = finS(p), d = debutS(q);
  return { premiere: p, seconde: q, surfaceMin: f != null && d != null ? Math.max(0, Math.round((d - f) / 60)) : null };
}

/**
 * Deux plongées → une seule (la première garde son identifiant).
 * @param {object} a
 * @param {object} b
 * @param {{lieu?: 'premiere'|'seconde'}} options  le lieu à garder (par défaut : la seconde, le vrai site)
 * @returns {object} la fiche jointe
 */
export function joindrePlongees(a, b, { lieu = 'seconde' } = {}) {
  const { premiere: p, seconde: q, surfaceMin } = ordreEtSurface(a, b);
  const f = structuredClone(p);

  // Les heures et la durée : MN90, plongées consécutives → la somme des temps sous l'eau
  f.heureImmersion = p.heureImmersion || q.heureImmersion || '';
  f.heureSortie = q.heureSortie || p.heureSortie || '';
  const duree = x => +x.dureeMin || (Array.isArray(x.samples) && x.samples.length ? Math.round(+x.samples[x.samples.length - 1].t / 60) : 0);
  f.dureeMin = (duree(p) + duree(q)) || null;
  // La sortie suit : l'appli garde toujours durée = sortie − immersion
  const m0 = minutes(f.heureImmersion);
  if (m0 != null && f.dureeMin) { const m = (m0 + f.dureeMin) % 1440; f.heureSortie = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
  f.profMax = Math.max(+p.profMax || 0, +q.profMax || 0) || null;
  const moy = [p, q].filter(x => +x.profMoy && duree(x));
  f.profMoy = moy.length ? Math.round(moy.reduce((s, x) => s + x.profMoy * duree(x), 0) / moy.reduce((s, x) => s + duree(x), 0) * 10) / 10 : (p.profMoy ?? q.profMoy ?? null);
  const temps = [p.tempFond, q.tempFond].filter(v => v != null && v !== '').map(Number);
  f.tempFond = temps.length ? Math.min(...temps) : null;
  f.tempSurface = p.tempSurface ?? q.tempSurface ?? null;

  // Le même bloc : la pression du début de la première, de la fin de la seconde
  f.pressionDepart = plein(p.pressionDepart) ? p.pressionDepart : q.pressionDepart ?? null;
  f.pressionFin = plein(q.pressionFin) ? q.pressionFin : p.pressionFin ?? null;

  // La courbe : bout à bout, la surface entre les deux
  const sp = Array.isArray(p.samples) ? p.samples : [], sq = Array.isArray(q.samples) ? q.samples : [];
  if (sp.length && sq.length) {
    const finP = +sp[sp.length - 1].t || 0;
    const dp = debutS(p), dq = debutS(q);
    const decalage = dp != null && dq != null ? Math.max(finP + 20 + Math.round((+sp[sp.length - 1].d || 0) * 6), dq - dp) : finP + (surfaceMin ?? 5) * 60;
    const dernier = sp[sp.length - 1];
    const surface = t => ({ t, d: 0, ...(dernier.temp != null ? { temp: dernier.temp } : {}), ...(dernier.pression != null ? { pression: dernier.pression } : {}) });
    // Pas de remontée éclair inventée : 10 m/min jusqu'à la surface
    const remontee = Math.max(10, Math.round((+dernier.d || 0) / 10 * 60));
    const pts = [surface(finP + remontee)];
    if (decalage - 10 > finP + remontee) pts.push(surface(decalage - 10));
    f.samples = [...sp.map(x => ({ ...x })), ...pts, ...sq.map(x => ({ ...x, t: +x.t + decalage }))];
  } else if (sq.length && !sp.length) {
    f.samples = structuredClone(sq);
  }
  delete f.profil;
  if (!f.samples?.length && (p.profil || q.profil)) f.profil = structuredClone(p.profil || q.profil);

  // Les paliers : ceux de la fin de la plongée (la seconde)
  for (const k of ['palier3', 'palier6', 'palier9', 'palierSecu', 'palierSecuMin', 'paliersEstimes']) if (k in q) f[k] = q[k];

  // La montre : les clés des deux (un nouvel import ne recrée pas la seconde)
  f.suuntoKeys = [...new Set([...(p.suuntoKeys || []), ...(q.suuntoKeys || [])])];
  if (!f.suunto && q.suunto) f.suunto = structuredClone(q.suunto);
  const partie = x => ({ heureImmersion: x.heureImmersion || '', heureSortie: x.heureSortie || '', dureeMin: duree(x) || null, profMax: +x.profMax || null });
  f.parties = [...(p.parties || [partie(p)]), ...(q.parties || [partie(q)])];
  f.parties[(p.parties || [0]).length].surfaceAvantMin = surfaceMin;

  // Le lieu : celui choisi
  let src = lieu === 'premiere' ? p : q;
  const autre = src === p ? q : p;
  if (!plein(src.lieuNom) && src.lat == null && (plein(autre.lieuNom) || autre.lat != null)) src = autre;
  for (const k of LIEU) { if (k in src) f[k] = structuredClone(src[k]); else delete f[k]; }

  // Les textes : l'un sous l'autre
  for (const k of TEXTES) {
    const x = String(p[k] || '').trim(), y = String(q[k] || '').trim();
    f[k] = x && y && x !== y ? `${x}\n${y}` : x || y;
  }
  // La note : la meilleure des deux dit le souvenir
  const notes = [p.note, q.note].filter(v => v != null && v !== '').map(Number);
  f.note = notes.length ? Math.max(...notes) : null;

  // Le reste : les listes s'additionnent, une valeur vide prend celle de l'autre
  for (const k of Object.keys(q)) {
    if (CALCULES.includes(k)) continue;
    const v = q[k];
    if (Array.isArray(v) && Array.isArray(f[k])) {
      const vus = new Set(f[k].map(x => JSON.stringify(x)));
      f[k] = [...f[k], ...v.filter(x => !vus.has(JSON.stringify(x)))];
    } else if (!plein(f[k]) && plein(v)) f[k] = structuredClone(v);
    else if (v && typeof v === 'object' && !Array.isArray(v) && f[k] && typeof f[k] === 'object' && !Array.isArray(f[k])) {
      f[k] = { ...structuredClone(v), ...f[k] };
    }
  }

  // Plus de « pas un doublon » qui viserait la seconde
  if (f.pasDoublon) { f.pasDoublon = f.pasDoublon.filter(id => id !== q.id); if (!f.pasDoublon.length) delete f.pasDoublon; }
  return f;
}

/** Un résumé de la fiche jointe, pour la confirmation. */
export function resumeJointe(a, b) {
  const { premiere: p, seconde: q, surfaceMin } = ordreEtSurface(a, b);
  const f = joindrePlongees(p, q);
  return { premiere: p, seconde: q, surfaceMin, heureImmersion: f.heureImmersion, heureSortie: f.heureSortie, dureeMin: f.dureeMin, profMax: f.profMax };
}
