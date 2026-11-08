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
        cfg ? el('button.btn.sm', { type: 'button', text: '🎬 Voir quel dossier va avec quelle plongée', onclick: async () => {
          const { navigate } = await import('../router.js'); navigate('videos');
        } }) : null,
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

// ------------------------------------------------------------
//  « Mes vidéos » : quel dossier va avec quelle plongée
// ------------------------------------------------------------

/** Choisir la plongée d'un dossier (les plus proches de sa date en premier). */
function choisirPlongee(dossier, dives, surChoix) {
  const jour = s => (s ? new Date(`${s}T12:00:00`).getTime() / 86400000 : 1e9);
  const tries = [...dives].filter(d => d.date).sort((a, b) =>
    Math.abs(jour(a.date) - jour(dossier.date)) - Math.abs(jour(b.date) - jour(dossier.date)));
  openModal(close => el('div', {},
    el('h3', { text: `🎬 ${dossier.nom} : quelle plongée ?` }),
    el('div.hint', { style: { marginTop: 0 }, text: 'Les plus proches de la date du dossier en premier.' }),
    el('div.video-choix', {}, ...tries.slice(0, 30).map(d => el('button.video-choix-ligne', { type: 'button',
      onclick: () => { close(); surChoix(d); } },
      el('b', { text: `n°${d.numero ?? '?'}` }), el('span', { text: `${fmtDate(d.date)}${d.heureImmersion ? ` · ${d.heureImmersion}` : ''}` }),
      el('small', { text: d.lieuNom || d.site || 'lieu non précisé' })))),
    el('div.btn-row', {}, el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }))));
}

export async function videosView() {
  const { navigate } = await import('../router.js');
  const wrap = el('div');
  const cfg = await configVideos();
  if (!cfg) {
    wrap.append(await carteVideosReglages());
    return { title: 'Mes vidéos', node: wrap, back: true };
  }
  const diverId = await store.getActiveDiverId();
  const etat = el('div.hint', { text: 'Lecture du dossier pCloud…' });
  wrap.append(etat);

  const rendre = async (forcer = false) => {
    let dossiers;
    try { dossiers = await chargerDossiers(cfg, { forcer }); } catch (e) {
      etat.textContent = `pCloud injoignable : ${e.message}`; return;
    }
    const dives = await store.listDives(diverId);
    const lies = new Map(dossiers.map(x => [x, dives.filter(d => videosDePlongee(d, dossiers, dives)?.dossier === x)]));
    const sansPlongee = dossiers.filter(x => !lies.get(x).length);
    etat.textContent = `${dossiers.length} dossier${dossiers.length > 1 ? 's' : ''} daté${dossiers.length > 1 ? 's' : ''} · `
      + `${dossiers.length - sansPlongee.length} relié${dossiers.length - sansPlongee.length > 1 ? 's' : ''} à des plongées`
      + (sansPlongee.length ? ` · ${sansPlongee.length} sans plongée` : '');

    const lier = async (dossier, d) => {
      d.videoDossier = dossier.folderid;
      try { await store.saveDive(d); toast(`Dossier lié à la n°${d.numero ?? ''}`); } catch (e) { toast(e.message, true); }
      rendre();
    };
    const delier = async d => {
      delete d.videoDossier;
      try { await store.saveDive(d); toast('Lien retiré : retour au dossier de la même date'); } catch (e) { toast(e.message, true); }
      rendre();
    };

    const lignes = [...dossiers].reverse().map(x => {
      const plongees = lies.get(x);
      const apercu = x.fichiers.slice(0, 4);
      return el('div.card.video-dossier', { class: plongees.length ? null : 'orphelin' },
        el('div.video-tete', {},
          el('div', {}, el('b', { text: x.nom }),
            el('div.hint', { style: { margin: 0 }, text: `${fmtDate(x.date)} · ${x.fichiers.filter(f => f.video).length} vidéo(s), ${x.fichiers.filter(f => !f.video).length} photo(s)` })),
          el('a', { href: lienDossier(cfg, x.folderid), target: '_blank', rel: 'noopener', style: { color: 'var(--accent)', fontSize: '13px' }, text: 'pCloud ↗' })),
        apercu.length ? el('div.video-bande', {}, ...apercu.map((f, i) =>
          el('button.video-vignette', { type: 'button', onclick: () => lire(cfg, x.fichiers, i) },
            el('img', { src: urlMiniature(cfg, f.fileid, '240x180'), alt: f.nom, loading: 'lazy',
              onerror: e => { e.target.replaceWith(el('span.video-sans', { text: f.video ? '🎬' : '🖼' })); } }),
            f.video ? el('span.video-play', { text: '▶' }) : null))) : null,
        el('div.video-liens', {},
          ...plongees.map(d => el('span.chip.solid.video-plongee', {},
            el('button.lien-texte', { type: 'button', text: `n°${d.numero ?? '?'} · ${d.lieuNom || fmtDate(d.date)}${d.heureImmersion ? ` ${d.heureImmersion}` : ''}`,
              onclick: () => navigate(`dive/${d.id}`) }),
            d.videoDossier ? el('button.x', { type: 'button', title: 'Retirer ce lien', text: '×', onclick: () => delier(d) }) : null)),
          plongees.length ? null : el('span.hint', { style: { margin: 0 }, text: 'Aucune plongée ce jour-là.' }),
          el('button.btn.sm.ghost', { type: 'button', text: plongees.length ? '＋ Autre plongée' : '🔗 Lier à une plongée',
            onclick: () => choisirPlongee(x, dives, d => lier(x, d)) })));
    });
    corps.replaceChildren(...lignes);
  };

  const corps = el('div');
  wrap.append(
    el('div.btn-row', {},
      el('button.btn.sm', { type: 'button', text: '↻ Relire pCloud', onclick: () => rendre(true) }),
      el('button.btn.sm.ghost', { type: 'button', text: 'Changer le lien', onclick: () => navigate('reglages') })),
    corps);
  rendre();
  return { title: 'Mes vidéos', node: wrap, back: true };
}
