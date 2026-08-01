@echo off
setlocal enabledelayedexpansion
title Carnet de plongee - serveur local
cd /d "%~dp0"

set PORT=8080

echo.
echo  ========================================
echo    Carnet de plongee - serveur local
echo  ========================================
echo.

rem --- Verification du fichier d'identifiants -------------------
if not exist "credentials.json" (
  echo  [!] credentials.json est absent.
  echo      L'app demarrera sur l'ecran Reglages, c'est normal.
  echo      Pour eviter de resaisir tes cles : copie
  echo      credentials.example.json en credentials.json et remplis-le.
  echo.
) else (
  findstr /C:"\"ProjectID\": \"\"" credentials.json >nul 2>&1
  if !errorlevel! equ 0 (
    echo  [!] credentials.json : ProjectID est encore vide.
    echo      Supabase ^> Project Settings ^> General ^> Project ID
    echo.
  )
)

rem --- Recherche d'un serveur web statique ---------------------
set SERVER=

where py >nul 2>&1        && set SERVER=py
if "!SERVER!"=="" ( where python >nul 2>&1 && set SERVER=python )
if "!SERVER!"=="" ( where python3 >nul 2>&1 && set SERVER=python3 )
if "!SERVER!"=="" ( where node >nul 2>&1 && set SERVER=node )

if "!SERVER!"=="" (
  echo  [X] Ni Python ni Node.js n'ont ete trouves.
  echo.
  echo      Installe l'un des deux :
  echo        Python  https://www.python.org/downloads/
  echo        Node.js https://nodejs.org/
  echo.
  echo      Un simple double-clic sur index.html ne marche pas :
  echo      les modules JavaScript exigent un vrai serveur web.
  echo.
  pause
  exit /b 1
)

rem --- Liberation du port si deja pris --------------------------
netstat -ano | findstr ":%PORT% " | findstr LISTENING >nul 2>&1
if !errorlevel! equ 0 (
  echo  [!] Le port %PORT% est deja utilise. Passage au port 8081.
  set PORT=8081
)

echo  Serveur   : !SERVER!
echo  Adresse   : http://localhost:%PORT%
echo  Dossier   : %CD%
echo.
echo  Ferme cette fenetre ^(ou Ctrl+C^) pour arreter le serveur.
echo.

rem Ouvre le navigateur 2 secondes plus tard, le temps que le serveur reponde.
start "" /min cmd /c "timeout /t 2 >nul & start http://localhost:%PORT%/index.html"

if "!SERVER!"=="node" (
  npx --yes http-server -p %PORT% -c-1 --silent .
) else (
  !SERVER! -m http.server %PORT%
)

echo.
echo  Serveur arrete.
pause
