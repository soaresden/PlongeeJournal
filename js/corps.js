// ============================================================
//  Le corps du plongeur : l'azote et l'oxygène, sur 7 jours glissants
//
//  Modèle Bühlmann ZHL-16C (le même que l'outil « Saturation » de MN90) :
//  16 compartiments (tissus) qui se chargent en azote au fond et se
//  vident en surface, calculés sur les vrais profils des plongées
//  (profondeur toutes les 10 s) et leur mélange (air ou nitrox).
//  Oxygène : CNS % (tables NOAA, demi-vie 90 min en surface) et OTU.
//
//  C'est une estimation pour comprendre et anticiper : l'ordinateur de
//  plongée fait foi.
// ============================================================

// ZHL-16C, azote : [période (min), a (bar), b]
export const ZHL16C = [[5.0, 1.1696, 0.5578], [8.0, 1.0, 0.6514], [12.5, 0.8618, 0.7222], [18.5, 0.7562, 0.7825],
  [27.0, 0.62, 0.8126], [38.3, 0.5043, 0.8434], [54.3, 0.441, 0.8693], [77.0, 0.4, 0.891],
  [109.0, 0.375, 0.9092], [146.0, 0.35, 0.9222], [187.0, 0.3295, 0.9319], [239.0, 0.3065, 0.9403],
  [305.0, 0.2835, 0.9477], [390.0, 0.261, 0.9544], [498.0, 0.248, 0.9602], [635.0, 0.2327, 0.9653]];
const K = ZHL16C.map(c => Math.LN2 / c[0]);
const PH2O = 0.0627;                                   // vapeur d'eau alvéolaire (bar)
const AIR_N2 = 0.79;
export const EQUILIBRE = (1 - PH2O) * AIR_N2;          // tension d'azote d'un tissu « à zéro » en surface
const M0 = ZHL16C.map(([, a, b]) => a + 1 / b);       // M-value en surface (1 bar)

const H = 3600e3, MIN = 60e3;
const pAmb = (d, douce) => 1 + Math.max(0, d) / (douce ? 10.3 : 10);
const inspire = (p, fn2) => Math.max(0, p - PH2O) * fn2;

/** Équation de Schreiner : la profondeur va de p0 à p1 (pressions) en dt minutes. */
function charger(T, p0, p1, dt, fn2) {
  if (dt <= 0) return;
  const i0 = inspire(p0, fn2), R = (inspire(p1, fn2) - i0) / dt;
  for (let i = 0; i < T.length; i++) {
    const k = K[i];
    T[i] = i0 + R * (dt - 1 / k) - (i0 - T[i] - R / k) * Math.exp(-k * dt);
  }
}

/**
 * Charge en azote d'un compartiment, en % de sa marge en surface : 0 % = le
 * tissu est revenu à l'équilibre (rien en trop), 100 % = il touche sa limite
 * (M-value) si l'on est en surface. L'azote en trop qui reste des heures
 * après la plongée (tissus lents) se voit ici.
 */
export const saturation = (Ti, i) => Math.max(0, (Ti - EQUILIBRE) / (M0[i] - EQUILIBRE) * 100);
const sat = T => T.reduce((m, Ti, i) => { const s = saturation(Ti, i); return s > m.v ? { v: s, i } : m; }, { v: 0, i: 0 });

// CNS : limites d'exposition NOAA (minutes) selon la PpO2
const NOAA = [[0.6, 720], [0.7, 570], [0.8, 450], [0.9, 360], [1.0, 300], [1.1, 240], [1.2, 210], [1.3, 180], [1.4, 150], [1.5, 120], [1.6, 45]];
function limiteCns(ppo2) {
  if (ppo2 <= 0.5) return Infinity;
  if (ppo2 <= 0.6) return 720;
  for (let j = 1; j < NOAA.length; j++) {
    const [p0, l0] = NOAA[j - 1], [p1, l1] = NOAA[j];
    if (ppo2 <= p1) return l0 + (l1 - l0) * (ppo2 - p0) / (p1 - p0);
  }
  return 45 * Math.pow(0.5, (ppo2 - 1.6) / 0.05);     // au-delà de 1,6 : très vite
}
const otu = (ppo2, dt) => (ppo2 > 0.5 ? dt * Math.pow((ppo2 - 0.5) / 0.5, 0.833) : 0);

