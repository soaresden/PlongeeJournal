// ============================================================
//  Récupérer depuis le compte Suunto (tout l'historique)
//
//  1. « Chercher » : la liste des activités du compte. Pour chaque
//     type d'activité jamais vu, un seul .fit est téléchargé pour
//     savoir ce que c'est (plongée, apnée, natation, autre sport) ;
//     c'est retenu dans la liaison, la course à pied n'est donc
//     examinée qu'une fois.
//  2. « Analyser » : le .fit de chaque plongée / séance pas encore
//     liée, comparé au carnet.
//  3. « Appliquer » : ajouts, compléments, et liens — rien n'est
//     écrit avant.
// ============================================================

import { el, toast, fmtDuration, confirmBox } from '../lib.js';
import { store, TYPES_SEANCE, typeSeance } from '../store.js';
import { navigate } from '../router.js';
import { fitToDive, profileSvg } from '../fit.js';
import { creerPlongeeImportee } from './suunto.js';
import { seanceDepuisImport, commePlongees } from '../seances.js';
import {
  chargerLiaison, sauverLiaison, estRelie, apiAccessible, ClientSuunto,
} from '../suunto-cloud.js';
import {
  CLE_SUUNTO, aExaminer, genreConnu, genreActivite, trouverDansCarnet, proposer, metaSuunto, numerotationChronologique,
  decDepuisListe,
} from '../suunto-aligner.js';

const GENRES = {
  plongee: '🌊 Plongée', apnee: '🐬 Apnée', natation: '🏊 Natation', snorkeling: '🐠 Snorkeling', sport: 'Autre sport',
};

