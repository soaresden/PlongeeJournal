// ============================================================
//  Éditeur de matériel
//
//  Le formulaire s'adapte au type choisi : une combinaison demande
//  son type et son épaisseur, un détendeur sa marque et son modèle,
//  un masque une personnalisation. Demander un modèle à des palmes
//  ou une épaisseur à un phare n'aurait aucun sens.
//
//  Partagé par la fiche plongeur et le formulaire de plongée : on
//  peut donc ajouter une pièce à la volée pendant la saisie.
// ============================================================

import { el, toast, openModal } from '../lib.js';
import { emptyMateriel, valeursMateriel, libelleMateriel } from '../store.js';
import { TYPES_MATERIEL, typeMateriel } from '../config.js';

function field(label, control, hint) {
  return el('div.field', {},
    label ? el('label.lbl', { text: label }) : null, control,
    hint ? el('div.hint', { text: hint }) : null);
}

/** Construit le contrôle correspondant à un champ déclaré par le type. */
function controle(champ, valeurs, onChange) {
  const valeur = valeurs[champ.id] ?? '';

  if (champ.kind === 'seg') {
    const seg = el('div.seg');
    champ.options.forEach(o => {
      const b = el('button', { type: 'button', text: o });
      if (o === valeur) b.classList.add('on');
      b.onclick = () => {
        seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        onChange(champ.id, o);
      };
      seg.append(b);
    });
    return seg;
  }

  if (champ.kind === 'select') {
    const sel = el('select');
    sel.append(el('option', { value: '', text: `— ${champ.suffixe || 'choisir'} —` }));
    champ.options.forEach(o =>
      sel.append(el('option', { value: o, text: champ.suffixe ? `${o} ${champ.suffixe}` : o })));
    sel.value = valeur;
    sel.onchange = () => onChange(champ.id, sel.value);
    return sel;
  }

  const inp = el('input', {
    type: 'text',
    value: valeur,
    placeholder: champ.placeholder || '',
    ...(champ.kind === 'nombre' ? { inputmode: 'decimal' } : {}),
  });
  inp.addEventListener('input', () => onChange(champ.id, inp.value));
  return inp;
}

/**
 * Ouvre l'éditeur d'une pièce de matériel.
 *
 * @param {object|null} existant  la pièce à modifier, ou null pour en créer une
 * @param {Function} onValider    reçoit la pièce complétée
 * @param {Function} [onSupprimer] proposé seulement en modification
 */
export function editerMateriel(existant, onValider, onSupprimer) {
  const piece = existant
    ? { ...existant, valeurs: { ...valeursMateriel(existant) } }
    : emptyMateriel();
  const nouveau = !existant;

  openModal(close => {
    const champsZone = el('div');

    const typeSel = el('select');
    typeSel.append(el('option', { value: '', text: '— choisir un type —' }));
    TYPES_MATERIEL.forEach(t =>
      typeSel.append(el('option', { value: t.id, text: `${t.icone}  ${t.label}` })));
    typeSel.value = piece.type || '';

    function rendreChamps() {
      champsZone.innerHTML = '';
      if (!piece.type) {
        champsZone.append(el('div.hint', { style: { marginTop: 0 },
          text: 'Choisis un type : les champs s’adaptent.' }));
        return;
      }
      const t = typeMateriel(piece.type);
      (t.champs || []).forEach(champ => {
        champsZone.append(field(champ.label,
          controle(champ, piece.valeurs, (cle, v) => { piece.valeurs[cle] = v; })));
      });
    }

    typeSel.onchange = () => {
      piece.type = typeSel.value;
      piece.valeurs = {};        // les champs changent, les valeurs aussi
      rendreChamps();
    };

    rendreChamps();

    return el('div', {},
      el('h3', { text: nouveau ? 'Ajouter du matériel' : typeMateriel(piece.type).label }),
      field('Type de matériel', typeSel),
      champsZone,
      el('div.btn-row', {},
        el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }),
        el('button.btn.primary', { type: 'button', text: nouveau ? 'Ajouter' : 'Enregistrer',
          onclick: () => {
            if (!piece.type) return toast('Choisis un type de matériel', true);
            const rempli = Object.values(piece.valeurs).some(v => String(v || '').trim());
            if (!rempli) return toast('Renseigne au moins un champ', true);
            onValider(piece);
            close();
          } }),
      ),
      nouveau || !onSupprimer ? null : el('div.btn-row', {},
        el('button.btn.danger.block', { type: 'button', text: 'Retirer ce matériel',
          onclick: () => { onSupprimer(piece); close(); } })),
    );
  });
}

/** Ligne d'un tableau de matériel. */
export function ligneMateriel(piece, { onClick, onRetirer, fin } = {}) {
  const t = typeMateriel(piece.type);
  return el('div.mat-ligne', onClick ? { onclick: () => onClick(piece) } : {},
    el('span.mat-icone', { text: t.icone }),
    el('div.mat-corps', {},
      el('div.mat-type', { text: t.label }),
      el('div.mat-detail', { text: libelleMateriel(piece) })),
    fin || null,
    onRetirer ? el('button.mat-suppr', {
      type: 'button', text: '×', title: 'Retirer',
      onclick: e => { e.stopPropagation(); onRetirer(piece); },
    }) : null,
  );
}
