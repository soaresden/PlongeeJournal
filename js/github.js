// ============================================================
//  Accès au dépôt GitHub privé qui contient le carnet
//
//  Le carnet est UN fichier JSON (par défaut carnet.json) dans un
//  dépôt privé à toi, par exemple soaresden/PlongeeJournal-data.
//  L'app le lit et l'écrit par l'API « contents » de GitHub, avec
//  un jeton d'accès personnel limité à ce seul dépôt.
//
//  Le jeton reste sur l'appareil (localStorage). Il n'est jamais
//  écrit dans le carnet, ni dans le code, ni envoyé ailleurs
//  qu'à api.github.com.
// ============================================================

const CLE = 'plongee-journal:github';
const API = 'https://api.github.com';

const DEFAUTS = { owner: 'soaresden', repo: 'PlongeeJournal-data', branch: 'main', path: 'carnet.json', token: '' };

export function configGitHub() {
  try { return { ...DEFAUTS, ...JSON.parse(localStorage.getItem(CLE) || '{}') }; }
  catch { return { ...DEFAUTS }; }
}

export function enregistrerConfigGitHub(cfg) {
  const propre = {
    owner: String(cfg.owner || '').trim(),
    repo: String(cfg.repo || '').trim(),
    branch: String(cfg.branch || 'main').trim() || 'main',
    path: String(cfg.path || 'carnet.json').trim().replace(/^\/+/, '') || 'carnet.json',
    token: String(cfg.token || '').trim(),
  };
  localStorage.setItem(CLE, JSON.stringify(propre));
  return propre;
}

export function oublierConfigGitHub() { localStorage.removeItem(CLE); }

export const estConfigure = (c = configGitHub()) => !!(c.owner && c.repo && c.token);

/** Identifie le fichier visé : un changement de dépôt repart de zéro. */
export const cleDepot = (c = configGitHub()) => `${c.owner}/${c.repo}@${c.branch}:${c.path}`;

/** Lien direct vers la création d'un jeton à accès fin. */
export function lienCreationJeton() {
  return 'https://github.com/settings/personal-access-tokens/new'
    + '?name=Carnet%20de%20plong%C3%A9e&description=Lecture%20et%20%C3%A9criture%20du%20carnet'
    + '&contents=write&expires_in=none';
}

// ------------------------------------------------------------
//  Base64 ⇄ UTF-8 (les accents, les emojis des conditions…)
// ------------------------------------------------------------

export function versBase64(texte) {
  const octets = new TextEncoder().encode(texte);
  let bin = '';
  for (let i = 0; i < octets.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, octets.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function depuisBase64(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const octets = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(octets);
}

// ------------------------------------------------------------
//  Erreurs lisibles
// ------------------------------------------------------------

export class ErreurGitHub extends Error {
  constructor(message, { status = 0, reseau = false } = {}) {
    super(message);
    this.status = status;
    this.reseau = reseau;     // true = pas de réseau, on réessaiera plus tard
  }
}

function expliquer(status, corps, cfg) {
  if (status === 401) return 'Jeton GitHub refusé (expiré ou révoqué). Colle un nouveau jeton dans les réglages.';
  if (status === 403 && /rate limit/i.test(corps)) return 'GitHub limite les requêtes pour l’instant. Réessaie dans quelques minutes.';
  if (status === 403) return `Le jeton n’a pas le droit d’écrire dans ${cfg.owner}/${cfg.repo} (permission « Contents : Read and write »).`;
  if (status === 404) return `Dépôt ${cfg.owner}/${cfg.repo} introuvable, ou jeton sans accès à ce dépôt.`;
  return `GitHub a répondu ${status}. ${String(corps).slice(0, 140)}`;
}

async function appel(cfg, chemin, options = {}, delai = 20000) {
  const stop = new AbortController();
  const minuteur = setTimeout(() => stop.abort(), delai);
  let r;
  try {
    r = await fetch(API + chemin, {
      cache: 'no-store',
      ...options,
      signal: stop.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${cfg.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.headers || {}),
      },
    });
  } catch (e) {
    throw new ErreurGitHub('GitHub injoignable (pas de réseau ?)', { reseau: true });
  } finally {
    clearTimeout(minuteur);
  }
  return r;
}

const cheminFichier = cfg =>
  `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/`
  + cfg.path.split('/').map(encodeURIComponent).join('/');

/**
 * Lit le carnet. Renvoie { data, sha } ou { data: null, sha: null }
 * si le fichier n'existe pas encore (dépôt neuf).
 */
export async function lireCarnet(cfg = configGitHub()) {
  const r = await appel(cfg, `${cheminFichier(cfg)}?ref=${encodeURIComponent(cfg.branch)}`);
  if (r.status === 404) {
    // Fichier absent OU dépôt inaccessible : on vérifie lequel.
    const depot = await appel(cfg, `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`);
    if (!depot.ok) throw new ErreurGitHub(expliquer(depot.status, await depot.text(), cfg), { status: depot.status });
    return { data: null, sha: null };
  }
  if (!r.ok) throw new ErreurGitHub(expliquer(r.status, await r.text(), cfg), { status: r.status });

  const meta = await r.json();
  let texte;
  if (meta.content && meta.encoding === 'base64') {
    texte = depuisBase64(meta.content);
  } else {
    // Au-delà de 1 Mo, l'API ne renvoie pas le contenu : on passe par le blob.
    const b = await appel(cfg, `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/git/blobs/${meta.sha}`, {}, 60000);
    if (!b.ok) throw new ErreurGitHub(expliquer(b.status, await b.text(), cfg), { status: b.status });
    texte = depuisBase64((await b.json()).content);
  }

  let data;
  try { data = JSON.parse(texte); }
  catch { throw new ErreurGitHub(`${cfg.path} existe sur GitHub mais n’est pas un JSON lisible. Rien n’a été écrasé.`); }
  return { data, sha: meta.sha };
}

/**
 * Écrit le carnet. `sha` = version sur laquelle on s'appuie ; GitHub
 * refuse (409) si quelqu'un a écrit entre-temps, et c'est voulu.
 */
export async function ecrireCarnet(data, sha, message, cfg = configGitHub()) {
  const r = await appel(cfg, cheminFichier(cfg), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message || 'Carnet mis à jour',
      content: versBase64(JSON.stringify(data, null, 1)),
      branch: cfg.branch,
      ...(sha ? { sha } : {}),
    }),
  }, 60000);

  if (r.status === 409 || r.status === 422) {
    const e = new ErreurGitHub('Le carnet a changé sur GitHub entre-temps', { status: 409 });
    e.conflit = true;
    throw e;
  }
  if (!r.ok) throw new ErreurGitHub(expliquer(r.status, await r.text(), cfg), { status: r.status });
  const rep = await r.json();
  return rep.content?.sha || null;
}

/** Vérifie jeton + dépôt, sans rien écrire. Pour le bouton « Tester ». */
export async function testerConnexion(cfg) {
  const r = await appel(cfg, `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`, {}, 12000);
  if (!r.ok) throw new ErreurGitHub(expliquer(r.status, await r.text(), cfg), { status: r.status });
  const depot = await r.json();
  if (depot.permissions && !depot.permissions.push) {
    throw new ErreurGitHub(`Le jeton peut lire ${depot.full_name} mais pas y écrire.`);
  }
  return { prive: !!depot.private, nom: depot.full_name };
}
