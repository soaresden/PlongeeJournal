// ============================================================
//  Écrans des vidéos pCloud : réglage du lien, vidéos d'une plongée,
//  lecteur, choix d'un dossier à la main.
// ============================================================

import { el, toast, openModal, fmtDate } from '../lib.js';
import { store, typeSeance } from '../store.js';
import { lirePublink, chargerDossiers, videosDePlongee, urlMiniature, urlLecture, lienDossier,
         dossiersLies, avecDossier, sansDossier, fichiersEnCache, luA, urlTelechargement, imageFigee } from '../videos.js';
import { onglets } from '../onglets.js';

/** Le lien enregistré dans les réglages, prêt pour l'API. */
export async function configVideos() {
  const r = await store.getSettings();
  return r.videos?.lien ? lirePublink(r.videos.lien) : null;
}

/** Les dossiers mis de côté (test caméra…) : { folderid: libellé }. */
export async function autresVideos() {
  const r = await store.getSettings();
  return r.videos?.autres || {};
}

/** Les fichiers assignés un à un dans l'assistant : { fileid: id de la sortie | '' (aucune) }. */
export async function affectationsVideos() {
  const r = await store.getSettings();
  return r.videos?.affectations || {};
}

/** Tout ce que videosDePlongee doit savoir (dossiers mis de côté, assignations, fichiers à plat). */
export async function optionsVideos(cfg) {
  const r = await store.getSettings();
  return { autres: r.videos?.autres || {}, affectations: r.videos?.affectations || {}, fichiers: cfg ? fichiersEnCache(cfg) : [] };
}

/** Enregistre des assignations (null : on revient à la proposition). */
async function sauverAffectations(patch) {
  const r = await store.getSettings();
  const v = { ...(r.videos || {}) };
  const a = { ...(v.affectations || {}) };
  for (const [k, x] of Object.entries(patch)) { if (x == null) delete a[k]; else a[k] = String(x); }
  v.affectations = a;
  await store.saveSettings({ videos: v });
}

/** Plongées et séances du carnet, pour relier les dossiers. */
async function sorties() {
  const diverId = await store.getActiveDiverId();
  const [dives, seances] = await Promise.all([store.listDives(diverId), store.listSeances(diverId)]);
  const marquees = seances.map(x => ({ ...x, seance: true }));
  return { dives, seances: marquees, toutes: [...dives, ...marquees] };
}

// ------------------------------------------------------------
//  Réglages
// ------------------------------------------------------------

export async function carteVideosReglages() {
  const carte = el('div.card');
  const rendre = async () => {
    const cfg = await configVideos();
    const champ = el('input', { type: 'url', placeholder: 'https://e.pcloud.link/publink/show?code=…', value: cfg?.lien || '' });
    const etat = el('div.hint');
    const tester = async (forcer = true) => {
      const c = lirePublink(champ.value);
      if (!c) { etat.textContent = 'Ce n’est pas un lien public pCloud (il doit contenir « code= »).'; return null; }
      etat.textContent = 'Lecture du dossier pCloud…';
      try {
        const dossiers = await chargerDossiers(c, { forcer });
        const { toutes } = await sorties();
        const opts = await optionsVideos(c);
        const lies = toutes.filter(d => videosDePlongee(d, dossiers, toutes, opts)).length;
        etat.textContent = dossiers.length
          ? `✓ ${dossiers.length} dossier${dossiers.length > 1 ? 's' : ''} daté${dossiers.length > 1 ? 's' : ''}, du ${fmtDate(dossiers[0].date)} au ${fmtDate(dossiers.at(-1).date)} · ${lies} plongée${lies > 1 ? 's' : ''} ou séance${lies > 1 ? 's' : ''} avec des vidéos.`
          : 'Lien lu, mais aucun dossier avec une date dans son nom (ex. « 2026-08-30 Cap Vert »).';
        return c;
      } catch (e) {
        etat.textContent = `✗ ${e.message}`;
        return null;
      }
    };
    carte.replaceChildren(
      el('div', { style: { fontWeight: '650' }, text: '🎬 Mes vidéos (pCloud)' }),
      el('div.hint', { text: 'Le lien public de ton dossier de vidéos. Chaque sous-dossier daté est relié à la plongée du même jour : '
        + 'aperçus et lecture sur la fiche. Rien n’est copié dans le carnet.' }),
      champ, etat,
      el('div.btn-row', {},
        cfg ? el('button.btn.sm', { type: 'button', text: '🎬 Voir quel dossier va avec quelle plongée', onclick: async () => {
          const { navigate } = await import('../router.js'); navigate('videos');
        } }) : null,
        el('button.btn.primary.sm', { type: 'button', text: 'Enregistrer', onclick: async () => {
          const c = await tester(true);
          if (!c && champ.value.trim()) return;
          const avant = (await store.getSettings()).videos || {};
          await store.saveSettings({ videos: c ? { ...avant, lien: c.lien } : null });
          toast(c ? 'Lien des vidéos enregistré' : 'Lien des vidéos retiré');
        } }),
        cfg ? el('button.btn.sm.ghost', { type: 'button', text: 'Retirer', onclick: async () => {
          await store.saveSettings({ videos: null }); toast('Lien des vidéos retiré'); rendre();
        } }) : null));
    if (cfg) tester(false);
  };
  await rendre();
  return carte;
}

