// ============================================================
//  Qui je suis, en plongée
//
//  Une page à montrer à ceux avec qui on va plonger : niveau et son
//  équivalence, expérience, brevets, les pays (et la carte), ce que je porte.
//  Dans la langue de la personne en face (sept langues).
//  Rien de privé ici : ni adresse, ni contact d'urgence.
// ============================================================

import { el, toast } from '../lib.js';
import { store } from '../store.js';
import { estBapteme, libelleMateriel, valeursMateriel } from '../model.js';
import { paysDe } from '../secours.js';
import { piecesEquipees } from '../equipement.js';
import { cumulerALEcran } from './carte.js';
import { ambianceDe } from '../ambiance.js';
import { rangNiveau, typeMateriel } from '../config.js';

const CLE_LANGUE = 'plongee-journal:cv-langue';

export const LANGUES = [
  ['fr', 'Français', '🇫🇷'], ['en', 'English', '🇬🇧'], ['es', 'Español', '🇪🇸'], ['it', 'Italiano', '🇮🇹'],
  ['de', 'Deutsch', '🇩🇪'], ['pt', 'Português', '🇵🇹'], ['pl', 'Polski', '🇵🇱'],
];

const T = {
  fr: {
    titre: 'Qui je suis, en plongée', plongeur: 'Plongeur', depuis: a => `depuis ${a}`,
    phrase: (p, niv, n, a) => `Je m’appelle ${p}. ${niv ? `Je suis plongeur ${niv}, ` : ''}j’ai ${n} plongée${n > 1 ? 's' : ''} depuis ${a}.`,
    plongees: 'plongées', profMax: 'profondeur max', sousLEau: 'sous l’eau', derniere: 'dernière plongée',
    douzeMois: 'sur les 12 derniers mois', nuit: 'de nuit', mer: 'en mer', douce: 'en eau douce',
    brevets: 'Mes brevets', ou: 'Où j’ai plongé', materiel: 'Mon matériel', ordi: 'Ordinateur', combi: 'Combinaison',
    equiv: 'Équivalence', jours: j => `il y a ${j} jour${j > 1 ? 's' : ''}`, mois: m => `il y a ${m} mois`,
    copier: 'Copier le texte', copie: 'Texte copié', langue: 'Langue',
    niveaux: { N1: 'encadré jusqu’à 20 m', N2: 'autonome jusqu’à 20 m, encadré jusqu’à 40 m', N3: 'autonome jusqu’à 60 m', N4: 'guide de palanquée' },
    brevet: { Nitrox: 'Plongée au Nitrox', 'Nitrox confirmé': 'Nitrox confirmé', RIFAP: 'Secourisme plongée (RIFAP)' },
    regions: {},
  },
  en: {
    titre: 'About me as a diver', plongeur: 'Diver', depuis: a => `since ${a}`,
    phrase: (p, niv, n, a) => `I’m ${p}. ${niv ? `I’m an ${niv} diver ` : 'I’ve been diving '}with ${n} dive${n > 1 ? 's' : ''} logged since ${a}.`,
    plongees: 'dives', profMax: 'max depth', sousLEau: 'underwater', derniere: 'last dive',
    douzeMois: 'in the last 12 months', nuit: 'night dives', mer: 'in the sea', douce: 'in fresh water',
    brevets: 'Certifications', ou: 'Where I’ve dived', materiel: 'My gear', ordi: 'Computer', combi: 'Wetsuit',
    equiv: 'Equivalent', jours: j => `${j} day${j > 1 ? 's' : ''} ago`, mois: m => `${m} month${m > 1 ? 's' : ''} ago`,
    copier: 'Copy text', copie: 'Text copied', langue: 'Language',
    niveaux: { N1: 'supervised down to 20 m', N2: 'autonomous to 20 m, supervised to 40 m', N3: 'autonomous to 60 m', N4: 'dive leader' },
    brevet: { Nitrox: 'Nitrox diver', 'Nitrox confirmé': 'Advanced Nitrox', RIFAP: 'Dive rescue & first aid (RIFAP)' },
    regions: { caraibes: 'Caribbean', tropiques: 'Tropics', merRouge: 'Red Sea', med: 'Mediterranean', atlantique: 'Atlantic islands',
      nord: 'Channel & Atlantic', ocean: 'Ocean', douce: 'Lakes & quarries', fosse: 'Dive pit' },
  },
  es: {
    titre: 'Quién soy como buceador', plongeur: 'Buceador', depuis: a => `desde ${a}`,
    phrase: (p, niv, n, a) => `Me llamo ${p}. ${niv ? `Soy buceador ${niv} ` : 'Buceo '}con ${n} inmersi${n > 1 ? 'ones' : 'ón'} desde ${a}.`,
    plongees: 'inmersiones', profMax: 'profundidad máx.', sousLEau: 'bajo el agua', derniere: 'última inmersión',
    douzeMois: 'en los últimos 12 meses', nuit: 'nocturnas', mer: 'en el mar', douce: 'en agua dulce',
    brevets: 'Titulaciones', ou: 'Dónde he buceado', materiel: 'Mi equipo', ordi: 'Ordenador', combi: 'Traje',
    equiv: 'Equivalencia', jours: j => `hace ${j} día${j > 1 ? 's' : ''}`, mois: m => `hace ${m} mes${m > 1 ? 'es' : ''}`,
    copier: 'Copiar el texto', copie: 'Texto copiado', langue: 'Idioma',
    niveaux: { N1: 'guiado hasta 20 m', N2: 'autónomo hasta 20 m, guiado hasta 40 m', N3: 'autónomo hasta 60 m', N4: 'guía de grupo' },
    brevet: { Nitrox: 'Buceo con Nitrox', 'Nitrox confirmé': 'Nitrox avanzado', RIFAP: 'Rescate y primeros auxilios (RIFAP)' },
    regions: { caraibes: 'Caribe', tropiques: 'Trópicos', merRouge: 'Mar Rojo', med: 'Mediterráneo', atlantique: 'Islas atlánticas',
      nord: 'Canal de la Mancha y Atlántico', ocean: 'Océano', douce: 'Lagos y canteras', fosse: 'Foso de buceo' },
  },
  it: {
    titre: 'Chi sono come subacqueo', plongeur: 'Subacqueo', depuis: a => `dal ${a}`,
    phrase: (p, niv, n, a) => `Mi chiamo ${p}. ${niv ? `Sono subacqueo ${niv} ` : 'Faccio immersioni '}con ${n} immersion${n > 1 ? 'i' : 'e'} dal ${a}.`,
    plongees: 'immersioni', profMax: 'profondità max', sousLEau: 'sott’acqua', derniere: 'ultima immersione',
    douzeMois: 'negli ultimi 12 mesi', nuit: 'notturne', mer: 'in mare', douce: 'in acqua dolce',
    brevets: 'Brevetti', ou: 'Dove ho fatto immersioni', materiel: 'La mia attrezzatura', ordi: 'Computer', combi: 'Muta',
    equiv: 'Equivalenza', jours: j => `${j} giorn${j > 1 ? 'i' : 'o'} fa`, mois: m => `${m} mes${m > 1 ? 'i' : 'e'} fa`,
    copier: 'Copia il testo', copie: 'Testo copiato', langue: 'Lingua',
    niveaux: { N1: 'accompagnato fino a 20 m', N2: 'autonomo fino a 20 m, accompagnato fino a 40 m', N3: 'autonomo fino a 60 m', N4: 'guida di gruppo' },
    brevet: { Nitrox: 'Subacqueo Nitrox', 'Nitrox confirmé': 'Nitrox avanzato', RIFAP: 'Soccorso subacqueo (RIFAP)' },
    regions: { caraibes: 'Caraibi', tropiques: 'Tropici', merRouge: 'Mar Rosso', med: 'Mediterraneo', atlantique: 'Isole atlantiche',
      nord: 'Manica e Atlantico', ocean: 'Oceano', douce: 'Laghi e cave', fosse: 'Piscina profonda' },
  },
  de: {
    titre: 'Wer ich als Taucher bin', plongeur: 'Taucher', depuis: a => `seit ${a}`,
    phrase: (p, niv, n, a) => `Ich heiße ${p}. ${niv ? `Ich bin ${niv}-Taucher ` : 'Ich tauche '}mit ${n} Tauchgäng${n > 1 ? 'en' : ''} seit ${a}.`,
    plongees: 'Tauchgänge', profMax: 'max. Tiefe', sousLEau: 'unter Wasser', derniere: 'letzter Tauchgang',
    douzeMois: 'in den letzten 12 Monaten', nuit: 'Nachttauchgänge', mer: 'im Meer', douce: 'im Süßwasser',
    brevets: 'Tauchscheine', ou: 'Wo ich getaucht bin', materiel: 'Meine Ausrüstung', ordi: 'Tauchcomputer', combi: 'Anzug',
    equiv: 'Entspricht', jours: j => `vor ${j} Tag${j > 1 ? 'en' : ''}`, mois: m => `vor ${m} Monat${m > 1 ? 'en' : ''}`,
    copier: 'Text kopieren', copie: 'Text kopiert', langue: 'Sprache',
    niveaux: { N1: 'begleitet bis 20 m', N2: 'selbstständig bis 20 m, begleitet bis 40 m', N3: 'selbstständig bis 60 m', N4: 'Gruppenführer' },
    brevet: { Nitrox: 'Nitrox-Taucher', 'Nitrox confirmé': 'Advanced Nitrox', RIFAP: 'Tauchretter & Erste Hilfe (RIFAP)' },
    regions: { caraibes: 'Karibik', tropiques: 'Tropen', merRouge: 'Rotes Meer', med: 'Mittelmeer', atlantique: 'Atlantikinseln',
      nord: 'Ärmelkanal & Atlantik', ocean: 'Ozean', douce: 'Seen & Steinbrüche', fosse: 'Tauchturm' },
  },
  pt: {
    titre: 'Quem sou eu no mergulho', plongeur: 'Mergulhador', depuis: a => `desde ${a}`,
    phrase: (p, niv, n, a) => `Chamo-me ${p}. ${niv ? `Sou mergulhador ${niv} ` : 'Mergulho '}com ${n} mergulho${n > 1 ? 's' : ''} desde ${a}.`,
    plongees: 'mergulhos', profMax: 'profundidade máx.', sousLEau: 'debaixo de água', derniere: 'último mergulho',
    douzeMois: 'nos últimos 12 meses', nuit: 'noturnos', mer: 'no mar', douce: 'em água doce',
    brevets: 'Certificações', ou: 'Onde mergulhei', materiel: 'O meu equipamento', ordi: 'Computador', combi: 'Fato',
    equiv: 'Equivalência', jours: j => `há ${j} dia${j > 1 ? 's' : ''}`, mois: m => `há ${m} ${m > 1 ? 'meses' : 'mês'}`,
    copier: 'Copiar o texto', copie: 'Texto copiado', langue: 'Língua',
    niveaux: { N1: 'acompanhado até 20 m', N2: 'autónomo até 20 m, acompanhado até 40 m', N3: 'autónomo até 60 m', N4: 'guia de grupo' },
    brevet: { Nitrox: 'Mergulho com Nitrox', 'Nitrox confirmé': 'Nitrox avançado', RIFAP: 'Socorrismo de mergulho (RIFAP)' },
    regions: { caraibes: 'Caraíbas', tropiques: 'Trópicos', merRouge: 'Mar Vermelho', med: 'Mediterrâneo', atlantique: 'Ilhas atlânticas',
      nord: 'Canal da Mancha e Atlântico', ocean: 'Oceano', douce: 'Lagos e pedreiras', fosse: 'Poço de mergulho' },
  },
  pl: {
    titre: 'Kim jestem jako nurek', plongeur: 'Nurek', depuis: a => `od ${a}`,
    phrase: (p, niv, n, a) => `Nazywam się ${p}. ${niv ? `Jestem nurkiem ${niv}, ` : ''}mam ${n} nurkowa${n === 1 ? 'nie' : 'ń'} od ${a} roku.`,
    plongees: 'nurkowań', profMax: 'maks. głębokość', sousLEau: 'pod wodą', derniere: 'ostatnie nurkowanie',
    douzeMois: 'w ostatnich 12 miesiącach', nuit: 'nocnych', mer: 'w morzu', douce: 'w słodkiej wodzie',
    brevets: 'Uprawnienia', ou: 'Gdzie nurkowałem', materiel: 'Mój sprzęt', ordi: 'Komputer', combi: 'Pianka',
    equiv: 'Odpowiednik', jours: j => `${j} dni temu`, mois: m => `${m} mies. temu`,
    copier: 'Kopiuj tekst', copie: 'Skopiowano', langue: 'Język',
    niveaux: { N1: 'z przewodnikiem do 20 m', N2: 'samodzielnie do 20 m, z przewodnikiem do 40 m', N3: 'samodzielnie do 60 m', N4: 'przewodnik grupy' },
    brevet: { Nitrox: 'Nurek nitroksowy', 'Nitrox confirmé': 'Zaawansowany nitroks', RIFAP: 'Ratownictwo nurkowe (RIFAP)' },
    regions: { caraibes: 'Karaiby', tropiques: 'Tropiki', merRouge: 'Morze Czerwone', med: 'Morze Śródziemne', atlantique: 'Wyspy atlantyckie',
      nord: 'Kanał La Manche i Atlantyk', ocean: 'Ocean', douce: 'Jeziora i kamieniołomy', fosse: 'Basen do nurkowania' },
  },
};

