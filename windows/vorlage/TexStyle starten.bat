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
set "PYTHONIOENCODING=utf-8"
echo.
echo   TexStyle DTF laeuft.
echo   Dieses Fenster bitte offen lassen.
echo   Zum Beenden: dieses Fenster schliessen.
echo.
"%BASIS%programm\python\python.exe" -m texstyle_dtf.main --oeffnen
if errorlevel 1 goto startfehler
goto :eof

:startfehler
echo.
echo   Die App konnte nicht starten. Bitte eine Fachkraft holen.
echo.
pause
exit /b 1
