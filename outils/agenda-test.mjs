// Lecture d'un agenda iCal et recherche par jour.
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
globalThis.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
const A = await import(__p2u(path.join(ROOT, 'js/agenda.js')).href);

const results = [];
const check = (name, cond, extra = '') => results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

const ics = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20230318',
  'DTEND;VALUE=DATE:20230320',
  'SUMMARY:TODI Belgique Poissons',
  'LOCATION:TODI by Sportoase\\, be-MINE 1\\, 3582 Beringen\\, Belgique',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20240904T163000Z',
  'DTEND:20240904T190000Z',
  'SUMMARY:OGN - entra',
  ' înement',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;TZID=Europe/Paris:20250830T080000',
  'DTEND;TZID=Europe/Paris:20250906T200000',
  'SUMMARY:Malte WeRoad',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const ev = A.lireIcs(ics);
check('trois événements', ev.length === 3, JSON.stringify(ev));
check('journée entière : la fin exclusive devient le dernier jour', ev[0].debut === '2023-03-18' && ev[0].fin === '2023-03-19', JSON.stringify(ev[0]));
check('virgules échappées rendues', ev[0].lieu === 'TODI by Sportoase, be-MINE 1, 3582 Beringen, Belgique', ev[0].lieu);
check('ligne repliée recollée', ev[1].titre === 'OGN - entraînement', ev[1].titre);
check('le 19/03 tombe dans TODI', A.evenementsDu(ev, '2023-03-19').map(e => e.titre).join() === 'TODI Belgique Poissons');
check('séjour de plusieurs jours trouvé', A.evenementsDu(ev, '2025-09-05')[0]?.titre === 'Malte WeRoad');
check('rien le 20/03', A.evenementsDu(ev, '2023-03-20').length === 0);
check('lieu proposé : l’adresse avant la première virgule', A.lieuPropose(ev[0]) === 'TODI by Sportoase');
check('lieu proposé : sinon le titre', A.lieuPropose(ev[2]) === 'Malte WeRoad');
check('lien Google valide', A.lienValide('https://calendar.google.com/calendar/ical/x%40gmail.com/private-abc/basic.ics'));
check('lien http refusé', !A.lienValide('http://calendar.google.com/calendar/ical/x/basic.ics'));

// Chargement : par la requête fournie, puis depuis le cache
A.enregistrerLienAgenda('https://calendar.google.com/calendar/ical/x/private-y/basic.ics');
let appels = 0;
const http = async () => { appels++; return { ok: true, status: 200, texte: ics }; };
const lus = await A.chargerAgenda({ http });
check('chargement : les événements', lus.length === 3);
await A.chargerAgenda({ http });
check('chargement : le deuxième vient de la mémoire', appels === 1, String(appels));
check('le lien ne part jamais dans le cache', !String(globalThis.localStorage._['plongee-journal:agenda-cache']).includes('private-y'));
const faux = async () => ({ ok: true, status: 200, texte: '<html>connexion</html>' });
let erreur = '';
try { await A.chargerAgenda({ forcer: true, http: faux }); } catch (e) { erreur = e.message; }
check('une page qui n’est pas un agenda est refusée', /iCal/.test(erreur), erreur);
A.oublierAgenda();
check('oublier efface le lien', !A.agendaBranche());

console.log(results.join('\n'));
const ko = results.filter(l => l.startsWith(' FAIL')).length;
console.log(`\n${results.length - ko}/${results.length} vérifications agenda`);
process.exit(ko ? 1 : 0);
