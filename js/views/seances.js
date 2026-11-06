// ============================================================
//  Séances : fosse (plongée bouteille du jeudi), piscine, apnée
//
//  Elles vivent à côté du carnet, pas dedans : pas de numéro, pas de
//  niveau, elles ne gonflent pas le nombre de plongées. Mais elles se
//  comptent (« combien de fosses cette année ? »), se voient au
//  calendrier, et se pointent en deux gestes.
// ============================================================

import { el, fmtDate, fmtDateLong, fmtDuration, todayISO, num, toast, confirmBox, openModal, fullName } from '../lib.js';
import { store, TYPES_SEANCE, typeSeance, emptySeance, statsSeances } from '../store.js';
import { navigate } from '../router.js';
import { profileSvg } from '../fit.js';
import { plongeesARanger } from '../seances.js';
import { apercuSeance } from '../apercu.js';
import { editeurPalanquee, propositionsTexte } from '../palanquee.js';
import { agendaBranche, agendaLisible, chargerAgenda, evenementsDu, texteEvenement } from '../agenda.js';
import { trouverPlongeurs } from '../noms.js';

/**
 * « Ce jour-là dans ton agenda » pour une séance : les événements du jour
 * et les plongeurs dont le nom y est écrit, à ajouter d'un geste.
 * Rien si l'agenda n'est pas relié (Réglages) ou hors de l'APK.
 */
