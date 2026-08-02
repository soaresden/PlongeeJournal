// ============================================================
//  Listes de référence et réglages par défaut
//
//  ⚠️ Aucune clé ne se met dans ce fichier : les identifiants
//  Supabase se saisissent dans l'app (onglet Profil → Réglages),
//  ce qui permet à n'importe qui de recopier ce dépôt et de le
//  brancher sur SA propre base sans toucher au code.
//  Voir js/settings.js.
// ============================================================

import { settings } from './settings.js';

export const CONFIG = {
  // Vue par défaut de la carte (France) quand aucun lieu n'est choisi.
  defaultCenter: { lat: 46.6, lng: 2.4 },
  defaultZoom: 5,

  // Renseignée depuis l'écran Réglages ; vide = OpenStreetMap.
  get googleMapsKey() { return settings().googleMapsKey || ''; },
  get supabaseUrl()   { return settings().supabaseUrl || ''; },
  get supabaseAnonKey() { return settings().supabaseKey || ''; },
};

// --- Listes de référence, modifiables librement ---------------

export const DIVE_TYPES = [
  'Enseignement',
  'Exploration de jour',
  'Exploration de nuit',
];

// Le gaz respiré n'est pas une « option » de la plongée : c'est une
// caractéristique de la bouteille. Il vit donc dans Mon matériel.
export const DIVE_OPTIONS = [
  'Plongée profonde', 'Plongée sous glace', 'Plongée en altitude',
  'Plongée dérivante', 'Plongée en fosse', 'Plongée technique', 'Décompression',
];

/**
 * Gaz respiré. Chacun ouvre les champs qui lui sont propres :
 * inutile de demander un pourcentage d'hélium sur une plongée à l'air.
 */
export const GAZ = [
  { id: 'air',       label: 'Air',       o2: 21, he: 0,  melange: false },
  { id: 'nitrox',    label: 'Nitrox',    o2: 32, he: 0,  melange: true, champs: ['o2'] },
  { id: 'trimix',    label: 'Trimix',    o2: 21, he: 35, melange: true, champs: ['o2', 'he'] },
  { id: 'recycleur', label: 'Recycleur', o2: null, he: null, melange: true, champs: ['o2', 'he', 'setpoint'] },
];

export const gazParId = id => GAZ.find(g => g.id === id) || null;

export const BLOC_TYPES = ['Mono', 'Bi-bouteilles', 'Bloc relais', 'Side-mount'];
export const BLOC_MATIERES = ['Acier', 'Alu'];

/** Options posées automatiquement d'après les données de la plongée. */
export const OPTIONS_AUTO = [
  'Plongée profonde', 'Décompression', 'Plongée en altitude',
  'Plongée en fosse', 'Plongée sous glace', 'Plongée technique',
];

export const VISIBILITES = ['Compliquée', 'Correcte', 'Transparente'];
export const VISIBILITE_ICONES = {
  'Compliquée': '🌫', 'Correcte': '👁', 'Transparente': '💎',
};

/** Temps qu'il faisait en surface. */
export const METEO = [
  { id: 'soleil',  label: 'Soleil',   icone: '☀️' },
  { id: 'nuageux', label: 'Nuageux',  icone: '⛅' },
  { id: 'couvert', label: 'Couvert',  icone: '☁️' },
  { id: 'pluie',   label: 'Pluie',    icone: '🌧️' },
  { id: 'vent',    label: 'Vent',     icone: '🌬️' },
  { id: 'orage',   label: 'Orage',    icone: '⛈️' },
  { id: 'brume',   label: 'Brume',    icone: '🌁' },
  { id: 'neige',   label: 'Neige',    icone: '❄️' },
];

/** État de la mer / du plan d'eau. */
export const ETAT_MER = [
  { id: 'calme',   label: 'Calme',    icone: '🪞' },
  { id: 'ridee',   label: 'Ridée',    icone: '〰️' },
  { id: 'agitee',  label: 'Agitée',   icone: '🌊' },
  { id: 'forte',   label: 'Forte',    icone: '🌊🌊' },
];

export const COURANTS = [
  { id: 'nul',     label: 'Nul',      icone: '·' },
  { id: 'faible',  label: 'Faible',   icone: '→' },
  { id: 'soutenu', label: 'Soutenu',  icone: '⇉' },
  { id: 'fort',    label: 'Fort',     icone: '⇛' },
];

export const COMBI_TYPES = ['Humide', 'Semi-étanche', 'Étanche'];
export const COMBI_MM = ['3', '5', '5,5', '7', '7,5', '9'];

/**
 * Niveaux de plongeur, du plus bas au plus haut.
 * L'ordre sert à déduire le niveau courant d'un carnet : c'est le plus
 * élevé jamais saisi. La liste reste ouverte, un niveau non listé est
 * accepté et simplement placé en fin de classement.
 */
// « PN » = préparation au niveau : on plonge en formation, avant le brevet.
// Chaque PN se classe juste sous le niveau qu'il prépare.
export const NIVEAUX = [
  'Baptême',
  'PN1', 'N1', 'PE20', 'PA20',
  'PN2', 'N2', 'PE40', 'PA40',
  'PN3', 'N3', 'PE60',
  'PN4', 'N4', 'Guide de palanquée',
  'E1', 'Initiateur',
  'E2',
  'PN5', 'N5', 'E3', 'MF1',
  'E4', 'MF2',
  // Équivalences internationales courantes
  'Open Water', 'Advanced', 'Rescue', 'Divemaster', 'Instructeur',
];

