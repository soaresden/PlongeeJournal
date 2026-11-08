// ============================================================
//  Mode d'emploi : appairer la Suunto Ocean et cohabiter avec
//  l'appli Suunto
// ============================================================

import { el } from '../lib.js';
import { navigate } from '../router.js';

const bloc = (titre, ...contenu) => el('div.card', {},
  el('div', { style: { fontWeight: '650', marginBottom: '6px' }, text: titre }),
  ...contenu);

const liste = (...items) => el('ul.wiz-liste', {}, ...items.map(t => el('li', {}, t)));

export async function montreAideView() {
  const wrap = el('div');

  wrap.append(
    bloc('Avant de commencer',
      liste(
        'Le plus simple : l’APK Android du carnet, sur le téléphone où l’appli Suunto est déjà installée.',
        'Ça marche aussi depuis le site, dans Chrome (Android ou PC) ou Edge. Pas sur iPhone : Safari n’a pas de Bluetooth pour les pages web.',
        'Montre chargée, écran allumé (appuie sur un bouton), à moins d’un mètre du téléphone.',
      )),

    bloc('1. L’appairage',
      el('div.hint', { text: 'Si l’appli Suunto est déjà appairée à la montre sur ce téléphone : rien à faire. '
        + 'L’appairage appartient à Android, pas à l’appli Suunto : le carnet s’en sert tel quel. '
        + 'Ne désappaire surtout rien.' }),
      el('div.hint', { style: { marginTop: '8px' }, text: 'Sinon (autre téléphone, PC) :' }),
      liste(
        'Dans le carnet : Plongées → Importer → « Importer depuis la montre (Bluetooth) » → « Chercher la montre ».',
        'Choisis « Suunto Ocean » dans la liste.',
        'Android (ou Windows) demande d’associer l’appareil et affiche un code : vérifie qu’il est identique à celui de la montre, ou tape celui qu’elle affiche, puis accepte aussi sur la montre.',
        'Dans l’APK, autorise « Appareils à proximité » (Android 12 et plus) ou « Position » (Android 11 et avant). Le carnet ne s’en sert que pour le Bluetooth : il ne lit pas ta position.',
      ),
      el('div.hint', { style: { marginTop: '8px' }, text: 'La fois suivante, le carnet se souvient de la montre : un seul bouton, « Se connecter à Suunto Ocean ».' })),

    bloc('2. Garder l’appli Suunto',
      liste(
        'Les deux applis peuvent rester installées et appairées. La montre répond aux deux sur le même lien Bluetooth.',
        'Évite juste de lancer une synchro Suunto pendant l’import. Si elle démarre quand même, le carnet se met en pause (⏸ dans le journal), attend qu’elle ait fini, puis reprend là où il en était.',
        'Dans l’APK, une montre déjà connectée à l’appli Suunto est retrouvée directement, même si elle ne s’affiche plus dans une recherche Bluetooth.',
        'Sur le site, Chrome ne voit que les montres qui se signalent. Si la tienne n’apparaît pas, ferme l’appli Suunto le temps de la choisir une première fois. Ensuite le site s’en souvient.',
      )),

    bloc('Un deuxième appareil (tablette, autre téléphone)',
      el('div.hint', { text: 'La montre garde plusieurs appareils appairés. Celui où tourne l’appli Suunto s’appelle « MobileApp » ; '
        + 'une tablette doit avoir SON propre appairage. Si la tablette « connaît » la montre mais que la montre ne la liste pas, '
        + 'cet ancien appairage ne marche plus : la connexion échoue (« Connection timeout »).' }),
      liste(
        'Sur la tablette : Réglages Android → Bluetooth → Suunto Ocean → « Oublier » (seulement sur la tablette : le téléphone garde « MobileApp »).',
        'Sur la montre : menu des appareils appairés → mode appairage.',
        'Dans le carnet, sur la tablette : Importer depuis la montre → « Choisir une autre montre » (ou « Chercher la montre ») → Suunto Ocean.',
        'Accepte l’association et vérifie que le code est le même sur la tablette et sur la montre. La montre affiche alors une nouvelle entrée, à côté de « MobileApp ».',
      )),

    bloc('3. L’import',
      liste(
        'La liste montre les plongées gardées dans la montre. Celles déjà dans le carnet (import .fit ou Bluetooth) sont grisées.',
        'Coche, télécharge, vérifie l’aperçu, puis « Ajouter au carnet ». Les plongées sont enregistrées et synchronisées avec GitHub comme les autres.',
        'Compte de quelques dizaines de secondes à quelques minutes par plongée : la montre envoie environ 8 Ko par seconde.',
        'Importé : date et heure, durée, profondeurs max et moyenne, températures, profil, pression du bloc (Tank POD), gaz, position GPS de la mise à l’eau. Les paliers sont estimés d’après le profil : à vérifier.',
        'La montre ne garde en Bluetooth que ses plongées récentes. Pour les anciennes, reste l’import d’un fichier .fit.',
      )),

    bloc('En cas de souci',
      liste(
        'Montre introuvable : réveille-la, rapproche-la, vérifie que le Bluetooth du téléphone est allumé. Puis « Choisir une autre montre ».',
        'Toujours rien : sur la montre, ouvre le menu des appareils appairés (là où l’appli Suunto apparaît sous le nom « MobileApp ») et mets-la en mode appairage : elle s’annonce alors et le carnet la trouve. N’efface pas « MobileApp ».',
        'Ferme l’appli Suunto avant l’import si elle est en train de synchroniser : la montre ne parle qu’à une appli à la fois.',
        'Ouvre « Journal Bluetooth (diagnostic) » en bas de l’écran d’import, puis « Copier le journal » et envoie-le. Il ne contient ni ton carnet ni tes identifiants.',
        '« Données brutes » enregistre les octets reçus de la montre : de quoi rejouer le décodage sans la montre.',
      )),

    el('button.btn.primary.block', { type: 'button', text: '⌚ Aller à l’import Bluetooth', onclick: () => navigate('montre') }),
  );

  return { title: 'Montre : mode d’emploi', node: wrap, back: true };
}
