// ============================================================
//  Homme ou femme, d'après le prénom — une proposition, pas plus
//
//  Le genre se règle sur la fiche du plongeur (h / f). Tant qu'il ne
//  l'est pas, on devine d'après le prénom pour l'affichage ; « Deviner
//  les genres » l'enregistre, à corriger à la main si besoin. Un
//  prénom mixte ou inconnu reste sans genre.
// ============================================================

const sansAccent = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const FEMMES = new Set(`
  alix alison anais anne annie audrey aurelie berenice camille carole caroline catherine cecile celine charlotte chloe
  christine claire clara claudine coralie corinne delphine diana diane elise elodie emilie emma eva fanny florence
  helene ines isabelle jade jeanne juliette julie juline justine laetitia laura laure lauriane lea leila lina lisa lou
  louise lucie lucile manon margaux marie marine marion martine mathilde maud melanie nadia nathalie nina noemie oceane
  patricia pauline rose sabrina sandrine sarah sophie stephanie sylvie valerie vanessa virginie zoe agathe ambre
  amandine apolline beatrice brigitte chantal elsa estelle eve gaelle helena jessica johanna karine lola maelle
  marina mathilde morgane myriam nadege natacha nicole odile romane severine solene soline tiphaine veronique yasmine
`.split(/\s+/).filter(Boolean));

const HOMMES = new Set(`
  adrien alain alex alexandre antoine arnaud arthur aurelien baptiste benjamin benoit bernard bruno cedric charles
  christophe christian claude clement damien daniel david denis didier dominique eric etienne fabien fabrice florian
  francois frederic gabriel gael gerard gilles guillaume herve hugo ibraima jacques jb jean jerome jocelyn jonathan
  jordan joseph julien kevin laurent leo loic louis luc luca lucas luka marc mathieu matthieu maxime michel mickael
  nicolas olivier pascal patrice patrick paul philippe phil pierre quentin raphael remi renaud richard robert romain
  romuald ronan ruben samuel sebastien serge simon stephane sylvain thibaut thierry thomas tito tony vincent wessam
  xavi xavier yann yannick yves zoubeir mohamed karim mehdi omar rachid samir youssef ibrahim moussa amine bilal
  jose juan carlos pedro pablo miguel diego javier alberto andrea nicola
`.split(/\s+/).filter(Boolean));

/** Prénoms mixtes : on ne devine pas. */
const MIXTES = new Set(['camil', 'dominique', 'claude', 'alex', 'sacha', 'charlie', 'eden', 'ene', 'padawan', 'morgan']);

/**
 * @param {string} prenom
 * @returns {'h'|'f'|''}
 */
export function devinerGenre(prenom) {
  const p = sansAccent(String(prenom || '').split(/[\s-]+/)[0]);
  if (!p || MIXTES.has(p)) return '';
  if (FEMMES.has(p)) return 'f';
  if (HOMMES.has(p)) return 'h';
  // Terminaisons fréquentes, en dernier recours.
  if (/(ette|elle|ine|ienne|ia|anne|ise|ette|na|ra|la|ie)$/.test(p)) return 'f';
  if (/(ien|ic|ck|rd|rt|nd|el|on|ur|is|us|ois|ard)$/.test(p)) return 'h';
  return '';
}

/** Le genre à afficher : celui de la fiche, sinon la devinette. */
export const genreDe = b => (b?.genre === 'h' || b?.genre === 'f') ? b.genre : (b?.structure ? '' : devinerGenre(b?.prenom));

export const COULEUR_GENRE = { h: '#3b82f6', f: '#ec4899', '': '#94a3b8' };
