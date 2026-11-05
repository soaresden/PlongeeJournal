#!/usr/bin/env python3
# ============================================================
#  Icônes et écran de lancement de l'APK
#
#  Capacitor génère un projet Android avec SES icônes et son
#  écran de démarrage. Ce script les remplace par ceux du carnet,
#  à partir de assets/icon-512.png et assets/icon-maskable.png.
#
#  Usage :  python outils/android-icones.py android/app/src/main/res
#  Demande Pillow (pip install pillow).
# ============================================================

import sys
from pathlib import Path
from PIL import Image

RACINE = Path(__file__).resolve().parent.parent
RES = Path(sys.argv[1] if len(sys.argv) > 1 else RACINE / 'android/app/src/main/res')
FOND = (6, 19, 31, 255)          # même bleu nuit que l'icône

icone = Image.open(RACINE / 'assets/icon-512.png').convert('RGBA')
masquable = Image.open(RACINE / 'assets/icon-maskable.png').convert('RGBA')

# Icônes classiques (48 dp) et premier plan des icônes adaptatives (108 dp).
DENSITES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

for nom, f in DENSITES.items():
    dossier = RES / f'mipmap-{nom}'
    dossier.mkdir(parents=True, exist_ok=True)
    cote = round(48 * f)
    icone.resize((cote, cote), Image.LANCZOS).save(dossier / 'ic_launcher.png')
    icone.resize((cote, cote), Image.LANCZOS).save(dossier / 'ic_launcher_round.png')
    avant = round(108 * f)
    masquable.resize((avant, avant), Image.LANCZOS).save(dossier / 'ic_launcher_foreground.png')

# Fond des icônes adaptatives.
valeurs = RES / 'values'
valeurs.mkdir(exist_ok=True)
(valeurs / 'ic_launcher_background.xml').write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
    '    <color name="ic_launcher_background">#06131F</color>\n</resources>\n',
    encoding='utf-8')

# Écrans de lancement : on garde la taille de chaque image d'origine,
# fond bleu nuit et icône centrée.
n = 0
for splash in RES.glob('drawable*/splash.png'):
    with Image.open(splash) as ancien:
        l, h = ancien.size
    img = Image.new('RGBA', (l, h), FOND)
    cote = round(min(l, h) * 0.32)
    logo = icone.resize((cote, cote), Image.LANCZOS)
    img.alpha_composite(logo, ((l - cote) // 2, (h - cote) // 2))
    img.convert('RGB').save(splash)
    n += 1

print(f'Icônes posées dans {RES} ; {n} écran(s) de lancement remplacé(s).')