// ------------------------------------------------------------
//  Lecteur
// ------------------------------------------------------------

const taille = o => (o >= 1e9 ? `${(o / 1e9).toFixed(1).replace('.', ',')} Go` : `${Math.max(1, Math.round(o / 1e6))} Mo`);

/**
 * Le fichier original dans un vrai lecteur de l'appareil (VLC, Galerie…) :
 * dans l'APK, téléchargé dans le cache de l'appli (une seule vidéo gardée)
 * puis proposé à Android ; sur le site, le lien de téléchargement.
 */
async function ouvrirAvecUnLecteur(cfg, f, signaler = () => {}) {
  const { modulesNatifs } = await import('../maj-apk.js');
  const url = await urlTelechargement(cfg, f);
  const natif = modulesNatifs();
  if (!natif) { window.open(url, '_blank', 'noopener'); return; }
  const ext = (/\.[a-z0-9]{2,4}$/i.exec(f.nom)?.[0] || '.mp4').toLowerCase();
  const nom = `video-${f.fileid}${ext}`;
  try {
    const l = await natif.fs.readdir({ path: '', directory: 'CACHE' });
    for (const x of l.files || []) {
      const n = typeof x === 'string' ? x : x.name;
      if (/^video-\d+\./.test(n) && n !== nom) await natif.fs.deleteFile({ path: n, directory: 'CACHE' }).catch(() => {});
    }
  } catch { /* rien à ranger */ }
  let chemin = null;
  try {
    const st = await natif.fs.stat({ path: nom, directory: 'CACHE' });
    if (f.taille && Number(st.size) === Number(f.taille)) chemin = (await natif.fs.getUri({ path: nom, directory: 'CACHE' })).uri.replace(/^file:\/\//, '');
  } catch { /* pas encore là */ }
  if (!chemin) {
    const ecoute = await natif.fs.addListener?.('progress', ev => {
      if (ev?.url && ev.url !== url) return;
      signaler(ev?.contentLength ? `Téléchargement… ${Math.round(ev.bytes * 100 / ev.contentLength)} %` : `Téléchargement… ${taille(ev?.bytes || 0)}`);
    });
    try {
      signaler('Téléchargement…');
      const r = await natif.fs.downloadFile({ url, path: nom, directory: 'CACHE', progress: true, connectTimeout: 30000, readTimeout: 300000 });
      chemin = r.path;
    } finally { try { await ecoute?.remove?.(); } catch { /* déjà retiré */ } }
  }
  signaler('Choisis un lecteur (VLC, Galerie…)');
  await natif.opener.open({ filePath: chemin, contentType: /\.mov$/i.test(f.nom) ? 'video/quicktime' : 'video/mp4', openWithDefault: false });
}

/** Le module natif de l'APK qui passe une vidéo à VLC, MX Player… (null sur le site, ou un ancien APK). */
function lecteurExterne() {
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  if (typeof cap.isPluginAvailable === 'function' && !cap.isPluginAvailable('LecteurExterne')) return null;
  return typeof cap.Plugins?.LecteurExterne?.ouvrir === 'function' ? cap.Plugins.LecteurExterne : null;
}

/**
 * Le fichier original, lu en streaming par un lecteur de l'appareil (VLC,
 * MX Player… décodent le 4K H.265 que le lecteur de l'appli ne sait pas
 * afficher). Rien n'est téléchargé. Sur le site : un nouvel onglet.
 */
async function regarderEnStreaming(cfg, f, signaler = () => {}) {
  signaler('Ouverture…');
  const url = await urlTelechargement(cfg, f);
  const L = lecteurExterne();
  if (!L) { window.open(url, '_blank', 'noopener'); signaler(''); return; }
  const r = await L.ouvrir({ url, type: /\.mov$/i.test(f.nom) ? 'video/quicktime' : 'video/mp4', nom: f.nom });
  if (r && r.lecteurs === 0) {
    signaler([el('span', { text: 'Aucun lecteur vidéo trouvé : installe VLC (gratuit). ' }),
      el('a', { href: 'market://details?id=org.videolan.vlc', style: { color: 'var(--accent)' }, text: 'VLC sur le Play Store ↗' })]);
  } else signaler('');
}

function lire(cfg, fichiers, i) {
  openModal(close => {
    const zone = el('div.video-zone');
    const titre = el('div.hint', { style: { marginTop: '6px' } });
    let courant = i;
    let video = null;
    // Sauter de 5 s (en arrière ou en avant)
    const sauter = d => {
      if (!video) return;
      video.currentTime = Math.max(0, Math.min((video.duration || Infinity) - 0.1, video.currentTime + d));
      const bulle = el('div.video-saut', { text: d > 0 ? '5 s ⏩' : '⏪ 5 s' });
      bulle.classList.add(d > 0 ? 'droite' : 'gauche');
      zone.append(bulle); setTimeout(() => bulle.remove(), 600);
    };
    const alerte = el('div.video-figee', { hidden: true });
    const etatLecteur = el('span.hint', { style: { margin: 0 } });
    const TEXTE_LECTEUR = '📺 Regarder dans VLC / un lecteur (streaming)';
    const autreLecteur = el('button.btn.sm', { type: 'button', text: TEXTE_LECTEUR, onclick: async () => {
      const f = fichiers[courant];
      const enStreaming = !!lecteurExterne();
      // Ancien APK sans le module : téléchargement, avec un 2e toucher pour confirmer les gros fichiers.
      if (!enStreaming && f.taille > 5e8 && window.Capacitor?.isNativePlatform?.() && autreLecteur.dataset.ok !== String(f.fileid)) {
        autreLecteur.dataset.ok = String(f.fileid);
        autreLecteur.textContent = `⬇ Télécharger ${taille(f.taille)} sur la tablette, puis ouvrir ?`;
        etatLecteur.textContent = 'Touche encore pour confirmer (mets l’appli à jour pour le streaming).';
        return;
      }
      autreLecteur.textContent = TEXTE_LECTEUR;
      autreLecteur.disabled = true;
      try {
        video?.pause();
        if (enStreaming) await regarderEnStreaming(cfg, f, t => { etatLecteur.replaceChildren(...[].concat(t)); });
        else await ouvrirAvecUnLecteur(cfg, f, t => { etatLecteur.textContent = t; });
      } catch (e) { etatLecteur.textContent = `✗ ${e.message}`; }
      autreLecteur.disabled = false;
    } });
    let guet = null;
    const sauts = el('div.btn-row.video-sauts', { hidden: true },
      el('button.btn.sm', { type: 'button', text: '⏪ 5 s', title: 'Reculer de 5 secondes', onclick: () => sauter(-5) }),
      el('button.btn.sm', { type: 'button', text: '5 s ⏩', title: 'Avancer de 5 secondes', onclick: () => sauter(5) }));
    const montrer = async () => {
      const f = fichiers[courant];
      titre.textContent = `${courant + 1}/${fichiers.length} · ${f.nom}${f.taille ? ` · ${taille(f.taille)}` : ''}`;
      alerte.hidden = true; etatLecteur.textContent = ''; clearTimeout(guet);
      autreLecteur.hidden = !f.video;
      delete autreLecteur.dataset.ok; autreLecteur.textContent = TEXTE_LECTEUR;
      zone.replaceChildren(el('div.hint', { text: 'Chargement…' }));
      try {
        const url = await urlLecture(cfg, f);
        video = f.video
          ? el('video', { src: url, controls: true, autoplay: true, playsinline: true, preload: 'metadata', poster: urlMiniature(cfg, f.fileid, '640x480') })
          : null;
        sauts.hidden = !video;
        // Le son passe mais l'image reste figée (4K H.265) : on le dit, et on propose un vrai lecteur.
        if (video) {
          video.addEventListener('playing', () => {
            clearTimeout(guet);
            guet = setTimeout(() => {
              if (!imageFigee(video)) return;
              alerte.hidden = false;
              alerte.replaceChildren(el('b', { text: '🎞 L’image ne suit pas' }),
                el('span', { text: ` : cette vidéo${/4k/i.test(f.nom) ? ' 4K' : ''} est trop lourde pour le lecteur de l’appli (le son passe, pas l’image). pCloud ne donne pas de version allégée pour un lien public : regarde-la dans VLC ou un autre lecteur (bouton ci-dessous) : il la lit en streaming.` }));
            }, 4000);
          });
        }
        // Double-toucher à gauche / à droite de l'image : −5 s / +5 s
        if (video) {
          let dernier = 0;
          video.addEventListener('pointerup', e => {
            const t = Date.now();
            if (t - dernier < 320) {
              const r = video.getBoundingClientRect(), x = e.clientX - r.left;
              if (x < r.width * 0.35) sauter(-5); else if (x > r.width * 0.65) sauter(5);
              dernier = 0;
            } else dernier = t;
          });
        }
        zone.replaceChildren(video || el('img', { src: url, alt: f.nom }));
      } catch (e) {
        zone.replaceChildren(el('img', { src: urlMiniature(cfg, f.fileid, '1024x768'), alt: f.nom }),
          el('div.hint', { text: `Lecture impossible ici (${e.message}) : ouvre-la dans pCloud.` }));
      }
    };
    montrer();
    return el('div.video-lecteur', {},
      zone, sauts, alerte, titre,
      el('div.btn-row', { style: { alignItems: 'center' } }, autreLecteur, etatLecteur),
      el('div.btn-row', {},
        fichiers.length > 1 ? el('button.btn.sm', { type: 'button', text: '‹', onclick: () => { courant = (courant - 1 + fichiers.length) % fichiers.length; montrer(); } }) : null,
        fichiers.length > 1 ? el('button.btn.sm', { type: 'button', text: '›', onclick: () => { courant = (courant + 1) % fichiers.length; montrer(); } }) : null,
        el('button.btn.primary.sm', { type: 'button', text: 'Fermer', onclick: close })));
  });
}

// ------------------------------------------------------------
//  Appui long : choisir plusieurs éléments
// ------------------------------------------------------------

/**
 * Un toucher court fait `court`, un appui long (½ s) fait `long`.
 * Le clic qui suit un appui long est avalé.
 */
export function appuiLong(node, { court, long, ms = 500 }) {
  let minuteur = null, depart = null, avale = false;
  const annuler = () => { clearTimeout(minuteur); minuteur = null; };
  node.addEventListener('pointerdown', e => {
    avale = false; depart = { x: e.clientX, y: e.clientY };
    minuteur = setTimeout(() => { minuteur = null; avale = true; navigator.vibrate?.(30); long(e); }, ms);
  });
  node.addEventListener('pointermove', e => {
    if (minuteur && depart && Math.hypot(e.clientX - depart.x, e.clientY - depart.y) > 10) annuler();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => node.addEventListener(t, annuler));
  node.addEventListener('contextmenu', e => e.preventDefault());
  node.addEventListener('click', e => { if (avale) { avale = false; e.preventDefault(); e.stopPropagation(); return; } court(e); });
  return node;
}

/**
 * Une liste où l'on choisit un élément (toucher) ou plusieurs (appui
 * long, ou « Choisir plusieurs »), puis « Relier ».
 * @param {{titre, aide, elements:Array<{id, gras, texte, petit}>, surChoix:(ids:string[])=>void, avant?:Node}} o
 */
function listeChoix({ titre, aide, elements, surChoix, avant = null }) {
  openModal(close => {
    const choisis = new Set();
    let multi = false;
    const valider = el('button.btn.primary', { type: 'button', hidden: true });
    const basculer = el('button.btn.sm.ghost', { type: 'button', text: '☑ Choisir plusieurs' });
    const lignes = elements.map(x => {
      const coche = el('span.choix-coche', { text: '' });
      const b = el('button.video-choix-ligne', { type: 'button' }, coche,
        el('b', { text: x.gras }), el('span', { text: x.texte }), x.petit ? el('small', { text: x.petit }) : null);
      const maj = () => { b.classList.toggle('on', choisis.has(x.id)); coche.textContent = multi ? (choisis.has(x.id) ? '☑' : '☐') : ''; };
      b.maj = maj;
      appuiLong(b, {
        court: () => {
          if (!multi) { close(); surChoix([x.id]); return; }
          choisis.has(x.id) ? choisis.delete(x.id) : choisis.add(x.id);
          rafraichir();
        },
        long: () => { multi = true; choisis.add(x.id); rafraichir(); },
      });
      return b;
    });
    const rafraichir = () => {
      lignes.forEach(l => l.maj());
      valider.hidden = !multi;
      valider.disabled = !choisis.size;
      valider.textContent = `🔗 Relier (${choisis.size})`;
      basculer.textContent = multi ? 'Un seul' : '☑ Choisir plusieurs';
    };
    basculer.onclick = () => { multi = !multi; if (!multi) choisis.clear(); rafraichir(); };
    valider.onclick = () => { close(); surChoix([...choisis]); };
    rafraichir();
    return el('div', {},
      el('h3', { text: titre }),
      el('div.hint', { style: { marginTop: 0 }, text: `${aide} Appui long pour en choisir plusieurs.` }),
      avant,
      el('div', { style: { margin: '6px 0' } }, basculer),
      lignes.length ? el('div.video-choix', {}, ...lignes) : el('div.hint', { text: 'Rien à proposer.' }),
      el('div.btn-row', {}, el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }), valider));
  });
}

