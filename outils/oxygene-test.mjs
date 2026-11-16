// Oxygène de la journée : tableau du cours (MN90 Mobile) et vraie courbe.
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
const imp = rel => import(__p2u(path.join(ROOT, rel)).href);
const results = [];
const check = (name, cond, extra = '') => results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

// Les tables de MN90 Mobile (dépôt voisin, ou MN90_SRC)
const MN90 = [process.env.MN90_SRC, path.join(ROOT, 'mn90src'), path.join(ROOT, '..', 'mn90mobile'), path.join(ROOT, '..', 'MN90Mobile')].find(d => d && fs.existsSync(path.join(d, 'nitrox', 'examen.js')));
if (!MN90) { console.log('MN90 Mobile introuvable : test sauté'); process.exit(0); }
const ctx = { window: {}, localStorage: { getItem: () => null, setItem() {} }, console };
vm.createContext(ctx);
for (const f of ['shared/mn90.js', 'nitrox/examen.js']) vm.runInContext(fs.readFileSync(path.join(MN90, f), 'utf8'), ctx);
const lib = ctx.window.MN90Lib, ex = ctx.window.NitroxExamen;

const O = await imp('js/oxygene.js');
check('mélange : air, Nitrox 32, trimix inconnu', O.fo2De({ gazType: 'air' }) === 0.21 && O.fo2De({ gazType: 'nitrox', gazO2: 32 }) === 0.32 && O.fo2De({ gazType: 'trimix', gazO2: 21 }) === null);

// Le cours (journée Cours #7) : 60 min à 25 m Nx40 puis, 2 h après, 30 min à 20 m Nx40 (sans palier O₂ ici)
const p1 = { id: 'a', date: '2026-11-08', heureImmersion: '08:00', heureSortie: '09:00', dureeMin: 60, profMax: 25, gazType: 'nitrox', gazO2: 40 };
const p2 = { id: 'b', date: '2026-11-08', heureImmersion: '11:00', heureSortie: '11:30', dureeMin: 30, profMax: 20, gazType: 'nitrox', gazO2: 40 };
const j = O.journeeO2([p2, p1], lib, ex);
const [a, b] = j.plongees;
check('ordre de la journée', a.d.id === 'a' && b.d.id === 'b');
check('P1 : ligne 18 m, GPS J', a.r.tab.d === 18 && a.r.tab.gps === 'J', `${a.r.tab.d} ${a.r.tab.gps}`);
check('intervalle 2 h → coefficient 0,40', b.interval === 120 && b.coef.coef === 0.4);
check('majoration J + 2 h → 1,02 → 1,03 × 15 m = 37 min', b.t1.n2 === 1.02 && b.t2.ligne === 1.03 && b.t2.col === 15 && b.maj === 37, JSON.stringify([b.t1, b.t2]));
check('P2 : durée fictive 67 → ligne 1 h 10, pas de palier', b.r.tab.t === 70 && !b.r.paliers.length);
check('%SNC de la journée = P1 × 0,40 + P2', Math.abs(j.cours - (a.r.snc * 0.4 + b.r.snc)) < 1e-9, j.cours);
check('sans courbe : le réel reprend le cours', Math.abs(j.reel - (a.r.snc * Math.pow(0.5, 120 / 90) + b.r.snc)) < 1e-9);

// La vraie courbe : 1 min de descente, 20 min à 30 m au Nx32, 2 min de remontée
const courbe = [];
for (let t = 0; t <= 60; t += 10) courbe.push({ t, d: t / 2 });
for (let t = 70; t <= 1260; t += 10) courbe.push({ t, d: 30 });
for (let t = 1270; t <= 1380; t += 10) courbe.push({ t, d: Math.max(0, 30 - (t - 1260) / 4) });
const r = O.reelO2({ samples: courbe }, 0.32, ex.lire);
// 20 min à 4 b × 0,32 = 1,28 b → colonne 1,3 → 0,56 %/min ≈ 11,2 %, plus la descente et la remontée
check('courbe : %SNC ≈ 20 min × 0,56 + transitions', r.snc > 11 && r.snc < 13, r.snc);
check('courbe : PpO₂ max 1,28 b', Math.abs(r.ppMax - 1.28) < 1e-9, r.ppMax);
check('courbe absente → null', O.reelO2({ samples: [] }, 0.32, ex.lire) === null);

check('jours de plongée, du plus récent', O.joursDePlongee([p1, p2, { date: '2026-11-09' }, { date: '2026-11-07', seance: true }]).join() === '2026-11-09,2026-11-08');

console.log(results.join('\n'));
const ko = results.filter(x => x.startsWith(' FAIL')).length;
console.log(`\n${results.length - ko}/${results.length} vérifications oxygène`);
process.exit(ko ? 1 : 0);
