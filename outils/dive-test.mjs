// Vérifie les règles de validation d'une plongée et le tri des espèces.
import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;

const results = [];
const check = (name, cond, extra = '') =>
  results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

// --- environnement minimal ---
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
  randomUUID: () => 'x'.repeat(8) + Math.random().toString(16).slice(2),
  getRandomValues: a => a,
} });

const { emptyDive, emptyBuddy, emptyDiver, emptyCertification, emptyMateriel,
        libelleMateriel, valeursMateriel, reconcileTimes, validerPlongee,
        optionsAutomatiques, appliquerOptionsAuto, niveauCourant, consommation,
        plongeesParNiveau, parClub, libelleGaz, pmuNitrox } =
  await import(path.join(ROOT, 'js/model.js'));
const { NIVEAUX, rangNiveau, GAZ, gazParId, DIVE_OPTIONS, TYPES_MATERIEL, typeMateriel,
        PALANQUEE_MODES } = await import(path.join(ROOT, 'js/config.js'));

const champs = x => validerPlongee(x).map(m => m.champ);
let d;

// ------------------------------------------------------------
//  Le minimum vital
// ------------------------------------------------------------

const vide = emptyDive('diver-1', 1);
const m = champs(vide);
check('plongée vide : 4 manques', m.length === 4, m.join(','));
check('  → lieu signalé', m.includes('lieu'));
check('  → date signalée', m.includes('date'));
check('  → durée signalée', m.includes('duree'));
check('  → profondeur max signalée', m.includes('profMax'));
check('  → immersion PAS obligatoire', !m.includes('immersion'), m.join(','));

const ok = () => Object.assign(emptyDive('diver-1', 1), {
  lieuNom: 'Calanque de Sormiou', lat: 43.2, lng: 5.4,
  date: '2026-07-14', heureImmersion: '10:15', heureSortie: '11:03', profMax: 24,
});

check('plongée minimale : valide', champs(ok()).length === 0, champs(ok()).join(','));

// Vieille plongée sans ordinateur : durée seule, aucun horaire
d = Object.assign(emptyDive('diver-1', 2), {
  lieuNom: 'Cherbourg', date: '1998-08-12', dureeMin: 42, profMax: 18,
});
check('plongée sans aucun horaire : valide', champs(d).length === 0, champs(d).join(','));

d.dureeMin = null; d.heureImmersion = '10:00'; d.heureSortie = '';
check('immersion seule sans durée : refusée', champs(d).includes('duree'));

// Valeurs pré-remplies
check('pression départ pré-remplie à 200', vide.pressionDepart === 200, String(vide.pressionDepart));
check('pression fin pré-remplie à 50', vide.pressionFin === 50, String(vide.pressionFin));
check('palier de sécurité à 3 min par défaut', vide.palierSecuMin === 3, String(vide.palierSecuMin));

// --- le lieu accepte trois formes ---
d = ok(); d.lieuNom = ''; d.site = '';
check('lieu : coordonnées seules suffisent', !champs(d).includes('lieu'));
d = ok(); d.lieuNom = ''; d.lat = null; d.lng = null; d.site = 'Ponton nord';
check('lieu : site seul suffit', !champs(d).includes('lieu'));
d = ok(); d.lieuNom = '   '; d.lat = null; d.lng = null; d.site = '';
check('lieu : espaces ne comptent pas', champs(d).includes('lieu'));

// --- sortie OU durée ---
d = ok(); d.heureSortie = '';
check('sortie manquante et durée absente : signalé', champs(d).includes('duree'));
d.dureeMin = 48;
check('durée seule suffit', !champs(d).includes('duree'));

// --- profondeur ---
d = ok(); d.profMax = 0;
check('profondeur zéro refusée', champs(d).includes('profMax'));
d.profMax = -5;
check('profondeur négative refusée', champs(d).includes('profMax'));
d.profMax = 0.5;
check('profondeur 0,5 m acceptée', !champs(d).includes('profMax'));

// ------------------------------------------------------------
//  Horaires : durée ⇄ heure de sortie
// ------------------------------------------------------------

d = ok(); reconcileTimes(d);
check('durée calculée depuis les horaires', d.dureeMin === 48, String(d.dureeMin));

d = ok(); d.heureImmersion = '23:40'; d.heureSortie = ''; d.dureeMin = 45;
reconcileTimes(d);
check('sortie calculée par-dessus minuit', d.heureSortie === '00:25', d.heureSortie);

