# TexStyle DTF

TexStyle DTF ist eine lokal laufende Web-App für die Werkstatt: aus einem
hochgeladenen Bild (JPG, PNG, WebP) entsteht die Datei für den RIP des
DTF-Druckers. Die App läuft komplett auf dem eigenen Rechner, ohne
Internetverbindung im Betrieb, ohne Login, ohne Datenbank.

## Aufgabenteilung zwischen App und RIP

Der RIP des Druckers legt die endgültigen Druckdaten mit seinem hinterlegten
ICC-Profil an: Er rechnet die Farben in Druckfarben um, rastert und erzeugt
die Weißunterlage. Würde die App das vorwegnehmen, würde doppelt umgerechnet
bzw. doppelt gerastert. Die App liefert darum (`texstyle_dtf/rip.py`):

- PNG in RGB mit eingebettetem **sRGB-Profil**, damit der RIP weiß, wie die
  Farben gemeint sind. Bilder mit eigenem Profil (z. B. Adobe RGB oder ein
  CMYK-JPEG) werden beim Hochladen farbrichtig nach sRGB umgerechnet; ohne
  Profil gilt sRGB.
- **Durchsichtiger Hintergrund** bleibt erhalten; leere durchsichtige Ränder
  werden beim Hochladen abgeschnitten, weil sie Folie kosten.
- **Exakt in Druckgröße bei 300 dpi** (pHYs im PNG), Lanczos-Skalierung mit
  vormultiplizierter Transparenz (keine dunklen Säume an Kanten).
- Auf Wunsch **harte Kanten** (Standard): halbtransparente Pixel werden ganz
  sichtbar oder ganz durchsichtig, damit der RIP die Weißunterlage sauber
  anlegt.
- **Keine** CMYK-Umrechnung, kein Raster, keine Weißplatte, keine
  Schnittmarken.

Das frühere PDF/X-1a-Druck-PDF und das DTF-Modul (eigenes Halbtonraster und
Weißplatte) sind für diesen Ablauf falsch und deshalb nicht mehr in der
Oberfläche. Die Schnittstellen (`/api/pdf-erzeugen`, `/api/dtf-erzeugen`)
und ihre Tests bestehen noch; nur sie brauchen Ghostscript und ein
CMYK-Profil (siehe unten).

## Voraussetzungen

- Python 3.11
- Nur für die älteren Schnittstellen PDF/X und DTF-Raster: Ghostscript
  (Kommandozeilenprogramm `gs`) und ein CMYK-ICC-Profil (siehe
  „ICC-Profil einrichten“). Die Datei für den RIP braucht beides nicht.

### Ghostscript installieren

