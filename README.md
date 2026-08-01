# Carnet de plongée

Carnet de plongée numérique, pensé pour le téléphone d'abord, utilisable aussi
sur PC. Site statique : pas de build, pas de framework, pas de `npm install`.

Les données vivent dans **ta** base Supabase, derrière un mot de passe. Le dépôt,
lui, est public et **ne contient aucune clé** : tout se configure depuis l'app.

## Ce que ça fait

- Saisie complète d'une plongée : lieu GPS, horaires, profondeurs, paliers,
  lestage, conditions, palanquée, tampons, comptes-rendus
- **Ce que j'ai vu** : faune, flore et épaves suggérées d'après le lieu de
  plongée, avec photo — on coche, sans rien connaître aux poissons
- Plusieurs identités de plongeur, chacune avec son carnet et son compteur
- Import depuis un ordinateur de plongée **Suunto** (profil de profondeur inclus),
  avec fusion de plusieurs enregistrements en une seule plongée
- Fonctionne hors connexion : les écritures partent dès que le réseau revient
- Vue **calendrier** : les jours plongés en un coup d'œil, mois par mois
- Installable sur le téléphone (PWA)

---

## Installation en 3 étapes

### 1. Publier le site

```bash
git add . && git commit -m "Carnet de plongée" && git push
```

Dépôt → **Settings → Pages** → Source `Deploy from a branch`, branche `main`,
dossier `/ (root)`. Le site est en ligne sur
`https://<pseudo>.github.io/PlongeeJournal/`.

**En local**, double-clic sur **`lancer.bat`** : il trouve Python ou Node,
démarre un serveur sur `http://localhost:8080` et ouvre le navigateur.
(Le double-clic sur `index.html` ne marche pas : les modules JavaScript exigent
un vrai serveur web.)

### 2. Créer sa base Supabase

