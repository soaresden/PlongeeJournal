// Suunto Ocean en Bluetooth : trames, compression, décodage, session.
//
// Données de référence (outils/fixtures/, voir README) :
//   - une vraie plongée de Suunto Nautic (même plateforme que l'Ocean),
//     publiée avec le pilote libdivecomputer, et les valeurs attendues ;
//   - une vraie réponse /Logbook/Entries, CRC compris ;
//   - le début de cette plongée compressé par l'implémentation de
//     référence de Heatshrink (heatshrink2, fenêtre 7, motif 5).
// La session est testée contre une fausse montre qui parle le même
// protocole, perd des morceaux et se fait interrompre par « l'appli
// Suunto ».
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';

const ROOT = __f2p(new URL('..', import.meta.url));
const imp = f => import(__p2u(path.join(ROOT, f)).href);
const P = await imp('js/ocean-proto.js');
const { heatshrinkDecompress } = await imp('js/heatshrink.js');
const { parseOcean, oceanToDive, blocs, plongeeCorrespondante } = await imp('js/ocean-sbem.js');
const { OceanSession, DelaiDepasse } = await imp('js/ocean-device.js');

const FX = path.join(ROOT, 'outils/fixtures');
const lire = f => new Uint8Array(fs.readFileSync(path.join(FX, f)));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

const results = [];
const check = (name, cond, extra = '') => results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));
const proche = (a, b, tol) => a != null && Math.abs(a - b) <= tol;

// ============================================================
//  CRC, HDLC, paquets
// ============================================================

check('CRC-32 : vecteur standard « 123456789 »',
  P.crc32(new TextEncoder().encode('123456789')) === 0xCBF43926, P.crc32(new TextEncoder().encode('123456789')).toString(16));

{
  const charge = Uint8Array.from([0x7E, 0x7D, 0x00, 0xA5, 0x7E, 0x20, 0x5D]);
  const paquet = P.buildPacket(P.OP.GET, 0x1234, charge);
  const trame = P.hdlcEncode(paquet);
  check('HDLC : 7E et 7D échappés', !trame.subarray(1, -1).includes(0x7E), P.hex(trame));

  const recues = [];
  const dec = new P.HdlcDecoder(f => recues.push(f));
  // Morceaux BLE de 1 à 7 octets, deux paquets à la suite.
  const flux = new Uint8Array([...trame, ...P.hdlcEncode(P.buildPacket(P.OP.DATA, 7, Uint8Array.of(1, 2, 3)))]);
  for (let o = 0, n = 1; o < flux.length; o += n, n = (n % 7) + 1) dec.push(flux.subarray(o, o + n));
  const p1 = P.parsePacket(recues[0]);
  check('HDLC : deux trames reconstruites depuis des morceaux quelconques', recues.length === 2, String(recues.length));
  check('paquet : op, n° et charge relus', p1.op === P.OP.GET && p1.seq === 0x1234 && P.hex(p1.payload) === P.hex(charge), JSON.stringify(p1));

  const abime = recues[0].slice(); abime[8] ^= 0xFF;
  check('paquet : CRC faux détecté', /CRC/.test(P.parsePacket(abime).erreur || ''), JSON.stringify(P.parsePacket(abime)));

  // Une trame coupée net (l'autre appli a pris la main) suivie d'une
  // trame entière : la seconde ne doit pas être perdue.
  const rec2 = [];
  const dec2 = new P.HdlcDecoder(f => rec2.push(P.parsePacket(f)));
  const bonne = P.hdlcEncode(P.buildPacket(P.OP.HELLO_REPLY, 0, Uint8Array.of(9, 9)));
  dec2.push(trame.subarray(0, 6));
  dec2.push(bonne);
  check('HDLC : une trame tronquée ne fait pas perdre la suivante',
    rec2.length === 2 && rec2[0].erreur && rec2[1].op === P.OP.HELLO_REPLY, JSON.stringify(rec2));
}