export function agendaAvecQui(seance, buddies, { exclure = [], onAjout = () => {} } = {}) {
  if (!agendaBranche() || !agendaLisible()) return null;
  const bloc = el('div.card.agenda-jour', {}, el('div.lbl', { text: '📅 Ce jour-là dans ton agenda' }));
  const liste = el('div');
  bloc.append(liste);
  bloc.recharger = () => {
    if (!seance.date) { liste.replaceChildren(el('div.hint', { text: 'Indique la date.' })); return; }
    liste.replaceChildren(el('div.hint', { text: 'Lecture de l’agenda…' }));
    chargerAgenda().then(ev => {
      const du = evenementsDu(ev, seance.date);
      liste.replaceChildren(...(du.length ? du.map(e => el('div.agenda-ev', { style: { display: 'block' } },
        el('div.agenda-ev-txt', {}, el('b', { text: e.titre || '(sans titre)' }),
          e.desc ? el('span', { text: e.desc }) : null),
        propositionsTexte(texteEvenement(e), seance, buddies, { exclure, onAjout }))) : [el('div.hint', { text: 'Rien dans l’agenda ce jour-là.' })]));
    }).catch(e => liste.replaceChildren(el('div.hint', { text: e.message })));
  };
  bloc.recharger();
  return bloc;
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** Pastille colorée d'un type de séance. */
export function pastilleSeance(type, taille = 34) {
  const t = typeSeance(type);
  return el('span.seance-pastille', {
    class: `s-${t.id}`, title: t.label,
    style: { width: `${taille}px`, height: `${taille}px`, flex: `0 0 ${taille}px`, fontSize: `${Math.round(taille * 0.5)}px` },
    text: t.icone,
  });
}

/** Une ligne résumée : « 19:15 · 1h09 · 19,6 m · Fosse de Villeneuve ». */
export function resumeSeance(s) {
  return [s.heure || null,
          s.dureeMin ? fmtDuration(s.dureeMin) : null,
          s.profMax ? `${s.profMax} m` : null,
          s.distanceM ? `${s.distanceM} m nagés` : null,
          s.apneeMaxS ? `apnée ${s.apneeMaxS} s` : null,
          s.lieu || null].filter(Boolean).join(' · ');
}

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

// ------------------------------------------------------------
//  Le panneau « Séances » de l'écran Plongées
// ------------------------------------------------------------

export function seancesPanneau({ seances, dives, types = TYPES_SEANCE }) {
  const wrap = el('div');
  const annee = String(new Date().getFullYear());
  const st = statsSeances(seances, annee);

  // Compteurs : ce qu'on vient chercher en premier.
  wrap.append(el('div.stat-grid.seances-compteurs', {},
    ...types.map(t => {
      const p = st.parType[t.id];
      return el('button.stat.seance-stat', {
        type: 'button', class: `s-${t.id}`, onclick: () => { filtre = filtre === t.id ? '' : t.id; rendreListe(); },
        title: `Afficher seulement : ${t.label}`,
      },
        el('div.n', {}, el('span.seance-stat-ico', { text: t.icone }), String(p.total)),
        el('div.l', { text: `${p.total > 1 ? t.pluriel : t.label.toLowerCase()}${p.annee !== p.total ? ` · ${p.annee} en ${annee}` : ''}` }),
        p.derniere ? el('div.l', { text: `dernière le ${fmtDate(p.derniere)}` }) : null);
    })));

  // Pointer une séance : un geste par type, date du jour, le reste
  // pré-rempli d'après la dernière séance du même type.
  wrap.append(el('div.btn-row.seances-ajout', {},
    ...types.map(t => el('button.btn', {
      type: 'button', text: `＋ ${t.icone} ${t.label}`,
      onclick: () => navigate(`seance/new?type=${t.id}`),
    }))));

  // Des plongées importées qui étaient des séances (piscine, fosse) ?
  const aRanger = plongeesARanger(dives, seances);
  if (aRanger.length) {
    wrap.append(el('div.card.alerte', { style: { marginTop: '14px' } },
      el('div', { style: { fontWeight: '650' },
        text: `${pluriel(aRanger.length, 'plongée importée ressemble', 'plongées importées ressemblent')} à des séances` }),
      el('div.hint', { text: 'Piscine sans profondeur, petit bain, fosse du jeudi… Range-les ici : '
        + 'elles sortiront du carnet et ne compteront plus comme plongées.' }),
      el('button.btn.primary', { type: 'button', style: { marginTop: '10px' }, text: 'Voir et ranger',
        onclick: () => rangerPlongees(aRanger) })));
  }

  // Des plongées qui étaient du snorkeling, une fosse… : on les choisit
  // à la main dans le carnet.
  if (dives.length) {
    wrap.append(el('button.btn.ghost.sm', { type: 'button', style: { marginTop: '10px' },
      text: '↪ Ranger des plongées du carnet en séances (snorkeling…)',
      onclick: () => rangerPlongees(dives.map(dive => ({ dive, type: 'snorkeling' })), { cocher: false }) }));
  }

  // Les fosses sans personne : l'agenda dit souvent avec qui.
  const sansPersonne = seances.filter(x => !(x.buddyIds || []).length && x.date);
  if (sansPersonne.length && agendaBranche() && agendaLisible()) {
    wrap.append(el('button.btn.ghost.sm', { type: 'button', style: { marginTop: '10px', marginLeft: '6px' },
      text: `📅 Avec qui ? Retrouver dans l’agenda (${sansPersonne.length})`,
      onclick: () => avecQuiDepuisAgenda(sansPersonne) }));
  }

  let filtre = '';
  const chips = el('div.chips', { style: { margin: '16px 0 8px' } });
  const liste = el('div');
  wrap.append(chips, liste);

  function rendreListe() {
    chips.innerHTML = '';
    [['', `Toutes · ${seances.length}`], ...types.map(t => [t.id, `${t.icone} ${t.label} · ${st.parType[t.id].total}`])]
      .forEach(([id, label]) => {
        const c = el('button.chip', { type: 'button', text: label });
        if (id === filtre) c.classList.add('on');
        c.onclick = () => { filtre = id; rendreListe(); };
        chips.append(c);
      });

    liste.innerHTML = '';
    const shown = seances.filter(s => !filtre || s.type === filtre);
    if (!shown.length) {
      liste.append(el('div.empty', {},
        el('span.big', { text: '🏊' }),
        seances.length ? 'Aucune séance de ce type.' : 'Aucune séance pour l’instant.', el('br'),
        'Pointe ta fosse du jeudi, une piscine ou une apnée avec les boutons ci-dessus.'));
      return;
    }

    const parAnnee = new Map();
    shown.forEach(s => {
      const y = (s.date || '').slice(0, 4) || 'Sans date';
      if (!parAnnee.has(y)) parAnnee.set(y, []);
      parAnnee.get(y).push(s);
    });
    let premiere = true;
    parAnnee.forEach((lot, y) => {
      const compte = types.map(t => [t, lot.filter(s => s.type === t.id).length])
        .filter(([, n]) => n).map(([t, n]) => `${n} ${t.icone}`).join(' · ');
      const groupe = el('details.annee-groupe', { open: premiere },
        el('summary.annee-tete', {},
          el('span.annee-num', { text: y }),
          el('span.annee-info', { text: compte }),
          el('span.annee-chevron', { 'aria-hidden': 'true', text: '›' })),
        el('div.annee-cartes', {}, ...lot.map(carteSeance)));
      premiere = false;
      liste.append(groupe);
    });
  }

  rendreListe();
  return wrap;
}

function carteSeance(s) {
  const t = typeSeance(s.type);
  const jour = s.date ? JOURS[new Date(`${s.date}T12:00:00`).getDay()] : '';
  return el('div.card.clickable.seance-carte', { onclick: () => apercuSeance(s.id) },
    pastilleSeance(s.type, 40),
    el('div', { style: { flex: 1, minWidth: 0 } },
      el('div', { style: { fontWeight: '600' } }, `${t.label} · `, el('span', { text: s.date ? `${jour} ${fmtDate(s.date)}` : 'sans date' })),
      el('div', { style: { color: 'var(--text-dim)', fontSize: '13px' }, text: resumeSeance(s) || '—' }),
      s.notes ? el('div', { style: { color: 'var(--text-mute)', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, text: s.notes }) : null),
    el('span', { style: { color: 'var(--text-mute)' }, text: '›' }));
}

// ------------------------------------------------------------
//  Avec qui ? Les séances sans personne, d'après l'agenda
// ------------------------------------------------------------

async function avecQuiDepuisAgenda(seances) {
  let ev = [];
  try { ev = await chargerAgenda(); } catch (e) { toast(e.message, true); return; }
  const buddies = await store.listBuddies();
  const moi = await store.getDiver(seances[0]?.diverId);
  const exclure = moi ? [fullName(moi)] : [];

  // Pour chaque séance : les noms trouvés dans les événements du jour.
  const lignes = [];
  for (const s of seances) {
    const textes = evenementsDu(ev, s.date).map(texteEvenement);
    if (!textes.length) continue;
    const { connus, nouveaux } = trouverPlongeurs(textes.join(' — '), buddies, { exclure });
    if (!connus.length && !nouveaux.length) continue;
    lignes.push({ s, textes, connus: connus.map(c => ({ ...c, coche: c.sur })), nouveaux: nouveaux.map(n => ({ nom: n, coche: true })) });
  }
  if (!lignes.length) { toast('Aucun nom trouvé dans l’agenda pour ces séances'); return; }

  openModal(close => {
    const bouton = el('button.btn.primary', { type: 'button' });
    const maj = () => {
      const n = lignes.filter(l => l.connus.some(c => c.coche) || l.nouveaux.some(c => c.coche)).length;
      bouton.textContent = n ? `Compléter ${pluriel(n, 'séance', 'séances')}` : 'Rien de coché';
      bouton.disabled = !n;
    };
    const puce = (libelle, item, titre = '') => {
      const c = el('button.chip', { type: 'button', title: titre, text: libelle });
      c.classList.toggle('on', item.coche);
      c.onclick = () => { item.coche = !item.coche; c.classList.toggle('on', item.coche); maj(); };
      return c;
    };
    const liste = el('div', { style: { maxHeight: '60vh', overflow: 'auto' } },
      ...lignes.map(l => el('div.card', { style: { padding: '10px 12px', marginBottom: '8px' } },
        el('div', { style: { fontWeight: '600' } }, `${typeSeance(l.s.type).icone} ${typeSeance(l.s.type).label} · ${fmtDate(l.s.date)}`),
        el('div.hint', { style: { margin: '2px 0 6px' }, text: l.textes.join(' · ') }),
        el('div.chips', {},
          ...l.connus.map(c => puce(`${fullName(c.buddy)}${c.sur ? '' : ' ?'}`, c, c.sur ? '' : 'Prénom partagé : vérifie')),
          ...l.nouveaux.map(n => puce(`${n.nom} (nouveau)`, n, 'Sera ajouté à tes plongeurs'))))));

    bouton.onclick = async () => {
      bouton.disabled = true;
      try {
        const crees = new Map();
        let n = 0;
        for (const l of lignes) {
          const ids = l.connus.filter(c => c.coche).map(c => c.buddy.id);
          for (const x of l.nouveaux.filter(c => c.coche)) {
            const cle = x.nom.toLowerCase();
            if (!crees.has(cle)) {
              const { creerPlongeur } = await import('../palanquee.js');
              crees.set(cle, await creerPlongeur(x.nom, buddies));
            }
            ids.push(crees.get(cle).id);
          }
          if (!ids.length) continue;
          const s = await store.getSeance(l.s.id);
          s.buddyIds = [...new Set([...(s.buddyIds || []), ...ids])];
          await store.saveSeance(s);
          n++;
        }
        close();
        toast(`${pluriel(n, 'séance complétée', 'séances complétées')}${crees.size ? ` · ${pluriel(crees.size, 'plongeur ajouté', 'plongeurs ajoutés')}` : ''}`);
        navigate('seances', true);
      } catch (e) { toast(e.message, true); bouton.disabled = false; }
    };
    maj();
    return el('div', {},
      el('h3', { text: '📅 Avec qui ? D’après ton agenda' }),
      el('div.hint', { style: { marginTop: 0 },
        text: 'Les noms écrits dans tes événements du jour. Touche pour cocher / décocher ; « ? » : deux plongeurs ont ce prénom.' }),
      liste,
      el('div.btn-row', {}, el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }), bouton));
  });
}

