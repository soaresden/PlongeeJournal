@echo off
setlocal enabledelayedexpansion
title Carnet de plongee - serveur local
cd /d "%~dp0"

echo.
echo  ========================================
echo    Carnet de plongee
echo  ========================================
echo.

rem --- Recherche de Python -------------------------------------
set PY=
where py      >nul 2>&1 && set PY=py
if "!PY!"=="" ( where python  >nul 2>&1 && set PY=python )
if "!PY!"=="" ( where python3 >nul 2>&1 && set PY=python3 )

if "!PY!"=="" (
  echo  [X] Python n'a pas ete trouve.
  echo.
  echo      Installe-le depuis https://www.python.org/downloads/
  echo      en cochant bien "Add Python to PATH" pendant l'installation.
  echo.
  echo      Aucune autre dependance n'est necessaire :
  echo      le serveur n'utilise que la bibliotheque standard.
  echo.
  pause
  exit /b 1
)

rem Le serveur s'occupe de tout : import du dossier PlongeeAImporter,
rem choix du port, ouverture du navigateur, adresse pour le telephone.
!PY! "serveur\plongee.py" %*

echo.
pause
