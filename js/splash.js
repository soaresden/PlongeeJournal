// ============================================================
//  L'écran d'ouverture
//
//  Au fond de l'eau, un plongeur assis sur un rocher feuillette son
//  carnet ; les copains, autour, l'écoutent. Le carnet devient une
//  tablette, on plonge dedans, et le titre s'écrit à la main :
//  « Mon journal de plongée », signé.
//
//  Environ 5 secondes ; un toucher passe. Mouvements réduits (réglage
//  d'accessibilité) : le titre seul, un instant.
// ============================================================

import { dessinerPlongeur, plongeurCartoon, MOI } from './views/plongeurverse.js';

const CLE_PRENOM = 'plongee-journal:prenom';
// Great Vibes (licence libre OFL), embarquée : pas besoin de réseau.
const MANUSCRIT = '"Great Vibes", "Snell Roundhand", "Segoe Script", "Dancing Script", cursive';
let policePrete = null;
function chargerPolice() {
  if (policePrete) return policePrete;
  try {
    const f = new FontFace('Great Vibes', 'url(./assets/great-vibes.woff2)');
    document.fonts.add(f);
    policePrete = f.load().catch(() => null);
  } catch { policePrete = Promise.resolve(null); }
  return policePrete;
}
const DUREE = 5.2;

/** Le prénom qui signe : retenu à la dernière ouverture. */
export function prenomSignature() {
  try {
    const p = localStorage.getItem(CLE_PRENOM);
    if (p) return p;
    const c = JSON.parse(localStorage.getItem('plongee-journal:miroir') || 'null');
    const moi = c?.divers?.find(d => d.id === c?.settings?.activeDiverId) || c?.divers?.[0];
    return moi?.prenom || '';
  } catch { return ''; }
}
export function retenirPrenom(prenom) { try { if (prenom) localStorage.setItem(CLE_PRENOM, prenom); } catch { /* privé */ } }

const doux = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const entre = (t, a, b) => doux((t - a) / (b - a));
const mix = (a, b, k) => a + (b - a) * k;

/**
 * Lance l'écran d'ouverture. Se retire tout seul.
 * @returns {Promise<void>} quand il a disparu
 */
