// ============================================================
//  Client Supabase + authentification
//
//  La clé « anon » est publique par conception : elle n'ouvre que
//  ce que les politiques RLS autorisent. C'est le SQL qui protège
//  les données, pas le secret de cette clé.
//  Ne jamais mettre ici la clé service_role.
// ============================================================

import { CONFIG } from './config.js';

const SUPABASE_ESM = 'https://esm.sh/@supabase/supabase-js@2.45.4';

let clientPromise = null;

export function isConfigured() {
  return !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
}

export function getClient() {
  if (!isConfigured()) return Promise.reject(new Error('Supabase n’est pas configuré (js/config.js)'));
  clientPromise ??= import(/* @vite-ignore */ SUPABASE_ESM).then(({ createClient }) =>
    createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,   // on utilise des URLs en #/... , pas les liens magiques
        storageKey: 'plongee-journal-auth',
      },
    }));
  return clientPromise;
}

// ------------------------------------------------------------
//  Session
// ------------------------------------------------------------

export async function getSession() {
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  return data.session ?? null;
}

export async function getUser() {
  return (await getSession())?.user ?? null;
}

export async function signIn(email, password) {
  const sb = await getClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(traduire(error.message));
  return data.session;
}

export async function signUp(email, password) {
  const sb = await getClient();
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw new Error(traduire(error.message));
  return data;
}

/** Envoie le lien de réinitialisation. Le retour est géré par consumeRecovery(). */
export async function resetPassword(email) {
  const sb = await getClient();
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: location.href.split('#')[0].split('?')[0],
  });
  if (error) throw new Error(traduire(error.message));
}

/** Renvoie l'email de confirmation. */
export async function renvoyerConfirmation(email) {
  const sb = await getClient();
  const { error } = await sb.auth.resend({ type: 'signup', email });
  if (error) throw new Error(traduire(error.message));
}

/**
 * Pourquoi la connexion échoue-t-elle ?
 *
 * Supabase répond volontairement « Invalid login credentials » dans
 * plusieurs cas différents, pour ne pas révéler quels comptes existent.
 * On distingue donc les situations en tentant une inscription à blanc :
 * si Supabase répond « déjà inscrit », le compte existe et c'est bien le
 * mot de passe qui est faux.
 *
 * @returns {{cas:string, titre:string, explication:string, actions:string[]}}
 */
export async function diagnostiquerConnexion(email) {
  const sb = await getClient();

  // Mot de passe volontairement aléatoire : on ne cherche pas à se connecter,
  // seulement à savoir si l'adresse est déjà prise.
  const bidon = 'Dg' + Math.random().toString(36).slice(2) + 'Z9!';
  const { data, error } = await sb.auth.signUp({ email, password: bidon });

  if (error) {
    const m = (error.message || '').toLowerCase();

    if (m.includes('already registered') || m.includes('already been registered')) {
      return {
        cas: 'mauvais-mot-de-passe',
        titre: 'Le compte existe, le mot de passe ne correspond pas',
        explication: `Un compte est bien enregistré pour ${email}.`,
        actions: ['Réessaie le mot de passe', 'Ou demande un lien de réinitialisation'],
      };
    }

    if (m.includes('signups not allowed') || m.includes('signup is disabled')) {
      return {
        cas: 'inscriptions-fermees',
        titre: 'Les inscriptions sont fermées sur ce projet',
        explication: 'Impossible de savoir si le compte existe : Supabase refuse toute '
                   + 'inscription. Si tu n’as jamais créé ton mot de passe, rouvre '
                   + 'temporairement les inscriptions.',
        actions: ['Authentication → Sign In / Providers → Email',
                  'Activer « Allow new users to sign up »',
                  'Créer ton mot de passe, puis refermer'],
      };
    }

    return {
      cas: 'inconnu',
      titre: 'Échec de connexion',
      explication: traduire(error.message),
      actions: [],
    };
  }

  // Pas d'erreur : l'inscription à blanc a été acceptée, donc l'adresse
  // était libre. Le compte vient d'être créé avec un mot de passe inutilisable.
  if (data?.user && !data.session) {
    return {
      cas: 'confirmation-requise',
      titre: 'Ton adresse doit être confirmée',
      explication: 'Supabase exige une confirmation par email avant d’autoriser la '
                 + 'connexion. Tant que le lien n’est pas cliqué, le mot de passe est '
                 + 'refusé — c’est très probablement ce qui t’arrive.',
      actions: ['Ouvre le mail de confirmation Supabase et clique le lien',
                'Ou, pour un carnet personnel : Authentication → Sign In / Providers → '
              + 'Email → décocher « Confirm email »',
                'Puis reviens définir ton mot de passe'],
    };
  }

  return {
    cas: 'compte-absent',
    titre: 'Aucun compte pour cette adresse',
    explication: `Rien n’était enregistré pour ${email}. Le mot de passe n’a jamais été défini, `
               + 'ou l’adresse mémorisée sur cet appareil n’est pas la bonne.',
    actions: ['Définis ton mot de passe depuis l’installation'],
  };
}

