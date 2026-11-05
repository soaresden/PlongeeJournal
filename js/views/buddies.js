// ============================================================
//  Plongeurs : compagnons de palanquée, tampons et signatures
// ============================================================

import { el, fullName, nomPlongeur, couleurCategorie, toast, confirmBox, fileToDataURL, uid, openModal } from '../lib.js';
import { store, emptyBuddy } from '../store.js';
import { navigate } from '../router.js';
import { ouvrirApercu, ligneApercu, apercuPlongee } from '../apercu.js';

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
    return { title: 'Plongeurs', node: wrap };
  }

  // Tout le monde mélangé, en cartes. Les tags (OGN, Cap-Vert,
  // Cherbourg…) sont ceux que tu donnes, plusieurs par personne : ils
  // servent de filtre. (Le champ « categories » du carnet les garde.)
  // Un centre de plongée, c'est « un moniteur du centre », nom ou pas.
  const CLE_TRI = 'plongee-journal:plongeurs-tri';
  const CLE_FILTRE = 'plongee-journal:plongeurs-filtre';
  const lireCle = (k, def) => { try { return localStorage.getItem(k) || def; } catch { return def; } };
  let tri = lireCle(CLE_TRI, 'frequents');
  if (!['frequents', 'az'].includes(tri)) tri = 'frequents';
  let filtre = lireCle(CLE_FILTRE, '');

  const recherche = el('input', { type: 'search', placeholder: 'Nom, tag, licence…', autocapitalize: 'off' });
  const seg = el('div.seg');
  const puces = el('div.cat-filtres');
  const outilTag = el('div.tag-outil');
  const liste = el('div');
  wrap.append(el('div.annuaire-barre', {}, recherche, seg,
    el('button.btn.primary.sm', { type: 'button', text: '＋ Ajouter', onclick: () => navigate('buddy/new') })), puces, outilTag, liste);

  const n = b => st.buddyCount[b.id] || 0;
  const empreinte = b => (b.stamps || []).find(x => x.type !== 'signature') || (b.stamps || [])[0];
  const initiales = b => (b.structure ? (b.prenom || '?').slice(0, 2) : (b.prenom?.[0] || '') + (b.nom?.[0] || '')).toUpperCase() || '?';
  const cats = b => (b.categories || []).filter(Boolean);
  const estMoniteur = b => !!(b.moniteur || b.structure);

  function carte(b) {
    const e = empreinte(b);
    const nb = n(b);
    const sous = b.structure ? 'nom pas noté' : (b.licence ? `licence ${b.licence}` : '');
    return el(`button.pcarte${estMoniteur(b) ? '.mon' : ''}`, { type: 'button', onclick: () => apercuPlongeur(b.id, { onClose: recharger }) },
      el('span.personne-av', {}, e ? el('img', { src: e.dataUrl, alt: '', loading: 'lazy' }) : initiales(b)),
      el('span.pcarte-txt', {},
        el('b', { text: b.structure ? (b.prenom || 'Centre') : (nomPlongeur(b) || 'Sans nom') }),
        el('span.pcarte-badges', {},
          estMoniteur(b) ? el('span.badge-mon', { text: b.structure ? 'Moniteur du centre' : 'Moniteur' }) : null,
          ...cats(b).map(c => el('span.cat', { style: { '--cat': couleurCategorie(c) }, text: c }))),
        sous ? el('span.pcarte-sous', { text: sous }) : null),
      nb ? el('span.personne-n', { title: `${nb} plongée${nb > 1 ? 's' : ''} ensemble`, text: String(nb) }) : null);
  }

  function rendre() {
    seg.innerHTML = '';
    [['frequents', 'Fréquents'], ['az', 'A–Z']].forEach(([id, label]) => {
      const bt = el('button', { type: 'button', text: label });
      if (id === tri) bt.classList.add('on');
      bt.onclick = () => { tri = id; try { localStorage.setItem(CLE_TRI, id); } catch { /* privé */ } rendre(); };
      seg.append(bt);
    });

    // Les filtres : tout, les moniteurs, chaque catégorie, sans catégorie.
    const compte = new Map();
    const gens = buddies.filter(b => !b.structure);
    gens.forEach(b => cats(b).forEach(c => compte.set(c, (compte.get(c) || 0) + 1)));
    const categories = [...compte.keys()].sort((x, y) => x.localeCompare(y, 'fr'));
    if (filtre.startsWith('cat:') && !compte.has(filtre.slice(4))) filtre = '';
    const choix = [
      ['', 'Tous', gens.length, null],
      ['mon', 'Moniteurs', gens.filter(estMoniteur).length, null],
      ...categories.map(c => [`cat:${c}`, c, compte.get(c), couleurCategorie(c)]),
      ['sans', 'Sans tag', gens.filter(b => !cats(b).length).length, null],
    ];
    puces.replaceChildren(...choix.filter(([id, , nb]) => nb || !id).map(([id, label, nb, couleur]) => {
      const p = el(`button.cat-filtre${id === filtre ? '.on' : ''}`, { type: 'button',
        style: couleur ? { '--cat': couleur } : null,
        onclick: () => { filtre = id; try { localStorage.setItem(CLE_FILTRE, id); } catch { /* privé */ } rendre(); } },
        couleur ? el('i') : null, label, el('small', { text: String(nb) }));
      return p;
    }));

    // Un tag choisi : on peut le renommer pour tout le monde.
    outilTag.replaceChildren();
    if (filtre.startsWith('cat:')) {
      const tag = filtre.slice(4);
      const champ = el('input', { type: 'text', value: tag, enterkeyhint: 'done' });
      const renommer = async () => {
        const nv = champ.value.trim();
        if (!nv || nv === tag) return;
        for (const b of buddies.filter(x => cats(x).includes(tag))) {
          const frais = await store.getBuddy(b.id);
          frais.categories = [...new Set((frais.categories || []).map(c => (c === tag ? nv : c)))];
          await store.saveBuddy(frais);
        }
        filtre = `cat:${nv}`;
        try { localStorage.setItem(CLE_FILTRE, filtre); } catch { /* privé */ }
        toast(`« ${tag} » devient « ${nv} »`);
        recharger();
      };
      champ.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); renommer(); } });
      outilTag.append(el('span', { text: 'Renommer ce tag pour tout le monde :' }), champ,
        el('button.btn.sm', { type: 'button', text: 'Renommer', onclick: renommer }));
    }

    const q = recherche.value.trim().toLowerCase();
    let filtres = buddies.filter(b => {
      if (b.structure) return false;   // les anciens « centres » : notés sur les plongées
      if (filtre === 'mon' && !estMoniteur(b)) return false;
      if (filtre === 'sans' && cats(b).length) return false;
      if (filtre.startsWith('cat:') && !cats(b).includes(filtre.slice(4))) return false;
      return !q || `${nomPlongeur(b)} ${fullName(b)} ${b.licence || ''} ${cats(b).join(' ')}`.toLowerCase().includes(q);
    });
    filtres = tri === 'az'
      ? filtres.sort((x, y) => nomPlongeur(x).localeCompare(nomPlongeur(y), 'fr'))
      : filtres.sort((x, y) => n(y) - n(x) || nomPlongeur(x).localeCompare(nomPlongeur(y), 'fr'));

    liste.replaceChildren(filtres.length
      ? el('div.pgrille', {}, ...filtres.map(carte))
      : el('div.empty', { text: 'Aucun plongeur ne correspond.' }));
  }

  async function recharger() {
    buddies.splice(0, buddies.length, ...await store.listBuddies());
    rendre();
  }

  recherche.addEventListener('input', rendre);
  rendre();

  return { title: 'Plongeurs', node: wrap };
}