function fmtDateHeure(ms) {
  if (!Number.isFinite(ms)) return 'Date inconnue';
  return new Date(ms).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export async function suuntoCloudView() {
  const wrap = el('div');
  const diverId = await store.getActiveDiverId();
  const dives = diverId ? await store.listDives(diverId) : [];
  const seances = diverId ? await store.listSeances(diverId) : [];
  const connues = () => [...dives, ...commePlongees(seances)];

  let { liaison, sha } = await chargerLiaison();

  // ---------- journal (diagnostic) ----------
  const lignes = [];
  const pre = el('pre', { style: {
    maxHeight: '260px', overflow: 'auto', fontSize: '11px', lineHeight: '1.45', whiteSpace: 'pre-wrap',
    wordBreak: 'break-all', background: 'var(--bg-2, rgba(0,0,0,.25))', padding: '8px', borderRadius: '8px',
  } });
  const log = m => {
    lignes.push(`${new Date().toLocaleTimeString('fr-FR')}  ${m}`);
    pre.textContent = lignes.slice(-300).join('\n');
    pre.scrollTop = pre.scrollHeight;
  };

  const enregistrer = async (l, message = 'Suunto : jeton renouvelé') => {
    liaison = l;
    try { ({ liaison, sha } = await sauverLiaison(l, { sha, message })); }
    catch (e) { log(`liaison gardée sur l’appareil (GitHub : ${e.message})`); }
  };

  // ---------- en-tête ----------
  wrap.append(el('div.card', {},
    el('div', { style: { fontWeight: '650', marginBottom: '4px' }, text: '☁️ Ton compte Suunto' }),
    el('div.hint', { text: estRelie(liaison)
      ? `Compte ${liaison.compte || 'Suunto'} relié${liaison.derniereRecup ? ` · dernière récupération ${new Date(liaison.derniereRecup).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}.`
      : 'Compte pas encore relié.' }),
    el('div.hint', { text: 'Tout l’historique de l’appli Suunto : chaque plongée est rapprochée du carnet. '
      + 'Ce qui y est déjà est seulement complété (profil, bloc, température…) ; ce que tu as saisi n’est jamais écrasé.' }),
  ));

  if (!estRelie(liaison)) {
    wrap.append(el('div.card', {},
      el('div.hint', { style: { marginTop: 0 }, text: 'Relie d’abord ton compte : Réglages → « Compte Suunto ». '
        + 'Fais-le depuis le site, sur le PC ; le téléphone récupère la liaison tout seul.' }),
      el('button.btn.primary.block', { type: 'button', style: { marginTop: '10px' }, text: 'Aller aux réglages',
        onclick: () => navigate('reglages') })));
    return { title: 'Compte Suunto', node: wrap, back: true };
  }
  if (!apiAccessible()) {
    wrap.append(el('div.card', {},
      el('div.hint', { style: { marginTop: 0 }, text: 'La récupération se fait dans l’appli Android : le serveur '
        + 'des activités de Suunto refuse les pages web. Ouvre le carnet dans l’APK, même écran.' })));
    return { title: 'Compte Suunto', node: wrap, back: true };
  }

  const etat = {
    activites: null,
    decodes: new Map(),        // cle → { dec } | { erreur }
    coches: new Map(),
    rangement: new Map(),
    renumeroter: false,
    completer: false,          // aussi les activités déjà au carnet (champs vides seulement)
    sansFit: null,             // raison, quand Suunto refuse les .fit
    occupe: false,
    arret: false,
  };
  const client = new ClientSuunto(liaison, { surLiaison: l => enregistrer(l), journal: log });

  const statut = el('div.hint', { style: { margin: '10px 0 6px', minHeight: '1.4em' } });
  const barre = el('progress', { max: 1, value: 0, style: { width: '100%', display: 'none' } });
  const resume = el('div');
  const liste = el('div');
  const actions = el('div');
  const dire = (texte, erreur = false) => {
    statut.textContent = texte;
    statut.style.color = erreur ? 'var(--danger, #e5534b)' : '';
  };
  const progres = (v, max) => {
    barre.style.display = max ? '' : 'none';
    if (max) { barre.max = max; barre.value = Math.min(v, max); }
  };
  const btnChercher = el('button.btn.primary.block', { type: 'button', text: '🔎 Chercher mes activités', onclick: () => chercher() });
  const btnStop = el('button.btn.block', { type: 'button', style: { marginTop: '8px', display: 'none' },
    text: '⏹ Arrêter', onclick: () => { etat.arret = true; } });
  wrap.append(btnChercher, btnStop, statut, barre, resume, liste, actions);

  wrap.append(el('details.card', { style: { marginTop: '18px' } },
    el('summary', { style: { fontWeight: '600', cursor: 'pointer' }, text: '🛠 Journal Suunto (diagnostic)' }),
    el('div.hint', { style: { margin: '8px 0' }, text: 'Les échanges avec Suunto, sans tes clés ni tes jetons. '
      + 'En cas de souci, copie-le et envoie-le.' }),
    pre,
    el('button.btn', { type: 'button', style: { marginTop: '8px' }, text: '📋 Copier le journal',
      onclick: async () => {
        try { await navigator.clipboard.writeText(lignes.join('\n')); toast('Journal copié'); }
        catch { toast('Copie impossible', true); }
      } })));

  const erreur = (e, contexte) => {
    log(`✗ ${contexte} : ${e.message}`);
    dire(`${contexte} : ${e.message}`, true);
    if (e.reconnecter) toast('Reconnecte ton compte Suunto depuis les réglages (sur le site)', true);
  };

  async function fitDe(act) {
    const deja = etat.decodes.get(act.cle);
    if (deja) return deja;
    let r;
    if (etat.sansFit) {
      const dec = decDepuisListe(act);
      r = dec ? { dec } : { erreur: 'date inconnue' };
    } else {
      try {
        const dec = fitToDive(await client.fit(act.cle));
        r = dec ? { dec } : { erreur: 'aucune donnée dans le .fit' };
      } catch (e) {
        if (e.status === 429 || e.reconnecter) throw e;
        if (!e.systeme) { r = { erreur: e.message }; }
        else {
          // Suunto refuse les .fit pour tout le compte : on se contente de
          // ce que dit la liste (date, heure, durée, profondeur).
          etat.sansFit = e.message;
          log(`.fit refusé : fiches créées depuis la liste seulement (${e.message})`);
          const dec = decDepuisListe(act);
          r = dec ? { dec } : { erreur: 'date inconnue' };
        }
      }
    }
    etat.decodes.set(act.cle, r);
    return r;
  }

  // ---------- 1. chercher ----------
  async function chercher() {
    if (etat.occupe) return;
    etat.occupe = true; etat.arret = false;
    rendre();
    try {
      dire('Liste des activités…');
      etat.activites = await client.activites({ progres: n => dire(`${n} activité(s) trouvée(s)…`) });
      log(`${etat.activites.length} activité(s) au total`);

      // Types jamais vus : un .fit chacun pour savoir ce que c'est.
      const parType = new Map();
      for (const a of etat.activites) {
        if (a.activite == null || genreConnu(liaison.types, a.activite)) continue;
        const k = String(a.activite);
        if (!parType.has(k) || (a.debut || 0) > (parType.get(k).debut || 0)) parType.set(k, a);
      }
      const types = { ...(liaison.types || {}) };
      let i = 0;
      for (const [k, a] of parType) {
        if (etat.arret) break;
        dire(`Type d’activité ${++i}/${parType.size}…`);
        progres(i, parType.size);
        const r = await fitDe(a);
        if (r.dec?.genre) {
          types[k] = r.dec.genre;
          log(`activité Suunto n°${k} = ${GENRES[r.dec.genre] || r.dec.genre}`);
        }
      }
      progres(0, 0);
      await enregistrer({ ...client.liaison, types, derniereRecup: new Date().toISOString() }, 'Suunto : récupération');
      client.liaison = liaison;

      for (const a of candidats()) etat.coches.set(a.cle, true);
      dire(candidats().length
        ? `${candidats().length} activité(s) manquent au carnet. Décoche ce que tu ne veux pas, puis « Analyser ».`
        : 'Rien ne manque au carnet. ✓');
    } catch (e) {
      erreur(e, 'Recherche interrompue');
    } finally {
      progres(0, 0);
      etat.occupe = false;
      rendre();
    }
  }

  /**
   * Les plongées / séances du compte qui MANQUENT au carnet. Celles qui y
   * sont déjà (par la clé, le .fit, le Bluetooth ou la date et l'heure)
   * ne sont pas touchées, sauf si on demande à les compléter.
   */
  function candidats() {
    if (!etat.activites) return [];
    return etat.activites.filter(a => {
      if (!aExaminer(a, liaison.types)) return false;
      // Sans .fit, un type inconnu ne peut pas être reconnu : on le laisse.
      if (etat.sansFit && !genreConnu(liaison.types, a.activite)) return false;
      const d = etat.decodes.get(a.cle);
      if (d?.dec && genreActivite(a, d.dec) === 'sport') return false;
      const t = trouverDansCarnet(a, connues());
      if (!t) return true;
      return etat.completer && !t.liee;
    });
  }

  // ---------- 2. analyser ----------
  async function analyser() {
    const aFaire = candidats().filter(a => etat.coches.get(a.cle) && !etat.decodes.get(a.cle));
    if (!aFaire.length || etat.occupe) return;
    etat.occupe = true; etat.arret = false;
    rendre();
    try {
      for (const [i, a] of aFaire.entries()) {
        if (etat.arret) { dire('Arrêté. Ce qui est analysé est gardé.'); break; }
        dire(`Analyse ${i + 1}/${aFaire.length} — ${fmtDateHeure(a.debut)}…`);
        progres(i, aFaire.length);
        const r = await fitDe(a);
        if (r.erreur) log(`✗ ${a.cle} : ${r.erreur}`);
        if (i % 5 === 4) rendre();
      }
      if (!etat.arret) dire('Analyse terminée. Vérifie la liste puis « Appliquer ».');
    } catch (e) {
      erreur(e, 'Analyse interrompue');
    } finally {
      progres(0, 0);
      etat.occupe = false;
      rendre();
    }
  }

  function propositions() {
    return candidats()
      .filter(a => etat.coches.get(a.cle) && etat.decodes.get(a.cle)?.dec)
      .map(a => {
        const dec = etat.decodes.get(a.cle).dec;
        const p = proposer(a, dec, connues(), seances);
        if (p.action === 'ajouter' && !etat.rangement.has(a.cle)) etat.rangement.set(a.cle, p.rangement);
        return { act: a, dec, p };
      })
      .filter(x => x.p.action === 'ajouter' || x.p.action === 'completer');
  }

  // ---------- 3. appliquer ----------
  async function appliquer() {
    if (!diverId) { toast('Crée d’abord ton profil de plongeur', true); return; }
    const aAppliquer = propositions().sort((a, b) => (a.act.debut || 0) - (b.act.debut || 0));
    if (!aAppliquer.length || etat.occupe) return;
    etat.occupe = true;
    rendre();
    let ajoutees = 0, rangees = 0, completees = 0;
    try {
      for (const { act, dec, p } of aAppliquer) {
        const cle = CLE_SUUNTO(act.cle);
        if (p.action === 'completer') {
          if (p.entree.seance) {
            const s = seances.find(x => x.id === p.entree.id);
            if (!s) continue;
            Object.assign(s, p.champs, { suuntoKeys: [...new Set([...(s.suuntoKeys || []), cle])] });
            await store.saveSeance(s);
          } else {
            const d = dives.find(x => x.id === p.entree.id);
            if (!d) continue;
            Object.assign(d, p.champs, { suuntoKeys: [...new Set([...(d.suuntoKeys || []), cle])] });
            await store.saveDive(d);
          }
          completees++;
          log(`↻ complété (${p.libelles.join(', ') || 'lien Suunto'}) : ${fmtDateHeure(act.debut)}`);
          continue;
        }
        const type = etat.rangement.get(act.cle) || p.rangement || 'plongee';
        if (type !== 'plongee') {
          const nouvelle = seanceDepuisImport(diverId, type, dec, { cles: [cle], suunto: metaSuunto(act, dec) });
          nouvelle.source = 'suunto-cloud';
          const s = await store.saveSeance(nouvelle);
          seances.push(s);
          rangees++;
          log(`+ séance « ${type} » : ${fmtDateHeure(act.debut)}`);
          continue;
        }
        const d = await creerPlongeeImportee(diverId, dec, { cles: [cle], suunto: metaSuunto(act, dec) });
        dives.push(d);
        ajoutees++;
        log(`+ plongée n°${d.numero} : ${fmtDateHeure(act.debut)}`);
      }
      let renum = 0;
      if (etat.renumeroter && ajoutees) {
        renum = await store.renumeroter(diverId, numerotationChronologique(dives));
        log(`numéros remis dans l’ordre des dates (${renum} changé(s))`);
      }
      toast([ajoutees && `${ajoutees} plongée${ajoutees > 1 ? 's' : ''} ajoutée${ajoutees > 1 ? 's' : ''}`,
             rangees && `${rangees} séance${rangees > 1 ? 's' : ''}`,
             completees && `${completees} complétée${completees > 1 ? 's' : ''}`].filter(Boolean).join(' · ') || 'Rien à faire');
      navigate(ajoutees || completees ? 'dives' : 'seances');
    } catch (e) {
      erreur(e, 'Ajout au carnet');
    } finally {
      etat.occupe = false;
      if (wrap.isConnected) rendre();
    }
  }

  // ---------- rendu ----------
  function selecteurRangement(cle) {
    const seg = el('div.seg', { style: { marginTop: '10px' } });
    [['plongee', '🌊 Plongée'], ...TYPES_SEANCE.map(t => [t.id, `${t.icone} ${t.label}`])].forEach(([v, label]) => {
      const b = el('button', { type: 'button', text: label, disabled: etat.occupe });
      if ((etat.rangement.get(cle) || 'plongee') === v) b.classList.add('on');
      b.onclick = () => { etat.rangement.set(cle, v); rendre(); };
      seg.append(b);
    });
    return seg;
  }

  function rendre() {
    btnChercher.disabled = etat.occupe;
    btnChercher.textContent = etat.activites ? '🔄 Chercher à nouveau' : '🔎 Chercher mes activités';
    btnStop.style.display = etat.occupe ? '' : 'none';
    resume.innerHTML = ''; liste.innerHTML = ''; actions.innerHTML = '';
    if (!etat.activites) return;

    const cands = candidats();
    const utiles = etat.activites.filter(a => aExaminer(a, liaison.types));
    const presentes = utiles.filter(a => trouverDansCarnet(a, connues())).length;
    const manquent = utiles.filter(a => !trouverDansCarnet(a, connues())
      && !(etat.sansFit && !genreConnu(liaison.types, a.activite))
      && !(etat.decodes.get(a.cle)?.dec && genreActivite(a, etat.decodes.get(a.cle).dec) === 'sport')).length;
    const autres = etat.activites.length - utiles.length;
    const completer = el('input', { type: 'checkbox', disabled: etat.occupe });
    completer.checked = etat.completer;
    completer.style.cssText = 'width:18px;height:18px;accent-color:var(--accent);flex:0 0 auto;margin-top:2px';
    completer.onchange = () => {
      etat.completer = completer.checked;
      if (etat.completer) for (const a of candidats()) if (!etat.coches.has(a.cle)) etat.coches.set(a.cle, true);
      rendre();
    };
    resume.append(...[el('div.card', {},
      el('div', { style: { fontWeight: '600' }, text: `${etat.activites.length} activité(s) sur ton compte` }),
      el('div.hint', { text: [`${manquent} manque(nt) au carnet`, `${presentes} déjà au carnet, laissée(s) telle(s) quelle(s)`,
        autres ? `${autres} autre(s) sport(s) ignoré(s)` : null].filter(Boolean).join(' · ') }),
      el('label', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start', marginTop: '10px', cursor: 'pointer' } },
        completer, el('div', {},
          el('div', { style: { fontSize: '14px', fontWeight: '600' }, text: 'Compléter aussi celles déjà au carnet' }),
          el('div.hint', { style: { marginTop: '2px' }, text: 'Profil, bloc, température… seulement dans les champs vides : '
            + 'rien de ce que tu as saisi n’est remplacé.' })))),
      etat.sansFit ? el('div.card', { style: { borderColor: 'var(--warn, #d29922)' } },
        el('div', { style: { fontWeight: '600' }, text: 'Fichiers .fit refusés par Suunto' }),
        el('div.hint', { text: 'Les fiches sont créées avec ce que donne la liste : date, heure, durée, profondeur. '
          + 'Sans profil ni bloc ; tu pourras les compléter plus tard.' })) : null].filter(Boolean));

    const props = new Map(propositions().map(x => [x.act.cle, x]));
    for (const a of [...cands].reverse()) {
      const d = etat.decodes.get(a.cle);
      const x = props.get(a.cle);
      const coche = el('input', { type: 'checkbox', disabled: etat.occupe });
      coche.style.cssText = 'width:20px;height:20px;accent-color:var(--accent);flex:0 0 auto';
      coche.checked = !!etat.coches.get(a.cle);
      coche.onchange = () => { etat.coches.set(a.cle, coche.checked); rendre(); };
      const dec = d?.dec;
      const details = dec
        ? [GENRES[genreActivite(a, dec)] || null, dec.dureeMin ? fmtDuration(dec.dureeMin) : null, dec.profMax ? `${dec.profMax} m` : null,
           dec.tempFond != null ? `${Math.round(dec.tempFond)} °C` : null,
           dec.pressionDepart ? `${dec.pressionDepart} → ${dec.pressionFin ?? '?'} bar` : null].filter(Boolean).join(' · ')
        : [GENRES[genreConnu(liaison.types, a.activite)] || `activité n°${a.activite ?? '?'}`,
           a.dureeS ? fmtDuration(Math.round(a.dureeS / 60)) : null, a.profMax ? `${a.profMax} m` : null].filter(Boolean).join(' · ');
      let quoi = null;
      if (x?.p.action === 'completer') {
        const cible = x.p.entree.seance ? `séance ${typeSeance(x.p.entree.type).label.toLowerCase()}` : `plongée n°${x.p.entree.numero ?? '?'}`;
        quoi = el('div', { style: { fontSize: '12.5px', color: 'var(--text-mute)' },
          text: `↻ ${cible} (${x.p.comment}) : ${x.p.libelles.length ? `ajoute ${x.p.libelles.join(', ')}` : 'lien Suunto seulement'}` });
      } else if (dec && !x) {
        const p = proposer(a, dec, connues(), seances);
        quoi = el('div', { style: { fontSize: '12.5px', color: 'var(--text-mute)' },
          text: p.action === 'rien' ? `Rien à compléter (${p.comment})` : p.action === 'ignorer' ? `Ignorée : ${p.comment}` : '' });
      }
      liste.append(el('div.card', {},
        el('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } },
          coche,
          el('div', { style: { flex: 1, minWidth: 0 } },
            el('div', { style: { fontWeight: '600' }, text: fmtDateHeure(dec?.start ? +dec.start : a.debut) }),
            el('div', { style: { color: 'var(--text-dim)', fontSize: '13px' }, text: details }),
            quoi,
            d?.erreur ? el('div', { style: { color: 'var(--danger, #e5534b)', fontSize: '12px' }, text: `Échec : ${d.erreur}` }) : null)),
        x?.p.action === 'ajouter' ? selecteurRangement(a.cle) : null,
        x && dec?.samples?.length ? el('div', { style: { marginTop: '10px' }, html: profileSvg(dec.samples, { height: 110 }) }) : null));
    }

    const aAnalyser = cands.filter(a => etat.coches.get(a.cle) && !etat.decodes.get(a.cle)).length;
    const liste2 = [...props.values()];
    const nPlong = liste2.filter(x => x.p.action === 'ajouter' && (etat.rangement.get(x.act.cle) || 'plongee') === 'plongee').length;
    const nSeance = liste2.filter(x => x.p.action === 'ajouter').length - nPlong;
    const nComp = liste2.filter(x => x.p.action === 'completer').length;
    const libelle = [nPlong && `${nPlong} plongée${nPlong > 1 ? 's' : ''}`, nSeance && `${nSeance} séance${nSeance > 1 ? 's' : ''}`,
      nComp && `${nComp} à compléter`].filter(Boolean).join(' + ');

    // Des plongées plus anciennes que la dernière du carnet ? On propose
    // de remettre les numéros dans l'ordre des dates.
    const derniere = dives.reduce((m, d) => (d.date > m ? d.date : m), '');
    const anciennes = liste2.some(x => x.p.action === 'ajouter' && (etat.rangement.get(x.act.cle) || 'plongee') === 'plongee'
      && x.dec.start && x.dec.start.toISOString().slice(0, 10) < derniere);
    const renum = el('input', { type: 'checkbox', disabled: etat.occupe });
    renum.checked = etat.renumeroter;
    renum.onchange = () => { etat.renumeroter = renum.checked; };

    actions.append(
      el('div.btn-row', {}, el('button.btn.block', {
        type: 'button', disabled: etat.occupe || !aAnalyser,
        text: aAnalyser ? `⬇ Analyser ${aAnalyser} activité(s)` : 'Rien à analyser', onclick: analyser })),
      anciennes ? el('label.card', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' } },
        renum, el('div', {},
          el('div', { style: { fontWeight: '600' }, text: 'Renuméroter le carnet dans l’ordre des dates' }),
          el('div.hint', { text: 'Des plongées plus anciennes que ta dernière vont arriver. Coché : les numéros suivent les dates '
            + '(en gardant ton premier numéro). Décoché : elles prennent les numéros suivants.' }))) : null,
      el('div.btn-row', {}, el('button.btn.primary.block', {
        type: 'button', disabled: etat.occupe || !liste2.length,
        text: liste2.length ? `✓ Appliquer : ${libelle}` : 'Rien à appliquer pour l’instant',
        onclick: async () => {
          if (etat.renumeroter && !(await confirmBox('Les numéros de tout le carnet vont suivre l’ordre des dates. Continuer ?'))) return;
          appliquer();
        } })));
  }

  rendre();
  return { title: 'Compte Suunto', node: wrap, back: true };
}
