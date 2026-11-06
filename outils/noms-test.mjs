// Lecture de texte en vrac (noms des plongeurs), numérotation par les
// dates, centres de plongée, eau d'après le GPS (tâche de fond).
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
const imp = rel => import(__p2u(path.join(ROOT, rel)).href);

globalThis.localStorage ||= { _m: new Map(), getItem(k) { return this._m.get(k) ?? null; }, setItem(k, v) { this._m.set(k, String(v)); }, removeItem(k) { this._m.delete(k); } };

const N = await imp('js/noms.js');
const M = await imp('js/model.js');
const C = await imp('js/centre.js');
const A = await imp('js/agenda.js');
const { creerStore } = await imp('js/store-base.js');

const results = [];
const check = (name, cond, extra = '') => results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

// ---------- Noms ----------
const B = [
  { id: 'm1', prenom: 'Marc', nom: 'Dupont' }, { id: 'j', prenom: 'Julie', nom: 'Martin' },
  { id: 'm2', prenom: 'Marc', nom: 'Leroy' }, { id: 's', prenom: 'Stéphane', nom: 'Guillaume' },
  { id: 'moi', prenom: 'Denis', nom: 'Soares' }, { id: 'c', prenom: 'Buceo Pandora', structure: true },
];
const lire = t => N.trouverPlongeurs(t, B, { exclure: ['Denis Soares'] });
const ids = r => r.connus.map(c => c.buddy.id + (c.sur ? '' : '?')).sort().join(',');
{
  const r = lire('Fosse avec Marc et Julie');
  check('prénom partagé : les deux Marc, à vérifier', ids(r) === 'j,m1?,m2?', ids(r));
}
{
  const r = lire('plongé avec jullie et stephan, 6 kg plomb, froid, vu un congre');
  check('mal écrit : « jullie », « stephan » retrouvés', ids(r) === 'j,s', ids(r));
  check('… sans inventer de nouveaux noms', !r.nouveaux.length, r.nouveaux.join());
}
{
  const r = lire('fosse avec Marc Leroy, Kevin et le club');
  check('nom complet : le bon Marc seulement', ids(r) === 'm2', ids(r));
  check('après « avec » : un nouveau nom (Kevin), pas « le club »', r.nouveaux.join() === 'Kevin', r.nouveaux.join());
}
check('« mars » n’est pas Marc, et moi je ne compte pas', ids(lire('rdv mars mer calme, avec Denis')) === '' && !lire('avec Denis').nouveaux.length);
check('un centre n’est pas une personne', ids(lire('Buceo Pandora')) === '');
check('« w/ Thomas, Léa Moreau » : deux nouveaux', lire('Fosse w/ Thomas, Léa Moreau').nouveaux.join('|') === 'Thomas|Léa Moreau', lire('Fosse w/ Thomas, Léa Moreau').nouveaux.join('|'));
check('distance d’édition', N.distance('jullie', 'julie') === 1 && N.distance('abc', 'xyz', 1) > 1);

// ---------- Agenda : la description compte ----------
{
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261015T180000Z\r\nSUMMARY:Fosse\r\nDESCRIPTION:avec Marc Leroy\\, Julie\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const ev = A.lireIcs(ics);
  check('agenda : description lue', ev[0]?.desc === 'avec Marc Leroy, Julie', JSON.stringify(ev));
  check('agenda : noms trouvés dans titre + description', ids(lire(A.texteEvenement(ev[0]))) === 'j,m2', ids(lire(A.texteEvenement(ev[0]))));
}