/** FFESSM → CMAS : l'équivalence que tout le monde comprend. */
const CMAS = { N1: 'CMAS ★', N2: 'CMAS ★★', N3: 'CMAS ★★★', N4: 'CMAS ★★★' };

/** Le matériel, dans la langue d'en face (le français vient de config.js). */
const MAT = {
  en: { combinaison: 'Wetsuit', detendeur: 'Regulator', masque: 'Mask', palmes: 'Fins', phare: 'Torch', camera: 'Camera', ordinateur: 'Computer',
    gilet: 'BCD', lestage: 'Weights', parachute: 'SMB', couteau: 'Knife', autre: 'Other', Humide: 'Wet', 'Semi-étanche': 'Semi-dry', 'Étanche': 'Drysuit' },
  es: { combinaison: 'Traje', detendeur: 'Regulador', masque: 'Máscara', palmes: 'Aletas', phare: 'Linterna', camera: 'Cámara', ordinateur: 'Ordenador',
    gilet: 'Chaleco (BCD)', lestage: 'Lastre', parachute: 'Boya (SMB)', couteau: 'Cuchillo', autre: 'Otro', Humide: 'Húmedo', 'Semi-étanche': 'Semiseco', 'Étanche': 'Seco' },
  it: { combinaison: 'Muta', detendeur: 'Erogatore', masque: 'Maschera', palmes: 'Pinne', phare: 'Torcia', camera: 'Fotocamera', ordinateur: 'Computer',
    gilet: 'GAV (BCD)', lestage: 'Zavorra', parachute: 'Boa di segnalazione', couteau: 'Coltello', autre: 'Altro', Humide: 'Umida', 'Semi-étanche': 'Semistagna', 'Étanche': 'Stagna' },
  de: { combinaison: 'Anzug', detendeur: 'Atemregler', masque: 'Maske', palmes: 'Flossen', phare: 'Lampe', camera: 'Kamera', ordinateur: 'Tauchcomputer',
    gilet: 'Jacket (BCD)', lestage: 'Blei', parachute: 'Boje (SMB)', couteau: 'Messer', autre: 'Sonstiges', Humide: 'Nass', 'Semi-étanche': 'Halbtrocken', 'Étanche': 'Trocken' },
  pt: { combinaison: 'Fato', detendeur: 'Regulador', masque: 'Máscara', palmes: 'Barbatanas', phare: 'Lanterna', camera: 'Câmara', ordinateur: 'Computador',
    gilet: 'Colete (BCD)', lestage: 'Lastro', parachute: 'Boia (SMB)', couteau: 'Faca', autre: 'Outro', Humide: 'Húmido', 'Semi-étanche': 'Semisseco', 'Étanche': 'Seco' },
  pl: { combinaison: 'Pianka', detendeur: 'Automat', masque: 'Maska', palmes: 'Płetwy', phare: 'Latarka', camera: 'Aparat', ordinateur: 'Komputer',
    gilet: 'Jacket (BCD)', lestage: 'Balast', parachute: 'Boja (SMB)', couteau: 'Nóż', autre: 'Inne', Humide: 'Mokra', 'Semi-étanche': 'Półsucha', 'Étanche': 'Sucha' },
};
const TXT_TOUT = { fr: 'Tout', en: 'All', es: 'Todo', it: 'Tutto', de: 'Alle', pt: 'Tudo', pl: 'Wszystko' };
const TXT_PAYS = { fr: 'Pays', en: 'Countries', es: 'Países', it: 'Paesi', de: 'Länder', pt: 'Países', pl: 'Kraje' };
const TXT_PORTE = { fr: 'Ce que je porte', en: 'What I dive with', es: 'Con qué buceo', it: 'Con cosa mi immergo',
  de: 'Womit ich tauche', pt: 'Com o que mergulho', pl: 'W czym nurkuję' };

