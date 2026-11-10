// Azote & oxygène : le modèle Bühlmann sur les vrais profils, sur 7 jours.
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
const C = await import(__p2u(path.join(ROOT, 'js/corps.js')).href);
const results = [];
const check = (name, cond, extra = '') => results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

// Une plongée carrée à 30 m, 30 min, à l'air ; samples toutes les 10 s
const plongee = (date, heure, prof, min, o2 = 21) => {
  const s = [];
  for (let t = 0; t <= min * 60; t += 10) s.push({ t, d: t < 90 ? prof * t / 90 : t > min * 60 - 180 ? prof * (min * 60 - t) / 180 : prof });
  return { id: `${date}${heure}`, date, heureImmersion: heure, dureeMin: min, profMax: prof, gazType: o2 > 21 ? 'nitrox' : 'air', gazO2: o2, eau: 'salee', samples: s };
};
const t = iso => new Date(iso).getTime();
const une = [plongee('2026-06-01', '10:00', 30, 30)];
const b1 = C.bilanCorps(une, { maintenant: t('2026-06-01T10:31:00') });
check('juste après une plongée à 30 m / 30 min : tissus chargés', b1.maintenant.sat > 40 && b1.plongees[0].pic > 60, JSON.stringify(b1.maintenant.sat));
const b2 = C.bilanCorps(une, { maintenant: t('2026-06-02T22:00:00') });
check('36 h plus tard : désaturé', b2.maintenant.sat < 5 && b2.maintenant.desatH === 0, b2.maintenant.sat);
check('après une plongée : avion 12 h plus tard', C.bilanCorps(une, { maintenant: t('2026-06-01T12:00:00') }).maintenant.avion.regle === 12);
const deux = [...une, plongee('2026-06-01', '15:00', 25, 40)];
const b3 = C.bilanCorps(deux, { maintenant: t('2026-06-01T16:00:00') });
check('deux plongées : avion 18 h ; la 2e part avec de l’azote en réserve', b3.maintenant.avion.regle === 18 && b3.plongees[1].pic > C.bilanCorps([deux[1]], { maintenant: t('2026-06-01T16:00:00') }).plongees[0].pic);
const nitrox = C.bilanCorps([plongee('2026-06-01', '10:00', 30, 30, 32)], { maintenant: t('2026-06-01T10:31:00') });
check('au nitrox 32 : moins d’azote qu’à l’air, plus d’oxygène', nitrox.maintenant.sat < b1.maintenant.sat && nitrox.maintenant.cns > b1.maintenant.cns);
const feux = C.feux(b3);
check('quatre feux, chacun vert / orange / rouge', feux.length === 4 && feux.every(f => ['vert', 'orange', 'rouge'].includes(f.couleur)));
check('avion encore interdit : feu rouge', feux.find(f => f.titre === 'Avion').couleur === 'rouge');
const serie = C.bilanCorps(deux, { maintenant: t('2026-06-03T10:00:00') });
check('la courbe couvre les 7 jours, la charge redescend en surface', serie.serie.length > 100 && serie.serie[serie.serie.length - 1].sat < serie.plongees[1].pic);
check('sans courbe : profil carré estimé', C.profilDe({ profMax: 20, dureeMin: 40 })?.estime === true);

// L'assistant
const a1 = C.conseils(C.bilanCorps(deux, { maintenant: t('2026-06-01T16:00:00') }));
check('assistant : juste après deux plongées, pas « safe »', a1.niveau !== 'ok' && a1.points.length >= 2, JSON.stringify(a1));
const a2 = C.conseils(C.bilanCorps(deux, { maintenant: t('2026-06-05T10:00:00') }));
check('assistant : quelques jours après, « tu es safe »', a2.niveau === 'ok' && /safe/.test(a2.titre), JSON.stringify(a2));
const rapide = plongee('2026-06-01', '10:00', 30, 30); rapide.samples = rapide.samples.map(x => x.t > 1600 ? { ...x, d: Math.max(0, 30 - (x.t - 1600) / 60 * 25) } : x);
const a3 = C.conseils(C.bilanCorps([rapide], { maintenant: t('2026-06-01T12:00:00') }));
check('assistant : une remontée à 25 m/min est signalée', a3.points.some(p => /Remontée rapide/.test(p.texte)), JSON.stringify(a3.points));
const inverse = [plongee('2026-06-01', '09:00', 18, 40), plongee('2026-06-01', '14:00', 32, 25)];
check('assistant : profil inversé dans la journée', C.conseils(C.bilanCorps(inverse, { maintenant: t('2026-06-01T15:00:00') })).points.some(p => /plus profonde d’abord/.test(p.texte)));

// Le corps par zones, la prochaine plongée
const bz = C.bilanCorps(deux, { maintenant: t('2026-06-01T16:00:00') });
const zz = C.zonesDuCorps(bz);
check('quatre zones du corps, les articulations (tissus lents) se vident en dernier', zz.length === 4 && zz[3].heuresSous20 >= zz[0].heuresSous20);
const vide = C.ZHL16C.map(() => C.EQUILIBRE);
const ndl20 = C.tempsSansPalier(vide, 20), ndl30 = C.tempsSansPalier(vide, 30);
check('temps sans palier, tissus vides, à l’air : proche des tables (20 m ~35-45 min, 30 m ~12-20 min)', ndl20 >= 30 && ndl20 <= 50 && ndl30 >= 10 && ndl30 <= 22, `${ndl20} / ${ndl30}`);
check('tissus chargés : moins de temps sans palier', C.tempsSansPalier(bz.maintenant.T, 20) < ndl20);
const pp = C.prochainePlongee(bz);
check('prochaine plongée : une heure, et les temps à 12 / 20 / 30 m', pp.aPartirDe >= bz.fin && pp.ndl.length === 3);

console.log(results.join('\n'));
const ko = results.filter(r => r.startsWith(' FAIL'));
console.log(`\n${results.length - ko.length}/${results.length} vérifications azote & oxygène`);
if (ko.length) process.exit(1);
