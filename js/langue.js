// ============================================================
//  English, please : l'appli en anglais, d'un interrupteur
//
//  Les écrans sont écrits en français. Plutôt que de tout réécrire, une
//  couche traduit ce qui s'affiche (textes, titres, textes d'aide des
//  champs) d'après un dictionnaire, au fil des changements de l'écran.
//  Ce qui n'est pas au dictionnaire reste en français : on le complète
//  au fur et à mesure. Revenir au français recharge la page.
// ============================================================

const CLE = 'plongee-journal:langue';
export const langue = () => { try { return localStorage.getItem(CLE) === 'en' ? 'en' : 'fr'; } catch { return 'fr'; } };

/** Textes exacts (sans les espaces autour). */
const MOTS = {
  // Barre du bas, en-têtes
  'Plongées': 'Dives', 'Stats': 'Stats', 'Plongeurs': 'Divers', 'Profil': 'Profile', 'Thème': 'Theme', 'Réglages': 'Settings',
  'Nouvelle': 'New', 'Nouvelle plongée': 'New dive', 'Carnet de plongée': 'Dive log', 'Fosses': 'Pool', 'Séances': 'Sessions',
  'Liste': 'List', 'Agenda': 'Calendar', 'Carte': 'Map', 'Miis': 'Miis', 'Qui je suis': 'About me', 'Mon journal de plongée': 'My dive log',
  // Fiche
  '✎ Modifier': '✎ Edit', '↪ En séance': '↪ Move to sessions', '🗑 Supprimer': '🗑 Delete', 'Supprimer': 'Delete', '🕘 Historique': '🕘 History',
  'La plongée, d’après la montre': 'The dive, from the watch', 'Les chiffres': 'Numbers', 'Données': 'Data', 'Ma plongée': 'My dive',
  'Conditions': 'Conditions', 'Palanquée': 'Buddy team', 'Lieu': 'Place', 'Matériel': 'Gear', 'Vidéos': 'Videos', 'Notes': 'Notes',
  'Page du carnet papier': 'Paper logbook page', '📓 Page du carnet papier': '📓 Paper logbook page', '⚠ À vérifier': '⚠ To check',
  'au fond': 'bottom time', 'prof. max': 'max depth', 'prof. moyenne': 'avg depth', 'eau': 'water', 'bar': 'bar',
  'conso (surface)': 'gas use (surface)', 'd’air respiré': 'of gas breathed', 'réserve 50 bar': '50 bar reserve', 'remontée max': 'max ascent',
  'palier de sécurité': 'safety stop', 'sans palier (mini)': 'no-deco (min)', 'cœur moy. / max': 'heart avg / max', 'gaz': 'gas',
  '🌡 Température': '🌡 Temperature', '🛢 Bouteille': '🛢 Tank', '💨 Conso': '💨 Gas use', '❤️ Cœur': '❤️ Heart', '⏱ Sans palier': '⏱ No-deco',
  'Courbe de plongée': 'Dive profile', 'Température': 'Temperature', 'Cœur': 'Heart rate', 'Point GPS': 'GPS point',
  'Temps sans palier / plafond': 'No-deco time / ceiling', 'Gaz': 'Gas', 'Bloc': 'Tank', 'Pression': 'Pressure', 'Consommation': 'Gas use',
  'Lestage': 'Weights', 'Combinaison': 'Wetsuit', 'Ouvrir dans Maps': 'Open in Maps', 'Encadré par un moniteur': 'Guided by an instructor',
  'Guide de palanquée': 'Dive guide', 'Autonome à 2': 'Buddy pair', 'Autonome à 3': 'Group of 3', 'J’étais chef de palanquée': 'I led the dive',
  'Moniteur (nom inconnu)': 'Instructor (name unknown)', 'Palanquée à compléter': 'Buddies to add',
  'Exploration de jour': 'Day dive', 'Exploration de nuit': 'Night dive', 'Enseignement': 'Training', 'Explo jour': 'Day', 'Explo nuit': 'Night',
  'Lieu non précisé': 'Unknown place', 'Air': 'Air', 'Eau salée': 'Salt water', 'Eau douce': 'Fresh water',
  'Tropiques': 'Tropics', 'Caraïbes': 'Caribbean', 'Mer Rouge': 'Red Sea', 'Méditerranée': 'Mediterranean', 'Îles atlantiques': 'Atlantic islands',
  'Manche & Atlantique': 'Channel & Atlantic', 'Océan': 'Ocean', 'Lac & carrière': 'Lake & quarry', 'Fosse': 'Dive pool', 'Eau à préciser': 'Water unknown',
  // Ressentis, conditions
  'Plongée de rêve': 'Dream dive', 'Détendu': 'Relaxed', 'Bonne stab': 'Good buoyancy', 'Bonne conso': 'Low gas use', 'Froid': 'Cold',
  'Fatigué': 'Tired', 'Stressé': 'Stressed', 'Oreilles': 'Ears', 'Mal de mer': 'Seasick', 'Trop lesté': 'Overweighted',
  'Pas assez lesté': 'Underweighted', 'Souci de matériel': 'Gear issue', 'Soleil': 'Sunny', 'Nuageux': 'Cloudy', 'Couvert': 'Overcast',
  'Pluie': 'Rain', 'Vent': 'Wind', 'Orage': 'Storm', 'Brume': 'Mist', 'Neige': 'Snow', 'Calme': 'Calm', 'Ridée': 'Rippled', 'Agitée': 'Choppy',
  'Forte': 'Rough', 'Nul': 'None', 'Faible': 'Light', 'Soutenu': 'Moderate', 'Fort': 'Strong', 'Compliquée': 'Poor', 'Correcte': 'Fair', 'Transparente': 'Crystal clear',
  // Formulaire
  '✓ Terminé': '✓ Done', 'Enregistrer la plongée': 'Save dive', 'La plongée': 'The dive', 'Plongeurs ': 'Divers', 'Type de plongée': 'Dive type',
  'Mon niveau ce jour-là': 'My level that day', 'Date': 'Date', 'N° (automatique)': 'No. (automatic)', 'Lieu de plongée': 'Dive site area', 'Site': 'Site',
  'Nature de l’eau': 'Water', 'Immersion': 'Entry', 'Durée (min)': 'Duration (min)', 'Fin de plongée': 'Exit', 'Profondeur max (m)': 'Max depth (m)',
  'Organisation de la palanquée': 'Team set-up', 'Centre de plongée': 'Dive centre', 'Ma note': 'My rating', 'Comment c’était': 'How it was',
  'Météo en surface': 'Weather', 'État de l’eau': 'Sea state', 'Visibilité': 'Visibility', 'Courant': 'Current', 'Air (°C)': 'Air (°C)',
  'Surface (°C)': 'Surface (°C)', 'Fond (°C)': 'Bottom (°C)', 'Spécificités': 'Specifics', 'Mon matériel': 'My gear', 'Épaisseur': 'Thickness',
  'Gaz respiré': 'Breathing gas', 'Type': 'Type', 'Matière': 'Material', 'Volume (L)': 'Volume (L)', 'Pression départ (bar)': 'Start pressure (bar)',
  'Pression fin (bar)': 'End pressure (bar)', 'Humide': 'Wet', 'Semi-étanche': 'Semi-dry', 'Étanche': 'Drysuit', '— non noté —': '— not noted —',
  'Masque': 'Mask', 'Détendeur': 'Regulator', 'Stab': 'BCD', 'Ordinateur': 'Computer', 'Phare': 'Torch', 'Caméra': 'Camera',
  'Parachute': 'SMB', 'Couteau': 'Knife', 'Palmes': 'Fins', '⌚ De la montre': '⌚ From the watch',
  // Plongeurs, profil, stats
  'Ajouter': 'Add', 'Annuler': 'Cancel', 'Fermer': 'Close', 'Enregistrer': 'Save', 'Renommer': 'Rename', 'Genre': 'Gender',
  'Homme': 'Man', 'Femme': 'Woman', 'Moniteurs': 'Instructors', 'Tous': 'All', 'Avec qui': 'With', 'Plongées ensemble': 'Dives together',
  'Identité': 'Identity', 'Mes diplômes': 'My certifications', 'Cartes & certifications': 'Cards & certifications', 'Raccourcis': 'Shortcuts',
  'Ma montre': 'My watch', 'Compte Suunto': 'Suunto account', 'Mes vidéos': 'My videos', 'Mon matériel ': 'My gear', 'Fiche d’urgence': 'Emergency card',
  'Personne à prévenir': 'Emergency contact', 'Fiche complète ›': 'Full sheet ›', 'Tout modifier': 'Edit all',
  'Chercher un lieu, un compagnon, une observation…': 'Search a place, a buddy, a note…', 'Lecture': 'Read-only',
  'Carnet partagé — lecture seule': 'Shared logbook — read-only', 'Partagé en lecture seule : tu peux tout regarder, rien n’est modifiable.':
    'Shared read-only: you can look at everything, nothing can be changed.', 'Mon agenda': 'My calendar',
  'Plongée': 'Dive', 'Séance': 'Session', 'Piscine': 'Pool', 'Apnée': 'Freediving', 'Snorkeling': 'Snorkeling',
  'Bi-bouteilles': 'Twin tanks', 'Mono': 'Single tank', 'Acier': 'Steel', 'Alu': 'Aluminium', 'Nitrox': 'Nitrox', 'Trimix': 'Trimix', 'Recycleur': 'Rebreather',
  'Profondeur': 'Depth', 'Durée': 'Duration', 'Plongées par année': 'Dives per year', 'Pays': 'Countries', 'Brevets': 'Certifications',
  'Mes vidéos (pCloud)': 'My videos (pCloud)', 'Ouvrir dans pCloud ↗': 'Open in pCloud ↗', 'Changer': 'Change', '＋ Dossier': '＋ Folder',
  // Accueil du visiteur
  'Prénom': 'First name', 'Date d’une plongée ensemble': 'Date of a dive together', 'Où ?': 'Where?', 'Entrer': 'Enter',
  '📱 QR code': '📱 QR code', 'Scanne pour ouvrir ce carnet': 'Scan to open this logbook',
};

