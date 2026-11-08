// ============================================================
//  Import depuis la montre, en Bluetooth (Suunto Ocean)
//
//  1. Se connecter : la montre déjà appairée par l'appli Suunto est
//     réutilisée telle quelle (rien à désappairer).
//  2. La liste des plongées de la montre s'affiche ; celles déjà dans
//     le carnet (import .fit ou Bluetooth) sont repérées et décochées.
//  3. Télécharger les plongées cochées, les vérifier sur l'aperçu.
//  4. Les ajouter au carnet : même format que l'import .fit, puis
//     synchronisation GitHub comme toute plongée.
//
//  Un journal détaillé de l'échange reste disponible en bas de page :
//  à copier et à envoyer si quelque chose coince.
// ============================================================

import { el, toast, fmtDuration } from '../lib.js';
import { store, TYPES_SEANCE, typeSeance } from '../store.js';
import { navigate } from '../router.js';
import { graphiquePlongee, tuilesPlongee } from '../courbes.js';
import { memoriserListeMontre, bilanDonnees, completerDepuisMontre } from '../donnees.js';
import { paliersDuProfil } from '../profil-analyse.js';

/** Une plongée décodée, vue comme une fiche (pour les chiffres et les courbes). */
const apercuDive = dec => ({
  dureeMin: dec.dureeMin, profMax: dec.profMax, profMoy: dec.profMoy, tempFond: dec.tempFond,
  pressionDepart: dec.pressionDepart, pressionFin: dec.pressionFin, blocLitres: dec.blocLitres,
  gazType: dec.gazHe ? 'trimix' : dec.gazO2 && dec.gazO2 !== 21 ? 'nitrox' : 'air', gazO2: dec.gazO2, gazHe: dec.gazHe,
  samples: dec.samples,
});
import { bleDisponible, ouvrirLienOcean, montreMemorisee, oublierMontre } from '../ble.js';
import { OceanSession, Annule } from '../ocean-device.js';
import { parseOcean, oceanToDive, plongeeCorrespondante, CLE_OCEAN } from '../ocean-sbem.js';
import { journalBle } from '../ble-journal.js';
import { creerPlongeeImportee } from './suunto.js';
import { suggererRangement, seanceDepuisImport, commePlongees } from '../seances.js';

// L'état survit au changement d'écran : on peut aller voir le carnet et
// revenir copier le journal.
const etat = {
  lien: null, session: null, info: null, fiches: null,
  bruts: new Map(),       // id → {compresse, resume}
  decodes: new Map(),     // id → {dive, erreur}
  coches: new Map(),      // id → bool
  rangement: new Map(),   // id → 'plongee' | 'fosse' | 'piscine' | 'apnee'
  occupe: false, abort: null,
};

