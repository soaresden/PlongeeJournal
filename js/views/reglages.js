// ============================================================
//  Réglages
//
//  Il n'y a plus rien à configurer pour que le carnet marche :
//  cet écran sert à comprendre où en sont les données, et à
//  exporter ce qui attend d'être rapatrié sur le PC.
// ============================================================

import { el, toast, confirmBox, fmtDate } from '../lib.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { modeActuel, enAttenteDExport, oublierAttente, rafraichir } from '../store-fichier.js';
import { telechargerLot } from '../export-plongee.js';
import { settings } from '../settings.js';

const EXPLICATIONS = {
  serveur: {
    titre: 'Relié au carnet du PC',
    icone: '✓',
    classe: 'ok',
    texte: 'Tout ce que tu saisis est écrit directement dans '
         + 'donnees/carnet.json. Rien à faire de plus.',
  },
  lecture: {
    titre: 'Lecture seule',
    icone: '👁',
    classe: 'lecture',
    texte: 'Le carnet est consultable, mais le PC n’est pas joignable. '
         + 'Une plongée saisie maintenant devra être exportée : un fichier '
         + 'à déposer dans le dossier d’import.',
  },
  'hors-ligne': {
    titre: 'Hors ligne',
    icone: '▤',
    classe: 'local',
    texte: 'Ni le PC ni le fichier ne répondent. Tu travailles sur la copie '
         + 'gardée dans ce navigateur : rien n’est perdu, mais rien n’est '
         + 'partagé tant que tu n’as pas exporté.',
  },
};

export async function reglagesView() {
  const wrap = el('div');
  const mode = modeActuel();
  const info = EXPLICATIONS[mode] || EXPLICATIONS['hors-ligne'];
  const dossier = settings().dossierImport;

  // ---------- État courant ----------
  wrap.append(el(`div.card.etat-${info.classe}`, {},
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
      el('span', { style: { fontSize: '26px' }, text: info.icone }),
      el('div', {},
        el('div', { style: { fontWeight: '650', fontSize: '16px' }, text: info.titre }),
        el('div.hint', { style: { marginTop: '2px' }, text: info.texte }))),
    el('div.btn-row', { style: { marginTop: '12px' } },
      el('button.btn.sm.ghost', { text: '↻ Chercher le PC', onclick: async (e) => {
        e.target.disabled = true;
        const r = await rafraichir().catch(() => null);
        toast(r?.mode === 'serveur'
          ? `Carnet relié — ${r.plongees} plongée(s)`
          : 'PC toujours pas joignable', r?.mode !== 'serveur');
        navigate('reglages', true);
      } }))));

  // ---------- Saisies en attente d'export ----------
  const attente = enAttenteDExport();
  if (attente.length) {
    const diverId = await store.getActiveDiverId();
    const toutes = diverId ? await store.listDives(diverId) : [];
    const concernees = toutes.filter(d => attente.includes(d.id));

    wrap.append(el('div.card.attente', {},
      el('div', { style: { fontWeight: '650', marginBottom: '4px' },
        text: `${concernees.length} saisie(s) à rapatrier` }),
      el('div.hint', {
        text: 'Ces plongées n’existent que sur cet appareil. Exporte-les, '
            + `puis dépose le fichier obtenu dans le dossier ${dossier}. `
            + 'Au prochain lancement du PC, elles rejoindront le carnet.' }),

      el('div', { style: { margin: '10px 0' } },
        ...concernees.map(d => el('div.jour-ligne', {},
          el('div.dive-num', { style: { width: '34px', height: '34px', flex: '0 0 34px',
            fontSize: '12px' }, text: d.numero ?? '—' }),
          el('div', { style: { flex: 1, minWidth: 0 } },
            el('div', { style: { fontWeight: '600', fontSize: '14px' },
              text: d.lieuNom || 'Lieu non précisé' }),
            el('div', { style: { color: 'var(--text-dim)', fontSize: '12.5px' },
              text: fmtDate(d.date) }))))),

      el('div.btn-row', {},
        el('button.btn.primary', { text: '⬇ Exporter', onclick: async () => {
          const carnet = await store.raw();
          const nom = telechargerLot(concernees, carnet);
          toast(`${nom} téléchargé`);
        } }),
        el('button.btn.sm.ghost', { text: 'Déjà importé', onclick: async () => {
          if (await confirmBox(
              'Marquer ces saisies comme rapatriées ? Elles ne seront plus '
            + 'proposées à l’export. À ne faire qu’après avoir vérifié '
            + 'qu’elles sont bien dans le carnet du PC.', 'Marquer', false)) {
            oublierAttente();
            toast('File d’export vidée');
            navigate('reglages', true);
          }
        } }))));
  }

  // ---------- Comment ça marche ----------
  wrap.append(el('div.card', {},
    el('div.lbl', { text: 'Comment le carnet circule' }),
    el('ol.wiz-liste', {},
      el('li', {}, 'Sur le PC : double-clic sur ', el('code', { text: 'lancer.bat' }),
        '. Il importe le dossier ', el('code', { text: dossier }),
        ', puis ouvre le carnet.'),
      el('li', {}, 'Sur le téléphone, même Wi-Fi : ouvre l’adresse ',
        el('code', { text: 'http://…:8080' }),
        ' affichée par la fenêtre noire. Tu écris directement dans le carnet.'),
      el('li', {}, 'Sur le téléphone, loin du PC : tu consultes tout, et une saisie '
        + 'produit un fichier ', el('code', { text: 'plongeeNoXXXX-…json' }),
        ' à déposer dans ', el('code', { text: dossier }), '.'),
    ),
    el('div.hint', { style: { marginTop: '10px' },
      text: 'Le carnet est un seul fichier JSON, lisible et copiable. '
          + 'Le serveur en garde les 40 dernières versions dans '
          + 'donnees/sauvegardes/ avant chaque écriture.' })));

  // ---------- Sauvegarde manuelle ----------
  wrap.append(el('div.card', {},
    el('div.lbl', { text: 'Sauvegarde' }),
    el('div.btn-row', {},
      el('button.btn.sm.ghost', { text: '⬇ Exporter tout le carnet', onclick: async () => {
        const json = await store.exportAll();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = el('a', { href: url, download:
          `carnet-${new Date().toISOString().slice(0, 10)}.json` });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      } }),
      el('label.btn.sm.ghost', { style: { cursor: 'pointer' } }, '⬆ Importer un fichier',
        el('input', { type: 'file', accept: '.json', style: { display: 'none' },
          onchange: async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              await store.importAll(await f.text(), { merge: true });
              toast('Import terminé');
              navigate('dives', true);
            } catch (err) {
              toast(err.message, true);
            }
          } })))));

  return { title: 'Réglages', node: wrap };
}
