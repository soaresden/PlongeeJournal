// ============================================================
//  Edge Function « suunto »
//
//  Rôle : garder hors du navigateur tout ce qui doit rester secret
//  (client secret OAuth et clé d'abonnement Suunto), et servir de
//  relais entre l'app et l'API Suunto.
//
//  Le site est statique et public : ces secrets ne peuvent pas y
//  vivre. Ils sont donc stockés comme secrets Supabase et lus ici,
//  côté serveur uniquement.
//
//  Déploiement :
//    supabase functions deploy suunto --no-verify-jwt
//    (--no-verify-jwt est nécessaire car la redirection OAuth de
//     Suunto arrive sans en-tête Authorization ; chaque action
//     sensible vérifie elle-même la session.)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const OAUTH_BASE = 'https://cloudapi-oauth.suunto.com';
const API_BASE   = 'https://cloudapi.suunto.com';

const env = (k: string, required = true) => {
  const v = Deno.env.get(k);
  if (!v && required) throw new Error(`Secret manquant : ${k}`);
  return v ?? '';
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// ------------------------------------------------------------
//  État OAuth signé — porte l'identité de l'utilisateur jusqu'au
//  retour de Suunto, sans table intermédiaire.
// ------------------------------------------------------------

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unb64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function hmacKey() {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env('SUUNTO_STATE_SECRET')),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
  );
}

async function signState(uid: string) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ uid, exp: Date.now() + 600_000 })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), new TextEncoder().encode(payload));
  return `${payload}.${b64url(new Uint8Array(sig))}`;
}

async function readState(state: string): Promise<string | null> {
  const [payload, sig] = String(state).split('.');
  if (!payload || !sig) return null;
  const ok = await crypto.subtle.verify(
    'HMAC', await hmacKey(), unb64url(sig), new TextEncoder().encode(payload));
  if (!ok) return null;
  const data = JSON.parse(new TextDecoder().decode(unb64url(payload)));
  if (!data.exp || data.exp < Date.now()) return null;
  return data.uid as string;
}

// ------------------------------------------------------------
//  Accès base (service_role : contourne RLS, obligatoire ici
//  puisque le navigateur n'a aucun droit sur suunto_accounts)
// ------------------------------------------------------------

const admin = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

/** Vérifie la session Supabase de l'appelant et renvoie son uid. */
async function requireUser(req: Request): Promise<string> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) throw new Response('Non authentifié', { status: 401, headers: CORS });
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Response('Session invalide', { status: 401, headers: CORS });
  return data.user.id;
}

// ------------------------------------------------------------
//  Jetons Suunto
// ------------------------------------------------------------

