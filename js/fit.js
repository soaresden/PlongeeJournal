// ============================================================
//  Décodeur FIT ciblé plongée
//
//  Le format FIT est auto-descriptif : chaque fichier commence par
//  des « messages de définition » qui annoncent la forme des données
//  qui suivent. On décode donc tout génériquement, puis on ne
//  s'intéresse qu'à quatre types de messages :
//    18  session      — début, durée, sport
//    20  record       — échantillons (profondeur, température)
//    268 dive_summary — profondeur max/moyenne, temps au fond
//    0   file_id      — fabricant, date de création
// ============================================================

const FIT_EPOCH = 631065600;            // 1989-12-31T00:00:00Z, en secondes

// Taille et lecture de chaque type de base FIT
const BASE_TYPES = {
  0x00: { size: 1, read: (v, o) => v.getUint8(o),        invalid: 0xFF },
  0x01: { size: 1, read: (v, o) => v.getInt8(o),         invalid: 0x7F },
  0x02: { size: 1, read: (v, o) => v.getUint8(o),        invalid: 0xFF },
  0x83: { size: 2, read: (v, o, le) => v.getInt16(o, le),  invalid: 0x7FFF },
  0x84: { size: 2, read: (v, o, le) => v.getUint16(o, le), invalid: 0xFFFF },
  0x85: { size: 4, read: (v, o, le) => v.getInt32(o, le),  invalid: 0x7FFFFFFF },
  0x86: { size: 4, read: (v, o, le) => v.getUint32(o, le), invalid: 0xFFFFFFFF },
  0x07: { size: 1, read: (v, o) => v.getUint8(o),        invalid: 0x00, string: true },
  0x88: { size: 4, read: (v, o, le) => v.getFloat32(o, le), invalid: null },
  0x89: { size: 8, read: (v, o, le) => v.getFloat64(o, le), invalid: null },
  0x0A: { size: 1, read: (v, o) => v.getUint8(o),        invalid: 0x00 },
  0x8B: { size: 2, read: (v, o, le) => v.getUint16(o, le), invalid: 0x0000 },
  0x8C: { size: 4, read: (v, o, le) => v.getUint32(o, le), invalid: 0x00000000 },
  0x0D: { size: 1, read: (v, o) => v.getUint8(o),        invalid: 0xFF },
  0x8E: { size: 8, read: (v, o, le) => Number(v.getBigInt64(o, le)),  invalid: null },
  0x8F: { size: 8, read: (v, o, le) => Number(v.getBigUint64(o, le)), invalid: null },
  0x90: { size: 8, read: (v, o, le) => Number(v.getBigUint64(o, le)), invalid: null },
};

const baseType = b => BASE_TYPES[b] || BASE_TYPES[b & 0x0F] || BASE_TYPES[0x02];

/**
 * Décode un fichier FIT.
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {{messages: Array<{global:number, fields:Object}>}}
 */
export function decodeFit(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.length < 14) throw new Error('Fichier FIT trop court');

  const headerSize = view.getUint8(0);
  const magic = String.fromCharCode(...bytes.subarray(8, 12));
  if (magic !== '.FIT') throw new Error('Ce fichier n’est pas un FIT');

  const dataSize = view.getUint32(4, true);
  let pos = headerSize;
  const end = Math.min(headerSize + dataSize, bytes.length);

  const defs = {};                 // local message type -> définition
  const messages = [];

  while (pos < end) {
    const header = view.getUint8(pos++);
    const compressed = (header & 0x80) !== 0;
    const isDef = !compressed && (header & 0x40) !== 0;
    const hasDev = !compressed && (header & 0x20) !== 0;
    const local = compressed ? (header >> 5) & 0x03 : header & 0x0F;

    if (isDef) {
      pos++;                                       // réservé
      const le = view.getUint8(pos++) === 0;
      const global = view.getUint16(pos, le); pos += 2;
      const nFields = view.getUint8(pos++);

      const fields = [];
      for (let i = 0; i < nFields; i++) {
        fields.push({ num: view.getUint8(pos), size: view.getUint8(pos + 1), type: view.getUint8(pos + 2) });
        pos += 3;
      }
      let devFields = [];
      if (hasDev) {
        const nDev = view.getUint8(pos++);
        for (let i = 0; i < nDev; i++) {
          devFields.push({ num: view.getUint8(pos), size: view.getUint8(pos + 1) });
          pos += 3;
        }
      }
      defs[local] = { global, le, fields, devFields };
      continue;
    }

    const def = defs[local];
    if (!def) break;                               // flux incohérent : on s'arrête proprement

    const fields = {};
    for (const f of def.fields) {
      const bt = baseType(f.type);
      if (bt.string) {
        let s = '';
        for (let i = 0; i < f.size; i++) {
          const c = view.getUint8(pos + i);
          if (c) s += String.fromCharCode(c);
        }
        fields[f.num] = s;
      } else if (f.size > bt.size) {
        // tableau
        const arr = [];
        for (let o = 0; o + bt.size <= f.size; o += bt.size) {
          const v = bt.read(view, pos + o, def.le);
          arr.push(v === bt.invalid ? null : v);
        }
        fields[f.num] = arr;
      } else {
        const v = bt.read(view, pos, def.le);
        fields[f.num] = v === bt.invalid ? null : v;
      }
      pos += f.size;
    }
    for (const f of def.devFields) pos += f.size;

    messages.push({ global: def.global, fields });
  }

  return { messages };
}

