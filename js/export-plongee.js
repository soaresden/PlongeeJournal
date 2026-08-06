// ============================================================
//  Export d'une saisie faite loin du PC
//
//  Quand le serveur n'est pas joignable, une plongée saisie au
//  téléphone doit pouvoir rejoindre le carnet. Elle part sous la
//  forme d'un fichier :
//
//      plongeeNo0042-20260806_1830.json
//
//  qu'on dépose dans PlongeeAImporter (le dossier pCloud). Au
//  prochain lancement du PC, le serveur le range dans le carnet
//  et archive le fichier.
//
//  Le fichier emporte tout ce dont il a besoin pour être compris
//  seul : la plongée, les compagnons cités, le plongeur, et les
//  tampons en base64. Un import ne doit jamais dépendre de ce que
//  la machine d'en face croit savoir.
// ============================================================

const pad = n => String(n).padStart(2, '0');

/** plongeeNo0042-20260806_1830.json */
export function nomDuFichier(dive, maintenant = new Date()) {
  const numero = String(Number(dive?.numero) || 0).padStart(4, '0');
  const d = maintenant;
  const horo = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
             + `_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `plongeeNo${numero}-${horo}.json`;
}

/**
 * Construit le contenu du fichier d'export.
 * `carnet` est le contenu brut du store ; seul l'utile est emporté.
 */
export function construireExport(dive, carnet, maintenant = new Date()) {
  const buddies = (carnet.buddies || [])
    .filter(b => (dive.buddyIds || []).includes(b.id) || b.id === dive.chefBuddyId);

  const divers = (carnet.divers || []).filter(d => d.id === dive.diverId);

  // Les tampons voyagent avec : sur le PC ils redeviendront des fichiers
  // dans donnees/medias/, mais ici ils n'existent que dans le navigateur.
  const medias = {};
  buddies.forEach(b => {
    (b.stamps || []).forEach(t => {
      if (typeof t.dataUrl === 'string' && t.dataUrl.startsWith('data:')) {
        const ext = /image\/(png|jpe?g|webp)/.exec(t.dataUrl)?.[1] || 'png';
        medias[`tampon-${b.id}-${t.id}.${ext === 'jpeg' ? 'jpg' : ext}`] = t.dataUrl;
      }
    });
  });

  return {
    version: 1,
    exporte: maintenant.toISOString(),
    origine: 'saisie mobile',
    divers,
    buddies,
    certifs: [],
    dives: [dive],
    ...(Object.keys(medias).length ? { medias } : {}),
  };
}

/**
 * Déclenche le téléchargement. Renvoie le nom du fichier produit.
 * Sur téléphone, le fichier atterrit dans les téléchargements : il
 * n'y a plus qu'à le déplacer dans PlongeeAImporter.
 */
export function telechargerPlongee(dive, carnet, maintenant = new Date()) {
  const nom = nomDuFichier(dive, maintenant);
  const contenu = JSON.stringify(construireExport(dive, carnet, maintenant), null, 1);
  const blob = new Blob([contenu], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.append(a);
  a.click();
  a.remove();
  // Révoquer trop tôt annule le téléchargement sur certains navigateurs.
  setTimeout(() => URL.revokeObjectURL(url), 30000);

  return nom;
}

/** Même chose pour plusieurs plongées d'un coup (rattrapage). */
export function telechargerLot(dives, carnet, maintenant = new Date()) {
  const numero = dives.length === 1 ? dives[0].numero : `${dives.length}plongees`;
  const nom = nomDuFichier({ numero: Number(numero) || 0 }, maintenant)
    .replace(/^plongeeNo0*(\d+)/, dives.length === 1 ? 'plongeeNo$1' : `lot${dives.length}`);

  const fusion = { version: 1, exporte: maintenant.toISOString(),
                   origine: 'saisie mobile', divers: [], buddies: [], certifs: [],
                   dives: [], medias: {} };

  dives.forEach(d => {
    const part = construireExport(d, carnet, maintenant);
    fusion.dives.push(...part.dives);
    part.divers.forEach(x => { if (!fusion.divers.some(y => y.id === x.id)) fusion.divers.push(x); });
    part.buddies.forEach(x => { if (!fusion.buddies.some(y => y.id === x.id)) fusion.buddies.push(x); });
    Object.assign(fusion.medias, part.medias || {});
  });
  if (!Object.keys(fusion.medias).length) delete fusion.medias;

  const blob = new Blob([JSON.stringify(fusion, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nom;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return nom;
}