1. Projet gratuit sur [supabase.com](https://supabase.com/dashboard)
2. **Project Settings → General** : copier le *Project ID*.
   **Project Settings → API Keys** : copier la clé **publishable**
3. Renseigner ces deux valeurs, au choix :
   - dans l'app, onglet **Profil → ⚙ Réglages** ; ou
   - dans le fichier **`credentials.json`** à la racine (copié depuis
     `credentials.example.json`), qui évite de tout ressaisir à chaque fois :

   ```json
   {
     "ProjectID":           "abcdefghijklmnopqrst",
     "APIKeys_Publishable": "sb_publishable_########################",
     "APIKeys_SecretKey":   "",
     "APIKeys_GoogleMaps":  ""
   }
   ```

   Le *Project ID* est la partie variable de l'URL :
   `https://<ProjectID>.supabase.co`. L'URL complète est acceptée aussi,
   l'app reconstruit ce qu'il faut. Ce fichier est dans `.gitignore` :
   il ne part jamais sur GitHub.

4. L'app détecte que la base est vide et propose le script SQL :
   bouton **📋 Copier le script SQL** → coller dans **Supabase → SQL Editor →
   New query → Run** → revenir et cliquer **« J'ai exécuté le script »**

**`APIKeys_SecretKey` est là pour mémoire, pas pour l'app.** Le champ existe
parce que c'est commode d'avoir ses deux clés au même endroit, mais
l'application l'ignore activement : elle ne le lit pas, ne l'enregistre pas, et
écrit un avertissement dans la console s'il est rempli. La clé secrète ne sert
qu'au CLI Supabase et aux Edge Functions, où elle se dépose dans
**Edge Functions → Secrets**.

Deux réserves si tu la notes quand même :

- tout fichier de ce dossier est servi par le serveur local, donc lisible sur
  `http://localhost:8080/credentials.json` — sans importance sur ta machine,
  à éviter sur un réseau partagé ;
- si une clé `sb_secret_` atterrit dans le champ *Publishable*, l'app la rejette
  et te le dit.

Le mot de passe de la base n'a sa place ni ici ni ailleurs dans le projet :
l'application n'en a jamais besoin (il ne sert qu'aux connexions PostgreSQL
directes).

C'est une opération unique. L'app inscrit un marqueur `schema_version` dans la
base et ne redemandera plus rien : au prochain lancement elle vérifie, voit que
tout est en place, et passe directement au carnet.

### 3. Choisir ton mot de passe

L'app te le demande à la fin de l'installation. Une adresse email est demandée
**une seule fois**, uniquement pour pouvoir recevoir le lien de réinitialisation
si tu l'oublies. Elle ne te sera plus jamais réclamée.

Ensuite, au quotidien : **un champ, un mot de passe**. Ou l'empreinte digitale.

Une fois ton mot de passe défini, ferme la porte derrière toi :
**Authentication → Sign In / Providers → Email** → décocher
*Allow new users to sign up*. Personne d'autre ne pourra créer de compte sur ta
base. Le script SQL contient aussi, en commentaire à la fin, un garde-fou qui
refuse toute inscription avec une autre adresse que la tienne.

#### Changer le mot de passe

**⚙ Réglages → Sécurité → Changer le mot de passe**. Aucun passage par le
tableau de bord Supabase.

#### « Mot de passe incorrect » alors qu'il est bon

Le cas le plus fréquent au premier lancement. Supabase exige par défaut de
**confirmer son adresse par email** avant d'autoriser la connexion ; tant que le
lien n'est pas cliqué, le mot de passe est refusé — avec un message trompeur.

L'écran de verrouillage propose un bouton **🩺 Pourquoi ça ne marche pas ?**
(affiché après un échec, automatique après deux). Il interroge Supabase et
distingue quatre situations : compte inexistant, adresse non confirmée, mot de
passe réellement faux, inscriptions fermées — avec la manipulation exacte à
faire dans chaque cas.

Pour un carnet personnel, le plus simple est de désactiver la confirmation :
**Authentication → Sign In / Providers → Email** → décocher *Confirm email*.

#### Mot de passe oublié

Sur l'écran de verrouillage : **Mot de passe oublié** → un lien part vers ton
adresse. Ouvre-le depuis l'appareil, l'app enchaîne directement sur « nouveau
mot de passe ».

#### Empreinte digitale

**⚙ Réglages → Sécurité → Activer sur cet appareil.** Ensuite, l'ouverture de
l'app demande ton empreinte au lieu du mot de passe.

Ce que ça fait exactement : la session est déjà mémorisée par le navigateur
(c'est ce qui t'évite de retaper le mot de passe). L'empreinte ajoute un verrou
**devant** cette session. Elle protège donc contre quelqu'un qui attrape ton
téléphone déverrouillé — pas contre quelqu'un qui aurait le disque de ta
machine. C'est le mot de passe qui protège les données côté serveur, et il reste
valable en permanence.

Exige une connexion sécurisée (https, ou http://localhost) et un capteur :
Touch ID, Face ID, empreinte Android, Windows Hello. À activer sur chaque
appareil séparément.

---

## Sécurité : ce qui est public, ce qui ne l'est pas

C'est la question centrale d'un dépôt public. Trois choses à distinguer :

| | Où ça vit | Public ? |
|---|---|---|
| Le code | ce dépôt GitHub | oui, sans risque |
| Project ID + clé **publishable** | saisis dans l'app, gardés dans ton navigateur | oui **par conception** |
| Ton mot de passe | table `auth.users` de Supabase, haché en bcrypt | jamais lisible, même par toi |
| Clé **secret** / `service_role` | secrets Supabase, côté serveur | **jamais**, nulle part d'autre |

**Où est rangé le mot de passe ?** Dans une table, comme tu l'imaginais :
`auth.users`, gérée par Supabase. Il y est haché (bcrypt) — même en ouvrant la
base, on ne peut pas le relire. Et surtout, il est vérifié **côté serveur** :
c'est ce qui fait la différence entre un vrai verrou et un écran qu'on
contourne. Un mot de passe rangé dans une table ordinaire, comparé par le
navigateur, obligerait à rendre cette table lisible par tout le monde — et avec
elle, tout le carnet.

**La clé publiable ne protège rien et n'a pas à le faire.** Ce qui protège, ce
sont les politiques **RLS** (Row Level Security) inscrites dans le script SQL :
chaque table porte la règle `owner_id = auth.uid()`, évaluée par PostgreSQL à
chaque requête. Sans session valide, une requête ne renvoie aucune ligne — même
en connaissant l'URL et la clé.

**La clé secrète, elle, contourne RLS.** Elle donne un accès total à la base.
Elle ne se met que dans **Supabase → Edge Functions → Secrets**, et nulle part
ailleurs : ni dans le code, ni dans un message, ni dans l'app. L'écran Réglages
refuse d'ailleurs explicitement toute valeur commençant par `sb_secret_`.

Si une clé secrète a fuité (collée dans une conversation, un commit, une
capture) : **Project Settings → API Keys → Rotate / Revoke**, immédiatement.
Une clé révoquée devient inoffensive.

Les tampons sont dans un bucket Storage **privé** : les images ne sont servies
que par URL signée temporaire, à un utilisateur authentifié.

---

## Synchronisation

Supabase est la source de vérité. Le navigateur ne garde que deux choses :

- un **miroir de lecture**, pour afficher le carnet même sans réseau
- une **file d'attente d'écritures** qui n'ont pas pu partir

L'icône en haut à droite dit toujours où on en est :

| Icône | Sens |
|---|---|
| ✓ | tout est synchronisé (appuyer = recharger depuis la base) |
| ⟳ | envoi en cours |
| ⇡ 3 | 3 modifications en attente (appuyer = forcer l'envoi) |
| ⚡ | hors ligne, envoi différé |
| ! | échec — le détail est dans l'infobulle |
| ▤ | aucune base branchée, stockage local |

La file est rejouée automatiquement au retour du réseau, au retour sur l'onglet,
et toutes les 30 secondes. Chaque écriture est identifiée par `table:id` : la
dernière version d'une plongée écrase la précédente, rien n'est jamais envoyé en
double. Fermer l'onglet avec des écritures en attente déclenche un avertissement.

---

## Suunto

### Ce qui est possible, et ce qui ne l'est pas

L'API Suunto ([apizone.suunto.com](https://apizone.suunto.com/how-to-start)) est
en libre-service : pas de validation partenaire à attendre. Elle est en revanche
pensée pour le sport, et l'export de plongée passe par des fichiers **FIT** dont
certains champs (pression des blocs notamment) sont incomplets. Ce qui remonte
de façon fiable : horaires, durée, profondeur max et moyenne, températures, et
la **courbe de profondeur complète**.

Le secret client OAuth ne peut pas vivre dans un site statique public. Il est
donc déposé dans les secrets Supabase, et l'Edge Function `suunto` fait le
relais : le navigateur ne voit jamais ni le secret, ni les jetons d'accès. La
table `suunto_accounts` n'a **aucune politique RLS permissive** — elle est
totalement inaccessible depuis le navigateur, y compris avec une session valide.

### Mise en place

**1. Côté Suunto** — [apizone.suunto.com](https://apizone.suunto.com/how-to-start)

- S'abonner à *Developer API* → récupérer la **subscription key**
- **Profile → OAuth** : renseigner un nom d'app, un **client secret**, et
  l'**URL de redirection** (bouton *Copier* dans l'écran Réglages de l'app) :
  `https://<projet>.supabase.co/functions/v1/suunto/callback`
- Noter le **client id** généré

**2. Côté Supabase** — Edge Functions → Secrets

| Secret | Valeur |
|---|---|
| `SUUNTO_CLIENT_ID` | client id Suunto |
| `SUUNTO_CLIENT_SECRET` | client secret Suunto |
| `SUUNTO_SUBSCRIPTION_KEY` | subscription key Suunto |
| `SUUNTO_REDIRECT_URI` | l'URL de redirection ci-dessus, à l'identique |
| `SUUNTO_STATE_SECRET` | une longue chaîne aléatoire de ton choix |
| `APP_URL` | l'URL publique de l'app (bouton *Copier* dans Réglages) |

**3. Déployer la fonction**

```powershell
npx supabase login
npx supabase link --project-ref abcdefghijklmnop
npx supabase functions deploy suunto --no-verify-jwt
```

Le *project ref* est la partie variable de ton URL Supabase :
`https://`**`abcdefghijklmnop`**`.supabase.co`. On le retrouve aussi dans
**Project Settings → General → Reference ID**.

⚠️ Sous PowerShell, ne tape pas les chevrons `<…>` : ils sont interprétés comme
une redirection et provoquent l'erreur *« L'opérateur « < » est réservé »*.
Remplace-les par la vraie valeur, sans chevrons.

`--no-verify-jwt` est nécessaire : la redirection OAuth de Suunto arrive sans
en-tête d'authentification. Chaque action sensible vérifie elle-même la session
Supabase de l'appelant, et l'identité transite dans un `state` signé en HMAC.

### Utilisation

Profil → **Suunto** → *Relier mon compte* → la liste des enregistrements
s'affiche, les plongées déjà importées sont grisées.

**Une plongée coupée en deux** (remontée en surface puis réimmersion) : coche les
deux lignes, elles sont fusionnées en une seule plongée — profil recollé sur une
échelle de temps commune, profondeur max = la plus grande des deux, durée qui
couvre l'intervalle complet. Chaque clé Suunto reste rattachée à la plongée, ce
qui empêche définitivement un double import.

Les **paliers sont estimés** à partir de la courbe (temps passé dans les bandes
2,4-4 m, 5,2-7 m, 8,2-10 m pendant la remontée), parce que le FIT ne les
enregistre pas. Le formulaire le signale : à vérifier.

---

## Structure

```
index.html                coquille de l'app
manifest.webmanifest      déclaration PWA
sw.js                     cache hors-ligne
css/styles.css            tout le style
supabase/schema.sql       script d'initialisation (tables, RLS, Storage)
supabase/functions/suunto/ Edge Function OAuth + relais API Suunto

js/settings.js            identifiants saisis dans l'app (jamais dans le dépôt)
js/config.js              listes de référence (types, options, objectifs)
js/model.js               modèle de données et règles métier
js/store.js               façade — les écrans ne connaissent que ça
js/store-local.js         adaptateur navigateur
js/store-supabase.js      adaptateur Supabase
js/sync.js                file d'attente + état de synchronisation
js/supabase.js            client et authentification
js/fit.js                 décodeur FIT plongée + fusion + courbe SVG
js/map.js                 recherche de lieu et carte
js/router.js              routeur par hash (#/dives)
js/views/                 un fichier par écran
```

## Modèle d'une plongée

| Champ | Détail |
|---|---|
| `numero`, `date` | numéro proposé automatiquement (max + 1 du carnet) |
| `lieuNom`, `lieuDetail` | **le libellé cherché est conservé tel quel** |
| `lat`, `lng` | le point exact cliqué dans l'eau, distinct du libellé |
| `eau` | `douce` / `salee`, deviné depuis le nom du lieu, modifiable |
| `heureImmersion`, `heureSortie`, `dureeMin` | deux suffisent, le troisième se calcule |
| `palier3/6/9` | minutes par palier |
| `profMax`, `profMoy` | |
| `type` | Enseignement / Exploration de jour / Exploration de nuit |
| `options[]`, `objectifs[]`, `objectifAutre` | listes modifiables dans `config.js` |
| `lestage`, `combinaison`, `blocLitres`, pressions | |
| `tempAir`, `tempSurface`, `tempFond`, `visibilite`, `courant` | |
| `buddyIds[]`, `palanqueeMode`, `chefBuddyId` | palanquée |
| `stampId` / `stampImage` | tampon repris d'un compagnon, ou photographié |
| `fait`, `vu`, `observations` | comptes-rendus |
| `suuntoKeys[]`, `profil` | enregistrements Suunto rattachés et courbe |

Le **nombre de plongées d'un plongeur n'est jamais saisi** : il est toujours
recalculé depuis le carnet.

### Le minimum pour valider une plongée

Quatre informations, repérées par un point **•** dans le formulaire :

1. le **lieu** (un nom ou un point sur la carte suffit)
2. la **date**
3. la **durée** (ou les deux horaires, qui la calculent)
4. la **profondeur max**

**L'heure d'immersion est facultative** : sur une plongée d'avant l'ordinateur,
on ne l'a plus, et il n'y a aucune raison de l'inventer. La durée, elle, reste
toujours saisissable directement.

Tout le reste est facultatif. À l'enregistrement, ce qui manque est listé en
clair, chaque ligne renvoyant au champ concerné.

### Étiquettes posées automatiquement

Certaines options se cochent seules, avec la raison affichée :

| Étiquette | Déclencheur |
|---|---|
| Plongée profonde | profondeur max ≥ 30 m |
| Décompression | au moins un palier de 3, 6 ou 9 m renseigné |
| Plongée en altitude | altitude du point > 300 m (seuil réglementaire) |
| Plongée en fosse | bassin de plongée cartographié, ou « fosse » dans le nom |
| Plongée sous glace | température de surface ≤ 2 °C, ou le lieu l'indique |
| Plongée technique | profondeur ≥ 40 m, ou trimix / recycleur coché |

Le **palier de sécurité** est suivi à part (case à cocher + durée) et ne
déclenche pas l'étiquette *Décompression* — ce n'est pas un palier obligatoire.

Une étiquette décochée à la main est mémorisée et **ne revient jamais**.
Inversement, une option cochée manuellement survit à la disparition de sa
condition.

### Ton niveau, plongée par plongée

Le niveau se renseigne **sur chaque plongée**, pas sur la fiche du plongeur :
tu n'avais pas le N3 lors de tes premières sorties, et un niveau figé
fausserait tout l'historique. Chaque nouvelle plongée reprend celui de la
précédente — tu ne le changes que le jour où tu passes un niveau.

Le **niveau courant du carnet en est déduit** : c'est le plus élevé jamais
enregistré. Rien à saisir. Les statistiques donnent la répartition des plongées
par niveau.

## Reconnaissance du plan d'eau

Tu poses le point dans l'eau, l'app va **voir ce qu'il y a là** plutôt que de
deviner d'après le nom :

| Source | Ce qu'elle apporte | Clé ? |
|---|---|---|
| [OpenStreetMap](https://overpass-api.de/) | plan d'eau, rivière, trait de côte, fosse de plongée cartographiés au point | non |
| [Open-Meteo](https://open-meteo.com/en/docs/elevation-api) | altitude — la mer est à 0, un lac de montagne à 450 m ne peut pas être salé | non |

L'ordre de décision, du plus sûr au plus incertain :

1. un tag `salt=yes` ou une lagune → **eau salée**
2. une piscine ou une fosse de plongée → **eau douce**
3. un lac, un étang, une gravière, une rivière → **eau douce**
4. un trait de côte à moins de 500 m, au niveau de la mer → **eau salée**
5. rien de cartographié, mais plus de 5 m d'altitude → **eau douce**, annoncé
   comme *probable*
6. rien du tout → le nom du lieu sert de dernier indice

Le résultat est affiché sous le sélecteur avec son degré de certitude, et reste
modifiable d'un geste — un choix manuel n'est jamais écrasé. L'altitude sert
aussi à poser l'étiquette *Plongée en altitude*.

---

## Recherche du lieu

Le libellé que tu tapes est **toujours conservé**, même quand il ne correspond
à aucun lieu référencé — c'est lui qui a un sens pour toi. Les coordonnées, elles,
viennent du point que tu poses dans l'eau.

Quand la saisie ne donne rien, la recherche **s'élargit d'elle-même**, du plus
précis au plus large :

| Saisie | Essais successifs |
|---|---|
| `Fort du Centre - Cherbourg` | la chaîne entière → **`Cherbourg`** → `Fort du Centre` |
| `Épave du Liban, Marseille` | la chaîne entière → **`Marseille`** → `Épave du Liban` |
| `Sec du Gendarme` | la chaîne entière → `du Gendarme` → `Gendarme` |

L'app annonce clairement l'élargissement (« Rien pour *Fort du Centre -
Cherbourg* — résultats pour *Cherbourg* »), centre la carte sur la ville, et te
laisse déplacer le point à l'endroit exact. Ton libellé n'est pas écrasé ; le
lieu reconnu est rangé à part, en complément.

Les tirets internes ne coupent pas : `Beaumont-sur-Oise` et `Port-Cros` restent
entiers. Seuls les séparateurs entourés d'espaces (` - `, ` / `) et les virgules
découpent la saisie.

---

## Ce que j'ai vu

Trois catégories cochables : **faune**, **flore**, **épaves**. Une fois le point
posé sur la carte, l'app liste ce qui se voit à cet endroit — photo, nom
français, du plus fréquemment rencontré au plus rare. On coche. En tapant
(« tortue »), la liste se filtre ; si le mot n'existe pas localement, la
recherche bascule seule sur le catalogue mondial.

**Aucune liste d'espèces n'est écrite dans le code.** Tout est déduit à la
demande, en croisant quatre bases publiques :

| Source | Question à laquelle elle répond | Clé ? |
|---|---|---|
| [iNaturalist](https://api.inaturalist.org/v1/docs/) | *quoi* a été observé ici, et à quelle fréquence — avec nom français et photo | non |
| [WoRMS](https://www.marinespecies.org/rest/) | l'espèce vit-elle dans l'eau ? drapeaux `isMarine` / `isBrackish` / `isFreshwater` / `isTerrestrial` | non |
| [GBIF](https://www.gbif.org/developer/summary) | rattrapage d'habitat pour l'eau douce | non |
| [OpenStreetMap](https://overpass-api.de/) | les épaves cartographiées autour du point | non |

### Comment le tri fonctionne

Chercher « tout le vivant » autour d'un point côtier remonte d'abord des
goélands et du romarin. C'est WoRMS qui tranche, espèce par espèce : une entrée
marquée à la fois *marine* et *terrestre* est un oiseau de mer ou une plante de
falaise — écartée. Le goéland leucophée et la criste marine disparaissent ainsi
sans qu'aucun nom ne soit codé en dur.

Le drapeau *saumâtre* est traité avec prudence : il est posé sur le brochet
comme sur la rascasse, il ne suffit donc jamais seul à classer une espèce.

Les habitats sont mis en cache **définitivement** (l'habitat d'une espèce ne
change pas) et les relevés de zone pendant un mois : la deuxième plongée au même
endroit s'affiche instantanément, même hors connexion.

### Deux niveaux de filtre

- **Strict** — uniquement ce qui est *confirmé* aquatique. Excellent en mer :
  sur la Calanque de Sormiou, 200 espèces relevées, 78 terrestres écartées,
  et en tête rascasse, murène, doris dalmatien, gorgone jaune, posidonie.
- **Élargi** — tout sauf ce qui est *positivement* terrestre.

**En eau douce, le filtre s'élargit automatiquement**, et l'app le dit. Raison
honnête : les bases naturalistes recensent surtout ce qui s'observe depuis la
berge. Sur l'Oise à Beaumont, à peine deux espèces sont formellement classées
dulçaquicoles. Ce n'est pas un défaut de l'app, c'est l'état des données — un
bouton permet de basculer entre les deux vues à tout moment.

### Épaves

Positions et noms viennent d'OpenStreetMap (près de Marseille : *Le Liban*,
*Le Chaouen*, *Le Dalton*, un Junkers 88…). **Wrecksite.eu n'expose pas d'API**
et réserve ses fiches à ses membres : l'app n'y puise pas, elle propose un lien
de recherche pour aller lire l'histoire du bateau à la main.

### Pourquoi pas une recherche web ?

Une recherche libre du type « Beaumont-sur-Oise faune flore » serait moins
fiable : aucune API de recherche gratuite sans clé, pas de CORS depuis un site
statique, et des pages dont la structure change sans prévenir. Ces bases-là sont
faites pour être interrogées. Un lien *Chercher sur le web* est tout de même
proposé sous chaque liste, pour aller voir par toi-même.

---

## Cartes

Par défaut : OpenStreetMap via Leaflet, avec fond satellite — gratuit, sans clé,
sans compte. Largement suffisant pour poser un point dans l'eau.

### La « Maps Demo Key » ne convient pas

Si tu as reçu une clé sans donner de carte bancaire, c'est une
[Maps Demo Key](https://mapsplatform.google.com/maps-demo-key/) : un bac à
sable destiné au prototypage. Elle est bridée en quota, filigranée, limitée à
un sous-ensemble de la Maps JavaScript API — **sans Places API**, donc sans
autocomplétion de lieux. Elle n'apparaît pas dans tes *Identifiants*, ce qui la
rend impossible à restreindre. Reste sur OpenStreetMap : l'app fait déjà tout ce
dont tu as besoin.

### Ajouter une vraie clé Google Maps (optionnel)

Une clé Maps **ne peut pas rester secrète** : elle part dans le navigateur de
chaque visiteur, donc elle est lisible dans le code source de la page. C'est ainsi
que Google l'a conçue. Ce qui la protège, ce n'est pas le secret — c'est la
**restriction**.

L'app fournit la marche à suivre complète : **⚙ Réglages → Cartes →
🔐 Comment la protéger**, avec les référents HTTP déjà remplis à ton adresse,
prêts à copier. En résumé :

1. [Google Cloud → Identifiants](https://console.cloud.google.com/apis/credentials)
   → ta clé
2. *Restrictions relatives aux applications* → **Sites Web** → ajouter
   `https://<pseudo>.github.io/PlongeeJournal/*` (et `http://localhost:*/*` pour
   tes essais)
3. *Restrictions relatives aux API* → **Restreindre la clé** → cocher uniquement
   *Maps JavaScript API* et *Places API*
4. [Facturation → Budgets et alertes](https://console.cloud.google.com/billing/budgets)
   → un budget avec alerte à quelques euros

Une clé ainsi restreinte ne fonctionne que depuis ton site : elle peut être
publiée sans risque. Une clé **non restreinte** qui a circulé doit être
régénérée, puis restreinte.


## Tests

```bash
node outils/dive-test.mjs        # règles métier & étiquettes auto : 85 contrôles
node outils/smoke.mjs            # rendu de tous les écrans : 52 contrôles
node outils/fit-test.mjs         # décodeur FIT : 27 contrôles
node outils/auth-test.mjs        # lien de réinitialisation : 27 contrôles
node outils/credentials-test.mjs # fichier local de clés : 25 contrôles
node outils/geo-test.mjs         # reconnaissance du plan d'eau : 22 contrôles
node outils/lieu-test.mjs        # recherche de lieu élargie : 18 contrôles
```