d = ok(); d.heureImmersion = '23:40'; d.heureSortie = '00:25'; d.dureeMin = null;
reconcileTimes(d);
check('durée correcte par-dessus minuit', d.dureeMin === 45, String(d.dureeMin));

// ------------------------------------------------------------
//  Nouveaux champs
// ------------------------------------------------------------

check('plongée : trois catégories « vu »',
  Array.isArray(vide.vuFaune) && Array.isArray(vide.vuFlore) && Array.isArray(vide.vuEpaves));
check('compagnon : champ licence', 'licence' in emptyBuddy());
check('compagnon : champ club', 'club' in emptyBuddy());
check('compagnon : moniteur booléen', emptyBuddy().moniteur === false);
check('compagnon : plus de champ niveau du tout',
  !('niveau' in emptyBuddy()), String(emptyBuddy().niveau));

// ------------------------------------------------------------
//  Étiquettes automatiques
// ------------------------------------------------------------

const tags = (patch, ctx) => optionsAutomatiques(
  Object.assign(ok(), patch), ctx).map(t => t.tag);

check('profonde dès 30 m', tags({ profMax: 30 }).includes('Plongée profonde'));
check('pas profonde à 29 m', !tags({ profMax: 29 }).includes('Plongée profonde'));
check('décompression si palier', tags({ palier3: 5 }).includes('Décompression'));
check('pas de décompression sans palier', !tags({}).includes('Décompression'));
check('palier de sécurité ≠ décompression',
  !tags({ palierSecu: true, palierSecuMin: 3 }).includes('Décompression'));
check('altitude au-dessus de 300 m',
  tags({}, { altitude: 450 }).includes('Plongée en altitude'));
check('pas d’altitude à 100 m', !tags({}, { altitude: 100 }).includes('Plongée en altitude'));
check('fosse détectée par le nom',
  tags({ lieuNom: 'Fosse de Villeneuve-la-Garenne' }).includes('Plongée en fosse'));
check('fosse détectée par la carte', tags({}, { fosse: true }).includes('Plongée en fosse'));
check('sous glace si surface ≤ 2 °C',
  tags({ tempSurface: 1 }).includes('Plongée sous glace'));
check('pas sous glace à 14 °C', !tags({ tempSurface: 14 }).includes('Plongée sous glace'));
check('technique dès 40 m', tags({ profMax: 40 }).includes('Plongée technique'));
check('technique si trimix', tags({ gazType: 'trimix' }).includes('Plongée technique'));
check('technique si recycleur', tags({ gazType: 'recycleur' }).includes('Plongée technique'));
check('air seul ≠ technique', !tags({ gazType: 'air' }).includes('Plongée technique'));

// ------------------------------------------------------------
//  Bouteille : le gaz a quitté les options de la plongée
// ------------------------------------------------------------

check('les gaz ne sont plus des options',
  !DIVE_OPTIONS.some(o => /nitrox|trimix|recycleur|bi-bouteilles|à l’air/i.test(o)),
  DIVE_OPTIONS.join(','));
check('gaz par défaut : air', emptyDive('d', 1).gazType === 'air');
check('quatre gaz proposés', GAZ.length === 4, String(GAZ.length));
check('nitrox demande l’O₂', gazParId('nitrox').champs.includes('o2'));
check('trimix demande O₂ et He',
  gazParId('trimix').champs.includes('o2') && gazParId('trimix').champs.includes('he'));
check('recycleur demande un setpoint', gazParId('recycleur').champs.includes('setpoint'));
check('air ne demande rien', !gazParId('air').champs);

check('libellé air', libelleGaz({ gazType: 'air' }) === 'Air');
check('libellé nitrox', libelleGaz({ gazType: 'nitrox', gazO2: 32 }) === 'Nitrox 32');
check('libellé trimix',
  libelleGaz({ gazType: 'trimix', gazO2: 18, gazHe: 45 }) === 'Trimix 18/45');
check('libellé recycleur',
  libelleGaz({ gazType: 'recycleur', gazSetpoint: 1.3 }).includes('1.3'));

// Profondeur max opérationnelle : Nitrox 32 à 1,4 bar ≈ 33 m
check('PMU nitrox 32 = 33 m (arrondi vers le bas)', pmuNitrox(32) === 33, String(pmuNitrox(32)));
check('PMU nitrox 40 = 25 m', pmuNitrox(40) === 25, String(pmuNitrox(40)));
check('PMU air 21 = 56 m', pmuNitrox(21) === 56, String(pmuNitrox(21)));
check('PMU ne surestime jamais',
  ((1.4 / 0.32) - 1) * 10 >= pmuNitrox(32), 'arrondi vers le haut détecté');
