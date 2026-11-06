// ============================================================
//  Palanquée et centre de plongée d'une plongée
//
//  Pas de fiche à créer avant : on tape un nom, l'appli cherche parmi
//  les plongeurs connus ; s'il n'y est pas, il est créé tout seul.
//  Un moniteur dont on n'a pas le nom : un bouton, rien à créer.
//  Le centre de plongée : centre.js.
// ============================================================

import { el, fullName, nomPlongeur, toast } from './lib.js';
import { store, emptyBuddy } from './store.js';
import { trouverPlongeurs } from './noms.js';

const sansAccent = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * L'éditeur de palanquée.
 * @param {object} dive          la plongée (buddyIds, moniteurSansNom sont modifiés en place)
 * @param {object[]} buddies     les plongeurs connus (complétée si on en crée un)
 * @param {Function} onChange    appelée après chaque changement
 */
export function editeurPalanquee(dive, buddies, onChange = () => {}, { anonyme = true, placeholder = 'Ajouter : prénom nom…' } = {}) {
  dive.buddyIds ||= [];
  const boite = el('div.palq');
  const choisis = el('div.palq-choisis');
  const champ = el('input', { type: 'text', placeholder, autocapitalize: 'words',
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
      propositions.replaceChildren(dive.moniteurSansNom || !anonyme ? '' : el('button.palq-prop.anonyme', { type: 'button',
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
  // Quelqu'un a été ajouté d'ailleurs (un texte, l'agenda) : on redessine.
  boite.rafraichir = () => changer();
  return boite;
}

/** Crée un plongeur à partir d'un nom écrit (« Julie Martin »). */
export async function creerPlongeur(texte, buddies) {
  const mots = texte.trim().split(/\s+/);
  const b = emptyBuddy();
  b.prenom = mots.shift() || '';
  b.nom = mots.join(' ');
  await store.saveBuddy(b);
  buddies.push(b);
  return b;
}

/**
 * Les plongeurs trouvés dans un texte, en puces à toucher pour les
 * ajouter à la palanquée (ou à la séance). Un nom inconnu est créé.
 * @param {string} texte
 * @param {object} cible     plongée ou séance (buddyIds modifié en place)
 * @param {object[]} buddies
 * @param {{exclure?:string[], onAjout?:Function, vide?:string}} options
 */
export function propositionsTexte(texte, cible, buddies, { exclure = [], onAjout = () => {}, vide = '' } = {}) {
  const boite = el('div.chips.noms-trouves');
  const { connus, nouveaux } = trouverPlongeurs(texte, buddies, { exclure });
  const libres = connus.filter(c => !(cible.buddyIds || []).includes(c.buddy.id));
  if (!libres.length && !nouveaux.length) {
    if (vide) boite.append(el('span.hint', { text: vide }));
    return boite;
  }
  libres.forEach(({ buddy, sur }) => boite.append(el('button.chip', { type: 'button',
    title: sur ? '' : 'Plusieurs plongeurs portent ce prénom : vérifie',
    onclick: e => {
      cible.buddyIds = [...new Set([...(cible.buddyIds || []), buddy.id])];
      e.currentTarget.remove();
      onAjout(buddy);
    } }, `＋ ${fullName(buddy)}${sur ? '' : ' ?'}`)));
  nouveaux.forEach(nom => boite.append(el('button.chip', { type: 'button', title: 'Pas encore dans tes plongeurs : il sera créé',
    onclick: async e => {
      const bt = e.currentTarget;
      bt.disabled = true;
      try {
        const b = await creerPlongeur(nom, buddies);
        cible.buddyIds = [...new Set([...(cible.buddyIds || []), b.id])];
        bt.remove();
        toast(`${fullName(b)} ajouté à tes plongeurs`);
        onAjout(b);
      } catch (err) { bt.disabled = false; toast(err.message, true); }
    } }, `＋ ${nom}`, el('small', { text: ' nouveau' }))));
  return boite;
}


// Le centre de plongée : voir centre.js (un seul champ, et la carte).
export { centresConnus, champCentre } from './centre.js';