/** Textes qui contiennent des nombres ou des noms. */
const MOTIFS = [
  [/^(\d+) plongées?$/, (_, n) => `${n} dive${n > 1 ? 's' : ''}`],
  [/^(\d+) plongées? · max ([\d.,]+) m(?: · (\d+) h)?$/, (_, n, p, h) => `${n} dive${n > 1 ? 's' : ''} · max ${p} m${h ? ` · ${h} h` : ''}`],
  [/^(.+) · (\d+) plongées?$/, (_, a, n) => `${a} · ${n} dive${n > 1 ? 's' : ''}`],
  [/^Plongée n°(\d+)$/, (_, n) => `Dive #${n}`],
  [/^Carnet de (.+)$/, (_, p) => `${p}'s dive log`],
  [/^🤿 Le carnet de plongée de (.+)$/, (_, p) => `🤿 ${p}'s dive log`],
  [/^Pour entrer : ton prénom, et une plongée qu’on a faite ensemble — la date et le lieu \(ou le pays\)\.$/, () => 'To come in: your first name, and a dive we did together — the date and the place (or the country).'],
  [/^Je ne retrouve pas cette plongée avec (.+)\. .*$/, (_, p) => `I can't find that dive with ${p}. Check the date (within a few days) and the place, or try the country.`],
  [/^(\d+) min$/, (_, n) => `${n} min`],
  [/^Venue de la montre \(Bluetooth\)\.$/, () => 'From the watch (Bluetooth).'], [/^Venue du compte Suunto\.$/, () => 'From the Suunto account.'],
  [/^Venue de l’export Suunto\.$/, () => 'From the Suunto export.'], [/^Saisie à la main\.$/, () => 'Entered by hand.'],
  [/^Immersion (\d\d:\d\d)(?:, sortie (\d\d:\d\d))?(.*)$/, (_, a, b, r) => `Entry ${a}${b ? `, exit ${b}` : ''}${r}`],
  [/^(.*)lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/, null],
];
const JOURS = { lundi: 'Monday', mardi: 'Tuesday', mercredi: 'Wednesday', jeudi: 'Thursday', vendredi: 'Friday', samedi: 'Saturday', dimanche: 'Sunday' };
const MOIS = { janvier: 'January', février: 'February', mars: 'March', avril: 'April', mai: 'May', juin: 'June', juillet: 'July', août: 'August',
  septembre: 'September', octobre: 'October', novembre: 'November', décembre: 'December' };

