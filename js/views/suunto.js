// ============================================================
//  Import d'un fichier d'ordinateur de plongée (.fit)
//
//  L'API Suunto exigeait un serveur détenant un secret client —
//  donc un compte, donc un service en ligne. Le carnet n'en a plus.
//
//  Ce qui reste, et qui marche sans rien demander à personne : le
//  fichier .fit lui-même. Suunto App, Garmin Connect et Shearwater
//  Cloud savent tous l'exporter. Il est décodé ici, dans le
//  navigateur ; rien ne sort de l'appareil.
//
//  Une plongée réelle peut tenir en PLUSIEURS fichiers — remontée
//  en surface puis réimmersion. On peut donc en cocher plusieurs :
//  ils sont fusionnés en une seule plongée.
// ============================================================

import { el, toast, fmtDuration, uid } from '../lib.js';
import { store, emptyDive } from '../store.js';
import { navigate } from '../router.js';
import { fitToDive, mergeDives, profileSvg } from '../fit.js';

function fmtDateHeure(d) {
  if (!d) return 'Date inconnue';
  return d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

export async function suuntoView() {
  const wrap = el('div');

  /** Fichiers décodés, en attente de validation. */
  let lots = [];
  const liste = el('div');
  const actions = el('div.btn-row');

  // Directement depuis la montre, sans passer par l'appli Suunto.
  wrap.append(el('div.card', {},
    el('div', { style: { fontWeight: '650', marginBottom: '4px' },
      text: '📡 Suunto Ocean : directement depuis la montre' }),
    el('div.hint', {
      text: 'Le carnet lit les plongées dans la montre en Bluetooth : profil, températures, '
          + 'pression du Tank POD, gaz. L’appli Suunto peut rester installée et appairée.' }),
    el('button#btn-montre-ble.btn.primary.block', {
      type: 'button', style: { marginTop: '10px' },
      text: '⌚ Importer depuis la montre (Bluetooth)',
      onclick: () => navigate('montre'),
    }),
  ));

  wrap.append(el('div.card', {},
    el('div', { style: { fontWeight: '650', marginBottom: '4px' },
      text: '📄 Ou depuis un fichier .fit' }),
    el('div.hint', {
      text: 'Exporte la plongée au format .fit depuis l’application de ta montre, '
          + 'puis dépose le fichier ici. Le décodage se fait dans ce navigateur : '
          + 'le fichier ne part nulle part.' }),
    el('ul.wiz-liste', { style: { marginTop: '8px' } },
      el('li', {}, 'Suunto App : la plongée → « … » → Exporter → FIT'),
      el('li', {}, 'Garmin Connect : l’activité → engrenage → Exporter le fichier d’origine'),
      el('li', {}, 'Shearwater Cloud : Export → FIT')),
  ));

  const champ = el('input', {
    type: 'file', accept: '.fit,application/octet-stream', multiple: true,
    style: { display: 'none' },
  });

  const bouton = el('button.btn.primary.block', {
    text: '📂 Choisir un ou plusieurs fichiers .fit',
    onclick: () => champ.click(),
  });

  champ.onchange = async () => {
    const fichiers = [...(champ.files || [])];
    champ.value = '';
    if (!fichiers.length) return;

    for (const f of fichiers) {
      try {
        const octets = new Uint8Array(await f.arrayBuffer());
        const decode = fitToDive(octets);
        if (!decode) { toast(`${f.name} : aucune donnée de plongée`, true); continue; }
        lots.push({ nom: f.name, decode, retenu: true });
      } catch (e) {
        console.error(e);
        toast(`${f.name} illisible : ${e.message}`, true);
      }
    }
    rendre();
  };

  wrap.append(bouton, champ, liste, actions);

  // ---------- Aperçu ----------

  function rendre() {
    liste.innerHTML = '';
    actions.innerHTML = '';
    if (!lots.length) return;

    liste.append(el('div.hint', { style: { margin: '14px 0 8px' },
      text: 'Coche plusieurs fichiers si une même plongée a été coupée par un '
          + 'passage en surface : ils seront fusionnés en une seule.' }));

    lots.forEach((lot, i) => {
      const { decode } = lot;
      const coche = el('input', { type: 'checkbox' });
      coche.style.cssText = 'width:20px;height:20px;accent-color:var(--accent);flex:0 0 auto';
      coche.checked = lot.retenu;
      coche.onchange = () => { lot.retenu = coche.checked; majActions(); };

      liste.append(el('div.card', {},
        el('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } },
          coche,
          el('div', { style: { flex: 1, minWidth: 0 } },
            el('div', { style: { fontWeight: '600' }, text: fmtDateHeure(decode.start) }),
            el('div', { style: { color: 'var(--text-dim)', fontSize: '13px' },
              text: [decode.dureeMin ? fmtDuration(decode.dureeMin) : null,
                     decode.profMax ? `${decode.profMax} m` : null,
                     decode.tempFond != null ? `${Math.round(decode.tempFond)} °C` : null]
                .filter(Boolean).join(' · ') || 'Sans détail' }),
            el('div', { style: { color: 'var(--text-mute)', fontSize: '11.5px' },
              text: lot.nom })),
          el('button.icon-btn', { text: '✕', title: 'Retirer',
            onclick: () => { lots.splice(i, 1); rendre(); } })),
        decode.samples?.length
          ? el('div', { style: { marginTop: '10px' }, html: profileSvg(decode.samples) })
          : null,
      ));
    });

    majActions();
  }

  function majActions() {
    actions.innerHTML = '';
    const retenus = lots.filter(l => l.retenu);
    actions.append(el('button.btn.primary.block', {
      text: retenus.length === 0 ? 'Coche au moins un fichier'
          : retenus.length === 1 ? 'Créer la plongée'
          : `Fusionner ${retenus.length} fichiers en une plongée`,
      disabled: retenus.length === 0,
      onclick: () => creer(retenus),
    }));
  }

  // ---------- Création ----------

  async function creer(retenus) {
    const diverId = await store.getActiveDiverId();
    if (!diverId) { toast('Crée d’abord ton profil de plongeur', true); return; }

    const fusion = retenus.length === 1 ? retenus[0].decode
                                        : mergeDives(retenus.map(l => l.decode));

    // Le nom de fichier sert de garde-fou contre un double import.
    const dive = await creerPlongeeImportee(diverId, fusion, { cles: retenus.map(l => l.nom) });
    toast(retenus.length > 1
      ? `${retenus.length} fichiers fusionnés en plongée n°${dive.numero}`
      : `Plongée n°${dive.numero} créée`);
    navigate(`dive/${dive.id}/edit`);
  }

  return { title: 'Importer un .fit', node: wrap, back: true };
}

/**
 * Crée et enregistre (donc synchronise) une plongée à partir d'un
 * import d'ordinateur : .fit décodé (fitToDive) ou montre en Bluetooth
 * (oceanToDive), qui ont la même forme.
 * @param {string} diverId
 * @param {object} fusion   la plongée décodée
 * @param {{cles:string[], suunto?:object}} opts  clés anti-doublon, détails
 */
export async function creerPlongeeImportee(diverId, fusion, { cles, suunto = null }) {
  const numero = await store.nextNumber(diverId);
  const dive = emptyDive(diverId, numero);
  dive.id = uid();

  if (fusion.start) {
    // Date et heure LOCALES : toISOString() donnerait la date UTC, fausse
    // pour une plongée de nuit.
    const d = fusion.start;
    dive.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dive.heureImmersion = d.toTimeString().slice(0, 5);
  }
  if (fusion.dureeMin) dive.dureeMin = Math.round(fusion.dureeMin);
  if (fusion.profMax != null) dive.profMax = fusion.profMax;
  if (fusion.profMoy != null) dive.profMoy = fusion.profMoy;
  if (fusion.tempFond != null) dive.tempFond = Math.round(fusion.tempFond);
  if (fusion.samples?.length) dive.samples = fusion.samples;

  // Ce que seule la montre en Bluetooth fournit : bloc (Tank POD), gaz,
  // position GPS de la mise à l'eau.
  if (fusion.pressionDepart) dive.pressionDepart = fusion.pressionDepart;
  if (fusion.pressionFin) dive.pressionFin = fusion.pressionFin;
  if (fusion.blocLitres) dive.blocLitres = fusion.blocLitres;
  if (fusion.gazO2 && fusion.gazO2 !== 21 && !fusion.gazHe) {
    dive.gazType = 'nitrox';
    dive.gazO2 = fusion.gazO2;
  } else if (fusion.gazHe) {
    dive.gazType = 'trimix';
    dive.gazO2 = fusion.gazO2;
    dive.gazHe = fusion.gazHe;
  }
  if (fusion.lieu && dive.lat == null) {
    dive.lat = fusion.lieu.lat;
    dive.lng = fusion.lieu.lng;
  }

  // Les paliers déduits du profil sont une ESTIMATION : la montre
  // n'enregistre pas « palier », elle enregistre « telle profondeur à
  // telle seconde ». À vérifier sur la fiche.
  if (fusion.paliers) {
    dive.palier3 = fusion.paliers.p3 || 0;
    dive.palier6 = fusion.paliers.p6 || 0;
    dive.palier9 = fusion.paliers.p9 || 0;
    dive.paliersEstimes = true;
  }

  dive.suuntoKeys = cles;
  if (suunto) dive.suunto = suunto;

  await store.saveDive(dive);
  return dive;
}
