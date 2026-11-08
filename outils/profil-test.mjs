// Analyse du profil (conso réelle, remontée, palier de sécurité, déco)
// et nom du lieu d'après le GPS (carnet, puis OpenStreetMap).
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
const imp = rel => import(__p2u(path.join(ROOT, rel)).href);

const P = await imp('js/profil-analyse.js');
const L = await imp('js/lieu-auto.js');
const E = await imp('js/entretien.js');

const results = [];
const check = (name, cond, extra = '') => results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

/** Une plongée carrée : descente 2 min, 20 min à `prof`, remontée, palier 3 min à 4 m, surface. */
function plongee({ prof = 20, plafond = 0, bar0 = 200, sac = 20, litres = 12, temp = 22, surfaceAvant = 0 } = {}) {
  const pts = [];
  let t = 0, p = bar0;
  const pousse = (d, dt) => {
    const amb = 1 + d / 10;
    p -= (sac * amb * dt / 60) / litres;
    pts.push({ t, d, temp: d > 10 ? temp - 4 : temp, pression: Math.round(p * 10) / 10, plafond, sansPalier: d > 5 ? 30 : 100, fc: 110 });
    t += dt;
  };
  for (let i = 0; i < surfaceAvant; i += 10) pousse(0.2, 10);
  for (let i = 1; i <= 12; i++) pousse(prof * i / 12, 10);
  for (let i = 0; i < 120; i++) pousse(prof, 10);
  for (let d = prof; d > 4; d -= 1.5) pousse(d, 10);          // 9 m/min
  for (let i = 0; i < 18; i++) pousse(4, 10);
  pousse(1, 10); pousse(0, 10);
  return pts;
}

{
  const a = P.analyserProfil(plongee(), { blocLitres: 12 });
  check('durée : le temps sous l’eau', Math.abs(a.dureeS - 1600) <= 30, a.dureeS);
  check('prof. max et moyenne pondérée', a.profMax === 20 && a.profMoy > 15 && a.profMoy < 20, `${a.profMax} ${a.profMoy}`);
  check('SAC retrouvé (≈ 20 L/min)', Math.abs(a.bloc.sac - 20) <= 1, a.bloc.sac);
  check('litres respirés', a.bloc.litres > 1300 && a.bloc.litres < 1600, a.bloc.litres);
  check('remontée : 9 m/min, rien de trop rapide', a.remontee.max >= 8 && a.remontee.max <= 10 && a.remontee.rapides === 0, JSON.stringify(a.remontee));
  check('palier de sécurité 3 min détecté', a.palierSecuMin === 3, a.palierSecuMin);
  check('plafond jamais franchi : pas de déco', a.deco === false);
  check('thermocline repérée', a.temp.thermocline != null && a.temp.min === 18 && a.temp.max === 22, JSON.stringify(a.temp));
  check('cœur', a.fc.moy === 110 && a.fc.max === 110);
  check('courbe de consommation', a.conso.length > 50 && a.conso.every(c => c.sac > 10 && c.sac < 30), a.conso.slice(0, 3).map(c => c.sac).join());
}
{
  const a = P.analyserProfil(plongee({ surfaceAvant: 240 }), { blocLitres: 12 });
  check('l’attente en surface ne compte pas dans la durée', Math.abs(a.dureeS - 1600) <= 30, a.dureeS);
  const b = P.analyserProfil(plongee(), { blocLitres: 12, blocType: 'Bi-bouteilles' });
  check('bi-bouteilles : volume double', Math.abs(b.bloc.sac - 40) <= 2, b.bloc.sac);
}
{
  const pts = plongee({ plafond: 3 });
  const a = P.analyserProfil(pts, {});
  check('plafond franchi : décompression', a.deco === true && a.plafondMax === 3 && a.tempsDecoMin > 0);
  check('paliersDuProfil : rien à corriger en déco', P.paliersDuProfil(pts) === null);
  const sans = plongee().map(({ plafond, ...x }) => x);
  check('paliersDuProfil : sans plafond connu, on ne sait pas', P.paliersDuProfil(sans) === null);
  const p = P.paliersDuProfil(plongee());
  check('paliersDuProfil : palier de sécurité, pas de déco', p && p.palierSecu === true && p.palierSecuMin === 3 && p.palier3 === null && p.palier9 === null, JSON.stringify(p));
}
{
  // Remontée trop rapide : 20 m en 1 min.
  const pts = [{ t: 0, d: 20 }, { t: 10, d: 20 }, { t: 20, d: 20 }, { t: 30, d: 15 }, { t: 40, d: 10 }, { t: 50, d: 6 }, { t: 60, d: 3 }, { t: 70, d: 0 }];
  const a = P.analyserProfil(pts, {});
  check('remontée rapide signalée', a.remontee.max > 15 && a.remontee.rapides === 1, JSON.stringify(a.remontee));
  check('profil vide : null', P.analyserProfil([], {}) === null && P.analyserProfil([{ t: 0, d: 0.5 }, { t: 1, d: 0.4 }, { t: 2, d: 0 }]) === null);
}

