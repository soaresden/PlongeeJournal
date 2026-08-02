// ============================================================
//  Fiche d'urgence
//
//  Une information de secours qui exige un mot de passe ne sert à
//  rien : si tu es inconscient au bord du bassin, c'est quelqu'un
//  d'autre qui prend le téléphone.
//
//  On garde donc une copie MINIMALE sur l'appareil, en clair, et
//  accessible depuis l'écran de verrouillage : identité, groupe
//  sanguin, licence, personne à prévenir. Rien d'autre — ni les
//  plongées, ni l'adresse, ni les compagnons.
//
//  C'est un choix assumé, et l'écran le dit.
// ============================================================

const CLE = 'plongee-journal:urgence';

/** Champs retenus. Volontairement courts. */
export function extraireFiche(diver, niveau = '') {
  if (!diver) return null;
  return {
    prenom: diver.prenom || '',
    nom: diver.nom || '',
    licence: diver.licence || '',
    groupeSanguin: diver.groupeSanguin || '',
    niveau,
    urgPrenom: diver.urgPrenom || '',
    urgNom: diver.urgNom || '',
    urgTel: diver.urgTel || '',
    urgLien: diver.urgLien || '',
    majLe: new Date().toISOString(),
  };
}

/** Enregistre la copie locale. Ne fait rien si la fiche est vide. */
export function memoriser(diver, niveau = '') {
  const fiche = extraireFiche(diver, niveau);
  if (!fiche) return;

  // Sans contact ni groupe sanguin, la fiche n'apporte rien : on ne
  // laisse pas traîner un nom pour rien.
  const utile = fiche.urgTel || fiche.groupeSanguin;
  if (!utile) return oublier();

  try { localStorage.setItem(CLE, JSON.stringify(fiche)); }
  catch { /* mémoire pleine : la fiche est optionnelle */ }
}

export function lire() {
  try {
    const brut = localStorage.getItem(CLE);
    return brut ? JSON.parse(brut) : null;
  } catch { return null; }
}

export function oublier() { localStorage.removeItem(CLE); }

export const existe = () => !!lire();
