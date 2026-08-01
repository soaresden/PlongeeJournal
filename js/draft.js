// ============================================================
//  Brouillon transmis d'un écran à l'autre
//  (import Suunto -> formulaire de plongée)
// ============================================================

let pending = null;

export function setDraft(patch) { pending = patch; }

export function takeDraft() {
  const d = pending;
  pending = null;
  return d;
}

export function hasDraft() { return !!pending; }
