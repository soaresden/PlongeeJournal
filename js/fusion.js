// ============================================================
//  Fusion de deux versions du carnet
//
//  Deux appareils peuvent modifier le carnet chacun de leur côté
//  (le téléphone sur le bateau, la tablette à la maison). Quand
//  ils se retrouvent sur GitHub, on fond les deux versions :
//
//   - à identifiant égal, la fiche modifiée le plus récemment
//     gagne (updatedAt) ;
//   - une suppression laisse une « pierre tombale » datée dans
//     `_supprimes`, pour qu'une fiche effacée ici ne ressuscite
//     pas parce qu'elle existe encore là-bas ;
//   - une fiche retouchée APRÈS sa suppression ailleurs survit :
//     la dernière intention l'emporte.
//
//  Aucune dépendance : testé tel quel par outils/github-test.mjs.
// ============================================================

export const TABLES = ['divers', 'buddies', 'dives', 'certifs', 'seances'];

const date = x => String(x?.updatedAt || '');

/** Union des pierres tombales : on garde la date la plus récente. */
function fondreTombes(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, t] of Object.entries(b || {})) {
    if (!out[id] || String(t) > String(out[id])) out[id] = t;
  }
  return out;
}

/**
 * Fond `local` dans `distant`. À date égale (ou sans date), la
 * version locale gagne : c'est elle que l'utilisateur a sous les yeux.
 */
export function fusionner(distant, local) {
  if (!distant) return local;
  if (!local) return distant;

  const tombes = fondreTombes(distant._supprimes, local._supprimes);
  const out = { ...distant, ...local, _supprimes: tombes };

  for (const t of TABLES) {
    const parId = new Map();
    for (const x of distant[t] || []) if (x?.id) parId.set(x.id, x);
    for (const x of local[t] || []) {
      if (!x?.id) continue;
      const autre = parId.get(x.id);
      if (!autre || date(x) >= date(autre)) parId.set(x.id, x);
    }
    out[t] = [...parId.values()].filter(x => {
      const mort = tombes[x.id];
      return !mort || date(x) > String(mort);
    });
  }

  // Les réglages du carnet (plongeur actif) suivent l'appareil local.
  out.settings = { ...(distant.settings || {}), ...(local.settings || {}) };
  return out;
}

/** Empreinte stable du contenu, pour savoir si deux versions diffèrent. */
export function empreinte(data) {
  const s = JSON.stringify(data || null);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + ':' + s.length;
}
