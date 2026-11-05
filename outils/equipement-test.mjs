// Stock et équipé : node outils/equipement-test.mjs
import { idsEquipes, equiper, combiEquipee, couleurPiece, dessinPlongeur } from '../js/equipement.js';
import { paysPlongee } from '../js/views/cv.js';

let ko = 0;
const ok = (cond, nom) => { console.log(`  ${cond ? 'OK ' : 'KO '} ${nom}`); if (!cond) ko++; };

const piece = (id, type, valeurs) => ({ id, type, valeurs });
const diver = () => ({
  materiel: [
    piece('c7', 'combinaison', { sousType: 'Semi-étanche', mm: '7', marque: 'Subea' }),
    piece('c5', 'combinaison', { sousType: 'Humide', mm: '5', marque: 'Beuchat rouge' }),
    piece('o1', 'ordinateur', { marque: 'Suunto', modele: 'Ocean' }),
    piece('o2', 'ordinateur', { marque: 'Suunto', modele: 'D5' }),
    piece('p1', 'palmes', { marque: 'Cressi', note: 'Cyan' }),
  ],
});

const d = diver();
ok(JSON.stringify(idsEquipes(d)) === '["c7","o1","p1"]', 'jamais choisi : le premier de chaque type');
equiper(d, 'c5');
ok(idsEquipes(d).includes('c5') && !idsEquipes(d).includes('c7'), 'une combinaison chasse l’autre');
ok(d.combiType === 'Humide' && d.combiMm === '5', 'le profil suit la combinaison portée');
ok(combiEquipee(d).combiMm === '5', 'combiEquipee');
equiper(d, 'o2');
ok(idsEquipes(d).includes('o1') && idsEquipes(d).includes('o2'), 'deux ordinateurs possibles (secours)');
equiper(d, 'c5', false);
ok(!idsEquipes(d).some(id => id.startsWith('c')) && d.combiType === '', 'plus de combinaison portée');
d.materiel = d.materiel.filter(m => m.id !== 'o1');
ok(!idsEquipes(d).includes('o1'), 'une pièce retirée du stock n’est plus portée');

ok(couleurPiece(piece('x', 'palmes', { note: 'Cyan' }), '#000') === '#1fc1d6', 'couleur : cyan');
ok(couleurPiece(piece('x', 'gilet', { modele: 'Magellan HD Bleu' }), '#000') === '#2f6fd6', 'couleur : bleu');
ok(couleurPiece(piece('x', 'masque', { marque: 'Subea' }), '#abc') === '#abc', 'couleur : par défaut');

const svg = dessinPlongeur(diver());
ok(svg.includes('data-type="palmes"') && svg.includes('eq-on') && svg.includes('7 mm'), 'dessin : palmes, combi 7 mm');
ok(!svg.includes('data-type="gilet"'), 'dessin : rien de ce qui n’est pas au stock');
ok(!svg.includes('eq-off'), 'dessin : rien en pointillés quand tout est porté');
const sansPalmes = diver();
equiper(sansPalmes, 'p1', false);
ok(/eq-off" data-type="palmes"/.test(dessinPlongeur(sansPalmes)), 'dessin : palmes au stock mais pas portées, en pointillés');

ok(paysPlongee({ lat: 39.62, lng: 19.92 }) === 'GR', 'pays : Corfou (GPS)');
ok(paysPlongee({ lieuNom: 'Corfou' }) === 'GR', 'pays : Corfou (nom, sans GPS)');
ok(paysPlongee({ lat: 14.47, lng: -61.08 }) === 'MQ', 'pays : Martinique');
ok(paysPlongee({ lat: 28.05, lng: -15.4 }) === 'ES', 'pays : Gran Canaria');
ok(paysPlongee({ lat: 49.64, lng: -1.62 }) === 'FR', 'pays : Cherbourg');
ok(paysPlongee({ lieuNom: '?' }) === null, 'pays : inconnu');

console.log(ko ? `\n${ko} échec(s).` : '\nStock et équipé : tous les tests passent.');
process.exit(ko ? 1 : 0);
