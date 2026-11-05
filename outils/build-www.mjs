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