/** Drapeau emoji d'un code pays (FR → 🇫🇷). */
export const drapeau = code => String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));

/** Sans GPS : le pays d'après le nom du lieu ou l'adresse du centre. */
const MOTS = [
  [/martinique/i, 'MQ'], [/guadeloupe/i, 'GP'], [/r[ée]union/i, 'RE'],
  [/corfou|corfu|gr[eè]ce|greece|cr[eè]te|rhodes|zakynth/i, 'GR'], [/malte|malta|gozo/i, 'MT'], [/albanie|albania|himar/i, 'AL'],
  [/[ée]gypte|egypt|hurghada|urghada|marsa|sharm/i, 'EG'], [/cap[- ]?vert|cabo verde|santa maria/i, 'CV'],
  [/espagne|spain|canari|lanzarote|tenerife|minorque|menorca|majorque|mallorca|ibiza|gran canaria/i, 'ES'],
  [/portugal|a[çc]ores|azores|mad[èe]re|madeira/i, 'PT'], [/belgique|belgium/i, 'BE'], [/italie|italy|sardaigne|sicile|elbe/i, 'IT'],
  [/croatie|croatia/i, 'HR'], [/france|cherbourg|marseille|bretagne|corse/i, 'FR'],
];

/** Le pays d'une plongée (code ISO), ou null. */
export function paysPlongee(d) {
  if (d.lat != null && d.lng != null) {
    const p = paysDe(d.lat, d.lng);
    if (p && p.id !== 'AUTRE') {
      if (p.id !== 'FR') return p.id;
      if (d.lat < -10) return 'RE';
      if (d.lng < -55) return d.lat < 15.3 ? 'MQ' : 'GP';
      return 'FR';
    }
  }
  const texte = [d.lieuNom, d.lieuDetail, d.site, d.centreNom, d.centreAdresse].filter(Boolean).join(' ');
  return MOTS.find(([re]) => re.test(texte))?.[1] || null;
}

