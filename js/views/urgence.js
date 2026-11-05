// ============================================================
//  Écran d'urgence — accessible sans mot de passe
// ============================================================

import { el, fmtDate } from '../lib.js';
import { lire } from '../urgence.js';
import { navigate } from '../router.js';
import { PAYS, DAN_EUROPE, paysDe } from '../secours.js';

const CLE_PAYS = 'plongee-journal:secours-pays';

export async function urgenceView() {
  const f = lire();
  const wrap = el('div');

  if (!f) {
    return {
      title: 'Urgence',
      node: el('div.empty', {},
        el('span.big', { text: '🆘' }),
        'Aucune fiche d’urgence sur cet appareil.', el('br'),
        'Elle se remplit toute seule dès que tu ouvres ton carnet, '
      + 'à partir de ta fiche plongeur.',
        el('div', { style: { marginTop: '18px' } },
          el('button.btn.primary', { onclick: () => navigate('verrou') }, 'Déverrouiller'))),
      back: true,
    };
  }

  const nom = [f.prenom, f.nom].filter(Boolean).join(' ') || 'Plongeur';
  const contact = [f.urgPrenom, f.urgNom].filter(Boolean).join(' ');

  const ligne = (cle, valeur, accent) => valeur
    ? el('div.kv', {},
        el('span.k', { text: cle }),
        el('span.v', { style: accent ? { color: accent, fontWeight: '700' } : null, text: valeur }))
    : null;

  wrap.append(
    el('div.card.urgence-tete', {},
      el('div', { style: { fontSize: '34px', textAlign: 'center' }, text: '🆘' }),
      el('div', { style: { fontSize: '21px', fontWeight: '700', textAlign: 'center' }, text: nom }),
      f.groupeSanguin
        ? el('div', { style: { textAlign: 'center', marginTop: '8px' } },
            el('span.urgence-sang', { text: f.groupeSanguin }))
        : null,
    ),
  );

  // Le numéro d'abord : c'est ce qu'on cherche dans l'urgence.
  if (f.urgTel) {
    wrap.append(el('div.section', {},
      el('h2', { text: 'Personne à prévenir' }),
      el('a.card.urgence-appel', { href: `tel:${f.urgTel.replace(/\s+/g, '')}` },
        el('div', { style: { fontSize: '26px' }, text: '📞' }),
        el('div', { style: { flex: 1 } },
          el('div', { style: { fontWeight: '650', fontSize: '17px' },
            text: contact || 'Contact d’urgence' }),
          el('div', { style: { fontSize: '19px', letterSpacing: '.5px' }, text: f.urgTel }),
          f.urgLien ? el('div', { style: { color: 'var(--text-dim)', fontSize: '13px' },
            text: f.urgLien }) : null),
        el('div', { style: { color: 'var(--text-mute)' }, text: '›' }),
      ),
    ));
  }

  const fiche = el('div.card', {},
    ligne('Groupe sanguin', f.groupeSanguin, 'var(--danger)'),
    ligne('Niveau', f.niveau),
    ligne('N° de licence', f.licence),
  );
  if (fiche.children.length) {
    wrap.append(el('div.section', {}, el('h2', { text: 'Informations' }), fiche));
  }

  // Les secours du pays où l'on est : le GPS du téléphone le devine
  // (sans réseau), sinon on le choisit. Le choix est retenu.
  const secours = el('div.card');
  let paysId = (() => { try { return localStorage.getItem(CLE_PAYS) || 'FR'; } catch { return 'FR'; } })();
  const choix = el('select', { 'aria-label': 'Pays' }, ...PAYS.map(p => el('option', { value: p.id, text: `${p.drapeau} ${p.nom}` })));
  const etatGps = el('span.hint', { style: { margin: 0 } });
  const choisir = id => {
    paysId = PAYS.some(p => p.id === id) ? id : 'AUTRE';
    choix.value = paysId;
    try { localStorage.setItem(CLE_PAYS, paysId); } catch { /* privé */ }
    rendreSecours();
  };
  choix.onchange = () => choisir(choix.value);
  const localiser = () => {
    if (!navigator.geolocation) { etatGps.textContent = 'Pas de GPS sur cet appareil.'; return; }
    etatGps.textContent = 'Recherche de ta position…';
    navigator.geolocation.getCurrentPosition(pos => {
      const p = paysDe(pos.coords.latitude, pos.coords.longitude);
      etatGps.textContent = p ? `Position : ${p.nom}` : 'Pays non reconnu : choisis-le.';
      choisir(p ? p.id : 'AUTRE');
    }, () => { etatGps.textContent = 'Position indisponible : choisis le pays.'; },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
  };

  function rendreSecours() {
    const p = PAYS.find(x => x.id === paysId) || PAYS[0];
    secours.replaceChildren(
      el('div.urgence-pays', {}, choix,
        el('button.btn.sm', { type: 'button', text: '📍 Où suis-je ?', onclick: localiser })),
      etatGps,
      ...p.numeros.map(([num, libelle]) => el('a.urgence-secours', { href: `tel:${num.replace(/\s+/g, '')}` },
        el('b', { text: num }), el('span', { text: libelle }))),
      el('a.urgence-secours', { href: `tel:${DAN_EUROPE.num.replace(/\s+/g, '')}` },
        el('b', { text: 'DAN' }), el('span', { text: `${DAN_EUROPE.num} · ${DAN_EUROPE.libelle}` })),
      el('div.hint', { style: { marginBottom: 0 },
        text: 'En cas d’accident de plongée, précise systématiquement qu’il s’agit '
            + 'd’un accident de plongée (décompression possible) : la prise en charge n’est pas la même. '
            + 'Vérifie les numéros locaux auprès du centre en arrivant.' }));
  }
  choix.value = paysId;
  rendreSecours();
  wrap.append(el('div.section', {}, el('h2', { text: 'Secours' }), secours));

  wrap.append(el('div.hint', { style: { textAlign: 'center' },
    text: `Copie locale de ta fiche plongeur, mise à jour le ${fmtDate((f.majLe || '').slice(0, 10))}. `
        + 'Volontairement lisible sans mot de passe : une information de secours '
        + 'verrouillée ne sert à rien. Elle ne contient ni tes plongées, ni ton adresse.' }));

  wrap.append(el('div.btn-row', {},
    el('button.btn.primary', { text: 'Déverrouiller le carnet', onclick: () => navigate('verrou') })));

  return { title: '🆘 Urgence', node: wrap, back: true };
}
