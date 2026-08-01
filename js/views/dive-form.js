// ============================================================
//  Formulaire de saisie / modification d'une plongée
// ============================================================

import { el, toast, num, fullName, openModal, fileToDataURL, confirmBox, todayISO,
         minToTime, timeToMin, scrollTo } from '../lib.js';
import { store, emptyDive, emptyBuddy, reconcileTimes, validerPlongee,
         appliquerOptionsAuto, niveauCourant, libelleGaz, pmuNitrox,
         libelleMateriel } from '../store.js';
import { editerMateriel, ligneMateriel } from './materiel.js';
import { DIVE_TYPES, DIVE_OPTIONS, DIVE_GOALS, PALANQUEE_MODES,
         OPTIONS_AUTO, VISIBILITES, COMBI_TYPES, COMBI_MM, NIVEAUX,
         GAZ, gazParId, BLOC_TYPES, BLOC_MATIERES, typeMateriel } from '../config.js';
import { locationPicker } from '../map.js';
import { navigate } from '../router.js';
import { takeDraft } from '../draft.js';
import { profileSvg } from '../fit.js';

// --- petits assembleurs de champs ---------------------------

function field(label, control, hint, requis = false) {
  const node = el('div.field', {},
    label
      ? el('label.lbl', {}, label, requis ? el('span.requis', { text: ' •' }) : null)
      : null,
    control,
    hint ? (hint instanceof Node ? hint : el('div.hint', { text: hint })) : null,
  );
  if (requis) node.dataset.requis = '1';
  return node;
}


function input(type, value, oninput, attrs = {}) {
  const node = el('input', { type, value: value ?? '', ...attrs });
  node.addEventListener('input', () => oninput(node.value));
  return node;
}

function numInput(value, oninput, attrs = {}) {
  return input('text', value ?? '', v => oninput(num(v)),
    { inputmode: 'decimal', ...attrs });
}

function textarea(value, oninput, placeholder) {
  const node = el('textarea', { placeholder: placeholder || '' });
  node.value = value || '';
  node.addEventListener('input', () => oninput(node.value));
  return node;
}

function chipGroup(items, selected, onToggle) {
  const wrap = el('div.chips');
  items.forEach(item => {
    const c = el('button.chip', { type: 'button', text: item });
    if (selected.includes(item)) c.classList.add('on');
    c.onclick = () => {
      c.classList.toggle('on');
      onToggle(item, c.classList.contains('on'));
    };
    wrap.append(c);
  });
  return wrap;
}

function segmented(options, current, onPick) {
  const wrap = el('div.seg');
  options.forEach(o => {
    const b = el('button', { type: 'button', text: o.label });
    if (o.id === current) b.classList.add('on');
    b.onclick = () => {
      wrap.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      onPick(o.id);
    };
    wrap.append(b);
  });
  return wrap;
}

/**
 * Section repliable.
 *
 * Le formulaire est long : on va de l'essentiel au détail, et tout ce
 * qui est facultatif est replié par défaut. Sur téléphone, ça change
 * tout — on saisit une plongée valable sans jamais dérouler la suite.
 */
function section(titre, options, ...contenu) {
  // Appel court : section('Titre', ...contenu)
  if (options && (options instanceof Node || typeof options !== 'object')) {
    contenu = [options, ...contenu];
    options = {};
  }
  const { ouvert = true, icone = '', id = '' } = options || {};

  const corps = el('div.card', {}, ...contenu);
  const fleche = el('span.sec-fleche', { text: '▾' });
  const entete = el('button.sec-entete', { type: 'button' },
    icone ? el('span', { text: icone + ' ' }) : null,
    el('span.sec-titre', { text: titre }),
    fleche);

  const bloc = el('div.section.repliable', {}, entete, corps);
  if (id) bloc.id = id;

  const appliquer = etat => {
    bloc.classList.toggle('replie', !etat);
    corps.hidden = !etat;
    fleche.textContent = etat ? '▾' : '▸';
    entete.setAttribute('aria-expanded', String(etat));
  };
  appliquer(ouvert);

  entete.onclick = () => appliquer(corps.hidden);
  // Déplier automatiquement si un champ obligatoire manque à l'intérieur.
  bloc.deplier = () => appliquer(true);

  return bloc;
}

// ============================================================
//  « Ce que j'ai vu » — faune, flore, épaves
//
//  Les suggestions viennent de ce qui a réellement été observé
//  autour du point de plongée, du plus fréquent au plus rare, avec
//  une photo : c'est ce qui permet d'identifier sans rien y
//  connaître. On peut aussi chercher par nom, ou saisir à la main.
// ============================================================

const CATEGORIES = [
  { cle: 'vuFaune',  titre: 'Faune',  icone: '🐟', vide: 'poisson, nudibranche, crustacé…' },
  { cle: 'vuFlore',  titre: 'Flore',  icone: '🌿', vide: 'algue, posidonie, gorgone…' },
  { cle: 'vuEpaves', titre: 'Épaves', icone: '⚓', vide: 'épave, avion, structure immergée…' },
];

function observationsPicker(dive) {
  const wrap = el('div');

  CATEGORIES.forEach(cat => {
    dive[cat.cle] ||= [];

    const grille = el('div.obs-grid');
    const zone = el('div');

    function rendreSelection() {
      grille.innerHTML = '';
      const liste = dive[cat.cle];
      if (!liste.length) {
        grille.append(el('div.hint', { style: { marginTop: 0, gridColumn: '1/-1' },
          text: `Rien de coché — ${cat.vide}` }));
        return;
      }
      liste.forEach(o => grille.append(carteObservation(o, () => {
        dive[cat.cle] = dive[cat.cle].filter(x => String(x.id) !== String(o.id));
        rendreSelection();
      })));
    }

    const boutons = el('div.btn-row', { style: { marginTop: '10px' } },
      el('button.btn.sm', {
        type: 'button',
        text: cat.cle === 'vuEpaves' ? '⚓ Épaves du coin' : '＋ Ajouter ce que j’ai vu',
        onclick: () => ouvrirSuggestions(dive, cat, rendreSelection),
      }),
      el('button.btn.sm.ghost', {
        type: 'button', text: '✎ À la main',
        onclick: () => ajoutManuel(dive, cat, rendreSelection),
      }),
    );

    rendreSelection();
    zone.append(
      el('div', { style: { fontWeight: '650', marginBottom: '8px' },
        text: `${cat.icone} ${cat.titre}` }),
      grille, boutons);

    wrap.append(el('div.card', {}, zone));
  });

  return wrap;
}

/** Vignette d'une observation retenue. */
function carteObservation(o, onRemove) {
  return el('div.obs', {},
    o.photo
      ? el('img', { src: o.photo, alt: o.nom, loading: 'lazy' })
      : el('div.obs-noimg', { text: o.source === 'osm' ? '⚓' : '?' }),
    el('div.obs-nom', { text: o.nom }),
    onRemove ? el('button.del', { type: 'button', text: '×',
      onclick: e => { e.stopPropagation(); onRemove(); } }) : null,
  );
}

