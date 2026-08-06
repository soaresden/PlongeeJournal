# Carnet de plongée

Un carnet de plongée numérique qui reprend le carnet papier, pensé pour le
téléphone d'abord et utilisable sur PC.

**Ton carnet est un fichier.** `donnees/carnet.json`, sur ton disque. Pas de
compte, pas de mot de passe, pas de base de données, pas de service en ligne.
Rien à payer, rien qui puisse fermer, rien à créer avant de commencer : tu
lances, tu saisis ta première plongée.

Site statique : pas de build, pas de framework, pas de `npm install`.
JavaScript natif, Leaflet pour les cartes, et un serveur Python qui n'utilise
que la bibliothèque standard.

---

## Démarrer

Double-clic sur **`lancer.bat`**. C'est tout.

Prérequis : [Python](https://www.python.org/downloads/), en cochant *Add Python
to PATH* pendant l'installation. Aucune autre dépendance.

Au lancement, le serveur :

1. importe ce qui attend dans `PlongeeAImporter/` — les plongées saisies au
   téléphone — et archive les fichiers traités dans `PlongeeAImporter/importes/`
2. ouvre le carnet dans le navigateur
3. affiche l'adresse à utiliser **depuis le téléphone**, du type
   `http://192.168.1.42:8080/`

Au premier lancement, le carnet est vide et l'app propose de créer ton profil
de plongeur. Il n'y a aucune étape de configuration.

---

## Les trois façons d'utiliser le carnet

L'application détecte toute seule dans quelle situation elle se trouve.

| Situation | Ce qui se passe |
|---|---|
| **PC allumé** | Écriture directe dans `carnet.json`. Rien à faire. |
| **Téléphone, même Wi-Fi que le PC** | Pareil : lecture et écriture directes. Ouvre l'adresse affichée par la fenêtre noire. |
| **Téléphone, loin du PC** | Tout le carnet reste consultable. Une saisie produit un fichier `plongeeNoXXXX-aaaammjj_hhmm.json` à déposer dans `PlongeeAImporter/`. |

Le troisième cas est celui du bateau ou du bord de route. Au moment
d'enregistrer, l'app propose le téléchargement du fichier. Si tu refuses, la
plongée n'est pas perdue : elle reste en attente, et l'écran **Réglages** liste
ce qui n'est pas encore rapatrié pour tout exporter d'un coup.

Et si le téléphone retrouve le PC sur le Wi-Fi, les saisies en attente montent
toutes seules — tu n'as aucun fichier à déplacer.

### Consulter le carnet depuis n'importe où

Mets le dossier du projet dans pCloud (ou Dropbox, ou un dossier partagé).
`donnees/` est synchronisé avec le reste ; depuis le téléphone, ouvre
`index.html` via le partage : tu obtiens le carnet complet en lecture seule,
sans PC allumé.

---

## Ce que ça fait

**Saisie d'une plongée** — le formulaire suit le carnet papier, en entonnoir :
la plongée, le lieu et l'environnement, le profil, les paliers, les plongeurs,
les spécificités, la bouteille, le matériel, ce qu'on a vu, les comptes-rendus.
Chaque section se replie.

**Le lieu** — recherche par nom avec autocomplétion (le libellé cherché est
toujours conservé), ou GPS, puis affinage en cliquant dans l'eau. Le type d'eau
(douce, saumâtre, salée) et l'altitude sont reconnus automatiquement à partir du
point choisi, via OpenStreetMap.

**Ce que j'ai vu** — faune, flore et épaves proposées d'après le lieu de
plongée, avec photo, depuis iNaturalist et l'OSM. On coche, sans rien connaître
aux poissons. Les espèces sont filtrées par habitat réel (marin, saumâtre, eau
douce) pour ne pas proposer une mouette au fond d'une carrière.

**La palanquée** — compagnons en chips depuis une table de plongeurs, moniteurs
en doré, clubs et structures traités comme des entités à part. Tampons
photographiés et détourés automatiquement, ou signature au doigt.

**Le calendrier** — quatre échelles (tout le carnet, une année, un mois, une
période libre par dates ou par numéros), filtrables par compagnon. La grille
choisit son orientation pour donner les plus gros carrés possibles et ne jamais
déborder de l'écran.

**La carte** — tous les points plongés, regroupés par lieu, taille du repère
proportionnelle au nombre de plongées.

**Import `.fit`** — un fichier d'ordinateur de plongée (Suunto, Garmin,
Shearwater) est décodé dans le navigateur, profil de profondeur inclus.
Plusieurs fichiers peuvent être fusionnés en une plongée quand un passage en
surface a coupé l'enregistrement.

**Calculs** — consommation d'air (brute et ramenée à la surface), profondeur
maximale opérationnelle d'un nitrox, niveau courant déduit des cartes de
certification, statistiques du carnet.

**Fiche d'urgence** — groupe sanguin, contact d'alarme, numéros de secours,
lisible sans rien déverrouiller ni aucun réseau.

**PWA** — installable sur le téléphone, utilisable hors connexion.

---

## Organisation des fichiers

```
lancer.bat              ← le double-clic
serveur/plongee.py      ← le serveur local (450 lignes, bibliothèque standard)
index.html  css/  js/   ← l'application
donnees/
  carnet.json           ← TON CARNET
  medias/               ← tampons et signatures
  sauvegardes/          ← les 40 versions précédentes, horodatées
PlongeeAImporter/       ← dépose ici les fichiers venus du téléphone
  importes/             ← ceux déjà traités, gardés au cas où
outils/                 ← les tests
```

