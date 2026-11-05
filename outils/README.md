# Outils

Rien ici n'est nécessaire pour utiliser le carnet : ce sont les tests et la
fabrication de l'APK.

| Script | Rôle |
|---|---|
| `dive-test.mjs` | règles métier : durées, paliers, niveaux, consommation, PMU |
| `github-test.mjs` | synchro GitHub contre un faux GitHub en mémoire |
| `smoke.mjs` | tous les écrans dans un DOM simulé (`npm i jsdom`) |
| `fit-test.mjs` | décodage des fichiers `.fit` d'ordinateur de plongée |
| `ocean-test.mjs` | Suunto Ocean en Bluetooth : trames, Heatshrink, décodage d'une vraie plongée (`fixtures/`), session contre une fausse montre |
| `seance-test.mjs` | séances (fosse, piscine, apnée) : stockage, fusion, tri des activités de la montre |
| `maj-apk-test.mjs` | bouton « Mise à jour » de l’APK : numéro embarqué, comparaison avec la release GitHub |
| `geo-test.mjs` | eau douce / salée, altitude |
| `lieu-test.mjs` | recherche de lieux, cadrage des cartes |
| `stamp-test.mjs` | détourage des tampons photographiés |
| `build-www.mjs` | copie l'app dans `www/` pour Capacitor |
| `android-icones.py` | pose les icônes et l'écran de lancement dans le projet Android |

```bash
npm test            # tout sauf smoke
node outils/smoke.mjs
```

L'APK lui-même est compilé par GitHub Actions (`.github/workflows/android.yml`).
