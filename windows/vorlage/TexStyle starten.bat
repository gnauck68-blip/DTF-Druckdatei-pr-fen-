@echo off
rem Startet TexStyle DTF und oeffnet den Browser.
rem Das Fenster muss offen bleiben, solange die App benutzt wird.
rem Ohne Klammerbloecke geschrieben: Ordnernamen mit Klammern, etwa
rem "Programme (x86)", wuerden solche Bloecke sonst vorzeitig beenden.
chcp 65001 >nul
setlocal
set "BASIS=%~dp0"
title TexStyle DTF

set "TEXSTYLE_GS=%BASIS%programm\ghostscript\bin\gswin64c.exe"
set "TEXSTYLE_ICC_CMYK="
for %%F in ("%BASIS%profil\*.icc" "%BASIS%profil\*.icm") do if not defined TEXSTYLE_ICC_CMYK set "TEXSTYLE_ICC_CMYK=%%~fF"
if not defined TEXSTYLE_ICC_CMYK goto kein_profil

set "PYTHONIOENCODING=utf-8"
echo.
echo   TexStyle DTF laeuft.
echo   Dieses Fenster bitte offen lassen.
echo   Zum Beenden: dieses Fenster schliessen.
echo.
"%BASIS%programm\python\python.exe" -m texstyle_dtf.main --oeffnen
if errorlevel 1 goto startfehler
goto :eof

:kein_profil
echo.
echo   STOPP: Es fehlt das Farbprofil.
echo.
echo   Eine Fachkraft muss einmal eine ICC-Datei in diesen Ordner legen:
echo   "%BASIS%profil"
echo.
echo   Mehr dazu steht in LIESMICH.txt.
echo.
pause
exit /b 1

:startfehler
echo.
echo   Die App konnte nicht starten. Bitte eine Fachkraft holen.
echo.
pause
exit /b 1
