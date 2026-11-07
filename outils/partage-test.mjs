// Partage en lecture seule : rien de privé, chiffrement, mauvaise clé.
import path from 'node:path';
import { fileURLToPath as __f2p, pathToFileURL as __p2u } from 'node:url';
const ROOT = __f2p(new URL('..', import.meta.url));
globalThis.localStorage ||= { getItem: () => null, setItem() {}, removeItem() {} };
const P = await import(__p2u(path.join(ROOT, 'js/partage.js')).href);

const results = [];
const check = (name, cond, extra = '') => results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

const carnet = {
  divers: [
    { id: 'moi', prenom: 'Denis', nom: 'Soares', licence: 'A-20-1', groupeSanguin: 'B-', rue: '76 avenue X', cp: '92250', ville: 'Y',
      urgPrenom: 'Maman', urgTel: '0600000000', materiel: [{ id: 'm', type: 'ordinateur', valeurs: { marque: 'Suunto' } }], equipe: ['m'] },
    { id: 'autre', prenom: 'Autre', nom: 'Profil' },
  ],
  buddies: [{ id: 'b', prenom: 'Alison', nom: 'Hocq', licence: 'L-9', note: 'secret', categories: ['Malta-Gozo'], stamps: [{ dataUrl: 'x' }] }],
  dives: [{ id: 'd', diverId: 'moi', numero: 1, lieuNom: 'Malte', buddyIds: ['b'], photoCarnet: { ref: 'photos/p.jpg' }, samples: [{ t: 0, d: 1 }] },
          { id: 'd2', diverId: 'autre', numero: 1 }],
  certifs: [{ id: 'c', diverId: 'moi', nom: 'N3', numero: 'CARTE-123', dateObtention: '2026-04-01' }],
  seances: [{ id: 's', diverId: 'moi', type: 'fosse', buddyIds: ['b'] }],
  settings: { activeDiverId: 'moi', partage: { gistId: 'g', cle: 'k' } },
  _supprimes: { z: '2026' },
};

const inst = P.instantane(carnet, { auteur: 'Denis' });
const texte = JSON.stringify(inst);
check('rien de privé : adresse, groupe sanguin, urgence, licences, notes, photos, n° de carte',
  !['B-', '76 avenue', '0600000000', 'Maman', 'A-20-1', 'L-9', 'secret', 'photos/p.jpg', 'CARTE-123', '"partage":{"gistId"'].some(m => texte.includes(m)),
  ['B-', '76 avenue', '0600000000', 'Maman', 'A-20-1', 'L-9', 'secret', 'photos/p.jpg', 'CARTE-123'].filter(m => texte.includes(m)).join());
check('le carnet, lui, est là : plongée, courbe, palanquée, séance, brevet, matériel porté',
  inst.dives.length === 1 && inst.dives[0].samples.length === 1 && inst.buddies[0].prenom === 'Alison' && inst.seances.length === 1
  && inst.certifs[0].nom === 'N3' && inst.divers[0].equipe[0] === 'm' && inst.divers[0].materiel.length === 1);
check('seulement mon profil, pas les autres', inst.divers.length === 1 && inst.divers[0].id === 'moi');

const cle = await P.nouvelleCle();
const chiffre = await P.chiffrer(inst, cle);
check('chiffré : aucun nom lisible', !/Denis|Alison|Malte/.test(chiffre));
const retour = await P.dechiffrer(chiffre, cle);
check('déchiffré à l’identique', JSON.stringify(retour) === texte);
let erreur = '';
try { await P.dechiffrer(chiffre, await P.nouvelleCle()); } catch (e) { erreur = e.message; }
check('mauvaise clé : message clair', /clé/.test(erreur), erreur);
check('le lien porte la clé après le « # »', /^https:\/\/soaresden\.github\.io\/PlongeeJournal\/\?voir=g1#k=[A-Za-z0-9_-]{43}$/.test(P.lienPartage({ gistId: 'g1', cle })), P.lienPartage({ gistId: 'g1', cle }));

const ko = results.filter(r => r.startsWith(' FAIL'));
console.log(results.join('\n'));
console.log(ko.length ? `\n${ko.length} test(s) en échec` : `\n${results.length}/${results.length} vérifications partage`);
process.exit(ko.length ? 1 : 0);
