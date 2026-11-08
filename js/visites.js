// ============================================================
//  Les visites de mon carnet partagé
//
//  Celui qui ouvre le lien donne son prénom, une date et un lieu où il
//  a plongé avec moi : c'est le « mot de passe » (il doit correspondre à
//  une de mes plongées), et c'est ce qui me dit qui regarde.
//
//  Le site est statique : pour me prévenir, la page envoie un petit
//  message sur un canal ntfy.sh (service public de notifications, sans
//  compte) dont le nom, tiré au hasard, n'est connu que de mon lien.
//  Mon appli relit ce canal à chaque ouverture et garde les visites dans
//  le carnet. ntfy.sh ne garde les messages que 12 heures : avec l'appli
//  ntfy abonnée au canal, je suis prévenu tout de suite et rien ne se perd.
// ============================================================

export const NTFY = 'https://ntfy.sh';

const sansAccent = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mots = s => sansAccent(s).split(/[^a-z0-9]+/).filter(m => m.length >= 3);
const jour = iso => (/^\d{4}-\d\d-\d\d$/.test(iso || '') ? new Date(`${iso}T12:00:00Z`).getTime() / 86400000 : null);

/** Un nom de canal neuf (difficile à deviner). */
export function nouveauCanal() {
  const a = 'abcdefghijkmnopqrstuvwxyz23456789';
  const o = crypto.getRandomValues(new Uint8Array(20));
  return `pj-${[...o].map(x => a[x % a.length]).join('')}`;
}

/**
 * Le visiteur a-t-il plongé avec moi ? Une de mes plongées à 3 jours près
 * de sa date, dont le lieu (ou le pays, ou le centre) contient un mot de
 * ce qu'il a tapé.
 * @param {{date:string, lieu:string}} saisie
 * @param {Array} dives
 * @param {(d)=>string[]} [autresNoms] noms supplémentaires d'une plongée (pays…)
 * @returns {{ok:boolean, plongee:object|null}}
 */
export function verifierVisiteur({ date, lieu }, dives, autresNoms = () => []) {
  const j = jour(date);
  const cherches = mots(lieu);
  if (j == null || !cherches.length) return { ok: false, plongee: null };
  let meilleure = null, ecart = Infinity;
  for (const d of dives || []) {
    const jd = jour(d.date);
    if (jd == null || Math.abs(jd - j) > 3) continue;
    const texte = mots([d.lieuNom, d.site, d.lieuDetail, d.centreNom, ...autresNoms(d)].join(' '));
    const ok = cherches.some(m => texte.some(t => t.includes(m) || m.includes(t)));
    if (ok && Math.abs(jd - j) < ecart) { ecart = Math.abs(jd - j); meilleure = d; }
  }
  return { ok: !!meilleure, plongee: meilleure };
}

const fmt = iso => (iso ? iso.split('-').reverse().join('/') : '?');

/** Le message envoyé sur le canal (lisible tel quel dans l'appli ntfy). */
export function message({ prenom, date, lieu, plongee, ok }) {
  return {
    titre: ok ? `👀 ${prenom} regarde ton carnet` : `❓ ${prenom || 'Quelqu’un'} n’a pas trouvé la plongée`,
    corps: [prenom || '?', fmt(date), lieu || '?', plongee ? `n°${plongee.numero ?? '?'} ${plongee.lieuNom || ''}`.trim() : ''].filter(Boolean).join(' · '),
    tags: [ok ? 'eyes' : 'question', ok ? 'pj-ok' : 'pj-ko', ...(plongee ? [`pj-plongee-${plongee.id}`] : [])],
  };
}

/** Prévient le propriétaire (ne lève jamais : une visite ne doit pas échouer pour ça). */
export async function annoncerVisite(canal, visite, f = fetch) {
  if (!canal) return false;
  const m = message(visite);
  try {
    const r = await f(`${NTFY}/${encodeURIComponent(canal)}?title=${encodeURIComponent(m.titre)}&tags=${encodeURIComponent(m.tags.join(','))}`, {
      // Le titre et les étiquettes en paramètres d'URL (un en-tête ne prend
      // pas d'accents, et une requête « simple » évite le contrôle CORS).
      method: 'POST', body: m.corps,
    });
    return !!r?.ok;
  } catch { return false; }
}

/** Le message ntfy relu → une visite. */
export function lireMessage(m) {
  const [prenom = '', date = '', lieu = '', plongee = ''] = String(m.message || '').split(' · ');
  const tags = m.tags || [];
  const d = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(date);
  return {
    id: m.id, at: new Date((m.time || 0) * 1000).toISOString(),
    prenom, date: d ? `${d[3]}-${d[2]}-${d[1]}` : '', lieu, plongee,
    plongeeId: (tags.find(t => t.startsWith('pj-plongee-')) || '').slice(11) || null,
    ok: tags.includes('pj-ok'),
  };
}

/** Relit le canal (12 dernières heures sur ntfy.sh). */
export async function relireVisites(canal, f = fetch) {
  if (!canal) return [];
  const r = await f(`${NTFY}/${encodeURIComponent(canal)}/json?poll=1&since=all`);
  if (!r.ok) throw new Error(`ntfy a répondu ${r.status}`);
  const texte = await r.text();
  return texte.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(m => m && m.event === 'message').map(lireMessage);
}

/** Ajoute les nouvelles aux visites gardées (sans doublon), les plus récentes d'abord. */
export function fusionnerVisites(anciennes = [], nouvelles = [], max = 500) {
  const parId = new Map(anciennes.map(v => [v.id, v]));
  for (const v of nouvelles) if (v?.id && !parId.has(v.id)) parId.set(v.id, v);
  return [...parId.values()].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, max);
}