// ------------------------------------------------------------
//  Traduction FIT -> plongée
// ------------------------------------------------------------

const fitDate = v => (v === null || v === undefined ? null : new Date((v + FIT_EPOCH) * 1000));
const mm = v => (v === null || v === undefined ? null : v / 1000);   // millimètres/millisecondes -> unité

/**
 * Extrait les informations de plongée d'un FIT.
 * Renvoie null si le fichier ne contient aucune donnée exploitable.
 */
export function fitToDive(buffer) {
  const { messages } = decodeFit(buffer);

  const sessions = messages.filter(m => m.global === 18);
  const summaries = messages.filter(m => m.global === 268);
  const records = messages.filter(m => m.global === 20);
  const fileId = messages.find(m => m.global === 0);

  const session = sessions[0]?.fields ?? {};
  const summary = summaries[0]?.fields ?? {};

  // --- échantillons ---
  const samples = [];
  let t0 = null;
  for (const r of records) {
    const ts = r.fields[253];
    const depth = mm(r.fields[92]);                 // champ « depth », en mm
    if (ts === null || ts === undefined) continue;
    if (t0 === null) t0 = ts;
    if (depth === null || depth === undefined) continue;
    samples.push({
      t: ts - t0,
      d: Math.round(depth * 100) / 100,
      temp: r.fields[13] ?? null,
    });
  }

  const start = fitDate(session[2] ?? fileId?.fields[4] ?? (records[0]?.fields[253]));
  const elapsedS = session[7] != null ? mm(session[7])
                 : (samples.length ? samples[samples.length - 1].t : null);

  const maxDepth = summary[3] != null ? mm(summary[3])
                 : (samples.length ? Math.max(...samples.map(s => s.d)) : null);
  const avgDepth = summary[2] != null ? mm(summary[2])
                 : (samples.length ? samples.reduce((a, s) => a + s.d, 0) / samples.length : null);

  const temps = samples.map(s => s.temp).filter(v => v !== null && v !== undefined);

  const dive = {
    start,
    dureeMin: elapsedS != null ? Math.round(elapsedS / 60) : null,
    profMax: maxDepth != null ? Math.round(maxDepth * 10) / 10 : null,
    profMoy: avgDepth != null ? Math.round(avgDepth * 10) / 10 : null,
    tempFond: temps.length ? Math.min(...temps) : null,
    tempSurface: temps.length ? temps[0] : null,
    bottomTimeMin: summary[11] != null ? Math.round(mm(summary[11]) / 60) : null,
    diveNumber: summary[10] ?? null,
    surfaceIntervalS: summary[4] ?? null,
    sport: session[5] ?? null,
    subSport: session[6] ?? null,
    samples,
    paliers: estimateStops(samples),
  };

  const hasSomething = dive.profMax || dive.samples.length || dive.dureeMin;
  return hasSomething ? dive : null;
}