Unter Debian/Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y ghostscript
```

Prüfen, ob es funktioniert hat:

```bash
gs --version
```

Unter Windows/macOS: Ghostscript von der offiziellen Projektseite installieren
und sicherstellen, dass der Befehl `gs` (Windows: `gswin64c`, ggf. im PATH
verlinken) in der Kommandozeile verfügbar ist.

### Python-Pakete installieren

```bash
pip install -r requirements.txt
```

Das installiert FastAPI, Uvicorn, Pillow, NumPy, pikepdf und pytest.

## ICC-Profil einrichten (nur für PDF/X und DTF-Raster)

Für die Datei für den RIP ist kein Profil nötig. Die älteren Schnittstellen
PDF/X und DTF-Raster konvertieren Bilder über ein echtes ICC-Profil nach CMYK. Es gibt
**keinen** eingebauten Ersatz und **keinen** stillen Fallback: Ohne
eingerichtetes Profil bricht die App mit einer klaren Fehlermeldung ab, statt
mit falschen Farben zu drucken.

1. Das CMYK-Zielprofil besorgen, das zur eigenen Druckerei bzw. zum eigenen
   Drucker/Papier passt (z. B. vom Drucker-Hersteller, vom Druckdienstleister
   oder ein branchenübliches Profil wie „PSO Coated v3" oder „FOGRA39" –
   die Beschaffung ist bewusst nicht Teil dieser App, siehe „Nicht bauen"
   in der Aufgabenstellung: kein automatischer Download von ICC-Profilen).
2. Die Umgebungsvariable `TEXSTYLE_ICC_CMYK` auf den vollständigen Pfad der
   `.icc`-Datei setzen:

   ```bash
   export TEXSTYLE_ICC_CMYK=/pfad/zu/meinem-profil.icc
   ```

   Unter Windows (PowerShell):

   ```powershell
   $env:TEXSTYLE_ICC_CMYK = "C:\Profile\mein-profil.icc"
   ```

3. Die Variable muss in der Shell gesetzt sein, aus der die App gestartet
   wird (dauerhaft z. B. in `~/.bashrc` eintragen).

**Nur zum Ausprobieren ohne eigenes Profil:** Ghostscript bringt ein
Beispiel-CMYK-Profil mit, das unter Linux meist unter
`/usr/share/color/icc/ghostscript/default_cmyk.icc` liegt. Das ist ein
allgemeines SWOP-Profil (Artifex Software), **kein** auf einen echten Drucker
kalibriertes Profil, und sollte nicht für echte Druckaufträge verwendet
werden – nur um zu sehen, dass die App grundsätzlich läuft.

## App starten

Standardmäßig ist die App nur auf diesem Rechner erreichbar
(`127.0.0.1`, nicht von anderen Geräten im Netzwerk aus aufrufbar):

```bash
uvicorn texstyle_dtf.main:app
```

Danach im Browser öffnen: <http://127.0.0.1:8000>

**Netzwerkfreigabe** (z. B. wenn mehrere Arbeitsplätze in der Werkstatt
zugreifen sollen) nur bewusst über den `--lan`-Schalter, mit Warnhinweis in
der Konsole:

```bash
python -m texstyle_dtf.main --lan
```

Ein anderer Port lässt sich mit `--port` wählen (nur im `--lan`-Startmodus):

```bash
python -m texstyle_dtf.main --port 8080
```

## Android-Tablet und Handy

Die Oberfläche rechnet die Datei für den RIP komplett im Browser
(`texstyle_dtf/static/rip.js`), mit denselben Regeln wie `rip.py`. Darum
läuft die App auch allein auf Android, ohne PC und ohne Server; das Bild
verlässt das Gerät nie. Manifest und Service Worker (`manifest.webmanifest`,
`sw.js`) machen sie installierbar und offline nutzbar.

**Installieren:** GitHub Pages veröffentlicht den `main`-Branch unter
<https://gnauck68-blip.github.io/DTF-Druckdatei-pr-fen-/>. Dort „App öffnen“
tippen, dann im Chrome-Menü „App installieren“ bzw. „Zum Startbildschirm
hinzufügen“. Nach dem ersten Öffnen läuft die App auch im Flugmodus.
Updates holt sich das Gerät beim nächsten Start mit Internet (dafür in
`sw.js` die `VERSION` erhöhen).

**Gleiches Ergebnis wie Python:** `tests/test_browser.py` spielt die App auf
einem nachgebildeten Pixel 7 durch (online und im Flugmodus) und vergleicht
die Browser-Datei mit der Python-Datei: gleiche Pixelmaße, 300 dpi,
byte-gleiches sRGB-Profil (`texstyle_dtf/srgb.icc`), harte Kanten,
deckungsgleiche Motivfläche. Der Test braucht Node.js mit Playwright und
wird sonst übersprungen.

## Werkzeuge für Fachkräfte (Funktionen aus dem Texstyle DTF Studio)

Unter den vier Schritten steht der aufklappbare Bereich „Werkzeuge für
Fachkräfte“. Die vier Schritte bleiben der Standardweg; ohne Eingriff im
Bereich liefert die App dieselbe RIP-Datei wie vorher. Die Rechenfunktionen
kommen aus dem Studio (`studio/dist/engine.mjs`, `resample.mjs`,
`crop-geometry.mjs`). `node scripts/studio-engine-bauen.mjs` baut daraus
`texstyle_dtf/static/studio-engine.js`; ein Test meldet, wenn die Datei nicht
mehr zum Studio passt.

- **Rückgängig / Wiederholen** für Zuschnitt, Hintergrund, Größe und alle
  Einstellungen (nur im Arbeitsspeicher, höchstens 40 Schritte).
- **Projekt speichern/öffnen** (`.texdtf`): Bild, Einstellungen und
  Sammelbogen in einer Datei. Projekte aus dem Studio lassen sich öffnen.
  **Testmotiv** zum Ausprobieren.
- **Bildausschnitt wählen** mit Rahmen (ziehen, Ecken, Pfeiltasten,
  Pixelwerte), beidseitiger Beschnitt in Prozent, Original wiederherstellen,
  **Spiegeln**.
- **Freistellen**: Verfahren „am Rand zusammenhängend“ (Standard wie
  bisher), „überall im Bild“ (auch Innenräume, mit weichem Übergang) und
  „einfarbige Schrift“ (saubere JPG-Kanten, Schriftfarbe, Störungen,
  Kantenkontrast); Hintergrundfarbe per Farbfeld, Farbsäume bereinigen,
  Textilfarbe im Motiv aussparen, Kanten einziehen (0–2 Pixel).
- **Tonwerte und Farbe**: Histogramm, Schwarz- und Weißpunkt (auch per
  Antippen), Gamma, Farbton, Sättigung, Helligkeit.
- **Ansicht**: Ergebnis, Original, Vergleich, Weißmaske; Vorschau auf
  Textilfarbe statt Karomuster.
- **Druckdatei**: 300 oder 600 dpi, Höhe statt Breite vorgeben, Lanczos-3
  (im Worker, bis 24 Millionen Pixel), Halbtonraster (LPI, Winkel, Form),
  PNG oder PDF; danach 100-%-Ansicht, Weißmaske als PNG, einfarbige
  SVG-Konturen.
- **Sammelbogen**: mehrere Motive mit Breite und Menge, automatisch in
  Reihen angeordnet (bei Bedarf gedreht), mit der Hand verschiebbar,
  Überlappungsprüfung, Ausgabe als PNG mit sRGB-Profil oder als PDF.
- **Dunkel**-Schalter oben; „In einen Ordner speichern“, wo der Browser
  das kann (Chrome/Edge am PC).

Was bei der RIP-Datei bleibt: PNG immer mit sRGB-Profil und der gewählten
Auflösung (pHYs). Das Halbtonraster ersetzt „Kanten glätten“ und nimmt dem
RIP die Rasterung ab; nur einschalten, wenn der RIP das nicht selbst macht.
PDF und Weißmaske tragen kein Farbprofil; für den RIP ist das PNG die
richtige Datei. Nicht übernommen aus dem Studio: das Offline-Einrichten über
ChatGPT Sites (die App hat ihren eigenen Offline-Modus).

**Pflicht-Häkchen vor dem Speichern** (wie im Studio, gilt für alle): Nach
„Druck-Datei machen“ erscheinen „Datei speichern“, „In einen Ordner
speichern“ und „Weißmaske speichern“ erst, wenn beide Punkte abgehakt sind:
Schrift, Kanten, Innenflächen, Motivdetails und Hinweise geprüft; Druckgröße
und Ausrichtung stimmen mit dem Auftrag. Jede Änderung am Bild oder an den
Einstellungen macht die Datei ungültig und nimmt die Häkchen wieder weg.

## Texstyle DTF Studio (Ordner `studio/`)

Eine zweite, eigenständige Web-App. Sie wurde mit ChatGPT erstellt und lief
unter `texstyle-dtf-studio.gnauck68.chatgpt.site` (ChatGPT Sites, nur mit
Login). Der Quellcode ist hier unverändert übernommen; nur die Tests suchen
das Canvas-Paket jetzt im eigenen `node_modules` statt in der
ChatGPT-Umgebung.

Die App läuft komplett im Browser: Freistellen nach Farbe, Zuschnitt,
Tonwerte, Halbtonraster auf der Transparenz, Weißmaske, Sammelbogen, Export
als PNG, PDF oder einfarbiges SVG. Einzelheiten stehen in
`studio/README.md`.

Achtung beim Zusammenspiel mit dem RIP: Raster und Weißmaske aus dem Studio
nehmen Arbeit vorweg, die laut „Aufgabenteilung zwischen App und RIP“ der
RIP machen soll. Für die normale RIP-Datei diese Funktionen ausgeschaltet
lassen. Das Studio bettet außerdem kein sRGB-Profil ein.

Starten: `studio/dist/index.html` über einen lokalen Webserver öffnen, zum
Beispiel `python -m http.server` im Ordner `studio/dist`. Der Offline-Modus
(Service Worker) ist auf ChatGPT Sites zugeschnitten: Er lädt `.html`-Seiten
ohne Endung, und das Manifest startet unter `/offline.html`. Auf einem
anderen Server oder in einem Unterordner klappt die Offline-Einrichtung
deshalb nicht ohne Anpassung; die App selbst funktioniert.

Tests (Node.js 22):

```bash
cd studio
npm install
npm test
```

## Windows: Offline-Paket ohne Installation

Für Werkstatt-PCs mit Windows gibt es ein fertiges Paket, das ohne
Installation, ohne Administratorrechte und ohne Internet läuft. Es enthält
Python 3.11, alle Bibliotheken, Ghostscript und die App.

**Paket holen:** GitHub Actions baut es bei jeder Änderung an der App
automatisch auf einem Windows-Rechner und testet es dort
(`.github/workflows/windows-paket.yml`). Download: im Repository auf
„Actions“ > „Windows-Paket“ > letzten grünen Lauf öffnen > unter „Artifacts“
„TexStyle-DTF-Windows“. Von Hand geht es auf einem Windows-PC mit Internet
und Python 3.11 per Doppelklick auf `windows\Paket-bauen.bat`.

**Einrichten und benutzen:** steht in `LIESMICH.txt` im Paket. Kurz:
Ordner auf den PC kopieren, „Verknuepfung auf Desktop anlegen.bat“
doppelklicken. Danach startet ein Doppelklick auf „TexStyle DTF“ die App und
öffnet den Browser. Ein Farbprofil ist nicht nötig, das hat der RIP.

Die Startdatei setzt `TEXSTYLE_GS` auf das mitgelieferte Ghostscript (nur für
die älteren Schnittstellen PDF/X und DTF-Raster).

## Beispieldurchlauf

1. Die App öffnen (Windows-Paket, Web-Adresse oder installiert auf Android).
2. **Schritt 1 „Bild aussuchen“:** JPG, PNG oder WebP wählen (max. 50 MB,
   höchstens 100 Millionen Pixel) oder mit der Maus auf die Fläche ziehen.
3. **Schritt 2 „Hintergrund entfernen“:** Einen einfarbigen Hintergrund
   erkennt die App am Bildrand und entfernt ihn gleich; der Regler „Wie viel
   wird entfernt?“ steuert die Toleranz, „Auch Innenflächen entfernen“ nimmt
   eingeschlossene Flächen in der Hintergrundfarbe mit (Loch im „o“).
   Ins Vorschaubild tippen wählt die Farbe, die weg soll. Danach wird der
   Saum um 1 px abgetragen und der leere Rand abgeschnitten.
4. **Schritt 3 „Größe wählen“:** Breite in cm eintippen, mit − und + ändern
   oder Schnellwahl (8, 10, 25, 30 cm). Die Höhe folgt aus dem Motiv. Die
   Ampel zeigt die Auflösung des Originals in dieser Breite; zu kleine Bilder
   werden nicht gesperrt, sondern hochgerechnet.
5. **Schritt 4 „Druck-Datei machen“:** Die App rechnet auf 300 dpi,
   glättet die Kanten (Alpha weichzeichnen, dann hart schneiden, beim
   Hochrechnen stärker), schärft beim Vergrößern leicht nach und auf Wunsch
   „Logo glätten“: die Farben kommen dann aus einer Vektorform
   (ImageTracer, lokal in `static/imagetracer.js`), der Umriss aus der
   geglätteten Rasterfassung. Ergebnis mit Vorschau und Prüfung. Nach dem
   Abhaken der beiden Prüfpunkte erscheint „Datei speichern“; die Datei in
   den RIP des Druckers laden.

### Bild ins Format setzen

Das Seitenverhältnis des Bildes bleibt immer erhalten, das Bild wird nie
verzerrt.

- **Einpassen** (Standard): Das ganze Motiv passt in die gewählte Größe,
  nichts wird abgeschnitten. Die Datei ist so groß wie das Motiv, ohne leeren
  Rand.
- **Fläche füllen:** Das Motiv füllt die Größe ganz aus; was übersteht, wird
  mittig abgeschnitten. Die Datei ist genau so groß wie die gewählte Größe.

Die Auflösung wird immer an der Größe gemessen, in der das Motiv tatsächlich
gedruckt wird (Pixel des Originals je Zoll Druckgröße). Die Datei wird auf
300 dpi gerechnet; beim Vergrößern entstehen dadurch keine neuen Details,
darum gilt die Ampel für das Original.

### Bedienung und Barrierefreiheit

Die Oberfläche ist für Menschen gebaut, die schlecht lesen oder schlecht
sehen, und lässt sich mit Maus oder nur mit der Tastatur bedienen:

- drei geführte Schritte mit Bildsymbolen und kurzen Sätzen,
- Ampel immer mit Symbol, Wort und Farbe („Gut“ mit Haken, „Achtung“ mit
  Dreieck, „Stopp“ mit Achteck), nie nur über die Farbe,
- Textkontraste von mindestens 7:1 (WCAG 2.2, Stufe AAA),
- Knopf „Große Schrift“ (vergrößert die ganze Seite um 25 %, wird im
  Browser gemerkt),
- Knopf „Vorlesen“ mit den Sprachausgabe-Stimmen des Betriebssystems. Er
  erscheint nur, wenn eine deutsche Stimme installiert ist; lokale Stimmen
  werden bevorzugt, damit es ohne Internet funktioniert. Gibt es mehrere,
  lässt sich daneben die Stimme wählen: „Frau Isabella“ (beste Frauenstimme)
  oder „Herr Michael“ (beste Männerstimme); nach dem Wechsel stellt sie sich
  vor. Die Wahl wird im Browser gemerkt.
  Android-Chrome meldet meist nur eine Stimme; dort wird Frau oder Mann in den
  Android-Einstellungen unter Text-zu-Sprache gewählt,
- deutlich sichtbarer Tastaturfokus, Meldungen für Screenreader
  (`aria-live`, `role="alert"`),
- Fachbegriffe und Fachregler nur im zugeklappten Bereich „Für Fachkräfte“.

### Beispieldurchlauf über die Kommandozeile prüfen

Das mitgelieferte Prüfskript kann jede erzeugte PDF-Datei unabhängig
kontrollieren:

```bash
python scripts/verify_pdfx.py pfad/zur/heruntergeladenen-datei.pdf
```

Erwartete Ausgabe bei einer gültigen Datei (Beispiel für ein A3-Testbild):

```
--- Prüfergebnisse ---
  Dateigröße: 0.2 MB.
  Auflösung: Auflösung ausreichend: 308 dpi im Endformat.
  Farbraum: Nur CMYK/Graustufen im PDF, wie gefordert.
  ICC-Profil vorhanden: CMYK-ICC-Profil ist eingebettet.
  Farbauftrag: Farbauftrag 201% ist unbedenklich.
  TrimBox: Endformat: 297 x 420 mm.
  BleedBox: Anschnitt 3 mm rundum korrekt gesetzt.
  PDF-Version: PDF-Version 1.3 ist korrekt.
  OutputIntent: OutputIntent ist eingebettet.
  Seitenzahl: 1
  Keine Textobjekte/Schriften im PDF (Version 1 verwendet keinen Text).
