// Connexion Bluetooth (APK) : montre en veille, réveillée par une recherche,
// ou vraiment muette (message qui dit quoi faire). Faux plugin, pas de montre.
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const B = await import(__p2u(path.join(ROOT, 'js/ble.js')).href);

const results = [];
const check = (name, cond, extra = '') => results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

/** Un faux plugin : la montre répond au n-ième essai, et se montre (ou non) au scan. */
function fauxPlugin({ repondAu = 1, visible = true } = {}) {
  let essais = 0, ecoute = null, scan = false;
  return {
    appels: [],
    async connect({ timeout }) {
      essais++; this.appels.push(`connect(${timeout})`);
      if (essais < repondAu) throw new Error('Connection timeout.');
    },
    async disconnect() { this.appels.push('disconnect'); },
    async addListener(nom, cb) { if (nom === 'onScanResult') ecoute = cb; return { remove: async () => { ecoute = null; } }; },
    async requestLEScan() {
      scan = true; this.appels.push('scan');
      if (visible) setTimeout(() => ecoute?.({ device: { deviceId: 'AA', name: 'Suunto Ocean 2425' }, rssi: -61 }), 20);
    },
    async stopLEScan() { scan = false; this.appels.push('stopScan'); },
    get scanEnCours() { return scan; },
  };
}
const journal = [];
const j = t => journal.push(t);
const montre = { deviceId: 'AA', name: 'Suunto Ocean 2425' };

{
  const ble = fauxPlugin({ repondAu: 1 });
  await B.connecterNatif(ble, montre, j, { delai: 50, recherche: 200 });
  check('montre réveillée : connectée du premier coup, sans recherche', ble.appels.join() === 'connect(50)', ble.appels.join());
}
{
  const ble = fauxPlugin({ repondAu: 2 });
  journal.length = 0;
  await B.connecterNatif(ble, montre, j, { delai: 50, recherche: 500 });
  check('montre en veille : recherche, la montre est vue, second essai réussi',
    ble.appels.join() === 'connect(50),disconnect,scan,stopScan,connect(25000)' && !ble.scanEnCours, ble.appels.join());
  check('le journal dit ce qui se passe', journal.some(t => /montre vue/.test(t)) && journal.some(t => /nouvel essai/.test(t)), journal.join(' | '));
}
{
  const ble = fauxPlugin({ repondAu: 99, visible: false });
  let erreur = '';
  try { await B.connecterNatif(ble, montre, j, { delai: 50, recherche: 120 }); } catch (e) { erreur = e.message; }
  check('montre muette : message qui dit quoi faire (réveiller, Bluetooth, appli Suunto)',
    erreur === B.MONTRE_MUETTE && /Réveille-la/.test(erreur) && /appli Suunto/.test(erreur), erreur);
  check('… et la recherche est bien arrêtée', !ble.scanEnCours && ble.appels.includes('stopScan'), ble.appels.join());
}

{
  // Une montre appairée qui s'annonce sans nom, sous une autre adresse, avec le service Suunto.
  const ble = fauxPlugin({ repondAu: 2, visible: false });
  ble.requestLEScan = async function () { this.appels.push('scan');
    setTimeout(() => { ecouteur?.({ device: { deviceId: 'ZZ' }, rssi: -80 }); ecouteur?.({ device: { deviceId: 'BB' }, uuids: ['61353090-8231-49CC-B57A-886370740041'], rssi: -55 }); }, 20); };
  let ecouteur = null;
  ble.addListener = async (nom, cb) => { if (nom === 'onScanResult') ecouteur = cb; return { remove: async () => {} }; };
  const id = await B.connecterNatif(ble, montre, j, { delai: 50, recherche: 500 });
  check('sans nom, autre adresse : reconnue au service Suunto, connexion à cette adresse', id === 'BB' && ble.appels.at(-1) === 'connect(25000)', `${id} ${ble.appels.join()}`);
}
{
  const ble = fauxPlugin({ repondAu: 99, visible: false });
  let ecouteur = null;
  ble.addListener = async (nom, cb) => { if (nom === 'onScanResult') ecouteur = cb; return { remove: async () => {} }; };
  ble.requestLEScan = async function () { setTimeout(() => ecouteur?.({ device: { deviceId: 'CC', name: 'GoPro 6440' }, rssi: -70 }), 20); };
  journal.length = 0;
  try { await B.connecterNatif(ble, montre, j, { delai: 50, recherche: 150 }); } catch { /* attendu */ }
  check('introuvable : le journal liste ce qui a été vu (diagnostic)', journal.some(t => /appareils vus pendant la recherche : GoPro 6440/.test(t)), journal.join(' | '));
}

