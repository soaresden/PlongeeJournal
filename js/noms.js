// ============================================================
//  Retrouver les plongeurs dans un texte écrit en vrac
//
//  « Fosse avec Marc et Julie », « plongé avec jullie, 6 kg, froid,
//  vu un congre » : on cherche les plongeurs connus (même mal
//  orthographiés : une lettre de travers passe), et, après « avec »,
//  les noms qui ne sont pas encore dans la liste.
//
//  Rien n'est ajouté sans qu'on coche : ce sont des propositions.
// ============================================================

export const sansAccent = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Des mots courants qui ressemblent à des prénoms à une lettre près
 * (« mars » / Marc, « lune » / Luna…) : jamais pris pour quelqu'un.
 */
const MOTS_COURANTS = new Set(`
  avec sans pour dans chez apres avant sous sur vers puis mais donc tres trop bien plus moins
  mars mai juin aout lundi mardi jeudi samedi dimanche matin soir midi nuit jour
  mer lac eau fond froid chaud vent pluie soleil lune bateau bouee club fosse piscine
  plomb plombs lest kilo kilos bloc bouteille palier paliers combi gilet palmes masque
  poisson poissons congre murene mulet sar sars bar loup daurade poulpe seiche raie
  moniteur guide chef binome palanquee groupe equipe moi nous elle elles lui eux tous
  marin marine pierre rose rocher roche sable algue algues herbier epave grotte tombant
  bonne belle beau super cool top nul dure facile`.split(/\s+/).filter(Boolean));

/** Distance d'édition (Levenshtein), arrêtée dès qu'elle dépasse `max`. */
export function distance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let mini = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prec[j] + 1, cur[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      mini = Math.min(mini, cur[j]);
    }
    if (mini > max) return max + 1;
    prec = cur;
  }
  return prec[b.length];
}

/** Deux mots sont « le même nom » : écart toléré selon la longueur, même première lettre. */
export function ressemble(mot, nom) {
  if (!mot || !nom) return false;
  if (mot === nom) return true;
  if (mot[0] !== nom[0] || MOTS_COURANTS.has(mot)) return false;
  const tol = nom.length >= 8 ? 2 : nom.length >= 5 ? 1 : 0;
  return tol > 0 && distance(mot, nom, tol) <= tol;
}

const mots = texte => sansAccent(texte).split(/[^a-z0-9']+/).map(m => m.replace(/'/g, '')).filter(Boolean);

/**
 * @param {string} texte
 * @param {object[]} buddies   plongeurs connus ({id, prenom, nom, structure})
 * @param {{exclure?:string[]}} options  noms à ignorer (toi-même)
 * @returns {{connus:{buddy:object, sur:boolean}[], nouveaux:string[]}}
 *   sur = prénom + nom, ou prénom unique ; sinon à vérifier (deux « Marc »)
 */
export function trouverPlongeurs(texte, buddies = [], { exclure = [] } = {}) {
  const m = mots(texte);
  const exclus = new Set(exclure.flatMap(mots));
  const gens = buddies.filter(b => !b.structure && (b.prenom || b.nom));
  const prenomsVus = new Map();
  gens.forEach(b => { const p = sansAccent(b.prenom); if (p) prenomsVus.set(p, (prenomsVus.get(p) || 0) + 1); });

  const present = cible => m.some(x => !exclus.has(x) && ressemble(x, cible));
  const suite = (a, b) => m.some((x, i) => ressemble(x, a) && ressemble(m[i + 1] || '', b));

  const connus = [];
  for (const b of gens) {
    const p = mots(b.prenom)[0] || '';
    const n = mots(b.nom).filter(x => x.length > 2).pop() || '';
    if (p && exclus.has(p) && (!n || exclus.has(n))) continue;
    let sur = false, trouve = false;
    if (p && n && (suite(p, n) || suite(n, p))) { trouve = sur = true; }
    else if (n && n.length >= 4 && present(n)) { trouve = true; sur = true; }
    else if (p && p.length >= 3 && present(p)) { trouve = true; sur = prenomsVus.get(sansAccent(b.prenom)) === 1; }
    if (trouve) connus.push({ buddy: b, sur });
  }

  // « Marc Leroy » écrit en entier : l'autre Marc n'était pas là.
  const complets = new Set(connus.filter(c => c.sur).map(c => sansAccent(c.buddy.prenom)));
  for (let i = connus.length - 1; i >= 0; i--) {
    if (!connus[i].sur && complets.has(sansAccent(connus[i].buddy.prenom))) connus.splice(i, 1);
  }

  // Après « avec » : des noms qu'on ne connaît pas encore.
  const nouveaux = [];
  const dejaDit = nom => connus.some(({ buddy }) => mots(`${buddy.prenom} ${buddy.nom}`).some(x => mots(nom).some(y => ressemble(y, x))));
  for (const [, bout] of String(texte || '').matchAll(/\b(?:avec|with|w\/)\s+([^.;:!?\n()]+)/gi)) {
    for (const morceau of bout.split(/\s*(?:,|\bet\b|\band\b|&|\+|\/)\s*/i)) {
      // Les mots en majuscule du début : « Julie Martin », pas « le club ».
      const pris = [];
      for (const w of morceau.trim().split(/\s+/).slice(0, 3)) {
        if (/^\p{Lu}[\p{L}'-]+$/u.test(w)) pris.push(w); else break;
      }
      const nom = pris.join(' ');
      if (!nom || nom.length < 3) continue;
      const premier = sansAccent(nom.split(' ')[0]);
      if (MOTS_COURANTS.has(premier) || exclus.has(premier) || dejaDit(nom)) continue;
      if (!nouveaux.some(x => sansAccent(x) === sansAccent(nom))) nouveaux.push(nom);
    }
  }
  return { connus, nouveaux };
}
