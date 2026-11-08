// ============================================================
//  Formulaire de saisie / modification d'une plongée
// ============================================================

import { el, toast, num, fullName, openModal, fileToDataURL, confirmBox, todayISO,
         minToTime, timeToMin, scrollTo } from '../lib.js';
import { editeurPalanquee, champCentre, propositionsTexte } from '../palanquee.js';
import { store, emptyDive, emptyBuddy, reconcileTimes, validerPlongee,
         appliquerOptionsAuto, niveauCourant, niveauALaDate, libelleGaz, pmuNitrox,
         libelleMateriel, consommation } from '../store.js';
import { editerMateriel, ligneMateriel } from './materiel.js';
import { idsEquipes, combiEquipee } from '../equipement.js';
import { DIVE_TYPES, DIVE_OPTIONS, DIVE_GOALS, PALANQUEE_MODES,
         OPTIONS_AUTO, VISIBILITES, COMBI_TYPES, COMBI_MM, NIVEAUX,
         GAZ, gazParId, BLOC_TYPES, BLOC_MATIERES, typeMateriel,
         VISIBILITE_ICONES, METEO, ETAT_MER, COURANTS, EXERCICES, RESSENTIS } from '../config.js';
import { graphiquePlongee, tuilesPlongee } from '../courbes.js';
import { analyserProfil } from '../profil-analyse.js';
import { memeSortie } from '../lieu-auto.js';
import { locationPicker } from '../map.js';
import { navigate } from '../router.js';
import { photoCarnetFormulaire, pageLisible } from './carnet-photo.js';
import { oublierPhoto } from '../photos.js';


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

/**
 * Rangée de pastilles à choix unique, avec pictogramme.
 * Un second appui sur la pastille active la désélectionne : on ne veut
 * pas être coincé avec « Pluie » parce qu'on a effleuré l'écran.
 */
function pastilles(options, courant, onPick) {
  const wrap = el('div.pastilles');
  options.forEach(o => {
    const b = el('button.pastille', { type: 'button', title: o.label },
      el('span.pastille-ico', { text: o.icone }),
      el('span.pastille-txt', { text: o.label }));
    const actif = () => (o.id === courant || o.label === courant);
    if (actif()) b.classList.add('on');
    b.onclick = () => {
      const etaitActif = b.classList.contains('on');
      wrap.querySelectorAll('.pastille').forEach(x => x.classList.remove('on'));
      if (!etaitActif) b.classList.add('on');
      courant = etaitActif ? '' : o.id;
      onPick(courant);
    };
    wrap.append(b);
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
  const { ouvert = true, icone = '', id = '', resume = '' } = options || {};

  const corps = el('div.card', {}, ...contenu);
  const fleche = el('span.sec-fleche', { text: '▾' });
  const entete = el('button.sec-entete', { type: 'button' },
    icone ? el('span', { text: icone + ' ' }) : null,
    el('span.sec-titre', { text: titre }),
    resume ? el('span.sec-resume', { text: resume }) : null,
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
      }, cat.cle)));
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

/** Icône de repli quand aucune photo n'est disponible. */
function iconeDe(o, cat) {
  if (o.source === 'osm') return '⚓';
  return CATEGORIES.find(c => c.cle === cat)?.icone
      || (o.source === 'libre' ? '✎' : '🐟');
}