/** Aperçu modifiable d'un plongeur, sur le bord de l'écran. */
export async function apercuPlongeur(id, { onClose = null } = {}) {
  const b = structuredClone(await store.getBuddy(id));
  if (!b) return toast('Plongeur introuvable', true);
  const diverId = await store.getActiveDiverId();
  const ensemble = diverId ? (await store.listDives(diverId)).filter(d => (d.buddyIds || []).includes(b.id)) : [];
  const tous = await store.listBuddies();
  const connues = [...new Set(tous.flatMap(x => x.categories || []).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'fr'));

  const temoin = el('span.apercu-temoin');
  let t = null;
  const maj = p => {
    Object.assign(b, p);
    temoin.textContent = '…';
    temoin.className = 'apercu-temoin';
    clearTimeout(t);
    t = setTimeout(async () => {
      if (!String(b.prenom || '').trim() && !String(b.nom || '').trim()) { temoin.textContent = 'Il faut un nom'; return; }
      await store.saveBuddy(b);
      temoin.textContent = 'Enregistré ✓';
      temoin.className = 'apercu-temoin ok';
    }, 500);
  };
  const champ = (label, controle, large = false) => el(`label.apercu-champ${large ? '.large' : ''}`, {}, el('span', { text: label }), controle);
  const saisie = (cle, attrs = {}) => {
    const i = el('input', { type: 'text', ...attrs });
    i.value = b[cle] ?? '';
    i.addEventListener('input', () => maj({ [cle]: i.value }));
    return i;
  };
  const coche = (cle, label) => {
    const c = el('input', { type: 'checkbox' });
    c.checked = !!b[cle];
    c.onchange = () => maj({ [cle]: c.checked });
    return el('label.switch', {}, c, el('span', { text: label }));
  };
  const note = el('textarea', { rows: 3 });
  note.value = b.note || '';
  note.addEventListener('input', () => maj({ note: note.value }));

  // Tags : ceux déjà donnés à quelqu'un, à cocher ; ou un nouveau.
  const zoneCats = el('div.cat-edition');
  const rendreCats = () => {
    const mes = new Set(b.categories || []);
    const toutes = [...new Set([...connues, ...mes])].sort((x, y) => x.localeCompare(y, 'fr'));
    const nouvelle = el('input', { type: 'text', placeholder: 'Nouveau tag : OGN, Cap-Vert…', enterkeyhint: 'done' });
    const ajouter = () => {
      const v = nouvelle.value.trim();
      if (!v) return;
      const deja = toutes.find(c => c.toLowerCase() === v.toLowerCase()) || v;
      if (!connues.includes(deja)) connues.push(deja);
      maj({ categories: [...new Set([...(b.categories || []), deja])] });
      rendreCats();
    };
    nouvelle.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); ajouter(); } });
    zoneCats.replaceChildren(
      ...toutes.map(c => el(`button.cat-filtre${mes.has(c) ? '.on' : ''}`, { type: 'button', style: { '--cat': couleurCategorie(c) },
        onclick: () => {
          const s = new Set(b.categories || []);
          s.has(c) ? s.delete(c) : s.add(c);
          maj({ categories: [...s] });
          rendreCats();
        } }, el('i'), c)),
      el('span.cat-nouvelle', {}, nouvelle, el('button.btn.sm', { type: 'button', text: 'Ajouter', onclick: ajouter })));
  };
  rendreCats();

  const e = (b.stamps || []).find(x => x.type !== 'signature') || (b.stamps || [])[0];
  const tete = el('div.apercu-tete-plongee', {},
    el('span.personne-av', { style: { width: '52px', height: '52px', flex: '0 0 52px', fontSize: '17px' } },
      e ? el('img', { src: e.dataUrl, alt: '' }) : ((b.prenom?.[0] || '') + (b.nom?.[0] || '')).toUpperCase() || '?'),
    el('div', {},
      el('div.apercu-t1', { text: b.structure ? (b.prenom || 'Centre') : (nomPlongeur(b) || 'Sans nom') }),
      el('div.apercu-t2', { text: [ensemble.length ? `${ensemble.length} plongée${ensemble.length > 1 ? 's' : ''} ensemble` : 'pas encore plongé ensemble'].filter(Boolean).join(' · ') })));

  const rouvrir = () => apercuPlongeur(id, { onClose });
  const corps = el('div', {},
    el('div.apercu-grille', {},
      champ(b.structure ? 'Centre de plongée' : 'Prénom', saisie('prenom')),
      b.structure ? null : champ('Nom', saisie('nom')),
      b.structure ? null : champ('Licence', saisie('licence')),
      el('div.apercu-champ.large', {}, coche('moniteur', 'Moniteur')),
      el('div.apercu-champ.large', {}, el('span', { text: 'Tags' }), zoneCats),
      champ('Note', note, true)),
    (b.stamps || []).length ? el('div.apercu-bloc', {}, el('div.apercu-lbl', { text: 'Tampons et signatures' }),
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        ...b.stamps.map(x => el('img', { src: x.dataUrl, alt: '', style: { height: '64px', background: '#fff', borderRadius: '8px', padding: '4px' } })))) : null,
    ensemble.length ? el('div.apercu-bloc', {}, el('div.apercu-lbl', { text: 'Plongées ensemble' }),
      el('div.apercu-liste', {}, ...ensemble.map(d => ligneApercu(d, () => apercuPlongee(d.id, { retour: rouvrir, onClose }))))) : null);

  const pied = el('div.apercu-actions', {}, temoin,
    el('button.btn.primary.sm', { type: 'button', text: 'Tampons, signature ›', onclick: () => navigate(`buddy/${b.id}`) }));

  ouvrirApercu({ tete, corps, pied }, { onClose });
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

  // Actions en tête : on ne les cherche pas en bas d'un formulaire.
  const buttons = el('div.btn-row.actions-fiche', {},
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

  // Une structure n'est pas une personne : on masque ce qui n'a pas
  // de sens pour elle (nom de famille, licence) et on propose la
  // recherche de son logo.
  const blocIdentite = el('div.card');

  function rendreIdentite() {
    blocIdentite.innerHTML = '';

    const caseStructure = el('input', { type: 'checkbox' });
    caseStructure.checked = !!b.structure;
    caseStructure.onchange = () => {
      set({ structure: caseStructure.checked });
      if (caseStructure.checked) set({ nom: '', licence: '' });
      rendreIdentite();
    };

    blocIdentite.append(
      el('label.switch', { style: { marginBottom: '14px' } }, caseStructure,
        el('span', { text: 'C’est un club / centre de plongée' })),
    );

    if (b.structure) {
      blocIdentite.append(
        field('Nom de la structure', input('text', b.prenom, v => set({ prenom: v }),
          { placeholder: 'Buceo Pandora' })),
        field('Lieu', input('text', b.club, v => set({ club: v }),
          { placeholder: 'Gran Canaria', list: 'clubs-connus' }),
          'Sert à regrouper la liste.'),
        listeClubs,
        field('Site web (optionnel)', input('text', b.siteWeb, v => set({ siteWeb: v }),
          { placeholder: 'buceopandora.com', inputmode: 'url', autocapitalize: 'off' })),
        el('div.hint', { style: { marginTop: 0 },
          text: 'Une structure n’a ni nom de famille ni licence : son « tampon » est '
              + 'son logo, qu’on retrouve en général en deux clics.' }),
        el('div.btn-row', {},
          el('button.btn.sm', { type: 'button', text: '🔎 Chercher le logo',
            onclick: () => chercherLogo() }),
          b.siteWeb
            ? el('button.btn.sm.ghost', { type: 'button', text: '⬇ Depuis le site',
                onclick: () => logoDepuisSite() })
            : null,
        ),
      );
      return;
    }

    const caseMoniteur = el('input', { type: 'checkbox' });
    caseMoniteur.checked = !!b.moniteur;
    caseMoniteur.onchange = () => set({ moniteur: caseMoniteur.checked });

    blocIdentite.append(
      el('div.row', {},
        field('Prénom', input('text', b.prenom, v => set({ prenom: v }))),
        field('Nom', input('text', b.nom, v => set({ nom: v }))),
      ),
      field('N° de licence', input('text', b.licence, v => set({ licence: v }),
        { placeholder: 'A-12-345678', autocapitalize: 'characters' }),
        'Identifiant unique du plongeur : deux fiches ne peuvent pas porter le même numéro.'),
      field('Club / structure', input('text', b.club, v => set({ club: v }),
        { placeholder: 'La Garenne, Corfou Plongée…', list: 'clubs-connus' }),
        'Sert à regrouper la liste.'),
      listeClubs,
      field('Qualification',
        el('label.switch', {}, caseMoniteur, el('span', { text: 'C’est un moniteur' })),
        'Un niveau (N1, N3…) change avec le temps : le figer ici serait faux pour '
      + 'tes plongées passées. Seul « moniteur ou non » reste vrai. Ton propre niveau, '
      + 'lui, est enregistré sur chaque plongée.'),
      field('Note', input('text', b.note, v => set({ note: v }),
        { placeholder: 'Contact, remarque…' })),
    );
  }

  /**
   * Le logo d'un centre se trouve en deux clics sur le web. On ne peut
   * pas le télécharger à sa place — les moteurs bloquent les requêtes
   * automatiques — mais on ouvre la bonne recherche et on rappelle le
   * geste : enregistrer l'image, puis la déposer comme tampon.
   */
  function chercherLogo() {
    const nom = (b.prenom || '').trim();
    if (!nom) return toast('Renseigne d’abord le nom de la structure', true);
    const q = encodeURIComponent(`${nom} ${b.club || ''} logo plongée`.trim());
    window.open(`https://duckduckgo.com/?q=${q}&iax=images&ia=images`, '_blank', 'noopener');
    toast('Enregistre le logo, puis ajoute-le en tampon ci-dessous');
  }

  /** Tentative directe : le logo du site, via son favicon haute résolution. */
  async function logoDepuisSite() {
    const domaine = String(b.siteWeb || '').trim()
      .replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!domaine) return toast('Renseigne d’abord le site web', true);

    const url = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domaine)}&sz=256`;
    try {
      const dataUrl = await urlVersDataUrl(url);
      b.stamps.push({ id: uid(), dataUrl, label: 'Logo', type: 'tampon',
                      addedAt: new Date().toISOString() });
      renderStamps();
      toast('Logo récupéré — vérifie qu’il est net');
    } catch {
      toast('Logo introuvable depuis le site — passe par la recherche', true);
    }
  }

  /** Charge une image distante et la convertit, sans passer par le réseau applicatif. */
  function urlVersDataUrl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onerror = () => reject(new Error('Image inaccessible'));
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = img.width || 256; cv.height = img.height || 256;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0);
        try { resolve(cv.toDataURL('image/png')); }
        catch { reject(new Error('Image protégée')); }
      };
      img.src = url;
    });
  }

  rendreIdentite();

  form.append(el('div.section', {},
    el('h2', { text: 'Identité' }),
    blocIdentite,
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


  return { title: isNew ? 'Nouveau plongeur' : fullName(b), node: form, back: true };
}
