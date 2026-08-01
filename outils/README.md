# Outils de vérification

Ces scripts ne servent qu'au développement — l'app, elle, n'a aucune dépendance.

```bash
npm i jsdom          # uniquement pour smoke.mjs
node outils/fit-test.mjs
node outils/smoke.mjs
```

- `fit-test.mjs` fabrique un vrai fichier FIT de plongée (descente, palier au
  fond, remontée avec arrêts à 6 puis 3 m), puis vérifie que le décodeur en
  retire les bonnes valeurs, y compris la fusion de deux enregistrements.
- `smoke.mjs` charge l'application entière dans un DOM simulé et parcourt tous
  les écrans, en vérifiant le contenu affiché.
