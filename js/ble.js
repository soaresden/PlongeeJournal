// ============================================================
//  Bluetooth Low Energy : une seule interface, deux moteurs
//
//    - dans l'APK : le plugin natif @capacitor-community/bluetooth-le
//      (le WebView Android n'a pas Web Bluetooth) ;
//    - sur le site : Web Bluetooth (Chrome Android, Chrome/Edge PC).
//
//  Les deux rendent le même « lien » :
//    { nom, id, moteur, ecrire(octets), ecouter(cb), fermer(), surCoupure(cb) }
//  La session de la montre (ocean-device.js) ne voit que ça.
//
//  Cohabitation avec l'appli Suunto : sur Android, l'appairage
//  appartient au téléphone, pas à une appli. On réutilise donc la
//  montre déjà appairée (liste des appareils associés) sans rien
//  désappairer, et on se branche sur le lien existant si l'appli
//  Suunto l'a déjà ouvert (une montre connectée n'est plus visible
//  dans un scan).
// ============================================================

import { OCEAN_SERVICE, OCEAN_NOMS, hex } from './ocean-proto.js';

const CLE_APPAREIL = 'ocean.appareil';
const TAILLE_ECRITURE_DEFAUT = 20;     // MTU BLE par défaut (23) − 3

const memo = {
  lire() { try { return JSON.parse(localStorage.getItem(CLE_APPAREIL) || 'null'); } catch { return null; } },
  ecrire(v) { try { localStorage.setItem(CLE_APPAREIL, JSON.stringify(v)); } catch { /* navigation privée */ } },
  oublier() { try { localStorage.removeItem(CLE_APPAREIL); } catch { /* idem */ } },
};

export const oublierMontre = () => memo.oublier();
export const montreMemorisee = () => memo.lire();

/** Suunto Oy dans la liste des fabricants du Bluetooth SIG. */
export const FABRICANT_SUUNTO = '0x009F';

const estOcean = nom => !!nom && OCEAN_NOMS.some(n => nom.startsWith(n));

function pluginNatif() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : null;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.BluetoothLe || null;
}

/** Ce qui est possible ici, pour l'afficher avant de proposer le bouton. */
export function bleDisponible() {
  if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
    return pluginNatif()
      ? { ok: true, moteur: 'capacitor' }
      : { ok: false, moteur: 'capacitor', raison: 'Le module Bluetooth manque dans cette version de l’APK : installe la dernière.' };
  }
  if (typeof navigator !== 'undefined' && navigator.bluetooth?.requestDevice) {
    return { ok: true, moteur: 'web' };
  }
  const ios = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  return {
    ok: false, moteur: 'aucun',
    raison: ios
      ? 'Safari sur iPhone/iPad ne permet pas le Bluetooth depuis une page web.'
      : 'Ce navigateur ne gère pas le Bluetooth. Utilise Chrome (Android ou PC), Edge, ou l’APK Android du carnet.',
  };
}

/** Une file d'attente : un seul accès GATT à la fois. */
function fileUnique() {
  let derniere = Promise.resolve();
  return fn => {
    const p = derniere.then(fn, fn);
    derniere = p.catch(() => {});
    return p;
  };
}

function choisirCaracteristiques(caracs, journal) {
  for (const c of caracs) journal(`  caractéristique ${c.uuid} : ${Object.entries(c.props).filter(([, v]) => v).map(([k]) => k).join(', ')}`);
  const ecriture = caracs.find(c => c.props.writeWithoutResponse) || caracs.find(c => c.props.write);
  const notif = caracs.find(c => c.props.notify) || caracs.find(c => c.props.indicate);
  if (!ecriture || !notif) throw new Error('La montre n’expose pas les caractéristiques attendues (écriture + notification).');
  return { ecriture, notif };
}

