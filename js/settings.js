// ============================================================
//  Réglages de l'installation
//
//  Le dépôt est public et destiné à être recopié : personne ne doit
//  avoir à modifier le code pour brancher SA base. Les identifiants
//  Supabase sont donc saisis dans l'app (écran « Réglages ») et
//  conservés dans ce navigateur, pas dans le dépôt.
//
//  Ce qui peut vivre ici sans danger :
//    - l'URL du projet
//    - la clé publiable (« publishable » / « anon »)
//  Ces deux valeurs sont PUBLIQUES par conception. Elles n'ouvrent
//  que ce que les politiques RLS autorisent.
//
//  Ce qui ne doit JAMAIS y figurer :
//    - la clé secrète (« secret » / « service_role »), qui contourne
//      RLS. Elle ne se met que dans les secrets Supabase, côté serveur.
// ============================================================

const KEY = 'plongee-journal:settings';

const DEFAULTS = {
  supabaseUrl: '',
  supabaseKey: '',        // clé publiable / anon
  googleMapsKey: '',
  schemaReady: false,     // le script SQL a été exécuté avec succès

  // Compte unique du carnet. L'email ne sert qu'à recevoir le lien de
  // réinitialisation ; il n'est plus jamais demandé ensuite.
  accountEmail: '',
  installed: false,       // le mot de passe a été défini

  // Déverrouillage biométrique, propre à CET appareil
  biometricId: '',
  biometricAt: '',
};

let cache = null;

export function settings() {
  if (cache) return cache;
  try { cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { cache = { ...DEFAULTS }; }
  return cache;
}

export function saveSettings(patch) {
  cache = { ...settings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(cache));
  return cache;
}

export function resetSettings() {
  cache = { ...DEFAULTS };
  localStorage.removeItem(KEY);
}

export function isSupabaseConfigured() {
  const s = settings();
  return !!(s.supabaseUrl && s.supabaseKey);
}

/**
 * Ce carnet a-t-il déjà un mot de passe ?
 *
 * `installed` est propre à l'appareil : sur un téléphone neuf ou sur le
 * site publié, il est faux alors que le compte existe depuis longtemps.
 * Le vrai signal est le schéma : une base initialisée a forcément servi,
 * donc un mot de passe a été défini. On propose alors de DÉVERROUILLER,
 * pas de créer — sinon Supabase répond « déjà inscrit » et l'utilisateur
 * se retrouve bloqué.
 *
 * @param {boolean} schemaEnPlace  résultat du contrôle sur app_meta
 */
export function carnetDejaInstalle(schemaEnPlace = false) {
  return !!(settings().installed || schemaEnPlace || settings().schemaReady);
}

/**
 * Accepte indifféremment un Project ID (« abcdefghijklmnop ») ou une URL
 * complète, et renvoie toujours l'URL. Le Project ID est plus simple à
 * recopier : c'est ce que Supabase affiche dans Project Settings → General.
 */
export function toSupabaseUrl(value) {
  const v = String(value || '').trim().replace(/\/+$/, '');
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v.replace(/^http:/, 'https:');
  if (/^[a-z0-9]{16,32}$/i.test(v)) return `https://${v}.supabase.co`;
  if (/^[a-z0-9-]+\.supabase\.(co|in)$/i.test(v)) return `https://${v}`;
  return v;
}

/** Chemin inverse : l'identifiant seul, pour l'afficher. */
export function projectId(url = settings().supabaseUrl) {
  return (/^https:\/\/([a-z0-9-]+)\.supabase\./i.exec(url || '') || [])[1] || '';
}

// ------------------------------------------------------------
//  Fichier local credentials.json
//
//  Pratique en développement : plutôt que de ressaisir l'URL et la
//  clé dans l'écran Réglages sur chaque appareil, on les pose dans
//  un fichier à la racine. Ce fichier est dans .gitignore : il ne
//  part jamais sur GitHub.
//
//  Sur GitHub Pages le fichier est absent — la requête échoue en
//  silence et l'app retombe sur l'écran Réglages. C'est voulu.
// ------------------------------------------------------------

let credentialsLoaded = false;

export async function loadLocalCredentials() {
  if (credentialsLoaded) return settings();
  credentialsLoaded = true;

  try {
    const res = await fetch('./credentials.json', { cache: 'no-store' });
    if (!res.ok) return settings();

    const file = await res.json();
    const patch = {};

    // Project ID (recommandé) ou URL complète : les deux marchent.
    const projet = file.ProjectID ?? file.projectId ?? file.supabaseUrl;
    if (projet) patch.supabaseUrl = toSupabaseUrl(projet);

    const cle = file.APIKeys_Publishable ?? file.supabaseKey;
    if (cle) patch.supabaseKey = String(cle).trim();

    const gmap = file.APIKeys_GoogleMaps ?? file.googleMapsKey;
    if (gmap) patch.googleMapsKey = String(gmap).trim();

    // Garde-fous : la clé secrète n'entre jamais dans l'application.
    // Elle n'est utile qu'au CLI Supabase et aux Edge Functions ; le
    // navigateur n'en a aucun usage, donc on la laisse où elle est.
    if (patch.supabaseKey?.startsWith('sb_secret_')) {
      console.error('credentials.json : APIKeys_Publishable contient une clé SECRÈTE. '
                  + 'Elle est ignorée. Mets la clé « publishable » (sb_publishable_…) '
                  + 'et pense à révoquer la secrète.');
      delete patch.supabaseKey;
    }
    if (file.APIKeys_SecretKey) {
      console.warn('credentials.json : APIKeys_SecretKey est présent mais volontairement '
                 + 'ignoré par l’application. Il ne sert qu’au CLI Supabase et aux Edge '
                 + 'Functions, jamais au navigateur.');
    }

    if (Object.keys(patch).length) {
      saveSettings(patch);
      console.info('Identifiants chargés depuis credentials.json');
    }
  } catch {
    /* fichier absent : cas normal en production */
  }
  return settings();
}

/** Contrôle de forme, avant même d'appeler le réseau. */
export function checkCredentials(url, key) {
  const errs = [];
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(String(url).trim())) {
    errs.push('L’URL doit ressembler à https://xxxxxxxx.supabase.co');
  }
  const k = String(key).trim();
  if (k.startsWith('sb_secret_') || k.startsWith('service_role') || /"role"\s*:\s*"service_role"/.test(k)) {
    errs.push('⛔ C’est la clé SECRÈTE. Elle contourne toutes les protections et ne doit jamais '
            + 'être collée ici. Utilise la clé « publishable » (ou « anon »).');
  } else if (!(k.startsWith('sb_publishable_') || k.startsWith('eyJ'))) {
    errs.push('La clé doit commencer par sb_publishable_ (ou eyJ pour l’ancien format anon).');
  }
  return errs;
}

/** URL de redirection à déclarer côté Suunto — dépend du projet Supabase. */
export function suuntoRedirectUri() {
  const s = settings();
  return s.supabaseUrl ? `${s.supabaseUrl.replace(/\/$/, '')}/functions/v1/suunto/callback` : '';
}

/** URL publique de l'app, utile pour les réglages OAuth. */
export function appUrl() {
  return location.href.split('#')[0];
}