async function exchangeToken(params: Record<string, string>) {
  const basic = btoa(`${env('SUUNTO_CLIENT_ID')}:${env('SUUNTO_CLIENT_SECRET')}`);
  const res = await fetch(`${OAUTH_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Suunto OAuth ${res.status} : ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** Renvoie un access_token valide, en le rafraîchissant si besoin. */
async function freshToken(uid: string): Promise<string> {
  const db = admin();
  const { data: row } = await db.from('suunto_accounts')
    .select('access_token, refresh_token, expires_at').eq('owner_id', uid).maybeSingle();

  if (!row?.access_token) throw new Error('Compte Suunto non relié');

  const stillValid = row.expires_at && new Date(row.expires_at).getTime() > Date.now() + 120_000;
  if (stillValid) return row.access_token;
  if (!row.refresh_token) throw new Error('Reconnecte ton compte Suunto');

  const tok = await exchangeToken({ grant_type: 'refresh_token', refresh_token: row.refresh_token });
  await db.from('suunto_accounts').update({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? row.refresh_token,
    expires_at: new Date(Date.now() + (tok.expires_in ?? 86400) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('owner_id', uid);

  return tok.access_token;
}

/** Appelle l'API Suunto. Certaines passerelles veulent « Bearer », d'autres non. */
async function suuntoFetch(path: string, token: string, accept = 'application/json') {
  const call = (authValue: string) => fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: authValue,
      'Ocp-Apim-Subscription-Key': env('SUUNTO_SUBSCRIPTION_KEY'),
      Accept: accept,
    },
  });
  let res = await call(`Bearer ${token}`);
  if (res.status === 401 || res.status === 403) res = await call(token);
  return res;
}

// ------------------------------------------------------------
//  Point d'entrée
// ------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  const isCallback = url.pathname.endsWith('/callback') || url.searchParams.has('code')
                   || url.searchParams.has('error');

  try {
    // ---------- Retour de redirection OAuth (appel de Suunto) ----------
    if (req.method === 'GET' && isCallback) {
      const appUrl = env('APP_URL');
      const fail = (msg: string) =>
        Response.redirect(`${appUrl}#/suunto?erreur=${encodeURIComponent(msg)}`, 302);

      if (url.searchParams.get('error')) return fail(url.searchParams.get('error')!);

      const code = url.searchParams.get('code');
      const uid = await readState(url.searchParams.get('state') ?? '');
      if (!code) return fail('Code d’autorisation absent');
      if (!uid)  return fail('Lien expiré, relance la connexion');

      const tok = await exchangeToken({
        grant_type: 'authorization_code',
        code,
        redirect_uri: env('SUUNTO_REDIRECT_URI'),
      });

      // Le JWT Suunto porte le nom du compte dans la revendication « user ».
      let suuntoUser = '';
      try {
        suuntoUser = JSON.parse(atob(tok.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).user ?? '';
      } catch { /* champ optionnel */ }

      await admin().from('suunto_accounts').upsert({
        owner_id: uid,
        suunto_user: suuntoUser,
        access_token: tok.access_token,
        refresh_token: tok.refresh_token,
        expires_at: new Date(Date.now() + (tok.expires_in ?? 86400) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      });

      return Response.redirect(`${appUrl}#/suunto?ok=1`, 302);
    }

    // ---------- Actions appelées par l'application ----------
    if (req.method !== 'POST') return json({ error: 'Méthode non gérée' }, 405);

    const uid = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    switch (action) {

      case 'authorize': {
        const state = await signState(uid);
        const u = new URL(`${OAUTH_BASE}/oauth/authorize`);
        u.searchParams.set('response_type', 'code');
        u.searchParams.set('client_id', env('SUUNTO_CLIENT_ID'));
        u.searchParams.set('redirect_uri', env('SUUNTO_REDIRECT_URI'));
        u.searchParams.set('state', state);
        return json({ url: u.toString() });
      }

      case 'status': {
        const { data } = await admin().from('suunto_accounts')
          .select('suunto_user, expires_at, last_sync_at, access_token')
          .eq('owner_id', uid).maybeSingle();
        return json({
          connected: !!data?.access_token,
          user: data?.suunto_user ?? null,
          lastSync: data?.last_sync_at ?? null,
        });
      }

      case 'disconnect': {
        await admin().from('suunto_accounts').delete().eq('owner_id', uid);
        return json({ ok: true });
      }

      case 'workouts': {
        const token = await freshToken(uid);
        const limit = Math.min(Number(body.limit) || 30, 100);
        const since = body.since ? `&since=${Number(body.since)}` : '';
        const res = await suuntoFetch(`/v2/workouts?limit=${limit}${since}`, token);
        const text = await res.text();
        if (!res.ok) return json({ error: `Suunto ${res.status}`, detail: text.slice(0, 400) }, 502);

        await admin().from('suunto_accounts')
          .update({ last_sync_at: new Date().toISOString() }).eq('owner_id', uid);

        return json(JSON.parse(text));
      }

      case 'fit': {
        const key = String(body.workoutKey || '');
        if (!key) return json({ error: 'workoutKey manquant' }, 400);
        const token = await freshToken(uid);
        const res = await suuntoFetch(
          `/v2/workout/exportFit/${encodeURIComponent(key)}`, token, 'application/octet-stream');
        if (!res.ok) {
          return json({ error: `Suunto ${res.status}`, detail: (await res.text()).slice(0, 400) }, 502);
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        // base64 par tranches : évite de dépasser la pile sur les gros fichiers
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) {
          bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        }
        return json({ fit: btoa(bin), bytes: buf.length });
      }

      default:
        return json({ error: `Action inconnue : ${action}` }, 400);
    }

  } catch (e) {
    if (e instanceof Response) return e;
    console.error(e);
    return json({ error: (e as Error).message ?? 'Erreur interne' }, 500);
  }
});
