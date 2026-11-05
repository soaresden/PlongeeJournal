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
console.log(`www/ prêt (${A_COPIER.join(', ')})`);
