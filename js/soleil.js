// ============================================================
//  Jour ou nuit ? D'après l'heure de la plongée et le coucher du
//  soleil au lieu et à la date de la plongée.
//
//  Calcul classique (« Almanac for Computers », précision de quelques
//  minutes) : largement assez pour dire « de jour » ou « de nuit ».
//  Pur : testable sans navigateur.
// ============================================================

const rad = d => (d * Math.PI) / 180;
const deg = r => (r * 180) / Math.PI;
const mod = (a, n) => ((a % n) + n) % n;

/** Jour de l'année (1 à 366). */
function jourDeLAnnee(iso) {
  const [a, m, j] = iso.split('-').map(Number);
  return Math.round((Date.UTC(a, m - 1, j) - Date.UTC(a, 0, 0)) / 86400000);
}

/** Heure UTC (en heures) du lever ou du coucher ; null si le soleil ne se lève/couche pas. */
function evenement(iso, lat, lng, lever) {
  const N = jourDeLAnnee(iso);
  const lngH = lng / 15;
  const t = N + ((lever ? 6 : 18) - lngH) / 24;
  const M = 0.9856 * t - 3.289;
  const L = mod(M + 1.916 * Math.sin(rad(M)) + 0.020 * Math.sin(rad(2 * M)) + 282.634, 360);
  let RA = mod(deg(Math.atan(0.91764 * Math.tan(rad(L)))), 360);
  RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
  const sinDec = 0.39782 * Math.sin(rad(L));
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(rad(90.833)) - sinDec * Math.sin(rad(lat))) / (cosDec * Math.cos(rad(lat)));
  if (cosH > 1 || cosH < -1) return null;
  const H = (lever ? 360 - deg(Math.acos(cosH)) : deg(Math.acos(cosH))) / 15;
  const T = H + RA - 0.06571 * t - 6.622;
  return mod(T - lngH, 24);
}

/** Lever et coucher du soleil, en minutes UTC depuis minuit. */
export function soleil(iso, lat, lng) {
  if (!/^\d{4}-\d\d-\d\d$/.test(iso || '') || lat == null || lng == null) return null;
  const l = evenement(iso, lat, lng, true), c = evenement(iso, lat, lng, false);
  if (l == null || c == null) return null;
  return { lever: Math.round(l * 60), coucher: Math.round(c * 60) };
}

const hm = s => (/^\d\d:\d\d/.test(s || '') ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null);
const fmt = m => `${String(Math.floor(mod(m, 1440) / 60)).padStart(2, '0')}:${String(mod(m, 1440) % 60).padStart(2, '0')}`;

/** Le début de la plongée en UTC (minutes), et le décalage de l'heure locale saisie. */
function debutUtc(d) {
  const o = (d.suuntoKeys || []).map(k => /^ocean:(\d+)$/.exec(k)).find(Boolean);
  const f = (d.suuntoKeys || []).map(k => /(\d{4})-(\d\d)-(\d\d)_(\d\d)\.(\d\d)\.(\d\d)/.exec(k)).find(Boolean);
  let utc = null;
  if (o) { const t = new Date(Number(o[1]) * 1000); utc = t.getUTCHours() * 60 + t.getUTCMinutes(); }
  else if (f) utc = Number(f[4]) * 60 + Number(f[5]);
  const local = hm(d.heureImmersion);
  // Décalage de l'heure notée : connu si on a les deux, sinon d'après la longitude.
  const decalage = utc != null && local != null
    ? Math.round(mod(local - utc + 720, 1440) / 60 - 12) * 60
    : Math.round((Number(d.lng) || 0) / 15) * 60;
  return { utc: utc ?? (local != null ? local - decalage : null), decalage };
}

/**
 * « Exploration de jour » ou « Exploration de nuit », d'après l'heure.
 * Nuit : immersion après le coucher du soleil (un quart d'heure avant
 * compte déjà), ou avant son lever.
 * @returns {{type, raison}|null} null si on ne connaît pas l'heure
 */
export function typeSelonHeure(d) {
  if (!d?.heureImmersion && !(d?.suuntoKeys || []).length) return null;
  const { utc, decalage } = debutUtc(d);
  if (utc == null) return null;
  const s = d.lat != null && Math.abs(d.lat) > 0.01 ? soleil(d.date, Number(d.lat), Number(d.lng)) : null;
  if (!s) {
    // Sans lieu : repères fixes (6 h – 19 h 30, heure notée).
    const local = mod(utc + decalage, 1440);
    const nuit = local >= 19 * 60 + 30 || local < 6 * 60;
    return { type: nuit ? 'Exploration de nuit' : 'Exploration de jour', raison: nuit ? 'après 19 h 30' : 'en journée' };
  }
  const u = mod(utc, 1440);
  const nuit = mod(u - (s.coucher - 15), 1440) < mod(s.lever - (s.coucher - 15), 1440);
  return {
    type: nuit ? 'Exploration de nuit' : 'Exploration de jour',
    raison: nuit ? `après le coucher du soleil (${fmt(s.coucher + decalage)})` : `soleil levé (coucher à ${fmt(s.coucher + decalage)})`,
  };
}