/**
 * Types de matériel personnel.
 *
 * Chaque type décrit SES champs : demander une épaisseur à un phare ou
 * un modèle à une paire de palmes n'aurait pas de sens. Le formulaire
 * s'adapte donc au type choisi.
 *
 * kind : 'texte' | 'seg' | 'select' | 'nombre'
 */
const marque = { id: 'marque', label: 'Marque', kind: 'texte',
                 placeholder: 'Aqualung, Mares, Scubapro…' };
const modele = { id: 'modele', label: 'Modèle', kind: 'texte', placeholder: '' };

export const TYPES_MATERIEL = [
  {
    id: 'combinaison', label: 'Combinaison', icone: '🩱',
    champs: [
      { id: 'sousType', label: 'Type', kind: 'seg', options: COMBI_TYPES },
      { id: 'mm', label: 'Épaisseur', kind: 'select', options: COMBI_MM, suffixe: 'mm' },
      { ...marque, requis: false },
    ],
    resume: v => [v.sousType, v.mm ? `${v.mm} mm` : null, v.marque].filter(Boolean).join(' · '),
  },
  {
    id: 'detendeur', label: 'Détendeur', icone: '🫁',
    champs: [marque, modele],
    resume: v => [v.marque, v.modele].filter(Boolean).join(' '),
  },
  {
    id: 'masque', label: 'Masque', icone: '🥽',
    champs: [marque,
      { id: 'note', label: 'Personnalisation', kind: 'texte',
        placeholder: 'Couleur, verres correcteurs, jupe noire…' }],
    resume: v => [v.marque, v.note].filter(Boolean).join(' — '),
  },
  {
    id: 'palmes', label: 'Palmes', icone: '🦶',
    champs: [marque, { id: 'note', label: 'Note', kind: 'texte', placeholder: 'Chaussantes, réglables…' }],
    resume: v => [v.marque, v.note].filter(Boolean).join(' — '),
  },
  {
    id: 'phare', label: 'Phare', icone: '🔦',
    champs: [marque, modele],
    resume: v => [v.marque, v.modele].filter(Boolean).join(' '),
  },
  {
    id: 'camera', label: 'Caméra', icone: '📷',
    champs: [marque, modele],
    resume: v => [v.marque, v.modele].filter(Boolean).join(' '),
  },
  {
    id: 'ordinateur', label: 'Ordinateur', icone: '⌚',
    champs: [marque, modele],
    resume: v => [v.marque, v.modele].filter(Boolean).join(' '),
  },
  {
    id: 'gilet', label: 'Gilet / stab', icone: '🦺',
    champs: [marque, modele],
    resume: v => [v.marque, v.modele].filter(Boolean).join(' '),
  },
  {
    id: 'lestage', label: 'Lestage', icone: '🏋',
    champs: [
      { id: 'kg', label: 'Poids (kg)', kind: 'nombre', placeholder: '6' },
      { id: 'note', label: 'Répartition', kind: 'texte', placeholder: 'Ceinture + poches' },
    ],
    resume: v => [v.kg ? `${v.kg} kg` : null, v.note].filter(Boolean).join(' — '),
  },
  {
    id: 'parachute', label: 'Parachute', icone: '🎈',
    champs: [marque, { id: 'note', label: 'Couleur / taille', kind: 'texte', placeholder: 'Orange, 1,4 m' }],
    resume: v => [v.marque, v.note].filter(Boolean).join(' — '),
  },
  {
    id: 'couteau', label: 'Couteau', icone: '🔪',
    champs: [marque],
    resume: v => v.marque || '',
  },
  {
    id: 'autre', label: 'Autre', icone: '🎒',
    champs: [
      { id: 'nom', label: 'De quoi s’agit-il ?', kind: 'texte', placeholder: 'Compas, dévidoir…' },
      { id: 'note', label: 'Note', kind: 'texte', placeholder: '' },
    ],
    resume: v => [v.nom, v.note].filter(Boolean).join(' — '),
  },
];

export const typeMateriel = id => TYPES_MATERIEL.find(t => t.id === id)
  || { id, label: id || 'Matériel', icone: '🎒', champs: [marque], resume: v => v.marque || '' };

/** Rang d'un niveau : -1 si inconnu. */
export const rangNiveau = n => NIVEAUX.indexOf(String(n || '').trim());

/** Valeurs pré-remplies à la création d'une plongée. */
export const PRE_REMPLI = {
  pressionDepart: 200,
  pressionFin: 50,
};

export const DIVE_GOALS = [
  'Épaves', 'Poissons', 'Photo / vidéo', 'Grotte', 'Tombant', 'Récif',
  'Faune fixée', 'Nudibranches', 'Chasse', 'Orientation', 'Sauvetage',
  'Matelotage', 'Baptême', 'Formation N1', 'Formation N2', 'Formation N3',
  'Nettoyage', 'Archéologie',
];

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Pas de « solo » : la plongée solitaire n'est pas autorisée en
// structure, et le carnet n'a pas à la proposer.
export const PALANQUEE_MODES = [
  { id: 'moniteur',   label: 'Encadré par un moniteur' },
  { id: 'chef',       label: 'Guide de palanquée' },
  { id: 'autonome2',  label: 'Autonome à 2' },
  { id: 'autonome3',  label: 'Autonome à 3' },
  { id: 'jeChef',     label: "J'étais chef de palanquée" },
];