PASS
```

## Tests

```bash
pytest
```

Die Testsuite deckt alle Kernfunktionen ab: Formate und Auflösungsprüfung,
CMYK-Konvertierung und Farbauftragsbegrenzung, PDF/X-Aufbau und -Geometrie,
Preflight-Ampel (inklusive Download-Sperre bei einem 72-dpi-Testbild) und das
DTF-Modul (Halbtonraster, Weißplatte, Filmrand, Deckungsgleichheit).
`tests/test_browser.py` und `tests/test_werkzeuge.py` spielen die App in
Chromium durch (einfacher Weg auf einem nachgebildeten Pixel 7, offline;
alle Werkzeuge für Fachkräfte mit Prüfung der gespeicherten Dateien).

Für die CMYK-Tests wird automatisch das oben erwähnte Ghostscript-Beispielprofil
verwendet, falls `TEXSTYLE_ICC_CMYK` nicht gesetzt ist (siehe
`tests/conftest.py`) – das ist kein Download aus dem Netz, sondern Teil der
bereits installierten Ghostscript-Installation.

## Datenschutz: welche Daten liegen wo, wie lange, wie löschen

- **Wo:** Hochgeladene Bilder und alle erzeugten Dateien (Druck-PDFs,
  DTF-PNGs, DTF-Vorschau-PDFs) liegen ausschließlich im Ordner `workdir/`
  im Projektverzeichnis (`workdir/uploads/` und `workdir/outputs/`). Es
  gibt keine Datenbank und keine Cloud-Anbindung.
- **Was:** Vom hochgeladenen Bild werden nur die Bildpunkte als PNG
  gespeichert, nie die Originaldatei. Metadaten wie GPS-Ort, Kameramodell
  oder Name des Fotografen (EXIF, XMP, IPTC) werden verworfen; vorher wird
  die EXIF-Drehung angewendet, damit Handyfotos aufrecht stehen. Auch die
  erzeugten PDFs und PNGs enthalten keine dieser Metadaten.
- **Wie lange:** Jede Datei wird automatisch nach 24 Stunden gelöscht
  (stündlicher Löschlauf, solange die App läuft). Beim Programmstart wird der
  Arbeitsordner komplett geleert, damit Bilder nicht über ein Wochenende
  liegen bleiben, nur weil der Rechner aus war.
- **Von Hand löschen:** Die App stoppen und den Inhalt von
  `workdir/uploads/` und `workdir/outputs/` leeren (die Dateien
  `.gitkeep` können bleiben, sie sind leer und nur für Git nötig).
- **Zugriffslog:** Es wird kein Zugriffslog mit IP-Adressen geführt. Es
  werden ausschließlich Fehler protokolliert, ohne Dateinamen und ohne
  weitere Nutzerdaten.
- **Netzwerk:** Die App braucht zur Laufzeit keine Internetverbindung. Es
  gibt keine Telemetrie und keine CDN-Einbindung – alle Schriften und
  Skripte sind lokal in der ausgelieferten Seite enthalten.
- **Vorlesen:** nutzt nur Sprachausgabe-Stimmen, die auf dem Rechner selbst
  laufen (`localService`). Online-Stimmen des Browsers, die den Text an den
  Hersteller schicken würden, werden nie verwendet. Ohne lokale deutsche
  Stimme bleibt der Knopf ausgeblendet.
- **Im Browser gespeichert:** nur die Einstellungen „Große Schrift“,
  „Dunkel“ und die gewählte Vorlese-Stimme (`localStorage`), keine Bilder,
  keine Nutzerdaten.
- **Außerhalb der App:** Gespeicherte Druckdateien landen im Download-Ordner
  des Browsers. Den löscht die App nicht; er sollte in der Werkstatt
  regelmäßig geleert werden.
- **Erreichbarkeit:** Standardmäßig nur von diesem Rechner aus erreichbar
  (`127.0.0.1`). Eine Freigabe im lokalen Netzwerk erfolgt nur bewusst über
  den Schalter `--lan` (siehe oben), mit Warnhinweis beim Start.

## Bekannte Einschränkungen und bewusste Vereinfachungen

- **PDF/X-1a:2001-Details ohne eindeutige Normvorgabe:** Die genaue
  Geometrie von Schnitt- und Passermarken sowie der Wortlaut von
  `OutputCondition`/`OutputConditionIdentifier` bei einem selbst
  eingerichteten (nicht bei ICC.org registrierten) Profil sind keine
  ISO-15930-1-Vorgaben, sondern Druckerei-Konvention. Die getroffenen,
  nachvollziehbaren Festlegungen stehen im Code-Kommentar in
  `texstyle_dtf/pdfx.py`.
- **Passermarken** sind hier vereinfacht als reines CMYK-Schwarz umgesetzt,
  nicht als "All"-Separationsfarbe (die auf jeder Druckplatte erscheinen
  würde).
- **Farbauftragsbegrenzung** erfolgt durch gleichmäßige, proportionale
  Reduktion aller vier CMYK-Kanäle je Pixel (siehe
  `texstyle_dtf/color.py`), nicht durch eine differenzierte
  Unterfarbentfernung (GCR/UCR).
- **DTF-Halbtonraster** verwendet einen einzigen Rasterwinkel für alle vier
  CMYK-Kanäle (nicht vier unterschiedliche Winkel wie in der klassischen
  Offset-Trennung).
- **DTF-PNG-Export:** PNG unterstützt keinen CMYK-Farbraum. Die im
  CMYK-Raum berechneten Halbtonpunkte werden daher mit einer einfachen,
  nicht farbmetrischen Formel nach RGB zurückgerechnet, nur damit der
  Farbfilm als PNG gespeichert werden kann.
- **DTF-PDF** ist ein einfaches zweiseitiges Vorschau-/Dokumentationsdokument
  (Farbfilm, Weißplatte), keine PDF/X-Datei – das ist für dieses Modul
  nirgends gefordert.

Nicht Teil dieser App (bewusst nicht gebaut): KI-Upscaler, Vektorisierung,
Hintergrundentfernung, Sticker-Schnittlinien, mehrseitige Druckdokumente,
Login, Cloud-Anbindung, Datenbank.
