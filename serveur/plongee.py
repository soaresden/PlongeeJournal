#!/usr/bin/env python3
# ============================================================
#  Carnet de plongée — serveur local
#
#  Une seule dépendance : Python. Rien à installer.
#
#  Ce qu'il fait :
#   1. Il vide le dossier PlongeeAImporter dans le carnet (les
#      plongées saisies au téléphone), puis range les fichiers
#      importés à côté avec leur date.
#   2. Il sert l'application et le carnet.
#   3. Il accepte les écritures : depuis le PC, ou depuis le
#      téléphone quand les deux sont sur le même Wi-Fi.
#
#  Le carnet est UN fichier JSON. Pas de base de données, pas de
#  compte, pas de service en ligne. C'est copiable, lisible,
#  sauvegardable, et ça survivra à ce programme.
# ============================================================

import argparse
import http.server
import json
import os
import re
import shutil
import socket
import socketserver
import sys
import threading
import time
import webbrowser
from datetime import datetime
from pathlib import Path
from urllib.parse import unquote, urlparse

RACINE = Path(__file__).resolve().parent.parent
DOSSIER_DONNEES = RACINE / 'donnees'
CARNET = DOSSIER_DONNEES / 'carnet.json'
MEDIAS = DOSSIER_DONNEES / 'medias'
SAUVEGARDES = DOSSIER_DONNEES / 'sauvegardes'
A_IMPORTER = RACINE / 'PlongeeAImporter'
IMPORTES = A_IMPORTER / 'importes'

# Un carnet vide, mais valide : l'app doit pouvoir démarrer sur du neuf.
# Les noms de clés sont ceux de l'application, à la lettre près : le
# fichier écrit ici est relu tel quel par le navigateur, sans traduction.
CARNET_VIDE = {
    'version': 1,
    'divers': [],
    'certifs': [],
    'buddies': [],
    'dives': [],
    'settings': {'activeDiverId': None},
}

TABLES = ('divers', 'certifs', 'buddies', 'dives')

TAILLE_MAX_MEDIA = 8 * 1024 * 1024      # 8 Mo : une photo de tampon, large
TAILLE_MAX_CARNET = 64 * 1024 * 1024

verrou = threading.Lock()


# ------------------------------------------------------------
#  Lecture et écriture du carnet
# ------------------------------------------------------------

def lire_carnet():
    if not CARNET.exists():
        return dict(CARNET_VIDE)
    try:
        with CARNET.open(encoding='utf-8') as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        # Un carnet illisible ne doit surtout pas être écrasé en silence.
        print(f'  [!] {CARNET.name} est illisible ({e}).')
        print(f'      Le fichier est conservé tel quel ; corrige-le ou')
        print(f'      restaure une sauvegarde depuis {SAUVEGARDES.name}/.')
        raise
    # Un carnet écrit par une version antérieure disait « certifications ».
    if 'certifs' not in data and 'certifications' in data:
        data['certifs'] = data.pop('certifications')

    for cle, defaut in CARNET_VIDE.items():
        data.setdefault(cle, defaut if not isinstance(defaut, (list, dict))
                        else type(defaut)())
    return data


