// ============================================================
//  Stock et équipé
//
//  Le STOCK, c'est tout ce que je possède (diver.materiel) : deux
//  combinaisons, deux ordinateurs, des vieilles palmes…
//  L'ÉQUIPÉ, c'est ce que je porte en ce moment (diver.equipe, des id
//  du stock) : c'est lui qui part sur une nouvelle plongée et sur la
//  page « Qui je suis ». Une seule combinaison, un seul gilet, une
//  seule paire de palmes à la fois ; un phare ou un ordinateur de
//  secours peuvent s'ajouter.
// ============================================================

import { valeursMateriel } from './model.js';

/** Les types qu'on ne porte qu'en un exemplaire. */
export const UN_SEUL = new Set(['combinaison', 'gilet', 'palmes', 'masque', 'detendeur', 'lestage']);

/** Les id équipés. Jamais choisi : le premier de chaque type du stock. */
export function idsEquipes(diver) {
  const stock = diver?.materiel || [];
  if (Array.isArray(diver?.equipe)) {
    const existe = new Set(stock.map(m => m.id));
    return diver.equipe.filter(id => existe.has(id));
  }
  const vus = new Set();
  return stock.filter(m => !vus.has(m.type) && vus.add(m.type)).map(m => m.id);
}

export const piecesEquipees = diver => {
  const ids = idsEquipes(diver);
  return (diver?.materiel || []).filter(m => ids.includes(m.id));
};

/** La combinaison portée, au format des champs de plongée. */
export function combiEquipee(diver) {
  const c = piecesEquipees(diver).find(m => m.type === 'combinaison');
  if (!c) return null;
  const v = valeursMateriel(c);
  return { combiType: v.sousType || '', combiMm: v.mm || '' };
}

/**
 * Équipe (ou retire) une pièce du stock. Une combinaison chasse
 * l'autre. Le profil garde aussi combiType/combiMm à jour : c'est ce
 * que lisent les anciennes plongées et les écrans existants.
 */
export function equiper(diver, id, porte = true) {
  const stock = diver.materiel || [];
  const piece = stock.find(m => m.id === id);
  let ids = idsEquipes(diver);
  if (piece && porte) {
    if (UN_SEUL.has(piece.type)) ids = ids.filter(x => stock.find(m => m.id === x)?.type !== piece.type);
    if (!ids.includes(id)) ids.push(id);
  } else {
    ids = ids.filter(x => x !== id);
  }
  diver.equipe = ids;
  const c = combiEquipee(diver);
  if (c || stock.some(m => m.type === 'combinaison')) Object.assign(diver, c || { combiType: '', combiMm: '' });
  return ids;
}

// ------------------------------------------------------------
//  Couleurs : « Palmes Cressi cyan », « gilet bleu », « parachute
//  orange » — le dessin les reprend.
// ------------------------------------------------------------
const COULEURS = [
  [/cyan|turquoise/i, '#1fc1d6'], [/bleu|blue|marine/i, '#2f6fd6'], [/orange/i, '#f08a24'],
  [/rouge|red/i, '#d93a3a'], [/jaune|yellow/i, '#f2c230'], [/vert|green/i, '#3aa55a'],
  [/rose|pink|fuchsia/i, '#e85d9c'], [/violet|purple|mauve/i, '#8a5cd6'], [/blanc|white/i, '#eef1f3'],
  [/gris|grey|gray|argent|silver/i, '#9aa3ab'], [/noir|black/i, '#23272b'],
];
export function couleurPiece(m, defaut) {
  const texte = Object.values(valeursMateriel(m)).join(' ');
  return COULEURS.find(([re]) => re.test(texte))?.[1] || defaut;
}

// ------------------------------------------------------------
//  Le dessin : un plongeur de face, habillé de ce qu'il porte.
//  Ce qui est au stock mais pas porté apparaît en pointillés ;
//  ce que je n'ai pas du tout n'apparaît pas.
// ------------------------------------------------------------
const PEAU = '#f1c7a5';
const NEOPRENE = '#1f2a36';

/**
 * @param {object} diver
 * @param {{ cliquable?: boolean, titre?: (type:string)=>string }} [o]
 * @returns {string} le SVG ; les parties portent data-type
 */
