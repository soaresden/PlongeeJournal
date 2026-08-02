// ============================================================
//  Écran d'urgence — accessible sans mot de passe
// ============================================================

import { el, fmtDate } from '../lib.js';
import { lire } from '../urgence.js';
import { navigate } from '../router.js';

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

  wrap.append(el('div.section', {},
    el('h2', { text: 'Secours' }),
    el('div.card', {},
      el('a.urgence-secours', { href: 'tel:112' },
        el('b', { text: '112' }), el('span', { text: 'Urgences européennes' })),
      el('a.urgence-secours', { href: 'tel:196' },
        el('b', { text: '196' }), el('span', { text: 'Secours en mer (France)' })),
      el('a.urgence-secours', { href: 'tel:15' },
        el('b', { text: '15' }), el('span', { text: 'SAMU' })),
      el('div.hint', { style: { marginBottom: 0 },
        text: 'En cas d’accident de plongée, précise systématiquement qu’il s’agit '
            + 'd’un accident de décompression : la prise en charge n’est pas la même.' }),
    ),
  ));

  wrap.append(el('div.hint', { style: { textAlign: 'center' },
    text: `Copie locale de ta fiche plongeur, mise à jour le ${fmtDate((f.majLe || '').slice(0, 10))}. `
        + 'Volontairement lisible sans mot de passe : une information de secours '
        + 'verrouillée ne sert à rien. Elle ne contient ni tes plongées, ni ton adresse.' }));

  wrap.append(el('div.btn-row', {},
    el('button.btn.primary', { text: 'Déverrouiller le carnet', onclick: () => navigate('verrou') })));

  return { title: '🆘 Urgence', node: wrap, back: true };
}
