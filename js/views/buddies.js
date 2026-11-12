// ============================================================
//  Plongeurs : compagnons de palanquée
// ============================================================

import { el, fullName, nomPlongeur, couleurCategorie, toast, confirmBox, openModal } from '../lib.js';
import { verifierTags } from '../tags.js';
import { devinerGenre, genreDe, COULEUR_GENRE } from '../genre.js';
import { plongeurverse, editeurMii } from './plongeurverse.js';
import { store, emptyBuddy } from '../store.js';
import { navigate } from '../router.js';
import { ouvrirApercu, fermerApercu, ligneApercu, apercuPlongee } from '../apercu.js';


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
  let st = diverId ? await store.stats(diverId) : { buddyCount: {} };
  const moi = diverId ? await store.getDiver(diverId) : null;     // dans le Plongeurverse aussi
  const plongeesMoi = diverId ? await store.listDives(diverId) : [];   // pour les binômes du Plongeurverse
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
  // Le Plongeurverse d'abord, à chaque ouverture ; un interrupteur pour la liste.
  let vue = 'verse';

  const recherche = el('input', { type: 'search', placeholder: 'Nom, tag, licence…', autocapitalize: 'off' });
  const seg = el('div.seg.annuaire-tri');
  const puces = el('div.cat-filtres');
  const outilTag = el('div.tag-outil');
  const liste = el('div');
  const interrupteur = el('div.seg.vue-switch', { role: 'tablist', 'aria-label': 'Affichage des plongeurs : Miis ou liste' });
  const majInterrupteur = () => {
    interrupteur.replaceChildren(...[['verse', 'Miis'], ['liste', 'Liste']].map(([id, label]) => {
      const bt = el('button', { type: 'button', role: 'tab', text: label, 'aria-selected': String(vue === id) });
      bt.dataset.vue = id;
      if (vue === id) bt.classList.add('on');
      bt.onclick = () => { if (vue === id) return; vue = id; majInterrupteur(); rendre(); };
      return bt;
    }));
    seg.hidden = vue === 'verse';            // le tri ne sert qu'à la liste
  };
  majInterrupteur();
  wrap.append(interrupteur, el('div.annuaire-barre', {}, recherche, seg,
    el('button.btn.primary.sm.annuaire-ajout', { type: 'button', title: 'Ajouter un plongeur', 'aria-label': 'Ajouter un plongeur',
      onclick: () => navigate('buddy/new') }, '＋', el('span', { text: ' Ajouter' }))), puces, outilTag, liste);

  const n = b => st.buddyCount[b.id] || 0;
  const initiales = b => (b.structure ? (b.prenom || '?').slice(0, 2) : (b.prenom?.[0] || '') + (b.nom?.[0] || '')).toUpperCase() || '?';
  const cats = b => (b.categories || []).filter(Boolean);
  const estMoniteur = b => !!(b.moniteur || b.structure);

  // Une ligne serrée par personne : nom, MON, tags, nombre de plongées
  // ensemble. La licence reste dans la fiche (et la recherche la trouve).
  function carte(b) {
    const nb = n(b);
    return el(`button.pcarte${estMoniteur(b) ? '.mon' : ''}`, { type: 'button', onclick: () => apercuPlongeur(b.id, { onClose: recharger }),
      title: [b.licence ? `Licence ${b.licence}` : '', b.structure ? 'Moniteur du centre (nom pas noté)' : ''].filter(Boolean).join(' · ') },
      el('span.personne-av', {}, initiales(b)),
      el('span.pcarte-txt', {},
        el('b', { text: b.structure ? (b.prenom || 'Centre') : (nomPlongeur(b) || 'Sans nom') }),
        estMoniteur(b) ? el('span.badge-mon', { text: 'MON' }) : null,
        ...cats(b).map(c => el('span.cat', { style: { '--cat': couleurCategorie(c) }, text: c }))),
      nb ? el('span.personne-n', { title: `${nb} plongée${nb > 1 ? 's' : ''} ensemble`, text: String(nb) }) : null);
  }

  function rendre() {
    seg.innerHTML = '';
    [['frequents', 'Fréquents'], ['az', 'A–Z']].forEach(([id, label]) => {
      // (« Fréq. » sur téléphone : voir .annuaire-barre en CSS)
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
    if (categories.length) {
      outilTag.append(el('div.tag-actions', {},
        el('button.btn.sm.ghost', { type: 'button', text: '🔎 Vérifier les tags avec mes plongées',
          onclick: () => ouvrirVerification() }),
        filtre.startsWith('cat:') ? null : el('span.hint', { style: { margin: 0 }, text: 'Pour renommer un tag : touche-le ci-dessus.' })));
    }
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
      outilTag.append(el('div.tag-renommer', {}, el('span', { text: `✎ Renommer « ${tag} » pour tout le monde :` }), champ,
        el('button.btn.sm', { type: 'button', text: 'Renommer', onclick: renommer }),
        el('span.hint', { style: { margin: 0, flexBasis: '100%' },
          text: 'Un nom déjà utilisé fusionne les deux tags.' })));
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

    if (vue === 'verse') {
      // Une seule scène pour tout le monde : un filtre ou une recherche
      // met les élus en rangs (une petite armée), les autres sortent.
      if (!scene) scene = plongeurverse({ buddies, compte: n, moi, dives: plongeesMoi, onMoi: () => navigate('cv'),
        onTap: b => apercuPlongeur(b.id, { onClose: recharger }) });
      scene.ranger?.(!filtre && !q ? null : new Set(filtres.map(b => b.id)));
      // Les genres pas encore notés : on peut enregistrer ce que le prénom suggère.
      const aDeviner = buddies.filter(b => !b.structure && !b.genre && devinerGenre(b.prenom));
      const pied = el('div.pverse-pied', {},
          el('span', {}, el('b', { style: { color: COULEUR_GENRE.h }, text: 'garçons' }), ' en bleu, ',
            el('b', { style: { color: COULEUR_GENRE.f }, text: 'filles' }), ' en rose, ',
            el('b', { style: { color: COULEUR_GENRE[''] }, text: 'inconnu' }), ' en gris.'),
          aDeviner.length ? el('button.btn.sm.ghost', { type: 'button', text: `♂♀ Enregistrer les genres devinés (${aDeviner.length})`,
            onclick: async () => {
              for (const b of aDeviner) {
                const frais = await store.getBuddy(b.id);
                if (frais && !frais.genre) { frais.genre = devinerGenre(frais.prenom); await store.saveBuddy(frais); }
              }
              toast(`Genre noté pour ${aDeviner.length} plongeur${aDeviner.length > 1 ? 's' : ''} — corrige dans leur fiche si besoin`);
              recharger();
            } }) : null);
      if (liste.firstElementChild !== scene) liste.replaceChildren(scene, pied);
      else liste.lastElementChild.replaceWith(pied);
      return;
    }
    scene = null;
    liste.replaceChildren(filtres.length
      ? el('div.pgrille', {}, ...filtres.map(carte))
      : el('div.empty', { text: 'Aucun plongeur ne correspond.' }));
  }

  let scene = null;           // le Plongeurverse, gardé d'un filtre à l'autre
  async function recharger() {
    buddies.splice(0, buddies.length, ...await store.listBuddies());
    scene = null;
    if (diverId) st = await store.stats(diverId);     // une fusion change les compteurs
    rendre();
  }

  /**
   * Les tags comparés aux plongées : qui manque à un tag, qui n'a jamais
   * plongé, qui n'a pas de tag, et où plongent les gens de chaque tag.
   * On coche ce qu'on veut corriger, rien ne change sans « Appliquer ».
   */
  async function ouvrirVerification() {
    const dives = diverId ? await store.listDives(diverId) : [];
    const seances = diverId ? await store.listSeances(diverId) : [];
    const { tags, sansTag } = verifierTags(buddies, dives, seances);
    const ajouts = [];         // { buddy, tag, coche }
    const nom = b => nomPlongeur(b) || 'Sans nom';

    openModal(close => {
      const bouton = el('button.btn.primary', { type: 'button' });
      const maj = () => {
        const k = ajouts.filter(a => a.coche).length;
        bouton.textContent = k ? `Ajouter ${k} tag${k > 1 ? 's' : ''}` : 'Rien de coché';
        bouton.disabled = !k;
      };
      const ligne = (a, texte) => {
        const c = el('input', { type: 'checkbox' });
        c.checked = a.coche;
        c.onchange = () => { a.coche = c.checked; maj(); };
        return el('label.verif-ligne', {}, c, el('span', {}, el('b', { text: nom(a.buddy) }), ' ', texte));
      };
      const pastille = t => el('span.cat', { style: { '--cat': couleurCategorie(t) }, text: t });

      const blocs = tags.map(t => {
        const lignes = t.aAjouter.map(x => {
          const a = { buddy: x.buddy, tag: t.tag, coche: x.ensemble / x.total >= 0.75 && x.ensemble >= 2 };
          ajouts.push(a);
          return ligne(a, el('small', { text: `${x.ensemble} sortie${x.ensemble > 1 ? 's' : ''} sur ${x.total} avec des « ${t.tag} »` }));
        });
        return el('div.verif-tag', {},
          el('div.verif-tete', {}, pastille(t.tag), el('small', { text: `${t.membres.length} plongeur${t.membres.length > 1 ? 's' : ''}` })),
          t.lieux.length ? el('div.hint', { style: { margin: '4px 0' },
            text: `Plongent surtout à : ${t.lieux.map(l => `${l.lieu} (${l.n})`).join(', ')}` }) : null,
          lignes.length ? el('div', {}, el('div.verif-lbl', { text: `Sans le tag, mais souvent avec des « ${t.tag} » :` }), ...lignes) : null,
          t.sansPlongee.length ? el('div.hint', { style: { margin: '4px 0 0' },
            text: `Ni plongée ni séance au carnet : ${t.sansPlongee.map(nom).join(', ')}` }) : null,
          !lignes.length && !t.sansPlongee.length ? el('div.hint', { style: { margin: '4px 0 0' }, text: '✓ Rien à signaler.' }) : null);
      });

      // Déjà proposés dans un tag plus haut : pas une seconde fois.
      const dejaProposes = new Set(ajouts.map(a => a.buddy.id));
      const restants = sansTag.filter(x => !dejaProposes.has(x.buddy.id));
      const sans = restants.length ? el('div.verif-tag', {},
        el('div.verif-tete', {}, el('b', { text: 'Sans aucun tag' }), el('small', { text: `${restants.length} plongeur${restants.length > 1 ? 's' : ''} de tes plongées` })),
        ...restants.map(x => {
          if (!x.tag) return el('div.verif-ligne', {}, el('span', {}, el('b', { text: nom(x.buddy) }), ' ',
            el('small', { text: `${x.total} plongée${x.total > 1 ? 's' : ''}, aucun compagnon tagué` })));
          const a = { buddy: x.buddy, tag: x.tag, coche: false };
          ajouts.push(a);
          return ligne(a, el('span', {}, el('small', { text: '→ ' }), pastille(x.tag),
            el('small', { text: ` ${x.ensemble} plongée${x.ensemble > 1 ? 's' : ''} sur ${x.total}` })));
        })) : null;

      bouton.onclick = async () => {
        bouton.disabled = true;
        try {
          const parPersonne = new Map();
          ajouts.filter(a => a.coche).forEach(a => parPersonne.set(a.buddy.id, [...(parPersonne.get(a.buddy.id) || []), a.tag]));
          for (const [id, nouveaux] of parPersonne) {
            const b = await store.getBuddy(id);
            if (!b) continue;
            b.categories = [...new Set([...(b.categories || []), ...nouveaux])];
            await store.saveBuddy(b);
          }
          close();
          toast(`Tags ajoutés à ${parPersonne.size} plongeur${parPersonne.size > 1 ? 's' : ''}`);
          recharger();
        } catch (e) { toast(e.message, true); bouton.disabled = false; }
      };
      maj();
      return el('div', {},
        el('h3', { text: '🔎 Les tags, comparés à tes plongées' }),
        el('div.hint', { style: { marginTop: 0 },
          text: 'D’après qui était dans tes palanquées et tes séances (fosse…). Coche ce qui est juste ; rien ne change sans « Ajouter ». '
            + 'Pour retirer un tag à quelqu’un : sa fiche. Pour renommer : touche le tag dans les filtres.' }),
        el('div.verif-liste', {}, ...blocs, sans),
        el('div.btn-row', {}, el('button.btn.ghost', { type: 'button', text: 'Fermer', onclick: close }), bouton));
    });
  }

  recherche.addEventListener('input', rendre);
  rendre();

  return { title: 'Plongeurs', node: wrap };
}

/**
 * Homme / Femme : trois boutons. Sans choix, le prénom fait deviner
 * (affiché en pointillé).
 */
export function choixGenre(b, onChange) {
  const boite = el('div.seg.genre-seg');
  const rendre = () => {
    const devine = !b.genre ? devinerGenre(b.prenom) : '';
    boite.replaceChildren(...[['h', '♂ Homme'], ['f', '♀ Femme'], ['', '—']].map(([v, label]) => {
      const bt = el('button', { type: 'button', text: label, class: `g-${v || 'x'}` });
      if ((b.genre || '') === v) bt.classList.add('on');
      if (!b.genre && devine === v && v) { bt.classList.add('devine'); bt.title = 'Deviné d’après le prénom'; }
      bt.onclick = () => { onChange(v); rendre(); };
      return bt;
    }));
  };
  rendre();
  boite.rafraichir = rendre;
  return boite;
}

// ------------------------------------------------------------
//  Fusionner deux fiches de la même personne
// ------------------------------------------------------------

const sansAccent = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Même prénom, ou un prénom qui commence l'autre : sans doute la même personne. */
export function probablementLeMeme(a, b) {
  const pa = sansAccent(a.prenom), pb = sansAccent(b.prenom), na = sansAccent(a.nom), nb = sansAccent(b.nom);
  if (pa && pa === pb && (!na || !nb || na === nb)) return true;
  if (na && na === nb && (!pa || !pb || pa[0] === pb[0])) return true;
  return false;
}

/**
 * Choisir la fiche en double, puis la fondre dans celle-ci : ses plongées,
 * séances et tags passent ici, et elle disparaît.
 */
export async function fusionnerAvec(garderId, apres = () => {}) {
  const garder = await store.getBuddy(garderId);
  if (!garder) return toast('Plongeur introuvable', true);
  const diverId = await store.getActiveDiverId();
  const dives = diverId ? await store.listDives(diverId) : [];
  const seances = diverId ? await store.listSeances(diverId) : [];
  const nb = id => dives.filter(d => (d.buddyIds || []).includes(id)).length + seances.filter(x => (x.buddyIds || []).includes(id)).length;
  const autres = (await store.listBuddies()).filter(x => x.id !== garderId)
    .sort((x, y) => (probablementLeMeme(garder, y) - probablementLeMeme(garder, x)) || nomPlongeur(x).localeCompare(nomPlongeur(y), 'fr'));
  const nomDe = x => nomPlongeur(x) || 'Sans nom';

  openModal(close => {
    const recherche = el('input', { type: 'search', placeholder: 'Chercher la fiche en double…', autocomplete: 'off' });
    const liste = el('div.fusion-liste');
    const rendre = () => {
      const q = sansAccent(recherche.value);
      const vus = autres.filter(x => !q || sansAccent(`${fullName(x)} ${(x.categories || []).join(' ')}`).includes(q)).slice(0, 40);
      liste.replaceChildren(...vus.map(x => el('button.fusion-ligne', { type: 'button',
        onclick: async () => {
          const n = nb(x.id);
          if (!(await confirmBox(`Fondre « ${nomDe(x)} » dans « ${nomDe(garder)} » ? `
            + `${n ? `Ses ${n} plongée${n > 1 ? 's' : ''} et séance${n > 1 ? 's' : ''} passent à « ${nomDe(garder)} », ` : ''}`
            + 'ses tags aussi, et sa fiche disparaît.', 'Fusionner', false))) return;
          try {
            const r = await store.fusionnerPlongeurs(garderId, x.id);
            close();
            toast(`Fusionnés : ${r.plongees} plongée${r.plongees > 1 ? 's' : ''}, ${r.seances} séance${r.seances > 1 ? 's' : ''} reprises`);
            apres();
          } catch (e) { toast(e.message, true); }
        } },
        el('span.personne-av', {}, ((x.prenom?.[0] || '') + (x.nom?.[0] || '')).toUpperCase() || '?'),
        el('span.fusion-txt', {}, el('b', { text: nomDe(x) }),
          el('small', { text: [probablementLeMeme(garder, x) ? '⚠ doublon probable' : '', (x.categories || []).join(', '),
            `${nb(x.id)} sortie${nb(x.id) > 1 ? 's' : ''}`].filter(Boolean).join(' · ') })))));
      if (!vus.length) liste.append(el('div.hint', { text: 'Personne ne correspond.' }));
    };
    recherche.addEventListener('input', rendre);
    rendre();
    requestAnimationFrame(() => recherche.focus());
    return el('div', {},
      el('h3', { text: `⇄ Fusionner avec « ${nomDe(garder)} »` }),
      el('div.hint', { style: { marginTop: 0 },
        text: `La même personne a deux fiches ? Choisis l’autre : elle sera fondue dans « ${nomDe(garder)} », qui reste. Les doublons probables sont en tête.` }),
      recherche, liste,
      el('div.btn-row', {}, el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close })));
  });
}

