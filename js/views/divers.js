// ============================================================
//  Plongeurs (identités) — un carnet par identité
// ============================================================

import { el, fullName, toast, confirmBox, fmtDate, openModal } from '../lib.js';
import { store, emptyDiver, emptyCertification, CERTIFS_COURANTES } from '../store.js';
import { BLOOD_TYPES, typeMateriel, COMBI_TYPES, COMBI_MM } from '../config.js';
import { editerMateriel, ligneMateriel } from './materiel.js';
import { navigate } from '../router.js';

function field(label, control, hint) {
  return el('div.field', {},
    label ? el('label.lbl', { text: label }) : null, control,
    hint ? el('div.hint', { text: hint }) : null);
}

function input(type, value, oninput, attrs = {}) {
  const n = el('input', { type, value: value ?? '', ...attrs });
  n.addEventListener('input', () => oninput(n.value));
  return n;
}

// ------------------------------------------------------------
//  Liste des identités
// ------------------------------------------------------------

export async function diversView() {
  const divers = await store.listDivers();
  const activeId = await store.getActiveDiverId();
  const wrap = el('div');

  if (!divers.length) {
    wrap.append(el('div.empty', {},
      el('span.big', { text: '👤' }),
      'Aucun plongeur enregistré.', el('br'),
      'Chaque identité possède son propre carnet.',
      el('div', { style: { marginTop: '20px' } },
        el('button.btn.primary', { onclick: () => navigate('diver/new') }, 'Créer un profil')),
    ));
    return { title: 'Profils', node: wrap };
  }

  // Un tableau de bord : qui je suis, mes diplômes, mes raccourcis.
  const moi = divers.find(d => d.id === activeId) || divers[0];
  const st = await store.stats(moi.id);
  const certifs = (await store.listCertifications(moi.id))
    .slice().sort((a, b) => (a.dateObtention || '').localeCompare(b.dateObtention || ''));
  const { rangNiveau } = await import('../config.js');

  const tb = el('div.tb');
  wrap.append(tb);

  tb.append(el('div.tb-carte.plein', {},
    el('div.profil-tete', {},
      el('div.profil-av', { text: ((moi.prenom?.[0] || '') + (moi.nom?.[0] || '')).toUpperCase() || '?' }),
      el('div', { style: { flex: 1, minWidth: 0 } },
        el('div.profil-nom', { text: fullName(moi) || 'Sans nom' }),
        el('div.profil-sous', { text: [st.niveau, moi.licence && `licence ${moi.licence}`].filter(Boolean).join(' · ') || 'Profil incomplet' }),
        el('div.profil-sous', { text: `${st.count} plongée${st.count > 1 ? 's' : ''}${st.lastDate ? ` · dernière le ${fmtDate(st.lastDate)}` : ''}` })),
      el('button.btn.primary.sm', { type: 'button', text: '✎ Ma fiche', onclick: () => navigate(`diver/${moi.id}`) }))));

  // Les diplômes : d'eux se déduit le niveau de chaque plongée.
  tb.append(el('div.tb-carte', {},
    el('div.tb-titre', {}, el('h2', { text: 'Mes diplômes' }), el('span.tb-aide', { text: 'donnent le niveau de chaque plongée' })),
    certifs.length
      ? el('div.frise', {}, ...certifs.map(c => el('div.frise-pas', {},
          el('span.frise-date', { text: c.dateObtention ? fmtDate(c.dateObtention) : '—' }),
          el('span', { class: `frise-point${rangNiveau(c.nom) < 0 ? ' annexe' : ''}` }),
          el('span.frise-nom', {}, c.nom, el('small', { text: [c.organisme, c.numero].filter(Boolean).join(' · ') })))))
      : el('div.hint', { text: 'Aucun diplôme saisi. Ajoute-les dans ta fiche : le niveau de tes plongées en sera déduit.' }),
    el('button.btn.ghost.sm', { type: 'button', style: { marginTop: '10px' }, text: 'Ajouter ou corriger un diplôme',
      onclick: () => navigate(`diver/${moi.id}`) })));

  const lien = (ico, titre, sous, onclick) => el('button.lien', { type: 'button', onclick },
    el('span.lien-ico', { text: ico }), el('span.lien-txt', {}, el('b', { text: titre }), el('span', { text: sous })));
  tb.append(el('div.tb-carte', {},
    el('div.tb-titre', {}, el('h2', { text: 'Raccourcis' })),
    el('div.liens', {},
      lien('⌚', 'Ma montre', 'Importer les plongées de la Suunto', () => navigate('montre')),
      lien('☁', 'Compte Suunto', 'Récupérer l’historique en ligne', () => navigate('suunto-cloud')),
      lien('🎒', 'Mon matériel', 'Combinaison, détendeur, bloc…', () => navigate(`diver/${moi.id}`)),
      lien('🆘', 'Fiche d’urgence', 'Groupe sanguin, contact à prévenir', () => navigate('urgence')),
      lien('⚙', 'Réglages', 'GitHub, thème, application', () => navigate('reglages')))));

  // Plusieurs carnets sur l'appareil : on peut changer.
  if (divers.length > 1) {
    tb.append(el('div.tb-carte', {},
      el('div.tb-titre', {}, el('h2', { text: 'Autres carnets' })),
      el('div.liens', {}, ...divers.filter(d => d.id !== moi.id).map(d => lien('👤', fullName(d) || 'Sans nom', 'Activer ce carnet', async () => {
        await store.setActiveDiver(d.id);
        toast(`Carnet de ${fullName(d)} activé`);
        navigate('divers', true);
      })))));
  }
  tb.append(el('div.tb-carte', {}, el('div.liens', {},
    lien('＋', 'Ajouter un plongeur', 'Un autre carnet sur cet appareil', () => navigate('diver/new')))));

  // --- Sauvegarde des données ---
  const { backendKind } = await import('../store.js');
  const local = backendKind() === 'local';

  tb.append(el('div.tb-carte', {},
    el('div.tb-titre', {}, el('h2', { text: 'Mes données' })),
    el('div', {},
      el('div.hint', { style: { marginTop: '0', marginBottom: '12px' },
        text: local
          ? 'Mode local : les plongées sont sur cet appareil uniquement. Branche ton dépôt GitHub '
          + 'dans les réglages pour les retrouver partout.'
          : 'Tes plongées sont synchronisées avec ton dépôt GitHub privé. Un export reste utile '
          + 'comme copie hors de GitHub.' }),
      el('div.btn-row', { style: { marginTop: '0' } },
        el('button.btn.sm', {
          text: 'Exporter',
          onclick: async () => {
            const json = await store.exportAll();
            const blob = new Blob([json], { type: 'application/json' });
            const a = el('a', {
              href: URL.createObjectURL(blob),
              download: `carnet-plongee-${new Date().toISOString().slice(0, 10)}.json`,
            });
            a.click();
            URL.revokeObjectURL(a.href);
            toast('Sauvegarde téléchargée');
          },
        }),
        (() => {
          const file = el('input', { type: 'file', accept: 'application/json', hidden: true });
          file.onchange = async () => {
            const f = file.files?.[0]; if (!f) return;
            try {
              await store.importAll(await f.text(), { merge: true });
              toast('Sauvegarde importée');
              navigate('divers', true);
            } catch (e) { toast(e.message, true); }
          };
          const btn = el('button.btn.sm', { text: 'Importer', onclick: () => file.click() });
          return el('span', { style: { flex: '1', display: 'flex' } }, btn, file);
        })(),
      ),
    ),
  ));

  return { title: 'Profil', node: wrap };
}

