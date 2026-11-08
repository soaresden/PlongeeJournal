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
    <linearGradient id="mCheveux" gradientUnits="userSpaceOnUse" x1="0" y1="12" x2="0" y2="90"><stop offset="0" stop-color="#4a3122"/><stop offset="1" stop-color="#2a1a11"/></linearGradient>
    <linearGradient id="mBarbe" gradientUnits="userSpaceOnUse" x1="0" y1="100" x2="0" y2="158"><stop offset="0" stop-color="#4a3122" stop-opacity=".18"/><stop offset=".5" stop-color="#4a3122" stop-opacity=".55"/><stop offset="1" stop-color="#3a2619" stop-opacity=".75"/></linearGradient>
  </defs>`;

function teteMii({ cheveux = true, lunettesFront = false, cagoule = false } = {}) {
  return `
  <ellipse cx="50" cy="102" rx="10" ry="14" fill="#f2b48c"/><ellipse cx="150" cy="102" rx="10" ry="14" fill="#f2b48c"/>
  <path d="M52 74 C52 46 74 34 100 34 C126 34 148 46 148 74 L148 104 C148 138 126 158 100 158 C74 158 52 138 52 104 Z" fill="url(#mPeau)"/>
  <!-- Barbe courte : la mâchoire et le menton seulement (pas de moustache) -->
  <path d="M52 100 L52 104 C52 138 74 158 100 158 C126 158 148 138 148 104 L148 100 C145 122 134 136 120 140 C112 147 88 147 80 140 C66 136 55 122 52 100 Z" fill="url(#mBarbe)"/>
  <!-- Le sourire, comme sur le Mii : un trait -->
  <path d="M84 129 Q101 140 117 126" fill="none" stroke="#1d120c" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M102 97 Q95 111 98 115 Q102 118 108 114" fill="none" stroke="#1d120c" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="80" cy="94" rx="11" ry="9" fill="#fff" stroke="#1d120c" stroke-width="3"/><circle cx="80" cy="94" r="5.5" fill="#1d120c"/><circle cx="82" cy="92" r="1.8" fill="#fff"/>
  <ellipse cx="120" cy="94" rx="11" ry="9" fill="#fff" stroke="#1d120c" stroke-width="3"/><circle cx="120" cy="94" r="5.5" fill="#1d120c"/><circle cx="122" cy="92" r="1.8" fill="#fff"/>
  <path d="M66 78 Q79 70 93 77" fill="none" stroke="#3a2619" stroke-width="6.5" stroke-linecap="round"/>
  <path d="M107 77 Q121 70 134 78" fill="none" stroke="#3a2619" stroke-width="6.5" stroke-linecap="round"/>
  ${cheveux ? `
  <path d="M46 86 C40 48 64 22 100 22 C138 22 162 48 154 86 C152 68 144 56 132 52 C120 58 108 50 100 54 C90 48 78 56 68 52 C58 58 50 68 46 86 Z" fill="url(#mCheveux)"/>
  <path d="M58 46 L64 20 L80 34 L92 12 L104 30 L118 14 L126 34 L144 24 L142 50 Z" fill="url(#mCheveux)"/>
  <path d="M84 26 Q96 20 108 24" fill="none" stroke="#6b4a35" stroke-width="3" stroke-linecap="round" opacity=".7"/>` : ''}
  ${lunettesFront ? `
  <path d="M50 50 Q100 38 150 50" fill="none" stroke="#1b1b1b" stroke-width="4"/>
  <rect x="62" y="36" width="34" height="20" rx="9" fill="#2b2b33" stroke="#111" stroke-width="2.5"/>
  <rect x="104" y="36" width="34" height="20" rx="9" fill="#2b2b33" stroke="#111" stroke-width="2.5"/>
  <path d="M96 44 h8" stroke="#111" stroke-width="3"/>
  <path d="M68 41 l8 0" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>` : ''}
  ${cagoule ? `
  <path d="M38 112 C34 52 62 18 100 18 C138 18 166 52 162 112 C160 152 140 178 100 180 C60 178 40 152 38 112 Z
           M54 96 C54 130 76 154 100 154 C124 154 146 130 146 96 C146 62 126 44 100 44 C74 44 54 62 54 96 Z" fill="#14324f" fill-rule="evenodd"/>
  <path d="M54 96 C54 62 74 44 100 44 C126 44 146 62 146 96" fill="none" stroke="#ff8a1f" stroke-width="3"/>` : ''}`;
}

const corps = (couleur, col = 'rgba(255,255,255,.18)') => `
  <path d="M86 140 h28 v24 h-28 z" fill="#d9946c"/>
  <path d="M26 200 C30 166 62 156 100 156 C138 156 170 166 174 200 Z" fill="${couleur}"/>
  <path d="M84 158 Q100 170 116 158" fill="none" stroke="${col}" stroke-width="3.5"/>`;

// ---------- Portrait illustré, d'après la photo ----------
const defsPortrait = `
  <defs>
    <radialGradient id="pPeau" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#f6d0b1"/><stop offset=".75" stop-color="#ebb58f"/><stop offset="1" stop-color="#dc9f78"/></radialGradient>
    <linearGradient id="pCheveux" gradientUnits="userSpaceOnUse" x1="0" y1="24" x2="0" y2="90"><stop offset="0" stop-color="#3a281d"/><stop offset="1" stop-color="#1f1510"/></linearGradient>
    <filter id="pFlou" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.4"/></filter>
    <linearGradient id="pBarbe" gradientUnits="userSpaceOnUse" x1="0" y1="90" x2="0" y2="152"><stop offset="0" stop-color="#3b2a20" stop-opacity=".3"/><stop offset=".45" stop-color="#33241b" stop-opacity=".72"/><stop offset="1" stop-color="#2a1d15" stop-opacity=".88"/></linearGradient>
  </defs>`;

function portraitTete({ cheveux = true, lunettesFront = false, cagoule = false } = {}) {
  return `
  <path d="M85 130 L85 158 Q100 165 115 158 L115 130 Z" fill="#cf9470"/>
  <ellipse cx="59" cy="99" rx="7" ry="12" fill="#e2a883"/><ellipse cx="141" cy="99" rx="7" ry="12" fill="#e2a883"/>
  <path d="M100 38 C127 38 143 57 143 88 C143 114 137 132 123 143 C115 149 108 152 100 152 C92 152 85 149 77 143 C63 132 57 114 57 88 C57 57 73 38 100 38 Z" fill="url(#pPeau)"/>
  <!-- barbe de 3 jours : une ombre légère, floue -->
  <g filter="url(#pFlou)" opacity=".42" fill="#24170f">
    <path d="M60 96 C60 118 66 134 79 143 C86 148 93 151 100 151 C107 151 114 148 121 143 C134 134 140 118 140 96
             C138 110 132 120 124 124 C118 128 112 132 100 132 C88 132 82 128 76 124 C68 120 62 110 60 96 Z"/>
    <path d="M84 118 C90 114 96 115 100 116.5 C104 115 110 114 116 118 C114 121 108 121 100 121 C92 121 86 121 84 118 Z"/>
    <path d="M90 130 C94 129 106 129 110 130 L110 142 C106 145 94 145 90 142 Z"/>
  </g>
  <!-- bouche : léger sourire, bouche fermée -->
  <path d="M89.5 125 Q100 132.5 110.5 125 Q100 128.5 89.5 125 Z" fill="#cf8d7d"/>
  <path d="M86 122.5 Q100 130 114 122.5" fill="none" stroke="#3a211a" stroke-width="2.3" stroke-linecap="round"/>
  <path d="M84.5 121 Q85.5 123 87.5 123.5 M115.5 121 Q114.5 123 112.5 123.5" fill="none" stroke="#3a211a" stroke-width="1.8" stroke-linecap="round"/>
  <!-- nez -->
  <path d="M100 91 C99 99 96 106 95 110 Q99 113.5 105 110.5" fill="none" stroke="#c08463" stroke-width="2.4" stroke-linecap="round"/>
  <!-- yeux bruns -->
  <path d="M77 93 Q85.5 86 94 93 Q85.5 97.5 77 93 Z" fill="#fff"/>
  <circle cx="85.5" cy="92" r="3.9" fill="#5b3a22"/><circle cx="85.5" cy="92" r="1.9" fill="#120c08"/><circle cx="86.8" cy="90.8" r="1" fill="#fff"/>
  <path d="M76.5 93 Q85.5 85 94.5 92.5" fill="none" stroke="#24170f" stroke-width="2.3" stroke-linecap="round"/>
  <path d="M106 93 Q114.5 86 123 93 Q114.5 97.5 106 93 Z" fill="#fff"/>
  <circle cx="114.5" cy="92" r="3.9" fill="#5b3a22"/><circle cx="114.5" cy="92" r="1.9" fill="#120c08"/><circle cx="115.8" cy="90.8" r="1" fill="#fff"/>
  <path d="M105.5 92.5 Q114.5 85 123.5 93" fill="none" stroke="#24170f" stroke-width="2.3" stroke-linecap="round"/>
  <!-- sourcils épais et droits -->
  <path d="M73 83 Q84 77.5 96 80.5 L95.5 84.5 Q84.5 82 74 87 Z" fill="#24170f"/>
  <path d="M127 83 Q116 77.5 104 80.5 L104.5 84.5 Q115.5 82 126 87 Z" fill="#24170f"/>
  ${cheveux ? `
  <!-- cheveux courts sur les côtés, volume relevé vers l'arrière -->
  <path d="M56 90 C53 56 72 31 100 30 C129 30 148 55 144 90 C143 76 139 66 132 60 C126 57 121 59 116 56 C110 59 104 55 98 57 C92 54 86 58 80 57 C72 60 61 70 56 90 Z" fill="url(#pCheveux)"/>
  <path d="M76 43 Q90 35 106 36 M98 35 Q114 34 126 43 M70 52 Q84 44 96 45" fill="none" stroke="#56402f" stroke-width="2.2" stroke-linecap="round" opacity=".6"/>
  <path d="M56.5 86 Q57.5 95 61 101 L63 86 Z M143.5 86 Q142.5 95 139 101 L137 86 Z" fill="#2a1c14"/>` : ''}
  ${lunettesFront ? `
  <path d="M56 54 Q100 42 144 54" fill="none" stroke="#111" stroke-width="3.5"/>
  <path d="M66 40 h30 a4 4 0 0 1 4 4 v6 a10 10 0 0 1 -10 10 h-14 a10 10 0 0 1 -10 -10 v-6 a4 4 0 0 1 4 -4 z" fill="#1d2a33" stroke="#0c0c0c" stroke-width="2.5"/>
  <path d="M104 40 h30 a4 4 0 0 1 4 4 v6 a10 10 0 0 1 -10 10 h-14 a10 10 0 0 1 -10 -10 v-6 a4 4 0 0 1 4 -4 z" fill="#1d2a33" stroke="#0c0c0c" stroke-width="2.5"/>
  <path d="M96 46 h8" stroke="#0c0c0c" stroke-width="3"/>
  <path d="M71 45 l9 0 M109 45 l9 0" stroke="#9fd3ff" stroke-width="2.4" stroke-linecap="round" opacity=".6"/>` : ''}
  ${cagoule ? `
  <path d="M36 112 C32 52 62 18 100 18 C138 18 168 52 164 112 C162 152 142 180 100 182 C58 180 38 152 36 112 Z
           M56 96 C56 132 76 156 100 156 C124 156 144 132 144 96 C144 62 126 44 100 44 C74 44 56 62 56 96 Z" fill="#14324f" fill-rule="evenodd"/>
  <path d="M56 96 C56 62 74 44 100 44 C126 44 144 62 144 96" fill="none" stroke="#ff8a1f" stroke-width="3"/>` : ''}`;
}

const teeShirt = (couleur, col = '#2c2c33') => `
  <path d="M28 200 C32 168 60 156 85 153 Q100 162 115 153 C140 156 168 168 172 200 Z" fill="${couleur}"/>
  <path d="M85 153 Q100 162 115 153" fill="none" stroke="${col}" stroke-width="3"/>`;

/** Les avatars proposés : { id, nom, svg }. */
export const AVATARS = [
  { id: 'portrait', nom: 'Portrait', svg: enveloppe(`${defsPortrait}<defs><radialGradient id="pFond" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#9aa0a6"/><stop offset="1" stop-color="#5f656b"/></radialGradient></defs>
    <rect width="200" height="200" fill="url(#pFond)"/>`, teeShirt('#151518') + portraitTete()) },
  { id: 'bateau', nom: 'Sur le bateau', svg: enveloppe(`${defsPortrait}
    <rect width="200" height="200" fill="#a6defa"/><rect y="128" width="200" height="72" fill="#2a8fd1"/>
    <path d="M0 132 Q25 126 50 132 T100 132 T150 132 T200 132" fill="none" stroke="#fff" stroke-width="3" opacity=".7"/>
    <circle cx="170" cy="32" r="13" fill="#ffd54d"/>`, teeShirt('#151518') + portraitTete({ lunettesFront: true })) },
  { id: 'cagoule', nom: 'En cagoule', svg: enveloppe(`${defsPortrait}<rect width="200" height="200" fill="#d6e9f3"/>`, `
    <path d="M28 200 C32 168 60 156 100 156 C140 156 168 168 172 200 Z" fill="#14324f"/>
    <path d="M86 166 L86 200 M114 166 L114 200" stroke="#ff8a1f" stroke-width="5"/>` + portraitTete({ cheveux: false, cagoule: true })) },
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
