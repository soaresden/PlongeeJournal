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

console.log(results.join('\n'));
const ko = results.filter(r => r.startsWith(' FAIL'));
console.log(`\n${results.length - ko.length}/${results.length} vérifications azote & oxygène`);
if (ko.length) process.exit(1);
