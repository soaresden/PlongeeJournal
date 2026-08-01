// ============================================================
//  Statistiques du carnet
// ============================================================

import { el, fmtDuration, fmtDate, fullName } from '../lib.js';
import { store } from '../store.js';
import { navigate } from '../router.js';

const stat = (n, l) => el('div.stat', {}, el('div.n', { text: String(n) }), el('div.l', { text: l }));

function bars(entries, total) {
  const wrap = el('div');
  entries.forEach(([label, n]) => {
    const pct = total ? Math.round(n / total * 100) : 0;
    wrap.append(el('div', { style: { marginBottom: '10px' } },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '13.5px', marginBottom: '4px' } },
        el('span', { text: label }),
        el('span', { style: { color: 'var(--text-mute)' }, text: `${n} · ${pct}%` }),
      ),
      el('div', { style: { height: '7px', background: 'var(--bg-2)', borderRadius: '99px', overflow: 'hidden' } },
        el('div', { style: {
          width: pct + '%', height: '100%',
          background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
        } })),
    ));
  });
  return wrap;
}

export async function statsView() {
  const diverId = await store.getActiveDiverId();
  if (!diverId) {
    return { title: 'Statistiques',
      node: el('div.empty', {}, el('span.big', { text: '📊' }), 'Crée d’abord un profil.') };
  }

  const diver = await store.getDiver(diverId);
  const st = await store.stats(diverId);
  const buddies = await store.listBuddies();
  const wrap = el('div');

  if (!st.count) {
    return { title: 'Statistiques',
      node: el('div.empty', {}, el('span.big', { text: '📊' }),
        'Pas encore de plongée dans ce carnet.',
        el('div', { style: { marginTop: '18px' } },
          el('button.btn.primary', { onclick: () => navigate('dive/new') }, 'Saisir une plongée'))) };
  }

  wrap.append(el('div', { style: { color: 'var(--text-dim)', marginBottom: '12px' },
    text: `Carnet de ${fullName(diver)}` }));

  wrap.append(el('div.stat-grid', {},
    stat(st.count, 'plongées'),
    stat(fmtDuration(Math.round(st.totalMin)), 'temps total'),
    stat(st.maxDepth ? st.maxDepth + ' m' : '—', 'profondeur max'),
    stat(st.avgDepth ? Math.round(st.avgDepth) + ' m' : '—', 'profondeur moy.'),
  ));

  wrap.append(el('div.stat-grid', { style: { marginTop: '10px' } },
    stat(fmtDuration(Math.round(st.avgDuration)), 'durée moyenne'),
    stat(st.nuit, 'de nuit'),
    stat(st.salee, 'en eau salée'),
    stat(st.douce, 'en eau douce'),
  ));

  // Répartition par niveau : déduite des plongées, jamais saisie sur le profil.
  if (st.parNiveau?.length) {
    wrap.append(el('div.section', { style: { marginTop: '22px' } },
      el('h2', { text: 'Par niveau' }),
      el('div.card', {},
        st.niveau
          ? el('div', { style: { marginBottom: '10px' } },
              el('span', { style: { color: 'var(--text-dim)' }, text: 'Niveau actuel : ' }),
              el('b', { style: { color: 'var(--accent)' }, text: st.niveau }))
          : null,
        bars(st.parNiveau, st.count),
        el('div.hint', { style: { marginBottom: 0 },
          text: 'Le niveau actuel est le plus élevé enregistré sur une plongée — '
              + 'rien à renseigner sur ta fiche.' }),
      ),
    ));
  }

  const years = Object.entries(st.years).sort((a, b) => b[0].localeCompare(a[0]));
  if (years.length) {
    wrap.append(el('div.section', { style: { marginTop: '22px' } },
      el('h2', { text: 'Par année' }),
      el('div.card', {}, bars(years, Math.max(...years.map(y => y[1])))),
    ));
  }

  const types = Object.entries(st.byType).sort((a, b) => b[1] - a[1]);
  if (types.length) {
    wrap.append(el('div.section', {},
      el('h2', { text: 'Par type' }),
      el('div.card', {}, bars(types, st.count)),
    ));
  }

  const top = Object.entries(st.buddyCount)
    .map(([id, n]) => [fullName(buddies.find(b => b.id === id)) || '?', n])
    .sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (top.length) {
    wrap.append(el('div.section', {},
      el('h2', { text: 'Compagnons les plus fréquents' }),
      el('div.card', {}, bars(top, Math.max(...top.map(t => t[1])))),
    ));
  }

  if (st.lastDate) {
    wrap.append(el('div.hint', { text: `Dernière plongée enregistrée le ${fmtDate(st.lastDate)}.` }));
  }

  return { title: 'Statistiques', node: wrap };
}