// ---------- Numérotation par les dates ----------
{
  const d = (id, date, heure = '', extra = {}) => ({ id, date, heureImmersion: heure, numero: null, ...extra });
  const nums = M.numerotationAuto([
    d('c', '2024-05-02', '14:00'), d('a', '2023-01-10'), d('b', '2024-05-02', '09:30'),
    d('x', '2022-07-01', '', { niveau: 'Baptême' }), d('y', '2022-08-01', '', { niveau: 'Baptême' }),
  ]);
  check('numéros : dans l’ordre des dates, puis des heures', nums.get('a') === 1 && nums.get('b') === 2 && nums.get('c') === 3, JSON.stringify([...nums]));
  check('baptêmes : -2, -1, à part', nums.get('x') === -2 && nums.get('y') === -1);
  check('rien ne change si déjà bon', M.numerotationAuto([{ id: 'a', date: '2023-01-01', numero: 1 }]).size === 0);

  const support = { kind: 'test', donnees: null, ecritures: 0, async charger() { return this.donnees; }, async enregistrer(data) { this.donnees = structuredClone(data); this.ecritures++; } };
  const store = creerStore(support);
  await store.init();
  const p1 = await store.saveDive({ ...M.emptyDive('moi', 1), date: '2026-08-01' });
  const p2 = await store.saveDive({ ...M.emptyDive('moi', 2), date: '2026-03-01' });
  check('store : une plongée plus ancienne passe devant', p2.numero === 1 && p1.numero === 2, `${p1.numero}/${p2.numero}`);
  await store.deleteDive(p2.id);
  check('store : une suppression resserre les numéros', (await store.getDive(p1.id)).numero === 1);
  const avant = support.ecritures;
  check('store : numeroterAuto n’écrit rien si tout est en ordre', (await store.numeroterAuto('moi')) === 0 && support.ecritures === avant);

  // ---------- Eau d'après le GPS, en tâche de fond ----------
  const E = await imp('js/entretien.js');
  check('eau : à reconnaître = GPS, ni manuelle ni déjà faite',
    E.eauxAReconnaitre([{ lat: 45, lng: 5 }, { lat: 45, lng: 5, eauManuelle: true }, { lat: 45, lng: 5, eauAuto: true }, { lat: null }, { lat: 0.001, lng: 9 }]).length === 1);
}

// ---------- Centres de plongée ----------
check('« plongée », « dive », « club » : on cherche des centres', C.chercheCentres('plongée') && C.chercheCentres('Dive') && C.chercheCentres('club de plongée Cherbourg') && !C.chercheCentres('Cherbourg'));
check('adresse OSM lisible', C.adresseOsm({ 'addr:housenumber': '12', 'addr:street': 'Quai Alexandre III', 'addr:postcode': '50100', 'addr:city': 'Cherbourg' }) === '12 Quai Alexandre III, 50100 Cherbourg');
{
  const liste = [{ nom: 'Cherbourg Plongée', adresse: 'Cherbourg' }, { nom: 'Aqua Diving', adresse: 'Granville' }];
  check('filtre : « plongée » seul garde tout', C.filtrerCentres(liste, 'plongée').length === 2);
  check('filtre : « dive granville » garde Granville', C.filtrerCentres(liste, 'dive granville').map(c => c.nom).join() === 'Aqua Diving');
  const connus = C.centresConnus([{ id: 1, date: '2024-01-01', centreNom: 'Cherbourg Plongée', centreAdresse: 'Quai' }, { id: 2, date: '2025-01-01', centreNom: 'Cherbourg Plongée' }]);
  check('centres connus : adresse gardée, compte', connus.length === 1 && connus[0].adresse === 'Quai' && connus[0].n === 2, JSON.stringify(connus));
  const faux = async () => ({ ok: true, json: async () => ({ elements: [
    { type: 'node', lat: 49.64, lon: -1.62, tags: { shop: 'scuba_diving', name: 'Cherbourg Plongée', 'addr:city': 'Cherbourg' } },
    { type: 'way', center: { lat: 49.65, lon: -1.6 }, tags: { amenity: 'dive_centre', name: 'Club ASPTT' } },
  ] }) });
  const r = await C.centresOsm([49.5, -1.8, 49.8, -1.4], faux);
  check('Overpass : nœuds et surfaces (centre) lus', r.length === 2 && r[1].lat === 49.65 && r[0].adresse === 'Cherbourg', JSON.stringify(r));
}

const ko = results.filter(r => r.startsWith(' FAIL'));
console.log(results.join('\n'));
console.log(ko.length ? `\n${ko.length} test(s) en échec` : `\n${results.length}/${results.length} vérifications noms, numéros, centres`);
process.exit(ko.length ? 1 : 0);
