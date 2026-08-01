// Fabrique un vrai fichier FIT de plongée, puis vérifie le décodeur.
import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const { decodeFit, fitToDive, mergeDives, estimateStops, profileSvg } =
  await import(path.join(ROOT, 'js/fit.js'));

const FIT_EPOCH = 631065600;

// ---------- Encodeur FIT minimal (pour le test uniquement) ----------
class FitWriter {
  constructor() { this.data = []; }
  u8(v)  { this.data.push(v & 0xff); }
  u16(v) { this.u8(v); this.u8(v >> 8); }
  u32(v) { this.u16(v); this.u16(v >>> 16); }

  definition(local, global, fields) {
    this.u8(0x40 | local);
    this.u8(0);            // réservé
    this.u8(0);            // little endian
    this.u16(global);
    this.u8(fields.length);
    fields.forEach(([num, size, type]) => { this.u8(num); this.u8(size); this.u8(type); });
  }

  dataMsg(local, fields) {
    this.u8(local);
    fields.forEach(([size, value, signed]) => {
      if (size === 1) this.u8(signed && value < 0 ? value + 256 : value);
      else if (size === 2) this.u16(value);
      else this.u32(value);
    });
  }

  finish() {
    const body = Uint8Array.from(this.data);
    const header = new Uint8Array(12);
    const dv = new DataView(header.buffer);
    dv.setUint8(0, 12); dv.setUint8(1, 0x10); dv.setUint16(2, 2140, true);
    dv.setUint32(4, body.length, true);
    header.set([0x2e, 0x46, 0x49, 0x54], 8);           // ".FIT"
    const out = new Uint8Array(header.length + body.length + 2);
    out.set(header, 0); out.set(body, header.length);  // CRC laissé à 0, non vérifié
    return out;
  }
}

/** Profil : descente, palier au fond, remontée avec paliers à 6 m puis 3 m. */
function buildProfile(startSec) {
  const samples = [];
  let t = 0;
  const push = (d, temp) => { samples.push({ t, d, temp }); t += 10; };

  for (let d = 0; d <= 24; d += 2) push(d, 18 - d * 0.25);   // descente
  for (let i = 0; i < 90; i++) push(24 + (i % 3) * 0.2, 12); // fond ~15 min
  for (let d = 24; d > 9; d -= 1.5) push(d, 13);             // remontée
  for (let i = 0; i < 18; i++) push(6.0, 15);                // 3 min à 6 m
  for (let i = 0; i < 30; i++) push(3.0, 16);                // 5 min à 3 m
  for (let d = 3; d >= 0; d -= 1) push(d, 17);

  return samples.map(s => ({ ...s, ts: startSec + s.t }));
}

function makeFit(startDate, profile, { maxDepth, avgDepth, bottomTimeS, elapsedS }) {
  const w = new FitWriter();
  const startSec = Math.floor(startDate.getTime() / 1000) - FIT_EPOCH;

  // file_id (global 0) : type=4 (activity), manufacturer=23 (Suunto), time_created
  w.definition(0, 0, [[0, 1, 0x00], [1, 2, 0x84], [4, 4, 0x86]]);
  w.dataMsg(0, [[1, 4], [2, 23], [4, startSec]]);

  // record (global 20) : timestamp, depth (mm), temperature (°C)
  w.definition(1, 20, [[253, 4, 0x86], [92, 4, 0x86], [13, 1, 0x01]]);
  profile.forEach(s => w.dataMsg(1, [
    [4, s.ts], [4, Math.round(s.d * 1000)], [1, Math.round(s.temp), true],
  ]));

  // session (global 18) : timestamp, start_time, total_elapsed_time (ms), sport, sub_sport
  w.definition(2, 18, [[253, 4, 0x86], [2, 4, 0x86], [7, 4, 0x86], [5, 1, 0x00], [6, 1, 0x00]]);
  w.dataMsg(2, [[4, startSec + elapsedS], [4, startSec], [4, elapsedS * 1000], [1, 53], [1, 53]]);

  // dive_summary (global 268) : timestamp, avg_depth, max_depth, bottom_time, dive_number
  w.definition(3, 268, [[253, 4, 0x86], [2, 4, 0x86], [3, 4, 0x86], [11, 4, 0x86], [10, 4, 0x86]]);
  w.dataMsg(3, [[4, startSec + elapsedS], [4, Math.round(avgDepth * 1000)],
                [4, Math.round(maxDepth * 1000)], [4, bottomTimeS * 1000], [4, 137]]);

  return w.finish();
}

// ---------- Tests ----------
const results = [];
const check = (name, cond, extra = '') =>
  results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

