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

const ko = results.filter(r => r.startsWith(' FAIL'));
console.log(results.join('\n'));
console.log(ko.length ? `\n${ko.length} test(s) en échec` : `\n${results.length}/${results.length} vérifications Bluetooth`);
process.exit(ko.length ? 1 : 0);
