// ============================================================
//  Le plongeur et son matériel, dessiné
//
//  Combinaison (humide, semi-étanche, étanche ; shorty en 3 mm,
//  cagoule à partir de 7 mm), ceinture de plombs, bloc (mono, bi,
//  relais, side-mount ; taille selon les litres ; acier ou alu ; bande
//  verte « EAN 32 » pour un nitrox), stab, détendeur, masque, phare,
//  caméra, ordinateur, parachute, couteau, palmes. Tout suit la fiche,
//  et un toucher sur une pièce l'ajoute ou la retire.
// ============================================================

import { el } from '../lib.js';
import { MOI } from './plongeurverse.js';

/** Les pièces que l'on peut ajouter ou retirer d'un toucher. */
export const PIECES = [
  { id: 'masque', label: 'Masque', icone: '🥽' },
  { id: 'detendeur', label: 'Détendeur', icone: '🫁' },
  { id: 'gilet', label: 'Stab', icone: '🦺' },
  { id: 'ordinateur', label: 'Ordinateur', icone: '⌚' },
  { id: 'phare', label: 'Phare', icone: '🔦' },
  { id: 'camera', label: 'Caméra', icone: '📷' },
  { id: 'parachute', label: 'Parachute', icone: '🎈' },
  { id: 'couteau', label: 'Couteau', icone: '🔪' },
  { id: 'palmes', label: 'Palmes', icone: '🦶' },
];

/** Ce que porte le plongeur sur cette plongée. */
export function equipementDe(dive, materielProfil = []) {
  const ids = new Set(dive.materielIds || []);
  const types = new Set(materielProfil.filter(m => ids.has(m.id)).map(m => m.type));
  const eq = dive.equipement || {};
  const porte = {};
  for (const p of PIECES) porte[p.id] = eq[p.id] === true || (eq[p.id] !== false && types.has(p.id));
  const kg = parseFloat(String(dive.lestage ?? '').replace(',', '.'));
  return {
    ...porte,
    combiType: dive.combiType || '',
    combiMm: parseFloat(String(dive.combiMm || '').replace(',', '.')) || 0,
    kg: Number.isFinite(kg) ? kg : null,
    blocType: dive.blocType || 'Mono',
    blocLitres: Number(dive.blocLitres) || null,
    acier: !/alu/i.test(dive.blocMatiere || ''),
    gaz: dive.gazType === 'nitrox' ? `EAN ${dive.gazO2 || 32}` : dive.gazType === 'trimix' ? `TX ${dive.gazO2 || ''}/${dive.gazHe || ''}` : '',
  };
}

const COMBI = {
  'Humide': { fond: MOI.combi, bande: MOI.bande },
  'Semi-étanche': { fond: '#1e293b', bande: '#38bdf8' },
  'Étanche': { fond: '#111827', bande: '#ef4444' },
  '': { fond: '#0ea5e9', bande: '#7dd3fc' },
};

/**
 * Le dessin (SVG, en chaîne). Chaque pièce porte data-piece : un toucher
 * dessus la bascule.
 */
