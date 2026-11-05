// Copie l'application dans www/, le dossier que Capacitor embarque dans l'APK.
// Le site web, lui, est servi tel quel depuis la racine par GitHub Pages.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SORTIE = path.join(ROOT, 'www');
const A_COPIER = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'assets', 'vendor'];

fs.rmSync(SORTIE, { recursive: true, force: true });
fs.mkdirSync(SORTIE);
for (const nom of A_COPIER) {
  fs.cpSync(path.join(ROOT, nom), path.join(SORTIE, nom), { recursive: true });
}
// MN90 (les outils de plongée) embarqué dans www/mn90, pour marcher sans
// réseau. Sans le simulateur 3D (90 Mo) ni la doc : le simulateur
// renvoie vers la version en ligne.
const MN90_SOURCES = [process.env.MN90_SRC, path.join(ROOT, 'mn90src'), path.join(ROOT, '..', 'MN90Mobile')];
const MN90 = MN90_SOURCES.find(d => d && fs.existsSync(path.join(d, 'index.html')));
const MN90_SANS = new Set(['.git', '.github', '.claude', '3dassist', 'references', 'docs', 'wear', 'release', 'tools', 'README.md']);
if (MN90) {
  const cible = path.join(SORTIE, 'mn90');
  fs.cpSync(MN90, cible, {
    recursive: true,
    filter: src => {
      // Sous Windows, cpSync passe des chemins « \\?\D:\… » : on retire le préfixe.
      const rel = path.relative(path.resolve(MN90), path.resolve(src.replace(/^\\\\\?\\/, '')));
      return !rel || (!MN90_SANS.has(rel.split(path.sep)[0]) && !/\.(glb|glbb|mp3)$/i.test(rel));
    },
  });
  fs.mkdirSync(path.join(cible, '3dassist'));
  fs.writeFileSync(path.join(cible, '3dassist', 'index.html'), `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Simulateur 3D</title>
<meta http-equiv="refresh" content="0; url=https://soaresden.github.io/MN90Mobile/3dassist/index.html">
<style>body{font-family:system-ui,sans-serif;background:#04273a;color:#e6f4fa;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:20px}a{color:#7fd8f5}</style>
</head><body><p>Le simulateur 3D est trop lourd pour l’appli :<br>il s’ouvre en ligne (réseau nécessaire).<br><br>
<a href="https://soaresden.github.io/MN90Mobile/3dassist/index.html">Ouvrir le simulateur</a> · <a href="../index.html">Retour</a></p></body></html>
`);
  console.log(`mn90/ embarqué depuis ${path.relative(ROOT, MN90) || '.'}`);
} else if (process.env.CI) {
  console.error('MN90 introuvable (mn90src/ ou ../MN90Mobile) : l’onglet MN90 ne marcherait pas hors ligne.');
  process.exit(1);
} else {
  console.warn('MN90 introuvable : www/mn90 absent (l’onglet MN90 restera vide dans l’APK).');
}

// Numéro de version embarqué : l'APK le compare à la dernière release
// GitHub pour proposer la mise à jour. Hors GitHub Actions : build null.
const run = Number(process.env.GITHUB_RUN_NUMBER);
const version = {
  build: Number.isInteger(run) && run > 0 ? run : null,
  version: Number.isInteger(run) && run > 0 ? `2.0.${run}` : null,
  commit: (process.env.GITHUB_SHA || '').slice(0, 7) || null,
  date: new Date().toISOString(),
};
fs.writeFileSync(path.join(SORTIE, 'version.json'), JSON.stringify(version, null, 2));
console.log(`version.json : ${version.version || 'build local'}`);
console.log(`www/ prêt (${A_COPIER.join(', ')})`);
