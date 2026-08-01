// Vérifie le chargement de credentials.json et ses garde-fous.
import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;

const results = [];
const check = (name, cond, extra = '') =>
  results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

// --- localStorage minimal ---
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};

let served = null;
globalThis.fetch = async () => (served === null
  ? { ok: false, status: 404 }
  : { ok: true, json: async () => served });

const errs = [];
console.error = (...a) => errs.push(a.join(' '));
console.info = () => {};

const mod = () => import(path.join(ROOT, 'js/settings.js') + `?v=${Math.random()}`);

// --- 1. Fichier absent (cas GitHub Pages) ---
served = null;
let s = await mod();
await s.loadLocalCredentials();
check('fichier absent : pas de plantage, rien de configuré', !s.isSupabaseConfigured());

// --- 2. Nouveau format : ProjectID + APIKeys_* ---
mem.clear();
served = {
  ProjectID: 'abcdefghijklmnopqrst',
  APIKeys_Publishable: 'sb_publishable_OK',
  APIKeys_SecretKey: '',
  APIKeys_GoogleMaps: 'gmk',
};
s = await mod();
await s.loadLocalCredentials();
check('ProjectID converti en URL',
  s.settings().supabaseUrl === 'https://abcdefghijklmnopqrst.supabase.co', s.settings().supabaseUrl);
check('APIKeys_Publishable chargée', s.settings().supabaseKey === 'sb_publishable_OK');
check('APIKeys_GoogleMaps chargée', s.settings().googleMapsKey === 'gmk');
check('Supabase considéré configuré', s.isSupabaseConfigured());

// --- 2 bis. Conversions Project ID <-> URL ---
check('URL complète acceptée telle quelle',
  s.toSupabaseUrl('https://zzzz1111.supabase.co/') === 'https://zzzz1111.supabase.co');
check('hôte sans schéma accepté',
  s.toSupabaseUrl('zzzz1111.supabase.co') === 'https://zzzz1111.supabase.co');
check('http forcé en https',
  s.toSupabaseUrl('http://zzzz1111.supabase.co') === 'https://zzzz1111.supabase.co');
check('projectId() retrouve l’identifiant',
  s.projectId('https://abcdefghijklmnopqrst.supabase.co') === 'abcdefghijklmnopqrst');
check('valeur vide → chaîne vide', s.toSupabaseUrl('') === '' && s.toSupabaseUrl(null) === '');

// --- 3. Clé secrète mise par erreur dans le champ publiable ---
mem.clear(); errs.length = 0;
served = { ProjectID: 'abcdefghijklmnopqrst', APIKeys_Publishable: 'sb_secret_DANGER' };
s = await mod();
await s.loadLocalCredentials();
check('clé secrète refusée', s.settings().supabaseKey === '', s.settings().supabaseKey);
check('clé secrète signalée dans la console', errs.some(e => e.includes('SECRÈTE')), errs.join('|'));
check('ProjectID quand même conservé',
  s.settings().supabaseUrl === 'https://abcdefghijklmnopqrst.supabase.co');

// --- 3 bis. APIKeys_SecretKey renseigné : ignoré, jamais utilisé ---
mem.clear(); errs.length = 0;
const warns = [];
console.warn = (...a) => warns.push(a.join(' '));
served = {
  ProjectID: 'abcdefghijklmnopqrst',
  APIKeys_Publishable: 'sb_publishable_OK',
  APIKeys_SecretKey: 'sb_secret_NEDOITJAMAISSERVIR',
};
s = await mod();
await s.loadLocalCredentials();
check('APIKeys_SecretKey ignoré par l’app', s.settings().supabaseKey === 'sb_publishable_OK');
check('APIKeys_SecretKey absent des réglages enregistrés',
  !JSON.stringify(s.settings()).includes('NEDOITJAMAISSERVIR'), JSON.stringify(s.settings()));
check('présence du secret signalée', warns.some(w => w.includes('APIKeys_SecretKey')), warns.join('|'));

// --- 3 ter. Ancien format encore accepté ---
mem.clear();
served = { supabaseUrl: 'https://legacy0000legacy.supabase.co', supabaseKey: 'sb_publishable_OLD' };
s = await mod();
await s.loadLocalCredentials();
check('ancien format (supabaseUrl/supabaseKey) toujours lu',
  s.isSupabaseConfigured() && s.settings().supabaseKey === 'sb_publishable_OLD');

// --- 4. Fichier vide (modèle non rempli) ---
mem.clear();
served = { ProjectID: '', APIKeys_Publishable: '' };
s = await mod();
await s.loadLocalCredentials();
check('fichier non rempli : reste non configuré', !s.isSupabaseConfigured());

// --- 5. Un seul chargement, même appelé deux fois ---
mem.clear();
let calls = 0;
globalThis.fetch = async () => { calls++; return { ok: true, json: async () => ({ APIKeys_Publishable: 'sb_publishable_X' }) }; };
s = await mod();
await s.loadLocalCredentials();
await s.loadLocalCredentials();
check('fichier lu une seule fois', calls === 1, String(calls));

// --- 6. Les fichiers réels du dépôt sont cohérents ---
const fs = await import('node:fs');
const real = JSON.parse(fs.readFileSync(path.join(ROOT, 'credentials.json'), 'utf8'));
const modele = JSON.parse(fs.readFileSync(path.join(ROOT, 'credentials.example.json'), 'utf8'));

// La clé secrète dans le champ « Publishable » serait une vraie erreur.
check('credentials.json : pas de clé secrète dans le champ publiable',
  !String(real.APIKeys_Publishable || '').includes('sb_secret_'));

// Dans son propre champ, c'est un choix assumé : simple avertissement.
const avertissements = [];
if (real.APIKeys_SecretKey) {
  avertissements.push(
    'credentials.json contient une clé secrète (APIKeys_SecretKey).\n'
  + '        L\'app ne s\'en sert pas, et le fichier est ignoré par git — mais elle reste\n'
  + '        lisible sur http://localhost:8080/credentials.json quand le serveur tourne.\n'
  + '        Laisse le champ vide si tu n\'en as pas l\'usage immédiat.');
}
check('credentials.json : pas de mot de passe de base',
  !Object.keys(real).some(k => /password|mot_de_passe|dbpass/i.test(k)));
check('credentials.json : champs attendus présents',
  'ProjectID' in real && 'APIKeys_Publishable' in real, Object.keys(real).join(','));
check('credentials.example.json : mêmes champs que le vrai fichier',
  ['ProjectID', 'APIKeys_Publishable', 'APIKeys_SecretKey'].every(k => k in modele),
  Object.keys(modele).join(','));

// --- 7. .gitignore protège bien le fichier ---
const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
check('.gitignore couvre credentials.json', /^credentials\.json$/m.test(ignore));
check('.gitignore laisse passer le modèle', /^!credentials\.example\.json$/m.test(ignore));

console.log(results.join('\n'));
avertissements.forEach(a => console.log('\n  ⚠  ' + a));
const failed = results.filter(r => r.startsWith(' FAIL')).length;
console.log(failed ? `\n${failed} test(s) en échec` : '\nTous les tests credentials passent.');
process.exit(failed ? 1 : 0);