// ---------- Entretien : faux paliers estimés ----------
{
  const d = { id: 'x', paliersEstimes: true, palier3: 3, palier9: 2, options: ['Plongée profonde', 'Décompression'], samples: plongee() };
  const [c] = E.paliersACorriger([d, { id: 'y', paliersEstimes: true, samples: plongee({ plafond: 3 }) }, { id: 'z', samples: plongee() }]);
  check('entretien : faux paliers corrigés, « Décompression » retirée',
    c && c.id === 'x' && c.palier3 === null && c.palierSecu && !c.options.includes('Décompression') && c.options.includes('Plongée profonde'));
  const m = E.paliersACorriger([{ ...d, optionsManuelles: ['Décompression'] }])[0];
  check('entretien : « Décompression » choisie à la main, gardée', m.options.includes('Décompression'));
}

// ---------- Lieu ----------
{
  const dives = [
    { id: 'a', lat: 14.743, lng: -61.187, lieuNom: 'Martinique St Pierre', site: 'Diamant Rock' },
    { id: 'b', lat: 16.594, lng: -22.906, lieuNom: 'Cap vert santa maria', date: '2026-09-02', heureImmersion: '09:00', centreNom: 'Orca Dive' },
    { id: 'n', lat: 14.744, lng: -61.193, lieuNom: '' },
    { id: 'g', lat: 0.001, lng: 9.2, lieuNom: '' },
    { id: 'm', lat: 4.224, lng: 73.533, lieuNom: '' },
  ];
  const n = dives.find(d => d.id === 'n');
  check('à nommer : GPS valable, sans nom', L.lieuxANommer(dives).map(d => d.id).join() === 'n,m');
  const p = L.lieuDuCarnet(n, dives);
  check('carnet : la voisine à 650 m donne son nom', p?.lieuNom === 'Martinique St Pierre' && p.lieuAuto === 'carnet' && !p.site, JSON.stringify(p));
  check('carnet : rien à moins de 2 km', L.lieuDuCarnet(dives.find(d => d.id === 'm'), dives) === null);
  const ap = { id: 'c', lat: 16.595, lng: -22.909, date: '2026-09-02', heureImmersion: '14:00' };
  check('même sortie : la plongée du matin', L.memeSortie(ap, dives)?.id === 'b');
  check('même sortie : pas un autre jour', L.memeSortie({ ...ap, date: '2026-09-03' }, dives) === null);
  check('libellé : outre-mer', L.libelleAdresse({ town: 'Saint-Pierre', state: 'Martinique', country: 'France' }) === 'Saint-Pierre, Martinique');
  check('libellé : île et pays', L.libelleAdresse({ island: 'Maafushi', atoll: 'Kaafu', country: 'Maldives' }) === 'Maafushi, Maldives');
  check('libellé : métropole', L.libelleAdresse({ town: 'Beaumont-sur-Oise', state: 'Île-de-France', country: 'France' }) === 'Beaumont-sur-Oise, France');

  // OSM simulé : en mer, Nominatim ne répond rien, Overpass donne l'île la plus proche et le site.
  const faux = async (url, opts = {}) => {
    const rep = j => ({ ok: true, json: async () => j });
    if (url.includes('nominatim') && url.includes('lat=4.224')) return rep({ error: 'Unable to geocode' });
    if (url.includes('nominatim')) return rep({ display_name: 'Maafushi, Kaafu, Maldives', address: { island: 'Maafushi', country: 'Maldives' } });
    if (url.includes('overpass')) {
      check('overpass : requête POST', opts.method === 'POST' && /scuba_diving/.test(decodeURIComponent(opts.body)));
      return rep({ elements: [
        { lat: 4.30, lon: 73.60, tags: { place: 'island', name: 'Loin' } },
        { lat: 4.25, lon: 73.54, tags: { place: 'island', name: 'Maafushi' } },
        { lat: 4.225, lon: 73.534, tags: { sport: 'scuba_diving', name: 'Banana Reef' } },
      ] });
    }
    throw new Error('url inattendue ' + url);
  };
  const o = await L.lieuOsm(4.224, 73.533, { f: faux });
  check('OSM : en mer, l’île la plus proche et son pays', o?.lieuNom === 'Maafushi, Maldives', JSON.stringify(o));
  check('OSM : le site de plongée cartographié', o?.site === 'Banana Reef' && o.lieuAuto === 'osm');
  const horsLigne = await L.lieuOsm(4.224, 73.533, { f: async () => { throw new Error('hors ligne'); } });
  check('OSM : hors ligne, null (sans lever)', horsLigne === null);
}

