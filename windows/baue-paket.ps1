<#
.SYNOPSIS
    Baut das Offline-Paket "TexStyle-DTF" für Windows und testet es.

.DESCRIPTION
    Lädt Python (embeddable), die Bibliotheken und Ghostscript herunter, setzt
    daraus einen Ordner zusammen, der ohne Installation und ohne Internet läuft,
    und prüft ihn mit windows\rauchtest.py. Ergebnis: dist\TexStyle-DTF und
    dist\TexStyle-DTF-Windows.zip.

    Braucht einmalig: Internet, Windows 64 Bit, Python 3.11 zum Installieren der
    Bibliotheken. Der Ghostscript-Installer läuft still und kann nach
    Administratorrechten fragen. Läuft automatisch auf GitHub Actions
    (.github/workflows/windows-paket.yml) oder von Hand über Paket-bauen.bat.
#>
param(
    [string]$Ausgabe = (Join-Path $PSScriptRoot '..\dist'),
    # Pfad zu einem bereits heruntergeladenen Ghostscript-Installer (gs...w64.exe)
    [string]$GhostscriptSetup = '',
    [string]$Python = 'python',
    [switch]$OhneZip
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest ist sonst sehr langsam

$PythonVersion = '3.11.9'
$Wurzel = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Ausgabe = [IO.Path]::GetFullPath($Ausgabe)
$Paket = Join-Path $Ausgabe 'TexStyle-DTF'
$Programm = Join-Path $Paket 'programm'
$Temp = Join-Path ([IO.Path]::GetTempPath()) ('texstyle-bau-' + [guid]::NewGuid())

function Schritt([string]$Text) { Write-Host "`n== $Text" }

New-Item -ItemType Directory -Force $Temp | Out-Null
if (Test-Path $Paket) { Remove-Item -Recurse -Force $Paket }
New-Item -ItemType Directory -Force $Programm | Out-Null

try {
    Schritt "Python $PythonVersion (embeddable) laden"
    $pyZip = Join-Path $Temp 'python.zip'
    Invoke-WebRequest "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip" -OutFile $pyZip -TimeoutSec 300
    $pyDir = Join-Path $Programm 'python'
    Expand-Archive $pyZip -DestinationPath $pyDir
    # Suchpfade des mitgelieferten Python: Standardbibliothek, Bibliotheken, App
    $pth = Get-ChildItem $pyDir -Filter 'python3*._pth' | Select-Object -First 1
    Set-Content -Path $pth.FullName -Encoding ascii -Value @(
        ($pth.BaseName + '.zip'), '.', 'Lib\site-packages', '..\app', 'import site')

    Schritt 'Bibliotheken für Windows installieren'
    & $Python -m pip install --disable-pip-version-check `
        --target (Join-Path $pyDir 'Lib\site-packages') `
        --only-binary=:all: --platform win_amd64 --python-version 3.11 --implementation cp `
        -r (Join-Path $PSScriptRoot 'requirements-windows.txt')
    if ($LASTEXITCODE) { throw 'pip ist fehlgeschlagen.' }

    Schritt 'Ghostscript'
    if (-not $GhostscriptSetup) {
        $kopf = @{ 'User-Agent' = 'texstyle-dtf-paket' }
        if ($env:GITHUB_TOKEN) { $kopf.Authorization = "Bearer $env:GITHUB_TOKEN" }
        $release = Invoke-RestMethod 'https://api.github.com/repos/ArtifexSoftware/ghostpdl-downloads/releases/latest' -Headers $kopf -TimeoutSec 60
        $datei = $release.assets | Where-Object { $_.name -match '^gs\d+w64\.exe$' } | Select-Object -First 1
        if (-not $datei) { throw "Im Ghostscript-Release $($release.tag_name) fehlt der Installer gs...w64.exe." }
        Write-Host "Ghostscript $($release.tag_name): $($datei.name)"
        $GhostscriptSetup = Join-Path $Temp $datei.name
        Invoke-WebRequest $datei.browser_download_url -OutFile $GhostscriptSetup -Headers @{ 'User-Agent' = 'texstyle-dtf-paket' } -TimeoutSec 600
    }
    $gsZiel = Join-Path $Programm 'ghostscript'
    $siebenZip = @(
        (Get-Command 7z.exe -ErrorAction SilentlyContinue | ForEach-Object Source),
        (Join-Path $env:ProgramFiles '7-Zip\7z.exe')
    ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
    if ($siebenZip) {
        # Bevorzugt: den NSIS-Installer nur auspacken. Das braucht keine
        # Administratorrechte und kann nicht hängen (der stille Installer blieb
        # auf GitHub Actions 30 Minuten stehen).
        Write-Host "Ghostscript mit 7-Zip auspacken ($siebenZip)"
        & $siebenZip x $GhostscriptSetup "-o$gsZiel" -y | Out-Null
        if ($LASTEXITCODE) { throw "7-Zip konnte den Ghostscript-Installer nicht auspacken (Code $LASTEXITCODE)." }
        Remove-Item -Recurse -Force (Join-Path $gsZiel '$PLUGINSDIR') -ErrorAction SilentlyContinue
    } else {
        # Ohne 7-Zip: still installieren, aber höchstens 5 Minuten warten.
        # NSIS: /S = ohne Fenster, /D = Zielordner (letzter Parameter, ohne Anführungszeichen)
        $gsInstalliert = Join-Path $Temp 'gs'
        $lauf = Start-Process $GhostscriptSetup -ArgumentList '/S', "/D=$gsInstalliert" -PassThru
        if (-not $lauf.WaitForExit(300000)) {
            $lauf.Kill()
            throw 'Der Ghostscript-Installer hat sich nach 5 Minuten nicht beendet. Tipp: 7-Zip installieren, dann wird nur ausgepackt.'
        }
        if ($lauf.ExitCode -ne 0) { throw "Der Ghostscript-Installer endete mit Code $($lauf.ExitCode)." }
        Copy-Item $gsInstalliert $gsZiel -Recurse
        # Die Installation auf dem Bau-Rechner wieder entfernen, das Paket hat seine eigene Kopie
        $deinstaller = Get-ChildItem $gsInstalliert -Filter 'uninst*.exe' | Select-Object -First 1
        if ($deinstaller) {
            $weg = Start-Process $deinstaller.FullName -ArgumentList '/S' -PassThru
            [void]$weg.WaitForExit(120000)
        }
    }
    Get-ChildItem $gsZiel -Filter 'uninst*.exe' | Remove-Item -Force
    if (-not (Test-Path (Join-Path $gsZiel 'bin\gswin64c.exe'))) {
        Write-Host 'Inhalt des Ghostscript-Ordners:'
        Get-ChildItem $gsZiel | ForEach-Object { Write-Host "  $($_.Name)" }
        throw 'Im Ghostscript-Ordner fehlt bin\gswin64c.exe.'
    }

    Schritt 'App und Startdateien kopieren'
    $appDir = Join-Path $Programm 'app'
    New-Item -ItemType Directory -Force $appDir | Out-Null
    Copy-Item (Join-Path $Wurzel 'texstyle_dtf') $appDir -Recurse
    Get-ChildItem $appDir -Recurse -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force
    foreach ($ordner in 'workdir\uploads', 'workdir\outputs') {
        New-Item -ItemType Directory -Force (Join-Path $appDir $ordner) | Out-Null
    }
    Copy-Item (Join-Path $PSScriptRoot 'vorlage\*') $Paket -Recurse
    Copy-Item (Join-Path $PSScriptRoot 'rauchtest.py') $Programm

    Schritt 'Selbsttest mit dem fertigen Paket'
    # Nur für den Test der PDF/X- und DTF-Schnittstellen: das Beispielprofil von
    # Ghostscript. Die Datei für den RIP braucht kein Profil.
    $testProfil = Get-ChildItem $gsZiel -Recurse -Filter 'default_cmyk.icc' | Select-Object -First 1
    if (-not $testProfil) {
        $testProfil = Get-ChildItem $gsZiel -Recurse -Include '*cmyk*.icc' | Select-Object -First 1
    }
    if (-not $testProfil) { throw 'Für den Test fehlt ein CMYK-Profil (default_cmyk.icc) im Ghostscript-Ordner.' }
    Write-Host "Testprofil: $($testProfil.FullName)"
    $env:TEXSTYLE_GS = Join-Path $gsZiel 'bin\gswin64c.exe'
    $env:TEXSTYLE_ICC_CMYK = $testProfil.FullName
    $env:PYTHONIOENCODING = 'utf-8'
    & (Join-Path $pyDir 'python.exe') (Join-Path $Programm 'rauchtest.py')
    if ($LASTEXITCODE) { throw 'Der Selbsttest ist fehlgeschlagen.' }
    # Vom Test angelegte Dateien und Zwischenspeicher nicht mit ausliefern
    Get-ChildItem (Join-Path $appDir 'workdir') -Recurse -File | Remove-Item -Force
    Get-ChildItem $appDir -Recurse -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force

    if (-not $OhneZip) {
        Schritt 'ZIP packen'
        $zip = Join-Path $Ausgabe 'TexStyle-DTF-Windows.zip'
        if (Test-Path $zip) { Remove-Item $zip }
        Compress-Archive -Path $Paket -DestinationPath $zip
        Write-Host ("Fertig: {0} ({1:N0} MB)" -f $zip, ((Get-Item $zip).Length / 1MB))
    } else {
        Write-Host "Fertig: $Paket"
    }
}
finally {
    Remove-Item -Recurse -Force $Temp -ErrorAction SilentlyContinue
}
