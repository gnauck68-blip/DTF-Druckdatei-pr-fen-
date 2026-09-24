@echo off
rem Legt auf dem Desktop eine Verknuepfung "TexStyle DTF" an.
setlocal
set "BASIS=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w = New-Object -ComObject WScript.Shell; $s = $w.CreateShortcut([Environment]::GetFolderPath(Desktop) + \TexStyle DTF.lnk); $s.TargetPath = $env:BASIS + TexStyle starten.bat; $s.WorkingDirectory = $env:BASIS; $s.Description = TexStyle DTF starten; $s.Save()"
if errorlevel 1 goto fehler
echo Fertig. Auf dem Desktop liegt jetzt "TexStyle DTF".
pause
goto :eof
:fehler
echo Die Verknuepfung konnte nicht angelegt werden.
pause