// ------------------------------------------------------------
//  Une plongée qui n'en était pas une : snorkeling, fosse, piscine…
// ------------------------------------------------------------

export function rangerUnePlongee(dive) {
  openModal(close => el('div', {},
    el('h3', { text: 'Ce n’était pas une plongée' }),
    el('div.hint', { style: { marginTop: 0 },
      text: `n°${dive.numero ?? '—'} du ${fmtDate(dive.date)} : elle quitte le carnet (les numéros suivants se décalent) `
        + 'et devient une séance. Profil, heure, position et compagnons sont gardés.' }),
    el('div.btn-row', { style: { flexDirection: 'column', alignItems: 'stretch' } },
      ...TYPES_SEANCE.map(t => el('button.btn', { type: 'button', text: `${t.icone} ${t.label} — ${t.detail}`,
        onclick: async () => {
          try {
            await store.plongeeEnSeance(dive.id, t.id);
            close();
            toast(`Rangée en ${t.label.toLowerCase()}`);
            navigate('seances', true);
          } catch (e) { toast(e.message, true); }
        } }))),
    el('div.btn-row', {}, el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }))));
}

// ------------------------------------------------------------
//  Ranger des plongées en séances (une piscine importée par erreur)
// ------------------------------------------------------------

export function rangerPlongees(aRanger, { cocher = true } = {}) {
  const choix = new Map(aRanger.map(({ dive, type }) => [dive.id, { coche: cocher, type }]));
  openModal(close => {
    const box = el('div');
    const bouton = el('button.btn.primary', { type: 'button' });
    const maj = () => {
      const n = [...choix.values()].filter(c => c.coche).length;
      bouton.textContent = n ? `Ranger ${pluriel(n, 'plongée', 'plongées')} en séances` : 'Coche au moins une plongée';
      bouton.disabled = !n;
    };

    box.append(el('h3', { text: 'Ranger en séances' }),
      el('div.hint', { style: { marginBottom: '10px' },
        text: 'Vérifie le type de chacune. Elles quittent le carnet (et sa numérotation) ; '
            + 'le profil, l’heure et la position sont gardés.' }));

    const liste = el('div', { style: { maxHeight: '55vh', overflow: 'auto' } });
    // Beaucoup de plongées : on filtre (lieu, date, numéro).
    const recherche = aRanger.length > 8
      ? el('input', { type: 'search', placeholder: 'Filtrer : lieu, date, n°…', style: { marginBottom: '8px' } }) : null;
    if (recherche) {
      box.append(recherche);
      recherche.addEventListener('input', () => {
        const q = recherche.value.trim().toLowerCase();
        [...liste.children].forEach(n => { n.hidden = !!q && !n.dataset.cherche.includes(q); });
      });
    }
    for (const { dive: d } of aRanger.sort((a, b) => (a.dive.numero || 0) - (b.dive.numero || 0))) {
      const c = choix.get(d.id);
      const coche = el('input', { type: 'checkbox' });
      coche.checked = c.coche;
      coche.style.cssText = 'width:20px;height:20px;accent-color:var(--accent);flex:0 0 auto';
      coche.onchange = () => { c.coche = coche.checked; maj(); };
      const sel = el('select', { style: { width: 'auto', padding: '6px 8px', fontSize: '13px' } },
        ...TYPES_SEANCE.map(t => el('option', { value: t.id, text: `${t.icone} ${t.label}` })));
      sel.value = c.type;
      sel.onchange = () => { c.type = sel.value; };
      const date = /^\d{4}-\d\d-\d\d$/.test(d.date || '') ? fmtDate(d.date) : 'date à corriger';
      const ligne = el('div.jour-ligne', { style: { cursor: 'default' } },
        coche,
        el('div', { style: { flex: 1, minWidth: 0 } },
          el('div', { style: { fontWeight: '600', fontSize: '14px' }, text: `n°${d.numero ?? '—'} · ${date}${d.heureImmersion && /^\d\d:\d\d$/.test(d.heureImmersion) ? ` ${d.heureImmersion}` : ''}` }),
          el('div', { style: { color: 'var(--text-dim)', fontSize: '12.5px' },
            text: [d.lieuNom || d.site || null, d.dureeMin ? fmtDuration(d.dureeMin) : null, d.profMax ? `${d.profMax} m` : 'sans profondeur'].filter(Boolean).join(' · ') })),
        sel);
      ligne.dataset.cherche = `n°${d.numero} ${d.date || ''} ${fmtDate(d.date)} ${d.lieuNom || ''} ${d.site || ''}`.toLowerCase();
      liste.append(ligne);
    }

    bouton.onclick = async () => {
      const retenus = aRanger.filter(({ dive }) => choix.get(dive.id).coche);
      bouton.disabled = true;
      try {
        for (const { dive } of retenus) await store.plongeeEnSeance(dive.id, choix.get(dive.id).type);
        close();
        toast(`${pluriel(retenus.length, 'séance rangée', 'séances rangées')}`);
        navigate('seances', true);
      } catch (e) {
        console.error(e);
        toast(`Rangement interrompu : ${e.message}`, true);
        bouton.disabled = false;
      }
    };
    maj();
    box.append(liste, el('div.btn-row', {}, el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }), bouton));
    return box;
  });
}

