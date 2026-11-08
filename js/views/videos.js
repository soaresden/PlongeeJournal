// ============================================================
//  Écrans des vidéos pCloud : réglage du lien, vidéos d'une plongée,
//  lecteur, choix d'un dossier à la main.
// ============================================================

import { el, toast, openModal, fmtDate } from '../lib.js';
import { store } from '../store.js';
import { lirePublink, chargerDossiers, videosDePlongee, urlMiniature, urlLecture, lienDossier } from '../videos.js';

/** Le lien enregistré dans les réglages, prêt pour l'API. */
export async function configVideos() {
  const r = await store.getSettings();
  return r.videos?.lien ? lirePublink(r.videos.lien) : null;
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
        const dives = await store.listDives(await store.getActiveDiverId());
        const lies = dives.filter(d => videosDePlongee(d, dossiers)).length;
        etat.textContent = dossiers.length
          ? `✓ ${dossiers.length} dossier${dossiers.length > 1 ? 's' : ''} daté${dossiers.length > 1 ? 's' : ''}, du ${fmtDate(dossiers[0].date)} au ${fmtDate(dossiers.at(-1).date)} · ${lies} plongée${lies > 1 ? 's' : ''} avec des vidéos.`
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
        el('button.btn.primary.sm', { type: 'button', text: 'Enregistrer', onclick: async () => {
          const c = await tester(true);
          if (!c && champ.value.trim()) return;
          await store.saveSettings({ videos: c ? { lien: c.lien } : null });
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

function lire(cfg, fichiers, i) {
  openModal(close => {
    const zone = el('div.video-zone');
    const titre = el('div.hint', { style: { marginTop: '6px' } });
    let courant = i;
    const montrer = async () => {
      const f = fichiers[courant];
      titre.textContent = `${courant + 1}/${fichiers.length} · ${f.nom}`;
      zone.replaceChildren(el('div.hint', { text: 'Chargement…' }));
      try {
        const url = await urlLecture(cfg, f);
        zone.replaceChildren(f.video
          ? el('video', { src: url, controls: true, autoplay: true, playsinline: true, preload: 'metadata', poster: urlMiniature(cfg, f.fileid, '640x480') })
          : el('img', { src: url, alt: f.nom }));
      } catch (e) {
        zone.replaceChildren(el('img', { src: urlMiniature(cfg, f.fileid, '1024x768'), alt: f.nom }),
          el('div.hint', { text: `Lecture impossible ici (${e.message}) : ouvre-la dans pCloud.` }));
      }
    };
    montrer();
    return el('div.video-lecteur', {},
      zone, titre,
      el('div.btn-row', {},
        fichiers.length > 1 ? el('button.btn.sm', { type: 'button', text: '‹', onclick: () => { courant = (courant - 1 + fichiers.length) % fichiers.length; montrer(); } }) : null,
        fichiers.length > 1 ? el('button.btn.sm', { type: 'button', text: '›', onclick: () => { courant = (courant + 1) % fichiers.length; montrer(); } }) : null,
        el('button.btn.primary.sm', { type: 'button', text: 'Fermer', onclick: close })));
  });
}

// ------------------------------------------------------------
//  Choix d'un dossier à la main
// ------------------------------------------------------------

function choisirDossier(dive, dossiers, surChoix) {
  const jour = s => new Date(`${s}T12:00:00`).getTime() / 86400000;
  const tries = [...dossiers].sort((a, b) =>
    Math.abs(jour(a.date) - jour(dive.date || a.date)) - Math.abs(jour(b.date) - jour(dive.date || b.date)));
  openModal(close => el('div', {},
    el('h3', { text: '🎬 Quel dossier de vidéos ?' }),
    el('div.hint', { style: { marginTop: 0 }, text: 'Les plus proches de la date de la plongée en premier.' }),
    el('div.video-choix', {},
      dive.videoDossier ? el('button.btn.sm.ghost', { type: 'button', text: '↺ Revenir au dossier de la même date',
        onclick: () => { close(); surChoix(null); } }) : null,
      ...tries.slice(0, 40).map(x => el('button.video-choix-ligne', { type: 'button', onclick: () => { close(); surChoix(x.folderid); } },
        el('b', { text: fmtDate(x.date) }), el('span', { text: x.chemin }),
        el('small', { text: `${x.fichiers.filter(f => f.video).length} vidéo(s) · ${x.fichiers.filter(f => !f.video).length} photo(s)` })))),
    el('div.btn-row', {}, el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }))));
}

// ------------------------------------------------------------
//  Sur la fiche d'une plongée
// ------------------------------------------------------------

/** La section « Vidéos » d'une fiche ; vide (rien d'affiché) sans lien pCloud. */
export function sectionVideos(dive, toutes, { lecture = false } = {}) {
  const section = el('div.section', { hidden: true });
  (async () => {
    const cfg = await configVideos();
    if (!cfg) return;
    section.hidden = false;
    const corps = el('div.card', {}, el('div.hint', { style: { margin: 0 }, text: 'Recherche des vidéos dans pCloud…' }));
    section.replaceChildren(el('h2', { text: 'Vidéos' }), corps);
    let dossiers;
    try { dossiers = await chargerDossiers(cfg); } catch (e) {
      corps.replaceChildren(el('div.hint', { style: { margin: 0 }, text: `pCloud injoignable : ${e.message}` }));
      return;
    }
    const lier = async folderid => {
      dive.videoDossier = folderid || null;
      if (!folderid) delete dive.videoDossier;
      try { await store.saveDive(dive); } catch (e) { toast(e.message, true); }
      rendre();
    };
    const rendre = () => {
      const v = videosDePlongee(dive, dossiers, toutes);
      if (!v) {
        corps.replaceChildren(
          el('div.hint', { style: { margin: 0 }, text: `Aucun dossier pCloud daté du ${fmtDate(dive.date)}.` }),
          lecture ? null : el('button.btn.sm', { type: 'button', style: { marginTop: '8px' }, text: '🔗 Lier un dossier',
            onclick: () => choisirDossier(dive, dossiers, lier) }));
        return;
      }
      const { dossier, fichiers, parHeure } = v;
      const tries = [...fichiers].sort((a, b) => (b.video - a.video) || a.nom.localeCompare(b.nom));
      corps.replaceChildren(
        el('div.video-tete', {},
          el('div', {}, el('b', { text: dossier.nom }),
            el('div.hint', { style: { margin: 0 }, text: [
              `${tries.filter(f => f.video).length} vidéo(s), ${tries.filter(f => !f.video).length} photo(s)`,
              parHeure ? 'celles prises pendant cette plongée' : null,
              dive.videoDossier ? 'dossier choisi à la main' : null].filter(Boolean).join(' · ') })),
          lecture ? null : el('button.btn.sm.ghost', { type: 'button', text: 'Changer', onclick: () => choisirDossier(dive, dossiers, lier) })),
        tries.length ? el('div.video-grille', {}, ...tries.slice(0, 24).map((f, i) =>
          el('button.video-vignette', { type: 'button', title: f.nom, onclick: () => lire(cfg, tries, i) },
            el('img', { src: urlMiniature(cfg, f.fileid), alt: f.nom, loading: 'lazy',
              onerror: e => { e.target.replaceWith(el('span.video-sans', { text: f.video ? '🎬' : '🖼' })); } }),
            f.video ? el('span.video-play', { text: '▶' }) : null))) : el('div.hint', { text: 'Dossier vide.' }),
        el('a', { href: lienDossier(cfg, dossier.folderid), target: '_blank', rel: 'noopener',
          style: { color: 'var(--accent)', fontSize: '13px', display: 'inline-block', marginTop: '8px' },
          text: tries.length > 24 ? `Tout voir dans pCloud (${tries.length}) ↗` : 'Ouvrir dans pCloud ↗' }));
    };
    rendre();
  })();
  return section;
}
