// Joindre deux plongées en une (site pas trouvé, on remonte, on redescend).
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
const J = await import(__p2u(path.join(ROOT, 'js/joindre.js')).href);
const { reconcileTimes } = await import(__p2u(path.join(ROOT, 'js/model.js')).href);
const results = [];
const check = (name, cond, extra = '') => results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

const courbe = (prof, min, p0, p1) => {
  const s = [];
  for (let t = 0; t <= min * 60; t += 10) s.push({ t, d: Math.min(prof, t / 6, (min * 60 - t) / 6), temp: 29, pression: p0 - (p0 - p1) * t / (min * 60) });
  return s;
};
// 07:00, 12 min à 18 m (site pas trouvé) ; 8 min de bateau ; 07:20, 40 min à 27 m
const ocean0 = Date.UTC(2026, 10, 11, 7, 0) / 1000;
const a = { id: 'a', diverId: 'm', numero: 90, date: '2026-11-11', heureImmersion: '07:00', heureSortie: '07:12', dureeMin: 12, profMax: 18, profMoy: 12,
  lieuNom: 'Atoll Ari Sud, Maldives', lieuAuto: 'osm', lat: 3.5, lng: 72.9, tempFond: 29, pressionDepart: 200, pressionFin: 170,
  samples: courbe(18, 12, 200, 170), suuntoKeys: [`ocean:${ocean0}`], suunto: { source: 'bluetooth' }, buddyIds: ['x'], observations: 'Pas trouvé le site',
  options: [], note: null, materielIds: ['bloc'], equipement: { camera: true } };
const b = { id: 'b', diverId: 'm', numero: 91, date: '2026-11-11', heureImmersion: '07:20', heureSortie: '08:00', dureeMin: 40, profMax: 27.2, profMoy: 18,
  lieuNom: 'Kudarah Thila', lat: 3.55, lng: 72.92, tempFond: 28, pressionDepart: 168, pressionFin: 40, palierSecu: true, palierSecuMin: 4,
  samples: courbe(27.2, 40, 168, 40), suuntoKeys: [`ocean:${ocean0 + 20 * 60}`], suunto: { source: 'bluetooth' }, buddyIds: ['x', 'y'],
  observations: 'Requins !', options: ['Plongée profonde'], note: 5, repriseDe: 'a', materielIds: ['bloc', 'lampe'] };

const { surfaceMin } = J.ordreEtSurface(b, a);
check('surface entre les deux : 8 min', surfaceMin === 8, surfaceMin);
const f = reconcileTimes(J.joindrePlongees(b, a));             // dans le désordre : remis dans l'ordre
check('garde la première (id, numéro)', f.id === 'a' && f.numero === 90, `${f.id} ${f.numero}`);
check('durée = somme des temps sous l’eau (MN90)', f.dureeMin === 52, f.dureeMin);
check('immersion 07:00, sortie 07:52 (cohérentes)', f.heureImmersion === '07:00' && f.heureSortie === '07:52', `${f.heureImmersion} ${f.heureSortie}`);
check('profondeur max : la plus grande', f.profMax === 27.2, f.profMax);
check('profondeur moyenne pondérée', Math.abs(f.profMoy - (12 * 12 + 18 * 40) / 52) < 0.1, f.profMoy);
check('eau au fond : la plus froide', f.tempFond === 28, f.tempFond);
check('bloc : 200 au début, 40 à la fin', f.pressionDepart === 200 && f.pressionFin === 40, `${f.pressionDepart} ${f.pressionFin}`);
const s = f.samples;
check('courbe bout à bout, dans l’ordre', s.every((x, i) => !i || x.t > s[i - 1].t), 'ordre');
check('la seconde commence 20 min après la première', s.some(x => x.t === 20 * 60 && x.d === 0), JSON.stringify(s.filter(x => x.t >= 1190 && x.t <= 1210)));
check('surface entre les deux (0 m)', s.filter(x => x.t > 12 * 60 && x.t < 20 * 60).every(x => x.d === 0), 'surface');
check('dernier point = fin de la seconde', s[s.length - 1].t === 20 * 60 + 40 * 60, s[s.length - 1].t);
check('les clés des deux montres (un import ne la recrée pas)', f.suuntoKeys.length === 2, f.suuntoKeys);
check('lieu par défaut : la seconde (le vrai site)', f.lieuNom === 'Kudarah Thila' && f.lat === 3.55 && !('lieuAuto' in f), `${f.lieuNom} ${f.lieuAuto}`);
check('lieu au choix : la première', J.joindrePlongees(a, b, { lieu: 'premiere' }).lieuNom === 'Atoll Ari Sud, Maldives');
check('compagnons des deux', f.buddyIds.join() === 'x,y', f.buddyIds);
check('observations l’une sous l’autre', f.observations === 'Pas trouvé le site\nRequins !', f.observations);
check('options et matériel additionnés', f.options.join() === 'Plongée profonde' && f.materielIds.join() === 'bloc,lampe', `${f.options} ${f.materielIds}`);
check('note : celle donnée', f.note === 5, f.note);
check('palier de sécurité de la fin', f.palierSecu === true && f.palierSecuMin === 4, f.palierSecuMin);
check('ne pointe pas vers elle-même', f.repriseDe === undefined, f.repriseDe);
check('les deux parties retenues', f.parties.length === 2 && f.parties[1].surfaceAvantMin === 8, JSON.stringify(f.parties));
check('les originaux ne bougent pas', a.samples.length === 73 && b.dureeMin === 40 && a.observations === 'Pas trouvé le site');

