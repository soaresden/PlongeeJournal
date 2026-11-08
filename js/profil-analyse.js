// ============================================================
//  Ce que dit le profil enregistré par l'ordinateur
//
//  Le profil (un point toutes les ~10 s : profondeur, température,
//  pression du bloc, cœur, temps sans palier, plafond) contient bien
//  plus que la durée et la profondeur max : consommation réelle,
//  vitesse de remontée, palier de sécurité, thermocline… Tout est
//  calculé ici, rien n'est stocké. Pur : testable sans navigateur.
// ============================================================

/** Sous l'eau, pour l'ordinateur : au-delà de 1,2 m (convention Suunto). */
export const SOUS_L_EAU = 1.2;

const arrondi = (v, n = 1) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** n) / 10 ** n);
const nombre = v => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Les points valables, triés par temps. */
export function pointsValables(samples) {
  return (samples || [])
    .filter(p => p && Number.isFinite(p.t) && Number.isFinite(p.d))
    .sort((a, b) => a.t - b.t);
}

/** Litres d'un bloc (un bi compte double). */
function volumeBloc(dive) {
  const v = nombre(dive?.blocLitres);
  if (!v) return null;
  return /bi/i.test(dive?.blocType || '') ? v * 2 : v;
}

/**
 * Consommation tout au long de la plongée, ramenée à la surface (L/min),
 * sur une fenêtre glissante. C'est la « courbe de consommation ».
 * @returns {Array<{t, sac}>}
 */
export function courbeConsommation(samples, litres, { fenetreS = 180 } = {}) {
  const pts = pointsValables(samples).filter(p => p.d >= SOUS_L_EAU && Number.isFinite(p.pression));
  if (!litres || pts.length < 4) return [];
  const out = [];
  let j = 0;
  for (let i = 0; i < pts.length; i++) {
    while (j < i && pts[i].t - pts[j].t > fenetreS) j++;
    const a = pts[j], b = pts[i];
    const dt = b.t - a.t;
    if (dt < fenetreS * 0.6) continue;
    let amb = 0;
    for (let k = j + 1; k <= i; k++) {
      const pas = pts[k].t - pts[k - 1].t;
      if (pas > 0 && pas <= 120) amb += pas * (1 + (pts[k].d + pts[k - 1].d) / 20);
    }
    const bar = a.pression - b.pression;
    if (amb <= 0 || bar < 0) continue;
    out.push({ t: Math.round((a.t + b.t) / 2), sac: arrondi((bar * litres) / (amb / 60), 1) });
  }
  return out;
}

/**
 * L'analyse complète.
 * @param {Array} samples
 * @param {object} dive  pour le volume du bloc (blocLitres, blocType)
 * @returns {object|null}
 */