export function ouvrirSplash({ signature = prenomSignature() } = {}) {
  // La signature peut arriver en route (un carnet partagé se charge pendant
  // l'animation) : on accepte une fonction, relue à chaque image.
  const signer = () => (typeof signature === 'function' ? signature() : signature) || '';
  return new Promise(resolve => {
    const voile = document.createElement('div');
    voile.id = 'splash';
    const canvas = document.createElement('canvas');
    const passer = document.createElement('div');
    passer.className = 'splash-passer';
    passer.textContent = 'Toucher pour passer';
    voile.append(canvas, passer);
    document.body.append(voile);
    const ctx = canvas.getContext('2d');
    if (!ctx) { voile.remove(); resolve(); return; }
    chargerPolice();

    let fini = false;
    const finir = () => {
      if (fini) return;
      fini = true;
      voile.classList.add('part');
      setTimeout(() => { voile.remove(); resolve(); }, 450);
    };
    voile.addEventListener('pointerdown', finir);

    let W = 0, H = 0;
    const dimensionner = () => {
      W = window.innerWidth; H = window.innerHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    dimensionner();
    window.addEventListener('resize', dimensionner);

    const reduit = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // ---------- la scène ----------
    const S = () => Math.max(1, Math.min(W, H * 0.75) / 300);
    const sol = () => H * 0.72;
    const lecteur = plongeurCartoon('lecteur', { ...MOI, assis: true });       // le lecteur, c'est moi (mon Mii)
    const auditoire = [
      plongeurCartoon('alison', { assis: true, genre: 'f', dir: 1 }),
      plongeurCartoon('marc', { assis: true, dir: 1, etat: 'coucou' }),
      plongeurCartoon('julie', { assis: true, genre: 'f', dir: -1 }),
      plongeurCartoon('paul', { assis: true, dir: -1 }),
      plongeurCartoon('lea', { genre: 'f', dir: -1 }),
      plongeurCartoon('tom', { dir: 1 }),
    ];
    const bulles = [];
    const poissons = [0, 1, 2].map(i => ({ x: Math.random(), y: 0.15 + i * 0.14, v: (0.03 + Math.random() * 0.03) * (i % 2 ? -1 : 1), c: ['#fbbf24', '#fb7185', '#38bdf8'][i] }));

    function placer(t) {
      const s = S(), y0 = sol();
      const cx = W / 2;
      lecteur.s = s * 1.25; lecteur.x = cx - 12 * s; lecteur.y = y0 - 22 * s; lecteur.dir = 1;
      lecteur.bras = Math.PI / 2 - 0.25; lecteur.phase = t * 2;
      const places = [[-0.36, 0, 0.95], [-0.2, 0.06, 1.05], [0.22, 0.06, 1.05], [0.36, 0, 0.95], [0.3, -0.07, 0.85], [-0.3, -0.07, 0.85]];
      auditoire.forEach((p, i) => {
        const [dx, dy, k] = places[i];
        p.s = s * k; p.x = cx + dx * Math.min(W, 520); p.y = y0 + dy * 120 * s / 1.6 + (p.assis ? 4 : 0);
        p.phase = t * 3 + i;
        p.bras = p.etat === 'coucou' ? undefined : (p.assis ? 0.6 : 0.2);
      });
      return { s, cx, y0 };
    }

    function fond(t) {
      const eau = ctx.createLinearGradient(0, 0, 0, H);
      eau.addColorStop(0, '#5fd3f3'); eau.addColorStop(0.5, '#1b8fc4'); eau.addColorStop(1, '#0b3b63');
      ctx.fillStyle = eau; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.1; ctx.fillStyle = '#fff';
      for (let i = 0; i < 6; i++) {
        const x = (i + 0.3) * W / 6 + Math.sin(t + i) * 10;
        ctx.beginPath(); ctx.moveTo(x - 16, 0); ctx.lineTo(x + 16, 0); ctx.lineTo(x + 80, sol()); ctx.lineTo(x + 24, sol()); ctx.fill();
      }
      ctx.globalAlpha = 1;
      const sable = ctx.createLinearGradient(0, sol(), 0, H);
      sable.addColorStop(0, '#e8d3a2'); sable.addColorStop(1, '#c9a96b');
      ctx.fillStyle = sable;
      ctx.beginPath(); ctx.moveTo(0, sol());
      for (let x = 0; x <= W; x += 24) ctx.quadraticCurveTo(x + 12, sol() - 5, x + 24, sol());
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
      // Algues
      ctx.strokeStyle = '#2f9e6a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      [0.06, 0.14, 0.88, 0.95].forEach((f, i) => {
        const x = f * W, h = 70 + i * 18;
        ctx.beginPath(); ctx.moveTo(x, sol() + 4);
        ctx.quadraticCurveTo(x + Math.sin(t * 1.5 + i) * 14, sol() - h / 2, x + Math.sin(t * 1.2 + i) * 10, sol() - h); ctx.stroke();
      });
      poissons.forEach(f => {
        const x = ((f.x + f.v * t) % 1 + 1) % 1 * W, y = f.y * H, d = Math.sign(f.v);
        ctx.fillStyle = f.c;
        ctx.beginPath(); ctx.ellipse(x, y, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - d * 8, y); ctx.lineTo(x - d * 15, y - 5); ctx.lineTo(x - d * 15, y + 5); ctx.fill();
      });
    }

    /** Le carnet ouvert (k = 0) qui devient une tablette (k = 1). */
    function carnet(bx, by, s, t, k) {
      const w = mix(36, 52, k) * s, h = mix(25, 36, k) * s;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(mix(-0.12, 0, k));
      // Lueur de l'écran
      if (k > 0) {
        ctx.shadowColor = `rgba(34,211,238,${0.8 * k})`; ctx.shadowBlur = 24 * k * s;
      }
      // Couverture → coque
      ctx.fillStyle = k < 0.5 ? '#7c4a1e' : '#0f172a';
      ctx.beginPath(); ctx.roundRect(-w / 2 - 2 * s, -h / 2 - 2 * s, w + 4 * s, h + 4 * s, mix(2, 5, k) * s); ctx.fill();
      ctx.shadowBlur = 0;
      // Pages → écran
      const page = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      page.addColorStop(0, mixCouleur('#fdf6e3', '#0e7490', k)); page.addColorStop(1, mixCouleur('#f3e7c9', '#22d3ee', k));
      ctx.fillStyle = page;
      ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, mix(1, 3, k) * s); ctx.fill();
      if (k < 1) {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#8b6a3a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, -h / 2); ctx.lineTo(0, h / 2); ctx.stroke();       // la reliure
        ctx.strokeStyle = 'rgba(60,90,140,.5)';
        for (let i = 1; i < 6; i++) {
          const ly = -h / 2 + i * h / 6;
          ctx.beginPath(); ctx.moveTo(-w / 2 + 3 * s, ly); ctx.lineTo(-3 * s, ly); ctx.moveTo(3 * s, ly); ctx.lineTo(w / 2 - 3 * s, ly); ctx.stroke();
        }
        // Une page qui tourne
        const f = (t * 1.6) % 1, a = Math.cos(f * Math.PI);
        ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = 'rgba(0,0,0,.15)';
        ctx.beginPath(); ctx.rect(0, -h / 2, (w / 2) * a, h); ctx.fill(); ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        // Une petite vague sur l'écran
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5 * s / 2;
        ctx.beginPath();
        for (let x = -w / 2 + 4 * s; x <= w / 2 - 4 * s; x += 2) ctx.lineTo(x, Math.sin(x / (4 * s) + t * 4) * 2 * s);
        ctx.stroke();
      }
      ctx.restore();
      return { w, h };
    }

    function mixCouleur(a, b, k) {
      const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
      const c = sh => Math.round(mix((pa >> sh) & 255, (pb >> sh) & 255, k));
      return `rgb(${c(16)},${c(8)},${c(0)})`;
    }

    // ---------- le titre, écrit à la main ----------
    function titre(t, alpha) {
      const taille = Math.min(W * 0.16, 84);
      const ligne1 = 'Mon journal', ligne2 = 'de plongée';
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `${taille}px ${MANUSCRIT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const l1 = ctx.measureText(ligne1).width, l2 = ctx.measureText(ligne2).width;
      const y1 = H * 0.42, y2 = y1 + taille * 1.05;
      // L'encre avance de gauche à droite, ligne après ligne.
      const ecrire = (texte, y, larg, debut) => {
        const k = entre(t, debut, debut + 0.75);
        if (k <= 0) return;
        ctx.save();
        ctx.beginPath(); ctx.rect(W / 2 - larg / 2 - 40, y - taille * 1.4, larg * k + 50, taille * 2.8); ctx.clip();
        ctx.shadowColor = 'rgba(34,211,238,.9)'; ctx.shadowBlur = 18;
        ctx.fillStyle = '#ffffff'; ctx.fillText(texte, W / 2, y);
        ctx.restore();
        // La plume
        if (k < 1) {
          ctx.fillStyle = 'rgba(255,255,255,.9)';
          ctx.beginPath(); ctx.arc(W / 2 - larg / 2 + larg * k, y + taille * 0.25, 2.5, 0, Math.PI * 2); ctx.fill();
        }
      };
      ecrire(ligne1, y1, l1, 3.05);
      ecrire(ligne2, y2, l2, 3.6);
      const nom = signer();
      if (nom) {
        const k = entre(t, 4.25, 4.75);
        ctx.globalAlpha = alpha * k;
        ctx.font = `${Math.round(taille * 0.55)}px ${MANUSCRIT}`;
        ctx.textAlign = 'right';
        ctx.fillStyle = '#a5f3fc';
        ctx.fillText(`— ${nom}`, W / 2 + Math.max(l1, l2) / 2, y2 + taille * 0.95);
      }
      ctx.restore();
    }

    // ---------- la boucle ----------
    const debut = performance.now();
    function image(maintenant) {
      if (fini && !voile.isConnected) return;
      const t = (maintenant - debut) / 1000;
      if (reduit) {
        ctx.fillStyle = '#0b3b63'; ctx.fillRect(0, 0, W, H);
        titre(10, 1);
        if (t > 1.4) finir();
        if (!fini) requestAnimationFrame(image);
        return;
      }
      const { s, cx, y0 } = placer(t);
      // Le carnet, dans les mains du lecteur
      const bx = lecteur.x + 26 * lecteur.s, by = lecteur.y - 34 * lecteur.s;
      const morph = entre(t, 1.5, 2.3);
      const zoom = entre(t, 2.2, 3.1);
      // Caméra : on plonge dans la tablette.
      const tw = 52 * s, th = 36 * s;
      const Z = mix(1, Math.min(W * 0.92 / tw, H * 0.62 / th), zoom);
      ctx.save();
      ctx.translate(W / 2, H / 2); ctx.scale(Z, Z); ctx.translate(-mix(W / 2, bx, zoom), -mix(H / 2, by, zoom));
      fond(t);
      // Rocher
      ctx.fillStyle = '#35607a';
      ctx.beginPath(); ctx.ellipse(lecteur.x, y0 - 6 * s, 30 * s, 22 * s, 0, Math.PI, 0); ctx.fill();
      ctx.fillRect(lecteur.x - 30 * s, y0 - 6 * s, 60 * s, 8 * s);
      [...auditoire].filter(p => p.y < y0).forEach(p => dessinerPlongeur(ctx, p));
      dessinerPlongeur(ctx, lecteur);
      carnet(bx, by, lecteur.s, t, morph);
      [...auditoire].filter(p => p.y >= y0).forEach(p => dessinerPlongeur(ctx, p));
      // Bulles des détendeurs
      if (Math.random() < 0.3) {
        const p = [lecteur, ...auditoire][Math.floor(Math.random() * (auditoire.length + 1))];
        bulles.push({ x: p.x + p.dir * 8 * p.s, y: p.y - (p.assis ? 41 : 60) * p.s, r: 2 + Math.random() * 3, v: 30 + Math.random() * 30 });
      }
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.2;
      for (let i = bulles.length - 1; i >= 0; i--) {
        const u = bulles[i]; u.y -= u.v / 60; u.x += Math.sin(u.y / 9) * 0.3;
        if (u.y < 0) { bulles.splice(i, 1); continue; }
        ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, Math.PI * 2); ctx.stroke();
      }
      // Étincelles quand le carnet change
      if (morph > 0 && morph < 1) {
        ctx.fillStyle = '#fef9c3';
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4 + t * 3, r = (20 + morph * 18) * s;
          ctx.globalAlpha = 1 - morph;
          ctx.beginPath(); ctx.arc(bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.7, 2 * s / 2 + 1, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      // Une fois dans la tablette : l'écran plein, le titre s'écrit.
      if (zoom > 0.85) {
        const k = entre(t, 2.9, 3.2);
        const ecran = ctx.createLinearGradient(0, 0, 0, H);
        ecran.addColorStop(0, `rgba(14,116,144,${k})`); ecran.addColorStop(1, `rgba(8,47,73,${k})`);
        ctx.fillStyle = ecran; ctx.fillRect(0, 0, W, H);
        // Quelques bulles derrière le titre, comme sur l'écran de la tablette
        ctx.strokeStyle = `rgba(255,255,255,${0.35 * k})`; ctx.lineWidth = 1.2;
        for (let i = 0; i < 9; i++) {
          const x = (i * 97 % W), y = H - ((t * 40 + i * 83) % H);
          ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2); ctx.stroke();
        }
        titre(t, k);
        // Le bord de la tablette, tout autour : on est dedans.
        ctx.save();
        ctx.globalAlpha = k;
        ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 22;
        ctx.beginPath(); ctx.roundRect(5, 5, W - 10, H - 10, 34); ctx.stroke();
        ctx.strokeStyle = 'rgba(34,211,238,.5)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(16, 16, W - 32, H - 32, 26); ctx.stroke();
        ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(W / 2, 11, 3, 0, Math.PI * 2); ctx.fill();   // la caméra
        ctx.restore();
      }
      if (t > DUREE) finir();
      if (!fini) requestAnimationFrame(image);
    }
    requestAnimationFrame(image);
  });
}
