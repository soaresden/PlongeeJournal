// ============================================================
//  Suunto Ocean — format des échanges Bluetooth (fonctions pures)
//
//  La Suunto Ocean (et la Nautic, même plateforme « Vaasa ») parle un
//  petit protocole requête/réponse au-dessus du Bluetooth Low Energy :
//
//    BLE ─ trames HDLC (0x7E … 0x7E, échappement 0x7D ^ 0x20)
//        └ paquet : A5 | op | longueur(2) | n° séquence(2) | charge | CRC-32(4)
//
//  On demande une ressource par son chemin (GET /Logbook/Entries), la
//  montre répond par un « handle », puis on lit ce handle par pages
//  (FETCH) ou en flux (SUBSCRIBE). Toutes les valeurs sont en petit
//  boutiste. Les réponses portent un statut façon HTTP : 200 fini,
//  100 la suite arrive, 423 occupé, 404 inconnu.
//
//  Ce fichier ne fait aucune entrée/sortie : il fabrique et lit des
//  octets. La session (ocean-device.js) s'en sert, les tests aussi.
//
//  Portage du pilote suunto_nautic de libdivecomputer (LGPL 2.1+),
//  rétro-ingénierie de Jef Driesen, Latisha Besariani et urbamax :
//  https://github.com/libdivecomputer/libdivecomputer/pull/73
// ============================================================

/** Service GATT de la montre. Les deux caractéristiques (écriture,
 *  notification) se trouvent par leurs propriétés. */
export const OCEAN_SERVICE = '61353090-8231-49cc-b57a-886370740041';
/** Noms annoncés en Bluetooth. */
export const OCEAN_NOMS = ['Suunto Ocean', 'Suunto Nautic'];

export const OP = {
  NOTIFICATION: 0x01,       // montre → nous : un morceau de flux
  GET_REPLY: 0x02,
  RELEASE_REPLY: 0x03,
  DATA: 0x05,               // réponse à FETCH
  SUBSCRIBE_REPLY: 0x08,
  UNSUBSCRIBE_REPLY: 0x09,
  GET: 0x0A,                // chemin → handle
  RELEASE: 0x0B,
  FETCH: 0x0D,
  SUBSCRIBE: 0x10,
  UNSUBSCRIBE: 0x11,
  HELLO: 0x12,
  HELLO_REPLY: 0x13,
};

export const NOM_OP = Object.fromEntries(Object.entries(OP).map(([k, v]) => [v, k]));

export const STATUT = { OK: 200, SUITE: 100, VERROU: 423, INCONNU: 404 };

const START = 0xA5;
const OVERHEAD = 10;
export const MAX_PAYLOAD = 512;

const FLAG = 0x7E, ESC = 0x7D, ESC_BIT = 0x20;

// Réponse : HANDLE(3) CLIENT(3) STATUT(2) CONTENU…
export const REPLY_STATUS = 6;
export const REPLY_CONTENT = 8;

// Notification de flux :
// HANDLE(3) CLIENT(3) ?(4) OFFSET(4) LONGUEUR(2) ?(6) DONNÉES 00
export const CHUNK_OFFSET = 10;
export const CHUNK_LENGTH = 14;
export const CHUNK_DATA = 22;

// Page (/Summary, ou /Data lu par FETCH) : EN-TÊTE(11) DONNÉES,
// longueur des données en +3 de l'en-tête.
export const PAGE_HEADER = 11;
const PAGE_LENGTH = 3;

// /Logbook/Entries : EN-TÊTE(18) puis N × FICHE(24), N en +6.
// Fiche : ID(4) MODIFIÉ(4) 01 BOURRAGE(7) TAILLE(8). L'id est l'heure de
// début (secondes UNIX), la taille = /Data compressé + données /Summary.
const ENTRIES_HEADER = 18;
const ENTRIES_EMPTY = 14;
const ENTRIES_COUNT = 6;
const ENTRY_SIZE = 24;

const PARAM_INT32 = 0x06;
const PARAM_UINT32 = 0x07;