// ------------------------------------------------------------
//  Fiche d'une séance
// ------------------------------------------------------------

const champ = (label, controle, aide = null) => el('div.field', {},
  el('label.lbl', { text: label }), controle, aide ? el('div.hint', { text: aide }) : null);

export async function seanceFormView({ id } = {}) {
  const diverId = await store.getActiveDiverId();
  if (!diverId) return { title: 'Séance', node: el('div.empty', { text: 'Crée d’abord ton profil de plongeur.' }), back: true };

  const toutes = await store.listSeances(diverId);
  let s = id ? await store.getSeance(id) : null;
  if (id && !s) return { title: 'Introuvable', node: el('div.empty', { text: 'Séance introuvable.' }), back: true };

  const nouvelle = !s;
  if (nouvelle) {
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    const type = TYPES_SEANCE.some(t => t.id === q.get('type')) ? q.get('type') : 'fosse';
    s = emptySeance(diverId, type, /^\d{4}-\d\d-\d\d$/.test(q.get('date') || '') ? q.get('date') : todayISO());
    preRemplir(s, toutes);
  }

  const wrap = el('form', { onsubmit: e => { e.preventDefault(); enregistrer(); } });

  // Type
  const seg = el('div.seg', { style: { marginBottom: '14px' } });
  const rendreSeg = () => {
    seg.innerHTML = '';
    TYPES_SEANCE.forEach(t => {
      const b = el('button', { type: 'button', text: `${t.icone} ${t.label}` });
      if (t.id === s.type) b.classList.add('on');
      b.onclick = () => {
        s.type = t.id;
        if (nouvelle) { preRemplir(s, toutes, { garderDate: true }); remplirChamps(); }
        rendreSeg(); visibilite();
      };
      seg.append(b);
    });
  };

  const date = el('input', { type: 'date', required: true });
  const heure = el('input', { type: 'time' });
  const duree = el('input', { type: 'text', inputmode: 'numeric', placeholder: 'min' });
  const lieu = el('input', { type: 'text', list: 'seance-lieux', placeholder: 'Fosse de…, piscine de…', autocomplete: 'off' });
  const lieux = el('datalist#seance-lieux', {},
    ...[...new Set(toutes.map(x => x.lieu).filter(Boolean))].map(l => el('option', { value: l })));
  const prof = el('input', { type: 'text', inputmode: 'decimal', placeholder: 'm' });
  const distance = el('input', { type: 'text', inputmode: 'numeric', placeholder: 'm' });
  const apnee = el('input', { type: 'text', inputmode: 'numeric', placeholder: 's' });
  const tempEau = el('input', { type: 'text', inputmode: 'decimal', placeholder: '°C' });
  const notes = el('textarea', { rows: 3, placeholder: 'Exercices, sensations…' });

  // Avec qui : comme la palanquée d'une plongée, et l'agenda du jour.
  const buddies = await store.listBuddies();
  const moi = await store.getDiver(diverId);
  const exclure = moi ? [fullName(moi)] : [];
  s.buddyIds ||= [];
  const avecQui = editeurPalanquee(s, buddies, () => {}, { anonyme: false, placeholder: 'Avec qui : prénom nom…' });
  const agenda = agendaAvecQui(s, buddies, { exclure, onAjout: () => avecQui.rafraichir() });

  function remplirChamps() {
    date.value = s.date || '';
    heure.value = s.heure || '';
    duree.value = s.dureeMin ?? '';
    lieu.value = s.lieu || '';
    prof.value = s.profMax ?? '';
    distance.value = s.distanceM ?? '';
    apnee.value = s.apneeMaxS ?? '';
    tempEau.value = s.tempEau ?? '';
    notes.value = s.notes || '';
  }
  remplirChamps();

  const blocProf = champ('Profondeur max (m)', prof);
  const blocDistance = champ('Distance nagée (m)', distance);
  const blocApnee = champ('Meilleure apnée statique (s)', apnee);
  const jourSemaine = el('div.hint', { style: { marginTop: '-8px', marginBottom: '12px' } });

  function visibilite() {
    blocProf.hidden = s.type === 'piscine';
    blocDistance.hidden = s.type !== 'piscine';
    blocApnee.hidden = s.type !== 'apnee';
    jourSemaine.textContent = date.value ? fmtDateLong(date.value) : '';
  }
  date.addEventListener('change', visibilite);
  date.addEventListener('change', () => { s.date = date.value; agenda?.recharger(); });

  rendreSeg();
  wrap.append(seg,
    el('div.row', {}, champ('Date', date), champ('Heure', heure)),
    jourSemaine,
    el('div.row', {}, champ('Durée (min)', duree), champ('Température de l’eau', tempEau)),
    champ('Lieu', lieu), lieux,
    champ('Avec qui', avecQui), ...(agenda ? [agenda] : []),
    el('div.row', {}, blocProf, blocDistance, blocApnee),
    champ('Notes', notes));

  if (s.samples?.length) wrap.append(el('div.card', {}, el('div.lbl', { text: 'Profil (montre)' }), el('div', { html: profileSvg(s.samples) })));
  if (s.source === 'plongee') wrap.append(el('div.hint', { text: 'Rangée ici depuis le carnet de plongées.' }));
  else if (s.source === 'bluetooth') wrap.append(el('div.hint', { text: 'Importée de la montre en Bluetooth.' }));

  wrap.append(el('div.btn-row', {},
    el('button.btn.primary', { type: 'submit', text: nouvelle ? '✓ Pointer la séance' : '✓ Enregistrer' }),
    nouvelle ? null : el('button.btn.danger', {
      type: 'button', text: '🗑',
      title: 'Supprimer la séance',
      onclick: async () => {
        if (!await confirmBox(`Supprimer cette séance (${typeSeance(s.type).label}, ${fmtDate(s.date)}) ?`, 'Supprimer')) return;
        await store.deleteSeance(s.id);
        toast('Séance supprimée');
        navigate('seances', true);
      },
    })));
  visibilite();

  async function enregistrer() {
    if (!date.value) { toast('Indique la date', true); return; }
    s.date = date.value;
    s.heure = heure.value || '';
    s.dureeMin = num(duree.value);
    s.lieu = lieu.value.trim();
    s.profMax = s.type === 'piscine' ? null : num(prof.value);
    s.distanceM = s.type === 'piscine' ? num(distance.value) : null;
    s.apneeMaxS = s.type === 'apnee' ? num(apnee.value) : null;
    s.tempEau = num(tempEau.value);
    s.notes = notes.value.trim();
    await store.saveSeance(s);
    const n = (await store.listSeances(diverId)).filter(x => x.type === s.type).length;
    toast(nouvelle ? `${typeSeance(s.type).label} pointée — ${n} au total` : 'Séance enregistrée');
    navigate('seances', true);
  }

  return { title: nouvelle ? `Nouvelle séance` : typeSeance(s.type).label, node: wrap, back: true };
}

/** Lieu, heure, durée et profondeur : comme la dernière séance du même type. */
function preRemplir(s, toutes, { garderDate = false } = {}) {
  const derniere = toutes.find(x => x.type === s.type);
  for (const k of ['lieu', 'heure', 'dureeMin', 'profMax', 'distanceM']) s[k] = derniere?.[k] ?? (k === 'lieu' || k === 'heure' ? '' : null);
  if (s.type === 'piscine') s.profMax = null;
  if (!garderDate && !s.date) s.date = todayISO();
}
