// ============================================================
//  Le Plongeurverse : tes compagnons, en cartoon, au fond de l'eau
//
//  Chaque plongeur est dessiné (combinaison, bloc, masque, palmes) et
//  vit sa vie sur le sable : il marche, fait des bulles, saute, part
//  nager, danse, trébuche, dit coucou, tope avec un copain croisé.
//  On l'attrape au doigt, on le promène, on le lance : il retombe
//  doucement (on est sous l'eau). Un simple toucher ouvre sa fiche.
//
//  Le nom : bleu pour les garçons, rose pour les filles (gris si on
//  ne sait pas). La taille suit le nombre de sorties ensemble.
//
//  Un filtre (un tag, les moniteurs…) : ceux qui en sont se mettent en
//  rangs comme une petite armée et saluent ; les autres quittent la
//  scène. Sans filtre, tout le monde reprend sa vie.
// ============================================================

import { el, nomPlongeur, couleurCategorie } from '../lib.js';
import { genreDe, COULEUR_GENRE } from '../genre.js';

const MAX = 70;                       // au-delà, les plus fréquents seulement
const G = 380;                        // gravité sous l'eau : on retombe lentement

const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const PEAUX = ['#f6d3b3', '#eabf98', '#d39a72', '#b07a52', '#87573a', '#5e3b26'];
const CHEVEUX = ['#2b1d14', '#5a3a22', '#8a5a2b', '#d4a253', '#161616', '#b5442e', '#e6d3a0'];

// ---------- le Mii de chacun : choisi sur sa fiche (b.mii), sinon tiré de son nom ----------
/** Les choix proposés sur la fiche. */
export const MII = {
  peaux: [['#fbe2cc', 'Très claire'], ['#f6d3b3', 'Claire'], ['#eabf98', 'Claire dorée'], ['#d39a72', 'Mate'],
    ['#b07a52', 'Hâlée'], ['#87573a', 'Brune'], ['#5e3b26', 'Foncée'], ['#3f281b', 'Très foncée']],
  cheveux: [['#161616', 'Noirs'], ['#2b1d14', 'Brun foncé'], ['#5a3a22', 'Châtains'], ['#8a5a2b', 'Châtain clair'],
    ['#d4a253', 'Blonds'], ['#e6d3a0', 'Blond très clair'], ['#b5442e', 'Roux'], ['#8d8d8d', 'Poivre et sel'],
    ['#c4c4c4', 'Gris'], ['#f1f1f1', 'Blancs']],
  coiffures: [['cheveux', 'Cheveux'], ['pics', 'En pics'], ['degarni', 'Dégarni'], ['chauve', 'Chauve']],
  bandanas: [['#dc2626', 'Rouge'], ['#2563eb', 'Bleu'], ['#0f172a', 'Noir'], ['#16a34a', 'Vert'], ['#facc15', 'Jaune'],
    ['#f97316', 'Orange'], ['#ec4899', 'Rose'], ['#7c3aed', 'Violet'], ['#f8fafc', 'Blanc'], ['#0e7490', 'Turquoise']],
  accessoires: [['bandana', '🧣 Bandana'], ['boucle', '💛 Boucle d’oreille'], ['moustache', '〰 Moustache'],
    ['cagoule', '🥷 Cagoule'], ['gopro', '📷 GoPro']],
};

/**
 * L'apparence d'un plongeur : ses choix (b.mii) ; le reste vient de
 * `defaut` (moi : MOI) ou est tiré de son nom.
 */
export function apparenceDe(b, genre = b?.genre || '', defaut = null) {
  const h = hash(b?.id || nomPlongeur(b || {}));
  const m = b?.mii || {};
  const coiffure = m.coiffure || (defaut ? (defaut.chauve ? 'chauve' : defaut.pics ? 'pics' : 'cheveux')
    : genre === 'h' && (h >>> 15) % 6 === 0 ? 'chauve' : 'cheveux');
  return {
    peau: m.peau || defaut?.peau || PEAUX[h % PEAUX.length],
    cheveux: m.cheveux || defaut?.cheveux || CHEVEUX[(h >>> 5) % CHEVEUX.length],
    chauve: coiffure === 'chauve', degarni: coiffure === 'degarni', pics: coiffure === 'pics',
    barbe: m.barbe ?? (defaut ? !!defaut.barbe : genre === 'h' && (h >>> 13) % 4 === 0),
    accessoires: Array.isArray(m.accessoires) ? m.accessoires : [], bandana: m.bandana || '#dc2626',
    combi: defaut?.combi || COMBIS[(h >>> 8) % COMBIS.length], bloc: defaut?.bloc || BLOCS[(h >>> 11) % BLOCS.length],
    ...(defaut ? { bande: defaut.bande, sourcils: !!defaut.sourcils } : {}),
  };
}
const COMBIS = ['#1f2937', '#0f4c75', '#24543f', '#5b2a86', '#8a1c3a', '#0e6375', '#3a4556'];
const BLOCS = ['#facc15', '#cbd5e1', '#f97316', '#e2e8f0'];

/** Moi, d'après mon Mii : combi bleue, peau claire, cheveux châtains en pics, sourcils marqués. */
export const MOI = { combi: '#1d4ed8', bande: '#60a5fa', bloc: '#facc15', peau: '#f8c9a2', cheveux: '#5a3216',
  pics: true, sourcils: true, barbe: false, chauve: false, genre: 'h' };

const EMOJIS = { garde: '🫡', bulles: '🫧', saut: '🤸', danse: '💃', chute: '😵', coucou: '👋', tope: '✋', nage: '🐠', attrape: '😱', vol: '🌀',
  ok: '👌', photo: '📸', montre: '👉🐢' };

