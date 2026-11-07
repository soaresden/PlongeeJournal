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
const COMBIS = ['#1f2937', '#0f4c75', '#24543f', '#5b2a86', '#8a1c3a', '#0e6375', '#3a4556'];
const BLOCS = ['#facc15', '#cbd5e1', '#f97316', '#e2e8f0'];

const EMOJIS = { garde: '🫡', bulles: '🫧', saut: '🤸', danse: '💃', chute: '😵', coucou: '👋', tope: '✋', nage: '🐠', attrape: '😱', vol: '🌀' };

/**
 * @param {{buddies:object[], compte:(b)=>number, onTap:(b)=>void}} options
 * @returns {HTMLElement}
 */
export function plongeurverse({ buddies, compte = () => 0, onTap = () => {} }) {
  const tries = [...buddies].filter(b => !b.structure)
    .sort((a, b) => compte(b) - compte(a)).slice(0, MAX);
  const maxN = Math.max(1, ...tries.map(compte));

  const canvas = el('canvas.pverse-canvas');
  const info = el('div.pverse-info', { text: tries.length
    ? `Attrape-les au doigt et lance-les ! Touche quelqu’un pour sa fiche. Un filtre les met en rangs.${buddies.length > MAX ? ` (Les ${MAX} plus fréquents.)` : ''}`
    : 'Personne à afficher.' });
  const boite = el('div.pverse', {}, canvas, info);
  const ctx = canvas.getContext?.('2d');
  if (!ctx) { info.textContent = 'Le dessin n’est pas disponible sur cet appareil.'; return boite; }

  let W = 360, H = 480, sol = 400;
  const plongeurs = [];
  const bulles = [];
  const textes = [];          // emojis qui flottent
  const poissons = [];
  let fond = null;

  // ---------- les habitants ----------
  tries.forEach((b, i) => {
    const h = hash(b.id || nomPlongeur(b));
    const n = compte(b);
    const z = ((h >>> 3) % 100) / 100;              // profondeur : derrière (0) → devant (1)
    plongeurs.push({
      b, nom: nomPlongeur(b) || 'Sans nom', genre: genreDe(b),
      z, s0: 1.0 + 0.4 * Math.sqrt(n / maxN), s: 1, slot: null, cache: false, salut: 0,
      x: 40 + ((h % 997) / 997) * 300, y: 0, vx: 0, vy: 0, dir: h % 2 ? 1 : -1,
      etat: 'marche', t: 1 + (i % 5) * 0.7, phase: h % 7, rot: 0, salto: false, cible: 0, cool: 0,
      vitesse: 22 + (h % 23),
      peau: PEAUX[h % PEAUX.length], cheveux: CHEVEUX[(h >>> 5) % CHEVEUX.length],
      combi: COMBIS[(h >>> 8) % COMBIS.length], bloc: BLOCS[(h >>> 11) % BLOCS.length],
      bande: (b.categories || [])[0] ? couleurCategorie(b.categories[0]) : '#22d3ee',
      barbe: genreDe(b) === 'h' && (h >>> 13) % 4 === 0, chauve: genreDe(b) === 'h' && (h >>> 15) % 6 === 0,
    });
  });
  for (let i = 0; i < 4; i++) poissons.push({ x: Math.random() * 400, y: 60 + i * 50, v: (12 + Math.random() * 18) * (i % 2 ? 1 : -1), c: ['#fbbf24', '#fb7185', '#38bdf8', '#a3e635'][i] });

  const solDe = p => sol + 6 + p.z * 50;               // chacun sa rangée dans le sable
  const echelle = p => { p.s = p.s0 * (0.82 + 0.3 * p.z); };
  plongeurs.forEach(echelle);

  // ---------- la petite armée ----------
  let rangs = null;           // Set des ids rangés, ou null : tout le monde libre
  const LIBRES = ['marche', 'pause', 'bulles', 'danse', 'coucou', 'tope', 'nage', 'chute', 'saut'];

  function placerRangs() {
    if (!rangs) return;
    const membres = plongeurs.filter(p => rangs.has(p.b.id)).sort((a, b) => b.s0 - a.s0);
    const k = membres.length;
    if (!k) return;
    const pas = 50;
    const parRang = Math.max(1, Math.min(k, Math.floor((W - 20) / pas)));
    const nbRangs = Math.ceil(k / parRang);
    const ecart = Math.min(40, (H - 150) / Math.max(1, nbRangs));
    membres.forEach((p, i) => {
      const r = Math.floor(i / parRang), c = i % parRang;
      const dansCeRang = Math.min(parRang, k - r * parRang);
      // Premier rang devant : les plus fidèles. Les suivants en gradins,
      // plus haut et un peu plus petits, pour qu'on voie tout le monde.
      p.slot = { x: W / 2 + (c - (dansCeRang - 1) / 2) * pas, y: H - 12 - r * ecart, z: Math.max(0, 1 - r * 0.22), r };
    });
  }

  /** Mettre en rangs (un Set d'ids) ou rendre la liberté (null). */
  boite.ranger = ids => {
    rangs = ids && ids.size ? ids : (ids ? new Set() : null);
    plongeurs.forEach(p => { p.slot = null; });
    placerRangs();
    plongeurs.forEach(p => {
      const dedans = !rangs || rangs.has(p.b.id);
      if (p.etat === 'attrape') return;
      if (dedans && p.cache) {                      // revient par un bord
        p.cache = false;
        p.x = Math.random() < 0.5 ? -20 : W + 20;
        p.dir = p.x < 0 ? 1 : -1; p.y = solDe(p); p.rot = 0;
      }
      if (!rangs) { if (['rang', 'garde', 'sortie'].includes(p.etat) || p.etat === 'marche') { p.etat = 'marche'; p.t = 0.5 + Math.random() * 3; } return; }
      if (dedans) { p.etat = 'rang'; p.t = 1e9; p.rot = 0; }
      else if (!p.cache) { p.etat = 'sortie'; p.t = 1e9; p.rot = 0; p.dir = p.x < W / 2 ? -1 : 1; }
    });
  };

  // ---------- taille et décor ----------
  function dimensionner() {
    const r = boite.getBoundingClientRect();
    W = Math.max(280, r.width);
    // Assez haut pour nager, assez bas pour voir le sable sans défiler.
    H = Math.round(Math.max(300, Math.min(window.innerHeight * 0.5, 500)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sol = H - 70;
    plongeurs.forEach(p => { p.x = Math.min(W - 20, Math.max(20, p.x * (W / 360) || p.x)); if (p.etat === 'marche' || !p.y) p.y = solDe(p); });
    fond = dessinerFond();
    placerRangs();
  }

  function dessinerFond() {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = canvas.width; c.height = canvas.height;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const eau = g.createLinearGradient(0, 0, 0, H);
    eau.addColorStop(0, '#5fd3f3'); eau.addColorStop(0.45, '#1b8fc4'); eau.addColorStop(1, '#0b3b63');
    g.fillStyle = eau; g.fillRect(0, 0, W, H);
    // Rayons de lumière
    g.globalAlpha = 0.09; g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) {
      const x = (i + 0.3) * W / 6;
      g.beginPath(); g.moveTo(x - 14, 0); g.lineTo(x + 14, 0); g.lineTo(x + 70, sol); g.lineTo(x + 20, sol); g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
    // Rochers et sable
    g.fillStyle = '#21506b';
    [[0.08, 46], [0.82, 60], [0.55, 30]].forEach(([fx, r]) => { g.beginPath(); g.ellipse(fx * W, sol + 6, r * 1.6, r, 0, Math.PI, 0); g.fill(); });
    const sable = g.createLinearGradient(0, sol, 0, H);
    sable.addColorStop(0, '#e8d3a2'); sable.addColorStop(1, '#c9a96b');
    g.fillStyle = sable;
    g.beginPath(); g.moveTo(0, sol + 4);
    for (let x = 0; x <= W; x += 20) g.quadraticCurveTo(x + 10, sol - 4 + Math.sin(x) * 3, x + 20, sol + 4);
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
    g.fillStyle = 'rgba(120,90,40,.35)';
    for (let i = 0; i < 70; i++) g.fillRect((i * 97) % W, sol + 10 + ((i * 53) % (H - sol - 12)), 2, 2);
    // Coraux
    [[0.18, '#fb7185'], [0.7, '#f59e0b'], [0.93, '#c084fc']].forEach(([fx, coul]) => {
      g.strokeStyle = coul; g.lineWidth = 5; g.lineCap = 'round';
      const x = fx * W;
      [[0, -34], [-12, -24], [12, -26], [-6, -40], [7, -42]].forEach(([dx, dy]) => { g.beginPath(); g.moveTo(x, sol + 6); g.quadraticCurveTo(x + dx * 0.4, sol + dy * 0.5, x + dx, sol + dy); g.stroke(); });
    });
    return c;
  }

  // ---------- comportement ----------
  const hasard = (a, b) => a + Math.random() * (b - a);

  function changer(p, etat, t) {
    p.etat = etat; p.t = t; p.rot = etat === 'chute' ? p.rot : 0; p.salto = false;
    if (EMOJIS[etat] && etat !== 'marche') textes.push({ x: p.x, y: p.y - 86 * p.s, txt: EMOJIS[etat], vie: 1.4 });
    if (etat === 'saut') { p.vy = -hasard(200, 300); p.vx = p.dir * hasard(10, 50); p.salto = Math.random() < 0.5; }
    if (etat === 'nage') { p.cible = hasard(60, sol - 120); p.vx = p.dir * hasard(40, 70); }
  }

  function bêtise(p) {
    const r = Math.random();
    if (r < 0.34) return changer(p, 'marche', hasard(2, 6));
    if (r < 0.46) return changer(p, 'bulles', 1.6);
    if (r < 0.58) return changer(p, 'saut', 9);
    if (r < 0.68) return changer(p, 'nage', hasard(3, 6));
    if (r < 0.76) return changer(p, 'danse', 2.2);
    if (r < 0.84) return changer(p, 'coucou', 1.6);
    if (r < 0.92) { p.rot = p.dir * Math.PI / 2; return changer(p, 'chute', 1.4); }
    changer(p, 'pause', hasard(1, 2.5));
  }

  function avancer(p, dt) {
    if (p.cache) return;
    if (rangs && p.slot && LIBRES.includes(p.etat) && !['saut', 'nage', 'chute'].includes(p.etat)) { p.etat = 'rang'; p.t = 1e9; }
    const s = solDe(p);
    p.t -= dt; p.cool -= dt; p.salut -= dt;
    switch (p.etat) {
      case 'rang': {
        const dx = p.slot.x - p.x;
        if (Math.abs(dx) > 1) p.dir = Math.sign(dx);
        p.x += Math.max(-95 * dt, Math.min(95 * dt, dx));
        p.z += (p.slot.z - p.z) * Math.min(1, dt * 3); echelle(p);
        p.y += (p.slot.y - p.y) * Math.min(1, dt * 3); p.phase += dt * 11;
        if (Math.abs(dx) < 1.5 && Math.abs(p.slot.z - p.z) < 0.02 && Math.abs(p.slot.y - p.y) < 1.5) {
          p.x = p.slot.x; p.z = p.slot.z; echelle(p); p.y = p.slot.y;
          p.dir = 1; p.etat = 'garde'; p.salut = 1.6;
          if (Math.random() < 0.4) textes.push({ x: p.x, y: p.y - 86 * p.s, txt: '🫡', vie: 1.2 });
        }
        return;
      }
      case 'garde':
        p.y = p.slot ? p.slot.y : solDe(p);
        return;
      case 'sortie':
        p.x += p.dir * 95 * dt; p.phase += dt * 11; p.y = s;
        if (p.x < -30 || p.x > W + 30) p.cache = true;
        return;
      case 'marche':
        p.x += p.dir * p.vitesse * dt; p.phase += dt * 9; p.y = s;
        if (p.x < 18 || p.x > W - 18) { p.dir *= -1; p.x = Math.min(W - 18, Math.max(18, p.x)); }
        break;
      case 'bulles':
        if (Math.random() < dt * 9) bulles.push({ x: p.x + p.dir * 9 * p.s, y: p.y - 56 * p.s, r: hasard(2, 5), v: hasard(30, 60) });
        break;
      case 'saut': case 'vol': {
        p.vy += G * dt; p.y += p.vy * dt; p.x += p.vx * dt;
        p.vx *= Math.pow(p.etat === 'vol' ? 0.55 : 0.8, dt);
        if (p.salto) p.rot += p.dir * dt * 7;
        if (p.etat === 'vol') p.rot += p.vx * dt * 0.012;
        if (p.x < 16 || p.x > W - 16) { p.vx *= -0.6; p.x = Math.min(W - 16, Math.max(16, p.x)); }
        if (p.y < 70 * p.s) { p.y = 70 * p.s; p.vy = Math.abs(p.vy) * 0.4; }
        if (p.y >= s) {
          p.y = s;
          if (p.etat === 'vol' && p.vy > 160) { p.vy *= -0.38; break; }
          if (p.etat === 'vol' || Math.abs(Math.sin(p.rot)) > 0.5) { p.rot = (p.vx >= 0 ? 1 : -1) * Math.PI / 2; changer(p, 'chute', 1.3); }
          else if (rangs && p.slot) { p.etat = 'rang'; p.t = 1e9; }
          else changer(p, 'marche', hasard(2, 5));
        }
        break;
      }
      case 'nage':
        p.phase += dt * 12;
        p.x += p.vx * dt;
        p.y += (p.cible - p.y) * Math.min(1, dt * 1.2);
        if (p.x < 30 || p.x > W - 30) { p.vx *= -1; p.dir *= -1; p.x = Math.min(W - 30, Math.max(30, p.x)); }
        if (Math.random() < dt * 2) bulles.push({ x: p.x, y: p.y - 30 * p.s, r: hasard(1.5, 3.5), v: hasard(30, 50) });
        if (p.t <= 0 || (rangs && p.slot)) { p.vy = 0; p.vx *= 0.4; p.etat = 'vol'; p.t = 9; }
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

  // Deux copains qui se croisent se tapent dans la main.
  function rencontres() {
    for (let i = 0; i < plongeurs.length; i++) {
      const a = plongeurs[i];
      if (a.etat !== 'marche' || a.cool > 0) continue;
      for (let j = i + 1; j < plongeurs.length; j++) {
        const b = plongeurs[j];
        if (b.etat !== 'marche' || b.cool > 0 || Math.abs(a.z - b.z) > 0.25) continue;
        if (Math.abs(a.x - b.x) < 24 && a.dir !== b.dir && Math.random() < 0.5) {
          a.dir = a.x < b.x ? 1 : -1; b.dir = -a.dir;
          changer(a, 'tope', 0.9); b.etat = 'tope'; b.t = 0.9;
          a.cool = b.cool = 6;
        }
      }
    }
  }

  // ---------- dessin d'un plongeur (regardant vers la droite) ----------
  function dessiner(p) {
    const s = p.s;
    if (p.cache) return;
    const marche = ['marche', 'attrape', 'nage', 'rang', 'sortie'].includes(p.etat);
    const jambe = marche ? Math.sin(p.phase) * (p.etat === 'attrape' ? 0.9 : 0.45) : 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    ctx.translate(0, -32); ctx.rotate(p.etat === 'nage' ? p.dir * Math.PI / 2.3 : p.rot); ctx.translate(0, 32);
    if (p.etat === 'danse') ctx.rotate(Math.sin(p.phase * 4) * 0.22);
    ctx.scale(p.dir, 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // Ombre
    if (!['nage', 'vol', 'saut', 'attrape'].includes(p.etat)) {
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
      const fx = hx + Math.sin(a) * L, fy = hy + Math.cos(a) * L;
      ctx.strokeStyle = couleur; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx, fy); ctx.stroke();
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
    ctx.strokeStyle = p.combi; ctx.lineWidth = 6;
    const mx = epaule[0] + Math.sin(bras) * 15, my = epaule[1] + Math.cos(bras) * 15;
    ctx.beginPath(); ctx.moveTo(...epaule); ctx.lineTo(mx, my); ctx.stroke();
    ctx.fillStyle = p.peau; ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill();

    // Tête, cheveux
    const hy = -60;
    if (p.genre === 'f') {           // queue de cheval qui flotte
      ctx.fillStyle = p.cheveux;
      ctx.beginPath(); ctx.ellipse(-12, hy + 1 + Math.sin(p.phase * 0.7) * 1.5, 7, 4, -0.5 + Math.sin(p.phase * 0.5) * 0.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = p.peau; ctx.beginPath(); ctx.arc(0, hy, 10.5, 0, Math.PI * 2); ctx.fill();
    if (!p.chauve) {
      ctx.fillStyle = p.cheveux;
      ctx.beginPath(); ctx.arc(-1, hy - 2, 10.8, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      if (p.genre === 'f') { ctx.beginPath(); ctx.arc(-6, hy - 1, 7, Math.PI * 0.6, Math.PI * 1.6); ctx.fill(); }
    }
    if (p.barbe) { ctx.fillStyle = p.cheveux; ctx.beginPath(); ctx.arc(2, hy + 5, 7.5, 0.1, Math.PI - 0.6); ctx.fill(); }
    // Masque et sangle
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(1, hy - 3); ctx.lineTo(-10, hy - 2); ctx.stroke();
    ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.roundRect(1, hy - 8, 12, 9, 3); ctx.fill();
    ctx.fillStyle = 'rgba(165,243,252,.9)'; ctx.beginPath(); ctx.roundRect(2.5, hy - 6.5, 9, 6, 2); ctx.fill();
    // Yeux : normaux, ou en croix quand ça secoue
    ctx.fillStyle = '#0f172a';
    if (['chute', 'vol', 'attrape'].includes(p.etat)) {
      ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.2;
      [[5, hy - 3.5], [9.5, hy - 3.5]].forEach(([ex, ey]) => { ctx.beginPath(); ctx.moveTo(ex - 1.5, ey - 1.5); ctx.lineTo(ex + 1.5, ey + 1.5); ctx.moveTo(ex + 1.5, ey - 1.5); ctx.lineTo(ex - 1.5, ey + 1.5); ctx.stroke(); });
    } else {
      [[5, hy - 3.5], [9.5, hy - 3.5]].forEach(([ex, ey]) => { ctx.beginPath(); ctx.arc(ex, ey, 1.3, 0, Math.PI * 2); ctx.fill(); });
    }
    // Détendeur en bouche
    ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(8, hy + 5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Le nom est posé après tout le monde (voir poserNoms) : il s'écarte
    // de ses voisins au lieu de les recouvrir.
    const auRang = p.etat === 'garde' || p.etat === 'rang';
    etiquettes.push({ x: p.x, y: p.etat === 'nage' ? p.y - 44 * s : p.y - 76 * s,
      nom: auRang ? (p.b.prenom || p.nom).split(' ')[0] : p.nom, fixe: auRang,
      couleur: COULEUR_GENRE[p.genre || ''], taille: auRang ? 10.5 : Math.round(11.5 * Math.min(1.15, s)) });
  }

  // Noms : bleu, rose, ou gris — droits, lisibles, sans se chevaucher.
  const etiquettes = [];
  function poserNoms() {
    const poses = [];
    etiquettes.sort((a, b) => b.y - a.y);
    for (const e of etiquettes) {
      ctx.font = `700 ${e.taille}px system-ui, sans-serif`;
      const l = ctx.measureText(e.nom).width + 6, h = e.taille + 3;
      let y = e.y;
      for (let k = 0; k < (e.fixe ? 0 : 6); k++) {
        const gene = poses.find(q => Math.abs(q.x - e.x) < (q.l + l) / 2 && Math.abs(q.y - y) < h);
        if (!gene) break;
        y = gene.y - h;
      }
      poses.push({ x: e.x, y, l });
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(255,255,255,.92)';
      ctx.strokeText(e.nom, e.x, y);
      ctx.fillStyle = e.couleur; ctx.fillText(e.nom, e.x, y);
    }
    etiquettes.length = 0;
  }

  function shade(hex, d) {
    const n = parseInt(hex.slice(1), 16);
    const c = v => Math.max(0, Math.min(255, v + d));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }

  // ---------- la boucle ----------
  let avant = performance.now();
  let tempsVague = 0;
  function image(t) {
    if (!boite.isConnected) return;           // on a quitté l'écran : fin
    requestAnimationFrame(image);
    if (document.hidden) { avant = t; return; }
    const dt = Math.min(0.05, (t - avant) / 1000);
    avant = t; tempsVague += dt;

    plongeurs.forEach(p => avancer(p, dt));
    rencontres();

    ctx.clearRect(0, 0, W, H);
    if (fond) ctx.drawImage(fond, 0, 0, W, H);
    // Surface qui ondule
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.beginPath(); ctx.moveTo(0, 0);
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, 10 + Math.sin(x / 30 + tempsVague * 2) * 4);
    ctx.lineTo(W, 0); ctx.closePath(); ctx.fill();
    // Algues
    ctx.strokeStyle = '#2f9e6a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const x = (i + 0.5) * W / 7 + 12, h = 50 + (i % 3) * 22;
      ctx.beginPath(); ctx.moveTo(x, sol + 8);
      ctx.quadraticCurveTo(x + Math.sin(tempsVague * 1.4 + i) * 14, sol - h / 2, x + Math.sin(tempsVague * 1.1 + i) * 10, sol - h);
      ctx.stroke();
    }
    // Poissons
    poissons.forEach(f => {
      f.x += f.v * dt;
      if (f.x > W + 20) f.x = -20; if (f.x < -20) f.x = W + 20;
      const d = Math.sign(f.v);
      ctx.fillStyle = f.c;
      ctx.beginPath(); ctx.ellipse(f.x, f.y + Math.sin(tempsVague * 2 + f.y) * 3, 8, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(f.x - d * 7, f.y); ctx.lineTo(f.x - d * 13, f.y - 4); ctx.lineTo(f.x - d * 13, f.y + 4); ctx.closePath(); ctx.fill();
    });
    // Plongeurs : ceux du fond d'abord
    [...plongeurs].sort((a, b) => (a.etat === 'attrape') - (b.etat === 'attrape') || a.z - b.z).forEach(dessiner);
    poserNoms();
    // Bulles
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.2;
    for (let i = bulles.length - 1; i >= 0; i--) {
      const u = bulles[i];
      u.y -= u.v * dt; u.x += Math.sin(u.y / 9) * 0.3;
      if (u.y < 12) { bulles.splice(i, 1); continue; }
      ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, Math.PI * 2); ctx.stroke();
    }
    // Emojis des bêtises
    ctx.textAlign = 'center'; ctx.font = '18px system-ui, sans-serif';
    for (let i = textes.length - 1; i >= 0; i--) {
      const e = textes[i];
      e.vie -= dt; e.y -= 14 * dt;
      if (e.vie <= 0) { textes.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, e.vie); ctx.fillText(e.txt, e.x, e.y); ctx.globalAlpha = 1;
    }
  }

  // ---------- le doigt ----------
  let prise = null;           // { p, dx, dy, x0, y0, t0, hist:[] }
  const position = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const sous = ({ x, y }) => [...plongeurs].filter(p => !p.cache).sort((a, b) => b.z - a.z).find(p => {
    const cy = p.etat === 'nage' ? p.y : p.y - 34 * p.s;
    return Math.hypot(x - p.x, y - cy) < 30 * p.s + 6;
  });

  canvas.addEventListener('pointerdown', e => {
    const pos = position(e);
    const p = sous(pos);
    if (!p) return;
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    prise = { p, dx: p.x - pos.x, dy: p.y - pos.y, x0: pos.x, y0: pos.y, t0: performance.now(), hist: [{ ...pos, t: performance.now() }], avant: p.etat };
  });
  canvas.addEventListener('pointermove', e => {
    if (!prise) return;
    const pos = position(e);
    const { p } = prise;
    if (p.etat !== 'attrape' && Math.hypot(pos.x - prise.x0, pos.y - prise.y0) > 8) {
      changer(p, 'attrape', 99); p.rot = 0;
    }
    if (p.etat === 'attrape') {
      p.x = Math.min(W - 12, Math.max(12, pos.x + prise.dx));
      p.y = Math.min(solDe(p), Math.max(70 * p.s, pos.y + prise.dy));
      p.dir = pos.x < prise.hist.at(-1).x ? -1 : pos.x > prise.hist.at(-1).x ? 1 : p.dir;
    }
    prise.hist.push({ ...pos, t: performance.now() });
    if (prise.hist.length > 6) prise.hist.shift();
  });
  const lacher = e => {
    if (!prise) return;
    const { p } = prise;
    const pos = position(e);
    const court = performance.now() - prise.t0 < 350 && Math.hypot(pos.x - prise.x0, pos.y - prise.y0) < 8;
    if (court && p.etat !== 'attrape') { prise = null; onTap(p.b); return; }
    // On le lance avec la vitesse du doigt.
    const a = prise.hist[0], b = prise.hist.at(-1);
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    p.vx = Math.max(-900, Math.min(900, (b.x - a.x) / dt));
    p.vy = Math.max(-900, Math.min(900, (b.y - a.y) / dt));
    p.etat = 'vol'; p.t = 9;
    if (Math.abs(p.vx) + Math.abs(p.vy) > 500) textes.push({ x: p.x, y: p.y - 80 * p.s, txt: '🌀', vie: 1.2 });
    prise = null;
  };
  canvas.addEventListener('pointerup', lacher);
  canvas.addEventListener('pointercancel', lacher);

  requestAnimationFrame(() => {
    dimensionner();
    plongeurs.forEach(p => { p.x = 20 + ((hash(p.b.id) % 1000) / 1000) * (W - 40); p.y = solDe(p); });
    avant = performance.now();
    requestAnimationFrame(image);
  });
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => dimensionner()).observe(boite);

  return boite;
}
