"""Automatischer Löschlauf für das Arbeitsverzeichnis (Datenschutz-Vorgabe).

Dateien in UPLOAD_DIR und OUTPUT_DIR, die älter als RETENTION_HOURS sind,
werden stündlich gelöscht. Beim Start der Anwendung werden alle Dateien
gelöscht: Nach einem Neustart gehören sie zu keiner offenen Sitzung mehr, und
so bleiben Fotos nicht über ein Wochenende auf der Platte, nur weil der
Rechner aus war (DSGVO Art. 5 Abs. 1 lit. e, Speicherbegrenzung).
Versteckte Dateien wie .gitkeep bleiben liegen. Es wird bewusst nicht geloggt, welche Dateien gelöscht wurden
(keine Dateinamen in Logs).
"""
from __future__ import annotations

import asyncio
import logging
import time

from .config import CLEANUP_INTERVAL_SECONDS, OUTPUT_DIR, RETENTION_HOURS, UPLOAD_DIR

logger = logging.getLogger("texstyle_dtf")

RETENTION_SECONDS = RETENTION_HOURS * 60 * 60


def run_cleanup_once(alle: bool = False) -> int:
    """Löscht abgelaufene Dateien, mit alle=True sämtliche. Gibt die Anzahl gelöschter Dateien zurück."""
    now = time.time()
    deleted = 0
    for directory in (UPLOAD_DIR, OUTPUT_DIR):
        if not directory.exists():
            continue
        for entry in directory.iterdir():
            if not entry.is_file() or entry.name.startswith("."):
                continue
            try:
                age = now - entry.stat().st_mtime
                if alle or age > RETENTION_SECONDS:
                    entry.unlink(missing_ok=True)
                    deleted += 1
            except OSError:
                logger.error("Löschlauf: eine Datei konnte nicht geprüft oder gelöscht werden.")
    return deleted


async def cleanup_loop() -> None:
    """Hintergrund-Task: stündlicher Löschlauf, läuft bis die App stoppt."""
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
        try:
            run_cleanup_once()
        except Exception:
            logger.error("Löschlauf ist mit einem Fehler abgebrochen.")