check('PMU refuse une valeur absurde', pmuNitrox(0) === null && pmuNitrox(null) === null);

// ------------------------------------------------------------
//  Consommation d'air
// ------------------------------------------------------------

const conso = p => consommation(Object.assign(ok(), p));

let c = conso({ pressionDepart: 200, pressionFin: 50, blocLitres: 12, dureeMin: 45, profMoy: 15 });
check('litres consommés = ΔP × volume', c.litres === 1800, String(c.litres));
check('consommation au fond', c.brute === 40, String(c.brute));
check('consommation ramenée à la surface', c.surface === 16, String(c.surface));
check('profondeur moyenne non estimée', c.estime === false);

c = conso({ pressionDepart: 200, pressionFin: 50, blocLitres: 12, dureeMin: 45,
            profMax: 30, profMoy: null });
check('sans profondeur moyenne : estimée à 60 %', c.profMoy === 18, String(c.profMoy));
check('estimation signalée', c.estime === true);

c = conso({ pressionDepart: 200, pressionFin: 80, blocLitres: 12, dureeMin: 50,
            profMoy: 20, blocType: 'Bi-bouteilles' });
check('bi-bouteilles : volume doublé', c.litres === 2880, String(c.litres));

check('pressions manquantes : pas de calcul',
  conso({ pressionDepart: null, pressionFin: null }) === null);
check('volume manquant : pas de calcul',
  conso({ pressionDepart: 200, pressionFin: 50, blocLitres: null, dureeMin: 45 }) === null);
check('pression finale supérieure : refusé',
  conso({ pressionDepart: 50, pressionFin: 200, blocLitres: 12, dureeMin: 45 }) === null);
check('la surface est toujours ≤ au fond',
  conso({ pressionDepart: 200, pressionFin: 50, blocLitres: 12, dureeMin: 45, profMoy: 30 }).surface
  < conso({ pressionDepart: 200, pressionFin: 50, blocLitres: 12, dureeMin: 45, profMoy: 30 }).brute);

// ------------------------------------------------------------
//  Conditions météo
// ------------------------------------------------------------

check('plongée : champ météo', 'meteo' in emptyDive('d', 1));
check('plongée : état de l’eau', 'etatMer' in emptyDive('d', 1));

// ------------------------------------------------------------
//  Niveaux de préparation
// ------------------------------------------------------------

check('PN1 à PN5 présents',
  ['PN1', 'PN2', 'PN3', 'PN4', 'PN5'].every(n => NIVEAUX.includes(n)));
check('PN2 se classe sous N2', rangNiveau('PN2') < rangNiveau('N2'));
check('PN2 se classe au-dessus de N1', rangNiveau('PN2') > rangNiveau('N1'));
check('PN3 sous N3 et au-dessus de N2',
  rangNiveau('PN3') < rangNiveau('N3') && rangNiveau('PN3') > rangNiveau('N2'));
// --- Le niveau vient aussi des cartes ---
check('carte N3 l’emporte sur des plongées en N1',
  niveauCourant(
    [{ date: '2025-01-01', niveau: 'N1' }],
    [{ nom: 'N3', dateObtention: '2024-06-01' }, { nom: 'Nitrox', dateObtention: '2021-01-01' }]
  ) === 'N3',
  niveauCourant([{ date: '2025-01-01', niveau: 'N1' }],
    [{ nom: 'N3', dateObtention: '2024-06-01' }]));
check('RIFAP ne se classe pas comme un niveau',
  niveauCourant([], [{ nom: 'RIFAP', dateObtention: '2023-01-01' },
                     { nom: 'N2', dateObtention: '2022-01-01' }]) === 'N2');
check('sans carte, on retombe sur les plongées',
  niveauCourant([{ date: '2025-01-01', niveau: 'N2' }], []) === 'N2');
check('ni carte ni plongée : vide', niveauCourant([], []) === '');

// --- Structures de plongée ---
check('compagnon : indicateur structure', emptyBuddy().structure === false);
check('compagnon : site web', 'siteWeb' in emptyBuddy());

