// Vérifie que le lien de réinitialisation ne se confond jamais avec
// les routes de l'application (les deux vivent dans le hash).
import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;

const results = [];
const check = (name, cond, extra = '') =>
  results.push((cond ? '  OK  ' : ' FAIL ') + name + (cond ? '' : ' -> ' + extra));

// settings.js est importé par supabase.js : il lui faut localStorage.
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};

const { parseRecoveryParams } = await import(path.join(ROOT, 'js/supabase.js'));

// ---------- Routes normales : jamais prises pour un lien ----------
for (const route of ['#/dives', '#/dive/abc-123', '#/setup', '#/verrou',
                     '#/suunto?ok=1', '#/dive/new', '', '#']) {
  const r = parseRecoveryParams(route, '');
  check(`route « ${route || '(vide)'} » ignorée`, r.kind === 'none', r.kind);
}

// ---------- Flux implicite : jetons dans le hash ----------
const hashTokens = '#access_token=eyJAAA&expires_in=3600&refresh_token=RRRR'
                 + '&token_type=bearer&type=recovery';
let r = parseRecoveryParams(hashTokens, '');
check('jetons reconnus', r.kind === 'tokens', r.kind);
check('access_token extrait', r.access === 'eyJAAA', r.access);
check('refresh_token extrait', r.refresh === 'RRRR', r.refresh);
check('type recovery conservé', r.type === 'recovery', r.type);

// access_token seul, sans refresh : incomplet, on ne tente rien
r = parseRecoveryParams('#access_token=eyJAAA&type=recovery', '');
check('jeton incomplet ignoré', r.kind === 'none', r.kind);

// ---------- Flux PKCE : code dans la query ----------
r = parseRecoveryParams('', '?code=abc-def-123');
check('code PKCE reconnu', r.kind === 'code', r.kind);
check('code extrait', r.code === 'abc-def-123', r.code);

r = parseRecoveryParams('#/dives', '?code=abc-def-123');
check('code reconnu même avec une route dans le hash', r.kind === 'code', r.kind);

// ---------- Erreurs renvoyées par Supabase ----------
r = parseRecoveryParams('#error=access_denied&error_description=Email%20link%20is%20invalid%20or%20has%20expired', '');
check('erreur détectée', r.kind === 'error', r.kind);
check('message décodé', r.message === 'Email link is invalid or has expired', r.message);

r = parseRecoveryParams('', '?error_description=Token%20expired');
check('erreur en query détectée', r.kind === 'error' && r.message === 'Token expired', JSON.stringify(r));

// ---------- Priorité : une erreur prime sur des jetons ----------
r = parseRecoveryParams('#access_token=A&refresh_token=B&error_description=Nope', '');
check('erreur prioritaire sur les jetons', r.kind === 'error', r.kind);

// ---------- Robustesse ----------
check('arguments absents tolérés', parseRecoveryParams().kind === 'none');
check('hash sans # toléré',
  parseRecoveryParams('access_token=A&refresh_token=B').kind === 'tokens');

// ---------- Le motif de détection utilisé au démarrage ----------
// app.js n'appelle consumeRecovery que si l'URL y ressemble : on vérifie
// que ce filtre laisse bien passer les vrais liens et bloque les routes.
const ressemble = (h, s = '') => /access_token=|error_description=/.test(h) || /[?&]code=/.test(s);
check('filtre : laisse passer les jetons', ressemble(hashTokens));
check('filtre : laisse passer le code PKCE', ressemble('', '?code=xyz'));
check('filtre : laisse passer une erreur', ressemble('#error_description=oops'));
check('filtre : bloque les routes', !ressemble('#/dives') && !ressemble('#/dive/new'));
check('filtre : ne confond pas un id contenant « code »',
  !ressemble('#/dive/decode-123'), 'faux positif');

console.log(results.join('\n'));
const failed = results.filter(x => x.startsWith(' FAIL')).length;
console.log(failed ? `\n${failed} test(s) en échec` : '\nTous les tests d’authentification passent.');
process.exit(failed ? 1 : 0);
