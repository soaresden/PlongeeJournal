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
    t = x.debut + pts[pts.length - 1][0] * 1000;
    otus.push({ t, otu: otuPlongee });
    plongees.push({ d: x.d, debut: x.debut, fin: t, pic, estime: x.profil.estime, deco: decoDe(x.d), fo2, cns });
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