const lireLangue = () => { try { return localStorage.getItem(CLE_LANGUE) || 'fr'; } catch { return 'fr'; } };

const LOCALES = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', it: 'it-IT', de: 'de-DE', pt: 'pt-PT', pl: 'pl-PL' };

/** Les chiffres de la page, sans dépendre de la langue. */
export function profilPublic(diver, dives, certifs, aujourdhui = new Date()) {
  const vraies = dives.filter(d => !estBapteme(d));
  const dates = vraies.map(d => d.date).filter(Boolean).sort();
  const il12 = new Date(aujourdhui); il12.setFullYear(il12.getFullYear() - 1);
  const debut12 = il12.toISOString().slice(0, 10);
  const parRang = certifs.slice().sort((a, b) => rangNiveau(b.nom) - rangNiveau(a.nom));
  const niveau = parRang.find(c => /^N[1-4]$/.test(c.nom))?.nom || diver?.niveau || '';
  const regions = {};
  vraies.forEach(d => { const id = ambianceDe(d).id; if (id !== 'aPreciser') regions[id] = (regions[id] || 0) + 1; });
  const portes = piecesEquipees(diver);
  const mat = portes.map(m => ({ type: m.type, v: valeursMateriel(m) }));
  const ordi = mat.find(m => m.type === 'ordinateur');
  const combi = mat.find(m => m.type === 'combinaison');
  const pays = {};
  vraies.forEach(d => { const c = paysPlongee(d); if (c) pays[c] = (pays[c] || 0) + 1; });
  const lieux = new Map();
  vraies.filter(d => d.lat != null && d.lng != null).forEach(d => {
    const cle = `${d.lat.toFixed(3)},${d.lng.toFixed(3)}`;
    if (!lieux.has(cle)) lieux.set(cle, { lat: d.lat, lng: d.lng, nom: d.lieuNom || '', pays: paysPlongee(d), plongees: [] });
    lieux.get(cle).plongees.push(d.id);
  });
  return {
    prenom: diver?.prenom || '', nom: diver?.nom || '', niveau,
    n: vraies.length,
    premiere: dates[0] || null, derniere: dates[dates.length - 1] || null,
    profMax: Math.max(0, ...vraies.map(d => Number(d.profMax) || 0)),
    minutes: vraies.reduce((s, d) => s + (Number(d.dureeMin) || 0), 0),
    douzeMois: vraies.filter(d => (d.date || '') >= debut12).length,
    nuit: vraies.filter(d => /nuit/i.test(d.type || '')).length,
    mer: vraies.filter(d => d.eau === 'salee').length,
    douce: vraies.filter(d => d.eau === 'douce').length,
    brevets: certifs.slice().sort((a, b) => (a.dateObtention || '9').localeCompare(b.dateObtention || '9')).map(c => ({ nom: c.nom, date: c.dateObtention || '' })),
    regions: Object.entries(regions).sort((a, b) => b[1] - a[1]),
    ordi: ordi ? [ordi.v.marque, ordi.v.modele].filter(Boolean).join(' ') : '',
    combi: combi ? [combi.v.sousType, combi.v.mm ? `${combi.v.mm} mm` : '', combi.v.marque].filter(Boolean).join(' · ') : '',
    pays: Object.entries(pays).sort((a, b) => b[1] - a[1]),
    lieux: [...lieux.values()].sort((a, b) => b.plongees.length - a.plongees.length),
    // « Autre » (un câble, un flasheur…) n'intéresse pas ceux d'en face.
    equipe: portes.filter(m => m.type !== 'autre').map(m => ({ type: m.type, valeurs: valeursMateriel(m), libelle: libelleMateriel(m) })),
  };
}

