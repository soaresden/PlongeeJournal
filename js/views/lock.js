// ============================================================
//  Écran de verrouillage
//
//  Au quotidien : un seul champ, le mot de passe. Ou l'empreinte.
//
//  L'adresse email n'est demandée qu'une fois, à l'installation, et
//  ne sert qu'à recevoir le lien de réinitialisation. Elle est
//  mémorisée ensuite : plus jamais affichée.
// ============================================================

import { el, toast } from '../lib.js';
import { signIn, signUp, resetPassword, changePassword, getSession, signOut,
         diagnostiquerConnexion, renvoyerConfirmation } from '../supabase.js';
import { settings, saveSettings, isSupabaseConfigured } from '../settings.js';
import { initStore, resetStore } from '../store.js';
import * as bio from '../biometric.js';
import { navigate } from '../router.js';

const field = (label, control, hint) => el('div.field', {},
  label ? el('label.lbl', { text: label }) : null, control,
  hint ? el('div.hint', {}, hint) : null);

function card(...content) {
  return el('div.card', {},
    el('div', { style: { textAlign: 'center', fontSize: '44px', marginBottom: '4px' }, text: '🤿' }),
    ...content);
}

const strength = pw => {
  if (pw.length < 6) return { txt: 'Trop court (6 minimum)', col: 'var(--danger)', ok: false };
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^\w]/.test(pw)) s++;
  if (s <= 1) return { txt: 'Mot de passe faible', col: 'var(--warn)', ok: true };
  if (s <= 3) return { txt: 'Mot de passe correct', col: 'var(--text-dim)', ok: true };
  return { txt: 'Mot de passe solide', col: 'var(--ok)', ok: true };
};

// ============================================================
//  1. Écran normal : déverrouiller
// ============================================================

