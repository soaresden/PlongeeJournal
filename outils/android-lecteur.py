#!/usr/bin/env python3
"""
Regarder une vidéo pCloud en streaming dans un vrai lecteur (VLC, MX Player…).

Le lecteur intégré à l'appli (WebView) n'arrive pas à afficher l'image des
vidéos 4K en H.265 de la GoPro : le son passe, l'image reste figée. pCloud
ne donne, pour un lien public, que le fichier original. On passe donc son
adresse à Android, déclarée comme vidéo : il propose les lecteurs installés,
qui la lisent en streaming, sans téléchargement.

Ce script ajoute au projet Android généré par Capacitor :
 - un petit module natif « LecteurExterne » (méthode ouvrir({url, type, nom})) ;
 - son enregistrement dans MainActivity ;
 - la déclaration <queries> qui permet de savoir si un lecteur est installé
   (Android 11 et plus).

Usage : python outils/android-lecteur.py android
"""
import re
import sys
from pathlib import Path

ANDROID = Path(sys.argv[1] if len(sys.argv) > 1 else 'android')
PAQUET = 'com.soaresden.plongeejournal'
DOSSIER = ANDROID / 'app' / 'src' / 'main' / 'java' / Path(*PAQUET.split('.'))

PLUGIN = f'''package {PAQUET};

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Une vidéo en streaming dans un lecteur de l'appareil (VLC, MX Player…). */
@CapacitorPlugin(name = "LecteurExterne")
public class LecteurExternePlugin extends Plugin {{

    @PluginMethod
    public void ouvrir(PluginCall call) {{
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {{
            call.reject("Adresse de la vidéo manquante");
            return;
        }}
        String type = call.getString("type", "video/*");
        String nom = call.getString("nom", "");
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(Uri.parse(url), type);
        intent.putExtra("title", nom);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PackageManager pm = getContext().getPackageManager();
        int lecteurs = pm.queryIntentActivities(intent, 0).size();
        try {{
            getActivity().startActivity(Intent.createChooser(intent, "Regarder avec…"));
            com.getcapacitor.JSObject r = new com.getcapacitor.JSObject();
            r.put("lecteurs", lecteurs);
            call.resolve(r);
        }} catch (Exception e) {{
            call.reject(e.getMessage(), "ERREUR");
        }}
    }}
}}
'''

DOSSIER.mkdir(parents=True, exist_ok=True)
(DOSSIER / 'LecteurExternePlugin.java').write_text(PLUGIN, encoding='utf-8')

# Enregistrement dans MainActivity (avant super.onCreate, comme le veut Capacitor).
main = DOSSIER / 'MainActivity.java'
texte = main.read_text(encoding='utf-8')
if 'LecteurExternePlugin' not in texte:
    texte = re.sub(r'public class MainActivity extends BridgeActivity\s*\{\s*\}',
                   'public class MainActivity extends BridgeActivity {\n'
                   '    @Override\n'
                   '    public void onCreate(android.os.Bundle savedInstanceState) {\n'
                   '        registerPlugin(LecteurExternePlugin.class);\n'
                   '        super.onCreate(savedInstanceState);\n'
                   '    }\n'
                   '}', texte)
    if 'LecteurExternePlugin' not in texte:
        sys.exit(f'MainActivity inattendue, module non enregistré : {main}\n{texte}')
    main.write_text(texte, encoding='utf-8')

# Android 11+ : sans <queries>, on ne voit pas les lecteurs installés.
manifeste = ANDROID / 'app' / 'src' / 'main' / 'AndroidManifest.xml'
m = manifeste.read_text(encoding='utf-8')
if '<queries>' not in m:
    m = m.replace('<application', '<queries>\n        <intent>\n            <action android:name="android.intent.action.VIEW" />\n'
                  '            <data android:scheme="https" android:mimeType="video/*" />\n        </intent>\n'
                  '        <intent>\n            <action android:name="android.intent.action.VIEW" />\n'
                  '            <data android:scheme="http" android:mimeType="video/*" />\n        </intent>\n    </queries>\n\n    <application', 1)
    manifeste.write_text(m, encoding='utf-8')
print(f'Lecteur externe : {DOSSIER / "LecteurExternePlugin.java"} enregistré dans {main}')
