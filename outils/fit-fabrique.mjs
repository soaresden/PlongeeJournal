// Fabrique de vrais fichiers .fit de plongée, pour les tests :
// session (sport, départ GPS), échantillons, réglages, gaz, Tank POD.
export class FitWriter {
  constructor() { this.data = []; }
  u8(v) { this.data.push(v & 0xff); }
  u16(v) { this.u8(v); this.u8(v >> 8); }
  u32(v) { this.u16(v & 0xffff); this.u16((v >>> 16) & 0xffff); }
  def(local, global, fields) {
    this.u8(0x40 | local); this.u8(0); this.u8(0); this.u16(global); this.u8(fields.length);
    fields.forEach(([num, size, type]) => { this.u8(num); this.u8(size); this.u8(type); });
  }
  msg(local, values) {
    this.u8(local);
    values.forEach(([size, v]) => { if (size === 1) this.u8(v); else if (size === 2) this.u16(v); else this.u32(v >>> 0); });
  }
  fin() {
    const body = Uint8Array.from(this.data);
    const h = new Uint8Array(12); const dv = new DataView(h.buffer);
    dv.setUint8(0, 12); dv.setUint8(1, 0x10); dv.setUint16(2, 2140, true); dv.setUint32(4, body.length, true);
    h.set([0x2e, 0x46, 0x49, 0x54], 8);
    const out = new Uint8Array(12 + body.length + 2); out.set(h); out.set(body, 12); return out;
  }
}
export function fitPlongee({ sport = 53, sub = 53, lat = 48.9, lng = 2.25, tank = true, gazO2 = 32, debutIso = '2026-10-15T18:30:00Z' } = {}) {
  const w = new FitWriter();
  const debut = Date.parse(debutIso) / 1000 - 631065600;
  const semi = d => Math.round(d * 2 ** 31 / 180);
  w.def(0, 18, [[253, 4, 0x86], [2, 4, 0x86], [7, 4, 0x86], [5, 1, 0], [6, 1, 0], [3, 4, 0x85], [4, 4, 0x85]]);
  w.msg(0, [[4, debut + 2700], [4, debut], [4, 2700000], [1, sport], [1, sub], [4, semi(lat)], [4, semi(lng)]]);
  w.def(1, 20, [[253, 4, 0x86], [92, 4, 0x86], [13, 1, 1]]);
  for (let t = 0; t <= 2700; t += 30) {
    const d = t < 300 ? t / 300 * 12 : t > 2400 ? (2700 - t) / 300 * 12 : 12;
    w.msg(1, [[4, debut + t], [4, Math.round(d * 1000)], [1, 26]]);
  }
  w.def(2, 258, [[2, 1, 0], [3, 1, 0], [4, 1, 0]]);
  w.msg(2, [[1, 40], [1, 85], [1, 0]]);
  w.def(3, 259, [[0, 1, 0], [1, 1, 0], [2, 1, 0]]);
  w.msg(3, [[1, 0], [1, gazO2], [1, 1]]);
  if (tank) {
    w.def(4, 323, [[0, 4, 0x8C], [1, 2, 0x84], [2, 2, 0x84]]);
    w.msg(4, [[4, 12345], [2, 20000], [2, 6500]]);
  }
  return w.fin();
}
