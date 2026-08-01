// Vérifie l'élargissement progressif de la recherche de lieu.
//
// Cas réel : « Fort du Centre - Cherbourg » n'existe dans aucune base de
// lieux. L'app doit retomber sur « Cherbourg », centrer la carte dessus,
// et conserver le libellé tapé.
import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;

const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};

const { pistesDeRecherche } = await import(path.join(ROOT, 'js/map.js'));

const results = [];
const check = (name, cond, extra = '') =>
  results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

const p = s => pistesDeRecherche(s);

// ---------- Le cas signalé ----------
let l = p('Fort du Centre - Cherbourg');
check('saisie complète essayée en premier', l[0] === 'Fort du Centre - Cherbourg', l[0]);
check('« Cherbourg » essayé en deuxième', l[1] === 'Cherbourg', l[1]);
check('la partie descriptive reste une piste', l.includes('Fort du Centre'));

// ---------- Les tirets internes ne doivent PAS couper ----------
l = p('Lac de Beaumont-sur-Oise');
check('Beaumont-sur-Oise reste entier', l.every(x => !['Oise', 'sur', 'Beaumont'].includes(x)), l.join('|'));
check('la commune est une piste', l.includes('Beaumont-sur-Oise'), l.join('|'));

l = p('Tombant de la Gabinière / Port-Cros');
check('Port-Cros reste entier', l.includes('Port-Cros') && !l.includes('Cros'), l.join('|'));
check('slash entouré d’espaces sépare bien', l[1] === 'Port-Cros', l[1]);

// ---------- Virgule ----------
l = p('Épave du Liban, Marseille');
check('virgule : ville en deuxième piste', l[1] === 'Marseille', l[1]);
check('virgule : pas de séparateur résiduel',
  l.every(x => !/^[-–—/,;]|[-–—/,;]$/.test(x.trim())), l.join('|'));

// ---------- Pas de séparateur ----------
l = p('Sec du Gendarme');
check('sans séparateur : saisie puis derniers mots', l[0] === 'Sec du Gendarme' && l.includes('Gendarme'), l.join('|'));

l = p('Cherbourg');
check('un seul mot : une seule piste', l.length === 1 && l[0] === 'Cherbourg', l.join('|'));

// ---------- Robustesse ----------
check('vide toléré', p('').length === 0);
check('espaces seuls tolérés', p('   ').length === 0);
check('indéfini toléré', p().length === 0);
check('aucun doublon', (() => {
  const x = p('Cherbourg - Cherbourg');
  return new Set(x.map(s => s.toLowerCase())).size === x.length;
})());
check('pistes trop courtes écartées',
  p('Le Sec de la Vierge - Le Brusc').every(x => x.length >= 3));
check('ordre : du plus précis au plus large',
  (() => { const x = p('A - Bordeaux'); return x[0].includes('Bordeaux') && x[0].length > x[1].length; })());

// ---------- Accents et casse ----------
l = p('Calanque d’En-Vau, Cassis');
check('apostrophe et accents préservés', l[1] === 'Cassis', l.join('|'));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith(' FAIL')).length;
console.log(failed ? `\n${failed} test(s) en échec` : '\nTous les tests de lieu passent.');
process.exit(failed ? 1 : 0);