/** Vignette d'une observation retenue. */
function carteObservation(o, onRemove, cat) {
  return el('div.obs', {},
    o.photo
      ? el('img', { src: o.photo, alt: o.nom, loading: 'lazy' })
      : el('div.obs-noimg', { text: iconeDe(o, cat) }),
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
    const bouton = el('button.btn.primary', { type: 'button', text: 'Ajouter' });

    bouton.onclick = async () => {
      const v = nom.value.trim();
      if (!v) return;

      bouton.disabled = true;
      bouton.textContent = 'Recherche d’une photo…';

      // « Algues » est un nom valable : avant de l'ajouter sans image,
      // on regarde si le catalogue mondial en connaît une. Une vignette
      // sans photo n'aide personne à se souvenir.
      let trouve = null;
      try {
        const { chercherEspece } = await import('../species.js');
        const resultats = await chercherEspece(v);
        trouve = resultats.find(r => r.photo) || null;
      } catch { /* hors ligne : on ajoutera sans photo */ }

      dive[cat.cle] = [...dive[cat.cle], trouve
        ? { id: trouve.id, nom: v, sci: trouve.sci || '', photo: trouve.photo, source: 'inat' }
        : { id: `libre-${Date.now()}`, nom: v, sci: '', photo: '', source: 'libre' }];

      onChange();
      close();
      if (trouve) toast(`Photo trouvée : ${trouve.nom}`);
    };

    return el('div', {},
      el('h3', { text: `${cat.icone} Ajouter à la main` }),
      el('div.field', {}, nom),
      el('div.hint', { style: { marginTop: 0 },
        text: 'Utile pour ce que les listes ne connaissent pas. Si le nom existe au '
            + 'catalogue, la photo est récupérée automatiquement.' }),
      el('div.btn-row', {},
        el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }),
        bouton,
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

  if (isNew && !dive.date) dive.date = todayISO();

  let buddies = await store.listBuddies();
  const profil = await store.getDiver(diverId);       // pour le matériel personnel
  const set = patch => Object.assign(dive, patch);

  // Nouvelle plongée : ce que je porte (l'« équipé » du profil) est
  // repris tel quel, combinaison comprise. Ajustable ensuite.
  if (isNew && profil) {
    if (dive.materielIds == null) dive.materielIds = idsEquipes(profil);
    const combi = combiEquipee(profil);
    if (!dive.combiType && (combi?.combiType || profil.combiType)) {
      dive.combiType = combi?.combiType || profil.combiType;
      dive.combiMm = combi ? combi.combiMm : (profil.combiMm || '');
    }
  }

  const form = el('form', { onsubmit: e => e.preventDefault() });

  // ---------- 0. Ce que la montre a déjà donné ----------
  //
  // Une plongée importée arrive avec presque tout : on le montre d'emblée
  // (chiffres, courbes) au lieu de le cacher dans des champs à relire.
  const courbe = dive.samples?.length ? dive.samples : dive.profil;
  const importee = !!(courbe?.length || (dive.suuntoKeys || []).length);
  const analyse = analyserProfil(courbe, dive);
  if (!importee) {
    form.append(el('button.btn.block.suunto-link', {
      type: 'button',
      onclick: () => navigate('montre'),
    },
      el('span', { style: { fontSize: '20px' }, text: '⌚' }),
      el('span', {},
        el('div', { style: { fontWeight: '650' }, text: 'Importer depuis la montre' }),
        el('div', { style: { fontSize: '12px', opacity: '.75' },
          text: 'Durée, profondeurs, températures, bouteille, lieu : tout arrive d’un coup' })),
      el('span', { style: { marginLeft: 'auto', opacity: '.6' }, text: '›' }),
    ));
  } else {
    form.append(el('div.card.carte-montre', {},
      el('div.carte-montre-tete', {},
        el('b', { text: '⌚ De la montre' }),
        el('span.badge.tek', { text: dive.suunto?.appareil || 'ordinateur' })),
      tuilesPlongee(dive, analyse),
      courbe?.length ? el('div', { style: { marginTop: '12px' } }, graphiquePlongee(courbe, { dive })) : null,
      el('div.hint', { style: { marginBottom: 0 }, text: 'Rien à recopier : tout ça est déjà dans la fiche. '
        + 'Il reste à cocher ce qui ne se mesure pas — avec qui, comment c’était.' }),
    ));
  }

  // Rappel du minimum vital, en tête de formulaire (pas pour un import : tout y est).
  if (!importee) form.append(el('div.card.essentiel', {},
    el('div', { style: { fontSize: '13px', color: 'var(--text-dim)', lineHeight: '1.6' } },
      'Pour être valable, une plongée demande au minimum : ',
      el('b', { text: 'lieu' }), ', ', el('b', { text: 'date' }), ', ',
      el('b', { text: 'durée' }), ' et ', el('b', { text: 'profondeur max' }),
      '. Ces champs portent un point ', el('span.requis', { text: '•' }), '.'),
  ));

  // ---------- 0 ter. La page du carnet papier ----------
  //
  // Facultative, mais quand elle est là c'est le modèle de toute la
  // saisie : elle reste visible à côté des champs.
  const carnetPapier = photoCarnetFormulaire(dive);
  form.append(section('Page du carnet papier', { icone: '📓', ouvert: !!dive.photoCarnet?.ref || (isNew && !importee),
    resume: dive.photoCarnet?.ref ? 'photo' : '' }, carnetPapier.bloc));

  // ---------- 1. Identité de la plongée ----------
  // Le numéro n'est plus saisi : il suit les dates (la plus ancienne est la n°1).
  const numeroInput = el('input', { type: 'text', readOnly: true, tabIndex: -1,
    value: isNew ? 'auto' : (dive.numero ?? 'auto'), class: 'lecture-seule' });
  const dateInput   = input('date', dive.date, v => set({ date: v }));

  const champDate = field('Date', dateInput, null, true);
  champDate.id = 'champ-date';

  // Niveau au moment de la plongée : déduit des diplômes et de la date.
  // Le choisir ici ne sert qu'à le forcer (une plongée en formation, PN2…).
  const toutesDives = await store.listDives(diverId);
  const certifs = await store.listCertifications(diverId);

  const niveauSel = el('select');
  const optionAuto = el('option', { value: '' });
  const majAuto = () => {
    const n = niveauALaDate(certifs, dive.date);
    optionAuto.textContent = n ? `${n} — d'après tes diplômes` : '— non précisé —';
  };
  majAuto();
  niveauSel.append(optionAuto);
  const niveauxConnus = [...new Set([...NIVEAUX,
    ...toutesDives.map(d => d.niveau).filter(Boolean)])];
  niveauxConnus.forEach(n => niveauSel.append(el('option', { value: n, text: n })));
  niveauSel.value = dive.niveau || '';
  niveauSel.onchange = () => set({ niveau: niveauSel.value });
  dateInput.addEventListener('change', majAuto);

  form.append(section('La plongée', { icone: '🤿', ouvert: true },
    el('div.row', {},
      field('N° (automatique)', numeroInput),
      champDate,
    ),
    field('Type de plongée',
      segmented(DIVE_TYPES.map(t => ({ id: t, label: t.replace('Exploration de ', 'Explo ') })),
                dive.type, v => { set({ type: v }); majExercices(); })),
    field('Mon niveau ce jour-là', niveauSel, 'À changer seulement pour une plongée en formation.'),
  ));

  // ---------- 2. Lieu ----------
  const waterSeg = el('div');
  const waterInfo = el('div.hint');

  // La nature de l'eau se déduit du point GPS : on ne la choisit à la
  // main que pour corriger, ou quand il n'y a pas de point.
  let corriger = false;
  function renderWater() {
    waterSeg.innerHTML = '';
    if (dive.lat != null && dive.eau && !dive.eauManuelle && !corriger) {
      waterSeg.append(el('div.eau-auto', {},
        el('b', { text: dive.eau === 'douce' ? '💧 Eau douce' : '🌊 Eau salée' }),
        el('span.badge', { text: '✨ d’après le point GPS' }),
        el('button.btn.sm.ghost', { type: 'button', text: 'Corriger',
          onclick: () => { corriger = true; renderWater(); } })));
      return;
    }
    waterSeg.append(segmented(
      [{ id: 'douce', label: 'Eau douce' }, { id: 'salee', label: 'Eau salée' }],
      dive.eau, v => { set({ eau: v }); dive.eauManuelle = true; majOptionsAuto(); }));
    if (dive.eauManuelle && dive.lat != null) {
      waterSeg.append(el('button.btn.sm.ghost', { type: 'button', style: { marginTop: '6px' },
        text: '✨ Revenir à la détection automatique',
        onclick: () => { dive.eauManuelle = false; corriger = false; dernierPoint = ''; reconnaitreLePoint(); } }));
    }
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

      if (info.eau && !dive.eauManuelle) set({ eau: info.eau, eauAuto: true });
      renderWater();

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
    if ('lieuNom' in patch && dive.lieuAuto) { delete dive.lieuAuto; majOrigine?.(); }
    // Le nom du lieu reste un indice de secours, jamais prioritaire.
    if (patch.eau && !avait && !dive.eauManuelle) renderWater();
    if (patch.lat != null) reconnaitreLePoint();
    else if ('lat' in patch) renderWater();
    majOptionsAuto();
  });

  // Le nom deviné d'après le GPS de la montre : on le dit, et un nom
  // tapé à la main le remplace.
  const lieuOrigine = el('div.hint.lieu-auto', { hidden: true });
  const champSite = input('text', dive.site, v => set({ site: v }), { placeholder: 'Banana Reef, épave du Thistlegorm…' });
  function majOrigine() {
    lieuOrigine.hidden = !dive.lieuAuto || !dive.lieuNom;
    lieuOrigine.textContent = dive.lieuAuto === 'carnet'
      ? '✨ Nom repris d’une de tes plongées à côté. Tape un autre nom pour le changer.'
      : '✨ Nom trouvé d’après le GPS de la montre (OpenStreetMap). Tape un autre nom pour le changer.';
  }
  majOrigine();
  if (dive.lat != null && !dive.lieuNom && !dive.lieuEssaye) {
    // Pas encore de nom : on le cherche maintenant, sans bloquer la saisie.
    import('../lieu-auto.js').then(m => m.lieuAuto(dive, toutesDives)).then(patch => {
      if (!patch || dive.lieuNom) return;
      set(patch);
      const champ = picker.querySelector('input[type="search"]');
      if (champ && !champ.value) champ.value = patch.lieuNom;
      if (patch.site && !champSite.value) champSite.value = patch.site;
      majOrigine();
    }).catch(() => {});
  }

  const blocLieu = section('Lieu', { icone: '📍', ouvert: true },
    lieuOrigine,
    picker,
    field('Site (facultatif)', champSite),
    el('div', { style: { marginTop: '10px' } },
      field('Nature de l’eau', waterSeg, waterInfo)),
  );
  blocLieu.id = 'champ-lieu';
  blocLieu.querySelector('.sec-titre').append(el('span.requis', { text: ' •' }));
  form.append(blocLieu);

  // Les conditions : tout se touche, rien ne s'écrit (affiché plus bas).
  const blocConditions = section('Conditions', { icone: '🌤', ouvert: true,
    resume: dive.tempFond != null ? `eau ${dive.tempFond} °C` : '' },
    field('Météo en surface', pastilles(METEO, dive.meteo, v => set({ meteo: v }))),
    field('État de l’eau', pastilles(ETAT_MER, dive.etatMer, v => set({ etatMer: v }))),
    field('Visibilité', segmented(
      VISIBILITES.map(v => ({ id: v, label: `${VISIBILITE_ICONES[v] || ''} ${v}` })),
      dive.visibilite,
      v => set({ visibilite: dive.visibilite === v ? '' : v }))),
    field('Courant', pastilles(COURANTS, dive.courant, v => set({ courant: v }))),
    el('div.row-3', { style: { marginTop: '6px' } },
      field('Air (°C)', numInput(dive.tempAir, v => set({ tempAir: v }))),
      field('Surface (°C)',
        numInput(dive.tempSurface, v => { set({ tempSurface: v }); majOptionsAuto(); })),
      field('Fond (°C)', numInput(dive.tempFond, v => set({ tempFond: v }))),
    ),
  );

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

  const resumeChiffres = [dive.dureeMin ? `${dive.dureeMin} min` : null, dive.profMax ? `${dive.profMax} m` : null,
    dive.heureImmersion || null].filter(Boolean).join(' · ');
  const secProfil = section('Les chiffres', { icone: '📉', ouvert: !importee, resume: resumeChiffres },
    el('div.row', {}, champDuree, champProfMax),
    el('div.row', { style: { marginTop: '4px' } },
      field('Immersion (si connue)', inTime),
      field('Sortie (si connue)', outTime),
    ),
    el('div.hint', { text: 'Si tu donnes les deux horaires, la durée se calcule. '
      + 'Sinon la durée seule suffit — et l’heure de sortie se déduit si tu connais l’immersion.' }),
  );

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

  const secPaliers = el('div', { style: { marginTop: '14px' } },
    el('div.lbl', { text: '⏱ Paliers' }),
    dive.paliersEstimes ? el('div.hint', { style: { marginTop: 0 }, text: 'Estimés d’après le profil : vérifie-les.' }) : null,
    analyse && analyse.deco === false ? el('div.hint', { style: { marginTop: 0 },
      text: 'D’après la montre, aucun palier obligatoire (le plafond n’a jamais été atteint).' }) : null,
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
  );
  secProfil.querySelector('.card').append(secPaliers);

  // ---------- 8. Palanquée ----------
  // Taper un nom : connu, il est proposé ; inconnu, il est créé tout seul.
  // Le moniteur avec qui j'étais : le premier « MON » de la liste (palanquee.js).
  const editeur = editeurPalanquee(dive, buddies, () => renderMode());
  const centre = champCentre(dive, toutesDives);

  const modeWrap = el('div');
  function renderMode() {
    modeWrap.innerHTML = '';
    const sel = el('select');
    sel.append(el('option', { value: '', text: '— non précisé —' }));
    PALANQUEE_MODES.forEach(m => sel.append(el('option', { value: m.id, text: m.label })));
    sel.value = dive.palanqueeMode || '';
    sel.onchange = () => { dive.palanqueeMode = sel.value; };
    modeWrap.append(field('Organisation de la palanquée', sel));
  }

  renderMode();

  // Le même jour, au même endroit : la palanquée du matin, d'un geste.
  const matin = memeSortie(dive, toutesDives);
  const reprise = el('div');
  function rendreReprise() {
    reprise.replaceChildren();
    if (!matin?.buddyIds?.length) return;
    const memes = matin.buddyIds.length === (dive.buddyIds || []).length
      && matin.buddyIds.every(id => (dive.buddyIds || []).includes(id));
    if (memes) return;
    const noms = matin.buddyIds.map(id => buddies.find(b => b.id === id)).filter(Boolean)
      .map(b => b.prenom || fullName(b)).slice(0, 4).join(', ');
    reprise.append(el('button.btn.sm.reprise', { type: 'button', onclick: () => {
      dive.buddyIds = [...new Set([...(dive.buddyIds || []), ...matin.buddyIds])];
      if (!dive.palanqueeMode && matin.palanqueeMode) dive.palanqueeMode = matin.palanqueeMode;
      if (!dive.centreNom && matin.centreNom) {
        Object.assign(dive, { centreNom: matin.centreNom, centreAdresse: matin.centreAdresse || '',
          centreLat: matin.centreLat ?? null, centreLng: matin.centreLng ?? null });
      }
      editeur.rafraichir?.();
      renderMode();
      rendreReprise();
      toast('Palanquée reprise');
    } }, `👥 Comme la n°${matin.numero ?? ''} : ${noms}${matin.buddyIds.length > 4 ? '…' : ''}`));
  }
  rendreReprise();

  form.append(section('Plongeurs', { icone: '👥', ouvert: true },
    reprise,
    modeWrap,
    field('Centre de plongée', centre, 'Tape « plongée » pour voir les centres autour du lieu.'),
    field('Palanquée', editeur),
    el('button.btn.sm.ghost', { type: 'button', text: '📝 Retrouver les plongeurs dans un texte',
      onclick: () => lireUnTexte() }),
  ));

  /**
   * Un texte en vrac (le carnet recopié, un message, tes notes) : on y
   * cherche les plongeurs, même mal écrits, et on propose de les ajouter.
   */
  function lireUnTexte() {
    openModal(close => {
      const zone = el('textarea', { rows: 6,
        placeholder: 'Recopie ou colle ce que dit le carnet : « plongé avec Marc et Julie, 6 kg, froid… »' });
      zone.value = [dive.fait, dive.observations].filter(Boolean).join('\n');
      const sortie = el('div', { style: { marginTop: '10px' } });
      const chercher = () => {
        sortie.replaceChildren(propositionsTexte(zone.value, dive, buddies, {
          exclure: profil ? [fullName(profil)] : [],
          vide: 'Personne de reconnu. Un nouveau nom se repère après « avec » (« avec Paul Martin »).',
          onAjout: b => { editeur.rafraichir(); toast(`${fullName(b)} dans la palanquée`); },
        }));
      };
      zone.addEventListener('input', debounceLocal(chercher, 300));
      requestAnimationFrame(chercher);
      return el('div', {},
        el('h3', { text: '📝 Les plongeurs dans un texte' }),
        // La page du carnet, pour lire en tapant.
        carnetPapier.image() ? pageLisible(null, { src: carnetPapier.image(), hauteur: 'min(38vh, 320px)' }) : null,
        el('div.hint', { style: { marginTop: 0 },
          text: 'Les plongeurs connus sont retrouvés même mal orthographiés ; un « ? » quand deux portent le même prénom. '
            + 'Touche un nom pour l’ajouter.' }),
        zone, sortie,
        el('div.btn-row', {}, el('button.btn.primary', { type: 'button', text: 'Terminé', onclick: close })));
    });
  }

  // ---------- Ma plongée : cocher plutôt qu'écrire ----------
  dive.exercices ||= []; dive.ressenti ||= []; dive.objectifs ||= [];
  const etoiles = el('div.etoiles');
  function rendreEtoiles() {
    etoiles.replaceChildren(...[1, 2, 3, 4, 5].map(n => el('button', { type: 'button',
      class: (dive.note || 0) >= n ? 'on' : null, 'aria-label': `${n} sur 5`, text: '★',
      onclick: () => { dive.note = dive.note === n ? null : n; rendreEtoiles(); } })));
  }
  rendreEtoiles();

  const ressentis = el('div.pastilles');
  RESSENTIS.forEach(r => {
    const b = el('button.pastille', { type: 'button', class: dive.ressenti.includes(r.id) ? 'on' : null },
      el('span.pastille-ico', { text: r.icone }), el('span.pastille-txt', { text: r.label }));
    b.onclick = () => {
      dive.ressenti = dive.ressenti.includes(r.id) ? dive.ressenti.filter(x => x !== r.id) : [...dive.ressenti, r.id];
      b.classList.toggle('on', dive.ressenti.includes(r.id));
    };
    ressentis.append(b);
  });

  // Les exercices ne servent qu'en formation : affichés pour une plongée
  // d'enseignement, ou s'il y en a déjà de cochés.
  const zoneExercices = field('Exercices',
    chipGroup(EXERCICES, dive.exercices, (item, on) => {
      dive.exercices = on ? [...dive.exercices, item] : dive.exercices.filter(x => x !== item);
    }));
  function majExercices() {
    zoneExercices.hidden = !(dive.type === 'Enseignement' || dive.exercices?.length);
  }
  majExercices();

  const unMot = textarea(dive.observations, v => set({ observations: v }), 'Un mot si tu veux : ce qui t’a marqué, à retenir…');
  unMot.rows = 2;

  form.append(section('Ma plongée', { icone: '✨', ouvert: true },
    field('Ma note', etoiles),
    field('Comment c’était', ressentis),
    field('Au programme',
      chipGroup(DIVE_GOALS, dive.objectifs, (item, on) => {
        dive.objectifs = on ? [...dive.objectifs, item] : dive.objectifs.filter(x => x !== item);
      })),
    zoneExercices,
    field('Un mot', unMot),
    // L'ancien texte libre « ce que j'ai fait » reste modifiable s'il existe.
    dive.fait ? field('Ce que j’ai fait (texte)', textarea(dive.fait, v => set({ fait: v }))) : null,
  ));

  form.append(blocConditions, secProfil);

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

  form.append(section('Spécificités', { icone: '🏷', ouvert: false,
    resume: (dive.options || []).join(', ') },
    field('Options de la plongée', optionsZone, optionsNote),
    field('Autre objectif', input('text', dive.objectifAutre, v => set({ objectifAutre: v }),
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

  // --- Consommation d'air, déduite des pressions ---
  const zoneConso = el('div.conso');

  function majConso() {
    const c = consommation(dive);
    zoneConso.innerHTML = '';
    if (!c) {
      zoneConso.append(el('div.hint', { style: { marginTop: 0 },
        text: 'Renseigne le volume du bloc et les deux pressions pour connaître '
            + 'ta consommation.' }));
      return;
    }

    zoneConso.append(
      el('div.conso-chiffres', {},
        el('div.conso-bloc', {},
          el('div.conso-val', { text: `${c.surface} L/min` }),
          el('div.conso-lbl', { text: 'à la surface' })),
        el('div.conso-bloc', {},
          el('div.conso-val.secondaire', { text: `${c.brute} L/min` }),
          el('div.conso-lbl', { text: `à ${c.profMoy} m` })),
        el('div.conso-bloc', {},
          el('div.conso-val.secondaire', { text: `${c.litres} L` }),
          el('div.conso-lbl', { text: 'consommés' })),
      ),
      el('div.hint', { style: { marginBottom: 0 },
        text: c.estime
          ? `Profondeur moyenne estimée à ${c.profMoy} m (60 % de la profondeur max). `
          + 'Un import depuis l’ordinateur donnera la vraie valeur.'
          : 'Calculé sur la profondeur moyenne relevée par l’ordinateur. '
          + 'Le chiffre « surface » est celui qui permet de comparer deux plongées.' }),
    );
  }

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

  majConso();

  form.append(section('Bouteille', { icone: '🛢', ouvert: false,
    resume: [libelleGaz(dive), dive.blocLitres ? `${dive.blocLitres} L` : null,
      dive.pressionDepart && dive.pressionFin ? `${dive.pressionDepart}→${dive.pressionFin} bar` : null].filter(Boolean).join(' · ') },
    field('Gaz respiré', gazZone),
    el('div.row-3', { style: { marginTop: '14px' } },
      field('Type', blocTypeSel),
      field('Matière', blocMatSel),
      field('Volume (L)', numInput(dive.blocLitres, v => set({ blocLitres: v }), { placeholder: '12' })),
    ),
    el('div.row', {},
      field('Pression départ (bar)',
        numInput(dive.pressionDepart, v => { set({ pressionDepart: v }); majConso(); })),
      field('Pression fin (bar)',
        numInput(dive.pressionFin, v => { set({ pressionFin: v }); majConso(); })),
    ),
    zoneConso,
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

  form.append(section('Mon matériel', { icone: '🎽', ouvert: false,
    resume: [dive.lestage ? `${String(dive.lestage).replace(/\s*kg$/i, '')} kg` : null, dive.combiType,
      dive.combiMm ? `${dive.combiMm} mm` : null].filter(Boolean).join(' · ') },
    field('Lestage', input('text', dive.lestage, v => set({ lestage: v }),
      { placeholder: '6 kg ceinture + 2 kg poches' })),
    field('Combinaison', combiSeg),
    field('Épaisseur', mmSel),
    el('div.lbl', { style: { marginTop: '18px' }, text: 'Équipement emporté' }),
    equipZone,
  ));


  // ---------- 9. Ce que j'ai vu ----------
  const nbVus = ['vuFaune', 'vuFlore', 'vuEpaves'].reduce((n, k) => n + (dive[k]?.length || 0), 0);
  form.append(section('Ce que j’ai vu', { icone: '🐟', ouvert: false, resume: nbVus ? `${nbVus}` : '' },
    observationsPicker(dive)));

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
      await carnetPapier.avantEnregistrement();
      await store.saveDive(dive);
      await carnetPapier.apresEnregistrement().catch(() => {});

      toast(store.kind === 'local' ? 'Plongée enregistrée sur cet appareil' : 'Plongée enregistrée');
      navigate(`dive/${dive.id}`, true);
    } catch (e) {
      toast(e.message, true);
      saveBtn.disabled = false;
    }
  };

  const buttons = el('div.btn-row.actions-fiche', {}, saveBtn);
  if (!isNew) {
    buttons.append(el('button.btn.ghost', {
      type: 'button', text: '↪ Snorkeling, fosse…', title: 'Ce n’était pas une plongée : la ranger en séance',
      onclick: async () => {
        const { rangerUnePlongee } = await import('./seances.js');
        rangerUnePlongee(await store.getDive(dive.id) || dive);
      },
    }));
    buttons.append(el('button.btn.danger', {
      type: 'button', text: 'Supprimer',
      onclick: async () => {
        if (await confirmBox('Supprimer cette plongée ?', 'Supprimer')) {
          const photo = (await store.getDive(dive.id))?.photoCarnet?.ref;
          await store.deleteDive(dive.id);
          if (photo) oublierPhoto(photo).catch(() => {});
          toast('Plongée supprimée');
          navigate('dives', true);
        }
      },
    }));
  }
  // Les actions sont construites en dernier (elles dépendent de tout le
  // formulaire) mais s'affichent en premier. L'alerte les suit : le
  // message doit être visible depuis le bouton qui le déclenche.
  form.prepend(buttons, alerte);

  return { title: isNew ? 'Nouvelle plongée' : `Plongée n°${dive.numero}`,
    node: carnetPapier.envelopper(form), back: true };
}
