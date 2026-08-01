// Vérifie la décision « eau douce / eau salée » à partir de ce qui est
// réellement cartographié au point choisi, et de l'altitude.
import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;

const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};

const { conclure, EN_ALTITUDE } = await import(path.join(ROOT, 'js/geo.js'));

const results = [];
const check = (name, cond, extra = '') =>
  results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

// Jeux de tags tels qu'OpenStreetMap les renvoie réellement
const lac      = [{ natural: 'water', water: 'lake', name: 'Lac d’Annecy' }];
const etang    = [{ natural: 'water', water: 'pond', name: 'Étang de la Gruère' }];
const carriere = [{ natural: 'water', name: 'Gravière de Beaumont' }];
const riviere  = [{ waterway: 'river', name: 'L’Oise' }];
const cote     = [{ natural: 'coastline' }];
const lagune   = [{ natural: 'water', water: 'lagoon', name: 'Étang de Berre' }];
const saleTag  = [{ natural: 'water', salt: 'yes', name: 'Salins' }];
const fosse    = [{ leisure: 'swimming_pool', name: 'Fosse Nemo 33' }];
const piscine  = [{ leisure: 'swimming_pool', name: 'Piscine municipale' }];

let r;

// ---------- Ce qui est cartographié fait foi ----------
r = conclure(lac, 447);
check('lac → eau douce', r.eau === 'douce' && r.certitude === 'sûre', JSON.stringify(r));
check('lac → nom retenu', r.nomPlanEau === 'Lac d’Annecy', r.nomPlanEau);

r = conclure(etang, 1005);
check('étang → eau douce', r.eau === 'douce', r.eau);

r = conclure(carriere, 30);
check('gravière sans type → eau douce', r.eau === 'douce', r.eau);

r = conclure(riviere, 28);
check('rivière → eau douce', r.eau === 'douce', r.eau);

r = conclure(cote, 0);
check('trait de côte au niveau 0 → eau salée', r.eau === 'salee' && r.certitude === 'sûre', JSON.stringify(r));

r = conclure(lagune, 0);
check('lagune → eau salée', r.eau === 'salee', r.eau);

r = conclure(saleTag, 0);
check('tag salt=yes → eau salée', r.eau === 'salee' && r.certitude === 'sûre', JSON.stringify(r));

// ---------- Fosses et piscines ----------
r = conclure(fosse, 60);
check('fosse → eau douce', r.eau === 'douce', r.eau);
check('fosse reconnue comme telle', r.fosse === true, String(r.fosse));

r = conclure(piscine, 60);
check('piscine → eau douce', r.eau === 'douce', r.eau);
check('piscine n’est pas une fosse', r.fosse === false, String(r.fosse));

// ---------- L'altitude tranche quand rien n'est cartographié ----------
r = conclure([], 447);
check('rien + altitude 447 m → eau douce', r.eau === 'douce', JSON.stringify(r));
check('  et c’est annoncé comme probable', r.certitude === 'probable', r.certitude);

r = conclure([], 0);
check('rien + niveau de la mer → eau salée', r.eau === 'salee', r.eau);
check('  et c’est annoncé comme incertain', r.certitude === 'incertaine', r.certitude);

r = conclure(cote, 12);
check('côte mais 12 m d’altitude → eau douce (lac côtier)', r.eau === 'douce', JSON.stringify(r));

// ---------- Priorité : la carte avant l'altitude ----------
r = conclure(lac, 0);
check('lac au niveau de la mer reste douce', r.eau === 'douce', r.eau);

// ---------- Aucune donnée ----------
r = conclure(null, null);
check('rien du tout → aucune conclusion', r.eau === '' && r.certitude === 'incertaine', JSON.stringify(r));
r = conclure([], null);
check('carte vide sans altitude → aucune conclusion', r.eau === '', r.eau);

// ---------- Altitude retournée ----------
check('altitude reportée', conclure([], 447).altitude === 447);
check('seuil réglementaire à 300 m', EN_ALTITUDE === 300, String(EN_ALTITUDE));

console.log(results.join('\n'));
const failed = results.filter(x => x.startsWith(' FAIL')).length;
console.log(failed ? `\n${failed} test(s) en échec` : '\nTous les tests de plan d’eau passent.');
process.exit(failed ? 1 : 0);