// ---------- dessin d'un plongeur (regardant vers la droite) ----------
// Utilisé aussi par l'écran d'ouverture. p : x, y (les pieds), s (taille),
// dir (1 / -1), etat, phase, rot, couleurs (peau, cheveux, combi, bloc,
// bande), genre, barbe, chauve ; assis et bras (angle) en option.
export function dessinerPlongeur(ctx, p) {
  const s = p.s;
  const marche = ['marche', 'attrape', 'nage', 'rang', 'sortie'].includes(p.etat);
  const jambe = marche ? Math.sin(p.phase) * (p.etat === 'attrape' ? 0.9 : 0.45) : 0;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(s, s);
  ctx.translate(0, -32); ctx.rotate(p.etat === 'nage' ? p.dir * Math.PI / 2.3 : p.rot); ctx.translate(0, 32);
  if (p.etat === 'danse') ctx.rotate(Math.sin(p.phase * 4) * 0.22);
  ctx.scale(p.dir, 1);
  if (p.assis) ctx.translate(0, 19);           // assis : les hanches au niveau du siège
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // Ombre
  if (!p.assis && !['nage', 'vol', 'saut', 'attrape'].includes(p.etat)) {
    ctx.save(); ctx.scale(1 / p.dir, 1); ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.ellipse(0, 1, 18, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  // Bloc (dans le dos), avec le détendeur
  ctx.fillStyle = p.bloc; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.roundRect(-17, -52, 9, 26, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#334155'; ctx.fillRect(-14.5, -56, 4, 5);
  ctx.strokeStyle = '#111827'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-12, -55); ctx.quadraticCurveTo(-4, -66, 7, -53); ctx.stroke();

  // Jambes et palmes
  const pied = (a, couleur) => {
    const hx = 0, hy = -25, L = 22;
    let fx = hx + Math.sin(a) * L, fy = hy + Math.cos(a) * L;
    ctx.strokeStyle = couleur; ctx.lineWidth = 7;
    if (p.assis) {                     // cuisse en avant, mollet qui pend
      fx = 13 + a * 4; fy = hy + 19;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(13, hy); ctx.lineTo(fx, fy); ctx.stroke();
    } else { ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx, fy); ctx.stroke(); }
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.ellipse(fx + 6, fy + 1, 10, 3.2, a * 0.3, 0, Math.PI * 2); ctx.fill();
  };
  pied(-jambe, shade(p.combi, -18));
  // Corps
  ctx.fillStyle = p.combi;
  ctx.beginPath(); ctx.roundRect(-9, -50, 18, 28, 7); ctx.fill();
  ctx.fillStyle = p.bande; ctx.fillRect(-9, -42, 18, 4);
  ctx.fillStyle = '#111827'; ctx.fillRect(-9, -27, 18, 3);     // ceinture de plombs
  pied(jambe, p.combi);

  // Bras
  const epaule = [3, -46];
  let bras = marche ? -jambe * 0.8 : 0.3;
  if (p.etat === 'coucou') bras = Math.PI - 0.5 + Math.sin(p.phase * 10) * 0.45;
  if (p.etat === 'danse') bras = Math.PI - 0.3 + Math.sin(p.phase * 4) * 0.5;
  if (p.etat === 'attrape' || p.etat === 'vol') bras = Math.PI - 0.6 + Math.sin(p.phase) * 0.6;
  if (p.etat === 'tope') bras = Math.PI * 0.62;
  if (p.etat === 'nage') bras = 0.15;
  if (p.etat === 'garde') bras = p.salut > 0 ? Math.PI - 0.35 : 0.05;     // salut, puis bras le long du corps
  if (typeof p.bras === 'number') bras = p.bras;                            // imposé (tenir un carnet…)
  ctx.strokeStyle = p.combi; ctx.lineWidth = 6;
  const mx = epaule[0] + Math.sin(bras) * 15, my = epaule[1] + Math.cos(bras) * 15;
  ctx.beginPath(); ctx.moveTo(...epaule); ctx.lineTo(mx, my); ctx.stroke();
  ctx.fillStyle = p.peau; ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill();

  // Tête, cheveux
  const hy = -60;
  const acc = new Set(p.accessoires || []);
  const cagoule = acc.has('cagoule');
  if (p.genre === 'f' && !p.chauve && !p.degarni && !cagoule) {           // queue de cheval qui flotte
    ctx.fillStyle = p.cheveux;
    ctx.beginPath(); ctx.ellipse(-12, hy + 1 + Math.sin(p.phase * 0.7) * 1.5, 7, 4, -0.5 + Math.sin(p.phase * 0.5) * 0.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = p.peau; ctx.beginPath(); ctx.arc(0, hy, 10.5, 0, Math.PI * 2); ctx.fill();
  if (cagoule) {                   // la cagoule en néoprène : seul le visage dépasse
    ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(0, hy, 11.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.peau; ctx.beginPath(); ctx.ellipse(5, hy + 0.5, 7.2, 8.6, 0, 0, Math.PI * 2); ctx.fill();
  } else if (p.degarni) {                 // le haut du crâne nu, une couronne derrière et sur le côté
    ctx.strokeStyle = p.cheveux; ctx.lineWidth = 3.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, hy, 9.4, Math.PI * 0.68, Math.PI * 1.12); ctx.stroke();
  } else if (!p.chauve) {
    ctx.fillStyle = p.cheveux;
    ctx.beginPath(); ctx.arc(-1, hy - 2, 10.8, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    if (p.genre === 'f') { ctx.beginPath(); ctx.arc(-6, hy - 1, 7, Math.PI * 0.6, Math.PI * 1.6); ctx.fill(); }
  }
  if (!cagoule && (p.chauve || p.degarni)) {     // un reflet sur le crâne
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.ellipse(1, hy - 7, 4, 2, -0.2, 0, Math.PI * 2); ctx.fill();
  }
  if (p.barbe) { ctx.fillStyle = p.cheveux; ctx.beginPath(); ctx.arc(2, hy + 5, 7.5, 0.1, Math.PI - 0.6); ctx.fill(); }
  if (p.pics && !cagoule) {        // la coupe en pics du Mii
    ctx.fillStyle = p.cheveux;
    ctx.beginPath(); ctx.moveTo(-11, hy - 2);
    [[-10, -15], [-6, -9], [-3, -17], [1, -10], [4, -16], [7, -9], [11, -13], [11, -4]]
      .forEach(([x, y]) => ctx.lineTo(x, hy + y));
    ctx.lineTo(9, hy - 4); ctx.lineTo(-11, hy - 2); ctx.fill();
  }
  if (acc.has('bandana') && !cagoule) {   // bandana à pois (couleur au choix), noué derrière
    const bc = p.bandana || '#dc2626', pois = /^#f[0-9a-f]{5}$/i.test(bc) && parseInt(bc.slice(3, 5), 16) > 200 ? '#334155' : '#fff';
    ctx.save(); ctx.beginPath(); ctx.arc(0, hy, 11.6, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = bc; ctx.fillRect(-12, hy - 12.5, 25, 4.8);
    ctx.fillStyle = pois; [[-6, -10], [-1, -11], [4, -10], [8, -11]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, hy + y, 0.8, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
    ctx.fillStyle = bc; ctx.beginPath(); ctx.moveTo(-10, hy - 11); ctx.lineTo(-17, hy - 7 + Math.sin(p.phase) * 1.2); ctx.lineTo(-15, hy - 13); ctx.closePath(); ctx.fill();
  }
  if (acc.has('boucle') && !cagoule) {    // boucle d'oreille dorée
    ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(-3.5, hy + 5, 1.7, 0, Math.PI * 2); ctx.stroke();
  }
  // Masque et sangle
  ctx.strokeStyle = '#111827'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(1, hy - 3); ctx.lineTo(-10, hy - 2); ctx.stroke();
  ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.roundRect(1, hy - 8, 12, 9, 3); ctx.fill();
  ctx.fillStyle = 'rgba(165,243,252,.9)'; ctx.beginPath(); ctx.roundRect(2.5, hy - 6.5, 9, 6, 2); ctx.fill();
  if (p.sourcils) {                // sourcils marqués, au-dessus du masque
    ctx.strokeStyle = p.cheveux; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(2.5, hy - 10); ctx.lineTo(6.5, hy - 11); ctx.moveTo(8.5, hy - 11); ctx.lineTo(12.5, hy - 10); ctx.stroke();
  }
  // Yeux : normaux, ou en croix quand ça secoue
  ctx.fillStyle = '#0f172a';
  if (['chute', 'vol', 'attrape'].includes(p.etat)) {
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.2;
    [[5, hy - 3.5], [9.5, hy - 3.5]].forEach(([ex, ey]) => { ctx.beginPath(); ctx.moveTo(ex - 1.5, ey - 1.5); ctx.lineTo(ex + 1.5, ey + 1.5); ctx.moveTo(ex + 1.5, ey - 1.5); ctx.lineTo(ex - 1.5, ey + 1.5); ctx.stroke(); });
  } else {
    [[5, hy - 3.5], [9.5, hy - 3.5]].forEach(([ex, ey]) => { ctx.beginPath(); ctx.arc(ex, ey, 1.3, 0, Math.PI * 2); ctx.fill(); });
  }
  if (acc.has('moustache')) {      // la moustache, au-dessus du détendeur
    ctx.fillStyle = p.cheveux; ctx.beginPath(); ctx.ellipse(8.5, hy + 1.9, 4.6, 1.6, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Détendeur en bouche
  ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(8, hy + 5, 3, 0, Math.PI * 2); ctx.fill();
  if (acc.has('gopro')) {          // une GoPro sur la tête
    ctx.fillStyle = '#111827'; ctx.fillRect(-1, hy - 12.5, 2.5, 2.5);
    ctx.beginPath(); ctx.roundRect(-4, hy - 18, 9, 6.5, 1.5); ctx.fill();
    ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(4.2, hy - 14.8, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(-2.2, hy - 16.6, 0.7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

const shade = (hex, d) => {
  const n = parseInt(hex.slice(1), 16);
  const c = v => Math.max(0, Math.min(255, v + d));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

/** Un plongeur prêt à dessiner, aux couleurs tirées d'un nom. */
export function plongeurCartoon(graine, extra = {}) {
  const h = hash(graine);
  return {
    x: 0, y: 0, s: 1, dir: 1, etat: 'pause', phase: h % 7, rot: 0,
    peau: PEAUX[h % PEAUX.length], cheveux: CHEVEUX[(h >>> 5) % CHEVEUX.length],
    combi: COMBIS[(h >>> 8) % COMBIS.length], bloc: BLOCS[(h >>> 11) % BLOCS.length],
    bande: ['#22d3ee', '#f472b6', '#facc15', '#a3e635'][(h >>> 3) % 4],
    genre: '', barbe: (h >>> 13) % 4 === 0, chauve: false, ...extra,
  };
}

/**
 * Le Plongeurverse, en isométrique : un fond de sable en losange, vu de
 * trois quarts, où chacun se promène dans les deux sens. On zoome
 * (pincer, molette, boutons) et on déplace la vue en glissant dans l'eau.
 * Le propriétaire du carnet y est aussi (moi), d'après son Mii : combi
 * bleue, cheveux en pics ; devant l'armée quand elle se met en rangs.
 * @param {{buddies:object[], compte:(b)=>number, onTap:(b)=>void, moi?:{prenom:string}, onMoi?:Function}} options
 * @returns {HTMLElement}
 */
export function plongeurverse({ buddies, compte = () => 0, onTap = () => {}, moi = null, onMoi = () => {}, dives = [] }) {
  const tries = [...buddies].filter(b => !b.structure)
    .sort((a, b) => compte(b) - compte(a)).slice(0, MAX);
  const maxN = Math.max(1, ...tries.map(compte));

  const canvas = el('canvas.pverse-canvas');
  const info = el('div.pverse-info', { text: tries.length
    ? 'Pince pour zoomer, glisse pour te déplacer. Attrape un plongeur et lance-le ; touche-le pour sa fiche. Un filtre les met en rangs.'
    : 'Personne à afficher.' });
  const bouton = (texte, titre, fn) => el('button.pverse-btn', { type: 'button', text: texte, title: titre, 'aria-label': titre, onclick: fn });
  const outils = el('div.pverse-outils', {},
    bouton('+', 'Zoomer', () => zoomerVers(cam.z * 1.35, W / 2, H / 2)),
    bouton('−', 'Dézoomer', () => zoomerVers(cam.z / 1.35, W / 2, H / 2)),
    bouton('⤢', 'Tout voir', () => cadrer()),
    moi ? bouton('⭐', 'Où suis-je ?', () => surMoi()) : null);
  const boite = el('div.pverse', {}, canvas, info, outils);
  const ctx = canvas.getContext?.('2d');
  if (!ctx) { info.textContent = 'Le dessin n’est pas disponible sur cet appareil.'; return boite; }
  setTimeout(() => info.classList.add('discret'), 6000);

  // ---------- le monde : un carré de sable de côté L, vu en losange ----------
  const L = Math.round(Math.max(320, 78 * Math.sqrt(tries.length + 4)));
  const C = 0.866;                       // cos 30°
  let W = 360, H = 480;
  const cam = { z: 1, ox: 0, oy: 0, cible: null };
  const proj = (x, y, h = 0) => ({ x: cam.ox + (x - y) * C * cam.z, y: cam.oy + ((x + y) * 0.5 - h) * cam.z });
  const auSol = (sx, sy) => {
    const a = (sx - cam.ox) / (cam.z * C), b = (sy - cam.oy) / cam.z * 2;
    return { x: (a + b) / 2, y: (b - a) / 2 };
  };
  const borne = v => Math.max(8, Math.min(L - 8, v));

  const plongeurs = [];
  const bulles = [];
  const textes = [];
  const hasard = (a, b) => a + Math.random() * (b - a);

  tries.forEach((b, i) => {
    const h = hash(b.id || nomPlongeur(b));
    const n = compte(b);
    plongeurs.push({
      b, nom: nomPlongeur(b) || 'Sans nom', genre: genreDe(b),
      wx: 20 + (h % 1000) / 1000 * (L - 40), wy: 20 + ((h >>> 10) % 1000) / 1000 * (L - 40), wz: 0,
      vx: 0, vy: 0, vz: 0, cx: 0, cy: 0,
      s0: 1.0 + 0.4 * Math.sqrt(n / maxN), s: 1, x: 0, y: 0, dir: h % 2 ? 1 : -1,
      etat: 'marche', t: 1 + (i % 5) * 0.7, phase: h % 7, rot: 0, salto: false, cool: 0, salut: 0,
      vitesse: 16 + (h % 18), slot: null, cache: false,
      ...apparenceDe(b, genreDe(b)),
      bande: (b.categories || [])[0] ? couleurCategorie(b.categories[0]) : '#22d3ee',
    });
  });
  if (moi) {
    plongeurs.push({
      ...plongeurCartoon('moi', { ...MOI, ...apparenceDe({ id: 'moi', mii: moi.mii }, 'h', MOI) }), estMoi: true,
      b: { id: '__moi__', prenom: moi.prenom || 'Moi' }, nom: `★ ${moi.prenom || 'Moi'}`, genre: 'h',
      wx: L / 2, wy: L / 2, wz: 0, vx: 0, vy: 0, vz: 0, cx: 0, cy: 0,
      s0: 1.5, s: 1, x: 0, y: 0, etat: 'marche', t: 2, salto: false, cool: 0, salut: 0, vitesse: 22, slot: null, cache: false,
    });
  }
  // Les binômes : chacun nage souvent avec celui avec qui il a le plus
  // plongé (d'après le carnet) ; moi, avec mes plus fidèles.
  {
    const parId = new Map(plongeurs.map(p => [p.b.id, p]));
    const ensemble = new Map();
    for (const d of dives || []) {
      const ids = (d.buddyIds || []).filter(id => parId.has(id));
      for (const a of ids) for (const b of ids) if (a !== b) ensemble.set(`${a}|${b}`, (ensemble.get(`${a}|${b}`) || 0) + 1);
    }
    for (const p of plongeurs) {
      if (p.estMoi) continue;
      let meilleur = null, n = 0;
      for (const q of plongeurs) {
        if (q === p || q.estMoi) continue;
        const k = ensemble.get(`${p.b.id}|${q.b.id}`) || 0;
        if (k > n) { n = k; meilleur = q; }
      }
      // Un seul suiveur par « chef » de binôme, pour éviter les chenilles.
      if (meilleur && !meilleur.binome && !plongeurs.some(x => x.binome === p)) { p.binome = meilleur; p.ecart = hasard(14, 22); }
    }
    // Moi : au centre du monde.
    const m = plongeurs.find(p => p.estMoi);
    if (m) { m.wx = L / 2; m.wy = L / 2; }
  }
  plongeurs.forEach(viser);

  // Le décor, posé dans le monde (rochers, coraux, algues)
  const decor = [];
  for (let i = 0; i < Math.round(L / 45); i++) {
    const h = hash(`decor${i}`);
    decor.push({ wx: (h % 997) / 997 * L, wy: ((h >>> 10) % 997) / 997 * L, type: ['rocher', 'corail', 'algue', 'algue'][h % 4],
      c: ['#fb7185', '#f59e0b', '#c084fc', '#34d399'][(h >>> 4) % 4], k: 0.7 + ((h >>> 7) % 50) / 100 });
  }
  const poissons = [0, 1, 2, 3].map(i => ({ x: Math.random(), y: 0.08 + i * 0.07, v: (0.02 + Math.random() * 0.03) * (i % 2 ? -1 : 1), c: ['#fbbf24', '#fb7185', '#38bdf8', '#a3e635'][i] }));

  // ---------- caméra ----------
  /** Montre une zone du monde (x0..x1, y0..y1) ; animé, sauf au premier affichage. */
  function viserZone(x0, y0, x1, y1, { anime = true, marge = 1 } = {}) {
    const coins = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => ({ u: (x - y) * C, v: (x + y) * 0.5 }));
    const u0 = Math.min(...coins.map(c => c.u)), u1 = Math.max(...coins.map(c => c.u));
    const v0 = Math.min(...coins.map(c => c.v)) - 80, v1 = Math.max(...coins.map(c => c.v)) + 20;
    const z = Math.max(0.25, Math.min(2.2, Math.min((W - 30) / ((u1 - u0) * marge || 1), (H - 40) / ((v1 - v0) * marge || 1))));
    const cible = { z, ox: W / 2 - (u0 + u1) / 2 * z, oy: H / 2 - (v0 + v1) / 2 * z };
    if (anime) cam.cible = cible; else Object.assign(cam, cible, { cible: null });
  }
  function cadrer(anime = true) { viserZone(0, 0, L, L, { anime }); }
  function zoomerVers(z, px, py) {
    cam.cible = null;
    const avant = auSol(px, py);
    cam.z = Math.max(0.25, Math.min(3, z));
    const apres = proj(avant.x, avant.y);
    cam.ox += px - apres.x; cam.oy += py - apres.y;
  }

  function dimensionner() {
    const r = boite.getBoundingClientRect();
    const premier = !W || W === 360;
    W = Math.max(280, r.width);
    H = Math.round(Math.max(320, Math.min(window.innerHeight * 0.62, 640)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (premier || !cam.ox) { if (moi) surMoi(false); else cadrer(false); }
  }
  /** La caméra sur moi (zoomée), pour me retrouver parmi tout le monde. */
  function surMoi(anime = true) {
    const m = plongeurs.find(p => p.estMoi);
    if (!m) return cadrer(anime);
    viserZone(m.wx - 70, m.wy - 70, m.wx + 70, m.wy + 70, { anime });
  }

  // ---------- la petite armée ----------
  let rangs = null;
  const LIBRES = ['marche', 'pause', 'bulles', 'danse', 'coucou', 'tope', 'suivre'];

  function placerRangs() {
    if (!rangs) return;
    const membres = plongeurs.filter(p => rangs.has(p.b.id)).sort((a, b) => b.s0 - a.s0);
    const k = membres.length;
    if (!k) return;
    const pas = 30;
    const cols = Math.max(1, Math.min(k, Math.ceil(Math.sqrt(k * 1.8)), Math.floor((L * 0.9) / pas)));
    const nb = Math.ceil(k / cols);
    membres.forEach((p, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const dansCeRang = Math.min(cols, k - r * cols);
      // Rangées parallèles à l'écran ; le premier rang (les plus fidèles) devant.
      const u = (c - (dansCeRang - 1) / 2) * pas, v = ((nb - 1) / 2 - r) * pas;
      p.slot = { x: borne(L / 2 + (u + v) / Math.SQRT2), y: borne(L / 2 + (v - u) / Math.SQRT2) };
    });
    // Le chef devant sa troupe.
    const chef = plongeurs.find(p => p.estMoi);
    if (chef) { const v = ((nb - 1) / 2) * pas + 40; chef.slot = { x: borne(L / 2 + v / Math.SQRT2), y: borne(L / 2 + v / Math.SQRT2) }; }
  }

  boite.ranger = ids => {
    rangs = ids && ids.size ? ids : (ids ? new Set() : null);
    plongeurs.forEach(p => { p.slot = null; });
    placerRangs();
    const places = plongeurs.filter(p => p.slot).map(p => p.slot);
    if (rangs && places.length) {
      const xs = places.map(q => q.x), ys = places.map(q => q.y);
      viserZone(Math.min(...xs) - 30, Math.min(...ys) - 30, Math.max(...xs) + 30, Math.max(...ys) + 30);
    } else if (!rangs && W !== 360) cadrer();
    plongeurs.forEach(p => {
      const dedans = !rangs || rangs.has(p.b.id) || p.estMoi;
      if (p.etat === 'attrape') return;
      if (dedans && p.cache) {                    // revient par un bord
        p.cache = false; p.wz = 0;
        if (Math.random() < 0.5) { p.wx = Math.random() < 0.5 ? -20 : L + 20; p.wy = hasard(0, L); }
        else { p.wy = Math.random() < 0.5 ? -20 : L + 20; p.wx = hasard(0, L); }
      }
      if (!rangs) { if (['rang', 'garde', 'sortie'].includes(p.etat)) { p.etat = 'marche'; p.t = hasard(0.5, 3); viser(p); } return; }
      if (dedans) { p.etat = 'rang'; p.t = 1e9; p.rot = 0; }
      else if (!p.cache) {
        p.etat = 'sortie'; p.t = 1e9; p.rot = 0;
        // Vers le bord le plus proche
        const d = [[p.wx, -40, p.wy], [L - p.wx, L + 40, p.wy], [p.wy, p.wx, -40], [L - p.wy, p.wx, L + 40]];
        const [, a, bb] = d.sort((x, y) => x[0] - y[0])[0];
        if (d[0] === d.find(x => x[1] === -40 || x[1] === L + 40)) { p.cx = a; p.cy = p.wy; } else { p.cx = p.wx; p.cy = bb; }
        p.cx = a === -40 || a === L + 40 ? a : p.wx; p.cy = a === -40 || a === L + 40 ? p.wy : bb;
      }
    });
  };

  // ---------- comportement ----------
  function viser(p) { p.cx = borne(p.wx + hasard(-120, 120)); p.cy = borne(p.wy + hasard(-120, 120)); }

  function changer(p, etat, t) {
    p.etat = etat; p.t = t; p.rot = etat === 'chute' ? p.rot : 0; p.salto = false;
    if (EMOJIS[etat] && etat !== 'marche') textes.push({ wx: p.wx, wy: p.wy, wz: 95 * p.s0, txt: EMOJIS[etat], vie: 1.4 });
    if (etat === 'saut') { p.vz = hasard(150, 230); p.salto = Math.random() < 0.5; }
    if (etat === 'nage') { p.vz = 0; viser(p); p.cz = hasard(40, 110); }
    if (etat === 'marche') viser(p);
  }

  /**
   * Ce que fait un plongeur ensuite : surtout nager (avec son binôme
   * quand il en a un), se faire des signes, prendre des photos, montrer
   * une bestiole. Les acrobaties restent rares.
   */
  function bêtise(p) {
    const r = Math.random();
    if (p.binome && !p.binome.cache && r < 0.45) return changer(p, 'suivre', hasard(5, 10));
    if (r < 0.40) return changer(p, 'marche', hasard(3, 7));
    if (r < 0.52) return changer(p, 'pause', hasard(1.5, 3));
    if (r < 0.62) return changer(p, 'bulles', 1.8);
    if (r < 0.72) return signe(p, 'ok');
    if (r < 0.80) return signe(p, 'photo');
    if (r < 0.88) return signe(p, 'montre');
    if (r < 0.93) return changer(p, 'nage', hasard(3, 6));
    if (r < 0.96) return changer(p, 'coucou', 1.6);
    if (r < 0.98) return changer(p, 'danse', 2.2);
    changer(p, 'saut', 9);
  }

  /** Un signe à un voisin (son binôme de préférence), qui répond. */
  function signe(p, quoi) {
    let voisin = p.binome && !p.binome.cache ? p.binome : null;
    if (!voisin) {
      let d0 = 60;
      for (const q of plongeurs) {
        if (q === p || q.cache || !LIBRES.includes(q.etat)) continue;
        const d = Math.hypot(q.wx - p.wx, q.wy - p.wy);
        if (d < d0) { d0 = d; voisin = q; }
      }
    }
    if (!voisin) return changer(p, 'pause', 1.5);
    p.dir = (p.wx - p.wy) < (voisin.wx - voisin.wy) ? 1 : -1;
    changer(p, 'pause', 1.8);
    textes.push({ wx: p.wx, wy: p.wy, wz: 95 * p.s0, txt: EMOJIS[quoi], vie: 1.6 });
    if (quoi === 'ok' && LIBRES.includes(voisin.etat)) {
      voisin.dir = -p.dir; changer(voisin, 'pause', 1.6);
      textes.push({ wx: voisin.wx, wy: voisin.wy, wz: 95 * voisin.s0, txt: '👌', vie: 1.4 });
    }
    if (quoi === 'photo' && LIBRES.includes(voisin.etat)) { voisin.dir = -p.dir; changer(voisin, 'coucou', 1.4); }
  }

  /** Avance vers (cx, cy) ; renvoie vrai une fois arrivé. */
  function allerVers(p, v, dt, borner = true) {
    const dx = p.cx - p.wx, dy = p.cy - p.wy, d = Math.hypot(dx, dy);
    if (d < 1.5) return true;
    const pas = Math.min(d, v * dt);
    p.wx += dx / d * pas; p.wy += dy / d * pas;
    if (borner) { p.wx = borne(p.wx); p.wy = borne(p.wy); }
    const ecranX = (dx - dy);                   // sens à l'écran
    if (Math.abs(ecranX) > 0.5) p.dir = ecranX > 0 ? 1 : -1;
    p.phase += dt * 9;
    return false;
  }

  function avancer(p, dt) {
    if (p.cache) return;
    if (rangs && p.slot && LIBRES.includes(p.etat)) { p.etat = 'rang'; p.t = 1e9; }
    p.t -= dt; p.cool -= dt; p.salut -= dt;
    switch (p.etat) {
      case 'rang':
        p.cx = p.slot.x; p.cy = p.slot.y;
        if (allerVers(p, 80, dt)) { p.etat = 'garde'; p.dir = 1; p.salut = 1.6;
          if (Math.random() < 0.4) textes.push({ wx: p.wx, wy: p.wy, wz: 95 * p.s0, txt: '🫡', vie: 1.2 }); }
        return;
      case 'garde': return;
      case 'sortie':
        if (allerVers(p, 85, dt, false)) p.cache = true;
        if (p.wx < -30 || p.wx > L + 30 || p.wy < -30 || p.wy > L + 30) p.cache = true;
        return;
      case 'marche':
        if (allerVers(p, p.vitesse * 0.8, dt)) viser(p);
        break;
      case 'suivre': {
        // À côté de son binôme, un peu en retrait.
        const b = p.binome;
        if (!b || b.cache) { changer(p, 'marche', 2); break; }
        p.cx = borne(b.wx - p.ecart * 0.7); p.cy = borne(b.wy + p.ecart * 0.7);
        if (!allerVers(p, Math.max(p.vitesse, 26), dt) && Math.random() < dt * 0.4) {
          const e = proj(p.wx, p.wy, 56 * p.s0); bulles.push({ x: e.x, y: e.y, r: hasard(1.5, 3), v: hasard(30, 50) });
        }
        break;
      }
      case 'bulles':
        if (Math.random() < dt * 9) { const e = proj(p.wx, p.wy, 56 * p.s0); bulles.push({ x: e.x + p.dir * 8 * p.s, y: e.y, r: hasard(2, 5), v: hasard(30, 60) }); }
        break;
      case 'saut': case 'vol':
        p.vz -= G * dt; p.wz += p.vz * dt;
        p.wx += p.vx * dt; p.wy += p.vy * dt;
        p.vx *= Math.pow(0.6, dt); p.vy *= Math.pow(0.6, dt);
        if (p.wx < 8 || p.wx > L - 8) { p.vx *= -0.6; p.wx = borne(p.wx); }
        if (p.wy < 8 || p.wy > L - 8) { p.vy *= -0.6; p.wy = borne(p.wy); }
        if (p.salto) p.rot += p.dir * dt * 7;
        if (p.etat === 'vol') p.rot += (p.vx - p.vy) * dt * 0.01;
        if (p.wz <= 0) {
          p.wz = 0;
          if (p.etat === 'vol' && p.vz < -150) { p.vz *= -0.35; break; }
          p.vx = p.vy = 0;
          if (p.etat === 'vol' || Math.abs(Math.sin(p.rot)) > 0.5) { p.rot = p.dir * Math.PI / 2; changer(p, 'chute', 1.3); }
          else if (rangs && p.slot) { p.etat = 'rang'; p.t = 1e9; }
          else changer(p, 'marche', hasard(2, 5));
        }
        return;
      case 'nage':
        p.wz += ((p.cz || 60) - p.wz) * Math.min(1, dt * 1.2);
        if (allerVers(p, 45, dt)) viser(p);
        p.phase += dt * 4;
        if (Math.random() < dt * 2) { const e = proj(p.wx, p.wy, p.wz + 30 * p.s0); bulles.push({ x: e.x, y: e.y, r: hasard(1.5, 3.5), v: hasard(30, 50) }); }
        if (p.t <= 0 || (rangs && p.slot)) { p.vz = 0; p.vx = p.vy = 0; p.etat = 'vol'; p.t = 9; }
        return;
      case 'chute':
        if (p.t <= 0.4) p.rot *= 0.8;
        if (p.t <= 0) { p.rot = 0; if (rangs && p.slot) { p.etat = 'rang'; p.t = 1e9; } else changer(p, 'marche', hasard(2, 5)); }
        return;
      case 'attrape':
        p.phase += dt * 22;
        return;
      default:
        p.phase += dt * 2;
    }
    if (p.t <= 0 && !['saut', 'vol', 'attrape'].includes(p.etat)) bêtise(p);
  }

  function rencontres() {
    for (let i = 0; i < plongeurs.length; i++) {
      const a = plongeurs[i];
      if (a.etat !== 'marche' || a.cool > 0 || a.cache) continue;
      for (let j = i + 1; j < plongeurs.length; j++) {
        const b = plongeurs[j];
        if (b.etat !== 'marche' || b.cool > 0 || b.cache) continue;
        if (Math.hypot(a.wx - b.wx, a.wy - b.wy) < 16 && Math.random() < (a.estMoi || b.estMoi ? 0.6 : 0.25)) {
          a.dir = (a.wx - a.wy) < (b.wx - b.wy) ? 1 : -1; b.dir = -a.dir;
          changer(a, 'tope', 0.9); b.etat = 'tope'; b.t = 0.9;
          a.cool = b.cool = 6;
        }
      }
    }
  }

  // ---------- dessin ----------
  function losange() {
    const h = proj(0, 0), d = proj(L, 0), b = proj(L, L), g = proj(0, L);
    // Épaisseur du sable (on voit la tranche)
    const ep = 14 * cam.z;
    ctx.fillStyle = '#b08d55';
    ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(b.x, b.y); ctx.lineTo(d.x, d.y); ctx.lineTo(d.x, d.y + ep); ctx.lineTo(b.x, b.y + ep); ctx.lineTo(g.x, g.y + ep); ctx.closePath(); ctx.fill();
    const sable = ctx.createLinearGradient(0, h.y, 0, b.y);
    sable.addColorStop(0, '#d9c08a'); sable.addColorStop(1, '#efdcae');
    ctx.fillStyle = sable;
    ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(d.x, d.y); ctx.lineTo(b.x, b.y); ctx.lineTo(g.x, g.y); ctx.closePath(); ctx.fill();
    // Un quadrillage léger : on lit mieux les distances
    ctx.strokeStyle = 'rgba(120,90,40,.16)'; ctx.lineWidth = 1;
    const pas = L / Math.max(4, Math.round(L / 60));
    for (let v = pas; v < L - 1; v += pas) {
      let a = proj(v, 0), c = proj(v, L); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      a = proj(0, v); c = proj(L, v); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    }
  }

  function dessinerDecor(o, t) {
    const e = proj(o.wx, o.wy), k = cam.z * o.k;
    ctx.save();
    ctx.translate(e.x, e.y);
    if (o.type === 'rocher') {
      ctx.fillStyle = '#5b7a8c';
      ctx.beginPath(); ctx.ellipse(0, -8 * k, 22 * k, 14 * k, 0, Math.PI, 0); ctx.ellipse(0, -8 * k, 22 * k, 6 * k, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.ellipse(-6 * k, -14 * k, 8 * k, 4 * k, -0.3, 0, Math.PI * 2); ctx.fill();
    } else if (o.type === 'corail') {
      ctx.strokeStyle = o.c; ctx.lineWidth = 5 * k; ctx.lineCap = 'round';
      [[0, -30], [-10, -22], [10, -24], [-5, -36], [6, -38]].forEach(([dx, dy]) => {
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(dx * 0.4 * k, dy * 0.5 * k, dx * k, dy * k); ctx.stroke(); });
    } else {
      ctx.strokeStyle = '#2f9e6a'; ctx.lineWidth = 4 * k; ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(i * 5 * k, 0);
        ctx.quadraticCurveTo((i * 5 + Math.sin(t * 1.4 + o.wx) * 10) * k, -28 * k, (i * 6 + Math.sin(t * 1.1 + o.wy) * 8) * k, -55 * k); ctx.stroke();
      }
    }
    ctx.restore();
  }

  const etiquettes = [];
  function dessiner(p) {
    if (p.cache) return;
    const sol = proj(p.wx, p.wy);
    const e = proj(p.wx, p.wy, p.wz);
    p.s = p.s0 * cam.z * 0.85;
    // Ombre au sol quand il est en l'air
    if (p.wz > 2 || ['attrape', 'nage', 'vol', 'saut'].includes(p.etat)) {
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0.05, 0.22 - p.wz / 600)})`;
      ctx.beginPath(); ctx.ellipse(sol.x, sol.y, 15 * p.s, 7 * p.s, 0, 0, Math.PI * 2); ctx.fill();
    }
    p.x = e.x; p.y = e.y;
    dessinerPlongeur(ctx, p);
    const auRang = p.etat === 'garde' || p.etat === 'rang';
    const court = auRang || cam.z < 0.75 || plongeurs.length > 20;
    etiquettes.push({ x: e.x, y: p.etat === 'nage' ? e.y - 44 * p.s : e.y - 78 * p.s,
      nom: p.estMoi ? p.nom : court ? (p.b.prenom || p.nom).split(' ')[0] : p.nom,
      couleur: COULEUR_GENRE[p.genre || ''], taille: Math.round(Math.max(9.5, Math.min(13, 11 * Math.sqrt(cam.z * 1.4)))) });
  }

  function poserNoms() {
    const poses = [];
    etiquettes.sort((a, b) => b.y - a.y);
    for (const e of etiquettes) {
      ctx.font = `700 ${e.taille}px system-ui, sans-serif`;
      const l = ctx.measureText(e.nom).width + 6, h = e.taille + 2;
      let y = e.y;
      for (let k = 0; k < 3; k++) {
        const gene = poses.find(q => Math.abs(q.x - e.x) < (q.l + l) / 2 && Math.abs(q.y - y) < h);
        if (!gene) break;
        y = gene.y - h;
      }
      poses.push({ x: e.x, y, l });
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(255,255,255,.92)';
      ctx.strokeText(e.nom, e.x, y);
      ctx.fillStyle = e.couleur; ctx.fillText(e.nom, e.x, y);
    }
    etiquettes.length = 0;
  }

  let avant = performance.now();
  let temps = 0;
  function image(tt) {
    if (!boite.isConnected) return;
    requestAnimationFrame(image);
    if (document.hidden) { avant = tt; return; }
    const dt = Math.min(0.05, (tt - avant) / 1000);
    avant = tt; temps += dt;

    plongeurs.forEach(p => avancer(p, dt));
    rencontres();
    if (cam.cible) {
      const k = Math.min(1, dt * 3.5);
      cam.z += (cam.cible.z - cam.z) * k; cam.ox += (cam.cible.ox - cam.ox) * k; cam.oy += (cam.cible.oy - cam.oy) * k;
      if (Math.abs(cam.cible.z - cam.z) < 0.002 && Math.abs(cam.cible.ox - cam.ox) < 0.5) cam.cible = null;
    }

    // L'eau, puis le sable en losange
    const eau = ctx.createLinearGradient(0, 0, 0, H);
    eau.addColorStop(0, '#5fd3f3'); eau.addColorStop(0.5, '#1b8fc4'); eau.addColorStop(1, '#0b3b63');
    ctx.fillStyle = eau; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.08; ctx.fillStyle = '#fff';
    for (let i = 0; i < 5; i++) {
      const x = (i + 0.4) * W / 5 + Math.sin(temps * 0.6 + i) * 12;
      ctx.beginPath(); ctx.moveTo(x - 14, 0); ctx.lineTo(x + 14, 0); ctx.lineTo(x + 70, H); ctx.lineTo(x + 20, H); ctx.fill();
    }
    ctx.globalAlpha = 1;
    poissons.forEach(f => {
      const x = ((f.x + f.v * temps) % 1 + 1) % 1 * W, y = f.y * H + Math.sin(temps * 2 + f.y * 20) * 3, d = Math.sign(f.v);
      ctx.fillStyle = f.c;
      ctx.beginPath(); ctx.ellipse(x, y, 8, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - d * 7, y); ctx.lineTo(x - d * 13, y - 4); ctx.lineTo(x - d * 13, y + 4); ctx.fill();
    });
    losange();

    // Tout ce qui est posé dans le monde, du fond vers l'avant
    const scene = [
      ...decor.map(o => ({ prof: o.wx + o.wy, f: () => dessinerDecor(o, temps) })),
      ...plongeurs.filter(p => !p.cache).map(p => ({ prof: p.wx + p.wy + (p.etat === 'attrape' ? 1e5 : 0), f: () => dessiner(p) })),
    ].sort((a, b) => a.prof - b.prof);
    scene.forEach(o => o.f());

    // Bulles
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.2;
    for (let i = bulles.length - 1; i >= 0; i--) {
      const u = bulles[i];
      u.y -= u.v * dt; u.x += Math.sin(u.y / 9) * 0.3;
      if (u.y < 0) { bulles.splice(i, 1); continue; }
      ctx.beginPath(); ctx.arc(u.x, u.y, u.r * Math.max(0.6, cam.z), 0, Math.PI * 2); ctx.stroke();
    }
    poserNoms();
    // Emojis
    ctx.textAlign = 'center'; ctx.font = `${Math.round(16 * Math.max(0.8, Math.min(1.4, cam.z)))}px system-ui, sans-serif`;
    for (let i = textes.length - 1; i >= 0; i--) {
      const e = textes[i];
      e.vie -= dt; e.wz += 14 * dt;
      if (e.vie <= 0) { textes.splice(i, 1); continue; }
      const q = proj(e.wx, e.wy, e.wz);
      ctx.globalAlpha = Math.min(1, e.vie); ctx.fillText(e.txt, q.x, q.y); ctx.globalAlpha = 1;
    }
  }

  // ---------- le doigt : attraper, lancer, déplacer la vue, pincer ----------
  const doigts = new Map();
  let prise = null, glisse = null, pince = null;
  const position = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const sous = ({ x, y }) => plongeurs.filter(p => !p.cache)
    .sort((a, b) => (b.wx + b.wy) - (a.wx + a.wy))
    .find(p => { const e = proj(p.wx, p.wy, p.wz); return Math.hypot(x - e.x, y - (e.y - 34 * p.s)) < 32 * p.s + 8; });

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    cam.cible = null;
    canvas.setPointerCapture?.(e.pointerId);
    const pos = position(e);
    doigts.set(e.pointerId, pos);
    if (doigts.size === 2) {                         // pincer : zoom
      if (prise) { prise.p.etat = 'vol'; prise.p.vz = 0; prise = null; }
      glisse = null;
      const [a, b] = [...doigts.values()];
      pince = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: cam.z, m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      pince.ancre = auSol(pince.m.x, pince.m.y);
      return;
    }
    const p = sous(pos);
    if (p) {
      const sol = auSol(pos.x, pos.y);
      prise = { p, x0: pos.x, y0: pos.y, t0: performance.now(), hist: [{ ...pos, t: performance.now() }], dx: p.wx - sol.x, dy: p.wy - sol.y };
    } else {
      glisse = { x: pos.x, y: pos.y, ox: cam.ox, oy: cam.oy, t0: performance.now() };
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!doigts.has(e.pointerId)) return;
    const pos = position(e);
    doigts.set(e.pointerId, pos);
    if (pince && doigts.size >= 2) {
      const [a, b] = [...doigts.values()];
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      cam.z = Math.max(0.25, Math.min(3, pince.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pince.d0));
      const q = proj(pince.ancre.x, pince.ancre.y);
      cam.ox += m.x - q.x; cam.oy += m.y - q.y;
      return;
    }
    if (glisse) { cam.ox = glisse.ox + pos.x - glisse.x; cam.oy = glisse.oy + pos.y - glisse.y; return; }
    if (!prise) return;
    const { p } = prise;
    if (p.etat !== 'attrape' && Math.hypot(pos.x - prise.x0, pos.y - prise.y0) > 8) { changer(p, 'attrape', 99); p.rot = 0; }
    if (p.etat === 'attrape') {
      // On le soulève : sous le doigt, un peu au-dessus du sable.
      p.wz = 26;
      const sol = auSol(pos.x, pos.y + 26 * cam.z);
      p.wx = borne(sol.x + prise.dx); p.wy = borne(sol.y + prise.dy);
      const dernier = prise.hist.at(-1);
      if (Math.abs(pos.x - dernier.x) > 1) p.dir = pos.x > dernier.x ? 1 : -1;
    }
    prise.hist.push({ ...pos, t: performance.now() });
    if (prise.hist.length > 6) prise.hist.shift();
  });
  const lacher = e => {
    doigts.delete(e.pointerId);
    if (pince) { if (doigts.size < 2) pince = null; return; }
    glisse = null;
    if (!prise) return;
    const { p } = prise;
    const pos = position(e);
    const court = performance.now() - prise.t0 < 350 && Math.hypot(pos.x - prise.x0, pos.y - prise.y0) < 8;
    if (court && p.etat !== 'attrape') { prise = null; if (p.estMoi) onMoi(); else onTap(p.b); return; }
    // Lancé : la vitesse du doigt, ramenée au sol, et un peu de hauteur.
    const a = prise.hist[0], b = prise.hist.at(-1);
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    const dxs = (b.x - a.x) / dt, dys = (b.y - a.y) / dt;
    const u = dxs / (cam.z * C), v = dys * 2 / cam.z;
    p.vx = Math.max(-500, Math.min(500, (u + v) / 2));
    p.vy = Math.max(-500, Math.min(500, (v - u) / 2));
    p.vz = Math.min(320, 60 + Math.hypot(dxs, dys) * 0.25);
    p.etat = 'vol'; p.t = 9;
    if (Math.hypot(dxs, dys) > 500) textes.push({ wx: p.wx, wy: p.wy, wz: 90, txt: '🌀', vie: 1.2 });
    prise = null;
  };
  canvas.addEventListener('pointerup', lacher);
  canvas.addEventListener('pointercancel', lacher);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const pos = position(e);
    zoomerVers(cam.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12), pos.x, pos.y);
  }, { passive: false });
  canvas.addEventListener('dblclick', () => cadrer());

  requestAnimationFrame(() => {
    dimensionner();
    avant = performance.now();
    requestAnimationFrame(image);
  });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => dimensionner()).observe(boite);

  return boite;
}

/** Le buste d'un plongeur (son Mii) dans une toile de 120 × 150 (dessinée en ×2). */
function buste(toile, b, defaut = null) {
  const ctx = toile.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, toile.width, toile.height); ctx.setTransform(2, 0, 0, 2, 0, 0);
  dessinerPlongeur(ctx, { x: 58, y: 228, s: 3, dir: 1, etat: 'pause', phase: 0, rot: 0, genre: genreDe(b),
    bande: (b.categories || [])[0] ? couleurCategorie(b.categories[0]) : '#22d3ee', ...apparenceDe(b, defaut ? 'h' : genreDe(b), defaut) });
}

/** Son Mii en portrait (en-tête du volet) ; .redessiner() après un changement. */
export function portraitMii(b, { defaut = null } = {}) {
  const toile = el('canvas.mii-portrait', { width: 240, height: 300, role: 'img', 'aria-label': `Mii de ${nomPlongeur(b) || 'ce plongeur'}` });
  toile.redessiner = () => buste(toile, b, defaut);
  toile.redessiner();
  return toile;
}

/**
 * « Son Mii » : peau, couleur des cheveux, coiffure (cheveux, dégarni,
 * chauve), barbe ; avec l'aperçu qui bouge. Les choix vont dans b.mii.
 * @param {object} b  le plongeur (lu pour l'aperçu)
 * @param {(mii:object)=>void} onChange  reçoit le nouveau b.mii
 */
export function editeurMii(b, onChange, { defaut = null } = {}) {
  const boite = el('div.mii-editeur');
  const toile = el('canvas.mii-apercu', { width: 240, height: 300 });
  const zone = el('div.mii-choix');
  const dessiner = () => buste(toile, b, defaut);
  const choisir = p => {
    const mii = { ...(b.mii || {}), ...p };
    for (const k of Object.keys(mii)) if (mii[k] == null) delete mii[k];
    b.mii = Object.keys(mii).length ? mii : undefined;
    onChange(b.mii);
    rendre();
  };
  const pastilles = (liste, cle, actuel) => el('div.mii-pastilles', {}, ...liste.map(([c, nom]) =>
    el(`button.mii-pastille${actuel === c ? '.on' : ''}`, { type: 'button', title: nom, 'aria-label': nom, style: { background: c },
      onclick: () => choisir({ [cle]: c }) })));
  function rendre() {
    const a = apparenceDe(b, defaut ? 'h' : genreDe(b), defaut);
    const coiffure = a.chauve ? 'chauve' : a.degarni ? 'degarni' : a.pics ? 'pics' : 'cheveux';
    const acc = new Set(a.accessoires);
    zone.replaceChildren(
      el('div.mii-ligne', {}, el('span', { text: 'Peau' }), pastilles(MII.peaux, 'peau', a.peau)),
      el('div.mii-ligne', {}, el('span', { text: 'Coiffure' }), el('div.seg.mii-seg', {}, ...MII.coiffures.map(([v, nom]) =>
        el(`button${coiffure === v ? '.on' : ''}`, { type: 'button', text: nom, onclick: () => choisir({ coiffure: v }) })))),
      coiffure === 'chauve' && !a.barbe ? null : el('div.mii-ligne', {}, el('span', { text: coiffure === 'chauve' ? 'Barbe' : 'Couleur' }),
        pastilles(MII.cheveux, 'cheveux', a.cheveux)),
      el('div.mii-ligne', {}, el('span', { text: 'Accessoires' }), el('div.mii-acc', {}, ...MII.accessoires.map(([v, nom]) =>
        el(`button.chip${acc.has(v) ? '.on' : ''}`, { type: 'button', text: nom, onclick: () => {
          const n = new Set(acc); n.has(v) ? n.delete(v) : n.add(v);
          choisir({ accessoires: n.size ? [...n] : null });
        } })))),
      acc.has('bandana') && !acc.has('cagoule') ? el('div.mii-ligne', {}, el('span', { text: 'Bandana' }), pastilles(MII.bandanas, 'bandana', a.bandana)) : null,
      el('div.mii-ligne', {}, el('label.switch', {},
        el('input', { type: 'checkbox', checked: !!a.barbe, onchange: e => choisir({ barbe: e.target.checked }) }), el('span', { text: 'Barbe' })),
        b.mii ? el('button.btn.sm.ghost', { type: 'button', text: defaut ? '↺ Par défaut' : '↺ Au hasard', title: defaut ? 'Revenir à mon Mii de départ' : 'Revenir à l’apparence tirée du nom',
          onclick: () => { b.mii = undefined; onChange(undefined); rendre(); } }) : null));
    dessiner();
  }
  boite.append(toile, zone);
  rendre();
  boite.rafraichir = rendre;
  return boite;
}