export async function lockView() {
  if (!isSupabaseConfigured()) {
    return {
      title: 'Carnet verrouillé',
      node: el('div.empty', {},
        el('span.big', { text: '🔧' }),
        'Le carnet n’est pas encore installé.',
        el('div', { style: { marginTop: '18px' } },
          el('button.btn.primary', { onclick: () => navigate('setup') }, 'Lancer l’installation'))),
    };
  }

  // Pas encore de mot de passe défini -> on passe par l'installation
  if (!settings().installed && !settings().accountEmail) {
    navigate('setup', true);
    return { title: 'Installation', node: el('div') };
  }

  if (await getSession().catch(() => null)) {
    navigate('dives', true);
    return { title: '', node: el('div') };
  }

  const pass = el('input', { type: 'password', placeholder: 'Mot de passe',
                             autocomplete: 'current-password', enterkeyhint: 'go' });
  const msg = el('div.hint');
  const say = (t, col) => { msg.innerHTML = ''; msg.append(el('div', { style: { color: col }, text: t })); };

  const unlock = el('button.btn.primary.block', { type: 'button', text: 'Déverrouiller' });
  const aide = el('div');
  let echecs = 0;

  async function open(password) {
    unlock.disabled = true; unlock.textContent = 'Ouverture…';
    try {
      await signIn(settings().accountEmail, password);
      resetStore();
      await initStore({ force: true });
      navigate('dives', true);
    } catch (e) {
      echecs++;
      say(e.message, 'var(--danger)');
      pass.value = ''; pass.focus();

      // Un « mot de passe incorrect » cache souvent autre chose : compte
      // jamais créé, ou adresse pas encore confirmée. On propose d'aller voir.
      aide.innerHTML = '';
      aide.append(el('div', { style: { textAlign: 'center', marginTop: '10px' } },
        el('button.btn.sm.ghost', {
          type: 'button', text: '🩺 Pourquoi ça ne marche pas ?',
          onclick: lancerDiagnostic,
        })));
      if (echecs >= 2) lancerDiagnostic();
    } finally {
      unlock.disabled = false; unlock.textContent = 'Déverrouiller';
    }
  }

  async function lancerDiagnostic() {
    aide.innerHTML = '';
    aide.append(el('div.hint', { text: 'Analyse en cours…' }));
    try {
      const d = await diagnostiquerConnexion(settings().accountEmail);
      aide.innerHTML = '';
      aide.append(el('div.card.alerte', { style: { marginTop: '14px' } },
        el('div', { style: { fontWeight: '650', marginBottom: '6px' }, text: d.titre }),
        el('div', { style: { fontSize: '13.5px', lineHeight: '1.55' }, text: d.explication }),
        d.actions.length
          ? el('ol', { style: { margin: '10px 0 0', paddingLeft: '20px',
              fontSize: '13.5px', lineHeight: '1.7' } },
              d.actions.map(a => el('li', { text: a })))
          : null,
        d.cas === 'confirmation-requise'
          ? el('div.btn-row', {},
              el('button.btn.sm', { type: 'button', text: 'Renvoyer le mail de confirmation',
                onclick: async e => {
                  e.target.disabled = true;
                  try { await renvoyerConfirmation(settings().accountEmail); toast('Mail renvoyé'); }
                  catch (err) { toast(err.message, true); e.target.disabled = false; }
                } }))
          : null,
        d.cas === 'compte-absent'
          ? el('div.btn-row', {},
              el('button.btn.sm.primary', { type: 'button', text: 'Définir mon mot de passe',
                onclick: () => navigate('motdepasse') }))
          : null,
        el('div.hint', { style: { marginBottom: 0 },
          text: `Adresse utilisée : ${settings().accountEmail || '(aucune)'}` }),
      ));
    } catch (e) {
      aide.innerHTML = '';
      aide.append(el('div.hint', { style: { color: 'var(--danger)' }, text: e.message }));
    }
  }

  unlock.onclick = () => {
    if (!pass.value) return say('Saisis ton mot de passe', 'var(--danger)');
    open(pass.value);
  };

  // ---- Empreinte ----
  const bioBox = el('div');
  if (bio.isEnrolled() && await bio.isAvailable()) {
    const bioBtn = el('button.btn.block', { type: 'button',
      style: { marginTop: '10px' }, text: '👆 Déverrouiller par empreinte' });

    bioBtn.onclick = async () => {
      bioBtn.disabled = true;
      try {
        await bio.verify();
        // L'empreinte lève le verrou local ; la session Supabase mémorisée
        // sur cet appareil prend le relais.
        const session = await getSession().catch(() => null);
        if (session) {
          resetStore();
          await initStore({ force: true });
          navigate('dives', true);
        } else {
          say('Session expirée — saisis ton mot de passe une fois.', 'var(--warn)');
        }
      } catch (e) {
        say(bio.explain(e), 'var(--danger)');
      } finally {
        bioBtn.disabled = false;
      }
    };
    bioBox.append(bioBtn);
    // Proposition immédiate : c'est le geste attendu à l'ouverture.
    setTimeout(() => bioBtn.click(), 250);
  }

  // ---- Mot de passe oublié ----
  const forgot = el('button.btn.sm.ghost', { type: 'button', text: 'Mot de passe oublié' });
  forgot.onclick = async () => {
    const mail = settings().accountEmail;
    if (!mail) return say('Aucune adresse enregistrée sur cet appareil', 'var(--danger)');
    forgot.disabled = true;
    try {
      await resetPassword(mail);
      say(`Lien de réinitialisation envoyé à ${mail}. Ouvre-le depuis cet appareil.`, 'var(--ok)');
    } catch (e) {
      say(e.message, 'var(--danger)');
    } finally { forgot.disabled = false; }
  };

  const form = el('form', { onsubmit: e => { e.preventDefault(); unlock.click(); } },
    card(
      el('div', { style: { textAlign: 'center', color: 'var(--text-dim)', marginBottom: '18px' },
        text: 'Carnet verrouillé' }),
      field(null, pass),
      msg,
      el('div', { style: { marginTop: '14px' } }, unlock),
      bioBox,
      el('div', { style: { textAlign: 'center', marginTop: '10px' } }, forgot),
      aide,
    ),
    el('div', { style: { textAlign: 'center' } },
      el('button.btn.sm.ghost', { type: 'button', text: '⚙ Réglages', onclick: () => navigate('setup') })),
  );

  setTimeout(() => pass.focus(), 60);
  return { title: 'Carnet verrouillé', node: form };
}

// ============================================================
//  2. Définir le mot de passe (installation, ou après réinit)
// ============================================================

