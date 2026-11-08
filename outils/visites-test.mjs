// Visites du carnet partagé : le « mot de passe » (une plongée ensemble),
// le message envoyé, sa relecture.
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
const V = await import(__p2u(path.join(ROOT, 'js/visites.js')).href);
const results = [];
const check = (name, cond, extra = '') => results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

const dives = [
  { id: 'a', numero: 48, date: '2025-03-28', lieuNom: 'Hurghada', centreNom: 'Blue Sea' },
  { id: 'b', numero: 81, date: '2026-11-08', lieuNom: 'Male Nord', lieuDetail: 'Kaafu, Maldives' },
  { id: 'c', numero: 70, date: '2026-04-01', lieuNom: 'st pierre martinique' },
];
const pays = d => (d.id === 'b' ? ['Maldives'] : d.id === 'a' ? ['Égypte', 'Egypt'] : ['Martinique']);
check('bonne date, bon lieu', V.verifierVisiteur({ date: '2025-03-28', lieu: 'hurghada' }, dives, pays).plongee?.id === 'a');
check('à 2 jours près, et le pays suffit (en anglais aussi)', V.verifierVisiteur({ date: '2025-03-30', lieu: 'Egypt' }, dives, pays).ok);
check('accents et majuscules ignorés', V.verifierVisiteur({ date: '2026-04-02', lieu: 'Saint-Pierre, MARTINIQUE' }, dives, pays).plongee?.id === 'c');
check('mauvaise date : refusé', !V.verifierVisiteur({ date: '2025-06-01', lieu: 'Hurghada' }, dives, pays).ok);
check('mauvais lieu : refusé', !V.verifierVisiteur({ date: '2025-03-28', lieu: 'Bretagne' }, dives, pays).ok);
check('vide : refusé', !V.verifierVisiteur({ date: '', lieu: '' }, dives).ok);

const m = V.message({ prenom: 'Alison', date: '2025-03-28', lieu: 'Hurghada', plongee: dives[0], ok: true });
check('message lisible', m.corps === 'Alison · 28/03/2025 · Hurghada · n°48 Hurghada' && /Alison regarde/.test(m.titre), m.corps);
const relu = V.lireMessage({ id: 'x1', time: 1794200000, message: m.corps, tags: m.tags });
check('relu : prénom, date, plongée', relu.prenom === 'Alison' && relu.date === '2025-03-28' && relu.ok && relu.plongeeId === 'a', JSON.stringify(relu));

const appels = [];
const ok = await V.annoncerVisite('pj-test', { prenom: 'Léa', date: '2026-11-08', lieu: 'Maldives', plongee: dives[1], ok: true },
  async (url, o) => { appels.push([url, o]); return { ok: true }; });
check('annonce : POST simple sur le canal, titre en paramètre', ok && appels[0][0].startsWith('https://ntfy.sh/pj-test?title=') && appels[0][1].method === 'POST' && !appels[0][1].headers);
check('annonce : sans canal, rien', !(await V.annoncerVisite('', {}, async () => ({ ok: true }))));
check('annonce : réseau en panne, sans erreur', !(await V.annoncerVisite('pj', { prenom: 'x' }, async () => { throw new Error('hors ligne'); })));

const ndjson = [{ event: 'open' }, { id: 'm1', event: 'message', time: 1794200000, message: m.corps, tags: m.tags },
  { id: 'm2', event: 'message', time: 1794200100, message: 'Bob · 01/01/2026 · Brest', tags: ['question', 'pj-ko'] }].map(x => JSON.stringify(x)).join('\n');
const lues = await V.relireVisites('pj-test', async () => ({ ok: true, text: async () => ndjson }));
check('relecture du canal : les messages seulement', lues.length === 2 && lues[1].ok === false && lues[1].prenom === 'Bob');
const f = V.fusionnerVisites([lues[0]], lues);
check('fusion : sans doublon, plus récentes d’abord', f.length === 2 && f[0].id === 'm2');
check('canal : difficile à deviner', /^pj-[a-z2-9]{20}$/.test(V.nouveauCanal()));

// Parcours, sessions, identification
{
  const e = V.message({ prenom: 'Alison', date: '2025-09-03', lieu: 'Malte', plongee: { id: 'm', numero: 55, lieuNom: 'Popeye Malta' }, ok: true, sid: 's1' });
  const p1 = V.messageParcours({ prenom: 'Alison', sid: 's1', pages: ['Plongées', 'n°55 Popeye Malta'] });
  const p2 = V.messageParcours({ prenom: 'Alison', sid: 's1', pages: ['Plongées', 'n°55 Popeye Malta', 'Stats'] });
  const ko = V.message({ prenom: 'Bob', date: '2025-01-01', lieu: 'Brest', ok: false, sid: 's2' });
  const msgs = [[e, 100], [p1, 160], [p2, 400], [ko, 50]].map(([m, t], i) => V.lireMessage({ id: `x${i}`, time: 1794200000 + t, message: m.corps, tags: m.tags }));
  check('parcours relu : les écrans dans l’ordre', msgs[2].genre === 'parcours' && msgs[2].pages.join('|') === 'Plongées|n°55 Popeye Malta|Stats');
  const sessions = V.regrouperVisites(msgs);
  const a = sessions.find(v => v.id === 's1');
  check('une visite = l’entrée + le dernier parcours', sessions.length === 2 && a.ok && a.pages.length === 3 && a.plongeeId === 'm' && a.fin > a.at, JSON.stringify(a));
  check('plus récente d’abord ; le refus est là aussi', sessions[0].id === 's1' && sessions[1].ok === false);
  const buddies = [{ id: 'b1', prenom: 'Alison', nom: 'Hocq' }, { id: 'b2', prenom: 'Alison', nom: 'Martin' }, { id: 'b3', prenom: 'Jean-Marie' }];
  const dives = [{ id: 'm', buddyIds: ['b1'] }];
  const q = V.identifier(a, buddies, dives);
  check('identifiée : l’Alison de cette plongée, à coup sûr', q?.buddy.id === 'b1' && q.sur);
  check('prénom inconnu : pas identifiée (mais entrée quand même)', V.identifier({ prenom: 'Zoé' }, buddies, dives) === null);
  check('« jean marie » = « Jean-Marie » (tirets, majuscules)', V.identifier({ prenom: 'jean marie' }, buddies, [])?.buddy.id === 'b3');
  check('prénom + nom donnés', V.identifier({ prenom: 'Alison Martin' }, buddies, [])?.buddy.id === 'b2');
  const deux = V.regrouperVisites([
    { id: 'k', at: '2025-01-01T10:00:00Z', genre: 'entree', ok: false, prenom: 'Léa', date: '2025-06-01', lieu: 'Bretagne', sid: 's9' },
    { id: 'o', at: '2025-01-01T10:01:00Z', genre: 'entree', ok: true, prenom: 'Léa', date: '2025-03-29', lieu: 'Egypte', sid: 's9' }]);
  check('un essai raté puis réussi : une visite, l’essai raté gardé', deux.length === 1 && deux[0].ok && deux[0].rates?.[0] === 'Bretagne, 01/06/2025', JSON.stringify(deux));
}

console.log(results.join('\n'));
const ko = results.filter(r => r.startsWith(' FAIL'));
console.log(`\n${results.length - ko.length}/${results.length} vérifications visites`);
if (ko.length) process.exit(1);
