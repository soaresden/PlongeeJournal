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

// ---------- Style « Mii » : grosse tête ronde, relief doux, grands yeux ----------
const defsMii = `
  <defs>
    <radialGradient id="mPeau" cx=".42" cy=".38" r=".75"><stop offset="0" stop-color="#ffd9bd"/><stop offset=".7" stop-color="#f6bf98"/><stop offset="1" stop-color="#e9a57c"/></radialGradient>
    <linearGradient id="mCheveux" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3122"/><stop offset="1" stop-color="#2a1a11"/></linearGradient>
    <radialGradient id="mBarbe" cx=".5" cy=".2" r=".9"><stop offset="0" stop-color="#5a3f2e" stop-opacity=".25"/><stop offset=".6" stop-color="#4a3122" stop-opacity=".75"/><stop offset="1" stop-color="#3a2619" stop-opacity=".9"/></radialGradient>
  </defs>`;

function teteMii({ cheveux = true, lunettesFront = false, cagoule = false } = {}) {
  return `
  <path d="M84 150 h32 v18 h-32 z" fill="#e9a57c"/>
  <ellipse cx="48" cy="104" rx="10" ry="14" fill="#efb38b"/><ellipse cx="152" cy="104" rx="10" ry="14" fill="#efb38b"/>
  <path d="M50 78 C50 44 72 30 100 30 C128 30 150 44 150 78 L150 110 C150 142 128 160 100 160 C72 160 50 142 50 110 Z" fill="url(#mPeau)"/>
  <path d="M52 108 C54 140 76 160 100 160 C124 160 146 140 148 108 C146 124 134 134 122 133 C114 141 86 141 78 133 C66 134 54 124 52 108 Z" fill="url(#mBarbe)"/>
  <path d="M82 128 C90 122 110 122 118 128 C110 126 90 126 82 128 Z" fill="#3a2619" opacity=".8"/>
  <path d="M85 134 Q100 147 116 134" fill="#fff" stroke="#1d120c" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M101 100 Q95 113 99 117 Q104 119 108 116" fill="none" stroke="#1d120c" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="80" cy="96" rx="11" ry="9" fill="#fff" stroke="#1d120c" stroke-width="3"/><circle cx="80" cy="96" r="5.5" fill="#1d120c"/><circle cx="82" cy="94" r="1.8" fill="#fff"/>
  <ellipse cx="120" cy="96" rx="11" ry="9" fill="#fff" stroke="#1d120c" stroke-width="3"/><circle cx="120" cy="96" r="5.5" fill="#1d120c"/><circle cx="122" cy="94" r="1.8" fill="#fff"/>
  <path d="M67 83 Q80 73 93 80" fill="none" stroke="#3a2619" stroke-width="6" stroke-linecap="round"/>
  <path d="M107 80 Q120 73 133 83" fill="none" stroke="#3a2619" stroke-width="6" stroke-linecap="round"/>
  ${cheveux ? `
  <path d="M48 84 C42 50 64 24 100 24 C138 24 160 50 152 84 C150 68 142 58 132 54 C120 60 108 52 100 56 C90 50 78 58 68 54 C58 60 50 70 48 84 Z" fill="url(#mCheveux)"/>
  <path d="M60 46 L66 22 L80 36 L92 14 L104 32 L118 16 L126 36 L142 26 L140 50 Z" fill="url(#mCheveux)"/>` : ''}
  ${lunettesFront ? `
  <path d="M52 52 Q100 40 148 52" fill="none" stroke="#1b1b1b" stroke-width="4"/>
  <rect x="62" y="38" width="34" height="20" rx="9" fill="#2b2b33" stroke="#111" stroke-width="2.5"/>
  <rect x="104" y="38" width="34" height="20" rx="9" fill="#2b2b33" stroke="#111" stroke-width="2.5"/>
  <path d="M96 46 h8" stroke="#111" stroke-width="3"/>
  <path d="M68 43 l8 0" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>` : ''}
  ${cagoule ? `
  <path d="M40 112 C36 52 64 20 100 20 C136 20 164 52 160 112 C158 150 140 176 100 178 C60 176 42 150 40 112 Z
           M56 96 C56 128 76 152 100 152 C124 152 144 128 144 96 C144 64 126 46 100 46 C74 46 56 64 56 96 Z" fill="#14324f" fill-rule="evenodd"/>
  <path d="M56 96 C56 64 74 46 100 46 C126 46 144 64 144 96" fill="none" stroke="#ff8a1f" stroke-width="3"/>` : ''}`;
}

const corps = (couleur, col = 'rgba(255,255,255,.18)') => `
  <path d="M26 200 C30 166 62 156 100 156 C138 156 170 166 174 200 Z" fill="${couleur}"/>
  <path d="M84 158 Q100 170 116 158" fill="none" stroke="${col}" stroke-width="3.5"/>`;

/** Les avatars proposés : { id, nom, svg }. */
export const AVATARS = [
  { id: 'mii', nom: 'Mii barbu', svg: enveloppe('<rect width="200" height="200" fill="#f4f6f8"/>' + defsMii, corps('#1c1c22') + teteMii()) },
  { id: 'bateau', nom: 'Sur le bateau', svg: enveloppe(`${defsMii}
    <rect width="200" height="200" fill="#9fdcff"/><rect y="132" width="200" height="68" fill="#2a8fd1"/>
    <path d="M0 136 Q25 130 50 136 T100 136 T150 136 T200 136" fill="none" stroke="#fff" stroke-width="3" opacity=".7"/>
    <circle cx="168" cy="34" r="14" fill="#ffd54d"/>`, corps('#ff8a1f', 'rgba(0,0,0,.18)') + teteMii({ lunettesFront: true })) },
  { id: 'cagoule', nom: 'En cagoule', svg: enveloppe('<rect width="200" height="200" fill="#ffe7cf"/>' + defsMii, `
    <path d="M26 200 C30 166 62 156 100 156 C138 156 170 166 174 200 Z" fill="#14324f"/>
    <path d="M86 166 L86 200 M114 166 L114 200" stroke="#ff8a1f" stroke-width="5"/>` + teteMii({ cheveux: false, cagoule: true })) },
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
