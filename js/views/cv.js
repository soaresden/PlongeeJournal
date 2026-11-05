// ============================================================
//  Qui je suis, en plongée
//
//  Une page à montrer à ceux avec qui on va plonger : niveau et son
//  équivalence, expérience, brevets, où j'ai plongé, mon matériel.
//  Dans la langue de la personne en face (sept langues).
//  Rien de privé ici : ni adresse, ni contact d'urgence.
// ============================================================

import { el, toast } from '../lib.js';
import { store } from '../store.js';
import { estBapteme } from '../model.js';
import { ambianceDe } from '../ambiance.js';
import { rangNiveau } from '../config.js';

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
  const mat = (diver?.materiel || []).map(m => ({ type: m.type, v: m.valeurs || {} }));
  const ordi = mat.find(m => m.type === 'ordinateur');
  const combi = mat.find(m => m.type === 'combinaison');
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
  };
}

export async function cvView() {
  const diverId = await store.getActiveDiverId();
  if (!diverId) return { title: 'Qui je suis', node: el('div.empty', { text: 'Crée d’abord ton profil.' }) };
  const p = profilPublic(await store.getDiver(diverId), await store.listDives(diverId), await store.listCertifications(diverId));
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

    const langues = el('div.cv-langues', {}, ...LANGUES.map(([id, nom, drapeau]) => el(`button.cat-filtre${id === langue ? '.on' : ''}`, {
      type: 'button', title: nom, onclick: () => { langue = id; try { localStorage.setItem(CLE_LANGUE, id); } catch { /* privé */ } rendre(); },
    }, drapeau, ' ', nom)));

    const chiffre = (n, l) => el('div.cv-chiffre', {}, el('b', { text: String(n) }), el('span', { text: l }));
    const texte = [
      t.phrase(p.prenom, p.niveau ? `${p.niveau}${CMAS[p.niveau] ? ` (${CMAS[p.niveau]})` : ''}` : '', p.n, annee),
      descNiv ? `${p.niveau} : ${descNiv}.` : '',
      `${t.profMax} : ${p.profMax} m · ${t.sousLEau} : ${heures} · ${t.derniere} : ${date(p.derniere)}.`,
      p.brevets.length ? `${t.brevets} : ${p.brevets.map(b => brevet(b.nom)).join(', ')}.` : '',
    ].filter(Boolean).join('\n');

    wrap.replaceChildren(
      langues,
      el('div.cv-carte', {},
        el('div.cv-tete', {},
          el('div.cv-badge', { text: p.niveau || '🤿' }),
          el('div', {},
            el('div.cv-nom', { text: `${p.prenom} ${p.nom}`.trim() }),
            el('div.cv-niveau', { text: [p.niveau ? `${t.plongeur} ${p.niveau}` : t.plongeur, CMAS[p.niveau]].filter(Boolean).join(' · ') }),
            descNiv ? el('div.cv-desc', { text: descNiv }) : null)),
        el('p.cv-phrase', { text: t.phrase(p.prenom, p.niveau, p.n, annee) }),
        el('div.cv-chiffres', {},
          chiffre(p.n, `${t.plongees} · ${t.depuis(annee)}`),
          chiffre(`${p.profMax} m`, t.profMax),
          chiffre(heures, t.sousLEau),
          chiffre(p.douzeMois, t.douzeMois),
          chiffre(p.mer, t.mer),
          p.douce ? chiffre(p.douce, t.douce) : null,
          p.nuit ? chiffre(p.nuit, t.nuit) : null,
          chiffre(ilYA(p.derniere) || '—', t.derniere)),
        p.brevets.length ? el('div.cv-bloc', {}, el('h3', { text: t.brevets }),
          el('div.cv-brevets', {}, ...p.brevets.map(b => el('div.cv-brevet', {},
            el('b', { text: brevet(b.nom) }),
            CMAS[b.nom] ? el('span', { text: `${t.equiv} ${CMAS[b.nom]}` }) : null,
            b.date ? el('span', { text: date(b.date) }) : null)))) : null,
        p.regions.length ? el('div.cv-bloc', {}, el('h3', { text: t.ou }),
          el('div.cv-regions', {}, ...p.regions.map(([id, n]) => el('span.cv-region', {},
            nomRegion(id), el('small', { text: String(n) }))))) : null,
        p.ordi || p.combi ? el('div.cv-bloc', {}, el('h3', { text: t.materiel }),
          el('div.cv-mat', {},
            p.ordi ? el('div', {}, el('span', { text: t.ordi }), el('b', { text: p.ordi })) : null,
            p.combi ? el('div', {}, el('span', { text: t.combi }), el('b', { text: p.combi })) : null)) : null),
      el('div.btn-row', {}, el('button.btn.sm', { type: 'button', text: `📋 ${t.copier}`, onclick: async () => {
        try { await navigator.clipboard.writeText(texte); toast(t.copie); } catch { toast(texte); }
      } })));
  }

  rendre();
  return { title: 'Qui je suis', back: true, node: wrap };
}
