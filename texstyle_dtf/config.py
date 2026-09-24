"""Zentrale Konfiguration: Pfade und Umgebungsvariablen.

Alle Pfade liegen unterhalb des Projektordners (workdir). Es wird
bewusst nichts außerhalb des Projekts geschrieben oder gelesen.
"""
from __future__ import annotations

import os
from pathlib import Path

# Projekt-Wurzelverzeichnis (Ordner, der das Paket texstyle_dtf enthält)
PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Arbeitsverzeichnis für hochgeladene Bilder und erzeugte Ausgabedateien.
# Wird automatisch angelegt, falls es fehlt.
WORKDIR = PROJECT_ROOT / "workdir"
UPLOAD_DIR = WORKDIR / "uploads"
OUTPUT_DIR = WORKDIR / "outputs"

for _dir in (WORKDIR, UPLOAD_DIR, OUTPUT_DIR):
    _dir.mkdir(parents=True, exist_ok=True)

# Aufbewahrungsdauer für Dateien im Workdir (Datenschutz-Vorgabe: 24h).
RETENTION_HOURS = 24

# Intervall für den automatischen Löschlauf (stündlich, siehe Vorgabe).
CLEANUP_INTERVAL_SECONDS = 60 * 60

# Maximale Upload-Größe in Byte (Vorgabe: 50 MB).
MAX_UPLOAD_BYTES = 50 * 1024 * 1024

# Maximale Bildgröße in Pixeln. Deckt z. B. 58 x 100 cm bei 300 dpi ab (rund 81 MP)
# und schützt vor Bildern, deren Pixelzahl den Arbeitsspeicher sprengt.
MAX_BILD_PIXEL = 100_000_000

# Erlaubte Bildformate für den Upload.
ALLOWED_UPLOAD_CONTENT_TYPES = {
    "image/jpeg": (".jpg", ".jpeg"),
    "image/png": (".png",),
    "image/webp": (".webp",),
}

# ICC-Zielprofil für die CMYK-Konvertierung (Schritt 2). Muss vom Betreiber
# bereitgestellt werden, kein automatischer Download, kein stiller Fallback.
# Wird als Funktion (nicht als Konstante) gelesen, damit Tests die
# Umgebungsvariable pro Testfall setzen/entfernen können.
def get_icc_cmyk_env() -> str:
    return os.environ.get("TEXSTYLE_ICC_CMYK", "").strip()

# Zielauflösung für die Druckprüfung (dpi).
TARGET_DPI = 300
DPI_WARN_THRESHOLD = 300  # unterhalb: gelb
DPI_ERROR_THRESHOLD = 150  # unterhalb: rot

# Maximaler Gesamtfarbauftrag (Total Area Coverage) in Prozent.
MAX_INK_COVERAGE_PERCENT = 300

# Anschnitt (Bleed) in mm, siehe Punkt 6 der Anforderungen.
BLEED_MM = 3.0

# DTF-Modul (Punkt 9): Filmrand ist fest auf 5 mm vorgegeben.
DTF_FILMRAND_MM = 5.0
DTF_DPI = 300
DTF_LPI_DEFAULT = 45.0
DTF_LPI_MIN = 10.0
DTF_LPI_MAX = 150.0
DTF_WINKEL_DEFAULT = 22.5
DTF_WINKEL_MIN = 0.0
DTF_WINKEL_MAX = 90.0
DTF_KNOCKOUT_DEFAULT = 240
DTF_KNOCKOUT_MIN = 0
DTF_KNOCKOUT_MAX = 255