const MOIS_COURTS = { 'janv.': 'Jan', 'févr.': 'Feb', 'mars': 'Mar', 'avr.': 'Apr', 'mai': 'May', 'juin': 'Jun', 'juil.': 'Jul',
  'août': 'Aug', 'sept.': 'Sep', 'oct.': 'Oct', 'nov.': 'Nov', 'déc.': 'Dec' };

/** Une phrase française → anglaise (ou elle-même si inconnue). */
export function traduire(texte) {
  const t = String(texte ?? '');
  const brut = t.trim();
  if (!brut) return t;
  const avant = t.slice(0, t.indexOf(brut)), apres = t.slice(t.indexOf(brut) + brut.length);
  // Dates courtes d'abord (« 30 août – 3 sept. »), puis le reste de la phrase.
  const net = brut.replace(/(\d{1,2}) (janv\.|févr\.|mars|avr\.|mai|juin|juil\.|août|sept\.|oct\.|nov\.|déc\.)/g, (_, j, m) => `${j} ${MOIS_COURTS[m]}`);
  const change = net !== brut;
  if (MOTS[net]) return avant + MOTS[net] + apres;
  for (const [re, f] of MOTIFS) {
    if (!f) continue;
    const m = re.exec(net);
    if (m) return avant + f(...m) + apres;
  }
  // Dates longues : « dimanche 8 novembre 2026 » → « Sunday 8 November 2026 »
  const d = /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) (\d{1,2}) ([a-zéû]+) (\d{4})(.*)$/.exec(net);
  if (d && MOIS[d[3]]) return `${avant}${JOURS[d[1]]} ${d[2]} ${MOIS[d[3]]} ${d[4]}${d[5]}${apres}`;
  // Une icône devant (« ☰ Liste », « 🛢 Bouteille ») : on traduit le reste.
  const ic = /^([^\p{L}\p{N}]+\s*)(\p{L}.*)$/u.exec(net);
  if (ic) { const r = traduire(ic[2]); if (r !== ic[2]) return avant + ic[1] + r + apres; }
  return change ? avant + net + apres : t;
}