const fmtDateHeure = d => d.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const ko = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1000))} Ko`);

/** Téléchargement qui marche aussi dans l'APK (où <a download> est ignoré). */
async function enregistrerFichier(texte, nom, type = 'text/plain') {
  const blob = new Blob([texte], { type });
  const fichier = typeof File === 'function' ? new File([blob], nom, { type }) : null;
  if (window.Capacitor && fichier && navigator.canShare?.({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier], title: nom }); return; } catch { /* annulé */ }
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: nom });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function copier(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    const zone = el('textarea', { style: { position: 'fixed', opacity: '0' } });
    zone.value = texte;
    document.body.append(zone);
    zone.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* rien */ }
    zone.remove();
    return ok;
  }
}

function base64(octets) {
  let s = '';
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}

async function deconnecter() {
  etat.abort?.abort();
  const lien = etat.lien;
  etat.lien = null;
  etat.session = null;
  if (lien) {
    journalBle.log('déconnexion');
    await lien.fermer().catch(() => {});
  }
}

export async function montreView() {
  const wrap = el('div');
  const dispo = bleDisponible();
  const diverId = await store.getActiveDiverId();
  const dives = diverId ? await store.listDives(diverId) : [];
  const seances = diverId ? await store.listSeances(diverId) : [];
  // Déjà dans le carnet : en plongée, ou rangée dans les séances.
  const connues = () => [...dives, ...commePlongees(seances)];

  const statut = el('div.hint', { style: { margin: '10px 0 6px', minHeight: '1.4em' } });
  // La progression du téléchargement : un panneau en bas de l'écran,
  // visible où qu'on soit dans la page (la liste peut être longue).
  const pTitre = el('div.maj-etat');
  const pRempli = el('div.maj-rempli');
  const pDetail = el('div.hint.maj-detail');
  // Le journal en direct, sous la barre.
  const pJournal = el('pre.ip-journal');
  const pBarre = el('div.maj-barre', {}, pRempli);
  const barre = el('div#import-progres.card', { hidden: true },
    pTitre, pBarre, pDetail, pJournal,
    el('button.btn.sm', { type: 'button', style: { marginTop: '6px' }, text: '⏹ Arrêter', onclick: () => etat.abort?.abort() }));
  const LIGNES_DIRECT = 8;
  const majJournalDirect = () => {
    if (barre.hidden) return;
    // Sans l'heure (le « +16.8s » suffit) : plus de place pour le texte.
    pJournal.textContent = journalBle.dernieres(LIGNES_DIRECT)
      .map(l => l.replace(/^\d\d:\d\d:\d\d\.\d+\s+\+\s*([\d.]+s)\s+/, '$1 ')).join('\n');
    pJournal.scrollTop = pJournal.scrollHeight;
  };
  let journalEnAttente = false;
  journalBle.abonner(() => {
    if (journalEnAttente) return;
    journalEnAttente = true;
    setTimeout(() => { journalEnAttente = false; majJournalDirect(); }, 200);
  });
  /** Le panneau pendant une étape sans pourcentage (connexion, lecture de la liste). */
  const panneau = titre => {
    barre.hidden = !titre;
    if (!titre) return;
    pTitre.textContent = titre;
    pDetail.textContent = '';
    pBarre.classList.add('indetermine');
    majJournalDirect();
  };
  const zoneMontre = el('div');
  const liste = el('div');
  const actions = el('div');
  const attenteZone = el('div');      // l'attente guidée de la montre

  const dire = (texte, erreur = false) => {
    statut.textContent = texte;
    statut.style.color = erreur ? 'var(--danger, #e5534b)' : '';
  };
  const duree = s => (s >= 90 ? `${Math.round(s / 60)} min` : `${Math.max(1, Math.round(s))} s`);
  /**
   * @param {number} v      octets reçus (en tout)
   * @param {number} max    octets attendus (0 : on cache)
   * @param {{titre?:string, debut?:number}} info
   */
  const progres = (v, max, info = {}) => {
    barre.hidden = !max;
    if (!max) return;
    pBarre.classList.remove('indetermine');
    majJournalDirect();
    const fait = Math.min(v, max);
    const pourcent = Math.round(100 * fait / max);
    pRempli.style.width = `${pourcent}%`;
    if (info.titre) pTitre.textContent = `${info.titre} — ${pourcent} %`;
    const ecoule = info.debut ? (Date.now() - info.debut) / 1000 : 0;
    const vitesse = ecoule > 2 ? fait / ecoule : 0;
    pDetail.textContent = [`${ko(fait)} sur ${ko(max)}`,
      vitesse ? `${ko(vitesse)}/s` : null,
      vitesse && fait < max ? `encore ~${duree((max - fait) / vitesse)}` : null].filter(Boolean).join(' · ');
  };

  // ---------- en-tête ----------

  const memo = montreMemorisee();
  // Deux colonnes sur un écran large : à gauche la connexion, la barre et
  // le journal ; à droite les plongées de la montre. L'une sous l'autre
  // sur un écran étroit.
  const gauche = el('div.import-gauche');
  const droite = el('div.import-droite');
  wrap.classList.add('import-montre');
  wrap.append(gauche, droite);
  gauche.append(el('div.card', {},
    el('div', { style: { fontWeight: '650', marginBottom: '4px' }, text: '⌚ Suunto Ocean en Bluetooth' }),
    el('div.hint', {
      text: 'Garde la montre près du téléphone, écran allumé. Si l’appli Suunto est en train de '
          + 'synchroniser, le carnet attend qu’elle ait fini puis reprend tout seul.' }),
    dispo.ok ? null : el('div.hint', { style: { color: 'var(--danger, #e5534b)', marginTop: '8px' }, text: dispo.raison }),
    el('a', { href: '#/montre-aide', style: { display: 'inline-block', marginTop: '8px', fontSize: '13px' },
      text: 'Mode d’emploi : appairage et cohabitation avec l’appli Suunto ›' }),
  ));

  const btnConnexion = el('button.btn.primary.block', {
    type: 'button', disabled: !dispo.ok,
    text: memo ? `🔗 Se connecter à ${memo.nom}` : '🔗 Chercher la montre',
    onclick: () => connecter(false),
  });
  const btnAutre = el('button.btn.block', {
    type: 'button', disabled: !dispo.ok, style: { marginTop: '8px' },
    text: 'Choisir une autre montre',
    onclick: () => { oublierMontre(); connecter(true); },
  });
  const btnStop = el('button.btn.block', {
    type: 'button', style: { marginTop: '8px', display: 'none' },
    text: '⏹ Arrêter et se déconnecter',
    onclick: async () => { await deconnecter(); etat.occupe = false; dire('Déconnecté.'); rendre(); },
  });

  gauche.append(btnConnexion, btnAutre, btnStop, statut, attenteZone, barre);
  droite.append(zoneMontre, liste, actions);

  // ---------- connexion ----------

  async function connecter(choisirAutre) {
    if (etat.occupe) return;
    etat.occupe = true;
    await deconnecter();
    etat.fiches = null;
    rendre();
    journalBle.entete({
      appli: window.Capacitor?.isNativePlatform?.() ? 'APK Android' : 'site web',
      navigateur: navigator.userAgent,
      'montre mémorisée': memo ? `${memo.nom} (${memo.id})` : 'aucune',
    });
    const log = t => journalBle.log(t);
    etat.abort = new AbortController();
    try {
      dire('Recherche de la montre…');
      panneau('Connexion à la montre…');
      const lien = await ouvrirLienOcean({ journal: log, choisirAutre, signal: etat.abort.signal, surAttente: montrerAttente });
      montrerAttente(null);
      etat.lien = lien;
      lien.surCoupure(() => { if (etat.lien === lien) { dire('La montre s’est déconnectée.', true); etat.lien = null; } });

      dire(`Connecté à ${lien.nom}. Échange avec la montre…`);
      const session = new OceanSession(lien, { journal: log, signal: etat.abort.signal });
      etat.session = session;
      await session.bonjour();
      etat.info = await session.infos();
      dire('Lecture de la liste des plongées…');
      panneau('Lecture de la liste des plongées…');
      etat.fiches = await session.lister();
      memoriserListeMontre(etat.fiches.map(f => f.id));
      for (const f of etat.fiches) {
        if (!etat.coches.has(f.id)) etat.coches.set(f.id, f.taille > 0 && (!plongeeCorrespondante(f, connues()) || !!aCompleter(f)));
      }
      dire(`${etat.fiches.length} plongée(s) dans la montre.`);
    } catch (e) {
      erreur(e, 'Connexion impossible');
      await deconnecter();
    } finally {
      panneau(null);
      etat.occupe = false;
      rendre();
    }
  }

  /**
   * Pendant que l'appareil attend la montre : ce qu'il faut faire, en
   * grand, avec le temps qui reste et un bouton pour arrêter.
   */
  function montrerAttente(info) {
    if (!info) { attenteZone.replaceChildren(); return; }
    const pourcent = Math.round(100 * (1 - info.restant / Math.max(1, info.total)));
    attenteZone.replaceChildren(el('div.card.attente-montre', {},
      el('div', { style: { fontWeight: '700', marginBottom: '6px' }, text: `📡 J’attends la montre… ${info.restant} s` }),
      el('div.maj-barre', {}, el('div.maj-rempli', { style: { width: `${pourcent}%` } })),
      el('div', { style: { margin: '8px 0 4px' }, text: 'Elle ne s’annonce pas : elle est sûrement connectée à ton téléphone (appli Suunto). Pendant que je cherche, fais l’un des deux :' }),
      el('ol', { style: { margin: '0 0 6px', paddingLeft: '20px', lineHeight: '1.6' } },
        el('li', {}, el('b', { text: 'coupe le Bluetooth du téléphone' }), ' (une montre ne parle qu’à un appareil à la fois) ;'),
        el('li', {}, 'ou, sur la montre : ', el('b', { text: 'appareils appairés' }), ' (l’écran où l’on voit « MobileApp »), et reste sur cet écran.')),
      el('div.hint', { style: { margin: 0 }, text: 'Je me connecte dès qu’elle apparaît. Garde-la allumée, près de l’appareil.' }),
      el('button.btn.sm', { type: 'button', style: { marginTop: '8px' }, text: '⏹ Arrêter', onclick: () => etat.abort?.abort() })));
  }

  function erreur(e, contexte) {
    if (e instanceof Annule || e?.name === 'Annule') { dire('Import arrêté.'); montrerAttente(null); return; }
    console.error(e);
    journalBle.log(`✗ ${contexte} : ${e?.name || ''} ${e?.message || e}`);
    if (e?.stack) journalBle.log(e.stack.split('\n').slice(0, 4).join(' | '));
    const conseil = /NotFoundError|cancel|annul/i.test(`${e?.name} ${e?.message}`)
      ? ' (aucune montre choisie)'
      : ' — copie le journal en bas de page pour le diagnostic.';
    dire(`${contexte} : ${e?.message || e}${conseil}`, true);
  }

  /**
   * Une plongée déjà au carnet, mais sans la courbe de la sonde (venue du
   * compte Suunto, d'un export…) : la montre peut la compléter.
   */
  function aCompleter(f) {
    const deja = plongeeCorrespondante(f, connues());
    if (!deja || deja.dive.seance || !dives.includes(deja.dive)) return null;
    const b = bilanDonnees(deja.dive, { liste: null });
    return b.courbe && b.sonde === 'courbe' && b.gps ? null : deja.dive;
  }
  const aTraiter = f => !plongeeCorrespondante(f, connues()) || !!aCompleter(f);

  // ---------- téléchargement ----------

  async function telecharger() {
    const aFaire = etat.fiches.filter(f => etat.coches.get(f.id) && !etat.decodes.get(f.id)?.dive);
    if (!aFaire.length || etat.occupe || !etat.session) return;
    etat.occupe = true;
    rendre();
    const total = aFaire.reduce((a, f) => a + (f.taille || 0), 0) || 1;
    let fait = 0;
    const debut = Date.now();
    try {
      for (const [i, f] of aFaire.entries()) {
        const titre = `Plongée ${i + 1}/${aFaire.length} · ${fmtDateHeure(new Date(f.id * 1000))}`;
        dire(`Téléchargement ${i + 1}/${aFaire.length} — ${fmtDateHeure(new Date(f.id * 1000))}…`);
        progres(fait, total, { titre, debut });
        try {
          const brut = await etat.session.telecharger(f, { progres: n => progres(fait + n, total, { titre, debut }) });
          etat.bruts.set(f.id, brut);
          const dec = parseOcean(brut.sbem, { logId: f.id });
          const dive = oceanToDive(dec);
          journalBle.log(`  décodé : ${dive.dureeMin} min, ${dive.profMax} m, `
            + `${dive.pressionDepart ?? '?'}→${dive.pressionFin ?? '?'} bar, ${dive.samples.length} points, `
            + `gaz ${JSON.stringify(dec.gaz)}, GF ${JSON.stringify(dec.gf)}, heure ${dec.heureDepuisGps ? 'GPS' : 'id'}`);
          etat.decodes.set(f.id, { dive, dec });
          if (!etat.rangement.has(f.id)) {
            etat.rangement.set(f.id, suggererRangement({ genre: dec.genre, profMax: dive.profMax, date: dive.start, lieu: dive.lieu, samples: dive.samples }, seances));
          }
          journalBle.log(`  activité Suunto n°${dec.sport ?? '?'} (${dec.genre}) → rangée comme « ${etat.rangement.get(f.id)} »`);
        } catch (e) {
          if (e instanceof Annule) throw e;
          journalBle.log(`✗ plongée ${f.id} : ${e.message}`);
          etat.decodes.set(f.id, { erreur: e.message });
        }
        fait += f.taille || 0;
        rendre();
      }
      const ok = aFaire.filter(f => etat.decodes.get(f.id)?.dive).length;
      dire(ok === aFaire.length
        ? `${ok} plongée(s) téléchargée(s). Vérifie l’aperçu puis ajoute-les au carnet.`
        : `${ok}/${aFaire.length} plongée(s) téléchargée(s) — voir le journal pour les autres.`, ok < aFaire.length);
    } catch (e) {
      erreur(e, 'Téléchargement interrompu');
    } finally {
      progres(0, 0);
      etat.occupe = false;
      rendre();
    }
  }

  async function ajouter() {
    if (!diverId) { toast('Crée d’abord ton profil de plongeur', true); return; }
    const prets = etat.fiches
      .filter(f => etat.coches.get(f.id) && etat.decodes.get(f.id)?.dive && aTraiter(f))
      .sort((a, b) => a.id - b.id);
    if (!prets.length) return;
    etat.occupe = true;
    rendre();
    const creees = [], rangees = [], completees = [];
    try {
      for (const f of prets) {
        const existante = aCompleter(f);
        if (existante) {
          const { dive: decode } = etat.decodes.get(f.id);
          const { champs, libelles } = completerDepuisMontre(existante, decode);
          const cles = [...new Set([...(existante.suuntoKeys || []), CLE_OCEAN(f.id)])];
          const maj = { ...existante, ...champs, suuntoKeys: cles };
          if (champs.samples) {
            const p = paliersDuProfil(champs.samples);
            if (p && (existante.paliersEstimes || (!existante.palier3 && !existante.palier6 && !existante.palier9))) Object.assign(maj, p, { paliersEstimes: false });
          }
          const sauvee = await store.saveDive(maj);
          Object.assign(existante, sauvee || maj);
          completees.push(existante);
          journalBle.log(`↻ n°${existante.numero} complétée : ${libelles.join(', ') || 'lien avec la montre'}`);
          continue;
        }
        const { dive: decode, dec } = etat.decodes.get(f.id);
        const suunto = {
            cle: CLE_OCEAN(f.id),
            source: 'bluetooth',
            appareil: etat.info?.modele || 'Suunto Ocean',
            serie: etat.info?.serie || null,
            logiciel: etat.info?.logiciel || null,
            lieLe: new Date().toISOString(),
            genre: decode.genre,
            gf: dec.gf ? `${dec.gf.bas}/${dec.gf.haut}` : null,
            gaz: dec.gaz,
            eau: dec.eau,
            sport: dec.sport,
        };
        const type = etat.rangement.get(f.id) || 'plongee';
        if (type !== 'plongee') {
          const seance = await store.saveSeance(seanceDepuisImport(diverId, type, decode, { cles: [CLE_OCEAN(f.id)], suunto }));
          seances.push(seance);
          rangees.push(seance);
          journalBle.log(`+ séance « ${type} » ajoutée (${CLE_OCEAN(f.id)})`);
          continue;
        }
        const dive = await creerPlongeeImportee(diverId, decode, { cles: [CLE_OCEAN(f.id)], suunto });
        dives.push(dive);
        creees.push(dive);
        journalBle.log(`+ plongée n°${dive.numero} ajoutée au carnet (${CLE_OCEAN(f.id)})`);
      }
      // Le lieu, d'après le GPS de la montre, quand le carnet ne le
      // connaissait pas encore (8 s au plus : sinon, à la prochaine ouverture).
      for (const dive of creees.filter(d => !d.lieuNom && d.lat != null).slice(0, 3)) {
        dire('Recherche du nom du lieu…');
        const { lieuOsm } = await import('../lieu-auto.js');
        const patch = await Promise.race([lieuOsm(dive.lat, dive.lng), new Promise(r => setTimeout(() => r(null), 8000))]).catch(() => null);
        if (patch) {
          Object.assign(dive, patch);
          await store.saveDive(dive).catch(() => {});
          journalBle.log(`  lieu : ${patch.lieuNom}${patch.site ? ` — ${patch.site}` : ''} (d’après le GPS)`);
        }
      }
      toast([creees.length ? `${creees.length} plongée${creees.length > 1 ? 's' : ''} au carnet` : null,
             completees.length ? `${completees.length} complétée${completees.length > 1 ? 's' : ''}` : null,
             rangees.length ? `${rangees.length} séance${rangees.length > 1 ? 's' : ''}` : null].filter(Boolean).join(' · '));
      await deconnecter();
      navigate(creees.length === 1 && !rangees.length && !completees.length ? `dive/${creees[0].id}/edit`
        : completees.length === 1 && !creees.length && !rangees.length ? `dive/${completees[0].id}`
        : creees.length || completees.length ? 'dives' : 'seances');
    } catch (e) {
      erreur(e, 'Ajout au carnet');
    } finally {
      etat.occupe = false;
      if (wrap.isConnected) rendre();
    }
  }

  // ---------- plongée ou séance ----------

  function selecteurRangement(id) {
    const seg = el('div.seg', { style: { marginTop: '10px' } });
    [['plongee', '🌊 Plongée'], ...TYPES_SEANCE.map(t => [t.id, `${t.icone} ${t.label}`])]
      .forEach(([v, label]) => {
        const b = el('button', { type: 'button', text: label, disabled: etat.occupe });
        if ((etat.rangement.get(id) || 'plongee') === v) b.classList.add('on');
        b.onclick = () => { etat.rangement.set(id, v); rendre(); };
        seg.append(b);
      });
    return el('div', {}, el('div.hint', { style: { marginTop: '8px' }, text: 'Ranger comme :' }), seg);
  }

  function libelleAjout(prets) {
    const c = prets.filter(f => aCompleter(f)).length;
    const neuves = prets.filter(f => !aCompleter(f));
    const n = neuves.filter(f => (etat.rangement.get(f.id) || 'plongee') === 'plongee').length;
    const s = neuves.length - n;
    const ajout = [n ? `${n} plongée${n > 1 ? 's' : ''} au carnet` : null, s ? `${s} séance${s > 1 ? 's' : ''}` : null]
      .filter(Boolean).join(' + ');
    return [ajout ? `Ajouter ${ajout}` : null, c ? `${ajout ? 'compléter' : 'Compléter'} ${c} plongée${c > 1 ? 's' : ''}` : null]
      .filter(Boolean).join(' et ');
  }

  // ---------- rendu ----------

  function rendre() {
    btnConnexion.disabled = !dispo.ok || etat.occupe;
    btnAutre.disabled = !dispo.ok || etat.occupe;
    btnStop.style.display = etat.lien || etat.occupe ? '' : 'none';
    btnStop.textContent = etat.occupe ? '⏹ Arrêter' : '⏹ Se déconnecter';

    zoneMontre.innerHTML = '';
    if (etat.info && etat.lien) {
      zoneMontre.append(el('div.card', {},
        el('div', { style: { fontWeight: '600' }, text: etat.info.modele || etat.lien.nom }),
        el('div.hint', { text: [etat.info.serie && `n° ${etat.info.serie}`, etat.info.logiciel && `logiciel ${etat.info.logiciel}`,
          etat.lien.moteur === 'capacitor' ? 'APK' : 'Web Bluetooth'].filter(Boolean).join(' · ') })));
    }

    liste.innerHTML = '';
    actions.innerHTML = '';
    if (!etat.fiches) return;
    if (!etat.fiches.length) { liste.append(el('div.hint', { text: 'Aucune plongée dans la montre.' })); return; }

    // Les plus récentes en haut.
    for (const f of [...etat.fiches].reverse()) {
      const date = new Date(f.id * 1000);
      const completable = aCompleter(f);
      const deja = completable ? null : plongeeCorrespondante(f, connues());
      const d = etat.decodes.get(f.id);
      const coche = el('input', { type: 'checkbox', disabled: etat.occupe || !!deja });
      coche.style.cssText = 'width:20px;height:20px;accent-color:var(--accent);flex:0 0 auto';
      coche.checked = !!etat.coches.get(f.id) && !deja;
      coche.onchange = () => { etat.coches.set(f.id, coche.checked); rendre(); };

      const details = d?.dive
        ? [d.dive.dureeMin ? fmtDuration(d.dive.dureeMin) : null,
           d.dive.profMax ? `${d.dive.profMax} m` : null,
           d.dive.tempFond != null ? `${Math.round(d.dive.tempFond)} °C` : null,
           d.dive.pressionDepart ? `${d.dive.pressionDepart} → ${d.dive.pressionFin} bar` : null].filter(Boolean).join(' · ')
        : `${ko(f.taille)} à télécharger (≈ ${Math.max(1, Math.round(f.taille / 8000 / 60))} min)`;

      liste.append(el('div.card', { style: deja ? { opacity: '.6' } : {} },
        el('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } },
          coche,
          el('div', { style: { flex: 1, minWidth: 0 } },
            el('div', { style: { fontWeight: '600' }, text: fmtDateHeure(date) }),
            el('div', { style: { color: 'var(--text-dim)', fontSize: '13px' }, text: details }),
            deja ? el('div', { style: { color: 'var(--text-mute)', fontSize: '12px' },
              text: deja.dive.seance ? `Dans les séances : ${typeSeance(deja.dive.type).label}`
                : `Dans le carnet : n°${deja.dive.numero ?? '?'} (${deja.comment})` }) : null,
            completable ? el('div', { style: { color: 'var(--accent)', fontSize: '12px' },
              text: `↻ Dans le carnet (n°${completable.numero ?? '?'}) sans ${bilanDonnees(completable, { liste: null }).manque.join(', ')} : la montre peut compléter` }) : null,
            d?.erreur ? el('div', { style: { color: 'var(--danger, #e5534b)', fontSize: '12px' }, text: `Échec : ${d.erreur}` }) : null,
          )),
        d?.dive && !deja && !completable ? selecteurRangement(f.id) : null,
        d?.dive?.samples?.length ? el('div', { style: { marginTop: '10px' } },
          tuilesPlongee(apercuDive(d.dive), null),
          el('div', { style: { marginTop: '10px' } }, graphiquePlongee(d.dive.samples, { dive: apercuDive(d.dive) }))) : null,
      ));
    }

    const aTelecharger = etat.fiches.filter(f => etat.coches.get(f.id) && !etat.decodes.get(f.id)?.dive && aTraiter(f));
    const prets = etat.fiches.filter(f => etat.coches.get(f.id) && etat.decodes.get(f.id)?.dive && aTraiter(f));
    actions.append(el('div.btn-row', {},
      el('button.btn.block', {
        type: 'button', disabled: etat.occupe || !aTelecharger.length || !etat.session,
        text: aTelecharger.length ? `⬇ Télécharger ${aTelecharger.length} plongée(s)` : 'Coche les plongées à télécharger',
        onclick: telecharger,
      })),
      el('div.btn-row', {},
        el('button.btn.primary.block', {
          type: 'button', disabled: etat.occupe || !prets.length,
          text: prets.length ? `✓ ${libelleAjout(prets)}` : 'Rien à ajouter pour l’instant',
          onclick: ajouter,
        })));
  }

  // ---------- journal ----------

  const pre = el('pre', { style: {
    maxHeight: '320px', overflow: 'auto', fontSize: '11px', lineHeight: '1.45', whiteSpace: 'pre-wrap',
    wordBreak: 'break-all', background: 'var(--bg-2, rgba(0,0,0,.25))', padding: '8px', borderRadius: '8px',
  } });
  const majJournal = () => {
    pre.textContent = journalBle.dernieres(400).join('\n') || 'Rien pour l’instant.';
    pre.scrollTop = pre.scrollHeight;
  };
  majJournal();
  let enAttente = false;
  const desabonner = journalBle.abonner(() => {
    if (enAttente) return;
    enAttente = true;
    setTimeout(() => { enAttente = false; majJournal(); }, 250);
  });

  gauche.append(el('details.card', { style: { marginTop: '18px' } },
    el('summary', { style: { fontWeight: '600', cursor: 'pointer' }, text: '🛠 Journal Bluetooth (diagnostic)' }),
    el('div.hint', { style: { margin: '8px 0' },
      text: 'Tout ce qui s’est échangé avec la montre. En cas de souci, copie-le et envoie-le : '
          + 'il ne contient ni ton carnet, ni tes identifiants GitHub.' }),
    pre,
    el('div.btn-row', { style: { marginTop: '8px' } },
      el('button.btn', { type: 'button', text: '📋 Copier le journal',
        onclick: async () => toast(await copier(journalBle.texte()) ? 'Journal copié' : 'Copie impossible : utilise « Enregistrer »', false) }),
      el('button.btn', { type: 'button', text: '💾 Enregistrer',
        onclick: () => enregistrerFichier(journalBle.texte(), `journal-bluetooth-${Date.now()}.txt`) }),
      el('button.btn', { type: 'button', text: '📦 Données brutes',
        title: 'Les octets reçus de la montre, pour rejouer le décodage',
        onclick: () => {
          if (!etat.bruts.size) { toast('Aucune plongée téléchargée', true); return; }
          const json = JSON.stringify({
            format: 'suunto-ocean-brut-1',
            montre: etat.info ? { modele: etat.info.modele, serie: etat.info.serie, logiciel: etat.info.logiciel, info: base64(etat.info.brut) } : null,
            fiches: etat.fiches,
            plongees: [...etat.bruts].map(([id, b]) => ({ id, compresse: base64(b.compresse), resume: base64(b.resume) })),
          });
          enregistrerFichier(json, `suunto-ocean-brut-${Date.now()}.json`, 'application/json');
        } }),
    ),
  ));

  // Quitter l'écran arrête l'import et coupe la connexion. Le journal et
  // les plongées déjà téléchargées, eux, restent pour le retour.
  const surNavigation = () => setTimeout(() => {
    if (wrap.isConnected) return;
    window.removeEventListener('hashchange', surNavigation);
    desabonner();
    deconnecter();
  }, 400);
  window.addEventListener('hashchange', surNavigation);

  rendre();
  return { title: 'Montre Bluetooth', node: wrap, back: true };
}
