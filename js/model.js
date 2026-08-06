// ============================================================
//  Modèle de données et règles métier
//  Partagé par tous les adaptateurs de stockage.
// ============================================================

import { uid, timeToMin, minToTime } from './lib.js';
import { OPTIONS_AUTO, NIVEAUX, rangNiveau, PRE_REMPLI, typeMateriel } from './config.js';

export function emptyDiver() {
  return {
    id: uid(), prenom: '', nom: '', licence: '', nationalite: 'Française',
    rue: '', cp: '', ville: '', pays: 'France', groupeSanguin: '',
    urgPrenom: '', urgNom: '', urgTel: '', urgLien: '',
    niveau: '',
    // Matériel personnel : une ligne par pièce, ajoutée au besoin.
    // [{ id, type, marque, modele, note }]
    materiel: [],
    combiType: '', combiMm: '',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Une pièce de matériel.
 * Les valeurs sont dans `valeurs`, dont les clés dépendent du type :
 * une combinaison a un sous-type et une épaisseur, un détendeur une
 * marque et un modèle.
 */
export function emptyMateriel(type = '') {
  return { id: uid(), type, valeurs: {} };
}

/**
 * Valeurs d'une pièce, en absorbant l'ancien format plat
 * ({marque, modele, note} directement sur l'objet).
 */
export function valeursMateriel(m) {
  if (!m) return {};
  if (m.valeurs && Object.keys(m.valeurs).length) return m.valeurs;
  const { marque, modele, note } = m;
  const anciennes = { marque, modele, note };
  return Object.fromEntries(Object.entries(anciennes).filter(([, v]) => v));
}

/** Résumé d'une ligne, composé selon le type. */
export function libelleMateriel(m) {
  const t = typeMateriel(m?.type);
  const v = valeursMateriel(m);
  return (t.resume ? t.resume(v) : '') || '—';
}

/** Carte de niveau, brevet, RIFAP… : un document daté, avec un numéro. */
export function emptyCertification(diverId) {
  return {
    id: uid(), diverId,
    nom: '', numero: '', organisme: '', dateObtention: '',
    createdAt: new Date().toISOString(),
  };
}

/** Suggestions courantes, la saisie reste libre. */
export const CERTIFS_COURANTES = [
  'N1', 'N2', 'N3', 'N4', 'N5',
  'Nitrox', 'Nitrox confirmé', 'Trimix élémentaire', 'Trimix',
  'RIFAP', 'Initiateur', 'MF1', 'MF2',
  'Open Water', 'Advanced Open Water', 'Rescue Diver', 'Divemaster',
];

export function emptyBuddy() {
  return {
    id: uid(), prenom: '', nom: '',
    licence: '',            // identifiant unique du plongeur (FFESSM, etc.)
    club: '',               // sert à regrouper les compagnons
    // Une structure (centre, club) n'a ni nom de famille ni licence :
    // c'est une entité, pas une personne. Son « tampon » est son logo.
    structure: false,
    siteWeb: '',
    // Le niveau d'un plongeur change avec le temps : le figer sur une fiche
    // serait faux pour toutes les plongées passées. Seule qualité durable :
    // est-ce, ou non, un moniteur.
    moniteur: false,
    note: '',
    stamps: [],             // tampons ET signatures : { id, dataUrl, type }
    createdAt: new Date().toISOString(),
  };
}

export function emptyDive(diverId, numero) {
  return {
    id: uid(),
    diverId,
    numero,
    date: '',
    // Lieu : on garde À LA FOIS le libellé cherché et le point exact.
    lieuNom: '',          // ce que l'utilisateur a cherché : "Lac de Beaumont-sur-Oise"
    lieuDetail: '',       // adresse complète renvoyée par la recherche
    lat: null, lng: null, // point cliqué dans l'eau
    eau: '',              // 'douce' | 'salee'
    site: '',             // nom du site précis / point de mise à l'eau

    // L'heure d'immersion peut manquer (plongées d'avant l'ordinateur) :
    // la durée seule suffit.
    heureImmersion: '', heureSortie: '', dureeMin: null,

    type: '', options: [], objectifs: [], objectifAutre: '',
    optionsRefusees: [],    // suggestions automatiques que tu as retirées

    palier3: null, palier6: null, palier9: null,
    palierSecu: false, palierSecuMin: 3,
    profMax: null, profMoy: null,

    niveau: '',             // ton niveau au moment de CETTE plongée

    lestage: '',
    combiType: '', combiMm: '', combinaison: '',

    // Bouteille : le gaz respiré caractérise le bloc, pas la plongée.
    gazType: 'air',         // air | nitrox | trimix | recycleur
    gazO2: null, gazHe: null, gazSetpoint: null,
    blocType: '', blocMatiere: '', blocLitres: null,
    pressionDepart: PRE_REMPLI.pressionDepart,
    pressionFin: PRE_REMPLI.pressionFin,

    // Matériel du profil réellement emporté ce jour-là (ids)
    materielIds: null,

    tempAir: null, tempSurface: null, tempFond: null,
    visibilite: '', courant: '',
    meteo: '', etatMer: '',

    // Reconnaissance automatique du plan d'eau
    altitude: null, indiceEau: '',

    buddyIds: [], palanqueeMode: '', chefBuddyId: '',
    // Un tampon par plongeur présent : { buddyId: stampId }
    tampons: {},
    stampBuddyId: '', stampId: '', stampImage: '',

    fait: '', vu: '', observations: '',

    // « Ce que j'ai vu », en trois catégories cochables.
    // Chaque entrée : { id, nom, sci, photo, source }
    vuFaune: [], vuFlore: [], vuEpaves: [],

    // Import ordinateur de plongée
    suuntoId: null, suuntoSyncedAt: null, profil: null,

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Calcule la durée à partir des horaires, ou l'heure de sortie à partir de la durée. */
export function reconcileTimes(dive) {
  const inMin  = timeToMin(dive.heureImmersion);
  const outMin = timeToMin(dive.heureSortie);

  if (inMin !== null && outMin !== null) {
    let d = outMin - inMin;
    if (d < 0) d += 1440;          // plongée à cheval sur minuit
    dive.dureeMin = d;
  } else if (inMin !== null && dive.dureeMin) {
    dive.heureSortie = minToTime(inMin + Number(dive.dureeMin));
  }
  return dive;
}

/**
 * Minimum pour qu'une plongée soit valable : un lieu, une date, une heure
 * d'immersion, la sortie (ou la durée), et la profondeur max.
 * Tout le reste est facultatif.
 *
 * @returns {Array<{champ:string, texte:string}>} ce qui manque
 */
export function validerPlongee(dive) {
  const manque = [];
  const vide = v => !String(v ?? '').trim();

  if (vide(dive.lieuNom) && dive.lat == null && vide(dive.site)) {
    manque.push({ champ: 'lieu', texte: 'le lieu de plongée' });
  }
  if (!dive.date) manque.push({ champ: 'date', texte: 'la date' });

  // L'heure d'immersion n'est PAS obligatoire : sur les vieilles plongées
  // sans ordinateur, on ne l'a plus. La durée, elle, est toujours connue.
  if (!dive.dureeMin && !(dive.heureImmersion && dive.heureSortie)) {
    manque.push({ champ: 'duree', texte: 'la durée (ou les deux horaires)' });
  }

  if (dive.profMax === null || dive.profMax === undefined || dive.profMax === '') {
    manque.push({ champ: 'profMax', texte: 'la profondeur max' });
  } else if (Number(dive.profMax) <= 0) {
    manque.push({ champ: 'profMax', texte: 'une profondeur max supérieure à zéro' });
  }

  return manque;
}

// ------------------------------------------------------------
//  Options déduites automatiquement
//
//  Ces étiquettes se posent seules à partir de ce qui est saisi ou
//  détecté. Chacune reste retirable : une option écartée à la main
//  est mémorisée dans `optionsRefusees` et ne revient jamais.
// ------------------------------------------------------------

export function optionsAutomatiques(dive, contexte = {}) {
  const trouvees = [];
  const ajouter = (tag, raison) => trouvees.push({ tag, raison });

  const prof = Number(dive.profMax) || 0;
  if (prof >= 30) ajouter('Plongée profonde', `${prof} m`);

  const paliers = (Number(dive.palier3) || 0) + (Number(dive.palier6) || 0)
                + (Number(dive.palier9) || 0);
  if (paliers > 0) ajouter('Décompression', `${paliers} min de paliers`);

  const alt = contexte.altitude ?? dive.altitude;
  if (alt != null && alt > 300) ajouter('Plongée en altitude', `${Math.round(alt)} m`);

  const lieu = `${dive.lieuNom || ''} ${dive.lieuDetail || ''} ${contexte.nomPlanEau || ''}`;
  if (contexte.fosse || /\bfosse\b/i.test(lieu)) ajouter('Plongée en fosse', 'bassin de plongée');

  const glace = /\b(glace|sous glace|gelé)\b/i.test(lieu)
             || (dive.tempSurface != null && Number(dive.tempSurface) <= 2);
  if (glace) ajouter('Plongée sous glace', dive.tempSurface != null
    ? `${dive.tempSurface} °C en surface` : 'le lieu l’indique');

  // Le gaz vient désormais de la bouteille, plus des options.
  const gazTechnique = ['trimix', 'recycleur'].includes(dive.gazType);
  if (prof >= 40 || gazTechnique) {
    ajouter('Plongée technique', prof >= 40 ? `${prof} m`
      : dive.gazType === 'recycleur' ? 'recycleur' : 'trimix');
  }

  const refusees = new Set(dive.optionsRefusees || []);
  return trouvees.filter(t => OPTIONS_AUTO.includes(t.tag) && !refusees.has(t.tag));
}

/** Applique les options automatiques sans toucher aux choix manuels. */
export function appliquerOptionsAuto(dive, contexte = {}) {
  const auto = optionsAutomatiques(dive, contexte);
  const actuelles = new Set(dive.options || []);
  const refusees = new Set(dive.optionsRefusees || []);

  auto.forEach(({ tag }) => actuelles.add(tag));

  // Une option automatique dont la condition a disparu s'en va aussi,
  // sauf si elle avait été cochée à la main.
  const encoreValides = new Set(auto.map(a => a.tag));
  const manuelles = new Set(dive.optionsManuelles || []);
  OPTIONS_AUTO.forEach(tag => {
    if (!encoreValides.has(tag) && !manuelles.has(tag) && !refusees.has(tag)) {
      actuelles.delete(tag);
    }
  });

  dive.options = [...actuelles];
  return auto;
}

// ------------------------------------------------------------
//  Niveau du plongeur
// ------------------------------------------------------------

/**
 * Niveau courant d'un carnet : le plus élevé connu.
 *
 * Deux sources, la carte l'emporte : un brevet est une preuve datée,
 * alors que le niveau porté sur une plongée est déclaratif. Si les
 * cartes disent N3, le carnet dit N3 — même si aucune plongée ne le
 * mentionne encore.
 *
 * @param {Array} dives         plongées du carnet
 * @param {Array} certifications cartes et brevets
 */
export function niveauCourant(dives, certifications = []) {
  let meilleur = '';
  let rang = -1;
  let dernier = '';
  let dateDernier = '';

  const retenir = (nom, date) => {
    const n = String(nom || '').trim();
    if (!n) return;
    const r = rangNiveau(n);
    if (r > rang) { rang = r; meilleur = n; }
    if ((date || '') >= dateDernier) { dateDernier = date || ''; dernier = n; }
  };

  // Les cartes d'abord : à rang égal, c'est la plus récente qui gagne.
  (certifications || []).forEach(c => retenir(c.nom, c.dateObtention));
  (dives || []).forEach(d => retenir(d.niveau, d.date));

  // Un intitulé hors liste ne se classe pas : on garde alors le plus récent.
  return meilleur || dernier || '';
}

/** Répartition des plongées par niveau, du plus élevé au plus bas. */
export function plongeesParNiveau(dives) {
  const compte = {};
  (dives || []).forEach(d => {
    const n = String(d.niveau || '').trim();
    if (n) compte[n] = (compte[n] || 0) + 1;
  });
  return Object.entries(compte).sort((a, b) => rangNiveau(b[0]) - rangNiveau(a[0]));
}

export { NIVEAUX, rangNiveau };

/**
 * Consommation d'air.
 *
 * Deux chiffres, et il faut les distinguer :
 *  • la consommation RÉELLE, au fond, en litres par minute ;
 *  • la consommation ramenée à la SURFACE — le « SAC » — qui seule
 *    permet de comparer deux plongées de profondeurs différentes.
 *
 * Le calcul suppose une profondeur moyenne. Si l'ordinateur ne l'a pas
 * fournie, on l'estime à 60 % de la profondeur max : c'est un ordre de
 * grandeur, et le résultat est alors marqué comme estimé.
 *
 * @returns {{litres, brute, surface, profMoy, estime}|null}
 */
export function consommation(dive) {
  const depart = Number(dive?.pressionDepart);
  const fin = Number(dive?.pressionFin);
  const volume = Number(dive?.blocLitres);
  const duree = Number(dive?.dureeMin);

  if (!depart || !fin || !volume || !duree) return null;
  const delta = depart - fin;
  if (delta <= 0) return null;

  // Un bi-bouteilles porte deux fois le volume annoncé par bloc.
  const facteur = /bi/i.test(dive.blocType || '') ? 2 : 1;
  const litres = delta * volume * facteur;

  const estime = !dive.profMoy;
  const profMoy = Number(dive.profMoy) || (Number(dive.profMax) || 0) * 0.6;
  const pression = 1 + profMoy / 10;      // pression absolue moyenne, en bars

  const brute = litres / duree;
  const surface = pression > 0 ? brute / pression : null;

  const arrondi = v => (v == null ? null : Math.round(v * 10) / 10);
  return {
    litres: Math.round(litres),
    brute: arrondi(brute),
    surface: arrondi(surface),
    profMoy: arrondi(profMoy),
    estime,
  };
}

/** Libellé lisible d'un mélange : « Nitrox 32 », « Trimix 18/45 ». */
export function libelleGaz(dive) {
  const t = dive?.gazType || 'air';
  const o2 = dive?.gazO2, he = dive?.gazHe;
  if (t === 'air') return 'Air';
  if (t === 'nitrox') return o2 ? `Nitrox ${o2}` : 'Nitrox';
  if (t === 'trimix') return (o2 && he) ? `Trimix ${o2}/${he}` : 'Trimix';
  if (t === 'recycleur') {
    const sp = dive?.gazSetpoint;
    return sp ? `Recycleur (setpoint ${sp})` : 'Recycleur';
  }
  return '';
}

/**
 * Profondeur maximale opérationnelle d'un nitrox, à 1,4 bar de PpO2.
 * Purement indicatif : c'est une aide à la relecture, pas une planification.
 */
export function pmuNitrox(o2, ppo2 = 1.4) {
  const f = Number(o2) / 100;
  if (!f || f <= 0 || f > 1) return null;
  // Arrondi vers le BAS : sur une limite de profondeur, on ne gagne
  // jamais un mètre par arrondi. Le toFixed absorbe l'imprécision des
  // flottants — sans lui, un Nitrox 40 tombe à 24,999… donc 24 m.
  return Math.floor(Number((((ppo2 / f) - 1) * 10).toFixed(6)));
}

/** Devine eau douce / eau salée à partir du libellé du lieu. Toujours modifiable à la main. */
export function guessWater(label = '') {
  const s = label.toLowerCase();
  const douce = ['lac', 'étang', 'etang', 'carrière', 'carriere', 'gravière', 'graviere',
                 'rivière', 'riviere', 'fleuve', 'barrage', 'retenue', 'fosse', 'piscine',
                 'source', 'canal', "plan d'eau", 'réservoir', 'reservoir', 'ballastière', 'ballastiere'];
  const salee = ['mer', 'méditerranée', 'mediterranee', 'atlantique', 'manche', 'océan', 'ocean',
                 'baie', 'calanque', 'plage', 'port', 'crique', 'cap ', 'île', 'ile ', 'golfe',
                 'rade', 'anse', 'lagon', 'récif', 'recif', 'détroit', 'detroit', 'estuaire'];
  if (douce.some(k => s.includes(k))) return 'douce';
  if (salee.some(k => s.includes(k))) return 'salee';
  return '';
}

/** Statistiques d'un carnet — le nombre de plongées n'est jamais saisi. */
export function computeStats(list, certifications = []) {
  const totalMin = list.reduce((s, d) => s + (Number(d.dureeMin) || 0), 0);
  const profs = list.map(d => Number(d.profMax) || 0).filter(Boolean);
  const byType = {};
  list.forEach(d => { if (d.type) byType[d.type] = (byType[d.type] || 0) + 1; });

  const buddyCount = {};
  list.forEach(d => (d.buddyIds || []).forEach(b => { buddyCount[b] = (buddyCount[b] || 0) + 1; }));

  const years = {};
  list.forEach(d => { const y = (d.date || '').slice(0, 4); if (y) years[y] = (years[y] || 0) + 1; });

  return {
    count: list.length,
    totalMin,
    maxDepth: profs.length ? Math.max(...profs) : 0,
    avgDepth: profs.length ? profs.reduce((a, b) => a + b, 0) / profs.length : 0,
    avgDuration: list.length ? totalMin / list.length : 0,
    nuit: list.filter(d => (d.type || '').toLowerCase().includes('nuit')).length,
    salee: list.filter(d => d.eau === 'salee').length,
    douce: list.filter(d => d.eau === 'douce').length,
    lastDate: list.map(d => d.date).filter(Boolean).sort().pop() || null,
    byType, buddyCount, years,
    niveau: niveauCourant(list, certifications),
    parNiveau: plongeesParNiveau(list),
  };
}

export function sortDives(list) {
  return list.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')
                                  || (b.numero || 0) - (a.numero || 0));
}

export function sortPeople(list) {
  return list.slice().sort((a, b) =>
    (a.nom + a.prenom).localeCompare(b.nom + b.prenom, 'fr'));
}

/** Regroupe les compagnons par club, les sans-club en dernier. */
export function parClub(buddies) {
  const groupes = new Map();
  sortPeople(buddies).forEach(b => {
    const club = String(b.club || '').trim() || '__sans__';
    if (!groupes.has(club)) groupes.set(club, []);
    groupes.get(club).push(b);
  });

  return [...groupes.entries()]
    .sort((a, b) => {
      if (a[0] === '__sans__') return 1;
      if (b[0] === '__sans__') return -1;
      return a[0].localeCompare(b[0], 'fr');
    })
    .map(([club, membres]) => ({
      club: club === '__sans__' ? '' : club,
      titre: club === '__sans__' ? 'Sans club' : club,
      membres,
    }));
}