/** Aperçu modifiable d'un plongeur, sur le bord de l'écran. */
export async function apercuPlongeur(id, { onClose = null } = {}) {
  const b = structuredClone(await store.getBuddy(id));
  if (!b) return toast('Plongeur introuvable', true);
  window.dispatchEvent(new CustomEvent('pj-vue', { detail: `fiche de ${b.prenom || '?'}` }));
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
  const mii = b.structure ? null : editeurMii(b, v => maj({ mii: v }));
  const genreSeg = choixGenre(b, v => { maj({ genre: v }); mii?.rafraichir(); });
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

  const tete = el('div.apercu-tete-plongee', {},
    el('span.personne-av', { style: { width: '52px', height: '52px', flex: '0 0 52px', fontSize: '17px' } },
      ((b.prenom?.[0] || '') + (b.nom?.[0] || '')).toUpperCase() || '?'),
    el('div', {},
      el('div.apercu-t1', { text: b.structure ? (b.prenom || 'Centre') : (nomPlongeur(b) || 'Sans nom') }),
      el('div.apercu-t2', { text: [ensemble.length ? `${ensemble.length} plongée${ensemble.length > 1 ? 's' : ''} ensemble` : 'pas encore plongé ensemble'].filter(Boolean).join(' · ') })));

  const rouvrir = () => apercuPlongeur(id, { onClose });
  const corps = el('div', {},
    el('div.apercu-grille', {},
      champ(b.structure ? 'Centre de plongée' : 'Prénom', saisie('prenom')),
      b.structure ? null : champ('Nom', saisie('nom')),
      b.structure ? null : champ('Licence', saisie('licence')),
      el('div.apercu-champ.large', {}, el('span', { text: 'Genre' }), genreSeg),
      mii ? el('div.apercu-champ.large', {}, el('span', { text: 'Son Mii' }), mii) : null,
      el('div.apercu-champ.large', {}, coche('moniteur', 'Moniteur')),
      el('div.apercu-champ.large', {}, el('span', { text: 'Tags' }), zoneCats),
      champ('Note', note, true)),
    ensemble.length ? el('div.apercu-bloc', {}, el('div.apercu-lbl', { text: 'Plongées ensemble' }),
      el('div.apercu-liste', {}, ...ensemble.map(d => ligneApercu(d, () => apercuPlongee(d.id, { retour: rouvrir, onClose }))))) : null);

  const pied = el('div.apercu-actions', {}, temoin,
    el('button.btn.ghost.sm', { type: 'button', text: '⇄ Fusionner…', title: 'Même personne en deux fiches',
      onclick: async () => { clearTimeout(t); if (String(b.prenom || b.nom || '').trim()) await store.saveBuddy(b);
        fusionnerAvec(b.id, () => { fermerApercu(); onClose?.(); }); } }),
    el('button.btn.primary.sm', { type: 'button', text: 'Fiche complète ›', onclick: () => navigate(`buddy/${b.id}`) }));

  ouvrirApercu({ tete, corps, pied }, { onClose });
}

