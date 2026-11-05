# Données de référence (tests Suunto Ocean)

Utilisées par `outils/ocean-test.mjs`. Aucune ne vient du carnet.

| Fichier | Contenu | Origine |
|---|---|---|
| `nautic-1787752091.sbem.gz` | Une vraie plongée de Suunto Nautic (même plateforme que l'Ocean), décompressée, gzippée ici. sha256 du contenu : `d9b34541…b352`. Valeurs attendues : 1922 s, 33,113 m max, 21,238 m moy., 20,85 → 24,3 °C, bloc 225,58 → 80,52 bar. | [deepsealabs/libdc-swift](https://github.com/deepsealabs/libdc-swift), `Tests/LibDCSwiftTests/Fixtures/suunto_nautic_1787752091.sbem` et `.golden.json` (LGPL 2.1) |
| `nautic-1787752091-debut.hs` | Les 24 000 premiers octets de la plongée ci-dessus, compressés par l'implémentation de référence de Heatshrink (heatshrink2, fenêtre 7, motif 5) : vérifie le décodeur octet pour octet. | produit ici depuis le fichier précédent |
| `logbook-entries-reponse.bin` | Une vraie réponse de montre à `/Logbook/Entries` (deux plongées), sans ses 4 premiers octets `A5 05 46 00` : on la reconstitue et son CRC-32 doit être bon. | libdc-swift, `Tests/LibDCSwiftTests/Fixtures/logbook_entries_multi.bin` (LGPL 2.1) |

`.gitattributes` les marque en binaire.