// ------------------------------------------------------------
//  Fiche / formulaire d'une identité
// ------------------------------------------------------------

export async function diverFormView({ id }) {
  const isNew = !id || id === 'new';
  let d = isNew ? emptyDiver() : structuredClone(await store.getDiver(id));
  if (!d) return { title: 'Introuvable', node: el('div.empty', { text: 'Profil introuvable.' }), back: true };

  const set = p => Object.assign(d, p);
  const form = el('form', { onsubmit: e => e.preventDefault() });

  const st = isNew ? null : await store.stats(d.id);
  if (st) {
    form.append(el('div.card', {},
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        el('div', { style: { color: 'var(--text-dim)' }, text: 'Plongées enregistrées' }),
        el('div', { style: { fontSize: '24px', fontWeight: '700', color: 'var(--accent)' },
          text: String(st.count) }),
      ),
      el('div.hint', { text: 'Compteur calculé automatiquement depuis le carnet.' }),
    ));
  }

  // Actions en tête : on ne les cherche pas en bas d'un formulaire.
  const buttons = el('div.btn-row.actions-fiche', {},
    el('button.btn.primary', {
      type: 'button', text: isNew ? 'Créer le profil' : 'Enregistrer',
      onclick: async () => {
        if (!d.prenom.trim() && !d.nom.trim()) return toast('Indique au moins un nom', true);
        await store.saveDiver(d);
        if (isNew) await store.setActiveDiver(d.id);
        toast('Profil enregistré');
        navigate('divers', true);
      },
    }),
  );

  if (!isNew) {
    buttons.append(el('button.btn.danger', {
      type: 'button', text: 'Supprimer',
      onclick: async () => {
        if (await confirmBox(
          `Supprimer ${fullName(d)} et ses ${st.count} plongée(s) ? Cette action est définitive.`,
          'Tout supprimer')) {
          await store.deleteDiver(d.id);
          toast('Profil supprimé');
          navigate('divers', true);
        }
      },
    }));
  }
  form.append(buttons);

  form.append(el('div.section', {},
    el('h2', { text: 'Identité' }),
    el('div.card', {},
      el('div.row', {},
        field('Prénom', input('text', d.prenom, v => set({ prenom: v }), { autocomplete: 'given-name' })),
        field('Nom', input('text', d.nom, v => set({ nom: v }), { autocomplete: 'family-name' })),
      ),
      el('div.row', {},
        field('N° de licence', input('text', d.licence, v => set({ licence: v }))),
        field('Niveau détecté', el('div', {
          style: { padding: '11px 12px', background: 'var(--bg-2)',
                   border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
                   color: st?.niveau ? 'var(--accent)' : 'var(--text-mute)',
                   fontWeight: st?.niveau ? '650' : '400' },
          text: st?.niveau || 'aucune plongée avec un niveau',
        }),
          'Déduit de tes plongées : le plus haut niveau enregistré. '
        + 'Il se met à jour tout seul le jour où tu saisis une plongée à un niveau supérieur.'),
      ),
      el('div.row', {},
        field('Nationalité', input('text', d.nationalite, v => set({ nationalite: v }))),
        field('Groupe sanguin', (() => {
          const s = el('select');
          s.append(el('option', { value: '', text: '—' }));
          BLOOD_TYPES.forEach(b => s.append(el('option', { value: b, text: b })));
          s.value = d.groupeSanguin || '';
          s.onchange = () => set({ groupeSanguin: s.value });
          return s;
        })()),
      ),
    ),
  ));

  form.append(el('div.section', {},
    el('h2', { text: 'Adresse' }),
    el('div.card', {},
      field('Rue', input('text', d.rue, v => set({ rue: v }), { autocomplete: 'street-address' })),
      el('div.row', {},
        field('Code postal', input('text', d.cp, v => set({ cp: v }), { inputmode: 'numeric', autocomplete: 'postal-code' })),
        field('Ville', input('text', d.ville, v => set({ ville: v }), { autocomplete: 'address-level2' })),
      ),
      field('Pays', input('text', d.pays, v => set({ pays: v }))),
    ),
  ));

  form.append(el('div.section', {},
    el('h2', { text: 'Personne à prévenir' }),
    el('div.card', {},
      el('div.row', {},
        field('Prénom', input('text', d.urgPrenom, v => set({ urgPrenom: v }))),
        field('Nom', input('text', d.urgNom, v => set({ urgNom: v }))),
      ),
      el('div.row', {},
        field('Téléphone', input('tel', d.urgTel, v => set({ urgTel: v }), { inputmode: 'tel' })),
        field('Lien', input('text', d.urgLien, v => set({ urgLien: v }), { placeholder: 'Conjoint, parent…' })),
      ),
      el('div.hint', { text: 'Ces informations sont celles qu’un secouriste cherchera en premier.' }),
    ),
  ));

  // ---------- Cartes et certifications ----------
  //
  // Le niveau courant se déduit des plongées ; ces cartes-là sont
  // autre chose : des documents datés, avec un numéro, qu'on veut
  // pouvoir retrouver (N2, Nitrox, RIFAP…).
  if (!isNew) {
    const listeCertifs = el('div');

    async function rendreCertifs() {
      const certifs = await store.listCertifications(d.id);
      listeCertifs.innerHTML = '';

      if (!certifs.length) {
        listeCertifs.append(el('div.hint', { style: { marginTop: 0 },
          text: 'Aucune carte enregistrée.' }));
      }

      certifs.forEach(c => {
        listeCertifs.append(el('div.kv', { style: { cursor: 'pointer' },
          onclick: () => editerCertif(c) },
          el('span.k', {},
            el('b', { style: { color: 'var(--text)' }, text: c.nom || 'Sans nom' }),
            c.organisme ? el('span', { style: { color: 'var(--text-mute)' },
              text: ` · ${c.organisme}` }) : null),
          el('span.v', { style: { color: 'var(--text-dim)', fontWeight: '400' },
            text: [c.numero, c.dateObtention ? fmtDate(c.dateObtention) : null]
              .filter(Boolean).join(' · ') || '—' }),
        ));
      });
    }

    function editerCertif(certif) {
      const c = certif ? { ...certif } : emptyCertification(d.id);
      const nouveau = !certif;

      openModal(close => {
        const nom = el('input', { type: 'text', value: c.nom, list: 'certifs-connues',
                                  placeholder: 'N2, Nitrox, RIFAP…' });
        const org = el('input', { type: 'text', value: c.organisme, placeholder: 'FFESSM, PADI, SSI…' });
        const num = el('input', { type: 'text', value: c.numero, placeholder: 'Numéro de la carte' });
        const dat = el('input', { type: 'date', value: c.dateObtention });

        return el('div', {},
          el('h3', { text: nouveau ? 'Nouvelle carte' : c.nom || 'Carte' }),
          field('Nom de la carte', nom),
          el('datalist', { id: 'certifs-connues' },
            CERTIFS_COURANTES.map(x => el('option', { value: x }))),
          el('div.row', {},
            field('Organisme', org),
            field('Numéro', num),
          ),
          field('Date d’obtention', dat),
          el('div.btn-row', {},
            el('button.btn.ghost', { type: 'button', text: 'Annuler', onclick: close }),
            el('button.btn.primary', { type: 'button', text: 'Enregistrer',
              onclick: async () => {
                if (!nom.value.trim()) return toast('Indique au moins le nom de la carte', true);
                Object.assign(c, {
                  nom: nom.value.trim(), organisme: org.value.trim(),
                  numero: num.value.trim(), dateObtention: dat.value,
                });
                await store.saveCertification(c);
                await rendreCertifs();
                close();
                toast('Carte enregistrée');
              } }),
          ),
          nouveau ? null : el('div.btn-row', {},
            el('button.btn.danger.block', { type: 'button', text: 'Supprimer cette carte',
              onclick: async () => {
                if (!await confirmBox(`Supprimer « ${c.nom} » ?`, 'Supprimer')) return;
                await store.deleteCertification(c.id);
                await rendreCertifs();
                close();
                toast('Carte supprimée');
              } })),
        );
      });
    }

    await rendreCertifs();

    form.append(el('div.section', {},
      el('h2', { text: 'Cartes & certifications' }),
      el('div.card', {},
        listeCertifs,
        el('div.hint', { text: 'Brevets, qualifications, secourisme : ce que tu dois pouvoir '
          + 'présenter sur un bateau. Distinct du niveau, qui se déduit de tes plongées.' }),
        el('div.btn-row', {},
          el('button.btn.sm', { type: 'button', text: '+ Ajouter une carte',
            onclick: () => editerCertif(null) })),
      ),
    ));
  }

  // ---------- Matériel personnel ----------
  //
  // Un tableau de lignes, pas des cases figées : on peut avoir deux
  // détendeurs et aucun phare. On choisit le type, puis on ajoute.
  d.materiel ||= [];

  const tableauMateriel = el('div');

  function rendreMateriel() {
    tableauMateriel.innerHTML = '';

    if (!d.materiel.length) {
      tableauMateriel.append(el('div.hint', { style: { marginTop: 0 },
        text: 'Aucun matériel enregistré.' }));
      return;
    }

    d.materiel.forEach(m => tableauMateriel.append(ligneMateriel(m, {
      onClick: piece => editerMateriel(piece,
        modifie => {
          const i = d.materiel.findIndex(x => x.id === modifie.id);
          if (i >= 0) d.materiel[i] = modifie;
          rendreMateriel();
        },
        piece2 => {
          d.materiel = d.materiel.filter(x => x.id !== piece2.id);
          rendreMateriel();
        }),
      onRetirer: async piece => {
        if (!await confirmBox(`Retirer ${typeMateriel(piece.type).label} ?`, 'Retirer')) return;
        d.materiel = d.materiel.filter(x => x.id !== piece.id);
        rendreMateriel();
      },
    })));
  }

  rendreMateriel();

  const combiSegProfil = el('div.seg');
  COMBI_TYPES.forEach(t => {
    const b = el('button', { type: 'button', text: t });
    if (t === d.combiType) b.classList.add('on');
    b.onclick = () => {
      combiSegProfil.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      set({ combiType: t });
    };
    combiSegProfil.append(b);
  });

  const mmSelProfil = el('select');
  mmSelProfil.append(el('option', { value: '', text: '— mm —' }));
  COMBI_MM.forEach(m => mmSelProfil.append(el('option', { value: m, text: `${m} mm` })));
  mmSelProfil.value = d.combiMm || '';
  mmSelProfil.onchange = () => set({ combiMm: mmSelProfil.value });

  form.append(el('div.section', {},
    el('h2', { text: 'Mon matériel' }),
    el('div.card', {},
      el('div.hint', { style: { marginTop: 0 },
        text: 'Saisi une fois ici, repris automatiquement sur chaque nouvelle plongée. '
            + 'Tu peux toujours l’ajuster plongée par plongée.' }),
      field('Combinaison habituelle', combiSegProfil),
      field('Épaisseur', mmSelProfil),
      el('div.lbl', { style: { marginTop: '18px' }, text: 'Mon équipement' }),
      tableauMateriel,
      el('div.btn-row', {},
        el('button.btn.sm', { type: 'button', text: '+ Ajouter du matériel',
          onclick: () => editerMateriel(null, piece => {
            d.materiel.push(piece);
            rendreMateriel();
          }) })),
    ),
  ));


  return { title: isNew ? 'Nouveau plongeur' : fullName(d) || 'Profil', node: form, back: true };
}
