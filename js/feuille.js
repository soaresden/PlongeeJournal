// ============================================================
//  Le registre des visites dans une feuille Google Sheets
//
//  ntfy.sh ne garde les messages que 12 heures. Pour ne rien perdre,
//  chaque visite est aussi écrite dans une feuille Google à moi, par un
//  petit script Google (Apps Script) déployé en « application Web » (créé
//  sur script.google.com : ça marche aussi depuis une tablette) :
//  - n'importe qui peut y AJOUTER une ligne (c'est ce que fait la page du
//    visiteur, sans clé) ;
//  - seule mon appli peut la RELIRE, avec une clé secrète qui reste dans
//    mon carnet (jamais dans le lien de partage).
// ============================================================

/** Une adresse de script Google valable (…/macros/s/…/exec). */
export const estAdresseFeuille = url => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(String(url || '').trim());

/** Une clé secrète neuve (pour relire la feuille). */
export function nouvelleCle() {
  const a = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...crypto.getRandomValues(new Uint8Array(24))].map(x => a[x % a.length]).join('');
}

/** Le script à coller dans la feuille (Extensions → Apps Script). */
export function scriptFeuille(cle) {
  return `// Registre des visites de mon carnet de plongée partagé.
// Ne change rien : tout est prêt (la clé ci-dessous est celle de ton appli).
const CLE = '${cle}';

// Le visiteur ajoute une ligne (sans clé).
function doPost(e) {
  const p = (e && e.parameter) || {};
  const tags = String(p.tags || '');
  if (tags.indexOf('pj-') < 0) return ContentService.createTextOutput('?');
  const corps = e && e.postData ? String(e.postData.contents || '') : '';
  // Du texte, jamais une formule.
  const texte = (s, n) => { s = String(s || '').slice(0, n); return /^[=+\\-@]/.test(s) ? "'" + s : s; };
  const verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  try { feuille().appendRow([new Date(), texte(p.title, 200), texte(corps, 2000), texte(tags, 500)]); }
  finally { verrou.releaseLock(); }
  return ContentService.createTextOutput('ok');
}

// Mon appli relit tout (avec la clé).
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.cle !== CLE) return json({ erreur: 'clé' });
  const verrou = LockService.getScriptLock();
  verrou.waitLock(10000);
  let lignes;
  try { lignes = feuille().getDataRange().getValues().slice(1); } finally { verrou.releaseLock(); }
  return json(lignes.map((l, i) => ({
    id: 'f' + (i + 2), event: 'message', time: Math.floor(new Date(l[0]).getTime() / 1000),
    title: String(l[1]), message: String(l[2]), tags: String(l[3]).split(',').filter(String),
  })));
}

// La feuille « Visites du carnet de plongée » : créée toute seule la
// première fois, dans ton Google Drive (ou celle où le script est collé).
function feuille() {
  let ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (!ss) {
    const props = PropertiesService.getScriptProperties();
    const id = props.getProperty('FEUILLE');
    if (id) ss = SpreadsheetApp.openById(id);
    else { ss = SpreadsheetApp.create('Visites du carnet de plongée'); props.setProperty('FEUILLE', ss.getId()); }
  }
  let f = ss.getSheetByName('Visites');
  if (!f) {
    f = ss.insertSheet('Visites');
    f.appendRow(['Quand', 'Quoi', 'Détail', 'Étiquettes']);
    f.setFrozenRows(1);
    f.setColumnWidth(2, 260); f.setColumnWidth(3, 420);
  }
  return f;
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
`;
}

/**
 * Écrit un message dans la feuille (côté visiteur : sans clé, sans lire
 * la réponse). Ne lève jamais.
 * @param {string} url  l'adresse du script
 * @param {{titre, corps, tags}} m
 */
export function posterFeuille(url, m, { fin = false } = {}) {
  if (!estAdresseFeuille(url)) return false;
  const u = `${url}?title=${encodeURIComponent(m.titre)}&tags=${encodeURIComponent(m.tags.join(','))}`;
  try {
    if (fin && typeof navigator !== 'undefined' && navigator.sendBeacon) return navigator.sendBeacon(u, m.corps);
    fetch(u, { method: 'POST', mode: 'no-cors', body: m.corps, keepalive: true }).catch(() => {});
    return true;
  } catch { return false; }
}

/** Relit la feuille (côté propriétaire, avec la clé) → les messages bruts. */
export async function lireFeuille(url, cle, f = fetch) {
  if (!estAdresseFeuille(url) || !cle) return [];
  const r = await f(`${url}?cle=${encodeURIComponent(cle)}`);
  if (!r.ok) throw new Error(`La feuille a répondu ${r.status}`);
  const d = JSON.parse(await r.text());
  if (!Array.isArray(d)) throw new Error(d?.erreur === 'clé' ? 'La feuille refuse la clé : recopie le script depuis l’appli.' : 'Réponse inattendue de la feuille');
  return d;
}