def ecrire_carnet(data, *, sauvegarder=True):
    """Écriture atomique : on ne perd jamais le carnet sur une coupure."""
    DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)

    if sauvegarder and CARNET.exists():
        SAUVEGARDES.mkdir(exist_ok=True)
        horo = datetime.now().strftime('%Y%m%d_%H%M%S')
        shutil.copy2(CARNET, SAUVEGARDES / f'carnet-{horo}.json')
        purger_sauvegardes()

    provisoire = CARNET.with_suffix('.json.tmp')
    with provisoire.open('w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.flush()
        os.fsync(f.fileno())
    provisoire.replace(CARNET)


def purger_sauvegardes(garder=40):
    """Les sauvegardes sont utiles ; mille sauvegardes ne le sont pas."""
    fichiers = sorted(SAUVEGARDES.glob('carnet-*.json'))
    for vieux in fichiers[:-garder]:
        try:
            vieux.unlink()
        except OSError:
            pass


# ------------------------------------------------------------
#  Import des plongées saisies au téléphone
# ------------------------------------------------------------

def fusionner(carnet, apport):
    """
    Fusionne un apport dans le carnet. La règle est simple et explicite :
    à identifiant égal, la version la plus récemment modifiée gagne.
    À défaut d'horodatage, l'apport gagne — il vient d'être saisi.

    Renvoie le compte de ce qui a été ajouté et remplacé.
    """
    bilan = {'ajoutes': 0, 'remplaces': 0, 'ignores': 0}

    for table in TABLES:
        entrants = apport.get(table) or []
        # Tolérance pour les fichiers produits avant l'unification des noms.
        if not entrants and table == 'certifs':
            entrants = apport.get('certifications') or []
        if not isinstance(entrants, list):
            continue

        index = {e.get('id'): i for i, e in enumerate(carnet[table]) if e.get('id')}

        for entrant in entrants:
            if not isinstance(entrant, dict) or not entrant.get('id'):
                bilan['ignores'] += 1
                continue

            place = index.get(entrant['id'])
            if place is None:
                carnet[table].append(entrant)
                index[entrant['id']] = len(carnet[table]) - 1
                bilan['ajoutes'] += 1
                continue

            existant = carnet[table][place]
            if str(entrant.get('updatedAt') or '') >= str(existant.get('updatedAt') or ''):
                carnet[table][place] = entrant
                bilan['remplaces'] += 1
            else:
                bilan['ignores'] += 1

    return bilan


def enregistrer_medias(apport):
    """Les images voyagent en base64 dans le fichier ; ici elles redeviennent
    des fichiers, et le carnet ne garde qu'un chemin."""
    medias = apport.get('medias')
    if not isinstance(medias, dict):
        return 0

    MEDIAS.mkdir(parents=True, exist_ok=True)
    ecrits = 0
    for nom, contenu in medias.items():
        sur = nom_de_fichier_sur(nom)
        if not sur or not isinstance(contenu, str):
            continue
        try:
            import base64
            brut = base64.b64decode(contenu.split(',', 1)[-1], validate=True)
        except Exception:
            continue
        if len(brut) > TAILLE_MAX_MEDIA:
            continue
        (MEDIAS / sur).write_bytes(brut)
        ecrits += 1
    return ecrits


def nom_de_fichier_sur(nom):
    """
    Un nom venu de l'extérieur ne sort jamais de son dossier.

    On REFUSE tout ce qui n'est pas déjà un nom simple, plutôt que de le
    nettoyer : « ../../pwn.txt » nettoyé en « pwn.txt » serait écrit sans
    bruit à un endroit que personne n'a demandé. Un refus se remarque.
    """
    nom = str(nom)
    if nom != os.path.basename(nom):
        return None
    if not re.fullmatch(r'[A-Za-z0-9._-]{1,120}', nom) or nom.startswith('.'):
        return None
    return nom


def importer_le_dossier(silencieux=False):
    """Vide PlongeeAImporter dans le carnet. Renvoie un bilan."""
    A_IMPORTER.mkdir(exist_ok=True)
    fichiers = sorted(p for p in A_IMPORTER.glob('*.json') if p.is_file())

    if not fichiers:
        if not silencieux:
            print(f'  Rien à importer dans {A_IMPORTER.name}/.')
        return {'fichiers': 0, 'ajoutes': 0, 'remplaces': 0, 'ignores': 0, 'erreurs': []}

    with verrou:
        carnet = lire_carnet()
        total = {'fichiers': 0, 'ajoutes': 0, 'remplaces': 0, 'ignores': 0, 'erreurs': []}

        for chemin in fichiers:
            try:
                with chemin.open(encoding='utf-8') as f:
                    apport = json.load(f)
            except (json.JSONDecodeError, OSError) as e:
                total['erreurs'].append(f'{chemin.name} : {e}')
                continue

            bilan = fusionner(carnet, apport)
            enregistrer_medias(apport)

            total['fichiers'] += 1
            for cle in ('ajoutes', 'remplaces', 'ignores'):
                total[cle] += bilan[cle]

            # Le fichier importé est rangé, pas supprimé : si la fusion
            # s'est mal passée, la saisie d'origine est toujours là.
            IMPORTES.mkdir(parents=True, exist_ok=True)
            destination = IMPORTES / chemin.name
            if destination.exists():
                horo = datetime.now().strftime('%Y%m%d_%H%M%S')
                destination = IMPORTES / f'{chemin.stem}-{horo}{chemin.suffix}'
            shutil.move(str(chemin), str(destination))

        if total['fichiers']:
            ecrire_carnet(carnet)

    if not silencieux:
        print(f'  {total["fichiers"]} fichier(s) importé(s) : '
              f'{total["ajoutes"]} ajout(s), {total["remplaces"]} mise(s) à jour, '
              f'{total["ignores"]} ignoré(s).')
        for err in total['erreurs']:
            print(f'  [!] {err}')
    return total


# ------------------------------------------------------------
#  Serveur HTTP
# ------------------------------------------------------------

class Handler(http.server.SimpleHTTPRequestHandler):

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(RACINE), **kw)

    # --- utilitaires ---

    def repondre_json(self, obj, code=200):
        corps = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(corps)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(corps)

    def lire_corps(self, taille_max):
        try:
            taille = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            return None
        if taille <= 0 or taille > taille_max:
            return None
        return self.rfile.read(taille)

    def log_message(self, fmt, *args):
        # Le journal par défaut noie la console sous les requêtes de fichiers.
        if '/api/' in str(args[0] if args else ''):
            sys.stderr.write(f'  {self.address_string()} — {fmt % args}\n')

    # --- routes ---

    def do_GET(self):
        chemin = urlparse(self.path).path

        if chemin == '/api/etat':
            return self.repondre_json({
                'serveur': True, 'ecriture': True, 'version': 1,
                'carnet': CARNET.exists(),
                'aImporter': len(list(A_IMPORTER.glob('*.json'))) if A_IMPORTER.exists() else 0,
            })

        if chemin == '/api/carnet':
            try:
                with verrou:
                    return self.repondre_json(lire_carnet())
            except Exception as e:
                return self.repondre_json({'erreur': str(e)}, 500)

        # Un carnet servi en cache serait un carnet périmé.
        if chemin.startswith('/donnees/'):
            self.send_header_no_store = True

        return super().do_GET()

    def do_PUT(self):
        chemin = urlparse(self.path).path

        if chemin == '/api/carnet':
            corps = self.lire_corps(TAILLE_MAX_CARNET)
            if corps is None:
                return self.repondre_json({'erreur': 'Corps absent ou trop gros'}, 413)
            try:
                data = json.loads(corps.decode('utf-8'))
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                return self.repondre_json({'erreur': f'JSON invalide : {e}'}, 400)
            if not isinstance(data, dict) or 'dives' not in data:
                return self.repondre_json({'erreur': 'Ce n’est pas un carnet'}, 400)

            with verrou:
                ecrire_carnet(data)
            return self.repondre_json({'ok': True, 'plongees': len(data.get('dives') or [])})

        if chemin.startswith('/api/media/'):
            nom = nom_de_fichier_sur(unquote(chemin[len('/api/media/'):]))
            if not nom:
                return self.repondre_json({'erreur': 'Nom de fichier refusé'}, 400)
            corps = self.lire_corps(TAILLE_MAX_MEDIA)
            if corps is None:
                return self.repondre_json({'erreur': 'Corps absent ou trop gros'}, 413)
            MEDIAS.mkdir(parents=True, exist_ok=True)
            (MEDIAS / nom).write_bytes(corps)
            return self.repondre_json({'ok': True, 'chemin': f'donnees/medias/{nom}'})

        return self.repondre_json({'erreur': 'Route inconnue'}, 404)

    def do_POST(self):
        if urlparse(self.path).path == '/api/importer':
            return self.repondre_json(importer_le_dossier(silencieux=True))
        return self.repondre_json({'erreur': 'Route inconnue'}, 404)

    def end_headers(self):
        # L'app évolue : un fichier servi depuis le cache du navigateur
        # ferait croire à un bug qui n'existe plus.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class Serveur(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def adresse_lan():
    """L'IP visible depuis le téléphone. Aucune connexion n'est établie."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        return s.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        s.close()


def premier_port_libre(depart, essais=12):
    for port in range(depart, depart + essais):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(('', port))
                return port
            except OSError:
                continue
    return None


# ------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description='Carnet de plongée — serveur local')
    ap.add_argument('--port', type=int, default=8080)
    ap.add_argument('--pas-de-navigateur', action='store_true')
    ap.add_argument('--importer-seulement', action='store_true',
                    help='Importe le dossier puis quitte, sans servir l’app.')
    args = ap.parse_args()

    print()
    print('  ========================================')
    print('    Carnet de plongée — serveur local')
    print('  ========================================')
    print()
    print(f'  Dossier   : {RACINE}')
    print(f'  Carnet    : {CARNET}')
    print()

    DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)
    A_IMPORTER.mkdir(exist_ok=True)
    if not CARNET.exists():
        ecrire_carnet(dict(CARNET_VIDE), sauvegarder=False)
        print('  Carnet créé (vide).')

    print('  Import des saisies téléphone…')
    try:
        importer_le_dossier()
    except Exception as e:
        print(f'  [X] Import impossible : {e}')
        if args.importer_seulement:
            return 1
    print()

    if args.importer_seulement:
        return 0

    port = premier_port_libre(args.port)
    if port is None:
        print(f'  [X] Aucun port libre à partir de {args.port}.')
        return 1
    if port != args.port:
        print(f'  [!] Port {args.port} occupé, on prend {port}.')

    ip = adresse_lan()
    print(f'  Sur ce PC       : http://localhost:{port}/')
    print(f'  Sur le téléphone: http://{ip}:{port}/')
    print()
    print('  (même Wi-Fi ; sinon la saisie passe par PlongeeAImporter)')
    print('  Ctrl+C pour arrêter.')
    print()

    if not args.pas_de_navigateur:
        threading.Timer(1.0, lambda: webbrowser.open(f'http://localhost:{port}/')).start()

    with Serveur(('', port), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n  Serveur arrêté.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