/** replaceChildren sans les « null » (qu'il écrirait en toutes lettres). */
const remplacer = (n, ...enfants) => n.replaceChildren(...enfants.flat().filter(x => x != null && x !== false && x !== ''));

const jourDe = s => (s ? new Date(`${s}T12:00:00`).getTime() / 86400000 : 1e9);

function choisirDossiers(dive, dossiers, surChoix) {
  const deja = dossiersLies(dive).map(String);
  const tries = [...dossiers].filter(x => !deja.includes(String(x.folderid)))
    .sort((a, b) => Math.abs(jourDe(a.date) - jourDe(dive.date)) - Math.abs(jourDe(b.date) - jourDe(dive.date)));
  listeChoix({
    titre: '🎬 Quel dossier de vidéos ?',
    aide: 'Les plus proches de la date en premier.',
    elements: tries.slice(0, 40).map(x => ({ id: String(x.folderid), gras: fmtDate(x.date), texte: x.chemin,
      petit: `${x.fichiers.filter(f => f.video).length} vidéo(s) · ${x.fichiers.filter(f => !f.video).length} photo(s)` })),
    surChoix,
  });
}

const libelleSortie = d => (d.seance
  ? `${typeSeance(d.type).icone} ${typeSeance(d.type).label}${d.lieu ? ` · ${d.lieu}` : ''}${d.heure ? ` ${d.heure}` : ''}`
  : `n°${d.numero ?? '?'} · ${d.lieuNom || fmtDate(d.date)}${d.heureImmersion ? ` ${d.heureImmersion}` : ''}`);

