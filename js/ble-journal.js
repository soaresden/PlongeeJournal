// ============================================================
//  Journal Bluetooth : ce qui s'est dit avec la montre, lisible et
//  copiable depuis l'appli pour diagnostiquer un import qui coince.
//
//  Il reste en mémoire (pas dans le carnet) et survit au changement
//  d'écran : on peut revenir le copier après un échec.
// ============================================================

const MAX = 5000;
const lignes = [];
const abonnes = new Set();
let t0 = null;

const pad = (n, l = 2) => String(n).padStart(l, '0');

export const journalBle = {
  log(texte) {
    const d = new Date();
    if (t0 === null) t0 = d.getTime();
    const ligne = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
      + ` +${((d.getTime() - t0) / 1000).toFixed(1).padStart(6)}s  ${texte}`;
    lignes.push(ligne);
    if (lignes.length > MAX) lignes.splice(0, lignes.length - MAX);
    abonnes.forEach(cb => cb(ligne));
  },

  /** Démarre une nouvelle séance, avec ce qui aide à diagnostiquer. */
  entete(contexte = {}) {
    lignes.length = 0;
    t0 = null;
    this.log(`=== Carnet de plongée — import Bluetooth ${new Date().toISOString()} ===`);
    for (const [k, v] of Object.entries(contexte)) this.log(`${k} : ${v}`);
  },

  texte() { return lignes.join('\n'); },
  dernieres(n = 200) { return lignes.slice(-n); },
  taille() { return lignes.length; },
  abonner(cb) { abonnes.add(cb); return () => abonnes.delete(cb); },
};