{
  // Vraie réponse de montre à /Logbook/Entries (privée de ses 4 premiers
  // octets A5 05 LL LL dans la fixture).
  const b = lire('logbook-entries-reponse.bin');
  const paquet = new Uint8Array([0xA5, P.OP.DATA, (b.length - 6) & 0xFF, (b.length - 6) >> 8, ...b]);
  const p = P.parsePacket(paquet);
  check('vraie réponse : CRC valide', !p.erreur, p.erreur);
  check('vraie réponse : statut 200', P.replyStatus(p.payload) === 200, String(P.replyStatus(p.payload)));
  const { fiches } = P.parseEntriesPage(p.payload.subarray(P.REPLY_CONTENT));
  check('vraie réponse : 2 plongées (22 et 30 août 2026)',
    fiches.length === 2 && fiches[0].id === 1787385018 && fiches[1].id === 1788079236, JSON.stringify(fiches));
  check('vraie réponse : tailles annoncées', fiches[0].taille === 39478 && fiches[1].taille === 89116, JSON.stringify(fiches));
}

{
  const info = new Uint8Array([
    ...new TextEncoder().encode('Suunto\0Ocean\0Vaasa\0T\0'), 0x03, 0x00, 0xFE,
    ...new TextEncoder().encode('A1B2C3000001\0'), 0x01, 0x02,
    ...new TextEncoder().encode('2.51.28\0BLE Mac Address\0AABBCCDDEEFF\0'),
  ]);
  const r = P.parseInfo(info);
  check('/Info : modèle, série, logiciel',
    r.modele === 'Suunto Ocean' && r.serie === 'A1B2C3000001' && r.logiciel === '2.51.28', JSON.stringify(r));
  check('requête GET : 01 80 00 | longueur | chemin', P.hex(P.getPayload('/Info')) === '01 80 00 05 2f 49 6e 66 6f', P.hex(P.getPayload('/Info')));
  check('paramètre de page : 01 06 00 | offset', P.hex(P.pageParams(451)) === '01 06 00 c3 01 00 00', P.hex(P.pageParams(451)));
}

// ============================================================
//  Heatshrink
// ============================================================

const sbemComplet = new Uint8Array(zlib.gunzipSync(fs.readFileSync(path.join(FX, 'nautic-1787752091.sbem.gz'))));
const hsDebut = lire('nautic-1787752091-debut.hs');

check('Heatshrink : vecteur de référence',
  new TextDecoder().decode(heatshrinkDecompress(Uint8Array.from(Buffer.from('b4596d96cb7c801540', 'hex')))) === 'hello hello hello');
{
  const sortie = heatshrinkDecompress(hsDebut);
  check('Heatshrink : vraie plongée, octet pour octet',
    sortie.length === 24000 && sha(sortie) === sha(sbemComplet.subarray(0, 24000)), `${sortie.length} o`);
}

// ============================================================
//  Décodage SBEM : la plongée de référence
// ============================================================

check('fixture : la bonne plongée', sha(sbemComplet) === 'd9b34541b947b0e9d71b01b4b97d6ab77ba7b0ecbb218854709861e57883b352');

// Valeurs attendues : le « golden » de libdc-swift pour cette plongée.
const dec = parseOcean(sbemComplet, { logId: 1787752091 });
check('durée 1922 s', dec.dureeS === 1922, String(dec.dureeS));
check('profondeur max 33,113 m', proche(dec.profMax, 33.113, 0.001), String(dec.profMax));
check('profondeur moyenne 21,238 m', proche(dec.profMoy, 21.238, 0.001), String(dec.profMoy));
check('température 20,85 → 24,3 °C', proche(dec.tempMin, 20.85, 0.01) && proche(dec.tempMax, 24.3, 0.01), `${dec.tempMin} ${dec.tempMax}`);
check('un bloc, 225,58 → 80,52 bar (fin = dernière lecture en plongée)',
  dec.blocs.length === 1 && proche(dec.blocs[0].debut, 225.578, 0.001) && proche(dec.blocs[0].fin, 80.516, 0.001), JSON.stringify(dec.blocs));
check('heure de début reconstruite depuis le GPS = id de la fiche',
  dec.heureDepuisGps && dec.debutFluxS === 1787752091, String(dec.debutFluxS));