export function dessinPlongeur(diver, o = {}) {
  const stock = diver?.materiel || [];
  const portes = piecesEquipees(diver);
  const porte = type => portes.find(m => m.type === type);
  const etat = type => (porte(type) ? 'on' : stock.some(m => m.type === type) ? 'off' : null);
  const coul = (type, defaut) => (porte(type) ? couleurPiece(porte(type), defaut) : defaut);
  const partie = (type, contenu) => {
    const e = etat(type);
    if (!e) return '';
    const titre = o.titre ? o.titre(type) : type;
    return `<g class="eq-part eq-${e}" data-type="${type}"${o.cliquable ? ' tabindex="0" role="button"' : ''}><title>${titre}</title>${contenu}</g>`;
  };

  const combi = porte('combinaison');
  const vc = combi ? valeursMateriel(combi) : {};
  const corps = combi ? couleurPiece(combi, NEOPRENE) : PEAU;
  const cagoule = combi && /semi|étanche|etanche/i.test(vc.sousType || '');
  const trait = 'stroke="rgba(0,0,0,.28)" stroke-width="1.2"';

  return `<svg class="eq-dessin" viewBox="0 0 200 322" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mon équipement">
  <rect x="72" y="74" width="56" height="118" rx="22" fill="#b6c0c8" ${trait}/>
  <rect x="93" y="44" width="14" height="16" rx="3" fill="#8e99a2"/>
  <g class="eq-corps" data-type="combinaison"${o.cliquable && etat('combinaison') ? ' tabindex="0" role="button"' : ''}>
    ${combi ? `<title>${o.titre ? o.titre('combinaison') : 'combinaison'}</title>` : ''}
    <line x1="74" y1="98" x2="46" y2="184" stroke="${corps}" stroke-width="19" stroke-linecap="round"/>
    <line x1="126" y1="98" x2="154" y2="184" stroke="${corps}" stroke-width="19" stroke-linecap="round"/>
    <rect x="76" y="190" width="23" height="92" rx="11" fill="${corps}" ${trait}/>
    <rect x="101" y="190" width="23" height="92" rx="11" fill="${corps}" ${trait}/>
    <rect x="68" y="86" width="64" height="118" rx="24" fill="${corps}" ${trait}/>
    ${combi && vc.mm ? `<text x="87.5" y="236" font-size="9" font-weight="700" fill="#fff" text-anchor="middle" transform="rotate(-90 87.5 236)">${vc.mm} mm</text>` : ''}
  </g>
  <circle cx="45" cy="191" r="9" fill="${PEAU}" ${trait}/>
  <circle cx="155" cy="191" r="9" fill="${PEAU}" ${trait}/>
  ${cagoule ? `<circle cx="100" cy="58" r="27" fill="${corps}" ${trait}/>` : ''}
  <circle cx="100" cy="60" r="${cagoule ? 17 : 24}" fill="${PEAU}" ${cagoule ? '' : trait}/>
  ${cagoule ? '' : '<path d="M77 54 Q80 31 100 32 Q121 31 123 54 Q112 42 100 43 Q88 42 77 54Z" fill="#5a3b28"/>'}
  ${partie('gilet', `
    <path d="M66 98 Q66 88 78 88 L94 88 L94 176 L74 176 Q66 176 66 166Z" fill="${coul('gilet', '#2b3a4a')}" ${trait}/>
    <path d="M134 98 Q134 88 122 88 L106 88 L106 176 L126 176 Q134 176 134 166Z" fill="${coul('gilet', '#2b3a4a')}" ${trait}/>
    <rect x="70" y="140" width="20" height="16" rx="4" fill="rgba(0,0,0,.18)"/>
    <rect x="110" y="140" width="20" height="16" rx="4" fill="rgba(0,0,0,.18)"/>
    <path d="M74 92 Q60 84 64 66" fill="none" stroke="#222" stroke-width="4" stroke-linecap="round"/>`)}
  ${partie('lestage', `
    <rect x="66" y="176" width="68" height="10" rx="4" fill="#2d2f33" ${trait}/>
    <rect x="94" y="174" width="12" height="14" rx="2" fill="#c9ced3"/>
    <rect x="72" y="175" width="10" height="12" rx="2" fill="#555b61"/><rect x="118" y="175" width="10" height="12" rx="2" fill="#555b61"/>`)}
  ${partie('masque', `
    <path d="M${cagoule ? 83 : 76} 54 L${cagoule ? 117 : 124} 54" stroke="#222" stroke-width="4"/>
    <rect x="83" y="47" width="34" height="17" rx="7" fill="${coul('masque', '#2a3640')}" ${trait}/>
    <rect x="86.5" y="50" width="12.5" height="11" rx="4" fill="#a8def2"/>
    <rect x="101" y="50" width="12.5" height="11" rx="4" fill="#a8def2"/>`)}
  ${partie('detendeur', `
    <path d="M106 75 C126 80 132 60 108 52" fill="none" stroke="#222" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="100" cy="75" r="6.5" fill="${coul('detendeur', '#30353a')}" ${trait}/>`)}
  ${partie('parachute', `<rect x="135" y="146" width="12" height="36" rx="6" fill="${coul('parachute', '#f08a24')}" ${trait}/>`)}
  ${partie('couteau', `<rect x="79" y="244" width="8" height="26" rx="3" fill="#3b4045" ${trait}/><rect x="80" y="238" width="6" height="8" rx="2" fill="#f2c230"/>`)}
  ${partie('ordinateur', `<rect x="38" y="170" width="16" height="13" rx="3.5" fill="#1d2126" ${trait}/><rect x="40.5" y="172.5" width="11" height="8" rx="2" fill="#7fd8f5"/>`)}
  ${partie('phare', `
    <polygon points="150,226 162,226 176,262 136,262" fill="#fff4b0" opacity=".45"/>
    <rect x="149" y="190" width="13" height="34" rx="4" fill="${coul('phare', '#4a5056')}" ${trait}/>
    <ellipse cx="155.5" cy="225" rx="6.5" ry="3" fill="#ffe36b"/>`)}
  ${partie('camera', `<rect x="22" y="196" width="28" height="19" rx="4" fill="#2a2e33" ${trait}/><circle cx="36" cy="205.5" r="6" fill="#5c6670" stroke="#a8def2" stroke-width="2"/>`)}
  ${partie('palmes', `
    <path d="M77 280 L98 280 L104 316 Q88 322 70 316Z" fill="${coul('palmes', '#30353a')}" ${trait}/>
    <path d="M102 280 L123 280 L130 316 Q112 322 96 316Z" fill="${coul('palmes', '#30353a')}" ${trait}/>`)}
</svg>`;
}
