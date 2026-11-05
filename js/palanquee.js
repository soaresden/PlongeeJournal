// ============================================================
//  Palanquée et centre de plongée d'une plongée
//
//  Pas de fiche à créer avant : on tape un nom, l'appli cherche parmi
//  les plongeurs connus ; s'il n'y est pas, il est créé tout seul.
//  Un moniteur dont on n'a pas le nom : un bouton, rien à créer.
//  Le centre de plongée (nom, adresse) est noté sur la plongée.
// ============================================================

import { el, fullName, nomPlongeur, toast } from './lib.js';
import { store, emptyBuddy } from './store.js';

const sansAccent = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * L'éditeur de palanquée.
 * @param {object} dive          la plongée (buddyIds, moniteurSansNom sont modifiés en place)
 * @param {object[]} buddies     les plongeurs connus (complétée si on en crée un)
 * @param {Function} onChange    appelée après chaque changement
 */
export function editeurPalanquee(dive, buddies, onChange = () => {}) {
  dive.buddyIds ||= [];
  const boite = el('div.palq');
  const choisis = el('div.palq-choisis');
  const champ = el('input', { type: 'text', placeholder: 'Ajouter : prénom nom…', autocapitalize: 'words',
    autocomplete: 'off', enterkeyhint: 'done' });
  const caseMon = el('input', { type: 'checkbox' });
  const propositions = el('div.palq-props');

  const changer = () => { rendreChoisis(); rendrePropositions(); onChange(); };
  const connus = () => buddies.filter(b => !b.structure);

  function ajouter(b) {
    if (!dive.buddyIds.includes(b.id)) dive.buddyIds = [...dive.buddyIds, b.id];
    champ.value = '';
    caseMon.checked = false;
    changer();
    champ.focus();
  }

  async function creer(texte) {
    const mots = texte.trim().split(/\s+/);
    const b = emptyBuddy();
    b.prenom = mots.shift() || '';
    b.nom = mots.join(' ');
    b.moniteur = caseMon.checked;
    await store.saveBuddy(b);
    buddies.push(b);
    toast(`${fullName(b)} ajouté${b.moniteur ? ' (moniteur)' : ''}`);
    ajouter(b);
  }

  function valider() {
    const t = champ.value.trim();
    if (!t) return;
    const exact = connus().find(b => sansAccent(fullName(b)) === sansAccent(t));
    if (exact) ajouter(exact);
    else creer(t);
  }

  function rendreChoisis() {
    const puces = dive.buddyIds.map(id => buddies.find(b => b.id === id)).filter(Boolean).map(b =>
      el(`span.palq-puce${b.moniteur || b.structure ? '.mon' : ''}`, {},
        b.moniteur || b.structure ? el('small', { text: 'MON' }) : null,
        el('span', { text: nomPlongeur(b) || '?' }),
        el('button', { type: 'button', 'aria-label': 'Retirer', text: '×', onclick: () => {
          dive.buddyIds = dive.buddyIds.filter(x => x !== b.id);
          if (dive.chefBuddyId === b.id) dive.chefBuddyId = '';
          changer();
        } })));
    if (dive.moniteurSansNom) {
      puces.push(el('span.palq-puce.mon', {}, el('small', { text: 'MON' }), el('span', { text: 'Moniteur (nom inconnu)' }),
        el('button', { type: 'button', 'aria-label': 'Retirer', text: '×', onclick: () => { dive.moniteurSansNom = false; changer(); } })));
    }
    choisis.replaceChildren(...(puces.length ? puces : [el('span.palq-vide', { text: 'Personne pour l’instant.' })]));
  }

  function rendrePropositions() {
    const q = sansAccent(champ.value);
    if (!q) {
      propositions.replaceChildren(dive.moniteurSansNom ? '' : el('button.palq-prop.anonyme', { type: 'button',
        onclick: () => { dive.moniteurSansNom = true; changer(); } }, '＋ Un moniteur dont je n’ai pas le nom'));
      return;
    }
    const trouves = connus()
      .filter(b => !dive.buddyIds.includes(b.id))
      .filter(b => sansAccent(`${fullName(b)} ${(b.categories || []).join(' ')}`).includes(q))
      .slice(0, 6);
    const exact = trouves.some(b => sansAccent(fullName(b)) === q);
    propositions.replaceChildren(
      ...trouves.map(b => el('button.palq-prop', { type: 'button', onclick: () => ajouter(b) },
        b.moniteur ? el('small.palq-mon', { text: 'MON' }) : null,
        el('b', { text: fullName(b) }),
        (b.categories || []).length ? el('span', { text: b.categories.join(' · ') }) : null)),
      exact ? '' : el('button.palq-prop.nouveau', { type: 'button', onclick: () => creer(champ.value) },
        `＋ Ajouter « ${champ.value.trim()} »`, el('span', { text: caseMon.checked ? 'moniteur, nouveau' : 'nouveau' })));
  }

  champ.addEventListener('input', rendrePropositions);
  champ.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); valider(); } });
  caseMon.addEventListener('change', rendrePropositions);

  boite.append(choisis,
    el('div.palq-saisie', {}, champ, el('label.palq-case', {}, caseMon, el('span', { text: 'moniteur' }))),
    propositions);
  rendreChoisis();
  rendrePropositions();
  return boite;
}

/** Les centres déjà notés dans le carnet, avec leur dernière adresse. */
export function centresConnus(dives) {
  const m = new Map();
  dives.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(d => {
    const nom = (d.centreNom || '').trim();
    if (nom) m.set(nom, (d.centreAdresse || '').trim() || m.get(nom) || '');
  });
  return m;
}

/**
 * Les champs « centre de plongée » : son nom (les centres connus sont
 * proposés, et leur adresse se remplit toute seule) et son adresse.
 */
export function champsCentre(dive, dives, onChange = () => {}) {
  const connus = centresConnus(dives.filter(d => d.id !== dive.id));
  const id = `centres-${Math.random().toString(36).slice(2, 8)}`;
  const nom = el('input', { type: 'text', list: id, placeholder: 'Nom du centre ou du club', autocomplete: 'off' });
  const adresse = el('input', { type: 'text', placeholder: 'Adresse, ville, pays', autocomplete: 'off' });
  nom.value = dive.centreNom || '';
  adresse.value = dive.centreAdresse || '';
  nom.addEventListener('input', () => {
    dive.centreNom = nom.value;
    const connue = connus.get(nom.value.trim());
    if (connue && !adresse.value.trim()) { adresse.value = connue; dive.centreAdresse = connue; }
    onChange();
  });
  adresse.addEventListener('input', () => { dive.centreAdresse = adresse.value; onChange(); });
  return {
    nom, adresse,
    liste: el('datalist', { id }, ...[...connus.keys()].sort((a, b) => a.localeCompare(b, 'fr')).map(c => el('option', { value: c }))),
  };
}