check('position GPS de la mise à l’eau', proche(dec.lieu?.lat, 50.7789, 0.001) && proche(dec.lieu?.lng, 1.4944, 0.001), JSON.stringify(dec.lieu));
check('plongée bouteille (pas apnée)', dec.genre === 'bouteille', dec.genre);
check('pas de résumé dans cette fixture', dec.resume === false);

const dive = oceanToDive(dec);
check('fiche : 32 min, 33,1 m, moy 21,2 m', dive.dureeMin === 32 && dive.profMax === 33.1 && dive.profMoy === 21.2, JSON.stringify(dive).slice(0, 120));
check('fiche : pression 226 → 81 bar', dive.pressionDepart === 226 && dive.pressionFin === 81, `${dive.pressionDepart} ${dive.pressionFin}`);
check('fiche : début 26/08/2026 13:48:11 UTC', dive.start?.toISOString() === '2026-08-26T13:48:11.030Z', dive.start?.toISOString());
check('profil : un point toutes les ~10 s, de l’immersion à la sortie',
  dive.samples.length > 150 && dive.samples[0].t === 0 && dive.samples.at(-1).t >= 1900, `${dive.samples.length} ${dive.samples.at(-1)?.t}`);
check('profil : t croissant', dive.samples.every((s, i) => i === 0 || s.t > dive.samples[i - 1].t));
check('profil : pression et température présentes',
  dive.samples.filter(s => s.pression != null).length > 150 && dive.samples.filter(s => s.temp != null).length > 150);
check('profil : la profondeur max s’y retrouve', proche(Math.max(...dive.samples.map(s => s.d)), 33.1, 0.6), String(Math.max(...dive.samples.map(s => s.d))));
check('paliers estimés depuis le profil', dive.paliers && dive.paliers.p3 > 0, JSON.stringify(dive.paliers));

// ============================================================
//  Décodage SBEM : blocs synthétiques
// ============================================================

class Sbem {
  constructor() { this.o = [...P.HELLO.subarray(0, 0), 0x53, 0x42, 0x45, 0x4D, 0x30, 0x31, 0x30, 0x33]; }
  bloc(id, octets) {
    if (octets.length >= 255) this.o.push(id, 255, ...le32(octets.length), ...octets);
    else this.o.push(id, octets.length, ...octets);
    return this;
  }
  octets() { return Uint8Array.from(this.o); }
}
const le16 = v => [v & 0xFF, (v >> 8) & 0xFF];
const le32 = v => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
const f32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v, true); return [...b]; };

/** Bloc 0x16 de 141 octets (Nautic S, certains logiciels Ocean). */
function etat141(dtMs, profondeur, bars) {
  const b = new Uint8Array(141);
  b.set(le16(dtMs), 0);
  b.set(f32(profondeur), 2);
  b.set(le16(30), 22);                 // remontée 30 s
  b.set(le16(3000), 30);               // NDL 50 min
  bars.forEach((bar, i) => { b[42 + i * 18] = i; b.set(le32(Math.round(bar * 1e5)), 42 + i * 18 + 2); });
  for (let i = bars.length; i < 5; i++) b[42 + i * 18] = 0xEE;   // emplacements vides
  return [...b];
}

{
  const s = new Sbem()
    .bloc(0x08, [0, 0, 51, 0, 0, 0])                    // activité : plongée bouteille
    .bloc(0x0B, [0, 0, 0, 0, 0])                        // en-tête « fantôme » (GPS de 5 octets) : à ignorer
    .bloc(0x1C, [10, 0, 1])                             // en plongée
    .bloc(0x12, [...le16(5), ...new Array(14).fill(0), ...le16(29115)])   // 18 °C
    .bloc(0x16, etat141(1000, 12.5, [205]))
    .bloc(0x16, etat141(10000, 18.2, [190]))
    .bloc(0x0F, [...le16(500), 92])                     // FC 92
    .bloc(0x16, etat141(10000, 6.0, [176]))
    .bloc(0x1C, [...le16(5000), 0]);                    // surface
  const d = parseOcean(s.octets(), { logId: 1780000000 });
  check('141 o : profondeur max et pression lues', proche(d.profMax, 18.2, 0.01) && proche(d.blocs[0]?.debut, 205, 0.01) && proche(d.blocs[0]?.fin, 176, 0.01), JSON.stringify(d.blocs));
  check('141 o : emplacements vides ignorés (un seul bloc)', d.blocs.length === 1, String(d.blocs.length));
  check('en-tête fantôme ignoré : resynchronisation', [...blocs(s.octets(), 8, s.octets().length)].every(k => k.id !== 0x0B));
  check('sans GPS : heure = id de la fiche', d.debutFluxS === 1780000000 && !d.heureDepuisGps, String(d.debutFluxS));
  check('durée = temps passé en phase plongée', d.dureeS === 26, String(d.dureeS));
  const v = oceanToDive(d);
  check('échantillons : NDL en minutes, remontée, FC', v.samples[0].sansPalier === 50 && v.samples[0].remonteeS === 30 && v.samples.at(-1).fc === 92, JSON.stringify(v.samples));
}

