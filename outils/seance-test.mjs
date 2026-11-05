// Séances (fosse, piscine, apnée) : modèle, stockage, fusion entre
// appareils, tri plongée / séance des activités de la montre.
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
const imp = rel => import(__p2u(path.join(ROOT, rel)).href);

const M = await imp('js/model.js');
const { creerStore } = await imp('js/store-base.js');
const { fusionner } = await imp('js/fusion.js');
const S = await imp('js/seances.js');
const { ambianceId } = await imp('js/ambiance.js');

const results = [];
const check = (name, cond, extra = '') => results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

// ---------- Modèle ----------
{
  const s = M.emptySeance('moi', 'fosse', '2026-10-15');
  check('séance vide : type, date, champs', s.type === 'fosse' && s.date === '2026-10-15' && s.id && Array.isArray(s.suuntoKeys));
  const st = M.statsSeances([
    { type: 'fosse', date: '2026-10-15', dureeMin: 48 },
    { type: 'fosse', date: '2026-10-08', dureeMin: 45 },
    { type: 'fosse', date: '2025-12-04' },
    { type: 'piscine', date: '2026-09-21' },
  ], '2026');
  check('compteur : 3 fosses dont 2 en 2026', st.parType.fosse.total === 3 && st.parType.fosse.annee === 2, JSON.stringify(st.parType.fosse));
  check('compteur : dernière fosse et minutes', st.parType.fosse.derniere === '2026-10-15' && st.parType.fosse.minutes === 93);
  check('compteur : piscine 1, apnée 0', st.parType.piscine.total === 1 && st.parType.apnee.total === 0);
}