export function svgPlongeur(e) {
  const peau = MOI.peau;
  const c = COMBI[e.combiType] || COMBI[''];
  const shorty = e.combiType === 'Humide' && e.combiMm > 0 && e.combiMm < 4;
  const cagoule = e.combiType === 'Étanche' || e.combiMm >= 7;
  const membres = shorty ? peau : c.fond;
  const L = e.blocLitres || 12;
  const hBloc = Math.max(95, Math.min(165, 70 + L * 5.5));
  const couleurBloc = e.acier ? '#f2c230' : '#c7cdd3';
  const bloc = (x, w) => `
    <rect x="${x}" y="72" width="${w}" height="${hBloc}" rx="${w / 2}" fill="${couleurBloc}" stroke="#00000033"/>
    <rect x="${x + w / 2 - 5}" y="60" width="10" height="14" rx="2" fill="#374151"/>
    ${e.gaz ? `<rect x="${x}" y="${92}" width="${w}" height="14" fill="#16a34a"/><rect x="${x}" y="${106}" width="${w}" height="6" fill="#facc15"/>` : ''}
    <text x="${x + w / 2}" y="${72 + hBloc - 10}" font-size="10" font-weight="700" text-anchor="middle" fill="#00000099">${L}L</text>`;
  let blocs = '';
  // Vu de face, le bloc dépasse du dos : on le décale pour qu'il se voie.
  if (e.blocType === 'Bi-bouteilles') blocs = bloc(48, 40) + bloc(132, 40);
  else if (e.blocType === 'Side-mount') blocs = `<g transform="translate(-34 40)">${bloc(40, 30)}</g><g transform="translate(34 40)">${bloc(150, 30)}</g>`;
  else blocs = bloc(122, 46) + (e.blocType === 'Bloc relais' ? `<g transform="translate(-100 60)">${bloc(140, 22)}</g>` : '');

  const nbPlombs = e.kg ? Math.max(1, Math.min(8, Math.round(e.kg / 2))) : 0;
  const plombs = Array.from({ length: nbPlombs }, (_, i) => {
    const x = 110 - (nbPlombs * 11) / 2 + i * 11;
    return `<rect x="${x}" y="171" width="9" height="12" rx="2" fill="#6b7280" stroke="#111"/>`;
  }).join('');

  return `<svg viewBox="0 0 220 360" class="schema-svg" xmlns="http://www.w3.org/2000/svg">
  <g data-piece="bloc">${blocs}</g>
  <!-- jambes -->
  <rect x="88" y="186" width="20" height="110" rx="9" fill="${shorty ? peau : membres}"/>
  <rect x="112" y="186" width="20" height="110" rx="9" fill="${shorty ? peau : membres}"/>
  ${shorty ? `<rect x="88" y="186" width="20" height="44" rx="8" fill="${c.fond}"/><rect x="112" y="186" width="20" height="44" rx="8" fill="${c.fond}"/>` : ''}
  <!-- bras -->
  <rect x="58" y="96" width="18" height="86" rx="9" fill="${membres}" transform="rotate(12 67 96)"/>
  <rect x="144" y="96" width="18" height="86" rx="9" fill="${membres}" transform="rotate(-12 153 96)"/>
  ${shorty ? `<rect x="58" y="96" width="18" height="34" rx="8" fill="${c.fond}" transform="rotate(12 67 96)"/><rect x="144" y="96" width="18" height="34" rx="8" fill="${c.fond}" transform="rotate(-12 153 96)"/>` : ''}
  <!-- torse -->
  <rect x="78" y="88" width="64" height="104" rx="22" fill="${c.fond}"/>
  <rect x="106" y="92" width="8" height="92" rx="3" fill="${c.bande}" opacity=".9"/>
  ${e.combiType === 'Étanche' ? '<path d="M82 112 L138 104" stroke="#d1d5db" stroke-width="3" stroke-dasharray="4 3"/>' : ''}
  <!-- stab -->
  <g data-piece="gilet" class="${e.gilet ? '' : 'absent'}">
    <path d="M80 98 Q110 90 140 98 L144 160 Q110 170 76 160 Z" fill="#374151" opacity=".92"/>
    <rect x="96" y="120" width="28" height="6" rx="2" fill="#9ca3af"/>
  </g>
  <!-- ceinture de plombs -->
  <g data-piece="lestage">${nbPlombs ? `<rect x="76" y="174" width="68" height="7" rx="3" fill="#111827"/>${plombs}<text x="150" y="182" font-size="12" font-weight="700" fill="currentColor">${String(e.kg).replace('.', ',')} kg</text>` : ''}</g>
  <!-- tête -->
  <circle cx="110" cy="58" r="26" fill="${cagoule ? c.fond : peau}"/>
  ${cagoule ? `<ellipse cx="110" cy="62" rx="15" ry="17" fill="${peau}"/>` : `<path d="M84 52 Q86 26 110 28 Q134 26 136 52 L131 42 L126 50 L120 38 L114 48 L106 36 L100 48 L94 38 L89 48 Z" fill="${MOI.cheveux}"/>`}
  <g data-piece="masque" class="${e.masque ? '' : 'absent'}">
    <rect x="94" y="48" width="32" height="16" rx="7" fill="#7dd3fc" stroke="#0f172a" stroke-width="3" opacity=".9"/>
    <rect x="84" y="53" width="10" height="4" fill="#0f172a"/><rect x="126" y="53" width="10" height="4" fill="#0f172a"/>
  </g>
  <g data-piece="detendeur" class="${e.detendeur ? '' : 'absent'}">
    <path d="M118 76 Q140 82 128 70" stroke="#111827" stroke-width="4" fill="none"/>
    <rect x="102" y="72" width="16" height="10" rx="4" fill="#111827"/>
  </g>
  <!-- ordinateur (poignet gauche, à l'écran : à droite) -->
  <g data-piece="ordinateur" class="${e.ordinateur ? '' : 'absent'}">
    <rect x="152" y="160" width="20" height="16" rx="4" fill="#111827" transform="rotate(-12 153 96)"/>
    <rect x="155" y="163" width="14" height="10" rx="2" fill="#22d3ee" transform="rotate(-12 153 96)"/>
  </g>
  <!-- phare (main droite, à l'écran : à gauche) -->
  <g data-piece="phare" class="${e.phare ? '' : 'absent'}">
    ${e.phare ? '<path d="M44 188 L0 214 L0 250 L44 200 Z" fill="#fde68a" opacity=".55"/>' : ''}
    <rect x="40" y="180" width="16" height="26" rx="4" fill="#111827" transform="rotate(30 48 192)"/>
  </g>
  <!-- caméra -->
  <g data-piece="camera" class="${e.camera ? '' : 'absent'}">
    <rect x="166" y="184" width="30" height="22" rx="4" fill="#1f2937"/><circle cx="181" cy="195" r="7" fill="#60a5fa" stroke="#111"/>
  </g>
  <!-- parachute -->
  <g data-piece="parachute" class="${e.parachute ? '' : 'absent'}">
    <rect x="140" y="150" width="12" height="40" rx="6" fill="#f97316"/>
  </g>
  <!-- couteau (mollet) -->
  <g data-piece="couteau" class="${e.couteau ? '' : 'absent'}">
    <rect x="90" y="246" width="7" height="26" rx="2" fill="#9ca3af"/><rect x="89" y="242" width="9" height="8" rx="2" fill="#111827"/>
  </g>
  <!-- pieds, palmes -->
  <g data-piece="palmes">
    ${e.palmes
      ? `<path d="M86 292 L110 292 L114 346 L76 346 Z" fill="#0ea5e9" stroke="#0369a1"/><path d="M110 292 L134 292 L144 346 L106 346 Z" fill="#0ea5e9" stroke="#0369a1"/>`
      : `<ellipse cx="98" cy="298" rx="12" ry="6" fill="${shorty ? peau : membres}"/><ellipse cx="122" cy="298" rx="12" ry="6" fill="${shorty ? peau : membres}"/>`}
  </g>
</svg>`;
}