{
  // Profil minimal + résumé : gaz, gradients, eau, chiffres de la montre.
  // 20 minutes : descente à 30 m, remontée, sortie.
  const profil = new Sbem()
    .bloc(0x1C, [0, 0, 1])
    .bloc(0x12, [...le16(0), ...new Array(14).fill(0), ...le16(29115)]);
  // (le delta de chaque bloc est un int16 en ms : 30 s au plus)
  for (let m = 1; m <= 40; m++) profil.bloc(0x16, etat141(30000, m <= 20 ? m * 1.5 : (40 - m) * 1.25 + 3, [200 - m * 2.5]));
  profil.bloc(0x1C, [...le16(1000), 0])
    .bloc(0x16, etat141(30000, 0, [40]));               // surface, détendeur purgé
  const resume = new Uint8Array(8 + 2 + 220);
  resume.set(new TextEncoder().encode('SBEM0103'), 0);
  resume[8] = 0x30; resume[9] = 220;
  resume.set(le16(85), 0x33); resume.set(le16(40), 0x35); resume[0x3E] = 2;
  resume.set(le16(32), 0xC7 + 1); resume.set(le16(0), 0xC7 + 3); resume.set(f32(0.012), 0xC7 + 9);
  resume[0xC7 + 45 + 1] = 0xFF;  resume[0xC7 + 45 + 2] = 0x7F;      // 2e gaz invalide
  const pied = new Uint8Array(330); pied.set(le32(8200000), 282 + 29);  // 82 bar
  const fen = new Uint8Array(110); fen.set(f32(273.15 + 17.5), 101); fen.set(f32(273.15 + 19.0), 105);
  const fiche = new Uint8Array(345);
  fiche.set(f32(1205.4), 321); fiche.set(f32(30.4), 330); fiche.set(f32(19.6), 338);
  const s2 = new Sbem(); s2.o = [...resume];
  s2.bloc(0x31, [...pied]).bloc(0x32, [...fen]).bloc(0x33, [...fen]).bloc(0x34, [...fen]).bloc(0x35, [...fiche]);
  const tout = new Uint8Array([...profil.octets(), ...s2.octets()]);
  const d = parseOcean(tout, { logId: 1780000000 });
  check('résumé : nitrox 32, bloc 12 L', d.gaz.length === 1 && d.gaz[0].o2 === 32 && d.gaz[0].litres === 12, JSON.stringify(d.gaz));
  check('résumé : gradients 40/85, eau salée', d.gf?.bas === 40 && d.gf?.haut === 85 && d.eau === 'salee', JSON.stringify([d.gf, d.eau]));
  check('résumé : durée et profondeurs de la montre', d.dureeS === 1205 && proche(d.profMax, 30.4, 0.01) && proche(d.profMoy, 19.6, 0.01), `${d.dureeS} ${d.profMax} ${d.profMoy}`);
  check('résumé : températures des fenêtres', proche(d.tempMin, 17.5, 0.01) && proche(d.tempMax, 19, 0.01), `${d.tempMin} ${d.tempMax}`);
  check('résumé : pression de fin de la montre (pas le détendeur purgé)', proche(d.blocs[0].fin, 82, 0.01), JSON.stringify(d.blocs));
  const v = oceanToDive(d);
  check('fiche : gaz et bloc', v.gazO2 === 32 && v.blocLitres === 12 && v.pressionDepart === 198 && v.pressionFin === 82, JSON.stringify(v).slice(0, 200));
  check('fiche : 20 min, 30,4 m', v.dureeMin === 20 && v.profMax === 30.4, `${v.dureeMin} ${v.profMax}`);
}