check('niveau courant : N1 l’emporte sur PN2',
  niveauCourant([{ date: '2024-01-01', niveau: 'PN2' }, { date: '2023-01-01', niveau: 'N1' }]) === 'PN2',
  niveauCourant([{ date: '2024-01-01', niveau: 'PN2' }, { date: '2023-01-01', niveau: 'N1' }]));

// ------------------------------------------------------------
//  Matériel & certifications
// ------------------------------------------------------------

check('plongeur : matériel = liste vide au départ',
  Array.isArray(emptyDiver().materiel) && emptyDiver().materiel.length === 0);
check('plongeur : combinaison de référence', 'combiType' in emptyDiver());
check('plongée : tampons par plongeur', JSON.stringify(emptyDive('d', 1).tampons) === '{}');
check('plongée : matériel emporté', 'materielIds' in emptyDive('d', 1));

// --- Matériel : chaque type a SES champs ---
const mat = emptyMateriel('detendeur');
check('matériel : identifiant propre', !!mat.id && mat.type === 'detendeur');
check('matériel : valeurs séparées du type', 'valeurs' in mat);
check('matériel : plusieurs pièces du même type possibles',
  emptyMateriel('masque').id !== emptyMateriel('masque').id);

const champsDe = id => typeMateriel(id).champs.map(c => c.id);
check('combinaison : type + épaisseur, pas de modèle',
  champsDe('combinaison').includes('sousType') && champsDe('combinaison').includes('mm')
  && !champsDe('combinaison').includes('modele'), champsDe('combinaison').join(','));
check('détendeur : marque + modèle',
  champsDe('detendeur').join(',') === 'marque,modele', champsDe('detendeur').join(','));
check('masque : marque + personnalisation, pas de modèle',
  champsDe('masque').includes('note') && !champsDe('masque').includes('modele'),
  champsDe('masque').join(','));
check('palmes : pas de modèle', !champsDe('palmes').includes('modele'), champsDe('palmes').join(','));
check('phare : marque + modèle',
  champsDe('phare').join(',') === 'marque,modele', champsDe('phare').join(','));
check('caméra : marque + modèle',
  champsDe('camera').join(',') === 'marque,modele', champsDe('camera').join(','));
check('lestage : poids en kg', champsDe('lestage').includes('kg'), champsDe('lestage').join(','));
check('combinaison : 3 types proposés',
  typeMateriel('combinaison').champs[0].options.length === 3);

check('libellé combinaison',
  libelleMateriel({ type: 'combinaison',
    valeurs: { sousType: 'Semi-étanche', mm: '7', marque: 'Subea' } })
  === 'Semi-étanche · 7 mm · Subea',
  libelleMateriel({ type: 'combinaison', valeurs: { sousType: 'Semi-étanche', mm: '7', marque: 'Subea' } }));
check('libellé détendeur',
  libelleMateriel({ type: 'detendeur', valeurs: { marque: 'Aqualung', modele: 'Legend' } })
  === 'Aqualung Legend');
check('libellé masque',
  libelleMateriel({ type: 'masque', valeurs: { marque: 'Cressi', note: 'noir' } })
  === 'Cressi — noir');
check('libellé lestage',
  libelleMateriel({ type: 'lestage', valeurs: { kg: '6', note: 'ceinture' } })
  === '6 kg — ceinture');
check('libellé vide', libelleMateriel({ type: 'detendeur', valeurs: {} }) === '—');

// Ancien format plat : toujours lisible
check('ancien format relu',
  valeursMateriel({ type: 'detendeur', marque: 'Mares', modele: 'Abyss' }).marque === 'Mares');
check('ancien format : libellé correct',
  libelleMateriel({ type: 'detendeur', marque: 'Mares', modele: 'Abyss' }) === 'Mares Abyss');

check('plongée : aucun matériel pré-coché',
  (emptyDive('d', 1).materielIds ?? []).length === 0,
  JSON.stringify(emptyDive('d', 1).materielIds));

check('types de matériel proposés', TYPES_MATERIEL.length >= 10, String(TYPES_MATERIEL.length));
check('chaque type a une icône', TYPES_MATERIEL.every(t => t.icone && t.label));
check('type inconnu toléré', typeMateriel('zzz').label === 'zzz' || !!typeMateriel('zzz').icone);

const cert = emptyCertification('diver-1');
check('certification : rattachée au plongeur', cert.diverId === 'diver-1');
check('certification : champs attendus',
  ['nom', 'numero', 'organisme', 'dateObtention'].every(k => k in cert), Object.keys(cert).join(','));