/** Change le mot de passe de la session en cours. */
export async function changePassword(password) {
  const sb = await getClient();
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(traduire(error.message));
}

/**
 * Analyse l'URL de retour du lien de réinitialisation.
 *
 * Point délicat : Supabase place ses jetons dans le hash
 * (`#access_token=…&type=recovery`), exactement là où l'app met ses
 * routes (`#/dives`). Il faut donc distinguer les deux sans jamais
 * prendre une route pour un jeton, ni l'inverse.
 * Le flux PKCE, lui, passe par `?code=…` dans la query.
 *
 * Fonction pure, testée dans outils/auth-test.mjs.
 *
 * @returns {{kind:'tokens'|'code'|'error'|'none', …}}
 */
export function parseRecoveryParams(hash = '', search = '') {
  // Un hash qui commence par #/ est une route de l'app : on n'y touche pas.
  const brut = hash.replace(/^#/, '');
  const params = new URLSearchParams(brut.startsWith('/') ? '' : brut);
  const query = new URLSearchParams(String(search).replace(/^\?/, ''));

  if (params.get('error_description') || query.get('error_description')) {
    return {
      kind: 'error',
      message: decodeURIComponent(
        params.get('error_description') || query.get('error_description')),
    };
  }

  const access = params.get('access_token');
  const refresh = params.get('refresh_token');
  if (access && refresh) {
    return { kind: 'tokens', access, refresh, type: params.get('type') || '' };
  }

  const code = query.get('code');
  if (code) return { kind: 'code', code };

  return { kind: 'none' };
}

/**
 * Consomme le lien de réinitialisation reçu par mail.
 * @returns {boolean} true si une session de récupération a été ouverte
 */
export async function consumeRecovery() {
  const info = parseRecoveryParams(location.hash, location.search);
  if (info.kind === 'none') return false;

  const versMotDePasse = () => history.replaceState(null, '', location.pathname + '#/motdepasse');

  try {
    if (info.kind === 'error') throw new Error(traduire(info.message));

    const sb = await getClient();

    if (info.kind === 'tokens') {
      const { error } = await sb.auth.setSession({
        access_token: info.access, refresh_token: info.refresh,
      });
      if (error) throw new Error(traduire(error.message));
    } else {
      const { error } = await sb.auth.exchangeCodeForSession(info.code);
      if (error) throw new Error(traduire(error.message));
    }

    versMotDePasse();
    return true;

  } catch (e) {
    console.error('Lien de réinitialisation invalide', e);
    history.replaceState(null, '', location.pathname + '#/verrou');
    throw e;
  }
}

export async function signOut() {
  const sb = await getClient();
  await sb.auth.signOut();
}

export async function onAuthChange(fn) {
  const sb = await getClient();
  return sb.auth.onAuthStateChange((_event, session) => fn(session));
}

/** Appelle l'Edge Function « suunto ». */
export async function callFunction(name, body) {
  const sb = await getClient();
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    // Le corps d'erreur des Edge Functions contient souvent le vrai message.
    let msg = error.message;
    try { msg = (await error.context?.json())?.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function traduire(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return 'Mot de passe incorrect';
  if (m.includes('email not confirmed')) return 'Adresse pas encore confirmée — regarde ta boîte mail';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) {
    return 'Les inscriptions sont fermées sur ce projet Supabase '
         + '(Authentication → Sign In / Providers → Allow new users to sign up)';
  }
  if (m.includes('user already registered')) return 'Ce carnet a déjà un mot de passe — utilise « oublié » si besoin';
  if (m.includes('rate limit') || m.includes('too many')) return 'Trop de tentatives, réessaie dans un moment';
  if (m.includes('password should be') || m.includes('at least 6')) {
    return 'Mot de passe trop court (6 caractères minimum)';
  }
  if (m.includes('new password should be different')) return 'Le nouveau mot de passe doit être différent';
  if (m.includes('same_password')) return 'Le nouveau mot de passe doit être différent';
  if (m.includes('expired') || m.includes('invalid or has expired')) {
    return 'Lien de réinitialisation expiré — redemandes-en un';
  }
  if (m.includes('failed to fetch') || m.includes('networkerror')) {
    return 'Serveur injoignable — vérifie ta connexion';
  }
  if (m.includes('invalid api key') || m.includes('no api key')) {
    return 'Clé Supabase invalide — vérifie les réglages';
  }
  return msg;
}