/** Début d'une plongée (ms), heure locale. */
export function debutPlongee(d) {
  const h = /^\d\d?:\d\d/.test(d.heureImmersion || '') ? d.heureImmersion : (/^\d\d?:\d\d/.test(d.heure || '') ? d.heure : '10:00');
  const t = new Date(`${d.date}T${h.padStart(5, '0')}:00`).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Le profil d'une plongée : [[secondes, profondeur]] ; sans courbe, un profil carré estimé. */
export function profilDe(d) {
  const s = Array.isArray(d.samples) ? d.samples.filter(x => Number.isFinite(+x.t) && Number.isFinite(+x.d)) : [];
  if (s.length > 3) {
    const p = s.map(x => [+x.t, Math.max(0, +x.d)]);
    if (p[0][0] > 0 || p[0][1] > 0.5) p.unshift([0, 0]);
    const fin = p[p.length - 1];
    if (fin[1] > 0.3) p.push([fin[0] + fin[1] / 10 * 60, 0]);
    return { points: p, estime: false };
  }
  const prof = +d.profMoy || (+d.profMax ? +d.profMax * 0.75 : 0), duree = +d.dureeMin || 0;
  if (!prof || !duree) return null;
  const desc = prof / 20 * 60, montee = prof / 10 * 60, fond = Math.max(0, duree * 60 - desc - montee);
  return { points: [[0, 0], [desc, prof], [desc + fond, prof], [desc + fond + montee, 0]], estime: true };
}

const fo2De = d => {
  const o2 = +d.gazO2;
  return (d.gazType === 'nitrox' || o2) && o2 >= 21 && o2 <= 100 ? o2 / 100 : 0.21;
};
const decoDe = d => (Array.isArray(d.samples) && d.samples.some(x => +x.plafond > 0)) || [d.palier3, d.palier6, d.palier9].some(v => +v > 0);

/**
 * Tout le calcul sur la période [maintenant − jours, maintenant].
 * @param {Array} dives  les plongées du carnet
 * @returns {{
 *   serie: Array<{t, sat, comp, prof}>,  // saturation max (%) et compartiment, profondeur (0 en surface)
 *   plongees: Array<{d, debut, fin, pic, estime, deco, fo2}>,
 *   maintenant: {T:number[], sat, comp, cns, otu24, otu7, desatH, avion:{jusqua, regle}},
 *   rythme: {sur24h, joursDAffilee, total}
 * }}
 */
export function bilanCorps(dives, { maintenant = Date.now(), jours = 7 } = {}) {
  const debutFenetre = maintenant - jours * 24 * H;
  // Les plongées des 2 jours d'avant comptent encore au début de la fenêtre
  const avant = debutFenetre - 48 * H;
  const liste = dives.map(d => ({ d, debut: debutPlongee(d), profil: profilDe(d) }))
    .filter(x => x.debut && x.profil && x.debut >= avant && x.debut <= maintenant)
    .sort((a, b) => a.debut - b.debut);

  const T = ZHL16C.map(() => EQUILIBRE);
  let t = avant, cns = 0;
  const serie = [], plongees = [], otus = [];
  const noter = (tt, prof) => { if (tt >= debutFenetre) { const s = sat(T); serie.push({ t: tt, sat: s.v, comp: s.i, prof }); } };
  // La surface entre deux plongées : on respire de l'air à 1 bar, les tissus se vident
  const surface = jusqua => {
    while (t < jusqua) {
      const pas = Math.min(10 * MIN, jusqua - t);
      charger(T, 1, 1, pas / MIN, AIR_N2);
      cns *= Math.pow(0.5, pas / MIN / 90);
      t += pas;
      noter(t, 0);
    }
  };

  for (const x of liste) {
    surface(Math.max(t, x.debut));
    const fo2 = fo2De(x.d), fn2 = 1 - fo2, douce = x.d.eau === 'douce';
    const pts = x.profil.points;
    let pic = 0, otuPlongee = 0;
    for (let j = 1; j < pts.length; j++) {
      const [t0, d0] = pts[j - 1], [t1, d1] = pts[j];
      const dt = (t1 - t0) / 60;
      if (dt <= 0) continue;
      charger(T, pAmb(d0, douce), pAmb(d1, douce), dt, fn2);
      const ppo2 = pAmb((d0 + d1) / 2, douce) * fo2;
      cns += dt / limiteCns(ppo2) * 100;
      otuPlongee += otu(ppo2, dt);
      pic = Math.max(pic, sat(T).v);
      noter(x.debut + t1 * 1000, d1);
    }
    const finAvant = plongees.length ? plongees[plongees.length - 1].fin : null;
    t = x.debut + pts[pts.length - 1][0] * 1000;
    otus.push({ t, otu: otuPlongee });
    plongees.push({ d: x.d, debut: x.debut, fin: t, pic, estime: x.profil.estime, deco: decoDe(x.d), fo2, cns,
      vmax: x.profil.estime ? null : vitesseMontee(pts), intervalle: finAvant != null ? x.debut - finAvant : null,
      prof: Math.max(...pts.map(q => q[1])) });
  }
  surface(maintenant);

  // Désaturation : chaque compartiment redescend sous 5 % de charge
  const desatMin = Math.max(0, ...T.map((Ti, i) => {
    const exces = Ti - EQUILIBRE, seuil = 0.05 * (M0[i] - EQUILIBRE);
    return exces > seuil ? Math.log(exces / seuil) / K[i] : 0;
  }));

  // Avion (recommandations DAN) : 12 h après une plongée, 18 h après des plongées
  // successives ou plusieurs jours, 24 h après une plongée avec paliers obligatoires.
  const derniere = plongees[plongees.length - 1];
  let avion = null;
  if (derniere) {
    const recentes = plongees.filter(p => p.fin > derniere.fin - 48 * H);
    const regle = recentes.some(p => p.deco) ? 24 : recentes.length > 1 ? 18 : 12;
    const jusqua = derniere.fin + regle * H;
    avion = { jusqua, regle, attente: Math.max(0, jusqua - maintenant) };
  }

  // Le rythme : plongées sur 24 h, jours d'affilée avec des plongées
  const fenetre = plongees.filter(p => p.debut >= debutFenetre);
  const jourDe = ms => new Date(ms).toISOString().slice(0, 10);
  const joursPlonges = new Set(fenetre.map(p => p.d.date || jourDe(p.debut)));
  let joursDAffilee = 0;
  for (let j = 0; j < jours; j++) {
    const jour = new Date(maintenant - j * 24 * H);
    const cle = `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(jour.getDate()).padStart(2, '0')}`;
    if (joursPlonges.has(cle)) joursDAffilee++;
    else if (j > 0 || joursDAffilee) break;   // aujourd'hui sans plongée : on compte à partir d'hier
  }

  const s = sat(T);
  return {
    serie, plongees: fenetre,
    maintenant: {
      T: T.slice(), sat: s.v, comp: s.i, cns,
      otu24: otus.filter(o => o.t > maintenant - 24 * H).reduce((a, o) => a + o.otu, 0),
      otu7: otus.filter(o => o.t > debutFenetre).reduce((a, o) => a + o.otu, 0),
      desatH: desatMin / 60, avion,
    },
    rythme: { sur24h: plongees.filter(p => p.fin > maintenant - 24 * H).length, joursDAffilee, total: fenetre.length },
    debut: debutFenetre, fin: maintenant,
  };
}

/** Vitesse de remontée la plus forte (m/min), sur des fenêtres de 30 s, sous 3 m (la sortie ne compte pas). */
function vitesseMontee(pts) {
  let v = 0;
  for (let j = 0, k = 0; j < pts.length; j++) {
    while (k < pts.length && pts[k][0] - pts[j][0] < 30) k++;
    if (k >= pts.length) break;
    const [t0, d0] = pts[j], [t1, d1] = pts[k];
    if (d1 > 3 && d0 > d1) v = Math.max(v, (d0 - d1) / ((t1 - t0) / 60));
  }
  return v;
}

/** Le temps (h) pour que tous les compartiments redescendent sous un seuil de charge (%). */
export function heuresAvant(T, seuil) {
  return Math.max(0, ...T.map((Ti, i) => {
    const exces = Ti - EQUILIBRE, cible = seuil / 100 * (M0[i] - EQUILIBRE);
    return exces > cible ? Math.log(exces / cible) / K[i] : 0;
  })) / 60;
}

/**
 * L'assistant : un verdict (« tu es safe », « attention », « pas de plongée
 * pour l'instant ») et ses raisons, lus dans le bilan.
 * @returns {{niveau:'ok'|'attention'|'stop', titre:string, points:Array<{niveau, texte}>}}
 */
export function conseils(b, { maintenant = b.fin } = {}) {
  const m = b.maintenant, r = b.rythme, pts = [];
  const h = x => (x >= 1 ? `${Math.round(x)} h` : `${Math.max(1, Math.round(x * 60))} min`);
  const jour = ms => new Date(ms).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' });
  const dit = (niveau, texte) => pts.push({ niveau, texte });
  const recentes = b.plongees.filter(p => p.fin > maintenant - 48 * 36e5);

  // L'azote en réserve, et la prochaine plongée
  if (m.sat >= 50) dit('stop', `Tes tissus sont encore très chargés (${Math.round(m.sat)} %) : pas de nouvelle plongée tout de suite. Sous 20 % dans ~${h(heuresAvant(m.T, 20))}.`);
  else if (m.sat >= 20) dit('attention', `Tu as encore de l’azote en réserve (${Math.round(m.sat)} %). Si tu replonges, fais plus court et moins profond, ou attends ~${h(heuresAvant(m.T, 20))} pour repasser sous 20 %.`);
  else if (m.sat >= 5) dit('ok', `Il te reste un peu d’azote (${Math.round(m.sat)} %) : une plongée raisonnable est possible. Désaturation complète dans ~${h(m.desatH)}.`);
  else if (b.plongees.length) dit('ok', 'Tu es désaturé : tes tissus sont revenus à l’équilibre.');

  // Les pics qui montent d'une plongée à l'autre
  const pics = recentes.map(p => p.pic);
  if (pics.length >= 3 && pics[pics.length - 1] > pics[0] && Math.max(...pics.slice(-2)) >= 80) {
    dit('attention', `Tes pics de saturation restent hauts d’une plongée à l’autre (${pics.map(v => Math.round(v)).join(' → ')} %) : l’azote s’accumule, espace tes plongées.`);
  } else if (recentes.some(p => p.pic >= 85)) {
    const p = recentes.find(q => q.pic >= 85);
    dit('attention', `Le ${jour(p.debut)} à ${new Date(p.debut).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}, tu as atteint ${Math.round(p.pic)} % : tout près de la limite.`);
  }

  // Le profil inversé : une plongée plus profonde que la précédente le même jour
  for (let j = 1; j < recentes.length; j++) {
    const a = recentes[j - 1], c = recentes[j];
    if (a.d.date === c.d.date && c.prof > a.prof + 3) {
      dit('attention', `Le ${jour(c.debut)}, la plongée à ${Math.round(c.prof)} m est venue après celle à ${Math.round(a.prof)} m : la plus profonde d’abord, c’est mieux.`);
      break;
    }
  }

  // Les intervalles de surface trop courts
  const court = recentes.find(p => p.intervalle != null && p.intervalle < 90 * 60e3);
  if (court) dit('attention', `Seulement ${h(court.intervalle / 36e5)} de surface avant la plongée du ${jour(court.debut)} : vise au moins 1 h 30 à 2 h entre deux plongées.`);

  // La vitesse de remontée
  const vite = recentes.filter(p => p.vmax > 15).sort((a, c) => c.vmax - a.vmax)[0];
  if (vite) dit(vite.vmax > 20 ? 'stop' : 'attention', `Remontée rapide (${Math.round(vite.vmax)} m/min) le ${jour(vite.debut)} : 15 m/min au plus, et 6 m/min après le palier.`);

  // Le palier de sécurité
  const sansPalier = recentes.find(p => p.prof >= 15 && p.d.palierSecu === false && !p.deco);
  if (sansPalier) dit('attention', `Pas de palier de sécurité noté le ${jour(sansPalier.debut)} (${Math.round(sansPalier.prof)} m) : 3 à 5 min à 3-5 m, à chaque plongée.`);

  // Le rythme, l'oxygène, l'avion
  if (r.sur24h >= 4 || r.joursDAffilee >= 5) dit('stop', `${r.sur24h} plongées en 24 h, ${r.joursDAffilee} jour(s) d’affilée : prends une journée sans plonger.`);
  else if (r.sur24h >= 3 || r.joursDAffilee >= 3) dit('attention', `${r.sur24h} plongées en 24 h, ${r.joursDAffilee} jour(s) d’affilée : une journée de repos ferait du bien à tes tissus.`);
  if (m.cns >= 80) dit('stop', `Oxygène : CNS ${Math.round(m.cns)} % — pas de nitrox avant qu’il redescende.`);
  else if (m.cns >= 40 || m.otu7 >= 1300) dit('attention', `Oxygène : CNS ${Math.round(m.cns)} %, ${Math.round(m.otu7)} OTU sur 7 jours — surveille ta PpO2.`);
  if (m.avion?.attente > 0) dit('info', `Avion : pas avant ${new Date(m.avion.jusqua).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.`);

  if (!b.plongees.length) return { niveau: 'ok', titre: '✅ Tu es safe', points: [{ niveau: 'ok', texte: 'Aucune plongée ces 7 derniers jours : rien en réserve.' }] };
  const niveau = pts.some(p => p.niveau === 'stop') ? 'stop' : pts.some(p => p.niveau === 'attention') ? 'attention' : 'ok';
  const titre = niveau === 'stop' ? '⛔ Pas de plongée pour l’instant' : niveau === 'attention' ? '⚠️ Attention' : '✅ Tu es safe';
  const ordre = { stop: 0, attention: 1, ok: 2, info: 3 };
  return { niveau, titre, points: pts.sort((a, c) => ordre[a.niveau] - ordre[c.niveau]) };
}

// ------------------------------------------------------------
//  Le corps par zones, et la prochaine plongée
// ------------------------------------------------------------

/** Les compartiments rangés par zone du corps (des tissus rapides aux lents). */
export const ZONES = [
  { id: 'sang', nom: 'Sang & cerveau', comps: [0, 1, 2] },
  { id: 'muscles', nom: 'Muscles', comps: [3, 4, 5, 6] },
  { id: 'graisses', nom: 'Peau & graisses', comps: [7, 8, 9, 10] },
  { id: 'articulations', nom: 'Articulations & os', comps: [11, 12, 13, 14, 15] },
];

/** La charge de chaque zone maintenant (le plus chargé de ses compartiments) et quand elle repasse sous 20 %. */
export function zonesDuCorps(b) {
  const T = b.maintenant.T;
  return ZONES.map(z => {
    const charge = Math.max(...z.comps.map(i => saturation(T[i], i)));
    const sous = Math.max(0, ...z.comps.map(i => {
      const exces = T[i] - EQUILIBRE, cible = 0.2 * (M0[i] - EQUILIBRE);
      return exces > cible ? Math.log(exces / cible) / K[i] : 0;
    })) / 60;
    return { ...z, charge, heuresSous20: sous };
  });
}

/** Les tissus après une surface de « heures » (on respire de l'air à 1 bar). */
function apresSurface(T, heures) {
  const R = T.slice();
  charger(R, 1, 1, heures * 60, AIR_N2);
  return R;
}

/**
 * Le temps sans palier (min) d'une plongée carrée à « prof » m, en partant
 * de ces tissus : on reste tant que tous les compartiments peuvent remonter
 * sous 85 % de leur limite (descente 20 m/min, remontée 10 m/min).
 */
export function tempsSansPalier(T0, prof, fo2 = 0.21) {
  const fn2 = 1 - fo2, p = pAmb(prof), desc = prof / 20, montee = prof / 10;
  const ok = min => {
    const T = T0.slice();
    charger(T, 1, p, desc, fn2);
    charger(T, p, p, Math.max(0, min - desc), fn2);
    charger(T, p, 1, montee, fn2);
    return T.every((Ti, i) => (Ti - 1) / (M0[i] - 1) <= 0.85);
  };
  if (!ok(desc)) return 0;
  let bas = desc, haut = 120;
  if (ok(haut)) return 120;
  for (let n = 0; n < 20; n++) { const mi = (bas + haut) / 2; if (ok(mi)) bas = mi; else haut = mi; }
  return Math.floor(bas);
}

/** La prochaine plongée : à partir de quand, et combien de temps sans palier à 12, 20, 30 m. */
export function prochainePlongee(b) {
  const m = b.maintenant;
  const attente = heuresAvant(m.T, 20);                 // repasser sous 20 % de charge
  const repos = b.rythme.sur24h >= 4 || b.rythme.joursDAffilee >= 5;
  const derniere = b.plongees[b.plongees.length - 1];
  const fo2 = derniere ? derniere.fo2 : 0.21;
  const T = attente > 0 ? apresSurface(m.T, attente) : m.T;
  return {
    attenteH: attente,
    aPartirDe: b.fin + attente * 36e5,
    reposConseille: repos,
    fo2,
    ndl: [12, 20, 30].map(prof => ({ prof, min: tempsSansPalier(T, prof, fo2), maintenant: tempsSansPalier(m.T, prof, fo2) })),
  };
}

/** Les limites de l'oxygène : CNS (cerveau) 100 % (prudence 80 %), OTU (poumons) 850 sur 24 h, 2 660 sur 7 jours (REPEX). */
export const LIMITES_O2 = { cns: 100, cnsPrudence: 80, otu24: 850, otu7: 2660 };

// ------------------------------------------------------------
//  Vers quoi je vais : les effets, avec leur seuil
// ------------------------------------------------------------

/**
 * Les risques, chacun rapporté à son seuil (pct = 100 : on y est) :
 * - accident de décompression (ADD) : la charge en azote (maintenant, et le pic récent) ;
 * - effet Paul Bert (O2, système nerveux : crise hyperoxique) : CNS % et PpO2 max (1,6 bar) ;
 * - effet Lorrain Smith (O2, poumons) : OTU sur 24 h (850) et sur 7 jours (2 660) ;
 * - narcose (azote sous pression) : PpN2 au plus profond, sensible vers 3,2 bar (30 m à l'air).
 */
export function risques(b, { maintenant = b.fin } = {}) {
  const m = b.maintenant;
  const recentes = b.plongees.filter(p => p.fin > maintenant - 48 * 36e5);
  const pp = p => pAmb(p.prof, p.d.eau === 'douce');
  const plusProfonde = recentes.reduce((x, p) => (!x || pp(p) * (1 - p.fo2) > pp(x) * (1 - x.fo2) ? p : x), null);
  const plusO2 = recentes.reduce((x, p) => (!x || pp(p) * p.fo2 > pp(x) * x.fo2 ? p : x), null);
  const picAzote = recentes.reduce((x, p) => (!x || p.pic > x.pic ? p : x), null);
  const ppn2 = plusProfonde ? pp(plusProfonde) * (1 - plusProfonde.fo2) : 0;
  const ppo2 = plusO2 ? pp(plusO2) * plusO2.fo2 : 0;
  const jour = ms => new Date(ms).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
  const bar = x => `${x.toFixed(2).replace('.', ',')} bar`;
  return [
    { id: 'add', nom: 'Accident de décompression', zone: 'articulations',
      pct: m.sat, niveau: m.sat >= 50 ? 'rouge' : m.sat >= 20 ? 'orange' : 'vert',
      releve: `azote ${Math.round(m.sat)} % maintenant${picAzote ? ` · pic ${Math.round(picAzote.pic)} % (${jour(picAzote.debut)})` : ''}`,
      seuil: '100 % : la limite du tissu',
      effet: 'Bulles d’azote : douleurs articulaires, puces et moutons sur la peau, fatigue, troubles neurologiques.' },
    { id: 'paul-bert', nom: 'Effet Paul Bert', zone: 'tete',
      pct: Math.max(m.cns, ppo2 / 1.6 * 100),
      niveau: m.cns >= 80 || ppo2 > 1.6 ? 'rouge' : m.cns >= 40 || ppo2 > 1.4 ? 'orange' : 'vert',
      releve: `CNS ${Math.round(m.cns)} %${plusO2 ? ` · PpO2 max ${bar(ppo2)} (${Math.round(plusO2.prof)} m, ${Math.round(plusO2.fo2 * 100)} % O2)` : ''}`,
      seuil: 'CNS 100 % · PpO2 1,6 bar',
      effet: 'Oxygène sur le système nerveux : secousses, troubles visuels, puis crise convulsive (hyperoxie).' },
    { id: 'lorrain-smith', nom: 'Effet Lorrain Smith', zone: 'poumons',
      pct: Math.max(m.otu24 / LIMITES_O2.otu24, m.otu7 / LIMITES_O2.otu7) * 100,
      niveau: Math.max(m.otu24 / LIMITES_O2.otu24, m.otu7 / LIMITES_O2.otu7) >= 0.85 ? 'rouge'
        : Math.max(m.otu24 / LIMITES_O2.otu24, m.otu7 / LIMITES_O2.otu7) >= 0.5 ? 'orange' : 'vert',
      releve: `${Math.round(m.otu24)} OTU / 24 h · ${Math.round(m.otu7)} / 7 j`,
      seuil: `${LIMITES_O2.otu24} / 24 h · ${LIMITES_O2.otu7} / 7 j`,
      effet: 'Oxygène sur les poumons, à force d’heures de nitrox : toux, gêne, brûlure en respirant.' },
    { id: 'narcose', nom: 'Narcose', zone: 'tete',
      pct: ppn2 / 3.2 * 100, niveau: ppn2 >= 3.9 ? 'rouge' : ppn2 >= 3.2 ? 'orange' : 'vert',
      releve: plusProfonde ? `PpN2 max ${bar(ppn2)} (${Math.round(plusProfonde.prof)} m, ${plusProfonde.fo2 > 0.215 ? `nitrox ${Math.round(plusProfonde.fo2 * 100)}` : 'air'})` : '—',
      seuil: '≈ 3,2 bar (30 m à l’air)',
      effet: 'L’azote sous pression : euphorie, lenteur, erreurs de lecture. Ça passe en remontant de quelques mètres.' },
  ].map(r => ({ ...r, pct: Math.max(0, r.pct) }));
}

/** Les feux : 'vert' | 'orange' | 'rouge', avec une phrase. */
export function feux(b) {
  const m = b.maintenant, r = b.rythme;
  const f = (couleur, titre, texte) => ({ couleur, titre, texte });
  const h = x => (x >= 1 ? `${Math.round(x)} h` : `${Math.round(x * 60)} min`);
  return [
    m.sat >= 50 ? f('rouge', 'Azote', `Très chargé (${Math.round(m.sat)} %) : désaturation dans ~${h(m.desatH)}.`)
      : m.sat >= 20 ? f('orange', 'Azote', `De l’azote en réserve (${Math.round(m.sat)} %) : désaturation dans ~${h(m.desatH)}.`)
        : f('vert', 'Azote', m.sat >= 5 ? `Presque vide (${Math.round(m.sat)} %) : désaturation dans ~${h(m.desatH)}.` : 'Désaturé.'),
    r.sur24h >= 4 || r.joursDAffilee >= 5 ? f('rouge', 'Rythme', `${r.sur24h} plongée(s) en 24 h, ${r.joursDAffilee} jour(s) d’affilée : une journée sans plonger s’impose.`)
      : r.sur24h >= 3 || r.joursDAffilee >= 3 ? f('orange', 'Rythme', `${r.sur24h} plongée(s) en 24 h, ${r.joursDAffilee} jour(s) d’affilée : pense à une journée de repos.`)
        : f('vert', 'Rythme', `${r.sur24h} plongée(s) en 24 h, ${r.total} sur 7 jours.`),
    m.cns >= 80 || m.otu7 >= 2400 ? f('rouge', 'Oxygène', `CNS ${Math.round(m.cns)} % · ${Math.round(m.otu7)} OTU sur 7 jours : pause oxygène.`)
      : m.cns >= 40 || m.otu7 >= 1300 ? f('orange', 'Oxygène', `CNS ${Math.round(m.cns)} % · ${Math.round(m.otu7)} OTU sur 7 jours.`)
        : f('vert', 'Oxygène', `CNS ${Math.round(m.cns)} % · ${Math.round(m.otu7)} OTU sur 7 jours.`),
    !m.avion || m.avion.attente <= 0 ? f('vert', 'Avion', 'Tu peux prendre l’avion.')
      : f('rouge', 'Avion', `Pas avant ${new Date(m.avion.jusqua).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} (${m.avion.regle} h après la dernière plongée).`),
  ];
}
