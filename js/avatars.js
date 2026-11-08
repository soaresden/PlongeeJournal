// ============================================================
//  Avatars dessinés (style personnage rond, à la Mii)
//
//  Inspirés de ma photo : cheveux courts foncés, barbe courte, yeux
//  bruns, t-shirt noir. Trois tenues : en ville, masque sur le front,
//  sous l'eau. Des SVG : légers, nets à toutes les tailles.
// ============================================================

const PEAU = '#f0c29b', PEAU_OMBRE = '#d9a37c', CHEVEUX = '#2e1f16', BARBE = '#3a2a20', TRAIT = '#2a1a14';

function visage({ yeux = true } = {}) {
  return `
  <rect x="86" y="128" width="28" height="28" rx="8" fill="${PEAU_OMBRE}"/>
  <ellipse cx="53" cy="100" rx="9" ry="13" fill="${PEAU_OMBRE}"/>
  <ellipse cx="147" cy="100" rx="9" ry="13" fill="${PEAU_OMBRE}"/>
  <path d="M54 82 C54 50 74 34 100 34 C126 34 146 50 146 82 L146 104 C146 134 124 152 100 152 C76 152 54 134 54 104 Z" fill="${PEAU}"/>
  <path d="M55 100 C56 132 78 152 100 152 C122 152 144 132 145 100 C141 116 130 123 119 121 C112 131 88 131 81 121 C70 123 59 116 55 100 Z" fill="${BARBE}" opacity=".62"/>
  <path d="M83 119 C91 112 109 112 117 119 C109 116.5 91 116.5 83 119 Z" fill="${BARBE}" opacity=".85"/>
  <path d="M89 126 Q100 133 111 126" fill="none" stroke="${TRAIT}" stroke-width="3" stroke-linecap="round"/>
  <path d="M100 95 Q96 107 100 111 Q104 112.5 107 109" fill="none" stroke="#c08a64" stroke-width="3" stroke-linecap="round"/>
  ${yeux ? `
  <ellipse cx="83" cy="92" rx="6" ry="7.5" fill="${TRAIT}"/><circle cx="85" cy="89" r="2.2" fill="#fff"/>
  <ellipse cx="117" cy="92" rx="6" ry="7.5" fill="${TRAIT}"/><circle cx="119" cy="89" r="2.2" fill="#fff"/>` : ''}
  <path d="M72 80 Q83 72 94 78" fill="none" stroke="${CHEVEUX}" stroke-width="5.5" stroke-linecap="round"/>
  <path d="M106 78 Q117 72 128 80" fill="none" stroke="${CHEVEUX}" stroke-width="5.5" stroke-linecap="round"/>
  <path d="M52 86 C46 50 70 26 100 26 C132 26 156 50 148 86 C146 71 140 61 131 57 C119 51 111 59 100 55 C88 51 77 56 69 58 C60 62 54 73 52 86 Z" fill="${CHEVEUX}"/>
  <path d="M70 38 L79 24 L88 34 L99 20 L108 32 L120 23 L128 38 Z" fill="${CHEVEUX}"/>`;
}

const tshirt = couleur => `
  <path d="M28 200 C33 162 64 148 100 148 C136 148 167 162 172 200 Z" fill="${couleur}"/>
  <path d="M85 150 Q100 162 115 150" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="3"/>`;

const combi = `
  <path d="M28 200 C33 162 64 148 100 148 C136 148 167 162 172 200 Z" fill="#12304d"/>
  <path d="M84 149 L84 200 M116 149 L116 200" stroke="#ff8a1f" stroke-width="5"/>
  <path d="M82 150 Q100 158 118 150" fill="none" stroke="#0a1f33" stroke-width="5"/>`;

const enveloppe = (fond, contenu) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${fond}${contenu}</svg>`;

/** Les avatars proposés : { id, nom, svg }. */
export const AVATARS = [
  { id: 'ville', nom: 'En ville', svg: enveloppe('<rect width="200" height="200" fill="#cfe6f3"/>', tshirt('#1c1c21') + visage()) },
  { id: 'masque', nom: 'Masque sur le front', svg: enveloppe('<rect width="200" height="200" fill="#ffe2c2"/>', combi + visage() + `
    <path d="M50 62 Q100 50 150 62" fill="none" stroke="#1b1b1b" stroke-width="7" stroke-linecap="round"/>
    <rect x="70" y="40" width="60" height="24" rx="10" fill="#a8dcff" fill-opacity=".7" stroke="#ff8a1f" stroke-width="4.5"/>
    <path d="M100 42 L100 62" stroke="#ff8a1f" stroke-width="3"/>
    <path d="M78 46 L88 46" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>`) },
  { id: 'sous-l-eau', nom: 'Sous l’eau', svg: enveloppe(`
    <defs><linearGradient id="eau" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fb4e6"/><stop offset="1" stop-color="#0b4f7c"/></linearGradient></defs>
    <rect width="200" height="200" fill="url(#eau)"/>
    <circle cx="160" cy="58" r="7" fill="none" stroke="#fff" stroke-width="2.5" opacity=".75"/>
    <circle cx="170" cy="34" r="5" fill="none" stroke="#fff" stroke-width="2.5" opacity=".65"/>
    <circle cx="156" cy="18" r="3.5" fill="none" stroke="#fff" stroke-width="2" opacity=".55"/>`, combi + visage() + `
    <path d="M50 92 Q100 82 150 92" fill="none" stroke="#1b1b1b" stroke-width="7"/>
    <rect x="66" y="78" width="68" height="30" rx="11" fill="#bfe8ff" fill-opacity=".45" stroke="#ff8a1f" stroke-width="5"/>
    <path d="M100 80 L100 106" stroke="#ff8a1f" stroke-width="3.5"/>
    <rect x="87" y="119" width="26" height="15" rx="6" fill="#222"/>
    <path d="M113 127 Q138 134 142 170" fill="none" stroke="#333" stroke-width="7" stroke-linecap="round"/>`) },
];

/** Un SVG → une image utilisable partout (src d'un <img>, carnet partagé). */
export const enImage = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
