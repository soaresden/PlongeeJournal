// Vérifie le détourage automatique d'un tampon photographié.
//
// On fabrique de fausses photos de carnet (papier gris, tampon encré
// dans un coin) et on contrôle que le cadre détecté tombe dessus.
import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;

const results = [];
const check = (name, cond, extra = '') =>
  results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

// ---------- Canvas minimal, suffisant pour l'analyse ----------
class FauxContexte {
  constructor(cv) { this.cv = cv; this.fillStyle = '#fff'; }
  fillRect() {}
  drawImage(src) { this.cv._pixels = src._pixels; this.cv.width = src.width; this.cv.height = src.height; }
  getImageData(x, y, w, h) { return { data: this.cv._pixels, width: w, height: h }; }
  putImageData() {}
}
class FauxCanvas {
  constructor() { this.width = 1; this.height = 1; this._pixels = new Uint8ClampedArray(4); }
  getContext() { return new FauxContexte(this); }
  toDataURL() { return 'data:image/jpeg;base64,FAKE'; }
}
globalThis.document = { createElement: () => new FauxCanvas() };
globalThis.Image = class {};
globalThis.FileReader = class {};

const { detecterCadre } = await import(path.join(ROOT, 'js/stamp.js'));

/**
 * Fabrique une fausse photo : papier uniforme + rectangle encré.
 * zone = { x, y, w, h } en proportions.
 */
function photo(W, H, papier, zone, encre = 40) {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = papier;
    px[i * 4 + 3] = 255;
  }
  if (zone) {
    const x0 = Math.round(zone.x * W), x1 = Math.round((zone.x + zone.w) * W);
    const y0 = Math.round(zone.y * H), y1 = Math.round((zone.y + zone.h) * H);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        px[i] = px[i + 1] = px[i + 2] = encre;
      }
    }
  }
  return { width: W, height: H, _pixels: px };
}

const dansLaMarge = (obtenu, attendu, tolerance = 0.10) =>
  Math.abs(obtenu - attendu) <= tolerance;

// ---------- Tampon au centre ----------
let img = photo(400, 300, 235, { x: 0.35, y: 0.30, w: 0.30, h: 0.30 });
let c = detecterCadre(img);
check('centre : x détecté', dansLaMarge(c.x, 0.35), `${c.x.toFixed(2)}`);
check('centre : y détecté', dansLaMarge(c.y, 0.30), `${c.y.toFixed(2)}`);
check('centre : largeur détectée', dansLaMarge(c.w, 0.30), `${c.w.toFixed(2)}`);
check('centre : hauteur détectée', dansLaMarge(c.h, 0.30), `${c.h.toFixed(2)}`);
check('centre : confiance correcte', c.confiance > 0.5, String(c.confiance));

// ---------- Tampon dans un coin, cas réel du carnet ----------
img = photo(600, 800, 228, { x: 0.60, y: 0.05, w: 0.30, h: 0.18 });
c = detecterCadre(img);
check('coin : cadré sur le tampon', dansLaMarge(c.x, 0.60) && dansLaMarge(c.y, 0.05),
  `${c.x.toFixed(2)},${c.y.toFixed(2)}`);
check('coin : ne prend pas toute la page', c.w < 0.5 && c.h < 0.35,
  `${c.w.toFixed(2)}x${c.h.toFixed(2)}`);

// ---------- Papier sombre (photo sous-exposée) ----------
img = photo(400, 300, 150, { x: 0.20, y: 0.20, w: 0.40, h: 0.40 }, 20);
c = detecterCadre(img);
check('papier sombre : tampon retrouvé', dansLaMarge(c.x, 0.20) && dansLaMarge(c.w, 0.40),
  `${c.x.toFixed(2)} / ${c.w.toFixed(2)}`);

// ---------- Tampon coloré (encre bleue) ----------
img = photo(400, 300, 235, { x: 0.30, y: 0.30, w: 0.30, h: 0.30 });
for (let y = 90; y < 180; y++) {
  for (let x = 120; x < 240; x++) {
    const i = (y * 400 + x) * 4;
    img._pixels[i] = 30; img._pixels[i + 1] = 60; img._pixels[i + 2] = 190;
  }
}
c = detecterCadre(img);
check('encre bleue : détectée par la saturation', c.w > 0.15 && c.w < 0.6, c.w.toFixed(2));

// ---------- Page vierge ----------
img = photo(400, 300, 240, null);
c = detecterCadre(img);
check('page vierge : confiance nulle', c.confiance === 0, String(c.confiance));
check('page vierge : cadre = toute l’image', c.w === 1 && c.h === 1, `${c.w}x${c.h}`);

// ---------- Photo entièrement encrée ----------
img = photo(400, 300, 235, { x: 0, y: 0, w: 1, h: 1 }, 40);
c = detecterCadre(img);
check('photo pleine : confiance faible', c.confiance <= 0.25, String(c.confiance));

// ---------- Le cadre reste toujours dans l'image ----------
img = photo(400, 300, 235, { x: 0.02, y: 0.02, w: 0.15, h: 0.15 });
c = detecterCadre(img);
check('cadre borné dans l’image',
  c.x >= 0 && c.y >= 0 && c.x + c.w <= 1.0001 && c.y + c.h <= 1.0001,
  JSON.stringify(c));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith(' FAIL')).length;
console.log(failed ? `\n${failed} test(s) en échec` : '\nTous les tests de détourage passent.');
process.exit(failed ? 1 : 0);