// ============================================================
//  Rapprochement avec le carnet
// ============================================================

{
  const fiche = { id: 1782300426 };     // 2026-06-24T11:27:06Z
  const viaFit = { numero: 64, suuntoKeys: ['rgpd:2026-06-24_11.27.06-scubadiving.fit'] };
  const viaBle = { numero: 65, suuntoKeys: ['ocean:1782300426'] };
  const dl = new Date(fiche.id * 1000 + 60000);
  const pad = n => String(n).padStart(2, '0');
  const saisie = { numero: 66, date: `${dl.getFullYear()}-${pad(dl.getMonth() + 1)}-${pad(dl.getDate())}`, heureImmersion: `${pad(dl.getHours())}:${pad(dl.getMinutes())}` };
  check('doublon : déjà importée en .fit', plongeeCorrespondante(fiche, [viaFit])?.dive === viaFit);
  check('doublon : déjà importée en Bluetooth', plongeeCorrespondante(fiche, [viaBle])?.dive === viaBle);
  check('doublon : même date et heure (saisie à la main)', plongeeCorrespondante(fiche, [saisie])?.dive === saisie);
  check('doublon : autre plongée → nouvelle', plongeeCorrespondante({ id: fiche.id + 7200 }, [viaFit, viaBle, saisie]) === null);
}

// ============================================================
//  Session complète contre une fausse montre
// ============================================================

/**
 * Une fausse Suunto Ocean : décode nos trames, répond comme la vraie,
 * découpe ses réponses en morceaux BLE de 20 octets, et glisse du
 * trafic destiné à une autre appli.
 */