const ATTRIBUTS = ['placeholder', 'title', 'aria-label'];
const PASSER = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);

function traduireNoeud(racine) {
  if (racine.nodeType === 3) {
    const n = traduire(racine.nodeValue);
    if (n !== racine.nodeValue) racine.nodeValue = n;
    return;
  }
  if (racine.nodeType !== 1 || PASSER.has(racine.tagName) || racine.isContentEditable) return;
  for (const a of ATTRIBUTS) {
    const v = racine.getAttribute?.(a);
    if (v) { const n = traduire(v); if (n !== v) racine.setAttribute(a, n); }
  }
  if (racine.tagName === 'INPUT' && ['button', 'submit'].includes(racine.type) && racine.value) racine.value = traduire(racine.value);
  for (const enfant of racine.childNodes) traduireNoeud(enfant);
}

let observateur = null;

/** À l'ouverture : en anglais si c'est le choix, et au fil des changements. */
export function appliquerLangue() {
  if (langue() !== 'en' || typeof document === 'undefined') return;
  document.documentElement.lang = 'en';
  traduireNoeud(document.body);
  if (observateur) return;
  observateur = new MutationObserver(liste => {
    for (const m of liste) {
      if (m.type === 'characterData') traduireNoeud(m.target);
      else if (m.type === 'attributes') traduireNoeud(m.target);
      else m.addedNodes.forEach(traduireNoeud);
    }
  });
  observateur.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTS });
  const titre = document.title;
  document.title = titre.split(' · ').map(traduire).join(' · ');
}

/** L'interrupteur 🇫🇷 / 🇬🇧. */
export function changerLangue(l) {
  try {
    localStorage.setItem(CLE, l);
    localStorage.setItem('plongee-journal:cv-langue', l);     // « Qui je suis » suit
  } catch { /* privé */ }
  location.reload();
}

export function boutonLangue() {
  const b = document.createElement('button');
  b.className = 'icon-btn btn-langue';
  b.type = 'button';
  b.title = langue() === 'en' ? 'Passer en français' : 'Switch to English';
  b.textContent = langue() === 'en' ? '🇫🇷' : '🇬🇧';
  b.onclick = () => changerLangue(langue() === 'en' ? 'fr' : 'en');
  return b;
}
