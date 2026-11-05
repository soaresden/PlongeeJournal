// ============================================================
//  Photo du carnet papier : prise, rognage, visionneuse
//
//  Le parcours :
//   1. on photographie la page (ou on choisit une image) ;
//   2. on rogne la partie de CETTE plongée — une page en porte
//      souvent deux ou plus ;
//   3. l'image reste à côté du formulaire, zoomable, pendant
//      qu'on recopie les champs.
//
//  La photo est facultative et s'ajoute aussi après coup.
// ============================================================

import { el, toast, openModal } from '../lib.js';
import * as photos from '../photos.js';

const CLE_DOCK = 'plongee-journal:dock-carnet';

// ------------------------------------------------------------
//  Visionneuse zoomable : pincer, glisser, molette, double-tap
// ------------------------------------------------------------

/**
 * @param {string} src  data-URL de l'image
 * @returns {HTMLElement} un cadre à dimensionner par le parent
 */
export function visionneuse(src, { plein = false } = {}) {
  const img = el('img.zoom-img', { src, alt: 'Page du carnet papier', draggable: 'false' });
  const scene = el('div.zoom-scene', {}, img);
  const boite = el('div.zoom' + (plein ? '.plein' : ''), {}, scene);

  let base = { l: 0, h: 0 };          // image ajustée à la scène, sans zoom
  let s = 1, tx = 0, ty = 0;

  const appliquer = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`; };

  // L'image ne doit jamais quitter la scène : centrée tant qu'elle est
  // plus petite, bord à bord dès qu'elle déborde.
  const borner = () => {
    const L = scene.clientWidth, H = scene.clientHeight;
    const l = base.l * s, h = base.h * s;
    tx = l <= L ? (L - l) / 2 : Math.min(0, Math.max(L - l, tx));
    ty = h <= H ? (H - h) / 2 : Math.min(0, Math.max(H - h, ty));
  };

  const ajuster = () => {
    const L = scene.clientWidth, H = scene.clientHeight;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (!L || !H || !iw || !ih) return;
    const r = Math.min(L / iw, H / ih);
    base = { l: iw * r, h: ih * r };
    img.style.width = `${base.l}px`;
    img.style.height = `${base.h}px`;
    borner(); appliquer();
  };

  /** Zoome autour d'un point de la scène (le doigt, le curseur). */
  const zoomer = (ns, px, py) => {
    ns = Math.min(8, Math.max(1, ns));
    tx = px - (px - tx) * (ns / s);
    ty = py - (py - ty) * (ns / s);
    s = ns;
    borner(); appliquer();
  };

  const centre = () => ({ x: scene.clientWidth / 2, y: scene.clientHeight / 2 });
  const local = e => {
    const r = scene.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const doigts = new Map();
  let geste = null;
  let dernierTap = 0;

  scene.addEventListener('pointerdown', e => {
    try { scene.setPointerCapture?.(e.pointerId); } catch { /* doigt déjà levé */ }
    doigts.set(e.pointerId, local(e));
    const pts = [...doigts.values()];
    if (pts.length === 2) {
      const [a, b] = pts;
      geste = { pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s,
        m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    } else if (pts.length === 1) {
      geste = { p: pts[0], tx, ty };
      const t = Date.now();
      if (t - dernierTap < 300) {
        // Double-tap : zoom sur le point touché, ou retour à l'ensemble.
        zoomer(s > 1.2 ? 1 : 2.5, pts[0].x, pts[0].y);
        dernierTap = 0;
      } else dernierTap = t;
    }
  });

  scene.addEventListener('pointermove', e => {
    if (!doigts.has(e.pointerId)) return;
    doigts.set(e.pointerId, local(e));
    const pts = [...doigts.values()];
    if (geste?.pinch && pts.length >= 2) {
      const [a, b] = pts;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomer(geste.s * d / geste.d, geste.m.x, geste.m.y);
    } else if (geste && !geste.pinch && pts.length === 1) {
      tx = geste.tx + (pts[0].x - geste.p.x);
      ty = geste.ty + (pts[0].y - geste.p.y);
      borner(); appliquer();
    }
  });

  const lacher = e => {
    doigts.delete(e.pointerId);
    const pts = [...doigts.values()];
    // Un doigt reste après un pincement : il reprend le déplacement.
    geste = pts.length === 1 ? { p: pts[0], tx, ty } : null;
  };
  scene.addEventListener('pointerup', lacher);
  scene.addEventListener('pointercancel', lacher);

  scene.addEventListener('wheel', e => {
    e.preventDefault();
    const p = local(e);
    zoomer(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), p.x, p.y);
  }, { passive: false });

  const bouton = (texte, titre, fn) => el('button.zoom-btn', { type: 'button', text: texte, title: titre,
    'aria-label': titre, onclick: e => { e.stopPropagation(); fn(); } });

  boite.append(el('div.zoom-outils', {},
    bouton('−', 'Dézoomer', () => { const c = centre(); zoomer(s / 1.4, c.x, c.y); }),
    bouton('+', 'Zoomer', () => { const c = centre(); zoomer(s * 1.4, c.x, c.y); }),
    bouton('⤢', 'Voir en entier', () => { s = 1; borner(); appliquer(); }),
    plein ? null : bouton('⛶', 'Plein écran', () => pleinEcran(src)),
  ));

  img.addEventListener('load', ajuster);
  if (img.complete) requestAnimationFrame(ajuster);
  if (typeof ResizeObserver === 'function') new ResizeObserver(ajuster).observe(scene);
  else window.addEventListener('resize', ajuster);

  return boite;
}

/** La photo seule, sur tout l'écran. */
export function pleinEcran(src) {
  const root = document.getElementById('modalRoot');
  const fermer = () => { couche.remove(); document.removeEventListener('keydown', clavier); };
  const clavier = e => { if (e.key === 'Escape') fermer(); };
  const couche = el('div.zoom-couche', {},
    visionneuse(src, { plein: true }),
    el('button.zoom-fermer', { type: 'button', text: '×', 'aria-label': 'Fermer', onclick: fermer }));
  document.addEventListener('keydown', clavier);
  root.append(couche);
  return fermer;
}

// ------------------------------------------------------------
//  Rognage de la page
// ------------------------------------------------------------

/**
 * Ouvre l'écran de rognage sur une page photographiée.
 * @param {string} page  data-URL de la page entière
 * @param {(r:{dataUrl:string,l:number,h:number,page:string}) => void} onValider
 */
export async function ouvrirRognage(page, onValider) {
  let img;
  try { img = await photos.chargerImage(page); }
  catch (e) { return toast(e.message, true); }

  // Pas de cadre imposé : la page entière, à réduire au doigt.
  let cadre = { ...photos.CADRES.page.cadre };

  openModal(close => {
    const photo = el('img.crop-photo', { src: img.src, alt: 'Page photographiée', draggable: 'false' });
    const rect = el('div.crop-rect.poignees', {},
      ['no', 'ne', 'so', 'se'].map(c => el(`span.crop-coin.${c}`)));
    const scene = el('div.crop-scene.page', {}, photo, rect);
    const taille = el('span.hint', { style: { margin: 0 } });

    const placer = () => {
      rect.style.left = `${cadre.x * 100}%`;
      rect.style.top = `${cadre.y * 100}%`;
      rect.style.width = `${cadre.w * 100}%`;
      rect.style.height = `${cadre.h * 100}%`;
      const l = Math.round(cadre.w * img.naturalWidth), h = Math.round(cadre.h * img.naturalHeight);
      taille.textContent = `${l} × ${h} px`;
      raccourcis.querySelectorAll('.chip').forEach(b => {
        const c = photos.CADRES[b.dataset.cadre].cadre;
        b.classList.toggle('on', ['x', 'y', 'w', 'h'].every(k => Math.abs(c[k] - cadre[k]) < 0.002));
      });
    };

    const raccourcis = el('div.chips.crop-raccourcis', {},
      Object.entries(photos.CADRES).map(([id, c]) => el('button.chip', {
        type: 'button', text: c.label, 'data-cadre': id,
        onclick: () => { cadre = { ...c.cadre }; placer(); },
      })));

    // Geste : un coin le redimensionne, l'intérieur le déplace,
    // ailleurs on trace un nouveau cadre.
    const position = e => {
      const r = scene.getBoundingClientRect();
      return {
        x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      };
    };
    let geste = null;
    scene.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { scene.setPointerCapture?.(e.pointerId); } catch { /* doigt déjà levé */ }
      const r = scene.getBoundingClientRect();
      const p = position(e);
      // Tolérance : environ 28 px autour d'un coin, quelle que soit la taille.
      const prise = photos.priseSous(cadre, p, 28 / (r.width || 1), 28 / (r.height || 1));
      geste = { prise, depart: p, initial: { ...cadre } };
    });
    scene.addEventListener('pointermove', e => {
      if (!geste) return;
      e.preventDefault();
      cadre = photos.ajusterCadre(geste.initial, geste.prise, geste.depart, position(e));
      placer();
    });
    const fin = e => {
      if (!geste) return;
      // Le point où le doigt se lève compte aussi.
      if (e?.type === 'pointerup') cadre = photos.ajusterCadre(geste.initial, geste.prise, geste.depart, position(e));
      // Un simple toucher hors du cadre ne doit pas l'effacer.
      if (cadre.w < 0.04 || cadre.h < 0.04) cadre = geste.initial;
      geste = null;
      placer();
    };
    scene.addEventListener('pointerup', fin);
    scene.addEventListener('pointercancel', fin);

    const pivoterBtn = el('button.btn.ghost.sm', { type: 'button', text: '↻ Pivoter',
      onclick: async () => {
        try {
          page = photos.pivoter(img);
          img = await photos.chargerImage(page);
          photo.src = img.src;
          // Le cadre suit la rotation (quart de tour horaire).
          cadre = { x: 1 - cadre.y - cadre.h, y: cadre.x, w: cadre.h, h: cadre.w };
          placer();
        } catch (e) { toast(e.message, true); }
      } });

    placer();

    return el('div.rognage', {},
      el('h3', { text: '✂️ La partie de cette plongée' }),
      el('div.hint', { style: { marginTop: 0 },
        text: 'Trace au doigt le cadre de la plongée sur la page, ou tire ses coins. '
            + 'Les raccourcis servent aux carnets à deux plongées par page.' }),
      raccourcis,
      scene,
      el('div.crop-pied', {}, pivoterBtn, taille),
      el('div.btn-row', {},
        el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }),
        el('button.btn.primary', { type: 'button', text: 'Garder cette partie',
          onclick: () => {
            try {
              const r = photos.recadrer(img, cadre);
              close();
              onValider({ ...r, page });
            } catch (e) { toast(e.message, true); }
          } }),
      ),
    );
  });
}

/** Lit une image choisie ou photographiée, la réduit, puis ouvre le rognage. */
async function depuisFichier(fichier, onValider) {
  if (!fichier) return;
  if (fichier.type && !/^image\//.test(fichier.type)) return toast('Ce fichier n’est pas une image', true);
  try {
    toast('Préparation de la photo…');
    const img = await photos.chargerImage(fichier);
    const page = photos.reduire(img);
    await ouvrirRognage(page, onValider);
  } catch (e) { toast(e.message || 'Photo illisible', true); }
}

// ------------------------------------------------------------
//  Dans le formulaire de plongée
// ------------------------------------------------------------

const ETATS = {
  envoyee: '☁️ Rangée dans ton dépôt GitHub',
  attente: '⏳ Sur cet appareil — envoi vers GitHub au retour du réseau',
  locale:  '📱 Sur cet appareil (mode local, sans GitHub)',
  nouvelle: '✎ Sera rangée à l’enregistrement de la plongée',
};

/**
 * Bloc « Page du carnet papier » + panneau qui la garde à côté des champs.
 *
 * Rien n'est écrit tant que la plongée n'est pas enregistrée : on
 * peut annuler le formulaire sans laisser de photo orpheline.
 *
 * @returns {{ bloc, envelopper, avantEnregistrement, apresEnregistrement }}
 *   `envelopper(form)` place le formulaire et le panneau côte à côte.
 */
export function photoCarnetFormulaire(dive) {
  const dejaEnregistree = dive.photoCarnet?.ref || null;
  let nouvelle = null;              // { ref, dataUrl } pas encore rangée
  const aOublier = new Set();       // références à retirer après l'enregistrement
  let image = null;                 // data-URL affichée

  const corps = el('div.carnet-photo');
  const dock = el('aside.carnet-dock', { hidden: true, 'aria-label': 'Page du carnet papier' });
  const dockCorps = el('div.carnet-dock-corps');
  const ouvrirDockBtn = el('button.carnet-dock-pastille', { type: 'button', hidden: true,
    title: 'Voir la page du carnet', 'aria-label': 'Voir la page du carnet', text: '📓 Carnet' });

  const enveloppe = el('div.form-carnet');
  let dockOuvert = (() => { try { return localStorage.getItem(CLE_DOCK) !== 'ferme'; } catch { return true; } })();
  const majDock = () => {
    const visible = !!image;
    dock.hidden = !visible || !dockOuvert;
    ouvrirDockBtn.hidden = !visible || dockOuvert;
    // Sur téléphone, le panneau couvre le bas de l'écran : le formulaire
    // gagne autant de marge, pour que ses derniers champs restent atteignables.
    enveloppe.classList.toggle('dock-ouvert', visible && dockOuvert);
  };
  const basculerDock = ouvert => {
    dockOuvert = ouvert;
    try { localStorage.setItem(CLE_DOCK, ouvert ? 'ouvert' : 'ferme'); } catch { /* privé */ }
    majDock();
  };
  ouvrirDockBtn.onclick = () => basculerDock(true);
  dock.append(
    el('div.carnet-dock-tete', {},
      el('span', { text: '📓 Page du carnet' }),
      el('button.zoom-btn', { type: 'button', text: '▾', title: 'Réduire', 'aria-label': 'Réduire',
        onclick: () => basculerDock(false) })),
    dockCorps);

  const choisir = capture => {
    const champ = el('input', { type: 'file', accept: 'image/*', hidden: true,
      ...(capture ? { capture: 'environment' } : {}) });
    champ.onchange = () => { depuisFichier(champ.files?.[0], valider); champ.remove(); };
    document.body.append(champ);
    champ.click();
  };

  function valider({ dataUrl, l, h, page }) {
    // Une photo pas encore rangée est simplement abandonnée ; celle qui
    // était déjà enregistrée partira une fois la plongée enregistrée.
    if (dejaEnregistree) aOublier.add(dejaEnregistree);
    nouvelle = { ref: photos.nouvelleRef(dive.id), dataUrl };
    dive.photoCarnet = { ref: nouvelle.ref, l, h, le: new Date().toISOString() };
    image = dataUrl;
    photos.garderDernierePage(page);
    toast(`Photo prête (${Math.round(photos.poids(dataUrl) / 1024)} ko) — elle sera rangée avec la plongée`);
    rendre();
  }

  function retirer() {
    if (dejaEnregistree) aOublier.add(dejaEnregistree);
    nouvelle = null;
    dive.photoCarnet = null;
    image = null;
    rendre();
  }

  async function rendre() {
    corps.replaceChildren();
    dockCorps.replaceChildren();

    const boutons = el('div.btn-row.carnet-photo-actions', {},
      el('button.btn.primary', { type: 'button', text: image ? '📷 Reprendre' : '📷 Photographier la page',
        onclick: () => choisir(true) }),
      el('button.btn.ghost', { type: 'button', text: '🖼 Choisir une image', onclick: () => choisir(false) }));

    // Une page porte souvent plusieurs plongées : on repart de la même.
    const derniere = await photos.dernierePage();
    if (derniere) {
      const quand = new Date(derniere.date);
      const jour = isNaN(quand) ? '' : ` (${quand.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })})`;
      boutons.append(el('button.btn.ghost', { type: 'button', text: `↺ Même page${jour}`,
        title: 'Rogner une autre partie de la dernière page photographiée',
        onclick: () => ouvrirRognage(derniere.dataUrl, valider) }));
    }

    if (!dive.photoCarnet?.ref) {
      corps.append(
        el('div.hint', { style: { marginTop: 0 },
          text: 'Facultatif : photographie la page de ton carnet papier, garde la partie de cette plongée, '
              + 'et recopie les champs en la regardant. Tu peux aussi l’ajouter plus tard.' }),
        boutons);
      majDock();
      return;
    }

    if (!image) {
      corps.append(el('div.hint', { style: { marginTop: 0 }, text: 'Chargement de la photo…' }));
      try { image = await photos.lirePhoto(dive.photoCarnet.ref); }
      catch (e) { corps.replaceChildren(el('div.hint', { text: `Photo injoignable : ${e.message}` }), boutons); majDock(); return; }
      if (!image) {
        corps.replaceChildren(
          el('div.hint', { style: { marginTop: 0 },
            text: 'La photo n’est pas encore arrivée sur GitHub : l’appareil qui l’a prise ne l’a pas encore envoyée.' }),
          boutons,
          el('button.btn.ghost.sm', { type: 'button', text: 'Retirer la photo', onclick: retirer }));
        majDock();
        return;
      }
      corps.replaceChildren();
    }

    const etat = nouvelle ? 'nouvelle' : photos.etatPhoto(dive.photoCarnet.ref);
    corps.append(
      el('button.carnet-vignette', { type: 'button', title: 'Agrandir', onclick: () => pleinEcran(image) },
        el('img', { src: image, alt: 'Page du carnet papier' })),
      el('div.hint', { text: ETATS[etat] }),
      boutons,
      el('button.btn.ghost.sm', { type: 'button', text: '🗑 Retirer la photo', onclick: retirer }));
    dockCorps.append(visionneuse(image));
    majDock();
  }

  rendre();

  return {
    bloc: corps,
    envelopper(form) {
      enveloppe.replaceChildren(form, el('div.carnet-dock-place', {}, dock, ouvrirDockBtn));
      return enveloppe;
    },
    /** À appeler juste avant d'enregistrer la plongée. */
    async avantEnregistrement() {
      if (nouvelle && dive.photoCarnet?.ref === nouvelle.ref) {
        await photos.enregistrerPhoto(nouvelle.ref, nouvelle.dataUrl);
        nouvelle = null;
      }
    },
    /** Après l'enregistrement : les anciennes photos s'en vont. */
    async apresEnregistrement() {
      for (const ref of aOublier) if (ref !== dive.photoCarnet?.ref) await photos.oublierPhoto(ref);
      aOublier.clear();
    },
  };
}

// ------------------------------------------------------------
//  Sur la fiche de la plongée
// ------------------------------------------------------------

/** Vignette de la page du carnet ; un toucher l'ouvre en plein écran. */
export function photoCarnetFiche(dive) {
  if (!dive.photoCarnet?.ref) return null;
  const corps = el('div.card.carnet-fiche', {}, el('div.hint', { style: { margin: 0 }, text: 'Chargement…' }));
  photos.lirePhoto(dive.photoCarnet.ref)
    .then(src => {
      corps.replaceChildren(src
        ? el('button.carnet-vignette', { type: 'button', title: 'Agrandir', onclick: () => pleinEcran(src) },
            el('img', { src, alt: 'Page du carnet papier' }))
        : el('div.hint', { style: { margin: 0 }, text: 'Photo pas encore envoyée par l’appareil qui l’a prise.' }));
    })
    .catch(e => corps.replaceChildren(el('div.hint', { style: { margin: 0 }, text: `Photo injoignable : ${e.message}` })));
  return el('div.section', {}, el('h2', { text: '📓 Page du carnet papier' }), corps);
}