/** Grille de résultats cochables, partagée par les suggestions et la recherche. */
function grilleResultats(items, dive, cat, onChange) {
  const grille = el('div.obs-grid');

  items.forEach(t => {
    const choisi = () => dive[cat.cle].some(x => String(x.id) === String(t.id));
    const cell = el('div.obs.clickable', {},
      t.photo
        ? el('img', { src: t.photo, alt: t.nom, loading: 'lazy' })
        : el('div.obs-noimg', { text: t.source === 'osm' ? '⚓' : '?' }),
      el('div.obs-nom', { text: t.nom }),
      t.sci && t.sci !== t.nom ? el('div.obs-sci', { text: t.sci }) : null,
      t.observations ? el('div.obs-n', { text: `${t.observations} obs.` }) : null,
      t.distance != null ? el('div.obs-n', { text: `${t.distance} km` }) : null,
    );

    const maj = () => cell.classList.toggle('on', choisi());
    cell.onclick = async () => {
      const { versObservation } = await import('../species.js');
      if (choisi()) dive[cat.cle] = dive[cat.cle].filter(x => String(x.id) !== String(t.id));
      else dive[cat.cle] = [...dive[cat.cle], versObservation(t)];
      maj();
      onChange();
    };
    maj();
    grille.append(cell);
  });

  return grille;
}

/**
 * Une seule fenêtre : la liste du lieu s'affiche d'emblée, du plus
 * probable au moins probable. Dès qu'on tape, elle se filtre ; si le
 * mot ne correspond à rien de local, on va chercher dans le catalogue
 * mondial (utile pour « tortue » là où personne n'en a déclaré).
 */
async function ouvrirSuggestions(dive, cat, onChange) {
  if (dive.lat == null) {
    return toast('Pose d’abord le point de plongée sur la carte', true);
  }

  openModal(close => {
    const champ = el('input', { type: 'search', autocapitalize: 'off', enterkeyhint: 'search',
      placeholder: cat.cle === 'vuEpaves' ? 'Filtrer par nom d’épave…' : 'Filtrer : tortue, murène, algue…' });
    const info = el('div.hint', { style: { marginTop: 0 }, text: 'Lecture en cours…' });
    const corps = el('div');
    const pied = el('div.hint');

    let local = [];          // ce qui a été observé près du lieu
    const eau = dive.eau || 'salee';

    const sansAccent = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    function afficher(liste, note) {
      corps.innerHTML = '';
      if (!liste.length) {
        corps.append(el('div.hint', { style: { marginTop: 0 }, text: note || 'Aucun résultat.' }));
        return;
      }
      corps.append(grilleResultats(liste, dive, cat, onChange));
    }

    // Filtre instantané sur la liste locale ; recherche mondiale en secours.
    const filtrer = debounceLocal(async () => {
      const q = sansAccent(champ.value.trim());

      if (!q) {
        afficher(local);
        info.textContent = messageListe();
        return;
      }

      const trouves = local.filter(t => sansAccent(t.nom).includes(q) || sansAccent(t.sci).includes(q));

      if (trouves.length) {
        afficher(trouves);
        info.textContent = `${trouves.length} résultat(s) parmi ce qui se voit ici.`;
        return;
      }

      if (cat.cle === 'vuEpaves' || q.length < 3) {
        afficher([], 'Rien de tel dans la liste du lieu.');
        info.textContent = '';
        return;
      }

      info.textContent = 'Rien ici — recherche dans le catalogue mondial…';
      try {
        const api = await import('../species.js');
        const liste = (await api.chercherEspece(champ.value.trim())).filter(t => t.photo);
        afficher(liste, 'Aucun résultat, même en recherche mondiale.');
        info.textContent = liste.length
          ? 'Résultats hors liste locale — jamais déclaré sur ce site, mais ça arrive.'
          : '';
      } catch (e) {
        afficher([], e.message);
        info.textContent = '';
      }
    }, 300);

    champ.addEventListener('input', filtrer);

    function messageListe() {
      if (cat.cle === 'vuEpaves') {
        return `${local.length} épave(s) cartographiée(s) autour du point, la plus proche en premier.`;
      }
      const base = `${local.length} espèces, de la plus fréquemment rencontrée ici à la plus rare.`;
      if (elargi) {
        return base + ' Filtre élargi : les espèces dont le milieu n’est pas renseigné sont incluses.';
      }
      return base + ` Uniquement ce qui est confirmé aquatique en eau ${eau === 'douce' ? 'douce' : 'salée'}.`;
    }

    let bilan = null;
    let elargi = false;
    const bascule = el('div', { style: { margin: '4px 0 10px' } });

    /** Alterne entre le tri strict et le tri large. */
    function choisirListe() {
      if (!bilan) return local;
      const src = elargi ? bilan.large : bilan;
      return cat.cle === 'vuFaune' ? src.faune : src.flore;
    }

    function rendreBascule() {
      if (!bilan) { bascule.innerHTML = ''; return; }
      const nStrict = (cat.cle === 'vuFaune' ? bilan.faune : bilan.flore).length;
      const nLarge = (cat.cle === 'vuFaune' ? bilan.large.faune : bilan.large.flore).length;
      if (nLarge <= nStrict) { bascule.innerHTML = ''; return; }

      bascule.innerHTML = '';
      bascule.append(el('button.chip', {
        type: 'button',
        class: elargi ? 'chip on' : 'chip',
        text: elargi
          ? `✓ Tout ce qui est relevé ici (${nLarge})`
          : `Élargir : ${nLarge - nStrict} espèces au milieu inconnu`,
        onclick: () => {
          elargi = !elargi;
          local = choisirListe();
          rendreBascule();
          champ.value ? filtrer() : afficher(local);
          info.textContent = messageListe();
        },
      }));
    }

    (async () => {
      try {
        const api = await import('../species.js');

        if (cat.cle === 'vuEpaves') {
          local = await api.epavesProches({ lat: dive.lat, lng: dive.lng });
        } else {
          const vu = await api.observationsProches({
            lat: dive.lat, lng: dive.lng, eau,
            onEtape: texte => { info.textContent = texte; },
          });
          bilan = vu;
          // Liste stricte trop maigre (typique de l'eau douce) : on élargit
          // d'emblée plutôt que d'afficher un écran presque vide.
          elargi = vu.maigre;
          local = choisirListe();
          rendreBascule();
        }

        info.textContent = local.length
          ? messageListe()
          : (cat.cle === 'vuEpaves'
              ? 'Aucune épave cartographiée dans un rayon de 20 km.'
              : 'Rien de référencé ici — tape un nom pour chercher partout.');

        afficher(local, info.textContent);

        pied.innerHTML = '';
        if (cat.cle === 'vuEpaves') {
          pied.append('Fiches détaillées (histoire, plan, profondeur) sur ',
            el('a', { href: api.lienWrecksite(local[0]?.nom || dive.lieuNom),
              target: '_blank', rel: 'noopener', style: { color: 'var(--accent)' } }, 'wrecksite.eu'),
            ' — leur base n’est pas ouverte aux applications, il faut y aller à la main. ',
            el('br'), 'Positions : OpenStreetMap. ',
            el('a', { href: api.lienRechercheWeb(dive.lieuNom || '', 'épave plongée'),
              target: '_blank', rel: 'noopener', style: { color: 'var(--accent)' } },
              'Chercher sur le web'), '.');
        } else {
          pied.append(
            bilan?.maigre
              ? el('div', { style: { color: 'var(--warn)' },
                  text: '⚠ Peu d’espèces confirmées aquatiques ici. C’est courant en eau douce : '
                      + 'les bases naturalistes recensent surtout ce qui s’observe depuis la berge. '
                      + 'Le filtre a donc été élargi automatiquement.' })
              : el('div', { text: `${bilan?.filtres ?? 0} espèces terrestres écartées sur `
                  + `${bilan?.total ?? 0} relevées autour du point.` }),
            el('div', {}, 'Sources : observations et photos ',
              el('a', { href: api.lienINat(dive.lat, dive.lng), target: '_blank', rel: 'noopener',
                style: { color: 'var(--accent)' } }, 'iNaturalist'),
              ' (Creative Commons), habitat vérifié auprès de ',
              el('a', { href: 'https://www.marinespecies.org/', target: '_blank', rel: 'noopener',
                style: { color: 'var(--accent)' } }, 'WoRMS'),
              ' et ',
              el('a', { href: 'https://www.gbif.org/', target: '_blank', rel: 'noopener',
                style: { color: 'var(--accent)' } }, 'GBIF'), '.'),
            el('div', {},
              el('a', { href: api.lienRechercheWeb(dive.lieuNom || ''), target: '_blank',
                rel: 'noopener', style: { color: 'var(--accent)' } },
                `Chercher « ${dive.lieuNom || 'ce lieu'} » sur le web`), '.'),
          );
        }
      } catch (e) {
        info.textContent = '';
        afficher([], e.message);
      }
    })();

    setTimeout(() => champ.focus(), 120);

    return el('div', {},
      el('h3', { text: `${cat.icone} ${cat.titre} — ${dive.lieuNom || 'ce lieu'}` }),
      el('div.field', {}, champ),
      info,
      bascule,
      corps,
      pied,
      el('div.btn-row', {}, el('button.btn.primary', { type: 'button', text: 'Terminé', onclick: close })),
    );
  });
}