export async function passwordView() {
  const s = settings();
  const session = await getSession().catch(() => null);

  // Session ouverte = on arrive du lien de réinitialisation, ou des réglages.
  const mode = session ? 'change' : 'create';

  const mail = el('input', { type: 'email', value: s.accountEmail, placeholder: 'ton@email.fr',
                             autocomplete: 'username', inputmode: 'email', autocapitalize: 'off' });
  const pw1 = el('input', { type: 'password', placeholder: 'Nouveau mot de passe',
                            autocomplete: 'new-password' });
  const pw2 = el('input', { type: 'password', placeholder: 'Répéter le mot de passe',
                            autocomplete: 'new-password' });
  const meter = el('div.hint');
  const msg = el('div.hint');
  const say = (t, col) => { msg.innerHTML = ''; msg.append(el('div', { style: { color: col }, text: t })); };

  pw1.addEventListener('input', () => {
    if (!pw1.value) { meter.textContent = ''; return; }
    const st = strength(pw1.value);
    meter.innerHTML = '';
    meter.append(el('div', { style: { color: st.col }, text: st.txt }));
  });

  const submit = el('button.btn.primary.block', { type: 'button',
    text: mode === 'create' ? 'Créer mon carnet' : 'Enregistrer le nouveau mot de passe' });

  submit.onclick = async () => {
    if (pw1.value !== pw2.value) return say('Les deux mots de passe diffèrent', 'var(--danger)');
    if (!strength(pw1.value).ok) return say('Mot de passe trop court (6 caractères minimum)', 'var(--danger)');

    submit.disabled = true;
    const before = submit.textContent;
    submit.textContent = 'Enregistrement…';

    try {
      if (mode === 'create') {
        const adresse = mail.value.trim();
        if (!adresse) { say('L’adresse email est nécessaire pour pouvoir réinitialiser', 'var(--danger)'); return; }

        const res = await signUp(adresse, pw1.value);
        saveSettings({ accountEmail: adresse, installed: true });

        if (res?.session) {
          resetStore();
          await initStore({ force: true });
          toast('Carnet créé');
          navigate('dives', true);
        } else {
          say('Compte créé. Confirme ton adresse par email, puis reviens déverrouiller.', 'var(--ok)');
          setTimeout(() => navigate('verrou', true), 2500);
        }
      } else {
        await changePassword(pw1.value);
        saveSettings({ installed: true });
        toast('Mot de passe modifié');
        navigate('dives', true);
      }
    } catch (e) {
      say(e.message, 'var(--danger)');
    } finally {
      submit.disabled = false; submit.textContent = before;
    }
  };

  const form = el('form', { onsubmit: e => { e.preventDefault(); submit.click(); } },
    card(
      el('div', { style: { textAlign: 'center', color: 'var(--text-dim)', marginBottom: '18px' },
        text: mode === 'create' ? 'Choisis le mot de passe de ton carnet'
                                : 'Nouveau mot de passe' }),
      mode === 'create'
        ? field('Adresse email', mail,
            'Uniquement pour recevoir le lien si tu oublies ton mot de passe. '
          + 'Elle ne te sera plus jamais demandée.')
        : null,
      field(mode === 'create' ? 'Mot de passe' : null, pw1, meter),
      field(null, pw2),
      msg,
      el('div', { style: { marginTop: '14px' } }, submit),
      mode === 'change'
        ? el('div', { style: { textAlign: 'center', marginTop: '10px' } },
            el('button.btn.sm.ghost', { type: 'button', text: 'Annuler',
              onclick: () => navigate('dives', true) }))
        : null,
    ),
  );

  return { title: mode === 'create' ? 'Mot de passe' : 'Changer le mot de passe', node: form };
}

// ============================================================
//  3. Section « Sécurité » réutilisée par l'écran Réglages
// ============================================================

export async function securitySection() {
  const box = el('div.card');
  const session = await getSession().catch(() => null);

  if (!session) {
    box.append(
      el('div.hint', { style: { marginTop: 0 }, text: 'Carnet verrouillé.' }),
      el('div.btn-row', {},
        el('button.btn.primary', { text: 'Déverrouiller', onclick: () => navigate('verrou') })));
    return box;
  }

  box.append(
    el('div.kv', {}, el('span.k', { text: 'Adresse de récupération' }),
      el('span.v', { text: settings().accountEmail || session.user.email || '—' })),
  );

  // ---- Empreinte ----
  const bioRow = el('div', { style: { marginTop: '14px' } });
  const dispo = await bio.isAvailable();

  function renderBio() {
    bioRow.innerHTML = '';
    if (!dispo) {
      bioRow.append(el('div.hint', { style: { marginTop: 0 },
        text: '👆 Déverrouillage par empreinte indisponible ici : il exige une connexion '
            + 'sécurisée (https) et un capteur (Touch ID, Face ID, empreinte Android, '
            + 'Windows Hello). En local sur http://localhost, il fonctionne aussi.' }));
      return;
    }

    if (bio.isEnrolled()) {
      bioRow.append(
        el('div', { style: { color: 'var(--ok)', fontWeight: '600' }, text: '👆 Empreinte activée sur cet appareil' }),
        el('div.hint', { text: 'À l’ouverture, l’app demande ton empreinte au lieu du mot de passe. '
          + 'Le mot de passe reste valable et protège les données côté serveur.' }),
        el('div.btn-row', {},
          el('button.btn.sm.danger', { text: 'Désactiver l’empreinte',
            onclick: () => { bio.disable(); renderBio(); toast('Empreinte désactivée'); } })),
      );
    } else {
      bioRow.append(
        el('div', { style: { fontWeight: '600' }, text: '👆 Déverrouillage par empreinte' }),
        el('div.hint', { text: 'Évite de retaper le mot de passe à chaque ouverture sur cet appareil.' }),
        el('div.btn-row', {},
          el('button.btn.sm', { text: 'Activer sur cet appareil',
            onclick: async e => {
              const b = e.target; b.disabled = true;
              try { await bio.enroll(settings().accountEmail || 'Carnet de plongée');
                    renderBio(); toast('Empreinte activée'); }
              catch (err) { toast(bio.explain(err), true); b.disabled = false; }
            } })),
      );
    }
  }
  renderBio();
  box.append(bioRow);

  box.append(el('div.btn-row', {},
    el('button.btn', { text: 'Changer le mot de passe', onclick: () => navigate('motdepasse') }),
    el('button.btn.sm.ghost', { text: 'Verrouiller',
      onclick: async () => { await signOut(); resetStore(); toast('Carnet verrouillé'); navigate('verrou', true); } }),
  ));

  return box;
}
