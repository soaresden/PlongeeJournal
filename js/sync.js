// ============================================================
//  Où en est le carnet ?
//
//  Un simple porte-voix : l'adaptateur de stockage dit ce qui se
//  passe, la barre du haut l'affiche. Aucune logique ici, et
//  surtout aucun réseau — c'est ce qui permet de le tester.
//
//  États possibles :
//   ok       — écrit dans le carnet du PC
//   syncing  — écriture en cours
//   lecture  — carnet consultable, PC pas joignable
//   pending  — des saisies attendent d'être exportées
//   local    — hors ligne, données dans ce navigateur
//   error    — quelque chose a échoué, le détail le dit
// ============================================================

let etat = { state: 'local', detail: '', pending: 0 };
const abonnes = new Set();

export function status() { return { ...etat }; }

export function setState(state, detail = '', pending = 0) {
  etat = { state, detail, pending };
  abonnes.forEach(fn => {
    try { fn(status()); } catch (e) { console.error(e); }
  });
}

/** S'abonne, reçoit l'état courant tout de suite, renvoie le désabonnement. */
export function onSyncChange(fn) {
  abonnes.add(fn);
  fn(status());
  return () => abonnes.delete(fn);
}