/** Une ligne de résumé, sous le dessin. */
export function legende(e) {
  return [
    e.combiType ? `${e.combiType}${e.combiMm ? ` ${String(e.combiMm).replace('.', ',')} mm` : ''}${e.combiMm >= 7 || e.combiType === 'Étanche' ? ' + cagoule' : ''}` : 'combinaison ?',
    e.kg != null ? `${String(e.kg).replace('.', ',')} kg` : 'lestage ?',
    `${e.blocType}${e.blocLitres ? ` ${e.blocLitres} L` : ''} ${e.acier ? 'acier' : 'alu'}${e.gaz ? ` · ${e.gaz}` : ' · air'}`,
  ].join(' · ');
}

/**
 * Le dessin et les pastilles des pièces, à jour à chaque changement.
 * @param {object} dive
 * @param {Array} materielProfil
 * @param {(piece:string, on:boolean)=>void} surBascule
 * @returns {{node:HTMLElement, maj:Function}}
 */
export function schemaPlongeur(dive, materielProfil, surBascule) {
  const dessin = el('div.schema-dessin');
  const texte = el('div.hint.schema-legende');
  const pastilles = el('div.chips.schema-pieces');
  const maj = () => {
    const e = equipementDe(dive, materielProfil);
    dessin.innerHTML = svgPlongeur(e);
    texte.textContent = legende(e);
    pastilles.replaceChildren(...PIECES.map(p => el('button.chip', { type: 'button', class: e[p.id] ? 'on' : null,
      onclick: () => surBascule(p.id, !e[p.id]) }, `${p.icone} ${p.label}`)));
  };
  dessin.addEventListener('click', ev => {
    const g = ev.target.closest('[data-piece]');
    const id = g?.dataset.piece;
    if (!id || !PIECES.some(p => p.id === id)) return;
    surBascule(id, !equipementDe(dive, materielProfil)[id]);
  });
  maj();
  return { node: el('div.schema-plongeur', {}, dessin, el('div', {}, texte, pastilles)), maj };
}
