// Garde-fous : doublons possibles, incohérences, fusion.
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
const imp = rel => import(__p2u(path.join(ROOT, rel)).href);
const V = await imp('js/verifs.js');
const M = await imp('js/model.js');

const results = [];
const check = (name, cond, extra = '') => results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

const courbe = temp => Array.from({ length: 30 }, (_, i) => ({ t: i * 60, d: i < 2 || i > 27 ? 0.5 : 9, temp }));
// Le cas réel : l'Égypte importée de la montre, rangée par erreur à Beaumont ; puis recopiée du carnet au 29/04.
const m48 = { id: 'm48', numero: 48, date: '2025-03-28', heureImmersion: '14:16', dureeMin: 35, profMax: 9.1, lieuNom: 'Lac beaumont sur oise',
  lat: 49.136, lng: 2.277, eau: 'douce', suuntoKeys: ['rgpd:2025-03-28_12.16.07'], samples: courbe(23.5), buddyIds: [] };
const m49 = { ...m48, id: 'm49', numero: 49, heureImmersion: '15:39', dureeMin: 46, profMax: 9.9, suuntoKeys: ['rgpd:2025-03-28_13.39.09'] };
const p50 = { id: 'p50', numero: 50, date: '2025-04-29', dureeMin: 45, profMax: 10, lieuNom: 'Hurghada', lat: 27.2, lng: 33.9, eau: 'salee',
  buddyIds: ['alison', 'claire', 'wessam'], chefBuddyId: 'wessam', photoCarnet: { ref: 'photos/p50.jpg' }, observations: 'Tortue !',
  pressionDepart: 200, pressionFin: 50 };
const autre = { id: 'x', date: '2025-04-20', dureeMin: 45, profMax: 30, lieuNom: 'Ailleurs', suuntoKeys: ['ocean:1'], samples: courbe(24) };
const toutes = [m48, m49, p50, autre];

const c = V.doublonsPossibles(p50, toutes);
check('doublon : la saisie retrouve les deux plongées de la montre', c.map(x => x.dive.id).sort().join() === 'm48,m49', c.map(x => x.dive.id).join());
check('doublon : la plus ressemblante en premier', c[0].dive.id === 'm49' && c[0].raisons[0] === '32 jours d’écart', JSON.stringify(c[0].raisons));
check('doublon : pas une plongée trop différente (30 m)', !c.some(x => x.dive.id === 'x'));
check('doublon : deux plongées de la montre ne se soupçonnent pas', V.doublonsPossibles(m48, [m48, m49]).length === 0);
check('doublon : deux saisies à la main non plus', V.doublonsPossibles({ ...p50, id: 'a' }, [{ ...p50, id: 'b' }]).length === 0);
check('doublon : trop loin dans le temps (> 45 j)', V.doublonsPossibles({ ...p50, date: '2025-06-01' }, toutes).length === 0);
check('doublon : même jour mais heures différentes = deux plongées',
  V.doublonsPossibles({ ...p50, date: '2025-03-28', heureImmersion: '09:00' }, toutes).length === 0);
check('doublon : « ce n’est pas un doublon » est retenu', V.doublonsPossibles({ ...p50, pasDoublon: ['m48', 'm49'] }, toutes).length === 0);
check('carnet : les paires une seule fois', V.doublonsDuCarnet(toutes).length === 2);

const inc = V.incoherences(m48);
check('incohérence : 23 °C dans un lac du nord en mars', inc.some(i => i.code === 'chaud' && /mars/.test(i.texte)), JSON.stringify(inc));
check('incohérence : rien à redire en Égypte', V.incoherences({ ...m48, lat: 27.2, lng: 33.9, eau: 'salee', lieuNom: 'Hurghada' }).length === 0);
check('incohérence : l’été au nord, 23 °C, ça passe', V.incoherences({ ...m48, date: '2025-08-10' }).length === 0);
check('incohérence : 16 °C sous les tropiques', V.incoherences({ lat: 14.7, lng: -61, date: '2026-03-30', samples: courbe(16) }).some(i => i.code === 'froid'));
check('incohérence : une fosse chauffée ne compte pas', V.incoherences({ ...m48, lieuNom: 'Fosse Nemo 33' }).length === 0);
check('incohérence : eau douce aux Açores', V.incoherences({ lieuNom: 'oceaneye acores', eau: 'douce' }).some(i => i.code === 'eau'));
check('incohérence : sauf si l’eau vient du GPS', V.incoherences({ lieuNom: 'oceaneye acores', eau: 'douce', eauAuto: true }).length === 0);
check('nom du lieu : « Ravaillac » n’est pas un lac', M.guessWater('Port de Ravaillac - Cherbourg') === 'salee' && M.guessWater('Lac de Beaumont') === 'douce');

// Fusion
const f = V.fusionnerPlongees(m48, p50);
check('fusion : la montre garde date, heure, mesures et courbe', f.id === 'm48' && f.date === '2025-03-28' && f.heureImmersion === '14:16'
  && f.dureeMin === 35 && f.profMax === 9.1 && f.samples.length === 30 && f.suuntoKeys[0].startsWith('rgpd'));
check('fusion : la saisie apporte palanquée, chef, page du carnet, remarques', f.buddyIds.join() === 'alison,claire,wessam'
  && f.chefBuddyId === 'wessam' && f.photoCarnet.ref === 'photos/p50.jpg' && f.observations === 'Tortue !');
check('fusion : lieu de la saisie par défaut (celui de la montre était saisi à la main)', f.lieuNom === 'Hurghada' && f.lat === 27.2 && f.eau === 'salee');
check('fusion : 200 → 50 par défaut ne remplacent rien', f.pressionDepart === undefined);
const g = V.fusionnerPlongees({ ...m48, suunto: { source: 'bluetooth' } }, p50);
check('fusion : GPS de la montre (Bluetooth) gardé par défaut', g.lieuNom === 'Lac beaumont sur oise');
const h = V.fusionnerPlongees({ ...m48, suunto: { source: 'bluetooth' } }, p50, { lieu: 'saisie' });
check('fusion : lieu choisi', h.lieuNom === 'Hurghada');

console.log(results.join('\n'));
const ko = results.filter(r => r.startsWith(' FAIL'));
console.log(`\n${results.length - ko.length}/${results.length} vérifications garde-fous`);
if (ko.length) process.exit(1);