export function analyserProfil(samples, dive = {}) {
  const pts = pointsValables(samples);
  if (pts.length < 3) return null;
  const dessous = pts.filter(p => p.d >= SOUS_L_EAU);
  if (!dessous.length) return null;

  // Temps réellement passé sous l'eau : un retour en surface (attente du
  // bateau, palier fini au mouillage) ne compte pas.
  let sousLEau = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].t - pts[i - 1].t;
    if (dt > 0 && dt <= 120 && pts[i].d >= SOUS_L_EAU && pts[i - 1].d >= SOUS_L_EAU) sousLEau += dt;
  }
  const res = {
    points: pts.length,
    dureeS: sousLEau,
    profMax: arrondi(Math.max(...dessous.map(p => p.d))),
  };

  // Profondeur moyenne pondérée par le temps (les points ne sont pas
  // toujours réguliers).
  let somme = 0, temps = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dt = b.t - a.t;
    if (dt <= 0 || dt > 120 || a.d < SOUS_L_EAU || b.d < SOUS_L_EAU) continue;
    somme += dt * (a.d + b.d) / 2; temps += dt;
  }
  res.profMoy = temps ? arrondi(somme / temps) : null;

  // --- Température ---
  const temps_ = dessous.filter(p => Number.isFinite(p.temp));
  if (temps_.length) {
    const t = temps_.map(p => p.temp);
    res.temp = {
      min: arrondi(Math.min(...t)), max: arrondi(Math.max(...t)),
      moy: arrondi(t.reduce((a, b) => a + b, 0) / t.length),
    };
    // Thermocline : là où la température change le plus vite avec la
    // profondeur, si l'écart vaut la peine d'en parler (3 °C et plus).
    if (res.temp.max - res.temp.min >= 3) {
      const descente = [];
      for (const p of temps_) { descente.push(p); if (p.d >= res.profMax - 0.5) break; }
      let meilleur = null;
      for (let i = 1; i < descente.length; i++) {
        const dd = descente[i].d - descente[i - 1].d;
        if (dd < 0.5) continue;
        const g = (descente[i - 1].temp - descente[i].temp) / dd;
        if (!meilleur || g > meilleur.g) meilleur = { g, d: (descente[i].d + descente[i - 1].d) / 2 };
      }
      if (meilleur && meilleur.g > 0.15) res.temp.thermocline = Math.round(meilleur.d);
    }
  }

  // --- Bouteille ---
  const press = dessous.filter(p => Number.isFinite(p.pression) && p.pression > 0);
  if (press.length >= 2) {
    const debut = Math.max(...pts.filter(p => Number.isFinite(p.pression)).slice(0, 6).map(p => p.pression));
    const fin = press.at(-1).pression;
    const finSurface = pts.filter(p => Number.isFinite(p.pression)).at(-1).pression;
    res.bloc = { debut: Math.round(debut), fin: Math.round(Math.min(fin, finSurface)), consommeBar: Math.round(debut - Math.min(fin, finSurface)) };
    const seuil = bar => { const p = press.find(x => x.pression <= bar); return p ? Math.round((p.t - dessous[0].t) / 60) : null; };
    res.bloc.a100 = seuil(100);
    res.bloc.a50 = seuil(50);
    const litres = volumeBloc(dive);
    if (litres) {
      // Gaz réellement respiré sous l'eau, et pression ambiante
      // intégrée sur le même intervalle : le vrai SAC, pas une moyenne.
      let amb = 0, bar = 0, duree = 0;
      for (let i = 1; i < press.length; i++) {
        const dt = press[i].t - press[i - 1].t;
        if (dt <= 0 || dt > 120) continue;
        amb += dt * (1 + (press[i].d + press[i - 1].d) / 20);
        bar += press[i - 1].pression - press[i].pression;
        duree += dt;
      }
      res.bloc.litres = Math.round(res.bloc.consommeBar * litres);
      if (amb > 0 && bar > 0) {
        res.bloc.sac = arrondi((bar * litres) / (amb / 60), 1);
        res.bloc.fond = arrondi((bar * litres) / (duree / 60), 1);
      }
      res.conso = courbeConsommation(pts, litres);
    }
  }

  // --- Remontée : vitesse sur 30 s glissantes, sous 3 m ---
  let vmax = 0, rapides = 0, dernierRapide = -Infinity;
  for (let i = 0, j = 0; i < pts.length; i++) {
    while (j < pts.length && pts[j].t - pts[i].t < 30) j++;
    if (j >= pts.length) break;
    const a = pts[i], b = pts[j];
    if (a.d < 3) continue;
    const v = (a.d - b.d) / ((b.t - a.t) / 60);
    if (v > vmax) vmax = v;
    if (v > 12 && a.t - dernierRapide > 60) { rapides++; dernierRapide = a.t; }
  }
  res.remontee = { max: arrondi(vmax), rapides };

  // --- Paliers ---
  const avecPlafond = pts.some(p => p.plafond != null);
  const plafondMax = Math.max(0, ...pts.map(p => Number(p.plafond) || 0));
  res.deco = avecPlafond ? plafondMax > 0 : null;
  if (res.deco) {
    let s = 0;
    for (let i = 1; i < pts.length; i++) {
      const dt = pts[i].t - pts[i - 1].t;
      if (dt > 0 && dt <= 120 && (Number(pts[i].plafond) || 0) > 0) s += dt;
    }
    res.tempsDecoMin = Math.round(s / 60);
    res.plafondMax = arrondi(plafondMax);
  }
  // Palier de sécurité : le plus long séjour entre 2,5 et 6,5 m après le
  // point le plus profond (les petits écarts de houle sont tolérés).
  const iMax = pts.reduce((m, p, i) => (p.d > pts[m].d ? i : m), 0);
  let meilleur = 0, courant = 0;
  for (let i = iMax + 1; i < pts.length; i++) {
    const dt = pts[i].t - pts[i - 1].t;
    if (pts[i].d >= 2.5 && pts[i].d <= 6.5 && dt <= 60) { courant += dt; meilleur = Math.max(meilleur, courant); }
    else if (pts[i].d < 2 || pts[i].d > 7.5) courant = 0;
  }
  res.palierSecuMin = meilleur >= 120 ? Math.round(meilleur / 60) : 0;

  // --- Temps sans palier, cœur ---
  const ndl = dessous.map(p => p.sansPalier).filter(v => Number.isFinite(v) && v > 0 && v < 99);
  if (ndl.length) res.ndlMin = Math.min(...ndl);
  const fc = dessous.map(p => p.fc).filter(v => Number.isFinite(v) && v > 30);
  if (fc.length) res.fc = { moy: Math.round(fc.reduce((a, b) => a + b, 0) / fc.length), max: Math.max(...fc) };

  return res;
}

/**
 * Paliers à reporter sur la fiche, d'après le profil : quand la montre
 * donne son plafond et qu'il n'a jamais été franchi, il n'y a eu AUCUN
 * palier de décompression — le séjour à 3-5 m est un palier de sécurité.
 * @returns {object|null} patch { palier3, palier6, palier9, palierSecu, palierSecuMin } ou null (on ne sait pas)
 */
export function paliersDuProfil(samples) {
  const a = analyserProfil(samples);
  if (!a || a.deco !== false) return null;
  return {
    palier3: null, palier6: null, palier9: null,
    palierSecu: a.palierSecuMin > 0,
    palierSecuMin: a.palierSecuMin || 3,
  };
}
