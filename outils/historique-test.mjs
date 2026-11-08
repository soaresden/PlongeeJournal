// Historique : l'ancienne version est gardée à chaque modification (une
// par rafale) et à chaque suppression ; on peut la restaurer.
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
const imp = rel => import(__p2u(path.join(ROOT, rel)).href);
const memoire = new Map();
globalThis.localStorage = { getItem: k => memoire.get(k) ?? null, setItem: (k, v) => memoire.set(k, String(v)), removeItem: k => memoire.delete(k) };

const H = await imp('js/historique.js');
const { creerStore } = await imp('js/store-base.js');
const results = [];
const check = (name, cond, extra = '') => results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

// Un store minimal, en mémoire.
const donnees = { divers: [{ id: 'moi' }], dives: [], buddies: [], certifs: [], seances: [], settings: {} };
const store = creerStore({ charger: async () => structuredClone(donnees), enregistrer: async () => {} });
await store.init?.();

const d = { id: 'p1', diverId: 'moi', date: '2026-11-08', heureImmersion: '07:50', dureeMin: 33, profMax: 30, lieuNom: 'Maldives', samples: [{ t: 0, d: 1 }], buddyIds: [] };
await store.saveDive(structuredClone(d));
check('création : pas d’ancienne version', H.versions('p1').length === 0);

// L'écran modifie l'objet du carnet lui-même, puis enregistre.
const x = await store.getDive('p1');
x.lieuNom = 'Bêtise'; x.buddyIds = ['a'];
await store.saveDive(x);
const v = H.versions('p1');
check('modification : l’ancienne version gardée (même si l’objet a été modifié sur place)', v.length === 1 && v[0].donnees.lieuNom === 'Maldives', JSON.stringify(v[0]?.donnees));
check('la courbe n’est pas recopiée à chaque version', !v[0].donnees.samples && v[0].donnees._samplesRetire);
check('ce qui a changé, en mots', H.differences(v[0].donnees, x).join() === 'lieu,palanquée', H.differences(v[0].donnees, x).join());

// Rafale (enregistrement automatique) : une seule version.
x.lieuNom = 'Bêtise 2'; await store.saveDive(x);
x.lieuNom = 'Bêtise 3'; await store.saveDive(x);
check('rafale : une seule version (celle d’avant)', H.versions('p1').length === 1);

// Restaurer
const r = H.aRestaurer(H.versions('p1')[0], await store.getDive('p1'));
check('restaurer : l’ancienne fiche, avec la courbe d’aujourd’hui', r.lieuNom === 'Maldives' && r.samples?.length === 1 && !r._samplesRetire);

// Enregistrer sans rien changer : rien de gardé.
const avant = H.tout().length;
const y = await store.getDive('p1'); await store.saveDive(y);
check('sans changement : rien de gardé', H.tout().length === avant);

// Suppression : la fiche complète (courbe comprise) est gardée.
await store.deleteDive('p1');
const s = H.tout()[0];
check('suppression : la fiche entière est gardée, courbe comprise', s.quoi === 'suppression' && s.donnees.samples?.length === 1 && s.donnees.lieuNom === 'Bêtise 3');

// Une nouvelle version après 10 min.
H.utiliserStockage({ _v: [], lire() { return structuredClone(this._v); }, ecrire(v) { this._v = v; } });
const t0 = Date.parse('2026-11-08T10:00:00Z');
H.noter('dive', { id: 'q', a: 1 }, { apres: { id: 'q', a: 2 }, maintenant: t0 });
H.noter('dive', { id: 'q', a: 2 }, { apres: { id: 'q', a: 3 }, maintenant: t0 + 5 * 60000 });
H.noter('dive', { id: 'q', a: 3 }, { apres: { id: 'q', a: 4 }, maintenant: t0 + 15 * 60000 });
check('nouvelle série de modifications : nouvelle version', H.versions('q').map(e => e.donnees.a).join() === '3,1');

console.log(results.join('\n'));
const ko = results.filter(r => r.startsWith(' FAIL'));
console.log(`\n${results.length - ko.length}/${results.length} vérifications historique`);
if (ko.length) process.exit(1);