{
  // Une « plongée » importée de la montre avec un GPS sans signal.
  const dive = { ...M.emptyDive('moi', 71), date: 'NaN-NaN-NaN', heureImmersion: 'Inval', dureeMin: 57,
    lat: 0.0001812, lng: 25.2378848, suuntoKeys: ['ocean:1790619124'], tempFond: 28 };
  const s = M.seanceDepuisPlongee(dive, 'piscine');
  const d = new Date(1790619124 * 1000);
  check('date abîmée : reprise de la clé montre',
    s.date === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` && /^\d\d:\d\d$/.test(s.heure), `${s.date} ${s.heure}`);
  check('position « au large du Gabon » écartée', s.lat === undefined, String(s.lat));
  check('durée, température, clés gardées', s.dureeMin === 57 && s.tempEau === 28 && s.suuntoKeys[0] === 'ocean:1790619124');
  check('origine notée', s.source === 'plongee');
}

// ---------- Stockage ----------
const support = { kind: 'test', donnees: null, ecritures: [],
  charger() { return this.donnees; }, enregistrer(d, quoi) { this.donnees = structuredClone(d); this.ecritures.push(quoi); } };
const store = creerStore(support);
await store.init();
const moi = await store.saveDiver({ ...M.emptyDiver(), id: 'moi', prenom: 'Moi' });

const fosse = await store.saveSeance(M.emptySeance('moi', 'fosse', '2026-10-15'));
await store.saveSeance(M.emptySeance('moi', 'piscine', '2026-10-21'));
check('séances enregistrées, les plus récentes d’abord',
  (await store.listSeances('moi')).map(s => s.type).join() === 'piscine,fosse');
check('écriture annoncée comme « seances »', support.ecritures.at(-1).table === 'seances');
check('le carnet garde la table après rechargement', Array.isArray(support.donnees.seances) && support.donnees.seances.length === 2);

const d1 = await store.saveDive({ ...M.emptyDive('moi', 67), date: '2026-09-21', heureImmersion: '20:14', dureeMin: 69, suuntoKeys: ['ocean:1790014455'] });
await store.saveDive({ ...M.emptyDive('moi', 68), date: '2026-09-22', dureeMin: 40, profMax: 18 });
const rangee = await store.plongeeEnSeance(d1.id, 'piscine');
check('plongée rangée en séance : elle quitte le carnet', !(await store.getDive(d1.id)) && (await store.listDives('moi')).length === 1);
check('… et arrive dans les séances', (await store.getSeance(rangee.id))?.type === 'piscine');
check('… avec une pierre tombale (pas de résurrection)', !!support.donnees._supprimes[d1.id]);
check('… et la numérotation reprend après la dernière vraie plongée', (await store.nextNumber('moi')) === 69, String(await store.nextNumber('moi')));

await store.deleteSeance(fosse.id);
check('suppression d’une séance', !(await store.getSeance(fosse.id)) && !!support.donnees._supprimes[fosse.id]);

await store.importAll({ dives: [], seances: [{ ...M.emptySeance('moi', 'apnee', '2026-11-01'), id: 'importee' }] }, { merge: true });
check('import fusionné : séances reprises', !!(await store.getSeance('importee')));

await store.deleteDiver('moi');
check('profil supprimé : ses séances aussi', (support.donnees.seances || []).length === 0);
void moi;

// ---------- Fusion entre deux appareils ----------
{
  const a = { seances: [{ id: 'x', type: 'fosse', updatedAt: '2026-10-01' }], _supprimes: {} };
  const b = { seances: [{ id: 'x', type: 'piscine', updatedAt: '2026-10-02' }, { id: 'y', type: 'apnee', updatedAt: '2026-10-02' }], _supprimes: {} };
  const f = fusionner(a, b);
  check('fusion : la plus récente gagne, les deux appareils comptent',
    f.seances.length === 2 && f.seances.find(s => s.id === 'x').type === 'piscine');
  const morte = fusionner({ seances: [{ id: 'y', updatedAt: '2026-10-02' }], _supprimes: {} }, { seances: [], _supprimes: { y: '2026-10-03' } });
  check('fusion : une séance supprimée ne ressuscite pas', morte.seances.length === 0);
}

// ---------- Plongée ou séance ? ----------
const piscineGarenne = { lat: 48.9054, lng: 2.2433 };
const fosseVilleneuve = { lat: 48.9425, lng: 2.3170 };
check('natation sans profondeur → piscine', S.suggererRangement({ genre: 'autre', profMax: null }) === 'piscine');
check('petit bain 1,8 m → piscine', S.suggererRangement({ genre: 'bouteille', profMax: 1.8, date: '2026-10-21' }) === 'piscine');
check('jeudi soir à 19,6 m → fosse', S.suggererRangement({ genre: 'bouteille', profMax: 19.6, date: '2026-10-15' }) === 'fosse');
check('un samedi à 25 m → plongée', S.suggererRangement({ genre: 'bouteille', profMax: 25, date: '2026-10-17' }) === 'plongee');
check('mode apnée de la montre → apnée', S.suggererRangement({ genre: 'apnee', profMax: 6 }) === 'apnee');
check('le lieu tranche : là où l’on a déjà rangé des apnées',
  S.suggererRangement({ genre: 'bouteille', profMax: 1.8, lieu: piscineGarenne }, [{ type: 'apnee', ...piscineGarenne }]) === 'apnee');
check('le lieu tranche : la fosse, même un mardi',
  S.suggererRangement({ genre: 'bouteille', profMax: 19, date: '2026-10-13', lieu: fosseVilleneuve }, [{ type: 'fosse', ...fosseVilleneuve }]) === 'fosse');
check('distance : 400 m font la différence', S.distanceM(piscineGarenne, fosseVilleneuve) > 5000 && S.distanceM(piscineGarenne, { lat: 48.9056, lng: 2.2434 }) < 50);

{
  const bt = (n, extra) => ({ ...M.emptyDive('moi', n), suunto: { source: 'bluetooth', genre: 'bouteille' }, suuntoKeys: [`ocean:${n}`], ...extra });
  const dives = [
    bt(67, { date: '2026-09-21', profMax: null, dureeMin: 69 }),
    bt(68, { date: '2026-09-21', profMax: 1.8 }),
    bt(85, { date: '2026-10-15', profMax: 19.6 }),
    bt(90, { date: '2026-10-17', profMax: 28 }),                                       // vraie plongée
    { ...M.emptyDive('moi', 12), date: '2024-06-13', profMax: 20, suuntoKeys: ['rgpd:2024-06-13_10.00.00-scubadiving.fit'] },  // un jeudi en mer, en .fit
    { ...M.emptyDive('moi', 13), date: '2024-06-14', profMax: 0.9, suuntoKeys: ['rgpd:x.fit'] },
    { ...M.emptyDive('moi', 5), date: '2023-01-12', profMax: 18, options: ['Plongée en fosse'] },
    { ...M.emptyDive('moi', 6), date: '2023-01-19', profMax: 18 },                      // saisie à la main
  ];
  const r = S.plongeesARanger(dives);
  const vus = Object.fromEntries(r.map(x => [x.dive.numero, x.type]));
  check('à ranger : piscines et fosse de la montre', vus[67] === 'piscine' && vus[68] === 'piscine' && vus[85] === 'fosse', JSON.stringify(vus));
  check('à ranger : une vraie plongée reste au carnet', !(90 in vus) && !(12 in vus) && !(6 in vus), JSON.stringify(vus));
  check('à ranger : vieux .fit en petit bain, et option « fosse »', vus[13] === 'piscine' && vus[5] === 'fosse', JSON.stringify(vus));
}

{
  const start = new Date(2026, 9, 15, 20, 2);
  const s = S.seanceDepuisImport('moi', 'fosse', { start, dureeMin: 48.4, profMax: 19.6, lieu: fosseVilleneuve, tempFond: 26, samples: [{ t: 0, d: 2 }] },
    { cles: ['ocean:1792087363'], suunto: { source: 'bluetooth' } });
  check('import montre → séance : date et heure locales', s.date === '2026-10-15' && s.heure === '20:02', `${s.date} ${s.heure}`);
  check('import montre → séance : durée, profondeur, profil, lieu, clé',
    s.dureeMin === 48 && s.profMax === 19.6 && s.samples.length === 1 && s.lat === fosseVilleneuve.lat && s.suuntoKeys[0] === 'ocean:1792087363');
  const p = S.seanceDepuisImport('moi', 'piscine', { start, dureeMin: 69, profMax: 1.8 }, {});
  check('piscine : pas de « profondeur max »', p.profMax === null);
  const vues = S.commePlongees([s]);
  check('rapprochement : la séance se présente comme une plongée', vues[0].heureImmersion === '20:02' && vues[0].seance === true);
}

// ---------- Ambiance d'un lieu ----------
check('La Garenne-Colombes sans type d’eau : pas « Manche »', ambianceId({ lat: 48.905, lng: 2.243, eau: '' }) === 'aPreciser');
check('Bretagne en eau salée : Manche & Atlantique', ambianceId({ lat: 48.6, lng: -3.9, eau: 'salee' }) === 'nord');
check('lac au nord : eau douce', ambianceId({ lat: 49.1, lng: 2.3, eau: 'douce' }) === 'douce');

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith(' FAIL')).length;
console.log(failed ? `\n${failed} test(s) en échec` : `\n${results.length}/${results.length} vérifications séances`);
process.exit(failed ? 1 : 0);