// Le « bonjour » que l'appli Suunto envoie : versions du protocole (9, 9),
// identité de l'hôte, version Whiteboard 4.1.2, options.
export const HELLO = Uint8Array.from([
  0x09, 0x09, 0x20, 0x16, 0x45, 0x56, 0x41, 0x10,
  0x04, 0x41, 0x10, 0x0C, 0x00, 0x00, 0x00, 0x04,
  0x01, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

export const SLOT_STATIQUE = 0xF0;
export const SLOT_INCONNU = 0xFF;
/** Octet de poids faible : le « slot » ; les deux autres : la ressource. */
export const handleSlot = h => h & 0xFF;
export const handleRessource = h => h >>> 8;

// ---------- petits outils ----------

export const u16 = (b, o) => b[o] | (b[o + 1] << 8);
export const u24 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
export const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

export function hex(bytes, max = 64) {
  const n = Math.min(bytes.length, max);
  let s = '';
  for (let i = 0; i < n; i++) s += (i ? ' ' : '') + bytes[i].toString(16).padStart(2, '0');
  return bytes.length > max ? `${s} … (+${bytes.length - max} o)` : s;
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ---------- CRC-32 (le classique, réfléchi, 0xEDB88320) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes, start = 0, end = bytes.length) {
  let c = 0xFFFFFFFF;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ---------- HDLC ----------

/** Encadre un paquet : 7E … 7E, avec échappement de 7E et 7D. */
export function hdlcEncode(packet) {
  const out = [FLAG];
  for (const c of packet) {
    if (c === FLAG || c === ESC) out.push(ESC, c ^ ESC_BIT);
    else out.push(c);
  }
  out.push(FLAG);
  return Uint8Array.from(out);
}

/**
 * Découpe un flux d'octets en trames. Les notifications BLE arrivent en
 * morceaux quelconques : on accumule et on rend chaque trame complète.
 * Un 7E ferme la trame en cours ET en ouvre une nouvelle : une trame
 * tronquée (coupée par une autre appli) ne fait donc pas perdre la
 * suivante.
 */
export class HdlcDecoder {
  constructor(onFrame, { onError = () => {}, maxFrame = 4096 } = {}) {
    this.onFrame = onFrame;
    this.onError = onError;
    this.maxFrame = maxFrame;
    this.reset();
  }

  reset() {
    this.dedans = false;
    this.echappe = false;
    this.buf = [];
  }

  push(bytes) {
    for (const c of bytes) {
      if (c === FLAG) {
        if (this.dedans && this.buf.length) {
          if (this.echappe) this.onError('échappement avant 7E');
          else this.onFrame(Uint8Array.from(this.buf));
        }
        this.dedans = true;
        this.echappe = false;
        this.buf = [];
        continue;
      }
      if (!this.dedans) continue;
      if (c === ESC) {
        if (this.echappe) { this.onError('double échappement'); this.reset(); continue; }
        this.echappe = true;
        continue;
      }
      this.buf.push(this.echappe ? c ^ ESC_BIT : c);
      this.echappe = false;
      if (this.buf.length > this.maxFrame) {
        this.onError(`trame trop longue (${this.buf.length} o)`);
        this.reset();
      }
    }
  }
}

// ---------- paquets ----------

/** Fabrique un paquet (sans l'encadrement HDLC). */
export function buildPacket(op, seq, payload = new Uint8Array(0)) {
  if (payload.length > MAX_PAYLOAD) throw new Error('Charge trop longue');
  const p = new Uint8Array(OVERHEAD + payload.length);
  p[0] = START;
  p[1] = op;
  p[2] = payload.length & 0xFF; p[3] = payload.length >> 8;
  p[4] = seq & 0xFF; p[5] = (seq >> 8) & 0xFF;
  p.set(payload, 6);
  const c = crc32(p, 0, 6 + payload.length);
  p[6 + payload.length] = c & 0xFF;
  p[7 + payload.length] = (c >>> 8) & 0xFF;
  p[8 + payload.length] = (c >>> 16) & 0xFF;
  p[9 + payload.length] = (c >>> 24) & 0xFF;
  return p;
}

/**
 * Lit une trame reçue. Rend {op, seq, payload} ou {erreur}.
 */
export function parsePacket(frame) {
  if (frame.length < OVERHEAD) return { erreur: `paquet trop court (${frame.length} o)` };
  const crc = u32(frame, frame.length - 4);
  const calc = crc32(frame, 0, frame.length - 4);
  if (crc !== calc) return { erreur: `CRC faux (${crc.toString(16)} ≠ ${calc.toString(16)}), ${frame.length} o` };
  if (frame[0] !== START) return { erreur: `octet de tête ${frame[0].toString(16)}` };
  const len = u16(frame, 2);
  if (len !== frame.length - OVERHEAD) return { erreur: `longueur ${len} ≠ ${frame.length - OVERHEAD}` };
  return { op: frame[1], seq: u16(frame, 4), payload: frame.subarray(6, 6 + len) };
}

// ---------- requêtes ----------

const CLIENT = [0x01, 0x80, 0x00];

/** GET d'un chemin : 01 80 00 | longueur | chemin ASCII. */
export function getPayload(path) {
  const txt = new TextEncoder().encode(path);
  if (!txt.length || txt.length > 240) throw new Error(`Chemin invalide : ${path}`);
  return concat(Uint8Array.from([...CLIENT, txt.length]), txt);
}

/** Requête sur un handle : HANDLE(3) 01 80 00 | paramètres. */
export function handlePayload(handle, params = Uint8Array.of(0)) {
  return concat(Uint8Array.from([handle & 0xFF, (handle >> 8) & 0xFF, (handle >> 16) & 0xFF, ...CLIENT]), params);
}

const param32 = (type, v) => Uint8Array.from([0x01, type, 0x00, v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]);

/** Paramètre d'une page : décalage (int32) dans les données. */
export const pageParams = offset => param32(PARAM_INT32, offset);
/** Paramètre de la liste : les plongées après cet id (uint32), ou rien. */
export const entriesParams = apres => (apres ? param32(PARAM_UINT32, apres) : Uint8Array.of(0));

/** Statut d'une réponse (200, 100, 423…), ou null si trop courte. */
export const replyStatus = payload => (payload.length >= REPLY_CONTENT ? u16(payload, REPLY_STATUS) : null);

// ---------- contenus ----------

/**
 * Une page de /Logbook/Entries. Rend {fiches:[{id, modifie, taille}]}.
 */
export function parseEntriesPage(content) {
  if (content.length < ENTRIES_EMPTY) throw new Error(`Liste trop courte (${content.length} o)`);
  const n = u16(content, ENTRIES_COUNT);
  if (n && ENTRIES_HEADER + n * ENTRY_SIZE > content.length) {
    throw new Error(`Liste incohérente : ${n} fiches dans ${content.length} o`);
  }
  const fiches = [];
  for (let i = 0; i < n; i++) {
    const o = ENTRIES_HEADER + i * ENTRY_SIZE;
    fiches.push({ id: u32(content, o), modifie: u32(content, o + 4), taille: u32(content, o + 16) });
  }
  return { fiches };
}

/** Une page de données paginées : rend les octets utiles. */
export function parsePage(content) {
  if (content.length < PAGE_HEADER) throw new Error(`Page trop courte (${content.length} o)`);
  const n = u16(content, PAGE_LENGTH);
  if (PAGE_HEADER + n > content.length) throw new Error(`Page incohérente (${n} dans ${content.length} o)`);
  return content.subarray(PAGE_HEADER, PAGE_HEADER + n);
}

/** Une notification de flux : {handle, offset, data}. */
export function parseChunk(payload) {
  if (payload.length < CHUNK_DATA) throw new Error(`Morceau trop court (${payload.length} o)`);
  const offset = u32(payload, CHUNK_OFFSET);
  const n = u16(payload, CHUNK_LENGTH);
  if (CHUNK_DATA + n > payload.length) throw new Error(`Morceau incohérent (${n} dans ${payload.length} o)`);
  return { handle: u24(payload, 0), offset, data: payload.subarray(CHUNK_DATA, CHUNK_DATA + n) };
}

/**
 * /Info : des chaînes terminées par 00 mêlées à du binaire.
 *   Suunto 00 Ocean 00 Vaasa 00 … 2604C3003306 00 … 2.51.28 00 …
 * Le n° de série est la première chaîne de 12 caractères hexadécimaux
 * majuscules, le logiciel la première « a.b.c » qui la suit.
 */
export function parseInfo(content) {
  const chaines = [];
  let debut = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] !== 0) continue;
    // Des champs binaires précèdent parfois une chaîne sans NUL entre
    // eux : on garde la fin imprimable du morceau.
    let j = i;
    while (j > debut && content[j - 1] >= 0x20 && content[j - 1] < 0x7F) j--;
    if (j < i) chaines.push(String.fromCharCode(...content.subarray(j, i)));
    debut = i + 1;
  }
  let serie = null, logiciel = null;
  for (const s of chaines) {
    if (!logiciel && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)) logiciel = s;
    else if (!logiciel && !serie && /^[0-9A-F]{12}$/.test(s)) serie = s;
  }
  const i = chaines.indexOf('Suunto');
  const modele = i >= 0 && chaines[i + 1] ? `Suunto ${chaines[i + 1]}` : null;
  return { modele, serie, logiciel, chaines };
}