// ------------------------------------------------------------

export async function buddyFormView({ id }) {
  const isNew = !id || id === 'new';
  let b = isNew ? emptyBuddy() : structuredClone(await store.getBuddy(id));
  if (!b) return { title: 'Introuvable', node: el('div.empty', { text: 'Plongeur introuvable.' }), back: true };

  const set = p => Object.assign(b, p);
  const miiForm = editeurMii(b, v => set({ mii: v }));
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
    buttons.append(el('button.btn.ghost', {
      type: 'button', text: '⇄ Fusionner…', title: 'Même personne en deux fiches',
      onclick: () => fusionnerAvec(b.id, () => navigate('buddies', true)),
    }));
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
  // de sens pour elle (nom de famille, licence).
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
      field('Genre', choixGenre(b, v => { set({ genre: v }); miiForm.rafraichir(); }),
        'Sans choix, il est deviné d’après le prénom (bouton en pointillé).'),
      field('Son Mii', miiForm, 'Peau, cheveux (gris, blancs, dégarni, chauve), barbe : comme dans le Plongeurverse.'),
      field('Qualification',
        el('label.switch', {}, caseMoniteur, el('span', { text: 'C’est un moniteur' })),
        'Un niveau (N1, N3…) change avec le temps : le figer ici serait faux pour '
      + 'tes plongées passées. Seul « moniteur ou non » reste vrai. Ton propre niveau, '
      + 'lui, est enregistré sur chaque plongée.'),
      field('Note', input('text', b.note, v => set({ note: v }),
        { placeholder: 'Contact, remarque…' })),
    );
  }

  rendreIdentite();

  form.append(el('div.section', {},
    el('h2', { text: 'Identité' }),
    blocIdentite,
  ));

  return { title: isNew ? 'Nouveau plongeur' : fullName(b), node: form, back: true };
}