const avecDelai = (p, ms, quoi) => Promise.race([
  p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${quoi} : pas de réponse après ${Math.round(ms / 1000)} s`)), ms)),
]);

// ============================================================
//  Moteur natif (APK)
// ============================================================

/** Le message quand la montre ne répond vraiment pas : quoi faire, concrètement. */
export const MONTRE_MUETTE = 'La montre ne répond pas. Réveille-la (écran allumé, sur le cadran), vérifie que son Bluetooth '
  + 'est actif (pas en mode avion), garde-la près du téléphone, puis réessaie. Encore mieux : sur la montre, ouvre le menu '
  + 'des appareils appairés (là où l’on voit « MobileApp ») et mets-la en mode appairage : laisse-la sur cet écran pendant que le carnet la cherche, c’est là qu’elle se laisse détecter. '
  + 'Sur une tablette ou un 2e téléphone : la montre ne parle souvent qu’à un appareil à la fois ; si elle est connectée '
  + 'au téléphone (appli Suunto), coupe le Bluetooth du téléphone le temps de l’import. La montre doit aussi avoir la tablette '
  + 'dans sa liste ; sinon « Oublier » la montre dans le Bluetooth '
  + 'd’Android, puis « Choisir une autre montre » avec la montre en mode appairage (voir le mode d’emploi). '
  + 'Si ça ne passe toujours pas : ouvre '
  + 'l’appli Suunto pour qu’elle se connecte à la montre, reviens ici et relance (le carnet passera par sa connexion). '
  + 'Autre chemin, sans Bluetooth : Plongées → Importer → « Récupérer depuis mon compte Suunto » (ce que l’appli Suunto a synchronisé).';

/**
 * Cherche la montre quelques secondes (un scan la « réveille » souvent :
 * Android ne se connecte qu'à un appareil qui s'annonce). Sans filtre de
 * nom : une montre déjà appairée s'annonce souvent SANS son nom. On la
 * reconnaît à son adresse, à son nom ou au service Suunto annoncé. Tout ce
 * qui est vu est noté dans le journal, pour le diagnostic.
 * @returns {Promise<object|null>} l'appareil vu, ou null
 */
export function chercherMontre(ble, id, ms, journal) {
  return new Promise(resolve => {
    let fini = false, ecoute = null;
    const vus = new Map();
    const finir = async vu => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      try { await ble.stopLEScan(); } catch { /* déjà arrêté */ }
      try { await ecoute?.remove?.(); } catch { /* idem */ }
      if (!vu) {
        const liste = [...vus.values()].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)).slice(0, 12);
        journal(`appareils vus pendant la recherche : ${liste.length
          ? liste.map(v => `${v.nom || 'sans nom'} [${v.id}${v.rssi != null ? `, ${v.rssi} dBm` : ''}${v.suunto ? ', service Suunto' : ''}${v.fab.length ? `, fabricant ${v.fab.join('/')}` : ''}]`).join(' ; ')
          : 'aucun (Bluetooth ou autorisation « Appareils à proximité » ?)'}`);
      }
      resolve(vu);
    };
    const minuteur = setTimeout(() => finir(null), ms);
    Promise.resolve(ble.addListener('onScanResult', r => {
      const d = r?.device || {};
      const nom = d.name || r?.localName || '';
      const uuids = (r?.uuids || []).map(u => String(u).toLowerCase());
      // Identifiant du fabricant dans l'annonce (Bluetooth SIG) : 0x009F
      // pour Suunto. Une montre appairée s'annonce souvent sans nom ni
      // service : c'est alors le seul moyen de la reconnaître.
      const fab = Object.keys(r?.manufacturerData || {}).map(k => `0x${Number(k).toString(16).padStart(4, '0').toUpperCase()}`);
      const suunto = uuids.includes(OCEAN_SERVICE) || fab.includes(FABRICANT_SUUNTO);
      if (d.deviceId) vus.set(d.deviceId, { id: d.deviceId, nom, rssi: r?.rssi, suunto, fab });
      if (d.deviceId === id || estOcean(nom) || suunto) {
        journal(`→ montre vue : ${nom || d.deviceId}${r?.rssi != null ? ` (signal ${r.rssi} dBm)` : ''}${d.deviceId !== id ? ` à l’adresse ${d.deviceId}` : ''}`);
        finir(d.deviceId ? { deviceId: d.deviceId, name: nom } : { deviceId: id, name: nom });
      }
    })).then(h => { ecoute = h; if (fini) h?.remove?.(); });
    Promise.resolve(ble.requestLEScan({ allowDuplicates: false }))
      .catch(e => { journal(`recherche impossible : ${e?.message || e}`); finir(null); });
  });
}

/**
 * Se connecte à la montre.
 *
 * Android ne sait se connecter à un appareil Bluetooth « basse
 * consommation » que s'il l'a VU s'annoncer depuis que le Bluetooth est
 * allumé : sinon il ignore si son adresse est publique ou aléatoire, et
 * la connexion directe à l'adresse de l'appairage tourne dans le vide
 * (« Connection timeout »). L'appli Suunto, elle, ne lâche jamais la
 * montre. Donc, sauf si elle est déjà connectée : on la cherche d'abord
 * (`chercherAvant`), on se connecte à l'adresse où elle vient d'être vue ;
 * sinon connexion directe, puis une recherche plus longue et un dernier
 * essai ; sinon, un message qui dit quoi faire.
 */
export async function connecterNatif(ble, appareil, journal, { delai = 15000, recherche = 12000, chercherAvant = 0 } = {}) {
  const id = appareil.deviceId;
  if (chercherAvant) {
    journal(`recherche de la montre (${Math.round(chercherAvant / 1000)} s) : Android doit la voir s’annoncer avant de s’y connecter…`);
    const vue = await chercherMontre(ble, id, chercherAvant, journal);
    if (vue) {
      const cible = vue.deviceId || id;
      try {
        await ble.connect({ deviceId: cible, timeout: Math.max(delai, 20000) });
        return cible;
      } catch (e) {
        journal(`✗ vue mais pas de connexion (${e?.message || e})`);
        try { await ble.disconnect({ deviceId: cible }); } catch { /* rien d'ouvert */ }
      }
    } else {
      journal('la montre ne s’annonce pas : en veille, ou déjà connectée à un autre appareil (le téléphone et son appli Suunto ?)');
    }
  }
  try {
    await ble.connect({ deviceId: id, timeout: delai });
    return id;
  } catch (e) {
    journal(`✗ pas de réponse (${e?.message || e}) : la montre ne s’annonce pas. Recherche ${Math.round(recherche / 1000)} s — réveille-la…`);
    try { await ble.disconnect({ deviceId: id }); } catch { /* rien d'ouvert */ }
  }
  const vue = await chercherMontre(ble, id, recherche, journal);
  if (!vue) { journal('✗ montre introuvable autour du téléphone'); throw new Error(MONTRE_MUETTE); }
  const cible = vue.deviceId || id;
  journal(`nouvel essai de connexion${cible !== id ? ` (adresse ${cible})` : ''}…`);
  try {
    await ble.connect({ deviceId: cible, timeout: 25000 });
  } catch (e) {
    journal(`✗ toujours pas : ${e?.message || e}`);
    throw new Error(MONTRE_MUETTE);
  }
  return cible;
}

async function ouvrirNatif({ journal, choisirAutre }) {
  const ble = pluginNatif();
  const file = fileUnique();
  journal('moteur : plugin Bluetooth natif (APK)');

  // Demande les autorisations (Bluetooth à proximité ; localisation
  // jusqu'à Android 11, que Google exigeait pour scanner).
  await ble.initialize({});
  try {
    const { value } = await ble.isEnabled();
    if (!value) {
      journal('Bluetooth éteint : demande d’activation');
      await ble.requestEnable().catch(() => {});
    }
  } catch { /* pas grave */ }

  let appareil = null, dejaConnectee = false;
  const connu = memo.lire();

  if (!choisirAutre) {
    // 1. Déjà connectée (par l'appli Suunto, souvent) : elle n'apparaît
    //    plus dans un scan, mais Android sait qu'elle est là.
    try {
      const { devices = [] } = await ble.getConnectedDevices({ services: [OCEAN_SERVICE] });
      journal(`appareils déjà connectés : ${devices.map(d => d.name || d.deviceId).join(', ') || 'aucun'}`);
      appareil = devices.find(d => d.deviceId === connu?.id) || devices.find(d => estOcean(d.name)) || null;
      if (appareil) { dejaConnectee = true; journal(`→ montre déjà connectée : ${appareil.name}`); }
    } catch (e) { journal(`getConnectedDevices : ${e.message || e}`); }

    // 2. Appairée au téléphone (par l'appli Suunto) : on s'y connecte
    //    directement, sans scan et sans nouvel appairage.
    if (!appareil) {
      try {
        const { devices = [] } = await ble.getBondedDevices();
        journal(`appareils associés : ${devices.map(d => d.name || d.deviceId).join(', ') || 'aucun'}`);
        appareil = devices.find(d => d.deviceId === connu?.id) || devices.find(d => estOcean(d.name)) || null;
        if (appareil) journal(`→ montre associée : ${appareil.name} (${appareil.deviceId})`);
      } catch (e) { journal(`getBondedDevices : ${e.message || e}`); }
    }
  }

  // 3. Sinon : fenêtre de recherche d'Android.
  if (!appareil) {
    journal('recherche Bluetooth (fenêtre de choix)');
    appareil = await ble.requestDevice({ namePrefix: 'Suunto', optionalServices: [OCEAN_SERVICE] });
    journal(`→ choisi : ${appareil.name || '?'} (${appareil.deviceId})`);
  }

  const coupures = [];
  journal('connexion…');
  // La montre peut répondre sous une autre adresse que celle mémorisée :
  // c'est celle de la connexion qui compte pour la suite. Déjà connectée
  // (par l'appli Suunto) : on s'y branche directement ; sinon on la
  // cherche d'abord (voir connecterNatif).
  const id = await connecterNatif(ble, appareil, journal, { chercherAvant: dejaConnectee ? 0 : 8000 });
  ble.addListener(`disconnected|${id}`, () => {
    journal('⚠ montre déconnectée');
    coupures.forEach(cb => cb());
  });
  journal('connecté');
  try { await ble.requestConnectionPriority({ deviceId: id, connectionPriority: 1 }); } catch { /* facultatif */ }

  let mtu = 23;
  try { ({ value: mtu } = await ble.getMtu({ deviceId: id })); } catch { /* iOS / ancien */ }
  const morceau = Math.max(TAILLE_ECRITURE_DEFAUT, Math.min(244, (mtu || 23) - 3));
  journal(`MTU ${mtu} → écritures de ${morceau} o`);

  const { services = [] } = await ble.getServices({ deviceId: id });
  journal(`services : ${services.map(s => s.uuid).join(', ')}`);
  const service = services.find(s => s.uuid.toLowerCase() === OCEAN_SERVICE);
  if (!service) throw new Error('Service Suunto introuvable : est-ce bien une Suunto Ocean ?');
  const { ecriture, notif } = choisirCaracteristiques(
    service.characteristics.map(c => ({ uuid: c.uuid.toLowerCase(), props: c.properties || {} })), journal);

  const ecouteurs = [];
  const cle = `notification|${id}|${service.uuid.toLowerCase()}|${notif.uuid}`;
  ble.addListener(cle, ev => {
    const v = ev?.value;
    const octets = typeof v === 'string'
      ? Uint8Array.from((v.match(/[0-9a-f]{2}/gi) || []).map(h => parseInt(h, 16)))
      : new Uint8Array(v?.buffer || []);
    ecouteurs.forEach(cb => cb(octets));
  });
  // L'abonnement peut déclencher l'appairage si la montre ne l'est pas.
  journal('abonnement aux notifications (peut demander l’appairage)…');
  await avecDelai(ble.startNotifications({ deviceId: id, service: service.uuid, characteristic: notif.uuid }), 45000, 'abonnement');
  journal('notifications actives');

  // L'adresse de l'appairage est stable ; celle vue au scan peut changer
  // toutes les quelques minutes (adresse aléatoire).
  memo.ecrire({ id: appareil.deviceId || id, nom: appareil.name || 'Suunto Ocean', moteur: 'capacitor' });
  const sansReponse = !!ecriture.props.writeWithoutResponse;

  return {
    nom: appareil.name || 'Suunto Ocean',
    id,
    moteur: 'capacitor',
    ecouter: cb => ecouteurs.push(cb),
    surCoupure: cb => coupures.push(cb),
    ecrire: octets => file(async () => {
      for (let o = 0; o < octets.length; o += morceau) {
        const part = octets.subarray(o, o + morceau);
        const value = hex(part, Infinity);
        const opts = { deviceId: id, service: service.uuid, characteristic: ecriture.uuid, value };
        if (sansReponse) await ble.writeWithoutResponse(opts);
        else await ble.write(opts);
      }
    }),
    async fermer() {
      try { await ble.stopNotifications({ deviceId: id, service: service.uuid, characteristic: notif.uuid }); } catch { /* déjà coupé */ }
      // Ne coupe que NOTRE connexion : l'appli Suunto garde la sienne.
      try { await ble.disconnect({ deviceId: id }); } catch { /* idem */ }
    },
  };
}

// ============================================================
//  Moteur Web Bluetooth (site)
// ============================================================

async function ouvrirWeb({ journal, choisirAutre }) {
  const bt = navigator.bluetooth;
  const file = fileUnique();
  journal(`moteur : Web Bluetooth (${navigator.userAgent})`);

  let appareil = null;
  if (!choisirAutre && bt.getDevices) {
    // Montre déjà autorisée sur ce site : pas besoin de la rechoisir.
    try {
      const deja = await bt.getDevices();
      appareil = deja.find(d => estOcean(d.name)) || null;
      if (appareil) journal(`montre déjà autorisée : ${appareil.name}`);
    } catch (e) { journal(`getDevices : ${e.message}`); }
  }
  if (!appareil) {
    journal('fenêtre de choix Bluetooth');
    appareil = await bt.requestDevice({
      filters: [...OCEAN_NOMS.map(namePrefix => ({ namePrefix })), { services: [OCEAN_SERVICE] }],
      optionalServices: [OCEAN_SERVICE],
    });
    journal(`→ choisi : ${appareil.name || '?'} (${appareil.id})`);
  }

  const coupures = [];
  appareil.addEventListener('gattserverdisconnected', () => {
    journal('⚠ montre déconnectée');
    coupures.forEach(cb => cb());
  });

  journal('connexion…');
  const gatt = await avecDelai(appareil.gatt.connect(), 20000, 'connexion');
  journal('connecté');
  const service = await gatt.getPrimaryService(OCEAN_SERVICE);
  const brutes = await service.getCharacteristics();
  const { ecriture, notif } = choisirCaracteristiques(brutes.map(c => ({ uuid: c.uuid, props: c.properties, c })), journal);

  const ecouteurs = [];
  notif.c.addEventListener('characteristicvaluechanged', ev => {
    const v = ev.target.value;
    const octets = new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength));
    ecouteurs.forEach(cb => cb(octets));
  });
  journal('abonnement aux notifications (peut demander l’appairage)…');
  await avecDelai(notif.c.startNotifications(), 45000, 'abonnement');
  journal('notifications actives');

  memo.ecrire({ id: appareil.id, nom: appareil.name || 'Suunto Ocean', moteur: 'web' });
  const sansReponse = !!ecriture.props.writeWithoutResponse && !!ecriture.c.writeValueWithoutResponse;

  return {
    nom: appareil.name || 'Suunto Ocean',
    id: appareil.id,
    moteur: 'web',
    ecouter: cb => ecouteurs.push(cb),
    surCoupure: cb => coupures.push(cb),
    ecrire: octets => file(async () => {
      for (let o = 0; o < octets.length; o += TAILLE_ECRITURE_DEFAUT) {
        const part = octets.slice(o, o + TAILLE_ECRITURE_DEFAUT);
        if (sansReponse) await ecriture.c.writeValueWithoutResponse(part);
        else await ecriture.c.writeValue(part);
      }
    }),
    async fermer() {
      try { await notif.c.stopNotifications(); } catch { /* déjà coupé */ }
      try { gatt.disconnect(); } catch { /* idem */ }
    },
  };
}

/**
 * Trouve la montre et ouvre le lien.
 * @param {{journal?:(t:string)=>void, choisirAutre?:boolean}} [opts]
 *   choisirAutre : ignorer la montre mémorisée et rouvrir la recherche.
 */
export async function ouvrirLienOcean({ journal = () => {}, choisirAutre = false } = {}) {
  const dispo = bleDisponible();
  if (!dispo.ok) throw new Error(dispo.raison);
  return dispo.moteur === 'capacitor'
    ? ouvrirNatif({ journal, choisirAutre })
    : ouvrirWeb({ journal, choisirAutre });
}