function choisirSorties(dossier, liste, titre, surChoix) {
  const tries = [...liste].filter(d => d.date)
    .sort((a, b) => Math.abs(jourDe(a.date) - jourDe(dossier.date)) - Math.abs(jourDe(b.date) - jourDe(dossier.date)));
  listeChoix({
    titre: `🎬 ${dossier.nom} : ${titre}`,
    aide: 'Les plus proches de la date du dossier en premier.',
    elements: tries.slice(0, 40).map(d => ({ id: d.id, gras: fmtDate(d.date), texte: libelleSortie(d) })),
    surChoix: ids => surChoix(ids.map(id => liste.find(d => d.id === id)).filter(Boolean)),
  });
}

/** Enregistre une plongée ou une séance (sans la marque « seance » ajoutée pour l'affichage). */
async function enregistrerSortie(d) {
  if (!d.seance) return store.saveDive(d);
  const { seance, ...propre } = d;
  return store.saveSeance(propre);
}

/** Applique un patch à une sortie relue du carnet, puis l'enregistre. */
async function modifierSortie(d, patch) {
  const frais = d.seance ? await store.getSeance(d.id) : await store.getDive(d.id);
  const x = { ...(frais || d), ...patch, ...(d.seance ? { seance: true } : {}) };
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete x[k];
  await enregistrerSortie(x);
  return x;
}