function fausseMontre({ plongees, perdreMorceau = null, prendreLaMain = null, refuserFlux = false }) {
  const ecouteurs = [];
  const envoye = [];
  const emettre = (op, seq, payload) => {
    const t = P.hdlcEncode(P.buildPacket(op, seq, payload));
    setTimeout(() => { for (let o = 0; o < t.length; o += 20) ecouteurs.forEach(cb => cb(t.subarray(o, o + 20))); }, 0);
  };
  const rep = (handle, statut, contenu = []) => Uint8Array.from([...[handle & 0xFF, (handle >> 8) & 0xFF, handle >> 16], 0x01, 0x80, 0x00, ...le16(statut), ...contenu]);
  const handles = new Map();          // handle → ressource
  let prochainSlot = 0;
  const pages = (donnees, offset, max = 451) => {
    const part = donnees.subarray(offset, offset + max);
    const statut = offset + part.length >= donnees.length ? 200 : 100;
    return { statut, contenu: [0, 0, 0, ...le16(part.length), 0, 0, 0, 0, 0, 0, ...part] };
  };
  let fluxEnCours = null;

  const dec = new P.HdlcDecoder(f => {
    const p = P.parsePacket(f);
    envoye.push(p);
    const h = p.payload.length >= 3 ? P.u24(p.payload, 0) : 0;
    // Du bruit : la réponse d'une autre appli, à un autre n° de séquence.
    emettre(P.OP.DATA, (p.seq + 1000) & 0xFFFF, rep(0x0B24F0, 200, [1, 2, 3]));
    switch (p.op) {
      case P.OP.HELLO: emettre(P.OP.HELLO_REPLY, 0, P.HELLO); break;
      case P.OP.GET: {
        const chemin = new TextDecoder().decode(p.payload.subarray(4));
        let handle;
        if (chemin === '/Info') handle = 0x0124F0;
        else if (chemin === '/Logbook/Entries') handle = 0x0B24F0;
        else if (/\/Data$/.test(chemin)) handle = 0x0E2400 | prochainSlot;
        else if (/\/Summary$/.test(chemin)) handle = 0x0F2400 | prochainSlot;
        else { emettre(P.OP.GET_REPLY, p.seq, rep(0xFFFFFF, 404)); break; }
        handles.set(handle, chemin);
        emettre(P.OP.GET_REPLY, p.seq, rep(handle, 200));
        break;
      }
      case P.OP.FETCH: {
        const chemin = handles.get(h);
        const params = p.payload.subarray(6);
        const offset = params[0] ? P.u32(params, 3) : 0;
        if (chemin === '/Info') {
          emettre(P.OP.DATA, p.seq, rep(h, 200, [...new TextEncoder().encode('Suunto\0Ocean\0Vaasa\0T\0'), 0, ...new TextEncoder().encode('A1B2C3000001\x002.51.28\0')]));
        } else if (chemin === '/Logbook/Entries') {
          // Deux pages : la première annonce la suite (100).
          const toutes = plongees.map(d => ({ id: d.id, taille: d.compresse.length + d.resume.length }));
          const lot = offset ? toutes.filter(f => f.id > offset) : toutes.slice(0, 1);
          const entete = [0, 0, 0, 0, 0, 0, ...le16(lot.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
          const fiches = lot.flatMap(f => [...le32(f.id), ...le32(f.id + 60), 1, 0, 0, 0, 0, 0, 0, 0, ...le32(f.taille), 0, 0, 0, 0]);
          emettre(P.OP.DATA, p.seq, rep(h, offset ? 200 : 100, [...entete, ...fiches]));
        } else {
          const id = +chemin.split('/')[3];
          const d = plongees.find(x => x.id === id);
          const src = /Data$/.test(chemin) ? d.compresse : d.resume;
          const pg = pages(src, offset);
          emettre(P.OP.DATA, p.seq, rep(h, pg.statut, pg.contenu));
        }
        break;
      }
      case P.OP.SUBSCRIBE: {
        if (refuserFlux) { emettre(P.OP.SUBSCRIBE_REPLY, p.seq, rep(h, 423, [0, 0])); break; }
        emettre(P.OP.SUBSCRIBE_REPLY, p.seq, rep(h, 200, [0, 0]));
        const id = +handles.get(h).split('/')[3];
        const src = plongees.find(x => x.id === id).compresse;
        fluxEnCours = { h, actif: true };
        const flux = fluxEnCours;
        let n = 0;
        const morceau = (off, data) => Uint8Array.from([0xF0, 0x24, 0x0E, 1, 0x80, 0, 0, 0, 0, 0, ...le32(off), ...le16(data.length), 0, 0, 0, 0, 0, 0, ...data, 0]);
        const suivant = off => {
          if (!flux.actif) return;
          if (prendreLaMain && n === prendreLaMain) {
            // L'appli Suunto dit bonjour : la montre coupe notre flux (404).
            emettre(P.OP.HELLO_REPLY, 0, P.HELLO);
            emettre(P.OP.UNSUBSCRIBE_REPLY, 0x4242, rep(h, 404, [0, 0]));
            flux.actif = false;
            // … puis l'appli Suunto synchronise un moment.
            for (let i = 0; i < 5; i++) setTimeout(() => emettre(P.OP.DATA, 0x5000 + i, rep(0x0B24F0, 200, [9])), 5 + i * 10);
            return;
          }
          const data = src.subarray(off, off + 200);
          if (!(perdreMorceau && n === perdreMorceau)) emettre(P.OP.NOTIFICATION, 0, morceau(off, data));
          n++;
          if (data.length) setTimeout(() => suivant(off + data.length), 1);
          else emettre(P.OP.NOTIFICATION, 0, morceau(off, data));   // fin, envoyée deux fois
        };
        setTimeout(() => suivant(0), 1);
        break;
      }
      case P.OP.UNSUBSCRIBE:
        if (fluxEnCours) fluxEnCours.actif = false;
        emettre(P.OP.UNSUBSCRIBE_REPLY, p.seq, rep(h, 200, [0, 0]));
        break;
      case P.OP.RELEASE:
        handles.delete(h);
        emettre(P.OP.RELEASE_REPLY, p.seq, rep(h, 200));
        break;
      default: break;
    }
  });

  return {
    lien: { ecrire: async b => dec.push(b), ecouter: cb => ecouteurs.push(cb) },
    envoye,
  };
}

const DELAIS = { calmeAvant: 5, calmeMax: 500, bonjour: 300, reponse: 1500, flux: 300, retraitCalme: 60, retraitMax: 2000 };

const resumeTest = new TextEncoder().encode('SBEM0103-resume-de-test');
const plongee = { id: 1787752091, compresse: hsDebut, resume: resumeTest };
const autre = { id: 1787760000, compresse: hsDebut.subarray(0, 0), resume: resumeTest };
const attendu = sha(new Uint8Array([...sbemComplet.subarray(0, 24000), ...resumeTest]));

async function scenario(nom, opts, verifier) {
  const montre = fausseMontre({ plongees: [plongee, autre], ...opts });
  const journal = [];
  const s = new OceanSession(montre.lien, { journal: t => journal.push(t), delais: DELAIS });
  try {
    await verifier(s, montre, journal);
  } catch (e) {
    check(`${nom} : sans erreur`, false, `${e.message}\n${journal.slice(-12).join('\n')}`);
  }
}

await scenario('session', {}, async (s, montre) => {
  check('session : bonjour reçu', await s.bonjour());
  const info = await s.infos();
  check('session : /Info', info.modele === 'Suunto Ocean' && info.logiciel === '2.51.28', JSON.stringify(info));
  const fiches = await s.lister();
  check('session : liste sur deux pages', fiches.length === 2 && fiches[0].id === plongee.id && fiches[1].id === autre.id, JSON.stringify(fiches));
  const r = await s.telecharger(fiches[0]);
  check('session : flux reçu, décompressé, résumé accolé', sha(r.sbem) === attendu, `${r.sbem.length} o`);
  check('session : réponses des autres applis ignorées', s.stats.ignorees > 5, String(s.stats.ignorees));
  const ops = montre.envoye.map(p => P.NOM_OP[p.op]);
  check('session : flux refermé (UNSUBSCRIBE) et handles libérés (RELEASE)',
    ops.includes('UNSUBSCRIBE') && ops.filter(o => o === 'RELEASE').length >= 2, ops.join(' '));
});

await scenario('morceau perdu', { perdreMorceau: 30 }, async (s, montre, journal) => {
  await s.bonjour();
  const fiches = await s.lister();
  const r = await s.telecharger(fiches[0]);
  check('morceau perdu : complété par pages, octet pour octet', sha(r.sbem) === attendu, `${r.sbem.length} o`);
  check('morceau perdu : signalé au journal', journal.some(l => /morceau perdu/.test(l)), journal.slice(-5).join(' | '));
});

await scenario('appli Suunto', { prendreLaMain: 40 }, async (s, montre, journal) => {
  await s.bonjour();
  const fiches = await s.lister();
  const r = await s.telecharger(fiches[0]);
  check('appli Suunto : pause puis reprise, plongée complète', sha(r.sbem) === attendu, `${r.sbem.length} o`);
  check('appli Suunto : conflit détecté', s.stats.conflits === 1, String(s.stats.conflits));
  check('appli Suunto : pas de nouveau bonjour après la pause', montre.envoye.filter(p => p.op === P.OP.HELLO).length === 1);
  check('appli Suunto : pause annoncée au journal', journal.some(l => /⏸/.test(l)) && journal.some(l => /▶ reprise/.test(l)), journal.slice(-8).join(' | '));
});

await scenario('flux refusé', { refuserFlux: true }, async (s) => {
  await s.bonjour();
  const fiches = await s.lister();
  const r = await s.telecharger(fiches[0]);
  check('flux refusé (423) : lecture par pages', sha(r.sbem) === attendu, `${r.sbem.length} o`);
});

{
  // Montre muette : la requête échoue proprement, sans bloquer.
  const s = new OceanSession({ ecrire: async () => {}, ecouter: () => {} }, { delais: { ...DELAIS, reponse: 50 } });
  try { await s.lister(); check('montre muette : délai dépassé', false, 'aucune erreur'); }
  catch (e) { check('montre muette : délai dépassé', e instanceof DelaiDepasse, e.message); }
}

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith(' FAIL')).length;
console.log(failed ? `\n${failed} test(s) en échec` : `\n${results.length}/${results.length} vérifications Suunto Ocean`);
process.exit(failed ? 1 : 0);
