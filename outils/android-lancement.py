#!/usr/bin/env python3
"""
L'écran de lancement Android, sans logo : un fond d'eau, rien d'autre.

L'appli a sa propre ouverture animée (js/splash.js). Android en affiche
une avant elle : sur Android 12 et plus, le système pose l'icône de l'appli
au centre (thème Theme.SplashScreen). On la remplace par un dessin
transparent, sur la couleur de l'eau : on enchaîne sans voir de logo.

Usage : python outils/android-lancement.py android/app/src/main/res
"""
import re
import sys
from pathlib import Path

RES = Path(sys.argv[1] if len(sys.argv) > 1 else 'android/app/src/main/res')
EAU = '#1B8FC4'

# Un dessin vide (transparent) pour l'« icône » de l'écran système.
(RES / 'drawable').mkdir(parents=True, exist_ok=True)
(RES / 'drawable' / 'lancement_vide.xml').write_text(
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n'
    '    <solid android:color="#00000000" />\n'
    '    <size android:width="1dp" android:height="1dp" />\n'
    '</shape>\n', encoding='utf-8')

styles = RES / 'values' / 'styles.xml'
texte = styles.read_text(encoding='utf-8')
style = re.search(r'<style name="AppTheme\.NoActionBarLaunch"[^>]*>(.*?)</style>', texte, re.S)
if not style:
    sys.exit('Style AppTheme.NoActionBarLaunch introuvable dans styles.xml')
corps = style.group(1)
for nom, valeur in [('windowSplashScreenBackground', EAU), ('windowSplashScreenAnimatedIcon', '@drawable/lancement_vide')]:
    corps = re.sub(rf'\s*<item name="{nom}">.*?</item>', '', corps)
    corps = corps.rstrip() + f'\n        <item name="{nom}">{valeur}</item>\n    '
texte = texte[:style.start(1)] + corps + texte[style.end(1):]
styles.write_text(texte, encoding='utf-8')
print(f'Écran de lancement sans logo : {styles}')