export async function cvView() {
  const diverId = await store.getActiveDiverId();
  if (!diverId) return { title: 'Qui je suis', node: el('div.empty', { text: 'Crée d’abord ton profil.' }) };
  const diver = await store.getDiver(diverId);
  const p = profilPublic(diver, await store.listDives(diverId), await store.listCertifications(diverId));
  let carte = null;
  const wrap = el('div.cv');
  let langue = lireLangue();

  function rendre() {
    const t = T[langue] || T.fr;
    const loc = LOCALES[langue] || 'fr-FR';
    const annee = p.premiere ? p.premiere.slice(0, 4) : '—';
    const date = iso => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const ilYA = iso => {
      if (!iso) return '';
      const j = Math.round((Date.now() - Date.parse(`${iso}T12:00:00`)) / 864e5);
      return j < 60 ? t.jours(Math.max(0, j)) : t.mois(Math.round(j / 30.4));
    };
    const heures = `${Math.floor(p.minutes / 60)} h ${String(p.minutes % 60).padStart(2, '0')}`;
    const descNiv = t.niveaux[p.niveau] || T.fr.niveaux[p.niveau] || '';
    const brevet = nom => t.brevet[nom] || (CMAS[nom] ? `${nom} FFESSM` : nom);
    const nomRegion = id => t.regions[id] || ({ caraibes: 'Caraïbes', tropiques: 'Tropiques', merRouge: 'Mer Rouge', med: 'Méditerranée',
      atlantique: 'Îles atlantiques', nord: 'Manche & Atlantique', ocean: 'Océan', douce: 'Lac & carrière', fosse: 'Fosse' }[id] || id);

    const langues = el('div.cv-langues', {}, ...LANGUES.map(([id, nom, drapeau]) => el(`button.cv-langue${id === langue ? '.on' : ''}`, {
      type: 'button', title: nom, 'aria-label': nom, onclick: () => { langue = id; try { localStorage.setItem(CLE_LANGUE, id); } catch { /* privé */ } rendreTout(); },
    }, drapeau)));

    const nomPays = code => { try { return new Intl.DisplayNames([loc], { type: 'region' }).of(code); } catch { return code; } };
    const nomMat = type => MAT[langue]?.[type] || typeMateriel(type).label;
    const libelle = m => (MAT[langue] && m.type === 'combinaison'
      ? [MAT[langue][m.valeurs.sousType] || m.valeurs.sousType, m.valeurs.mm ? `${m.valeurs.mm} mm` : '', m.valeurs.marque].filter(Boolean).join(' · ')
      : m.libelle);
    const boiteCarte = p.lieux.length ? el('div.cv-monde') : null;
    const zoomPays = code => {
      if (!carte) return;
      const pts = p.lieux.filter(l => !code || l.pays === code).map(l => [l.lat, l.lng]);
      if (pts.length) carte.flyToBounds(pts, { padding: [30, 30], maxZoom: code ? 10 : 6, duration: 0.6 });
    };
    const chiffre = (n, l) => el('div.cv-chiffre', {}, el('b', { text: String(n) }), el('span', { text: l }));
    const texte = [
      t.phrase(p.prenom, p.niveau ? `${p.niveau}${CMAS[p.niveau] ? ` (${CMAS[p.niveau]})` : ''}` : '', p.n, annee),
      descNiv ? `${p.niveau} : ${descNiv}.` : '',
      `${t.profMax} : ${p.profMax} m · ${t.sousLEau} : ${heures} · ${t.derniere} : ${date(p.derniere)}.`,
      p.brevets.length ? `${t.brevets} : ${p.brevets.map(b => brevet(b.nom)).join(', ')}.` : '',
      p.pays.length ? `${TXT_PAYS[langue] || TXT_PAYS.fr} : ${p.pays.map(([c, n]) => `${drapeau(c)} ${nomPays(c)} (${n})`).join(', ')}.` : '',
    ].filter(Boolean).join('\n');

    // Tout tient sur un écran, sans défiler : l'essentiel en haut, les pays
    // en drapeaux, la carte prend la place qui reste.
    const copier = el('button.btn.sm.ghost.cv-copier', { type: 'button', title: t.copier, 'aria-label': t.copier, text: '📋',
      onclick: async () => { try { await navigator.clipboard.writeText(texte); toast(t.copie); } catch { toast(texte); } } });
    const infos = el('div.cv-infos', {},
      el('div.cv-tete', {},
        el('div.cv-badge', { text: p.niveau || '🤿' }),
        el('div.cv-ident', {},
          el('div.cv-nom', { text: `${p.prenom} ${p.nom}`.trim() }),
          el('div.cv-niveau', { text: [p.niveau ? `${t.plongeur} ${p.niveau}` : t.plongeur, CMAS[p.niveau]].filter(Boolean).join(' · ') }),
          descNiv ? el('div.cv-desc', { text: descNiv }) : null)),
      el('div.cv-chiffres', {},
        chiffre(p.n, `${t.plongees} · ${t.depuis(annee)}`),
        chiffre(`${p.profMax} m`, t.profMax),
        chiffre(heures, t.sousLEau),
        chiffre(ilYA(p.derniere) || '—', t.derniere)),
      // Le reste en une ligne : la place va aux pays et à la carte.
      el('div.cv-plus', { text: [`${p.douzeMois} ${t.douzeMois}`, `${p.mer} ${t.mer}`,
        p.douce ? `${p.douce} ${t.douce}` : '', p.nuit ? `${p.nuit} ${t.nuit}` : ''].filter(Boolean).join(' · ') }),
      p.brevets.length ? el('div.cv-ligne', {}, el('h3', { text: t.brevets }),
        el('div.cv-puces.cv-defile', {}, ...p.brevets.map(b => el('span.cv-brevet', { title: b.date ? date(b.date) : '' },
          el('b', { text: brevet(b.nom) }), CMAS[b.nom] ? el('small', { text: CMAS[b.nom] }) : null)))) : null,
      p.pays.length ? el('div.cv-ligne', {}, el('h3', { text: `${t.ou} · ${p.pays.length} ${(TXT_PAYS[langue] || TXT_PAYS.fr).toLowerCase()}` }),
        el('div.cv-pays', {},
          ...p.pays.map(([code, n]) => el('button.cv-pays-puce', { type: 'button', title: `${nomPays(code)} · ${n}`, onclick: () => zoomPays(code) },
            el('span.cv-drapeau', { text: drapeau(code) }), el('span.cv-pays-nom', { text: nomPays(code) }), el('small', { text: String(n) }))),
          boiteCarte && p.pays.length > 1 ? el('button.cv-pays-puce', { type: 'button', onclick: () => zoomPays(null) },
            el('span.cv-drapeau', { text: '🌍' }), el('span', { text: TXT_TOUT[langue] || TXT_TOUT.fr })) : null)) : null,
      p.equipe.length ? el('div.cv-ligne', {}, el('h3', { text: TXT_PORTE[langue] || TXT_PORTE.fr }),
        el('div.cv-puces.cv-mat', {}, ...p.equipe.map(m => el('span.cv-mat-puce', { title: nomMat(m.type) },
          `${typeMateriel(m.type).icone} `, el('b', { text: libelle(m) }))))) : null);

    wrap.replaceChildren(
      el('div.cv-barre', {}, langues, copier),
      el('div.cv-carte', {}, infos, boiteCarte || el('div.cv-monde.vide')));
    requestAnimationFrame(ajusterHauteur);
  }

  /** La page prend exactement la hauteur visible de l'écran. */
  function ajusterHauteur() {
    const vue = document.getElementById('view');
    if (!vue || !wrap.isConnected) return;
    const cs = getComputedStyle(vue);
    const h = vue.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    wrap.style.height = `${Math.max(420, Math.floor(h))}px`;
    carte?.invalidateSize();
  }
  // La hauteur change aussi quand le bandeau du haut apparaît ou part.
  const vueObs = document.getElementById('view');
  if (vueObs && typeof ResizeObserver === 'function') {
    const obs = new ResizeObserver(() => { if (wrap.isConnected) ajusterHauteur(); else obs.disconnect(); });
    obs.observe(vueObs);
  } else window.addEventListener('resize', () => { if (wrap.isConnected) ajusterHauteur(); });

  /** La carte des spots : on zoome, les spots proches se cumulent. */
  function poserCarte() {
    const boite = wrap.querySelector('.cv-monde:not(.vide)');
    if (carte) { carte.remove(); carte = null; }
    if (!boite || typeof L === 'undefined') return;
    carte = L.map(boite, { zoomControl: true, attributionControl: false, gestureHandling: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(carte);
    const couche = L.layerGroup().addTo(carte);
    const placer = () => {
      couche.clearLayers();
      cumulerALEcran(p.lieux, l => carte.project([l.lat, l.lng]), 34).forEach(a => {
        const n = a.n;
        const noms = a.lieux.map(l => l.nom).filter(Boolean);
        const code = a.lieux[0].pays;
        const taille = 24 + Math.min(16, n);
        L.marker([a.lat, a.lng], { icon: L.divIcon({ className: 'cv-repere', html: `<span>${n}</span>`, iconSize: [taille, taille] }) })
          .bindTooltip(`${code ? drapeau(code) + ' ' : ''}${noms.slice(0, 3).join(' · ')}${noms.length > 3 ? '…' : ''}` || String(n), { direction: 'top' })
          .on('click', () => {
            if (a.lieux.length > 1) carte.flyToBounds(a.lieux.map(l => [l.lat, l.lng]), { padding: [40, 40], maxZoom: 12, duration: 0.5 });
          })
          .addTo(couche);
      });
    };
    carte.fitBounds(p.lieux.map(l => [l.lat, l.lng]), { padding: [24, 24], maxZoom: 6 });
    carte.on('zoomend', placer);
    placer();
    setTimeout(() => carte && carte.invalidateSize(), 120);
  }

  const rendreTout = () => { rendre(); requestAnimationFrame(poserCarte); };
  rendreTout();
  return { title: 'Qui je suis', back: true, node: wrap };
}