// Une suggestion écartée à la main ne revient jamais
d = Object.assign(ok(), { profMax: 35 });
appliquerOptionsAuto(d);
check('option auto appliquée', d.options.includes('Plongée profonde'), d.options.join(','));
d.options = d.options.filter(x => x !== 'Plongée profonde');
d.optionsRefusees = ['Plongée profonde'];
appliquerOptionsAuto(d);
check('option refusée ne revient pas', !d.options.includes('Plongée profonde'), d.options.join(','));

// Une option cochée à la main survit à la disparition de sa condition
d = Object.assign(ok(), { profMax: 35 });
appliquerOptionsAuto(d);
d.optionsManuelles = ['Plongée profonde'];
d.profMax = 12;
appliquerOptionsAuto(d);
check('option manuelle conservée', d.options.includes('Plongée profonde'), d.options.join(','));

// Une option auto disparaît si sa condition tombe
d = Object.assign(ok(), { profMax: 35 });
appliquerOptionsAuto(d);
d.profMax = 12;
appliquerOptionsAuto(d);
check('option auto retirée si la condition tombe',
  !d.options.includes('Plongée profonde'), d.options.join(','));

// ------------------------------------------------------------
//  Niveau du plongeur
// ------------------------------------------------------------

const carnet = [
  { date: '2020-05-01', niveau: 'N1' },
  { date: '2022-06-01', niveau: 'N2' },
  { date: '2024-07-01', niveau: 'N3' },
  { date: '2025-08-01', niveau: 'N3' },
  { date: '2019-01-01', niveau: '' },
];
check('niveau courant = le plus élevé', niveauCourant(carnet) === 'N3', niveauCourant(carnet));
check('niveau courant sur carnet vide', niveauCourant([]) === '');
check('niveau courant ignore les vides', niveauCourant([{ date: '2020-01-01', niveau: '' }]) === '');
check('niveau hors liste conservé',
  niveauCourant([{ date: '2020-01-01', niveau: 'Moniteur maison' }]) === 'Moniteur maison');

const rep = plongeesParNiveau(carnet);
check('répartition par niveau : 3 niveaux', rep.length === 3, JSON.stringify(rep));
check('répartition triée du plus haut', rep[0][0] === 'N3' && rep[0][1] === 2, JSON.stringify(rep));

// ------------------------------------------------------------
//  Regroupement par club
// ------------------------------------------------------------

const groupes = parClub([
  { nom: 'Durand', prenom: 'Anne', club: 'Cherbourg' },
  { nom: 'Bernard', prenom: 'Luc', club: '' },
  { nom: 'Albert', prenom: 'Zoé', club: 'Cherbourg' },
  { nom: 'Colin', prenom: 'Marc', club: 'Marseille' },
]);
check('clubs : 3 groupes', groupes.length === 3, groupes.map(g => g.titre).join(','));
check('clubs : ordre alphabétique', groupes[0].titre === 'Cherbourg', groupes[0].titre);
check('clubs : sans club en dernier', groupes[2].titre === 'Sans club', groupes[2].titre);
check('clubs : membres triés', groupes[0].membres[0].nom === 'Albert', groupes[0].membres[0].nom);
check('clubs : bon effectif', groupes[0].membres.length === 2);

// ------------------------------------------------------------
//  Palanquée
// ------------------------------------------------------------

check('plongée solo non proposée',
  !PALANQUEE_MODES.some(m => m.id === 'solo'),
  PALANQUEE_MODES.map(m => m.id).join(','));
check('modes de palanquée conservés',
  ['moniteur', 'chef', 'autonome2', 'autonome3', 'jeChef']
    .every(id => PALANQUEE_MODES.some(m => m.id === id)),
  PALANQUEE_MODES.map(m => m.id).join(','));

// ------------------------------------------------------------
//  Tri aquatique — entièrement déduit des bases, rien en dur
// ------------------------------------------------------------

const especes = await import(path.join(ROOT, 'js/species.js'));
const { distanceKm, versObservation, lienWrecksite, lienRechercheWeb, _interne } = especes;
const { estAquatique, estTerrestre, estFlore } = _interne;

check('aucune liste d’espèces codée en dur',
  !('TAXA' in especes), 'TAXA existe encore');