// ------------------------------------------------------------
//  Sur la fiche d'une plongée ou d'une séance
// ------------------------------------------------------------

/** La section « Vidéos » d'une fiche ; vide (rien d'affiché) sans lien pCloud. */
export function sectionVideos(dive, toutes, { lecture = false, sauver = d => store.saveDive(d) } = {}) {
  const section = el('div.section', { hidden: true });
  (async () => {
    const cfg = await configVideos();
    if (!cfg) return;
    section.hidden = false;
    const corps = el('div.card', {}, el('div.hint', { style: { margin: 0 }, text: 'Recherche des vidéos dans pCloud…' }));
    section.replaceChildren(el('h2', { text: 'Vidéos' }), corps);
    let dossiers;
    try { dossiers = await chargerDossiers(cfg); } catch (e) {
      remplacer(corps, el('div.hint', { style: { margin: 0 }, text: `pCloud injoignable : ${e.message}` }));
      return;
    }
    const opts = await optionsVideos(cfg);
    const maj = async patch => {
      Object.assign(dive, patch);
      for (const [k, v] of Object.entries(patch)) if (v === undefined) delete dive[k];
      try { await sauver(dive); } catch (e) { toast(e.message, true); }
      // Plongées ET séances : un dossier relié à une séance ne revient pas
      // tout seul sur la plongée du même jour.
      toutes = (await sorties()).toutes;
      rendre();
    };
    toutes = (await sorties()).toutes;
    const mot = dive.seance || (dive.type && dive.numero == null) ? 'séance' : 'plongée';
    const choisis = new Set();

    const rendre = () => {
      const v = videosDePlongee(dive, dossiers, toutes, opts);
      choisis.clear();
      if (!v) {
        remplacer(corps, 
          el('div.hint', { style: { margin: 0 }, text: `Aucun dossier pCloud pour cette ${mot}${(dive.videoSans || []).length ? ' (dossier du jour retiré)' : ` (rien de daté du ${fmtDate(dive.date)})`}.` }),
          lecture ? null : el('div.btn-row', { style: { marginTop: '8px' } },
            el('button.btn.sm', { type: 'button', text: '🔗 Relier un dossier',
              onclick: () => choisirDossiers(dive, dossiers, ids => maj(ids.reduce((acc, id) => ({ ...acc, ...avecDossier({ ...dive, ...acc }, id) }), {}))) }),
            (dive.videoSans || []).length ? el('button.btn.sm.ghost', { type: 'button', text: '↺ Remettre le dossier du jour',
              onclick: () => maj({ videoSans: undefined }) }) : null));
        return;
      }
      const { dossiers: lies, fichiers, parHeure, retirees } = v;
      const tries = [...fichiers].sort((a, b) => (b.video - a.video) || a.nom.localeCompare(b.nom));
      // Les autres sorties du même jour qui montrent aussi ce dossier.
      const voisines = toutes.filter(o => o.id !== dive.id && o.date === dive.date
        && videosDePlongee(o, dossiers, toutes, opts)?.dossiers.some(x => lies.includes(x)));

      const barre = el('div.video-selection', { hidden: true });
      const rendreBarre = () => {
        barre.hidden = !choisis.size;
        if (!choisis.size) return;
        const ids = [...choisis];
        const tousIds = tries.map(f => String(f.fileid));
        remplacer(barre, 
          el('b', { text: `${ids.length} choisie${ids.length > 1 ? 's' : ''}` }),
          el('button.btn.sm', { type: 'button', text: `Retirer de cette ${mot}`, onclick: () =>
            maj({ videosRetirees: [...new Set([...(dive.videosRetirees || []).map(String), ...ids])] }) }),
          ...voisines.map(o => el('button.btn.sm', { type: 'button', text: `Celles-ci ici, le reste sur ${libelleSortie(o)}`,
            onclick: async () => {
              // Le partage d'un même dossier entre deux sorties du jour.
              await modifierSortie(o, { videosRetirees: [...new Set([...(o.videosRetirees || []).map(String), ...ids])] });
              await maj({ videosRetirees: [...new Set([...(dive.videosRetirees || []).map(String), ...tousIds.filter(x => !ids.includes(x))])] });
              toast('Vidéos réparties');
            } })),
          el('button.btn.sm.ghost', { type: 'button', text: 'Annuler', onclick: () => { choisis.clear(); majVignettes(); rendreBarre(); } }));
      };
      const vignettes = tries.slice(0, 36).map((f, i) => {
        const b = el('button.video-vignette', { type: 'button', title: f.nom },
          el('img', { src: urlMiniature(cfg, f.fileid), alt: f.nom, loading: 'lazy',
            onerror: e => { e.target.replaceWith(el('span.video-sans', { text: f.video ? '🎬' : '🖼' })); } }),
          f.video ? el('span.video-play', { text: '▶' }) : null,
          el('span.video-coche', { text: '✓' }));
        b.fichier = f;
        appuiLong(b, {
          court: () => {
            if (!choisis.size) { lire(cfg, tries, i); return; }
            const k = String(f.fileid);
            choisis.has(k) ? choisis.delete(k) : choisis.add(k);
            majVignettes(); rendreBarre();
          },
          long: () => { if (lecture) return; choisis.add(String(f.fileid)); majVignettes(); rendreBarre(); },
        });
        return b;
      });
      const majVignettes = () => vignettes.forEach(b => b.classList.toggle('choisie', choisis.has(String(b.fichier.fileid))));

      remplacer(corps, 
        el('div.video-tete', {},
          el('div', {},
            el('div.video-dossiers', {}, ...lies.map(x => el('span.chip.solid.video-plongee', {},
              el('span', { text: x.nom }),
              lecture ? null : el('button.x', { type: 'button', title: `Retirer ce dossier de cette ${mot}`, text: '×',
                onclick: () => maj(sansDossier(dive, x.folderid)) })))),
            el('div.hint', { style: { margin: '4px 0 0' }, text: [
              `${tries.filter(f => f.video).length} vidéo(s), ${tries.filter(f => !f.video).length} photo(s)`,
              parHeure ? `celles prises pendant cette ${mot}` : null,
              v.auto && lies.length ? 'trouvé à la date' : null,
              v.assignes ? `${v.assignes} assignée(s) dans l’assistant` : null].filter(Boolean).join(' · ') })),
          lecture ? null : el('button.btn.sm.ghost', { type: 'button', text: '＋ Dossier',
            onclick: () => choisirDossiers(dive, dossiers, ids => {
              // Le dossier du jour, s'il était là, reste relié.
              const base = v.auto && lies.length ? avecDossier(dive, lies[0].folderid) : {};
              maj(ids.reduce((acc, id) => ({ ...acc, ...avecDossier({ ...dive, ...acc }, id) }), base));
            }) })),
        tries.length ? el('div.video-grille', {}, ...vignettes) : el('div.hint', { text: 'Aucune vidéo.' }),
        barre,
        lecture ? null : el('div.hint', { style: { margin: '6px 0 0' }, text: 'Appui long sur une vidéo pour en choisir plusieurs (retirer, répartir).' }),
        retirees && !lecture ? el('button.lien-texte', { type: 'button', style: { fontSize: '13px', marginTop: '6px' },
          text: `↺ Remettre les ${retirees} vidéo(s) retirée(s)`, onclick: () => maj({ videosRetirees: undefined }) }) : null,
        el('a', { href: lienDossier(cfg, lies[0]?.folderid ?? v.dossierFichier), target: '_blank', rel: 'noopener',
          style: { color: 'var(--accent)', fontSize: '13px', display: 'block', marginTop: '8px' },
          text: tries.length > 36 ? `Tout voir dans pCloud (${tries.length}) ↗` : 'Ouvrir dans pCloud ↗' }));
    };
    rendre();
  })();
  return section;
}