const start = new Date('2026-07-14T10:15:00Z');
const profile = buildProfile(Math.floor(start.getTime() / 1000) - FIT_EPOCH);
const elapsed = profile[profile.length - 1].t;
const bytes = makeFit(start, profile, {
  maxDepth: 24.4, avgDepth: 16.2, bottomTimeS: 900, elapsedS: elapsed,
});

check('fichier FIT généré', bytes.length > 500, String(bytes.length));

const raw = decodeFit(bytes);
check('en-tête + messages décodés', raw.messages.length === profile.length + 3,
      `${raw.messages.length} vs ${profile.length + 3}`);
check('message session présent', raw.messages.some(m => m.global === 18));
check('message dive_summary présent', raw.messages.some(m => m.global === 268));

const dive = fitToDive(bytes);
check('plongée reconnue', !!dive);
check('date de début', dive.start.toISOString() === start.toISOString(), dive.start?.toISOString());
check('profondeur max', dive.profMax === 24.4, String(dive.profMax));
check('profondeur moyenne', dive.profMoy === 16.2, String(dive.profMoy));
check('durée en minutes', dive.dureeMin === Math.round(elapsed / 60), `${dive.dureeMin} vs ${Math.round(elapsed/60)}`);
check('temps au fond', dive.bottomTimeMin === 15, String(dive.bottomTimeMin));
check('numéro de plongée Suunto', dive.diveNumber === 137, String(dive.diveNumber));
check('température minimale', dive.tempFond === 12, String(dive.tempFond));
check('échantillons du profil', dive.samples.length === profile.length,
      `${dive.samples.length} vs ${profile.length}`);
check('premier échantillon à t=0', dive.samples[0].t === 0, String(dive.samples[0]?.t));

// Paliers estimés : 18 échantillons de 10 s à 6 m = 3 min ; 30 à 3 m = 5 min
check('palier 6 m estimé', dive.paliers.p6 === 3, String(dive.paliers.p6));
check('palier 3 m estimé', dive.paliers.p3 === 5, String(dive.paliers.p3));
check('pas de palier à 9 m', !dive.paliers.p9, String(dive.paliers.p9));

// ---------- Plongée coupée en deux ----------
const startA = new Date('2026-07-14T14:00:00Z');
const profA = buildProfile(Math.floor(startA.getTime() / 1000) - FIT_EPOCH);
const elapsedA = profA[profA.length - 1].t;
const fitA = makeFit(startA, profA, { maxDepth: 18.0, avgDepth: 12, bottomTimeS: 600, elapsedS: elapsedA });

const startB = new Date(startA.getTime() + (elapsedA + 300) * 1000);   // 5 min en surface
const profB = buildProfile(Math.floor(startB.getTime() / 1000) - FIT_EPOCH);
const elapsedB = profB[profB.length - 1].t;
const fitB = makeFit(startB, profB, { maxDepth: 22.5, avgDepth: 14, bottomTimeS: 500, elapsedS: elapsedB });

const merged = mergeDives([fitToDive(fitA), fitToDive(fitB)]);
check('fusion : 2 parties', merged.partCount === 2, String(merged.partCount));
check('fusion : début = 1re immersion', merged.start.toISOString() === startA.toISOString(), merged.start?.toISOString());
check('fusion : profondeur max = la plus grande', merged.profMax === 22.5, String(merged.profMax));
check('fusion : durée couvre les deux', merged.dureeMin >= Math.round((elapsedA + 300 + elapsedB) / 60) - 1,
      `${merged.dureeMin}`);
check('fusion : tous les échantillons', merged.samples.length === profA.length + profB.length,
      `${merged.samples.length}`);
check('fusion : échantillons ordonnés',
      merged.samples.every((s, i, a) => i === 0 || s.t >= a[i - 1].t));

// ---------- Ordre inverse (robustesse) ----------
const merged2 = mergeDives([fitToDive(fitB), fitToDive(fitA)]);
check('fusion : ordre d’entrée sans importance',
      merged2.start.toISOString() === startA.toISOString(), merged2.start?.toISOString());

// ---------- Courbe SVG ----------
const svg = profileSvg(dive.samples);
check('SVG produit', svg.startsWith('<svg') && svg.includes('polyline'), svg.slice(0, 60));

// ---------- Robustesse ----------
try { decodeFit(new Uint8Array(20)); check('fichier non-FIT rejeté', false, 'aucune erreur levée'); }
catch (e) { check('fichier non-FIT rejeté', /pas un FIT|trop court/.test(e.message), e.message); }

check('estimateStops tolère un profil vide', JSON.stringify(estimateStops([])) === '{"p3":0,"p6":0,"p9":0}');

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith(' FAIL')).length;
console.log(failed ? `\n${failed} test(s) en échec` : '\nTous les tests FIT passent.');
process.exit(failed ? 1 : 0);
