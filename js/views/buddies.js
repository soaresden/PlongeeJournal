// ============================================================
//  Plongeurs : compagnons de palanquée, tampons et signatures
// ============================================================

import { el, fullName, toast, confirmBox, fileToDataURL, uid, openModal } from '../lib.js';
import { store, emptyBuddy, parClub } from '../store.js';
import { navigate } from '../router.js';

// ------------------------------------------------------------
//  Signature manuscrite
//
//  Beaucoup de moniteurs signent le carnet sans tampon. On dessine
//  donc au doigt, et la signature est rangée comme un tampon —
//  elle s'applique de la même façon sur une plongée.
// ------------------------------------------------------------

function signaturePad(onValider) {
  const canvas = el('canvas', { width: 600, height: 260, class: 'signature-pad' });
  const ctx = canvas.getContext('2d');

  const fond = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#0f2b3d';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };
  fond();

  let dessine = false;
  let vierge = true;

  const point = e => {
    const r = canvas.getBoundingClientRect();
    const src = e.touches?.[0] ?? e;
    return {
      x: (src.clientX - r.left) * (canvas.width / r.width),
      y: (src.clientY - r.top) * (canvas.height / r.height),
    };
  };

  const debut = e => {
    e.preventDefault();
    dessine = true; vierge = false;
    const p = point(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  const trace = e => {
    if (!dessine) return;
    e.preventDefault();
    const p = point(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const fin = () => { dessine = false; };

  canvas.addEventListener('pointerdown', debut);
  canvas.addEventListener('pointermove', trace);
  canvas.addEventListener('pointerup', fin);
  canvas.addEventListener('pointerleave', fin);
  canvas.addEventListener('touchstart', debut, { passive: false });
  canvas.addEventListener('touchmove', trace, { passive: false });
  canvas.addEventListener('touchend', fin);

  return el('div', {},
    el('h3', { text: '✍ Signature' }),
    el('div.hint', { style: { marginTop: 0 },
      text: 'Fais signer directement sur l’écran, au doigt ou au stylet.' }),
    canvas,
    el('div.btn-row', {},
      el('button.btn.ghost', { type: 'button', text: 'Effacer',
        onclick: () => { fond(); vierge = true; } }),
      el('button.btn.primary', { type: 'button', text: 'Valider',
        onclick: () => {
          if (vierge) return toast('La zone est vide', true);
          onValider(canvas.toDataURL('image/png'));
        } }),
    ),
  );
}

function field(label, control, hint) {
  return el('div.field', {},
    label ? el('label.lbl', { text: label }) : null, control,
    hint ? el('div.hint', { text: hint }) : null);
}

function input(type, value, oninput, attrs = {}) {
  const n = el('input', { type, value: value ?? '', ...attrs });
  n.addEventListener('input', () => oninput(n.value));
  return n;
}

// ------------------------------------------------------------

export async function buddiesView() {
  const buddies = await store.listBuddies();
  const diverId = await store.getActiveDiverId();
  const st = diverId ? await store.stats(diverId) : { buddyCount: {} };
  const wrap = el('div');

  if (!buddies.length) {
    wrap.append(el('div.empty', {},
      el('span.big', { text: '🤿' }),
      'Aucun plongeur enregistré.', el('br'),
      'Ils apparaîtront à la saisie d’une plongée.',
      el('div', { style: { marginTop: '20px' } },
        el('button.btn.primary', { onclick: () => navigate('buddy/new') }, 'Ajouter un plongeur')),
    ));
    return { title: '🤿 Plongeurs', node: wrap };
  }

  const recherche = el('input', { type: 'search', placeholder: 'Filtrer par nom ou club…',
                                  autocapitalize: 'off' });
  const liste = el('div');
  wrap.append(el('div.field', {}, recherche), liste);

  /**
   * Une vignette compacte par plongeur.
   * Le statut moniteur et le nombre de plongées sont posés SUR l'image :
   * deux lignes de texte gagnées, donc deux fois plus de monde à l'écran.
   */
  function vignette(b) {
    const n = st.buddyCount[b.id] || 0;
    const empreinte = (b.stamps || []).find(s => s.type !== 'signature')
                   || (b.stamps || [])[0];

    return el('div.obs.clickable.buddy', {
      onclick: () => navigate(`buddy/${b.id}`),
      title: [fullName(b), b.moniteur ? 'moniteur' : null,
              n ? `${n} plongée${n > 1 ? 's' : ''} ensemble` : null].filter(Boolean).join(' · '),
    },
      empreinte
        ? el('img', { src: empreinte.dataUrl, alt: '', loading: 'lazy' })
        : el('div.obs-noimg.initiales', {
            text: ((b.prenom?.[0] || '') + (b.nom?.[0] || '')).toUpperCase() || '?' }),
      b.moniteur ? el('span.pastille-mon', { text: 'M', title: 'Moniteur' }) : null,
      n ? el('span.compteur', { text: String(n) }) : null,
      el('div.obs-nom', { text: fullName(b) }),
    );
  }

  function rendre() {
    const q = recherche.value.trim().toLowerCase();
    const filtres = q
      ? buddies.filter(b => `${fullName(b)} ${b.club || ''} ${b.licence || ''}`
          .toLowerCase().includes(q))
      : buddies;

    liste.innerHTML = '';
    if (!filtres.length) {
      liste.append(el('div.empty', { text: 'Aucun plongeur ne correspond.' }));
      return;
    }

    // Regroupement par club : la liste devient lisible dès qu'on plonge
    // avec plusieurs structures.
    parClub(filtres).forEach(groupe => {
      liste.append(el('div.groupe-club', { text: `${groupe.titre} · ${groupe.membres.length}` }));
      const grille = el('div.obs-grid.dense');
      groupe.membres
        .sort((x, y) => (y.moniteur ? 1 : 0) - (x.moniteur ? 1 : 0)
                     || fullName(x).localeCompare(fullName(y), 'fr'))
        .forEach(b => grille.append(vignette(b)));
      liste.append(grille);
    });
  }

  recherche.addEventListener('input', rendre);
  rendre();

  wrap.append(el('button.btn.block', { style: { marginTop: '18px' },
    onclick: () => navigate('buddy/new') }, '+ Ajouter un plongeur'));

  return { title: '🤿 Plongeurs', node: wrap };
}

// ------------------------------------------------------------

export async function buddyFormView({ id }) {
  const isNew = !id || id === 'new';
  let b = isNew ? emptyBuddy() : structuredClone(await store.getBuddy(id));
  if (!b) return { title: 'Introuvable', node: el('div.empty', { text: 'Plongeur introuvable.' }), back: true };
  b.stamps ||= [];

  const set = p => Object.assign(b, p);
  const form = el('form', { onsubmit: e => e.preventDefault() });

  // Propose les clubs déjà saisis, sans imposer de liste fermée.
  const tousLesClubs = [...new Set((await store.listBuddies())
    .map(x => (x.club || '').trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'fr'));
  const listeClubs = el('datalist', { id: 'clubs-connus' },
    tousLesClubs.map(c => el('option', { value: c })));

  form.append(el('div.section', {},
    el('h2', { text: 'Identité' }),
    el('div.card', {},
      el('div.row', {},
        field('Prénom', input('text', b.prenom, v => set({ prenom: v }))),
        field('Nom', input('text', b.nom, v => set({ nom: v }))),
      ),
      field('N° de licence', input('text', b.licence, v => set({ licence: v }),
        { placeholder: 'A-12-345678', autocapitalize: 'characters' }),
        'Identifiant unique du plongeur : deux fiches ne peuvent pas porter le même numéro.'),
      field('Club / structure', input('text', b.club, v => set({ club: v }),
        { placeholder: 'La Garenne, Corfou Plongée…', list: 'clubs-connus' }),
        'Sert à regrouper la liste des compagnons.'),
      listeClubs,
      field('Qualification', (() => {
        const c = el('input', { type: 'checkbox' });
        c.checked = !!b.moniteur;
        c.onchange = () => set({ moniteur: c.checked });
        return el('label.switch', {}, c, el('span', { text: 'C’est un moniteur' }));
      })(),
        'Un niveau (N1, N3…) change avec le temps : le figer ici serait faux pour '
      + 'tes plongées passées. Seul « moniteur ou non » reste vrai. Ton propre niveau, '
      + 'lui, est enregistré sur chaque plongée.'),
      b.niveau
        ? field('Ancien niveau saisi', el('div.hint', { style: { marginTop: 0 },
            text: `« ${b.niveau} » — conservé pour mémoire, plus utilisé.` }))
        : null,
      field('Note', input('text', b.note, v => set({ note: v }),
        { placeholder: 'Contact, remarque…' })),
    ),
  ));

  // ---- Tampons ----
  const grid = el('div.stamp-grid');
  const fileIn = el('input', { type: 'file', accept: 'image/*', hidden: true, multiple: true });

  fileIn.onchange = async () => {
    const files = Array.from(fileIn.files || []);
    for (const f of files) {
      try {
        await ouvrirDetourage(f, dataUrl => {
          b.stamps.push({ id: uid(), dataUrl, label: '', type: 'tampon',
                          addedAt: new Date().toISOString() });
          renderStamps();
        });
      } catch (e) { toast(e.message, true); }
    }
    fileIn.value = '';
  };

  /**
   * Photo du carnet papier → tampon détouré.
   * Le cadre est proposé automatiquement puis ajustable à la main :
   * une détection ratée ne doit jamais bloquer.
   */
  async function ouvrirDetourage(fichier, onValider) {
    const { traiterFichier, decouper } = await import('../stamp.js');

    let img, cadre;
    try {
      ({ img, cadre } = await traiterFichier(fichier));
    } catch (e) { return toast(e.message, true); }

    openModal(close => {
      const scene = el('div.crop-scene');
      const photo = el('img', { src: img.src, class: 'crop-photo' });
      const rect = el('div.crop-rect');
      const apercu = el('img', { class: 'crop-apercu' });
      const nettoyerCase = el('input', { type: 'checkbox' });
      nettoyerCase.checked = true;

      const majApercu = () => {
        apercu.src = decouper(img, cadre, { nettoyer: nettoyerCase.checked });
      };
      nettoyerCase.onchange = majApercu;

      const placer = () => {
        rect.style.left = `${cadre.x * 100}%`;
        rect.style.top = `${cadre.y * 100}%`;
        rect.style.width = `${cadre.w * 100}%`;
        rect.style.height = `${cadre.h * 100}%`;
      };

      // Tracé libre d'un nouveau cadre au doigt.
      let depart = null;
      const position = e => {
        const r = scene.getBoundingClientRect();
        const src = e.touches?.[0] ?? e;
        return {
          x: Math.min(1, Math.max(0, (src.clientX - r.left) / r.width)),
          y: Math.min(1, Math.max(0, (src.clientY - r.top) / r.height)),
        };
      };
      scene.addEventListener('pointerdown', e => {
        e.preventDefault(); depart = position(e);
      });
      scene.addEventListener('pointermove', e => {
        if (!depart) return;
        e.preventDefault();
        const p = position(e);
        cadre = {
          x: Math.min(depart.x, p.x), y: Math.min(depart.y, p.y),
          w: Math.abs(p.x - depart.x), h: Math.abs(p.y - depart.y),
        };
        placer();
      });
      const finTrace = () => {
        if (!depart) return;
        depart = null;
        if (cadre.w > 0.03 && cadre.h > 0.03) majApercu();
      };
      scene.addEventListener('pointerup', finTrace);
      scene.addEventListener('pointerleave', finTrace);

      scene.append(photo, rect);
      placer(); majApercu();

      return el('div', {},
        el('h3', { text: '🔍 Détourage du tampon' }),
        el('div.hint', { style: { marginTop: 0 },
          text: cadre.confiance > 0.5
            ? 'Cadre proposé automatiquement. Trace-en un autre au doigt s’il est à côté.'
            : 'Détection peu sûre : trace le cadre du tampon au doigt sur la photo.' }),
        scene,
        el('div.lbl', { style: { marginTop: '14px' }, text: 'Résultat' }),
        el('div.crop-resultat', {}, apercu),
        el('label.switch', { style: { marginTop: '10px' } }, nettoyerCase,
          el('span', { text: 'Nettoyer le fond (papier au blanc, encre renforcée)' })),
        el('div.btn-row', {},
          el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }),
          el('button.btn.primary', { type: 'button', text: 'Ajouter ce tampon',
            onclick: () => {
              onValider(decouper(img, cadre, { nettoyer: nettoyerCase.checked }));
              close();
              toast('Tampon détouré et ajouté');
            } }),
        ),
      );
    });
  }

  function renderStamps() {
    grid.innerHTML = '';
    b.stamps.forEach(s => {
      grid.append(el('div.stamp', {},
        el('img', { src: s.dataUrl, alt: s.label || 'Tampon' }),
        s.type === 'signature'
          ? el('span', { class: 'obs-n', style: { position: 'absolute', bottom: '2px', left: '4px',
              background: 'rgba(0,0,0,.55)', color: '#fff', borderRadius: '4px', padding: '0 4px' },
              text: 'signature' })
          : null,
        el('button.del', {
          type: 'button', text: '×',
          onclick: async e => {
            e.stopPropagation();
            if (await confirmBox(`Supprimer ${s.type === 'signature' ? 'cette signature' : 'ce tampon'} ?`,
                                 'Supprimer')) {
              b.stamps = b.stamps.filter(x => x.id !== s.id);
              renderStamps();
            }
          },
        }),
      ));
    });
    grid.append(el('button.stamp-add', { type: 'button', text: '+', title: 'Photographier un tampon',
      onclick: () => fileIn.click() }));
  }
  renderStamps();

  form.append(el('div.section', {},
    el('h2', { text: 'Tampons & signatures' }),
    el('div.card', {},
      grid, fileIn,
      el('div.btn-row', {},
        el('button.btn.sm', { type: 'button', text: '📷 Photographier un tampon',
          onclick: () => fileIn.click() }),
        el('button.btn.sm', { type: 'button', text: '✍ Faire signer',
          onclick: () => {
            const fermer = openModal(() => signaturePad(dataUrl => {
              b.stamps.push({ id: uid(), dataUrl, label: 'Signature',
                              type: 'signature', addedAt: new Date().toISOString() });
              renderStamps();
              fermer();
              toast('Signature enregistrée');
            }));
          } }),
      ),
      el('div.hint', { text: 'Tout le monde n’a pas de tampon : la signature manuscrite fait le même '
        + 'office et s’applique pareil sur une plongée.' }),
    ),
  ));

  const buttons = el('div.btn-row', {},
    el('button.btn.primary', {
      type: 'button', text: isNew ? 'Ajouter' : 'Enregistrer',
      onclick: async () => {
        if (!b.prenom.trim() && !b.nom.trim()) return toast('Indique au moins un nom', true);

        // Le numéro de licence identifie une personne : pas de doublon.
        const licence = String(b.licence || '').trim();
        if (licence) {
          const autres = await store.listBuddies();
          const collision = autres.find(x => x.id !== b.id
            && String(x.licence || '').trim().toLowerCase() === licence.toLowerCase());
          if (collision) {
            return toast(`Licence déjà utilisée par ${fullName(collision)}`, true);
          }
        }

        try {
          await store.saveBuddy(b);
          toast('Plongeur enregistré');
          navigate('buddies', true);
        } catch (e) { toast(e.message, true); }
      },
    }),
  );

  if (!isNew) {
    buttons.append(el('button.btn.danger', {
      type: 'button', text: 'Supprimer',
      onclick: async () => {
        if (await confirmBox(`Supprimer ${fullName(b)} ? Il sera retiré des plongées où il apparaît.`, 'Supprimer')) {
          await store.deleteBuddy(b.id);
          toast('Plongeur supprimé');
          navigate('buddies', true);
        }
      },
    }));
  }
  form.append(buttons);

  return { title: isNew ? 'Nouveau plongeur' : fullName(b), node: form, back: true };
}
