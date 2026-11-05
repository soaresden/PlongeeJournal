# Carnet de plongée

Un carnet de plongée numérique qui reprend le carnet papier, pensé pour le
téléphone et la tablette d'abord, utilisable sur PC.

**Ton carnet est un fichier JSON dans un dépôt GitHub privé à toi**
(`soaresden/PlongeeJournal-data`). Le site, l'APK Android et le PC le lisent et
l'écrivent en direct : une plongée saisie sur le bateau apparaît sur la tablette
le soir. Chaque modification est un commit — tout l'historique est gardé.

Site statique : pas de build, pas de framework. JavaScript natif, Leaflet
(embarqué dans `vendor/`) pour les cartes.

---

## Où est quoi

| | Dépôt | Visibilité |
|---|---|---|
| **Le code** (ce dépôt) | `soaresden/PlongeeJournal` | public — sert le site et compile l'APK, ne contient **aucune donnée** |
| **Tes plongées** | `soaresden/PlongeeJournal-data` → `carnet.json` | **privé** |

Le site : **https://soaresden.github.io/PlongeeJournal/**
L'APK : **https://github.com/soaresden/PlongeeJournal/releases/latest/download/PlongeeJournal.apk**

---

## Brancher un appareil (une fois par appareil)

1. Crée un **jeton d'accès à grain fin** (Fine-grained token) sur GitHub :
   *Repository access* → *Only select repositories* → `PlongeeJournal-data` ;
   *Permissions* → *Contents* → **Read and write**. Rien d'autre.
2. Dans l'app : **Réglages → Dépôt GitHub privé**, colle le jeton, **Connecter**.

Le jeton reste sur l'appareil. Il ne donne accès qu'au dépôt du carnet ; tu peux
le révoquer à tout moment depuis GitHub.

Sans jeton, l'app marche quand même, en **mode local** : tout reste sur
l'appareil.

---

## À l'ouverture, tu sais où tu en es

Un bandeau le dit, puis une pastille reste en haut à droite :

| Pastille | Signification |
|---|---|
| ☁ **GitHub** (vert) | Synchronisé : chaque modification part en ~1 s |
| ⟳ **En attente** (orange) | Des modifications n'ont pas encore été envoyées |
| **Hors ligne** | GitHub injoignable : tu travailles sur la copie de l'appareil, tout partira au retour du réseau |
| ▯ **Local** (pointillés) | Aucun dépôt branché : données sur cet appareil uniquement |
| ⚠ **Erreur** (rouge) | Jeton refusé, dépôt introuvable… le détail est dans Réglages |

Touche la pastille pour forcer une synchronisation.

### Deux appareils, pas de réseau

Chaque appareil garde une copie complète. Quand ils retrouvent GitHub, les deux
versions sont **fusionnées**, jamais écrasées : à identifiant égal, la fiche
modifiée le plus récemment gagne ; une suppression laisse une trace datée pour
qu'une vieille copie ne fasse pas réapparaître la plongée.

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

**Thèmes** — Plongée, Abysse, Clair, Cousteau, Plage, Eau turquoise, Récif corallien, Épave, Forêt de kelp, ou Automatique (suit l'appareil). Choix propre à chaque appareil.

**Téléphone, tablette, PC** — onglets en bas sur téléphone, rail latéral sur tablette, liste et fiches en colonnes en paysage.

**PWA et APK** — installable depuis le site, ou en APK Android ; utilisable hors connexion.

---

## Installer l'APK Android

Ouvre le lien de l'APK sur le téléphone ou la tablette, télécharge, ouvre le
fichier, autorise l'installation depuis cette source. Les mises à jour
s'installent par-dessus (même clé de signature) : les réglages et la copie
locale sont conservés.

L'APK est compilé par **GitHub Actions** (`.github/workflows/android.yml`) à
chaque modification du code, avec Capacitor : les fichiers de l'app sont
embarqués, seul le carnet passe par le réseau.

La clé de signature est dans les secrets du dépôt (`ANDROID_KEYSTORE_B64`,
`ANDROID_KEYSTORE_PASS`). **Garde une copie de `signature-android/`** (hors Git) :
sans elle, une future version ne pourra plus s'installer par-dessus l'ancienne.

---

## Sur le PC

Le plus simple : le site. Sinon, double-clic sur **`lancer.bat`** (demande
Python) qui sert l'app sur `http://localhost:8080/`. Chaque adresse (site,
localhost, APK) a sa propre mémoire : branche le jeton une fois dans chacune.

---

## Organisation des fichiers

```
index.html  css/  js/        ← l'application
  js/store-github.js         ← synchro : copie locale + dépôt GitHub
  js/github.js               ← appels à l'API GitHub (contents)
  js/fusion.js               ← fusion de deux versions du carnet
  js/theme.js, css/themes.css← les thèmes
vendor/leaflet/              ← Leaflet 1.9.4, embarqué pour le hors ligne
capacitor.config.json        ← l'APK
.github/workflows/android.yml← compilation et publication de l'APK
outils/                      ← tests, génération www/ et icônes Android
lancer.bat                   ← l'app sur le PC, sans Internet pour le code
```

---

## Tests

```bash
npm test                         # tout ce qui suit sauf smoke
node outils/dive-test.mjs        # 159  règles métier : durées, paliers, niveaux, conso, PMU
node outils/smoke.mjs            # 118  tous les écrans, dans un vrai DOM (npm i jsdom)
node outils/github-test.mjs      #  35  synchro GitHub : création, conflits, suppressions, hors ligne
node outils/lieu-test.mjs        #  30  recherche de lieux, cadrage des cartes
node outils/fit-test.mjs         #  27  décodage des fichiers .fit
node outils/geo-test.mjs         #  22  eau douce / salée, altitude
node outils/stamp-test.mjs       #  13  détourage des tampons
```

`github-test.mjs` tourne contre un faux GitHub en mémoire : aucun jeton, aucun
réseau.

---

## Choix techniques, et pourquoi

**Un fichier JSON plutôt qu'une base.** Une plongée fait quelques centaines
d'octets. Un fichier JSON se lit dans trente ans, avec n'importe quoi — et sur
GitHub il est versionné gratuitement.

**Code public, données privées.** GitHub Pages ne sert pas un dépôt privé sur un
compte gratuit. Le code ne contient rien de personnel ; le carnet, lui, est dans
un dépôt privé que seul ton jeton peut lire.

**Le jeton ne quitte pas l'appareil.** Il n'est écrit ni dans le carnet, ni dans
le code ; il n'est envoyé qu'à `api.github.com`.

**La copie locale d'abord.** L'app s'ouvre sur la copie de l'appareil, puis
consulte GitHub : jamais d'écran blanc parce que le réseau est lent.

**Les cartes partent d'une distance, pas d'un niveau de zoom.** La fiche d'une
plongée demande « 3 km de large » et le zoom en est déduit, quelle que soit la
taille de l'écran ou la latitude.

**Le nom des espèces n'est jamais codé en dur.** Les listes viennent
d'iNaturalist et de WoRMS, filtrées sur les indicateurs d'habitat.

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
  client. L'import `.fit` la remplace.
- **Deux appareils qui modifient la même plongée** hors ligne : à la fusion, la
  dernière modification de la fiche gagne (fiche entière, pas champ par champ).
- Dans l'APK, **l'export d'un fichier** passe par le menu Partager d'Android.

---

## Licence

Usage personnel. Recopie, modifie, adapte à ton propre carnet.