/**
 * Estime le temps passé aux paliers de 3, 6 et 9 m pendant la remontée.
 * Le FIT n'enregistre pas les paliers réalisés : on les déduit du profil.
 * À vérifier et corriger à la main, c'est une estimation.
 */
export function estimateStops(samples) {
  const res = { p3: 0, p6: 0, p9: 0 };
  if (samples.length < 3) return res;

  const maxIdx = samples.reduce((best, s, i) => (s.d > samples[best].d ? i : best), 0);

  for (let i = maxIdx + 1; i < samples.length; i++) {
    const s = samples[i];
    const dt = (s.t - samples[i - 1].t) || 0;
    if (dt <= 0 || dt > 120) continue;              // trou dans l'enregistrement
    if (s.d >= 2.4 && s.d <= 4.0) res.p3 += dt;
    else if (s.d >= 5.2 && s.d <= 7.0) res.p6 += dt;
    else if (s.d >= 8.2 && s.d <= 10.0) res.p9 += dt;
  }

  return {
    p3: Math.round(res.p3 / 60) || null,
    p6: Math.round(res.p6 / 60) || null,
    p9: Math.round(res.p9 / 60) || null,
  };
}

/** Deux enregistrements séparés par une courte remontée = une seule plongée. */
export function mergeDives(list) {
  const parts = list.filter(Boolean).sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];

  const first = parts[0];
  const base = first.start ? first.start.getTime() : 0;

  const samples = [];
  parts.forEach(p => {
    const offset = p.start ? Math.round((p.start.getTime() - base) / 1000) : 0;
    p.samples.forEach(s => samples.push({ ...s, t: s.t + offset }));
  });
  samples.sort((a, b) => a.t - b.t);

  const last = parts[parts.length - 1];
  const lastEnd = (last.start ? Math.round((last.start.getTime() - base) / 1000) : 0)
                + (last.dureeMin || 0) * 60;
  const temps = samples.map(s => s.temp).filter(v => v !== null && v !== undefined);

  return {
    start: first.start,
    dureeMin: Math.round(lastEnd / 60) || parts.reduce((a, p) => a + (p.dureeMin || 0), 0),
    profMax: Math.max(...parts.map(p => p.profMax || 0)) || null,
    profMoy: samples.length ? Math.round(samples.reduce((a, s) => a + s.d, 0) / samples.length * 10) / 10 : null,
    tempFond: temps.length ? Math.min(...temps) : null,
    tempSurface: temps.length ? temps[0] : null,
    bottomTimeMin: parts.reduce((a, p) => a + (p.bottomTimeMin || 0), 0) || null,
    diveNumber: first.diveNumber,
    samples,
    paliers: estimateStops(samples),
    partCount: parts.length,
  };
}

/** Courbe de profondeur en SVG, à afficher sur la fiche d'une plongée. */
export function profileSvg(samples, { width = 640, height = 180 } = {}) {
  if (!samples?.length) return '';
  const maxT = Math.max(...samples.map(s => s.t)) || 1;
  const maxD = Math.max(...samples.map(s => s.d)) || 1;
  const pad = { l: 34, r: 8, t: 10, b: 20 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;

  const x = t => pad.l + (t / maxT) * w;
  const y = d => pad.t + (d / (maxD * 1.08)) * h;

  const pts = samples.map(s => `${x(s.t).toFixed(1)},${y(s.d).toFixed(1)}`).join(' ');
  const area = `${pad.l},${pad.t} ${pts} ${x(maxT).toFixed(1)},${pad.t}`;

  const steps = [0, maxD / 2, maxD].map(d => {
    const yy = y(d).toFixed(1);
    return `<line x1="${pad.l}" y1="${yy}" x2="${width - pad.r}" y2="${yy}" stroke="#1f4763" stroke-width="1"/>`
         + `<text x="4" y="${(+yy + 4).toFixed(1)}" fill="#5f829c" font-size="10">${Math.round(d)}m</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${steps}
    <polygon points="${area}" fill="rgba(36,198,220,.16)"/>
    <polyline points="${pts}" fill="none" stroke="#24c6dc" stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round"/>
    <text x="${width - pad.r}" y="${height - 5}" fill="#5f829c" font-size="10" text-anchor="end">
      ${Math.round(maxT / 60)} min</text>
  </svg>`;
}
