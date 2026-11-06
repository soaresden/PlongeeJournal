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
toujours conservé), ou GPS, puis affinage en cliquant dans l'eau. Les structures de plongée
de la zone (centres, clubs, sites nommés d'OpenStreetMap) s'affichent d'office
sur la carte (🤿) : en toucher une y met le point. Eau douce
ou salée et altitude sont reconnues automatiquement à partir du point, via
OpenStreetMap — y compris pour les plongées importées de la montre, en tâche
de fond à l'ouverture. On ne choisit à la main que pour corriger.

**Ce que j'ai vu** — faune, flore et épaves proposées d'après le lieu de
plongée, avec photo, depuis iNaturalist et l'OSM. On coche, sans rien connaître
aux poissons. Les espèces sont filtrées par habitat réel (marin, saumâtre, eau
douce) pour ne pas proposer une mouette au fond d'une carrière.

**La palanquée** — compagnons en chips depuis une table de plongeurs, moniteurs
en doré (« MON ») : c'est la palanquée qui dit qui est moniteur, pas un second
menu. Le tampon et la signature, eux, se voient sur la photo de la page du
carnet papier.

**Le centre de plongée** — un seul champ : on tape son nom ou son adresse,
les centres déjà notés et ceux d'OpenStreetMap autour du lieu sont proposés,
choisir remplit le nom et l'adresse. « Sur la carte » : on zoome sur
l'endroit, on écrit « plongée » ou « dive », les centres de la zone
s'affichent, on touche le bon.

**Retrouver les plongeurs dans un texte** — un texte en vrac (le carnet
recopié, un message, tes notes : « plongé avec jullie et Marc, 6 kg,
froid ») : les plongeurs connus sont retrouvés même mal orthographiés, un
nouveau nom est repéré après « avec ». Rien n'est ajouté sans qu'on touche.

**Numérotation** — automatique : les numéros suivent les dates (la plus
ancienne est la n°1), à chaque ajout, suppression ou import. Les baptêmes
(niveau « Baptême ») restent à part, en -2, -1.

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

**Import depuis la montre (Bluetooth)** — une Suunto Ocean (ou Nautic) est lue
directement : date, durée, profondeurs, températures, profil, pression du
Tank POD, gaz, gradients, position GPS de la mise à l'eau. Les plongées déjà
importées (en `.fit` ou en Bluetooth) sont reconnues. Voir
[Appairer la montre](#appairer-la-montre-suunto-ocean).

**Compte Suunto (tout l'historique)** — avec l'API officielle Suunto (accès
partenaire). Réglages → « Compte Suunto » : les trois clés de l'appli Suunto
(profil API Zone), puis « Connecter mon compte Suunto », **depuis le site sur le
PC** ; adresse de retour à déclarer dans API Zone :
`https://soaresden.github.io/PlongeeJournal/`. Les clés et les jetons vivent dans
`suunto.json`, à côté du carnet dans le dépôt privé (pas dedans) : le téléphone
les retrouve seul. La récupération se fait **dans l'APK** (le serveur des
activités de Suunto refuse les pages web) : Plongées → Importer → « Récupérer
depuis mon compte Suunto ». Chaque activité est rapprochée du carnet : déjà
liée → rien ; retrouvée par l'heure (Bluetooth, `.fit`, saisie) → complétée
sans rien écraser (profil, Tank POD, température, GPS, mélange ; la pression
pré-remplie 200 → 50 compte comme non saisie) ; absente → ajoutée en plongée ou
en séance. Un seul `.fit` par type d'activité sert à reconnaître la course,
le vélo… qui sont ensuite ignorés. Option : renuméroter dans l'ordre des dates.

**Séances : fosse, piscine, apnée** — à côté du carnet, pas dedans : elles
n'ont pas de numéro et ne comptent pas comme plongées, mais ont leurs
compteurs (« 23 fosses, dont 9 cette année »). Un bouton par type pour pointer
la séance du jour, pré-remplie d'après la précédente. À l'agenda, des cases à
cocher affichent plongées, fosses, piscines et apnées, chacune de sa couleur ;
toucher un jour permet d'y pointer une séance oubliée. À l'import depuis la
montre, chaque activité se range en plongée ou en séance (natation et petit
bain → piscine, jeudi soir en fosse → fosse) ; une plongée déjà au carnet peut
être rangée en séance après coup : bouton « ↪ Snorkeling, fosse… » sur la
plongée, ou « Ranger des plongées du carnet en séances » pour en choisir
plusieurs. Une séance a aussi son « Avec qui » ; dans l'APK, les noms écrits
dans l'agenda Google du jour (« Fosse avec Marc ») sont proposés, et « Avec
qui ? Retrouver dans l'agenda » complète d'un coup les fosses sans personne.

**Calculs** — consommation d'air (brute et ramenée à la surface), profondeur
maximale opérationnelle d'un nitrox, niveau courant déduit des cartes de
certification, statistiques du carnet.

**Fiche d'urgence** — groupe sanguin, contact d'alarme, numéros de secours,
lisible sans rien déverrouiller ni aucun réseau.

**Thèmes** — un bouton 🎨 dans la barre du haut ouvre un volet : touche un thème, l'écran change de couleurs en direct, la page reste visible derrière (Plongée, Abysse, Clair, Cousteau, Plage, Eau turquoise, Récif corallien, Épave, Forêt de kelp, Dauphin, Tortue, Holi, Poisson-clown, Nudibranche, ou Automatique). Choix propre à chaque appareil.

**Téléphone, tablette, PC** — onglets en bas sur téléphone, rail latéral sur tablette, liste et fiches en colonnes en paysage.

**PWA et APK** — installable depuis le site, ou en APK Android ; utilisable hors connexion.

---

## Installer l'APK Android

Ouvre le lien de l'APK sur le téléphone ou la tablette, télécharge, ouvre le
fichier, autorise l'installation depuis cette source. Les mises à jour
s'installent par-dessus (même clé de signature) : les réglages et la copie
locale sont conservés.

**Mise à jour depuis l'appli.** Réglages → « Appli Android » compare la version
installée (numéro du build, embarqué dans `www/version.json`) à la release
« android » du dépôt, et propose « Télécharger la 2.0.N » s'il y a plus récent.
Une fois par jour, un bandeau l'annonce aussi à l'ouverture (fermé, il ne revient
plus pour ce numéro). Android demande toujours de confirmer l'installation : une
appli ne peut pas se remplacer en silence.

L'APK est compilé par **GitHub Actions** (`.github/workflows/android.yml`) à
chaque modification du code, avec Capacitor : les fichiers de l'app sont
embarqués, seul le carnet passe par le réseau.

La clé de signature est dans les secrets du dépôt (`ANDROID_KEYSTORE_B64`,
`ANDROID_KEYSTORE_PASS`). **Garde une copie de `signature-android/`** (hors Git) :
sans elle, une future version ne pourra plus s'installer par-dessus l'ancienne.

---

## Appairer la montre (Suunto Ocean)

Le même mode d'emploi est dans l'app : Plongées → Importer → « Importer depuis
la montre (Bluetooth) » → « Mode d'emploi ».

**Où ça marche.** L'APK Android (le plus simple), ou le site dans Chrome / Edge
sur Android ou PC. Pas sur iPhone : Safari n'a pas de Bluetooth pour les pages.

**L'appli Suunto reste.** Inutile de désappairer quoi que ce soit : l'appairage
appartient à Android, pas à l'appli Suunto, et le carnet s'en sert tel quel. La
montre répond aux deux applis sur le même lien. Si une synchro Suunto démarre
pendant un import, le carnet se met en pause, attend qu'elle ait fini, puis
reprend là où il en était.

**Première fois**
1. Montre chargée, écran réveillé, près du téléphone.
2. Dans le carnet : Importer → « Importer depuis la montre (Bluetooth) ».
3. APK : autorise « Appareils à proximité » (Android 12+) ou « Position »
   (Android 11 et avant ; seulement pour le Bluetooth, la position n'est pas lue).
4. Si la montre est déjà appairée au téléphone, le carnet la retrouve seul.
   Sinon : « Chercher la montre » → « Suunto Ocean », puis confirme le code
   affiché, sur le téléphone et sur la montre.
5. Coche les plongées, « Télécharger », vérifie l'aperçu, « Ajouter au carnet ».

**Si ça coince.** Ouvre « Journal Bluetooth (diagnostic) » en bas de l'écran,
« Copier le journal », et envoie-le. « Données brutes » enregistre les octets
reçus de la montre, pour rejouer le décodage sans elle.

Le protocole (« Vaasa » chez Suunto) a été décrit par le pilote Suunto Nautic
de libdivecomputer ; `js/ocean-*.js` et `js/heatshrink.js` en sont un portage
(voir [Licence](#licence)).

---

## Sur le PC

Ouvre le site, c'est tout : **https://soaresden.github.io/PlongeeJournal/**
(installable comme une appli depuis Chrome ou Edge). Branche le jeton une fois.

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
```

---

## Tests

```bash
npm test                         # tout ce qui suit sauf smoke
node outils/dive-test.mjs        # 159  règles métier : durées, paliers, niveaux, conso, PMU
node outils/smoke.mjs            # 158  tous les écrans, dans un vrai DOM (npm i jsdom)
node outils/github-test.mjs      #  35  synchro GitHub : création, conflits, suppressions, hors ligne
node outils/lieu-test.mjs        #  30  recherche de lieux, cadrage des cartes
node outils/ocean-test.mjs       #  69  Suunto Ocean : trames, Heatshrink, décodage, session Bluetooth
node outils/seance-test.mjs      #  38  séances : stockage, fusion, tri plongée / piscine / fosse
node outils/maj-apk-test.mjs     #  29  mise à jour de l'APK : numéro embarqué, release GitHub
node outils/suunto-cloud-test.mjs #  69  compte Suunto : OAuth, jetons, liste, .fit, alignement
node outils/fit-test.mjs         #  27  décodage des fichiers .fit
node outils/geo-test.mjs         #  22  eau douce / salée, altitude
node outils/noms-test.mjs        #  24  noms dans un texte, numéros par les dates, centres
```

`github-test.mjs` tourne contre un faux GitHub en mémoire : aucun jeton, aucun
réseau. `ocean-test.mjs` décode une vraie plongée de référence
(`outils/fixtures/`) et dialogue avec une fausse montre qui perd des morceaux
et se fait interrompre par « l'appli Suunto ».

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
- Le **compte Suunto** n'a été testé que contre un faux Suunto : l'ordre de la
  liste et ses paramètres de pagination ne sont pas documentés publiquement, le
  carnet essaie les deux sens. Le premier vrai essai passera par le journal de
  diagnostic de l'écran. L'abonnement « Development » limite le nombre
  d'appels : sur un gros historique, Suunto peut demander une pause ; ce qui
  est fait est gardé, on relance plus tard.
- L'**import Bluetooth** n'a été testé que sur des enregistrements de
  référence et une montre simulée : les premiers essais sur une vraie Ocean
  passeront par le journal de diagnostic. La montre ne garde que ses
  plongées récentes ; pour les anciennes, reste le `.fit`.
- **Deux appareils qui modifient la même plongée** hors ligne : à la fusion, la
  dernière modification de la fiche gagne (fiche entière, pas champ par champ).
- Dans l'APK, **l'export d'un fichier** passe par le menu Partager d'Android.

---

## Licence

Usage personnel. Recopie, modifie, adapte à ton propre carnet.

Exception : `js/ocean-proto.js`, `js/ocean-device.js`, `js/ocean-sbem.js` et
`js/heatshrink.js` sont portés de libdivecomputer (pilote Suunto Nautic,
LGPL 2.1 ou ultérieure) et de heatshrink (ISC) ; ils restent sous ces licences.
Les fichiers de `outils/fixtures/` viennent des mêmes projets.
