// ============================================================
//  Décompression Heatshrink (LZSS)
//
//  La Suunto Ocean compresse chaque plongée avec Heatshrink avant de
//  l'envoyer en Bluetooth (fenêtre 2^7 = 128 octets, motifs de 2^5 =
//  32 octets au plus). Le flux est une suite de bits, poids fort
//  d'abord :
//    1 + 8 bits            → un octet tel quel
//    0 + 7 bits + 5 bits   → recopier (n+1) octets situés (i+1) plus tôt
//  La fenêtre commence remplie de zéros, comme dans l'implémentation
//  de référence.
//
//  Portage en JS du décodeur de Scott Vokes (licence ISC), à partir de
//  la copie embarquée par libdivecomputer (src/heatshrink/).
// ============================================================

/**
 * @param {Uint8Array} input   flux compressé
 * @param {{windowBits?:number, lookaheadBits?:number}} [opts]
 * @returns {Uint8Array}
 */
export function heatshrinkDecompress(input, { windowBits = 7, lookaheadBits = 5 } = {}) {
  const totalBits = input.length * 8;
  let bitPos = 0;

  // Lit `n` bits, ou -1 s'il n'en reste pas assez (fin du flux : les
  // derniers bits de remplissage sont ignorés, comme en C).
  const bits = n => {
    if (bitPos + n > totalBits) return -1;
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = input[bitPos >> 3];
      v = (v << 1) | ((byte >> (7 - (bitPos & 7))) & 1);
      bitPos++;
    }
    return v;
  };

  const windowSize = 1 << windowBits;
  const mask = windowSize - 1;
  const fenetre = new Uint8Array(windowSize);
  let tete = 0;

  let out = new Uint8Array(Math.max(256, input.length * 2));
  let n = 0;
  const pousser = c => {
    if (n === out.length) {
      const plus = new Uint8Array(out.length * 2);
      plus.set(out);
      out = plus;
    }
    out[n++] = c;
    fenetre[tete++ & mask] = c;
  };

  while (true) {
    const tag = bits(1);
    if (tag < 0) break;
    if (tag === 1) {
      const c = bits(8);
      if (c < 0) break;
      pousser(c);
    } else {
      const index = bits(windowBits);
      if (index < 0) break;
      const count = bits(lookaheadBits);
      if (count < 0) break;
      const recul = index + 1;
      for (let i = 0; i <= count; i++) pousser(fenetre[(tete - recul) & mask]);
    }
  }
  return out.subarray(0, n);
}
