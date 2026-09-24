@echo off
rem Baut das Offline-Paket auf einem Windows-PC mit Internet (einmalig).
rem Ergebnis: dist\TexStyle-DTF-Windows.zip im Projektordner.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0baue-paket.ps1"
pause