function ajoutManuel(dive, cat, onChange) {
  openModal(close => {
    const nom = el('input', { type: 'text', placeholder: 'Nom de ce que tu as vu' });
    return el('div', {},
      el('h3', { text: `${cat.icone} Ajouter à la main` }),
      el('div.field', {}, nom),
      el('div.hint', { style: { marginTop: 0 }, text: 'Utile pour ce que les listes ne connaissent pas.' }),
      el('div.btn-row', {},
        el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }),
        el('button.btn.primary', { type: 'button', text: 'Ajouter',
          onclick: () => {
            const v = nom.value.trim();
            if (!v) return;
            dive[cat.cle] = [...dive[cat.cle],
              { id: `libre-${Date.now()}`, nom: v, sci: '', photo: '', source: 'libre' }];
            onChange(); close();
          } }),
      ),
    );
  });
}

function debounceLocal(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ============================================================

export async function diveFormView({ id }) {
  const diverId = await store.getActiveDiverId();
  if (!diverId) {
    return {
      title: 'Nouvelle plongée',
      node: el('div.empty', {},
        el('span.big', { text: '👤' }),
        'Crée d’abord ton profil de plongeur.',
        el('div', { style: { marginTop: '18px' } },
          el('button.btn.primary', { onclick: () => navigate('diver/new') }, 'Créer mon profil')),
      ),
    };
  }

  const isNew = !id;
  let dive = isNew
    ? emptyDive(diverId, await store.nextNumber(diverId))
    : structuredClone(await store.getDive(id));

  if (!dive) return { title: 'Introuvable', node: el('div.empty', { text: 'Plongée introuvable.' }) };

  // Données arrivant de l'import Suunto
  const draft = takeDraft();
  let suuntoNote = '';
  if (draft) {
    suuntoNote = draft._suuntoNote || '';
    delete draft._suuntoNote;
    Object.assign(dive, draft);
  }

  if (isNew && !dive.date) dive.date = todayISO();

  let buddies = await store.listBuddies();
  const profil = await store.getDiver(diverId);       // pour le matériel personnel
  const set = patch => Object.assign(dive, patch);

  // Combinaison : celle du profil sert de valeur de départ.
  if (isNew && !dive.combiType && profil?.combiType) {
    dive.combiType = profil.combiType;
    dive.combiMm = profil.combiMm || '';
  }

  const form = el('form', { onsubmit: e => e.preventDefault() });

  // ---------- 0. Import direct depuis l'ordinateur de plongée ----------
  //
  // Placé tout en haut : c'est le raccourci qui évite le plus de saisie.
  // Horaires, profondeurs, températures et profil arrivent d'un coup.
  if (!dive.profil?.length && !(dive.suuntoKeys || []).length) {
    form.append(el('button.btn.block.suunto-link', {
      type: 'button',
      onclick: () => navigate('suunto'),
    },
      el('span', { style: { fontSize: '20px' }, text: '⌚' }),
      el('span', {},
        el('div', { style: { fontWeight: '650' }, text: 'Link Suunto Dive' }),
        el('div', { style: { fontSize: '12px', opacity: '.75' },
          text: 'Importer la plongée depuis la montre' })),
      el('span', { style: { marginLeft: 'auto', opacity: '.6' }, text: '›' }),
    ));
  }

  // ---------- 0 bis. Bandeau import ordinateur de plongée ----------
  if (dive.profil?.length || (dive.suuntoKeys || []).length) {
    form.append(el('div.card', { style: { borderColor: 'var(--accent-2)' } },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' } },
        el('div', { style: { fontWeight: '650' }, text: '⌚ Données importées de l’ordinateur' }),
        el('span.badge.tek', { text: `${(dive.suuntoKeys || []).length || 1} enregistrement(s)` }),
      ),
      dive.profil?.length
        ? el('div', { html: profileSvg(dive.profil), style: { marginTop: '10px' } })
        : null,
      el('div.hint', { text: (suuntoNote ? suuntoNote + ' ' : '')
        + 'Horaires, profondeurs et températures sont pré-remplis. Les paliers sont ESTIMÉS à partir du '
        + 'profil : vérifie-les. Il te reste à saisir le lieu, la palanquée et tes commentaires.' }),
    ));
  }

  // Rappel du minimum vital, en tête de formulaire.
  form.append(el('div.card.essentiel', {},
    el('div', { style: { fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.6' } },
      'Pour être valable, une plongée demande au minimum : ',
      el('b', { text: 'lieu' }), ', ', el('b', { text: 'date' }), ', ',
      el('b', { text: 'durée' }), ' et ', el('b', { text: 'profondeur max' }),
      '. Ces champs portent un point ', el('span.requis', { text: '•' }),
      '. L’heure d’immersion est facultative — inutile de l’inventer sur une '
    + 'plongée d’avant l’ordinateur.'),
  ));

  // ---------- 1. Identité de la plongée ----------
  const numeroInput = input('text', dive.numero, v => set({ numero: num(v) }), { inputmode: 'numeric' });
  const dateInput   = input('date', dive.date, v => set({ date: v }));

  const champDate = field('Date', dateInput, null, true);
  champDate.id = 'champ-date';

  // Niveau au moment de la plongée : proposé d'après le carnet, modifiable.
  const toutesDives = await store.listDives(diverId);
  if (isNew && !dive.niveau) dive.niveau = niveauCourant(toutesDives);

  const niveauSel = el('select');
  niveauSel.append(el('option', { value: '', text: '— non précisé —' }));
  const niveauxConnus = [...new Set([...NIVEAUX,
    ...toutesDives.map(d => d.niveau).filter(Boolean)])];
  niveauxConnus.forEach(n => niveauSel.append(el('option', { value: n, text: n })));
  niveauSel.value = dive.niveau || '';
  niveauSel.onchange = () => set({ niveau: niveauSel.value });

  form.append(section('La plongée', { icone: '🤿', ouvert: true },
    el('div.row', {},
      field('N° de plongée', numeroInput, 'Proposé automatiquement'),
      champDate,
    ),
    field('Type de plongée',
      segmented(DIVE_TYPES.map(t => ({ id: t, label: t.replace('Exploration de ', 'Explo ') })),
                dive.type, v => set({ type: v }))),
    field('Mon niveau ce jour-là', niveauSel,
      'Repris de ta dernière plongée. Change-le le jour où tu passes un niveau : '
    + 'les statistiques suivront.'),
  ));

  // ---------- 2. Lieu ----------
  const waterSeg = el('div');
  const waterInfo = el('div.hint');

  function renderWater() {
    waterSeg.innerHTML = '';
    waterSeg.append(segmented(
      [{ id: 'douce', label: 'Eau douce' }, { id: 'salee', label: 'Eau salée' }],
      dive.eau, v => { set({ eau: v }); dive.eauManuelle = true; majOptionsAuto(); }));
  }
  renderWater();

  if (dive.indiceEau) waterInfo.textContent = dive.indiceEau;

  /**
   * À chaque déplacement du point, on regarde ce qu'il y a réellement là :
   * plan d'eau cartographié, trait de côte, altitude. Bien plus fiable que
   * de deviner d'après le nom.
   */
  let dernierPoint = '';
  async function reconnaitreLePoint() {
    if (dive.lat == null) return;
    const signature = `${dive.lat.toFixed(4)},${dive.lng.toFixed(4)}`;
    if (signature === dernierPoint) return;
    dernierPoint = signature;

    waterInfo.textContent = 'Reconnaissance du plan d’eau…';
    try {
      const { analyserPoint } = await import('../geo.js');
      const info = await analyserPoint(dive.lat, dive.lng);
      if (!info) { waterInfo.textContent = ''; return; }

      set({ altitude: info.altitude, indiceEau: '' });

      if (info.eau && !dive.eauManuelle) {
        set({ eau: info.eau });
        renderWater();
      }

      const bouts = [];
      if (info.eau) {
        bouts.push(`${info.eau === 'douce' ? 'Eau douce' : 'Eau salée'} — ${info.indice}`);
        if (info.certitude !== 'sûre') bouts.push(`(${info.certitude}, vérifie)`);
      }
      if (info.altitude != null) bouts.push(`Altitude ${Math.round(info.altitude)} m`);
      if (info.nomPlanEau) bouts.push(info.nomPlanEau);

      dive.indiceEau = bouts.join(' · ');
      waterInfo.textContent = dive.indiceEau || '';
      majOptionsAuto();
    } catch {
      waterInfo.textContent = 'Reconnaissance impossible hors connexion — choisis à la main.';
    }
  }

  const picker = locationPicker(dive, patch => {
    const avait = dive.eau;
    set(patch);
    // Le nom du lieu reste un indice de secours, jamais prioritaire.
    if (patch.eau && !avait && !dive.eauManuelle) renderWater();
    if (patch.lat != null) reconnaitreLePoint();
    majOptionsAuto();
  });

  const blocLieu = section('Lieu et environnement', { icone: '📍', ouvert: true },
    picker,
    el('div', { style: { marginTop: '14px' } },
      field('Nature de l’eau', waterSeg, waterInfo)),
    el('div.row-3', { style: { marginTop: '6px' } },
      field('Air (°C)', numInput(dive.tempAir, v => set({ tempAir: v }))),
      field('Surface de l’eau (°C)',
        numInput(dive.tempSurface, v => { set({ tempSurface: v }); majOptionsAuto(); })),
      field('Fond min (°C)', numInput(dive.tempFond, v => set({ tempFond: v }))),
    ),
    field('Visibilité', segmented(
      VISIBILITES.map(v => ({ id: v, label: v })),
      dive.visibilite,
      v => set({ visibilite: dive.visibilite === v ? '' : v }))),
    field('Courant', input('text', dive.courant, v => set({ courant: v }),
      { placeholder: 'Nul, faible, soutenu…' })),
  );
  blocLieu.id = 'champ-lieu';
  blocLieu.querySelector('.sec-titre').append(el('span.requis', { text: ' •' }));
  form.append(blocLieu);

  if (dive.lat != null) reconnaitreLePoint();

  // ---------- 3. Horaires & profondeur ----------
  const inTime  = input('time', dive.heureImmersion, v => { set({ heureImmersion: v }); syncTimes('in'); });
  const outTime = input('time', dive.heureSortie,    v => { set({ heureSortie: v });    syncTimes('out'); });
  const durInput = numInput(dive.dureeMin, v => { set({ dureeMin: v }); syncTimes('dur'); },
    { placeholder: '45' });

  function syncTimes(source) {
    const i = timeToMin(dive.heureImmersion);
    const o = timeToMin(dive.heureSortie);
    // La durée reste toujours saisissable : on ne la recalcule que si les
    // deux horaires sont là ET que ce n'est pas elle qu'on vient de taper.
    if (source !== 'dur' && i !== null && o !== null) {
      let d = o - i; if (d < 0) d += 1440;
      dive.dureeMin = d; durInput.value = d;
    } else if (source === 'dur' && i !== null && dive.dureeMin) {
      dive.heureSortie = minToTime(i + Number(dive.dureeMin));
      outTime.value = dive.heureSortie;
    }
    majOptionsAuto();
  }

  const champDuree   = field('Durée (min)', durInput, null, true);
  const champProfMax = field('Profondeur max (m)',
    numInput(dive.profMax, v => { set({ profMax: v }); majOptionsAuto(); }, { placeholder: '24' }),
    null, true);
  champDuree.id = 'champ-duree';
  champProfMax.id = 'champ-profMax';

  form.append(section('Profil de la plongée', { icone: '📉', ouvert: true },
    el('div.row', {}, champDuree, champProfMax),
    el('div.row', { style: { marginTop: '4px' } },
      field('Immersion (si connue)', inTime),
      field('Sortie (si connue)', outTime),
    ),
    el('div.hint', { text: 'Si tu donnes les deux horaires, la durée se calcule. '
      + 'Sinon la durée seule suffit — et l’heure de sortie se déduit si tu connais l’immersion.' }),
  ));

  // ---------- 4. Paliers ----------
  const secuCase = el('input', { type: 'checkbox' });
  secuCase.checked = !!dive.palierSecu;
  const secuMin = numInput(dive.palierSecuMin ?? 3, v => set({ palierSecuMin: v }),
    { placeholder: '3', style: { maxWidth: '92px' } });
  secuMin.disabled = !dive.palierSecu;
  secuCase.onchange = () => {
    set({ palierSecu: secuCase.checked });
    secuMin.disabled = !secuCase.checked;
    if (secuCase.checked && !dive.palierSecuMin) { set({ palierSecuMin: 3 }); secuMin.value = 3; }
  };

  const palierNum = (label, cle) => field(label,
    numInput(dive[cle], v => { set({ [cle]: v }); majOptionsAuto(); }, { placeholder: 'min' }));

  form.append(section('Paliers', { icone: '⏱', ouvert: false },
    el('div.row-3', {},
      palierNum('9 m', 'palier9'),
      palierNum('6 m', 'palier6'),
      palierNum('3 m', 'palier3'),
    ),
    el('div.hint', { text: 'Paliers de décompression, en minutes. Laisse vide s’il n’y en a pas eu.' }),
    el('div', { style: { marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' } },
      el('label.switch', {}, secuCase, el('span', { text: 'Palier de sécurité' })),
      secuMin,
      el('span', { style: { color: 'var(--text-mute)', fontSize: '13px' }, text: 'min' }),
    ),
    el('div.hint', { style: { marginBottom: 0 },
      text: 'Le palier de sécurité n’est pas un palier de décompression : '
          + 'il ne déclenche pas l’étiquette « Décompression ».' }),
  ));

  // ---------- 5. Options & objectifs ----------
  const optionsZone = el('div');
  const optionsNote = el('div.hint');

  /** Recalcule les étiquettes déduites et redessine les puces. */
  function majOptionsAuto() {
    if (!optionsZone.isConnected && !optionsZone.childNodes.length) return;
    const auto = appliquerOptionsAuto(dive, {
      altitude: dive.altitude,
      fosse: /fosse/i.test(`${dive.lieuNom} ${dive.lieuDetail}`),
    });
    rendreOptions();
    optionsNote.innerHTML = '';
    if (auto.length) {
      optionsNote.append(el('div', {},
        '✨ Posées automatiquement : ',
        ...auto.map((a, i) => el('span', {},
          i ? ', ' : '', el('b', { text: a.tag }), ` (${a.raison})`)),
        '. Décoche-les si elles ne collent pas, elles ne reviendront plus.'));
    }
  }

  function rendreOptions() {
    optionsZone.innerHTML = '';
    const wrap = el('div.chips');
    DIVE_OPTIONS.forEach(item => {
      const auto = OPTIONS_AUTO.includes(item);
      const actif = (dive.options || []).includes(item);
      const c = el('button.chip', { type: 'button' }, item, auto ? el('span', { text: ' ✨' }) : null);
      if (actif) c.classList.add('on');
      c.onclick = () => {
        const on = !(dive.options || []).includes(item);
        dive.options = on
          ? [...(dive.options || []), item]
          : (dive.options || []).filter(x => x !== item);

        // Mémorise le choix pour que l'automatisme ne le contredise pas.
        dive.optionsRefusees ||= []; dive.optionsManuelles ||= [];
        if (on) {
          dive.optionsManuelles = [...new Set([...dive.optionsManuelles, item])];
          dive.optionsRefusees = dive.optionsRefusees.filter(x => x !== item);
        } else if (auto) {
          dive.optionsRefusees = [...new Set([...dive.optionsRefusees, item])];
          dive.optionsManuelles = dive.optionsManuelles.filter(x => x !== item);
        }
        c.classList.toggle('on', on);
      };
      wrap.append(c);
    });
    optionsZone.append(wrap);
  }

  rendreOptions();
  majOptionsAuto();

  form.append(section('Spécificités & objectifs', { icone: '🏷', ouvert: false },
    field('Options de la plongée', optionsZone, optionsNote),
    field('Objectifs',
      chipGroup(DIVE_GOALS, dive.objectifs, (item, on) => {
        dive.objectifs = on ? [...dive.objectifs, item] : dive.objectifs.filter(x => x !== item);
      })),
    field('Autre', input('text', dive.objectifAutre, v => set({ objectifAutre: v }),
      { placeholder: 'Un objectif qui n’est pas dans la liste' })),
  ));

  // ---------- 6. Matériel ----------
  const combiSeg = segmented(
    COMBI_TYPES.map(t => ({ id: t, label: t })),
    dive.combiType, v => set({ combiType: v }));

  const mmSel = el('select');
  mmSel.append(el('option', { value: '', text: '— mm —' }));
  COMBI_MM.forEach(m => mmSel.append(el('option', { value: m, text: `${m} mm` })));
  mmSel.value = dive.combiMm || '';
  mmSel.onchange = () => set({ combiMm: mmSel.value });

  // --- Bouteille : le gaz caractérise le bloc, pas la plongée ---
  const gazZone = el('div');

  function rendreGaz() {
    gazZone.innerHTML = '';
    const g = gazParId(dive.gazType) || GAZ[0];

    gazZone.append(segmented(
      GAZ.map(x => ({ id: x.id, label: x.label })),
      dive.gazType || 'air',
      id => {
        const choisi = gazParId(id);
        set({ gazType: id });
        // Valeurs courantes pré-remplies : on ajuste si besoin.
        if (choisi?.o2 != null && dive.gazO2 == null) set({ gazO2: choisi.o2 });
        if (choisi?.he != null && dive.gazHe == null) set({ gazHe: choisi.he });
        if (id === 'air') set({ gazO2: null, gazHe: null, gazSetpoint: null });
        rendreGaz();
        majOptionsAuto();
      }));

    const champs = g.champs || [];
    if (champs.length) {
      const ligne = el('div.row-3', { style: { marginTop: '10px' } });
      if (champs.includes('o2')) {
        ligne.append(field('O₂ (%)', numInput(dive.gazO2,
          v => { set({ gazO2: v }); rendreInfoGaz(); }, { placeholder: '32' })));
      }
      if (champs.includes('he')) {
        ligne.append(field('He (%)', numInput(dive.gazHe,
          v => { set({ gazHe: v }); rendreInfoGaz(); }, { placeholder: '35' })));
      }
      if (champs.includes('setpoint')) {
        ligne.append(field('Setpoint', numInput(dive.gazSetpoint,
          v => set({ gazSetpoint: v }), { placeholder: '1,3' })));
      }
      gazZone.append(ligne);
    }
    gazZone.append(infoGaz);
    rendreInfoGaz();
  }

  const infoGaz = el('div.hint');
  function rendreInfoGaz() {
    const bouts = [libelleGaz(dive)];
    if (dive.gazType === 'nitrox' && dive.gazO2) {
      const pmu = pmuNitrox(dive.gazO2);
      if (pmu) bouts.push(`profondeur max ≈ ${pmu} m à 1,4 bar de PpO₂ (indicatif)`);
    }
    if (dive.gazType === 'trimix' && dive.gazO2 && dive.gazHe) {
      bouts.push(`azote ${Math.max(0, 100 - dive.gazO2 - dive.gazHe)} %`);
    }
    infoGaz.textContent = bouts.filter(Boolean).join(' — ');
  }

  rendreGaz();

  const blocTypeSel = el('select');
  blocTypeSel.append(el('option', { value: '', text: '— type —' }));
  BLOC_TYPES.forEach(x => blocTypeSel.append(el('option', { value: x, text: x })));
  blocTypeSel.value = dive.blocType || '';
  blocTypeSel.onchange = () => set({ blocType: blocTypeSel.value });

  const blocMatSel = el('select');
  blocMatSel.append(el('option', { value: '', text: '— matière —' }));
  BLOC_MATIERES.forEach(x => blocMatSel.append(el('option', { value: x, text: x })));
  blocMatSel.value = dive.blocMatiere || '';
  blocMatSel.onchange = () => set({ blocMatiere: blocMatSel.value });

  form.append(section('Bouteille', { icone: '🛢', ouvert: false },
    field('Gaz respiré', gazZone),
    el('div.row-3', { style: { marginTop: '14px' } },
      field('Type', blocTypeSel),
      field('Matière', blocMatSel),
      field('Volume (L)', numInput(dive.blocLitres, v => set({ blocLitres: v }), { placeholder: '12' })),
    ),
    el('div.row', {},
      field('Pression départ (bar)', numInput(dive.pressionDepart, v => set({ pressionDepart: v }))),
      field('Pression fin (bar)', numInput(dive.pressionFin, v => set({ pressionFin: v }))),
    ),
  ));

  // --- Matériel personnel, repris du profil ---
  //
  // Le profil tient la liste ; la plongée ne retient que ce qui a été
  // réellement emporté. Par défaut : tout.
  const materielProfil = profil?.materiel || [];
  const equipZone = el('div');

  /**
   * On n'affiche que ce qui a été ajouté à CETTE plongée, en lignes.
   * Deux façons d'en ajouter : reprendre une pièce du profil, ou en
   * créer une à la volée — elle rejoint alors aussi la fiche plongeur.
   */
  function rendreEquipement() {
    equipZone.innerHTML = '';
    dive.materielIds ||= [];

    const choisis = dive.materielIds
      .map(id => materielProfil.find(m => m.id === id))
      .filter(Boolean);

    if (choisis.length) {
      choisis.forEach(m => equipZone.append(ligneMateriel(m, {
        onRetirer: piece => {
          dive.materielIds = dive.materielIds.filter(x => x !== piece.id);
          rendreEquipement();
        },
      })));
    } else {
      equipZone.append(el('div.hint', { style: { marginTop: 0 },
        text: 'Rien d’ajouté pour cette plongée.' }));
    }

    const restants = materielProfil.filter(m => !dive.materielIds.includes(m.id));

    equipZone.append(el('div.btn-row', {},
      el('button.btn.sm', { type: 'button', text: '+ Nouveau matériel',
        onclick: () => editerMateriel(null, async piece => {
          // Ajouté à la plongée ET mémorisé sur la fiche plongeur :
          // on ne le ressaisira jamais.
          materielProfil.push(piece);
          dive.materielIds = [...dive.materielIds, piece.id];
          if (profil) {
            profil.materiel = materielProfil;
            try { await store.saveDiver(profil); } catch (e) { toast(e.message, true); }
          }
          rendreEquipement();
        }) }),
      restants.length
        ? el('button.btn.sm.ghost', { type: 'button',
            text: `Reprendre du matériel (${restants.length})`,
            onclick: () => ouvrirChoixMateriel(restants) })
        : null,
    ));
  }

  /** Reprise depuis la fiche plongeur : on coche, on valide. */
  function ouvrirChoixMateriel(restants) {
    const enAttente = new Set();

    openModal(close => {
      const liste = el('div');

      restants.forEach(m => {
        const t = typeMateriel(m.type);
        const c = el('input', { type: 'checkbox' });
        const ligne = el('div.pl-ligne', { style: { gridTemplateColumns: '22px 24px 1fr' } },
          c,
          el('span.mat-icone', { text: t.icone }),
          el('div.mat-corps', {},
            el('div.mat-type', { text: t.label }),
            el('div.mat-detail', { text: libelleMateriel(m) })),
        );
        const basculer = () => {
          enAttente.has(m.id) ? enAttente.delete(m.id) : enAttente.add(m.id);
          c.checked = enAttente.has(m.id);
          ligne.classList.toggle('on', enAttente.has(m.id));
        };
        ligne.onclick = basculer;
        c.onclick = e => { e.stopPropagation(); basculer(); };
        liste.append(ligne);
      });

      return el('div', {},
        el('h3', { text: 'Reprendre du matériel' }),
        el('div.hint', { style: { marginTop: 0 },
          text: 'Coche ce que tu avais sur cette plongée.' }),
        liste,
        el('div.btn-row', {},
          el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }),
          el('button.btn.primary', { type: 'button', text: 'Ajouter',
            onclick: () => {
              dive.materielIds = [...dive.materielIds, ...enAttente];
              rendreEquipement();
              close();
            } }),
        ),
      );
    });
  }

  rendreEquipement();

  form.append(section('Mon matériel', { icone: '🎽', ouvert: false },
    field('Lestage', input('text', dive.lestage, v => set({ lestage: v }),
      { placeholder: '6 kg ceinture + 2 kg poches' })),
    field('Combinaison', combiSeg),
    field('Épaisseur', mmSel),
    el('div.lbl', { style: { marginTop: '18px' }, text: 'Équipement emporté' }),
    equipZone,
  ));

  // ---------- 8. Palanquée ----------
  const buddyChips = el('div.chips');
  const chefWrap   = el('div');
  const stampWrap  = el('div');

  const rechercheBuddy = el('input', { type: 'search', placeholder: 'Filtrer par nom ou club…',
                                       autocapitalize: 'off' });

  // Clubs dépliés : le club du dernier plongeur coché reste ouvert.
  const clubsOuverts = new Set();

  /** Tampon retenu pour ce plongeur sur cette plongée. */
  function tamponDe(b) {
    dive.tampons ||= {};
    const choisi = dive.tampons[b.id];
    const stamps = b.stamps || [];
    if (choisi) return stamps.find(s => s.id === choisi) || null;
    // Par défaut : le premier tampon, ou la signature à défaut.
    return stamps.find(s => s.type !== 'signature') || stamps[0] || null;
  }

  /** Choix du tampon quand un plongeur en a plusieurs. */
  function choisirTampon(b, onFait) {
    const stamps = b.stamps || [];
    if (!stamps.length) {
      return toast(`${fullName(b)} n’a ni tampon ni signature enregistrés`, true);
    }
    openModal(close => el('div', {},
      el('h3', { text: `Tampon — ${fullName(b)}` }),
      el('div.stamp-grid', {},
        stamps.map(s => {
          const cell = el('div.stamp', {}, el('img', { src: s.dataUrl, alt: s.label || '' }));
          if (tamponDe(b)?.id === s.id) cell.classList.add('on');
          cell.onclick = () => {
            dive.tampons = { ...(dive.tampons || {}), [b.id]: s.id };
            onFait(); close();
          };
          return cell;
        })),
      el('div.hint', { text: 'Le tampon retenu apparaîtra sur la fiche de la plongée.' }),
      el('div.btn-row', {},
        el('button.btn.ghost', { type: 'button', text: 'Fermer', onclick: close })),
    ));
  }

  /** Une ligne par plongeur : nom · moniteur · tampon. */
  function lignePlongeur(b) {
    const coche = () => dive.buddyIds.includes(b.id);

    const caseCoche = el('input', { type: 'checkbox' });
    caseCoche.checked = coche();

    const celluleTampon = el('button.pl-tampon', { type: 'button' });

    function rendreTampon() {
      celluleTampon.innerHTML = '';
      const t = tamponDe(b);
      const plusieurs = (b.stamps || []).length > 1;

      if (!coche()) {
        celluleTampon.append(el('span.pl-vide', { text: '' }));
        celluleTampon.disabled = true;
        return;
      }
      celluleTampon.disabled = false;

      if (t) {
        celluleTampon.append(el('img', { src: t.dataUrl, alt: 'Tampon' }));
        if (plusieurs) celluleTampon.append(el('span.pl-multi', { text: (b.stamps || []).length }));
        celluleTampon.title = plusieurs ? 'Changer de tampon' : (t.label || 'Tampon');
      } else {
        celluleTampon.append(el('span.pl-vide', { text: '＋' }));
        celluleTampon.title = 'Aucun tampon enregistré';
      }
    }

    celluleTampon.onclick = e => {
      e.stopPropagation();
      if (!coche()) return;
      if ((b.stamps || []).length) choisirTampon(b, rendreTampon);
      else navigate(`buddy/${b.id}`);
    };

    const ligne = el('div.pl-ligne', {},
      caseCoche,
      el('div.pl-nom', { text: fullName(b) }),
      el('div.pl-role', {},
        b.moniteur ? el('span.badge.ens', { text: 'moniteur' }) : el('span.pl-vide', { text: '—' })),
      celluleTampon,
    );

    const majLigne = () => {
      ligne.classList.toggle('on', coche());
      caseCoche.checked = coche();
      rendreTampon();
    };

    const basculer = () => {
      const on = !coche();
      dive.buddyIds = on ? [...dive.buddyIds, b.id] : dive.buddyIds.filter(x => x !== b.id);
      if (!on && dive.chefBuddyId === b.id) dive.chefBuddyId = '';
      majLigne();
      renderChef(); renderStamp();
    };

    ligne.onclick = basculer;
    caseCoche.onclick = e => { e.stopPropagation(); basculer(); };

    majLigne();
    return ligne;
  }

  function renderBuddies() {
    buddyChips.innerHTML = '';

    const q = rechercheBuddy.value.trim().toLowerCase();
    const visibles = buddies.filter(b =>
      dive.buddyIds.includes(b.id)      // les sélectionnés restent toujours visibles
      || !q
      || `${fullName(b)} ${b.club || ''}`.toLowerCase().includes(q));

    if (!visibles.length) {
      buddyChips.append(el('div.hint', { style: { marginTop: 0 }, text: 'Aucun plongeur ne correspond.' }));
    }

    // Regroupés par club, en accordéon : avec 25 plongeurs, tout dérouler
    // ferait défiler pendant des écrans.
    const groupes = new Map();
    visibles.forEach(b => {
      const club = (b.club || '').trim() || 'Sans club';
      if (!groupes.has(club)) groupes.set(club, []);
      groupes.get(club).push(b);
    });

    [...groupes.entries()]
      .sort((a, b) => (a[0] === 'Sans club') - (b[0] === 'Sans club')
                   || a[0].localeCompare(b[0], 'fr'))
      .forEach(([club, membres]) => {
        const choisis = membres.filter(b => dive.buddyIds.includes(b.id)).length;
        // On ouvre si : recherche en cours, club déjà ouvert, ou quelqu'un coché dedans.
        const ouvert = !!q || clubsOuverts.has(club) || choisis > 0;

        const fleche = el('span.sec-fleche', { text: ouvert ? '▾' : '▸' });
        const corps = el('div.pl-groupe', {},
          ...membres
            .sort((x, y) => (y.moniteur ? 1 : 0) - (x.moniteur ? 1 : 0)
                         || fullName(x).localeCompare(fullName(y), 'fr'))
            .map(lignePlongeur));
        corps.hidden = !ouvert;

        const entete = el('button.pl-club', { type: 'button' },
          fleche,
          el('span.pl-club-nom', { text: club }),
          choisis ? el('span.badge.tek', { text: `${choisis}` }) : null,
          el('span.pl-club-n', { text: `${membres.length}` }),
        );
        entete.onclick = () => {
          const nouvel = corps.hidden;
          corps.hidden = !nouvel;
          fleche.textContent = nouvel ? '▾' : '▸';
          nouvel ? clubsOuverts.add(club) : clubsOuverts.delete(club);
        };

        buddyChips.append(el('div.pl-bloc', {}, entete, corps));
      });

    buddyChips.append(el('button.btn.sm.block', {
      type: 'button', text: '+ Nouveau plongeur',
      style: { borderStyle: 'dashed', marginTop: '12px' },
      onclick: () => quickAddBuddy(),
    }));
  }

  rechercheBuddy.addEventListener('input', renderBuddies);

  function quickAddBuddy() {
    openModal(close => {
      const b = emptyBuddy();
      const p = el('input', { type: 'text', placeholder: 'Prénom', autofocus: true });
      const n = el('input', { type: 'text', placeholder: 'Nom' });
      return el('div', {},
        el('h3', { text: 'Nouveau compagnon' }),
        field('Prénom', p), field('Nom', n),
        el('div.btn-row', {},
          el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }),
          el('button.btn.primary', {
            type: 'button', text: 'Ajouter',
            onclick: async () => {
              if (!p.value.trim() && !n.value.trim()) return toast('Indique au moins un nom', true);
              b.prenom = p.value.trim(); b.nom = n.value.trim();
              await store.saveBuddy(b);
              buddies = await store.listBuddies();
              dive.buddyIds = [...dive.buddyIds, b.id];
              renderBuddies(); renderChef(); renderStamp();
              close();
              toast(`${fullName(b)} ajouté`);
            },
          }),
        ),
      );
    });
  }

  function renderChef() {
    chefWrap.innerHTML = '';
    const needsChef = ['moniteur', 'chef'].includes(dive.palanqueeMode);
    if (!needsChef) return;
    const selected = dive.buddyIds.map(id => buddies.find(b => b.id === id)).filter(Boolean);
    const sel = el('select');
    sel.append(el('option', { value: '', text: '— choisir —' }));
    // Les moniteurs sont proposés en tête : c'est presque toujours l'un d'eux.
    [...selected].sort((a, b) => (b.moniteur ? 1 : 0) - (a.moniteur ? 1 : 0))
      .forEach(b => sel.append(el('option', {
        value: b.id, text: fullName(b) + (b.moniteur ? ' — moniteur' : ''),
      })));
    sel.value = dive.chefBuddyId || '';
    sel.onchange = () => { dive.chefBuddyId = sel.value; renderStamp(); };
    chefWrap.append(field(
      dive.palanqueeMode === 'moniteur' ? 'Moniteur' : 'Guide de palanquée',
      sel,
      selected.length ? null : 'Sélectionne d’abord un compagnon ci-dessus.',
    ));
  }

  const modeWrap = el('div');
  function renderMode() {
    modeWrap.innerHTML = '';
    const sel = el('select');
    sel.append(el('option', { value: '', text: '— non précisé —' }));
    PALANQUEE_MODES.forEach(m => sel.append(el('option', { value: m.id, text: m.label })));
    sel.value = dive.palanqueeMode || '';
    sel.onchange = () => { dive.palanqueeMode = sel.value; renderChef(); renderStamp(); };
    modeWrap.append(field('Organisation de la palanquée', sel));
  }

  function renderStamp() {
    stampWrap.innerHTML = '';
    const chef = buddies.find(b => b.id === dive.chefBuddyId);
    const pool = [];
    if (chef) (chef.stamps || []).forEach(s => pool.push({ buddyId: chef.id, ...s }));
    dive.buddyIds.filter(id => id !== dive.chefBuddyId).forEach(id => {
      const b = buddies.find(x => x.id === id);
      (b?.stamps || []).forEach(s => pool.push({ buddyId: b.id, ...s }));
    });

    const grid = el('div.stamp-grid');

    // Tampon déjà attaché directement à la plongée
    if (dive.stampImage) {
      grid.append(el('div.stamp.on', {},
        el('img', { src: dive.stampImage, alt: 'Tampon' }),
        el('button.del', { type: 'button', text: '×',
          onclick: () => { dive.stampImage = ''; renderStamp(); } }),
      ));
    }

    pool.forEach(s => {
      const cell = el('div.stamp', {},
        el('img', { src: s.dataUrl, alt: s.label || 'Tampon' }));
      if (dive.stampId === s.id) cell.classList.add('on');
      cell.onclick = () => {
        const on = dive.stampId !== s.id;
        dive.stampId = on ? s.id : '';
        dive.stampBuddyId = on ? s.buddyId : '';
        dive.stampImage = '';
        renderStamp();
      };
      grid.append(cell);
    });

    const up = el('input', { type: 'file', accept: 'image/*', hidden: true });
    up.onchange = async () => {
      const f = up.files?.[0]; if (!f) return;
      try {
        dive.stampImage = await fileToDataURL(f, 700);
        dive.stampId = ''; dive.stampBuddyId = '';
        renderStamp();
        toast('Tampon ajouté à cette plongée');
      } catch (e) { toast(e.message, true); }
    };
    grid.append(el('button.stamp-add', { type: 'button', text: '+',
      onclick: () => up.click() }), up);

    stampWrap.append(field('Tampon', grid,
      pool.length
        ? 'Choisis un tampon enregistré, ou ajoute-en un depuis la galerie / l’appareil photo.'
        : 'Photographie le tampon du carnet. Enregistre-le sur la fiche d’un compagnon pour le réutiliser.'));
  }

  renderMode(); renderBuddies(); renderChef(); renderStamp();

  form.append(section('Plongeurs', { icone: '👥', ouvert: true },
    modeWrap,
    el('div.hint', { style: { marginTop: 0 },
      text: 'Plonger avec un moniteur ne fait pas une plongée d’enseignement : '
          + 'on peut très bien sortir en exploration avec lui. Le type de plongée '
          + 'se choisit plus haut, indépendamment de qui t’accompagne.' }),
    field('Compagnons de plongée', el('div', {}, rechercheBuddy, buddyChips)),
    chefWrap,
    stampWrap,
  ));

  // ---------- 9. Ce que j'ai vu ----------
  form.append(section('Ce que j’ai vu', { icone: '🐟', ouvert: false },
    observationsPicker(dive)));

  // ---------- 10. Comptes-rendus ----------
  form.append(section('Comptes-rendus', { icone: '📝', ouvert: false },
    field('Ce que j’ai fait', textarea(dive.fait, v => set({ fait: v }),
      'Exercices, remontée assistée, navigation…')),
    field('Observations libres', textarea(dive.observations, v => set({ observations: v }),
      'Sensations, matériel, conditions, à retenir pour la prochaine fois…')),
  ));

  // ---------- Actions ----------
  const alerte = el('div.card.alerte', { hidden: true });

  const saveBtn = el('button.btn.primary.block', { type: 'button',
    text: isNew ? 'Enregistrer la plongée' : 'Mettre à jour' });

  saveBtn.onclick = async () => {
    reconcileTimes(dive);
    const manque = validerPlongee(dive);

    form.querySelectorAll('.field.manquant, .section.manquant')
        .forEach(n => n.classList.remove('manquant'));

    if (manque.length) {
      manque.forEach(m => {
        const cible = document.getElementById(`champ-${m.champ}`);
        cible?.classList.add('manquant');
        // Si le champ est dans une section repliée, on la déplie : sinon
        // l'utilisateur cliquerait sur un lien qui ne mène nulle part.
        cible?.closest('.section.repliable')?.deplier?.();
        if (typeof cible?.deplier === 'function') cible.deplier();
      });

      alerte.hidden = false;
      alerte.innerHTML = '';
      alerte.append(
        el('div', { style: { fontWeight: '650', marginBottom: '6px' },
          text: manque.length === 1 ? 'Il manque une information' : `Il manque ${manque.length} informations` }),
        el('ul', { style: { margin: '0 0 4px', paddingLeft: '20px', lineHeight: '1.7' } },
          manque.map(m => el('li', {},
            el('a', {
              href: `#champ-${m.champ}`,
              style: { color: 'var(--accent)' },
              onclick: e => {
                e.preventDefault();
                scrollTo(document.getElementById(`champ-${m.champ}`));
              },
            }, m.texte)))),
      );

      scrollTo(document.getElementById(`champ-${manque[0].champ}`));
      toast('Plongée incomplète', true);
      return;
    }

    alerte.hidden = true;
    if (!dive.numero) dive.numero = await store.nextNumber(diverId);
    saveBtn.disabled = true;
    try {
      await store.saveDive(dive);
      toast('Plongée enregistrée');
      navigate(`dive/${dive.id}`, true);
    } catch (e) {
      toast(e.message, true);
      saveBtn.disabled = false;
    }
  };

  const buttons = el('div.btn-row', {}, saveBtn);
  form.append(alerte);
  if (!isNew) {
    buttons.append(el('button.btn.danger', {
      type: 'button', text: 'Supprimer',
      onclick: async () => {
        if (await confirmBox('Supprimer cette plongée ?', 'Supprimer')) {
          await store.deleteDive(dive.id);
          toast('Plongée supprimée');
          navigate('dives', true);
        }
      },
    }));
  }
  form.append(buttons);

  return { title: isNew ? 'Nouvelle plongée' : `Plongée n°${dive.numero}`, node: form, back: true };
}
