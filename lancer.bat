@echo off
setlocal enabledelayedexpansion
title Carnet de plongee
cd /d "%~dp0"

rem ------------------------------------------------------------
rem  Ouvre le carnet sur ce PC, sans Internet pour le code.
rem  Les donnees, elles, se synchronisent avec ton depot GitHub
rem  prive (a brancher une fois dans Reglages).
rem
rem  Plus simple encore : https://soaresden.github.io/PlongeeJournal/
rem ------------------------------------------------------------

set PY=
where py      >nul 2>&1 && set PY=py
if "!PY!"=="" ( where python  >nul 2>&1 && set PY=python )
if "!PY!"=="" ( where python3 >nul 2>&1 && set PY=python3 )

if "!PY!"=="" (
  echo  [X] Python introuvable. Utilise plutot le site :
  echo      https://soaresden.github.io/PlongeeJournal/
  start "" "https://soaresden.github.io/PlongeeJournal/"
  pause
  exit /b 1
)

echo.
echo  Carnet de plongee : http://localhost:8080/
echo  Ferme cette fenetre pour arreter.
echo.
start "" "http://localhost:8080/"
!PY! -m http.server 8080 --bind 127.0.0.1