`donnees/` et `PlongeeAImporter/` sont dans `.gitignore` : tes plongées ne
partent jamais sur GitHub.

---

## Sauvegardes

Le serveur copie `carnet.json` dans `donnees/sauvegardes/` **avant chaque
écriture** et garde les 40 dernières. L'écriture elle-même est atomique
(fichier temporaire puis remplacement) : une coupure au mauvais moment ne peut
pas produire un carnet à moitié écrit.

Si `carnet.json` devient illisible, le serveur **refuse de l'écraser** et le dit
au démarrage. Les sauvegardes sont juste à côté.

L'écran Réglages permet aussi d'exporter tout le carnet en un fichier, et d'en
réimporter un.

---

## Tests

```bash
node outils/dive-test.mjs        # 159  règles métier : durées, paliers, niveaux, conso, PMU
node outils/smoke.mjs            # 115  tous les écrans, dans un vrai DOM
python3 outils/serveur-test.py   #  50  serveur, import, et ce qu'il doit refuser
node outils/fichier-test.mjs     #  30  les trois modes, et le trajet d'une saisie
node outils/lieu-test.mjs        #  30  recherche de lieux, cadrage des cartes
node outils/fit-test.mjs         #  27  décodage des fichiers .fit
node outils/geo-test.mjs         #  22  eau douce / salée, altitude
node outils/stamp-test.mjs       #  13  détourage des tampons
```

**446 vérifications.** `smoke.mjs` demande `jsdom` (`npm i jsdom`), les autres
ne demandent rien.

`fichier-test.mjs` et `serveur-test.py` se recouvrent volontairement sur le
format d'échange : c'est ce qui empêche le navigateur et le serveur de diverger
en silence. Ce recouvrement a déjà attrapé une vraie divergence de nom de champ.

---

## Choix techniques, et pourquoi

**Un fichier JSON plutôt qu'une base.** Une plongée fait quelques centaines
d'octets, une ou deux fois par mois. Une base de données servirait surtout à
créer une dépendance à un service qui peut changer d'avis sur ses tarifs ou son
existence. Un fichier JSON se lit dans trente ans, avec n'importe quoi.

**Un serveur sans dépendances.** Il fait trois choses : servir des fichiers,
lire et écrire le carnet, vider le dossier d'import. Aucun paquet à installer,
donc rien qui casse à la prochaine mise à jour de quoi que ce soit.

**Pas de compte, pas de mot de passe.** Le carnet est sur ton disque, derrière
la session de ton ordinateur. Une authentification n'aurait protégé que contre
quelqu'un ayant déjà accès à la machine.
⚠️ En revanche, le serveur écoute sur le réseau local **sans authentification**
pendant qu'il tourne. Chez toi c'est sans conséquence ; sur un Wi-Fi public ou
de club, ferme la fenêtre quand tu as fini.

**Les images à côté, pas dedans.** Un tampon fait 30 à 80 Ko. En base64 dans le
carnet, 200 plongées donneraient un fichier de plus de 20 Mo, à retélécharger
en entier à chaque ouverture sur le téléphone. Ils vivent donc dans
`donnees/medias/`.

**Dernière modification gagnante.** Quand deux versions d'une même plongée se
rencontrent, celle dont l'`updatedAt` est le plus récent l'emporte. La règle est
écrite deux fois — navigateur et serveur — et testée des deux côtés.

**Les cartes partent d'une distance, pas d'un niveau de zoom.** Écrire
`zoom: 13` ne veut rien dire : à cette valeur un téléphone couvre 1,5 km et un
écran de PC 5 km, et la même carte est deux fois plus large à Marseille qu'à
Oslo — la résolution dépend de la latitude. La fiche d'une plongée demande donc
« 3 km de large » et le zoom en est déduit. Une vignette de situation à 400 km
répond à « c'est où, ça ? », et des étiquettes de lieux sont posées sur l'image
satellite, sans quoi un site de plongée n'est qu'une tache d'eau bleue.

**Le nom des espèces n'est jamais codé en dur.** Les listes viennent
d'iNaturalist et de WoRMS à chaque fois, filtrées sur les indicateurs d'habitat.
Aucune liste de poissons ne dort dans le code.

---

## Limites connues

- Les **paliers importés d'un `.fit`** sont estimés à partir du profil de
  profondeur : la montre enregistre « telle profondeur à telle seconde », pas
  « palier ». À vérifier à la main.
- La **profondeur moyenne** est estimée à 60 % de la profondeur maximale quand
  elle n'a pas été importée. Le calcul de consommation le signale.
- Les **données d'espèces en eau douce** sont réellement peu fournies dans
  iNaturalist. L'app élargit la recherche automatiquement et le dit.
- Le regroupement des lieux sur la carte se fait à ~100 m : deux mouillages
  distincts d'un même site sont fondus en un seul repère.
- L'**API Suunto** n'est pas utilisée : elle exige un serveur détenant un secret
  client, donc un service en ligne. L'import `.fit` la remplace et fonctionne
  sans rien demander à personne.

---

## Licence

Usage personnel. Recopie, modifie, adapte à ton propre carnet.