{
  // Montre appairée mais jamais vue depuis l'allumage du Bluetooth : on la cherche AVANT de se connecter.
  const ble = fauxPlugin({ repondAu: 1 });
  journal.length = 0;
  const id = await B.connecterNatif(ble, montre, j, { delai: 50, recherche: 200, chercherAvant: 300 });
  check('recherche d’abord, puis connexion à l’adresse vue (un seul essai)', id === 'AA'
    && ble.appels.join() === 'scan,stopScan,connect(20000)', ble.appels.join());
}
{
  // Rien vu à la recherche préalable : connexion directe quand même, puis la recherche longue.
  const ble = fauxPlugin({ repondAu: 1, visible: false });
  journal.length = 0;
  await B.connecterNatif(ble, montre, j, { delai: 50, recherche: 200, chercherAvant: 100 });
  check('pas vue avant : le journal le dit, connexion directe tentée', ble.appels.join() === 'scan,stopScan,connect(50)'
    && journal.some(t => /ne s’annonce pas/.test(t)), `${ble.appels.join()} | ${journal.join(' | ')}`);
}

{
  // Sans nom, sans service, adresse aléatoire : reconnue à l'identifiant de fabricant Suunto (0x009F).
  const ble = fauxPlugin({ repondAu: 1, visible: false });
  let ecouteur = null;
  ble.addListener = async (nom, cb) => { if (nom === 'onScanResult') ecouteur = cb; return { remove: async () => {} }; };
  ble.requestLEScan = async function () { this.appels.push('scan');
    setTimeout(() => { ecouteur?.({ device: { deviceId: '4B:4F' }, manufacturerData: { 76: {} }, rssi: -52 }); ecouteur?.({ device: { deviceId: '59:FA' }, manufacturerData: { 159: {} }, rssi: -54 }); }, 20); };
  const id = await B.connecterNatif(ble, montre, j, { delai: 50, recherche: 200, chercherAvant: 300 });
  check('reconnue au fabricant Suunto (0x009F)', id === '59:FA', `${id} ${ble.appels.join()}`);
}

{
  // Attente guidée : la montre (connectée au téléphone) n'apparaît qu'au bout d'un moment.
  const ble = fauxPlugin({ repondAu: 2, visible: false });
  let ecouteur = null, scans = 0;
  ble.addListener = async (nom, cb) => { if (nom === 'onScanResult') ecouteur = cb; return { remove: async () => {} }; };
  ble.requestLEScan = async function () { scans++; this.appels.push('scan');
    if (scans === 2) setTimeout(() => ecouteur?.({ device: { deviceId: 'AA', name: 'Suunto Ocean 2425' }, rssi: -60 }), 1300); };
  const attentes = [];
  const id = await B.connecterNatif(ble, montre, j, { delai: 50, chercherAvant: 100, attente: 3000, surAttente: x => attentes.push(x) });
  check('attente guidée : connexion dès que la montre se montre', id === 'AA' && ble.appels.at(-1) === 'connect(25000)', ble.appels.join());
  check('attente guidée : l’écran est tenu au courant, puis libéré', attentes.length >= 2 && attentes[0].total === 3 && attentes.at(-1) === null, JSON.stringify(attentes));
}
{
  // « Arrêter » pendant l'attente.
  const ble = fauxPlugin({ repondAu: 99, visible: false });
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 300);
  let nom = '';
  const t0 = Date.now();
  try { await B.connecterNatif(ble, montre, j, { delai: 50, chercherAvant: 100, attente: 60000, surAttente: () => {}, signal: ctrl.signal }); }
  catch (e) { nom = e.name; }
  check('arrêter : l’attente s’interrompt tout de suite', nom === 'Annule' && Date.now() - t0 < 2000 && !ble.scanEnCours, `${nom} ${Date.now() - t0} ms`);
}

const ko = results.filter(r => r.startsWith(' FAIL'));
console.log(results.join('\n'));
console.log(ko.length ? `\n${ko.length} test(s) en échec` : `\n${results.length}/${results.length} vérifications Bluetooth`);
process.exit(ko.length ? 1 : 0);