// ---------- Ce qu'on sait d'une plongée, où trouver le reste ----------
{
  const D = await imp('js/donnees.js');
  const liste = { ids: [1794106227, 1788000000] };
  const ble = { suuntoKeys: ['ocean:1794106227'], samples: plongee(), lat: 4.2, lng: 73.5, pressionDepart: 195, pressionFin: 18 };
  const b = D.bilanDonnees(ble, { liste });
  check('bilan : plongée Bluetooth complète', b.source === 'montre' && b.niveau === 'complet' && !b.recuperer.length && b.coeur, JSON.stringify(b));
  const sansSonde = plongee().map(({ pression, ...x }) => x);
  const cloud = { suunto: { source: 'suunto-cloud' }, suuntoKeys: ['suunto:abc'], date: '2026-08-30', heureImmersion: '09:00',
    samples: [], lat: 16.6, lng: -22.9, pressionDepart: 200, pressionFin: 50 };
  const c = D.bilanDonnees(cloud, { liste: null });
  check('bilan : compte Suunto sans .fit → à compléter depuis le compte', c.niveau === 'vide' && c.sonde === 'defaut'
    && c.recuperer[0]?.ou === 'compte' && c.manque.includes('courbe de plongée'), JSON.stringify(c));
  const t = new Date('2026-08-30T09:00:00').getTime() / 1000;
  const c2 = D.bilanDonnees(cloud, { liste: { ids: [t + 120] } });
  check('bilan : encore dans la montre → récupérer en Bluetooth', c2.recuperer[0]?.ou === 'montre', JSON.stringify(c2.recuperer));
  const rg = D.bilanDonnees({ suuntoKeys: ['rgpd:2025-06-14_10.00.00'], samples: sansSonde, pressionDepart: 209, pressionFin: 102, lat: 49, lng: 2 }, { liste: null });
  check('bilan : export RGPD, sonde début/fin seulement', rg.niveau === 'partiel' && rg.sonde === 'debut-fin' && !rg.recuperer.length, JSON.stringify(rg));
  const vieux = D.bilanDonnees({ date: '2019-05-01', pressionDepart: 200, pressionFin: 50 }, { liste: null, debutMontre: '2022-01-01' });
  check('bilan : avant l’ordinateur, rien à aller chercher', vieux.niveau === 'vide' && !vieux.recuperer.length);
  const apres = D.bilanDonnees({ date: '2025-04-29' }, { liste: null, debutMontre: '2022-01-01' });
  check('bilan : saisie après l’ordinateur, peut-être sur le compte', apres.recuperer[0]?.ou === 'compte');
  check('début de l’ordinateur', D.debutOrdinateur([{ date: '2020-01-01' }, { date: '2022-03-01', suuntoKeys: ['rgpd:x'] }, { date: '2023-01-01', suuntoKeys: ['ocean:1'] }]) === '2022-03-01');

  // Compléter une plongée du compte Suunto avec la montre
  const dec = { samples: plongee(), pressionDepart: 196, pressionFin: 60, profMax: 20, dureeMin: 27, tempFond: 18, blocLitres: 12,
    lieu: { lat: 16.6, lng: -22.9 }, gazO2: 32 };
  const { champs, libelles } = D.completerDepuisMontre({ ...cloud, profMax: 19.8, dureeMin: 28, lestage: '6' }, dec);
  check('compléter : courbe + sonde, 200/50 par défaut remplacés', champs.samples?.length && champs.pressionDepart === 196 && libelles.includes('courbe et sonde'), JSON.stringify(libelles));
  check('compléter : ce qui est saisi n’est pas écrasé', !('profMax' in champs) && !('dureeMin' in champs) && !('lat' in champs) && champs.blocLitres === 12 && champs.gazType === 'nitrox');
  const r2 = D.completerDepuisMontre({ samples: sansSonde }, dec);
  check('compléter : une courbe sans sonde est remplacée', !!r2.champs.samples);
  const r3 = D.completerDepuisMontre({ samples: plongee() }, { samples: sansSonde });
  check('compléter : une courbe avec sonde est gardée', !r3.champs.samples);
}

console.log(results.join('\n'));
const ko = results.filter(r => r.startsWith(' FAIL'));
console.log(`\n${results.length - ko.length}/${results.length} vérifications profil & lieu`);
if (ko.length) process.exit(1);
