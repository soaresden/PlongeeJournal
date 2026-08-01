// ============================================================
//  Déverrouillage par empreinte digitale (WebAuthn)
//
//  Ce que ça fait, honnêtement :
//  la session Supabase est déjà mémorisée dans le navigateur (c'est
//  ce qui évite de retaper le mot de passe à chaque ouverture). La
//  biométrie ajoute un verrou DEVANT cette session : sans empreinte,
//  l'app ne s'ouvre pas.
//
//  Elle protège donc contre quelqu'un qui attrape ton téléphone
//  déverrouillé. Elle ne remplace pas le mot de passe : c'est lui
//  qui protège les données côté serveur.
//
//  Exige HTTPS (ou localhost) et un capteur : Touch ID, Face ID,
//  empreinte Android, Windows Hello.
// ============================================================

import { settings, saveSettings } from './settings.js';

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unb64url = s => Uint8Array.from(
  atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));

/** Le navigateur et l'appareil savent-ils faire ? */
export async function isAvailable() {
  if (!window.PublicKeyCredential || !navigator.credentials?.create) return false;
  if (!window.isSecureContext) return false;          // http:// non sécurisé
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** L'empreinte est-elle déjà activée sur CET appareil ? */
export function isEnrolled() {
  return !!settings().biometricId;
}

/**
 * Active le déverrouillage biométrique.
 * @param {string} label  ce qui s'affichera dans la demande système
 */
export async function enroll(label = 'Carnet de plongée') {
  if (!await isAvailable()) {
    throw new Error('Cet appareil ou ce navigateur ne gère pas le déverrouillage biométrique.');
  }

  const userId = randomBytes(16);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'Carnet de plongée', id: location.hostname },
      user: { id: userId, name: label, displayName: label },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },      // ES256
        { type: 'public-key', alg: -257 },    // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',  // capteur intégré, pas de clé USB
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60_000,
      attestation: 'none',
    },
  });

  if (!cred) throw new Error('Enregistrement annulé');

  saveSettings({ biometricId: b64url(cred.rawId), biometricAt: new Date().toISOString() });
  return true;
}

/**
 * Demande l'empreinte. Renvoie true si l'utilisateur s'est authentifié.
 * Lève une erreur explicite si le capteur a refusé.
 */
export async function verify() {
  const id = settings().biometricId;
  if (!id) throw new Error('Aucune empreinte enregistrée sur cet appareil');

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ id: unb64url(id), type: 'public-key' }],
      userVerification: 'required',
      timeout: 60_000,
    },
  });

  if (!assertion) throw new Error('Déverrouillage annulé');
  return true;
}

/** Retire l'empreinte de cet appareil (le mot de passe reste, lui). */
export function disable() {
  saveSettings({ biometricId: '', biometricAt: '' });
}

/** Message d'erreur lisible pour l'utilisateur. */
export function explain(err) {
  const n = err?.name || '';
  if (n === 'NotAllowedError') return 'Déverrouillage refusé ou annulé.';
  if (n === 'InvalidStateError') return 'Une empreinte est déjà enregistrée pour ce site.';
  if (n === 'NotSupportedError') return 'Cet appareil ne gère pas ce type de déverrouillage.';
  if (n === 'SecurityError') return 'Le déverrouillage biométrique exige une connexion sécurisée (https).';
  return err?.message || 'Déverrouillage impossible.';
}
