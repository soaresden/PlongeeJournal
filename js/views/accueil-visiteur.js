// ============================================================
//  L'entrée du carnet partagé : « qui es-tu ? »
//
//  Avant de voir le carnet, le visiteur donne son prénom, la date et le
//  lieu (ou le pays) d'une plongée faite avec moi. Si une de mes
//  plongées correspond, il entre, et je suis prévenu (voir visites.js).
//  Une fois entré sur un appareil, on ne le redemande plus (une visite
//  est quand même notée, une fois par jour au plus).
// ============================================================

import { el } from '../lib.js';
import { verifierVisiteur, annoncerVisite, nouvelleSession, suivreParcours } from '../visites.js';
import { paysPlongee } from './cv.js';

const cle = id => `plongee-journal:visiteur:${id}`;
const lire = id => { try { return JSON.parse(localStorage.getItem(cle(id)) || 'null'); } catch { return null; } };
const ecrire = (id, v) => { try { localStorage.setItem(cle(id), JSON.stringify(v)); } catch { /* navigation privée */ } };

/** Les noms d'un pays en français et en anglais (pour « Maldives », « Egypt », « Égypte »…). */
function nomsPays(d) {
  const c = paysPlongee(d);
  if (!c) return [];
  const noms = [];
  for (const l of ['fr', 'en']) { try { noms.push(new Intl.DisplayNames([l], { type: 'region' }).of(c)); } catch { /* vieux navigateur */ } }
  return noms;
}

/** Attend que l'écran d'ouverture soit parti (l'accueil passe après lui). */
async function apresSplash() {
  for (let i = 0; i < 40 && document.getElementById('splash'); i++) await new Promise(r => setTimeout(r, 250));
}

/**
 * @param {{id:string, proprio:string, dives:Array, canal:string}} o
 * @returns {Promise<void>} quand le visiteur est entré
 */
/** Le nom d'un écran, tel qu'il apparaîtra dans mon historique des visites. */
function nommeur(dives, buddies) {
  return chemin => {
    const [racine, x] = chemin.split('/');
    if (racine === 'dive' && x) { const d = dives.find(v => v.id === x); return d ? `n°${d.numero ?? '?'} ${d.lieuNom || ''}`.trim() : 'une plongée'; }
    if (racine === 'buddy' && x) { const b = buddies.find(v => v.id === x); return b ? `fiche de ${b.prenom || '?'}` : 'un plongeur'; }
    return { dives: 'Plongées', stats: 'Stats', buddies: 'Plongeurs', divers: 'Profil', cv: 'Qui je suis', mn90: 'MN90',
      seances: 'Séances', calendar: 'Agenda', carte: 'Carte', reglages: 'Réglages' }[racine] || racine;
  };
}

export async function accueilVisiteur({ id, proprio, dives, canal, buddies = [] }) {
  const deja = lire(id);
  // Une visite = une session : l'entrée, puis ce qui est regardé.
  const sid = nouvelleSession();
  const suivre = prenom => suivreParcours({ canal, prenom, sid, nommer: nommeur(dives, buddies) });
  if (deja?.prenom) {
    // Déjà entré : une visite notée, au plus une fois par jour.
    const aujourdhui = new Date().toISOString().slice(0, 10);
    if (deja.vuLe !== aujourdhui) {
      const plongee = dives.find(d => d.id === deja.plongeeId) || null;
      annoncerVisite(canal, { prenom: deja.prenom, date: deja.date, lieu: `${deja.lieu} (retour)`, plongee, ok: true, sid });
      ecrire(id, { ...deja, vuLe: aujourdhui });
    }
    suivre(deja.prenom);
    return;
  }
  await apresSplash();
  return new Promise(resolve => {
    const prenom = el('input', { type: 'text', autocomplete: 'given-name', placeholder: 'Ton prénom' });
    const date = el('input', { type: 'date' });
    const lieu = el('input', { type: 'text', placeholder: 'Lieu ou pays : Hurghada, Martinique, Maldives…' });
    const message = el('div.accueil-message');
    const bouton = el('button.btn.primary.block', { type: 'submit', text: 'Entrer' });
    let essais = 0;
    const formulaire = el('form.accueil-carte.card', {
      onsubmit: async e => {
        e.preventDefault();
        const saisie = { prenom: prenom.value.trim(), date: date.value, lieu: lieu.value.trim() };
        if (!saisie.prenom || !saisie.date || !saisie.lieu) { message.textContent = 'Il faut ton prénom, la date et le lieu.'; return; }
        bouton.disabled = true;
        const { ok, plongee } = verifierVisiteur(saisie, dives, nomsPays);
        essais++;
        // Je suis prévenu dans les deux cas (une tentative ratée aussi, trois au plus).
        if (ok || essais <= 3) annoncerVisite(canal, { ...saisie, plongee, ok, sid });
        if (!ok) {
          bouton.disabled = false;
          message.textContent = `Je ne retrouve pas cette plongée avec ${proprio}. Vérifie la date (à quelques jours près) et le lieu, ou essaie le pays.`;
          return;
        }
        ecrire(id, { ...saisie, plongeeId: plongee.id, vuLe: new Date().toISOString().slice(0, 10) });
        suivre(saisie.prenom);
        voile.classList.add('part');
        setTimeout(() => { voile.remove(); resolve(); }, 350);
      },
    },
      el('div.accueil-titre', { text: `🤿 Le carnet de plongée de ${proprio}` }),
      el('div.hint', { text: `Pour entrer : ton prénom, et une plongée qu’on a faite ensemble — la date et le lieu (ou le pays).` }),
      el('label.lbl', { text: 'Prénom' }), prenom,
      el('label.lbl', { text: 'Date d’une plongée ensemble' }), date,
      el('label.lbl', { text: 'Où ?' }), lieu,
      message, bouton);
    const voile = el('div#accueil-visiteur', {}, formulaire);
    // Le choix de la langue, dès l'entrée.
    import('../langue.js').then(m => formulaire.prepend(el('div', { style: { textAlign: 'right' } }, m.boutonLangue()))).catch(() => {});
    document.body.append(voile);
    setTimeout(() => prenom.focus(), 200);
  });
}