// Sans courbe : les heures suffisent
const sa = { ...a, samples: [], suuntoKeys: [] }, sb = { ...b, samples: [], suuntoKeys: [] };
check('sans courbe : surface d’après les heures', J.ordreEtSurface(sa, sb).surfaceMin === 8, J.ordreEtSurface(sa, sb).surfaceMin);
check('sans courbe : durée 52 min', reconcileTimes(J.joindrePlongees(sa, sb)).dureeMin === 52);

// Les synchros ne recréent pas la seconde partie
const { plongeeCorrespondante } = await import(__p2u(path.join(ROOT, 'js/ocean-sbem.js')).href);
const { trouverDansCarnet, completerPlongee } = await import(__p2u(path.join(ROOT, 'js/suunto-aligner.js')).href);
const { completerDepuisMontre } = await import(__p2u(path.join(ROOT, 'js/donnees.js')).href);
const ocean1 = ocean0 + 20 * 60;
check('montre (Bluetooth) : 1re partie reconnue', plongeeCorrespondante({ id: ocean0 }, [f])?.dive === f);
check('montre (Bluetooth) : 2de partie reconnue', plongeeCorrespondante({ id: ocean1 }, [f])?.dive === f);
check('compte Suunto : 2de partie reconnue', trouverDansCarnet({ cle: 'abc', debut: ocean1 * 1000 }, [f])?.entree === f);
// Plongées saisies à la main (sans clé de montre) puis jointes : reconnues par l'heure de chaque partie
const fm = reconcileTimes(J.joindrePlongees(sa, sb));
const heure = h => new Date(`2026-11-11T${h}:00`).getTime();
check('sans clé : 2de partie reconnue (montre)', plongeeCorrespondante({ id: heure('07:20') / 1000 }, [fm])?.dive === fm);
check('sans clé : 2de partie reconnue (compte Suunto)', trouverDansCarnet({ cle: 'abc', debut: heure('07:20') }, [fm])?.entree === fm);
check('une autre plongée à 09:30 n’est pas prise pour elle', !trouverDansCarnet({ cle: 'abc', debut: heure('09:30') }, [fm]));
const morceau = { samples: b.samples, profMax: 27.2, dureeMin: 40, pressionDepart: 168, pressionFin: 40, lieu: { lat: 1, lng: 2 } };
check('compte Suunto : un morceau ne retouche pas la plongée jointe', !completerPlongee({ ...f, samples: [] }, morceau).libelles.length);
check('montre : un morceau ne retouche pas la plongée jointe', !completerDepuisMontre({ ...f, lat: null }, morceau).libelles.length);

console.log(results.join('\n'));
const ko = results.filter(r => r.startsWith(' FAIL'));
console.log(`\n${results.length - ko.length}/${results.length} vérifications joindre`);
if (ko.length) process.exit(1);