// Drapeaux réellement renvoyés par WoRMS (relevés sur l'API)
const rascasse  = { marin: true,  saumatre: true,  douce: false, terrestre: false, regne: 'Animalia' };
const posidonie = { marin: true,  saumatre: false, douce: false, terrestre: false, regne: 'Plantae' };
const goeland   = { marin: true,  saumatre: false, douce: false, terrestre: true,  regne: 'Animalia' };
const criste    = { marin: true,  saumatre: false, douce: false, terrestre: true,  regne: 'Plantae' };
const romarin   = { marin: false, saumatre: false, douce: false, terrestre: true,  regne: 'Plantae' };
const brochet   = { marin: false, saumatre: true,  douce: true,  terrestre: false, regne: 'Animalia' };
const anguille  = { marin: true,  saumatre: true,  douce: true,  terrestre: false, regne: 'Animalia' };
const limace    = { marin: false, saumatre: false, douce: false, terrestre: true,  regne: 'Animalia' };

check('mer : rascasse gardée', estAquatique(rascasse, 'salee'));
check('mer : posidonie gardée', estAquatique(posidonie, 'salee'));
check('mer : goéland écarté (marin ET terrestre)', !estAquatique(goeland, 'salee'));
check('mer : criste marine écartée (plante de falaise)', !estAquatique(criste, 'salee'));
check('mer : romarin écarté', !estAquatique(romarin, 'salee'));
check('mer : brochet écarté', !estAquatique(brochet, 'salee'));
check('mer : anguille gardée', estAquatique(anguille, 'salee'));

check('douce : brochet gardé', estAquatique(brochet, 'douce'));
check('douce : anguille gardée', estAquatique(anguille, 'douce'));
check('douce : rascasse écartée', !estAquatique(rascasse, 'douce'));
check('douce : limace terrestre écartée', !estAquatique(limace, 'douce'));
check('habitat inconnu : écarté par prudence', !estAquatique(null, 'salee'));

// Espèce strictement estuarienne : acceptée des deux côtés
const estuaire = { marin: false, saumatre: true, douce: false, terrestre: false };
check('estuaire : gardé en mer', estAquatique(estuaire, 'salee'));
check('estuaire : gardé en eau douce', estAquatique(estuaire, 'douce'));

// --- filtre large : n'écarte que ce qui est POSITIVEMENT terrestre ---
check('large : romarin écarté', estTerrestre(romarin));
check('large : limace écartée', estTerrestre(limace));
check('large : goéland gardé (aussi marin)', !estTerrestre(goeland));
check('large : habitat inconnu gardé', !estTerrestre(null));
check('large : habitat sans drapeau gardé', !estTerrestre({ via: 'inconnu' }));
check('large : rascasse gardée', !estTerrestre(rascasse));

check('flore : posidonie classée flore', estFlore({ groupe: 'Plantae' }, posidonie));
check('flore : rascasse classée faune', !estFlore({ groupe: 'Actinopterygii' }, rascasse));
check('flore : algue brune (Chromista) classée flore',
  estFlore({ groupe: 'Chromista' }, { regne: 'Chromista' }));
check('flore : repli sur iNaturalist si le règne manque',
  estFlore({ groupe: 'Plantae' }, { via: 'inconnu' }));

// ------------------------------------------------------------
//  Utilitaires
// ------------------------------------------------------------

// Marseille -> Cassis, environ 20 km
const dist = distanceKm(43.2965, 5.3698, 43.2148, 5.5381);
check('distance plausible', dist > 15 && dist < 25, String(dist));
check('distance nulle sur place', distanceKm(43, 5, 43, 5) === 0);

const obs = versObservation({ id: 42, nom: 'Murène commune', sci: 'Muraena helena',
  photo: 'p.jpg', photoGrande: 'grande.jpg', credit: 'CC-BY', observations: 473, source: 'inat' });
check('observation allégée : champs conservés',
  obs.nom === 'Murène commune' && obs.sci === 'Muraena helena' && obs.photo === 'p.jpg');
check('observation allégée : grande photo écartée',
  !('photoGrande' in obs) && !('observations' in obs), JSON.stringify(obs));

check('lien Wrecksite encodé',
  lienWrecksite('Le Liban').includes('Le%20Liban'), lienWrecksite('Le Liban'));
check('lien de recherche web construit',
  lienRechercheWeb('Beaumont-sur-Oise').includes('Beaumont-sur-Oise'),
  lienRechercheWeb('Beaumont-sur-Oise'));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith(' FAIL')).length;
console.log(failed ? `\n${failed} test(s) en échec` : '\nTous les tests de plongée passent.');
process.exit(failed ? 1 : 0);
