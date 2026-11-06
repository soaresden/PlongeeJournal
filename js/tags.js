// ============================================================
//  Les tags des plongeurs, comparés aux plongées
//
//  Un tag (OGN, Cap-Vert, Cherbourg…) regroupe des gens. Les plongées
//  disent avec qui on était : de quoi repérer
//   - ceux qui ont plongé surtout avec des « OGN » mais n'ont pas le tag ;
//   - les « OGN » jamais vus dans une plongée du carnet ;
//   - les compagnons de plongée qui n'ont aucun tag (et le tag probable) ;
//   - où plongent les gens d'un tag (pour voir un tag mal posé).
// ============================================================

const lieuDe = d => (d.lieuNom || d.site || d.centreNom || '').trim() || 'Lieu non précisé';

/**
 * @param {object[]} buddies  plongeurs ({id, categories, structure})
 * @param {object[]} dives    plongées ({buddyIds, lieuNom…})
 * @returns {{tags: object[], sansTag: object[]}}
 *   tags[] : { tag, membres, lieux:[{lieu,n}], aAjouter:[{buddy,ensemble,total}], sansPlongee:[buddy] }
 *   sansTag[] : { buddy, total, tag|null, ensemble }
 */
export function verifierTags(buddies = [], dives = []) {
  const gens = buddies.filter(b => !b.structure);
  const cats = b => (b.categories || []).filter(Boolean);
  const plongeesDe = new Map(gens.map(b => [b.id, dives.filter(d => (d.buddyIds || []).includes(b.id))]));
  const tous = [...new Set(gens.flatMap(cats))].sort((a, b) => a.localeCompare(b, 'fr'));

  const tags = tous.map(tag => {
    const membres = gens.filter(b => cats(b).includes(tag));
    const ids = new Set(membres.map(b => b.id));
    const divesTag = dives.filter(d => (d.buddyIds || []).some(id => ids.has(id)));

    const compte = new Map();
    divesTag.forEach(d => compte.set(lieuDe(d), (compte.get(lieuDe(d)) || 0) + 1));
    const lieux = [...compte].map(([lieu, n]) => ({ lieu, n })).sort((a, b) => b.n - a.n).slice(0, 4);

    // Sans le tag, mais la plupart de ses plongées sont avec des gens du tag.
    const aAjouter = gens.filter(b => !ids.has(b.id)).map(b => {
      const total = plongeesDe.get(b.id).length;
      const ensemble = plongeesDe.get(b.id).filter(d => (d.buddyIds || []).some(id => ids.has(id))).length;
      return { buddy: b, ensemble, total };
    }).filter(x => x.ensemble && x.ensemble / x.total >= 0.5)
      .sort((a, b) => b.ensemble - a.ensemble);

    const sansPlongee = membres.filter(b => !plongeesDe.get(b.id).length);
    return { tag, membres, lieux, aAjouter, sansPlongee };
  });

  // Plongé avec moi, mais aucun tag : le tag des compagnons les plus fréquents.
  const sansTag = gens.filter(b => !cats(b).length && plongeesDe.get(b.id).length).map(b => {
    const siennes = plongeesDe.get(b.id);
    const voisins = new Map();
    siennes.forEach(d => {
      // Une plongée compte une fois par tag, même avec deux « OGN » dedans.
      const ici = new Set((d.buddyIds || []).filter(id => id !== b.id)
        .flatMap(id => cats(gens.find(x => x.id === id) || {})));
      ici.forEach(c => voisins.set(c, (voisins.get(c) || 0) + 1));
    });
    const [tag, ensemble] = [...voisins].sort((a, c) => c[1] - a[1])[0] || [null, 0];
    return { buddy: b, total: siennes.length, tag, ensemble };
  }).sort((a, b) => b.total - a.total);

  return { tags, sansTag };
}
