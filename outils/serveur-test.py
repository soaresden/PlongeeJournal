#!/usr/bin/env python3
"""
Tests du serveur local : fusion, import du dossier, routes HTTP,
et surtout ce qu'il doit REFUSER.

Aucune dépendance : python3 outils/serveur-test.py
"""

import importlib.util
import json
import os
import shutil
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent

resultats = []


def check(nom, condition, extra=''):
    resultats.append(('  OK  ' if condition else ' FAIL ') + nom
                     + ('' if condition else f' -> {extra}'))


def charger_module(racine_factice):
    """Recharge le module en le faisant pointer sur un dossier jetable."""
    spec = importlib.util.spec_from_file_location(
        'plongee_srv', RACINE / 'serveur' / 'plongee.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    r = Path(racine_factice)
    mod.RACINE = r
    mod.DOSSIER_DONNEES = r / 'donnees'
    mod.CARNET = mod.DOSSIER_DONNEES / 'carnet.json'
    mod.MEDIAS = mod.DOSSIER_DONNEES / 'medias'
    mod.SAUVEGARDES = mod.DOSSIER_DONNEES / 'sauvegardes'
    mod.A_IMPORTER = r / 'PlongeeAImporter'
    mod.IMPORTES = mod.A_IMPORTER / 'importes'
    mod.DOSSIER_DONNEES.mkdir(parents=True, exist_ok=True)
    mod.A_IMPORTER.mkdir(exist_ok=True)
    return mod


def ecrire(chemin, obj):
    Path(chemin).write_text(json.dumps(obj, ensure_ascii=False), encoding='utf-8')


# ============================================================
#  1. Noms de fichiers : ce qui doit être refusé
# ============================================================

with tempfile.TemporaryDirectory() as tmp:
    m = charger_module(tmp)

    check('nom simple accepté', m.nom_de_fichier_sur('tampon-b1.png') == 'tampon-b1.png')
    check('remontée de dossier refusée', m.nom_de_fichier_sur('../../pwn.txt') is None,
          str(m.nom_de_fichier_sur('../../pwn.txt')))
    check('chemin absolu refusé', m.nom_de_fichier_sur('/etc/passwd') is None)
    check('antislash refusé', m.nom_de_fichier_sur(r'..\..\pwn.txt') is None)
    check('fichier caché refusé', m.nom_de_fichier_sur('.bashrc') is None)
    check('espaces et accents refusés', m.nom_de_fichier_sur('mon tampon é.png') is None)
    check('nom vide refusé', m.nom_de_fichier_sur('') is None)
    check('nom interminable refusé', m.nom_de_fichier_sur('a' * 200 + '.png') is None)

    # Un nom dangereux ne doit rien écrire du tout, même pas ailleurs.
    m.enregistrer_medias({'medias': {'../../evade.png': 'AAAA'}})
    check('un média au nom refusé n’est écrit nulle part',
          not (Path(tmp) / 'evade.png').exists()
          and not (m.MEDIAS / 'evade.png').exists())


# ============================================================
#  2. Fusion : qui gagne quand deux versions se rencontrent
# ============================================================

with tempfile.TemporaryDirectory() as tmp:
    m = charger_module(tmp)

    carnet = dict(m.CARNET_VIDE)
    carnet = json.loads(json.dumps(carnet))     # copie profonde
    carnet['dives'] = [
        {'id': 'a', 'lieuNom': 'Ancien', 'updatedAt': '2026-01-01T00:00:00Z'},
        {'id': 'b', 'lieuNom': 'Intact', 'updatedAt': '2026-01-01T00:00:00Z'},
    ]

    bilan = m.fusionner(carnet, {'dives': [
        {'id': 'a', 'lieuNom': 'Plus récent', 'updatedAt': '2026-06-01T00:00:00Z'},
        {'id': 'c', 'lieuNom': 'Nouveau', 'updatedAt': '2026-06-01T00:00:00Z'},
        {'id': 'b', 'lieuNom': 'Périmé', 'updatedAt': '2025-01-01T00:00:00Z'},
        {'lieuNom': 'Sans identifiant'},
    ]})

    par_id = {d['id']: d for d in carnet['dives']}
    check('la version la plus récente gagne', par_id['a']['lieuNom'] == 'Plus récent',
          par_id['a']['lieuNom'])
    check('une version périmée ne remplace rien', par_id['b']['lieuNom'] == 'Intact',
          par_id['b']['lieuNom'])
    check('une plongée inconnue est ajoutée', par_id.get('c', {}).get('lieuNom') == 'Nouveau')
    # Deux ignorés : la version périmée de « b », et l'entrée sans identifiant.
    check('le bilan compte juste',
          (bilan['ajoutes'], bilan['remplaces'], bilan['ignores']) == (1, 1, 2), str(bilan))

    # Deux imports du même fichier ne doivent pas créer de doublon.
    avant = len(carnet['dives'])
    m.fusionner(carnet, {'dives': [{'id': 'c', 'lieuNom': 'Nouveau',
                                    'updatedAt': '2026-06-01T00:00:00Z'}]})
    check('réimporter deux fois ne duplique pas', len(carnet['dives']) == avant,
          f'{avant} -> {len(carnet["dives"])}')


# ============================================================
#  3. Import du dossier PlongeeAImporter
# ============================================================

with tempfile.TemporaryDirectory() as tmp:
    m = charger_module(tmp)

    ecrire(m.A_IMPORTER / 'plongeeNo0042-20260806_1830.json', {
        'divers': [{'id': 'd1', 'prenom': 'Denis', 'updatedAt': '2026-08-06T18:30:00Z'}],
        'dives': [{'id': 'p42', 'numero': 42, 'date': '2026-08-06',
                   'updatedAt': '2026-08-06T18:30:00Z'}],
        'medias': {'tampon.png': 'iVBORw0KGgo='},
    })
    (m.A_IMPORTER / 'casse.json').write_text('{ ceci n est pas du json', encoding='utf-8')

    bilan = m.importer_le_dossier(silencieux=True)

    check('les fichiers valides sont importés', bilan['fichiers'] == 1, str(bilan['fichiers']))
    check('un fichier illisible est signalé, pas fatal',
          len(bilan['erreurs']) == 1 and 'casse.json' in bilan['erreurs'][0],
          str(bilan['erreurs']))
    check('le carnet contient la plongée',
          len(m.lire_carnet()['dives']) == 1, str(len(m.lire_carnet()['dives'])))
    check('le média est devenu un fichier', (m.MEDIAS / 'tampon.png').exists())
    check('le fichier importé est rangé, pas supprimé',
          (m.IMPORTES / 'plongeeNo0042-20260806_1830.json').exists())
    check('le fichier illisible reste en attente',
          (m.A_IMPORTER / 'casse.json').exists())

    # Rejouer l'import : le fichier a bougé, donc plus rien à faire.
    bilan2 = m.importer_le_dossier(silencieux=True)
    check('rien n’est réimporté deux fois', bilan2['fichiers'] == 0, str(bilan2['fichiers']))

    # Un homonyme ne doit pas écraser l'archive précédente.
    ecrire(m.A_IMPORTER / 'plongeeNo0042-20260806_1830.json', {'dives': []})
    m.importer_le_dossier(silencieux=True)
    check('un homonyme archivé est horodaté, pas écrasé',
          len(list(m.IMPORTES.glob('plongeeNo0042-*.json'))) == 2,
          str(len(list(m.IMPORTES.glob('*.json')))))


# ============================================================
#  4. Écriture du carnet : atomique et sauvegardée
# ============================================================

with tempfile.TemporaryDirectory() as tmp:
    m = charger_module(tmp)

    m.ecrire_carnet({'version': 1, 'dives': [{'id': 'x'}]}, sauvegarder=False)
    check('pas de sauvegarde au premier écrit', not m.SAUVEGARDES.exists())

    m.ecrire_carnet({'version': 1, 'dives': [{'id': 'x'}, {'id': 'y'}]})
    check('la version précédente est sauvegardée',
          len(list(m.SAUVEGARDES.glob('carnet-*.json'))) == 1)
    check('aucun fichier temporaire ne traîne',
          not list(m.DOSSIER_DONNEES.glob('*.tmp')))

    ancien = json.loads(next(m.SAUVEGARDES.glob('carnet-*.json')).read_text(encoding='utf-8'))
    check('la sauvegarde contient bien l’état d’avant', len(ancien['dives']) == 1,
          str(len(ancien['dives'])))

    # Un carnet illisible doit lever, surtout pas être remplacé par du vide.
    m.CARNET.write_text('{ casse', encoding='utf-8')
    try:
        m.lire_carnet()
        check('un carnet illisible lève une erreur', False, 'aucune erreur levée')
    except Exception:
        check('un carnet illisible lève une erreur', True)
    check('un carnet illisible n’est pas écrasé',
          m.CARNET.read_text(encoding='utf-8') == '{ casse')


# ============================================================
#  5. Routes HTTP
# ============================================================

with tempfile.TemporaryDirectory() as tmp:
    m = charger_module(tmp)
    m.ecrire_carnet(json.loads(json.dumps(m.CARNET_VIDE)), sauvegarder=False)

    port = m.premier_port_libre(8231)
    httpd = m.Serveur(('127.0.0.1', port), m.Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{port}'
    time.sleep(0.3)

    def appel(chemin, methode='GET', corps=None, brut=False):
        req = urllib.request.Request(base + chemin, method=methode,
                                     data=corps if brut else
                                     (json.dumps(corps).encode() if corps is not None else None))
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    code, corps = appel('/api/etat')
    check('GET /api/etat répond', code == 200 and json.loads(corps)['serveur'] is True, str(code))
    check('l’état annonce l’écriture possible', json.loads(corps)['ecriture'] is True)

    code, corps = appel('/api/carnet')
    check('GET /api/carnet renvoie un carnet',
          code == 200 and 'dives' in json.loads(corps), str(code))

    code, _ = appel('/api/carnet', 'PUT', {'version': 1, 'dives': [{'id': 'z'}],
                                           'divers': [], 'buddies': [],
                                           'certifications': [], 'settings': {}})
    check('PUT /api/carnet enregistre', code == 200, str(code))
    check('le fichier sur le disque est à jour',
          len(m.lire_carnet()['dives']) == 1, str(len(m.lire_carnet()['dives'])))

    code, corps = appel('/api/carnet', 'PUT', {'pas': 'un carnet'})
    check('PUT d’un objet qui n’est pas un carnet est refusé', code == 400, str(code))
    check('le carnet n’a pas bougé après un refus', len(m.lire_carnet()['dives']) == 1)

    code, _ = appel('/api/carnet', 'PUT', b'{ casse', brut=True)
    check('PUT d’un JSON invalide est refusé', code == 400, str(code))

    code, _ = appel('/api/media/..%2f..%2fpwn.txt', 'PUT', b'x', brut=True)
    check('PUT d’un média au nom dangereux est refusé', code == 400, str(code))
    check('rien n’a été écrit hors du dossier',
          not (Path(tmp) / 'pwn.txt').exists() and not (m.MEDIAS / 'pwn.txt').exists())

    code, _ = appel('/api/media/tampon-b1.png', 'PUT', b'x', brut=True)
    check('PUT d’un média au nom correct passe', code == 200, str(code))
    check('le média est bien sur le disque', (m.MEDIAS / 'tampon-b1.png').exists())

    code, _ = appel('/api/inconnu', 'PUT', {})
    check('une route inconnue répond 404', code == 404, str(code))

    code, corps = appel('/api/importer', 'POST')
    check('POST /api/importer répond un bilan',
          code == 200 and 'fichiers' in json.loads(corps), str(code))

    httpd.shutdown()
    httpd.server_close()


# ============================================================
#  6. Le trajet complet : ce que le navigateur exporte, le serveur
#     doit savoir l'avaler. Le format est décrit à deux endroits
#     (js/export-plongee.js et ici) : ce test est le seul garde-fou
#     contre une divergence silencieuse entre les deux.
# ============================================================

with tempfile.TemporaryDirectory() as tmp:
    m = charger_module(tmp)

    # Copie fidèle de ce que produit construireExport() côté navigateur.
    export_navigateur = {
        "version": 1,
        "exporte": "2026-08-06T18:30:00.000Z",
        "origine": "saisie mobile",
        "divers": [{"id": "d1", "prenom": "Denis", "nom": "Soares",
                    "updatedAt": "2026-08-06T18:30:00Z"}],
        "buddies": [{"id": "b1", "prenom": "Alix", "nom": "Ducamp",
                     "stamps": [{"id": "t1", "dataUrl": "data:image/png;base64,iVBORw0KGgo="}],
                     "updatedAt": "2026-08-06T18:30:00Z"}],
        "certifs": [],
        "dives": [{"id": "p42", "diverId": "d1", "numero": 42, "date": "2026-08-06",
                   "lieuNom": "Sec du Gendarme", "profMax": 32, "buddyIds": ["b1"],
                   "updatedAt": "2026-08-06T18:30:00Z"}],
        "medias": {"tampon-b1-t1.png": "data:image/png;base64,iVBORw0KGgo="},
    }

    nom = "plongeeNo0042-20260806_1830.json"
    ecrire(m.A_IMPORTER / nom, export_navigateur)
    bilan = m.importer_le_dossier(silencieux=True)

    carnet = m.lire_carnet()
    check("l’export du navigateur est importé sans erreur",
          bilan["fichiers"] == 1 and not bilan["erreurs"], str(bilan))
    check("la plongée arrive dans le carnet",
          any(d["id"] == "p42" for d in carnet["dives"]), str(carnet["dives"]))
    check("le plongeur arrive avec",
          any(d["id"] == "d1" for d in carnet["divers"]))
    check("le compagnon arrive avec",
          any(b["id"] == "b1" for b in carnet["buddies"]))
    check("le tampon redevient un fichier image",
          (m.MEDIAS / "tampon-b1-t1.png").exists())
    check("la clé « certifs » du navigateur est comprise",
          "certifs" in carnet, str(list(carnet.keys())))

    # Le même fichier réimporté ne doit rien changer ni rien dupliquer.
    ecrire(m.A_IMPORTER / nom, export_navigateur)
    m.importer_le_dossier(silencieux=True)
    carnet2 = m.lire_carnet()
    check("réimporter le même fichier ne duplique rien",
          len(carnet2["dives"]) == len(carnet["dives"]) == 1,
          f'{len(carnet["dives"])} puis {len(carnet2["dives"])}')

    # Une correction plus récente doit, elle, passer.
    correction = json.loads(json.dumps(export_navigateur))
    correction["dives"][0]["lieuNom"] = "Sec du Gendarme (corrigé)"
    correction["dives"][0]["updatedAt"] = "2026-08-07T09:00:00Z"
    ecrire(m.A_IMPORTER / "plongeeNo0042-20260807_0900.json", correction)
    m.importer_le_dossier(silencieux=True)
    check("une correction plus récente remplace la version importée",
          m.lire_carnet()["dives"][0]["lieuNom"] == "Sec du Gendarme (corrigé)",
          m.lire_carnet()["dives"][0]["lieuNom"])


# ============================================================

print('\n'.join(resultats))
echecs = [r for r in resultats if r.startswith(' FAIL')]
print()
if echecs:
    print(f'{len(echecs)} test(s) en échec')
    sys.exit(1)
print('Tous les tests du serveur passent.')