// ------------------------------------------------------------
//  « Mes vidéos » : quel dossier va avec quelle plongée ou séance
// ------------------------------------------------------------

/** Ni plongée ni séance : un test caméra, une piscine pour le plaisir… */
function choisirAutre(titre, surChoix) {
  openModal(close => {
    const champ = el('input', { type: 'text', placeholder: 'Autre chose…' });
    const choix = t => { close(); surChoix(t); };
    return el('div', {},
      el('h3', { text: `🎥 ${titre} : c’était quoi ?` }),
      el('div.hint', { style: { marginTop: 0 }, text: 'Le dossier reste dans la liste, sans attendre de plongée ni de séance.' }),
      el('div.chips', {}, ...['Test caméra', 'Piscine', 'Snorkeling', 'Surface / bateau', 'Vacances'].map(t =>
        el('button.chip', { type: 'button', text: t, onclick: () => choix(t) }))),
      el('div.field', { style: { marginTop: '10px' } }, champ),
      el('div.btn-row', {},
        el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }),
        el('button.btn.primary', { type: 'button', text: 'OK', onclick: () => choix(champ.value.trim() || 'Autre') })));
  });
}

export async function videosView() {
  const { navigate } = await import('../router.js');
  const wrap = el('div');
  const cfg = await configVideos();
  if (!cfg) {
    wrap.append(await carteVideosReglages());
    return { title: 'Mes vidéos', node: wrap, back: true };
  }
  const etat = el('div.hint.va-etat', { text: 'Lecture du dossier pCloud…' });
  const corps = el('div');
  const zone = el('div');
  const barre = el('div.video-selection.flottante', { hidden: true });
  const selection = new Set();

  const rendre = async (forcer = false) => {
    let dossiers;
    if (forcer) { etat.textContent = '🔄 Relecture de pCloud…'; bRelire.disabled = true; }
    try { dossiers = await chargerDossiers(cfg, { forcer }); } catch (e) {
      etat.textContent = `pCloud injoignable : ${e.message}`; bRelire.disabled = false; return;
    } finally { bRelire.disabled = false; }
    const { dives, seances, toutes } = await sorties();
    const opts = await optionsVideos(cfg);
    const { autres } = opts;
    const lies = new Map(dossiers.map(x => [x, toutes.filter(d => videosDePlongee(d, dossiers, toutes, opts)?.dossiers.includes(x))]));
    const nbLies = dossiers.filter(x => lies.get(x).length).length;
    const nbAutres = dossiers.filter(x => !lies.get(x).length && String(x.folderid) in autres).length;
    const nbSeuls = dossiers.length - nbLies - nbAutres;
    const t = luA(cfg);
    const plats = opts.fichiers;
    etat.textContent = [`${plats.filter(f => f.video).length} vidéos, ${plats.filter(f => !f.video).length} photos`,
      `${dossiers.length} dossier${dossiers.length > 1 ? 's' : ''} daté${dossiers.length > 1 ? 's' : ''}`,
      t ? `lu à ${new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : null].filter(Boolean).join(' · ');
    const aideDossiers = el('div.hint', { text: [`${nbLies} relié${nbLies > 1 ? 's' : ''}`, nbAutres ? `${nbAutres} autre${nbAutres > 1 ? 's' : ''} (test caméra…)` : null,
      nbSeuls ? `${nbSeuls} à relier` : null].filter(Boolean).join(' · ') + ' — appui long sur un dossier pour en choisir plusieurs.' });
    const ctx = { cfg, dossiers, plats, dives, seances, toutes, autres, aff: opts.affectations, navigate,
      sauverAff: sauverAffectations, rendreTout: () => rendre(),
      lireFichier: f => lire(cfg, [f], 0),
      choisirSorties: (f, c) => choisirSorties({ nom: f.nom, date: f.date || f.dossierDate }, toutes, 'quelle plongée ?', c),
      allerVers: id => { try { localStorage.setItem('plongee-journal:onglet:videos', id); localStorage.setItem('plongee-journal:videos-filtre', 'a-valider'); } catch { /* privé */ } rendre(); } };
    const A = await import('./videos-assistant.js');

    /** Relie des dossiers à des sorties (chaque sortie reçoit tous les dossiers). */
    const relier = async (folders, cibles) => {
      for (const d of cibles) {
        let patch = {};
        for (const f of folders) patch = { ...patch, ...avecDossier({ ...d, ...patch }, f.folderid) };
        try { await modifierSortie(d, patch); } catch (e) { toast(e.message, true); }
      }
      toast(`${folders.length} dossier${folders.length > 1 ? 's' : ''} relié${folders.length > 1 ? 's' : ''} à ${cibles.length} ${cibles.length > 1 ? 'sorties' : 'sortie'}`);
      selection.clear();
      rendre();
    };
    const retirer = async (d, folder) => {
      try { await modifierSortie(d, sansDossier(d, folder.folderid)); toast('Dossier retiré'); } catch (e) { toast(e.message, true); }
      rendre();
    };
    const marquerAutre = async (folders, libelle) => {
      const r = await store.getSettings();
      const v = { ...(r.videos || {}) };
      v.autres = { ...(v.autres || {}) };
      for (const f of folders) { if (libelle) v.autres[f.folderid] = libelle; else delete v.autres[f.folderid]; }
      await store.saveSettings({ videos: v });
      selection.clear();
      rendre();
    };

    const rendreBarre = () => {
      barre.hidden = !selection.size;
      if (!selection.size) return;
      const folders = dossiers.filter(x => selection.has(String(x.folderid)));
      remplacer(barre, 
        el('b', { text: `${folders.length} dossier${folders.length > 1 ? 's' : ''}` }),
        el('button.btn.sm', { type: 'button', text: '🔗 Plongée(s)', onclick: () =>
          choisirSorties({ nom: `${folders.length} dossiers`, date: folders[0].date }, dives, 'quelle(s) plongée(s) ?', c => relier(folders, c)) }),
        el('button.btn.sm', { type: 'button', text: '🔗 Séance(s)', onclick: () =>
          choisirSorties({ nom: `${folders.length} dossiers`, date: folders[0].date }, seances, 'quelle(s) séance(s) ?', c => relier(folders, c)) }),
        el('button.btn.sm', { type: 'button', text: '🎥 Autre', onclick: () => choisirAutre(`${folders.length} dossiers`, t => marquerAutre(folders, t)) }),
        el('button.btn.sm.ghost', { type: 'button', text: 'Annuler', onclick: () => { selection.clear(); rendre(); } }));
    };

    remplacer(corps, aideDossiers, ...[...dossiers].reverse().map(x => {
      const relies = lies.get(x);
      const autre = !relies.length ? autres[x.folderid] : null;
      const apercu = x.fichiers.slice(0, 4);
      const carte = el('div.card.video-dossier', { class: [relies.length || autre ? '' : 'orphelin', selection.has(String(x.folderid)) ? 'choisie' : ''].join(' ').trim() || null },
        el('div.video-tete', {},
          el('div', {}, el('b', { text: `${selection.has(String(x.folderid)) ? '☑ ' : ''}${x.nom}` }),
            el('div.hint', { style: { margin: 0 }, text: `${fmtDate(x.date)} · ${x.fichiers.filter(f => f.video).length} vidéo(s), ${x.fichiers.filter(f => !f.video).length} photo(s)` })),
          el('a', { href: lienDossier(cfg, x.folderid), target: '_blank', rel: 'noopener', style: { color: 'var(--accent)', fontSize: '13px' }, text: 'pCloud ↗' })),
        apercu.length ? el('div.video-bande', {}, ...apercu.map((f, i) =>
          el('button.video-vignette', { type: 'button', onclick: e => { if (selection.size) return; e.stopPropagation(); lire(cfg, x.fichiers, i); } },
            el('img', { src: urlMiniature(cfg, f.fileid, '240x180'), alt: f.nom, loading: 'lazy',
              onerror: e => { e.target.replaceWith(el('span.video-sans', { text: f.video ? '🎬' : '🖼' })); } }),
            f.video ? el('span.video-play', { text: '▶' }) : null))) : null,
        el('div.video-liens', {},
          ...relies.map(d => el('span.chip.solid.video-plongee', {},
            el('button.lien-texte', { type: 'button', text: libelleSortie(d),
              onclick: e => { e.stopPropagation(); navigate(d.seance ? `seance/${d.id}` : `dive/${d.id}`); } }),
            el('button.x', { type: 'button', title: 'Retirer ce dossier de cette sortie', text: '×',
              onclick: e => { e.stopPropagation(); retirer(d, x); } }))),
          autre ? el('span.chip.solid.video-plongee', {}, el('span', { text: `🎥 ${autre}` }),
            el('button.x', { type: 'button', title: 'Ce n’est pas ça', text: '×', onclick: e => { e.stopPropagation(); marquerAutre([x], null); } })) : null,
          !relies.length && !autre ? el('span.hint', { style: { margin: 0 }, text: 'Rien dans le carnet ce jour-là.' }) : null),
        autre ? null : el('div.btn-row.video-actions', {},
          el('button.btn.sm.ghost', { type: 'button', text: relies.length ? '＋ Plongée(s)' : '🔗 Plongée(s)',
            onclick: e => { e.stopPropagation(); choisirSorties(x, dives, 'quelle(s) plongée(s) ?', c => relier([x], c)); } }),
          el('button.btn.sm.ghost', { type: 'button', text: relies.length ? '＋ Séance(s)' : '🔗 Séance (fosse, piscine…)',
            onclick: e => { e.stopPropagation(); choisirSorties(x, seances, 'quelle(s) séance(s) ?', c => relier([x], c)); } }),
          relies.length ? null : el('button.btn.sm.ghost', { type: 'button', text: '🎥 Autre (test caméra…)',
            onclick: e => { e.stopPropagation(); choisirAutre(x.nom, t => marquerAutre([x], t)); } })));
      appuiLong(carte, {
        court: () => {
          if (!selection.size) return;
          const k = String(x.folderid);
          selection.has(k) ? selection.delete(k) : selection.add(k);
          rendre();
        },
        long: () => { selection.add(String(x.folderid)); rendre(); },
      });
      return carte;
    }));
    rendreBarre();
    zone.replaceChildren(onglets('videos', [
      { id: 'videos', titre: '🎬 Vidéos → plongée', contenu: A.ongletVideosPlongee(ctx) },
      { id: 'plongees', titre: '🤿 Plongées → vidéos', contenu: A.ongletPlongeesVideos(ctx) },
      { id: 'dossiers', titre: '📁 Dossiers', contenu: [corps, barre] },
    ]));
  };

  const bRelire = el('button.btn.sm', { type: 'button', text: '🔄 Rafraîchir pCloud', title: 'Relire les dossiers et les noms de fichiers', onclick: () => rendre(true) });
  wrap.classList.add('videos-page');
  wrap.append(
    el('div.va-tete', {}, etat,
      el('div.btn-row', {}, bRelire,
        el('button.btn.sm.ghost', { type: 'button', text: 'Changer le lien', onclick: () => navigate('reglages') }))),
    zone);
  rendre();
  return { title: 'Mes vidéos', node: wrap, back: true };
}
