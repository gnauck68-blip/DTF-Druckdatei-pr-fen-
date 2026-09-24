#!/usr/bin/env python3
"""Prüft eine erzeugte Datei auf die Kernanforderungen von PDF/X-1a:2001.

Verwendung:
    python scripts/verify_pdfx.py pfad/zur/datei.pdf

Dieses Skript verwendet dieselben Prüf-Bausteine wie die Preflight-Prüfung
der Anwendung (texstyle_dtf/preflight.py), damit es keine zweite, eventuell
abweichende Implementierung derselben Regeln gibt.

Geprüft wird:
    - PDF-Version genau 1.3
    - genau eine Seite (Version 1 kennt keine Mehrseitigkeit)
    - OutputIntent vorhanden, mit /S /GTS_PDFX und eingebettetem CMYK-Profil
    - TrimBox und BleedBox vorhanden, Maße werden in mm ausgegeben,
      BleedBox muss TrimBox + Anschnitt (siehe texstyle_dtf.config.BLEED_MM) entsprechen
    - keine RGB-Farbräume (DeviceRGB, CalRGB oder ICCBased mit 3 Komponenten)
    - eingebettete Schriften, falls das PDF Textobjekte/Font-Ressourcen enthält
    - maximaler Farbauftrag der eingebetteten Bild-Objekte (DeviceCMYK), direkt
      aus den tatsächlich im PDF gespeicherten Bilddaten gemessen (siehe
      Hinweis unten) – Grenze 300 %
    - Dateigröße (nur informativ)

Hinweis zur Farbauftragsmessung:
    Es wird nicht über Ghostscript neu gerastert, sondern die im PDF bereits
    eingebetteten Bild-XObjects (DeviceCMYK) werden direkt ausgelesen. Das
    sind exakt die Rasterdaten, die beim Druck verwendet werden – eine erneute
    Rasterung über einen Interpreter würde durch dessen eigenes Farbmanagement
    zusätzliche, unnötige Abweichungen einführen.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pikepdf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from texstyle_dtf import preflight  # noqa: E402


class Befund:
    def __init__(self) -> None:
        self.fehler: list[str] = []
        self.hinweise: list[str] = []

    def fehlschlag(self, text: str) -> None:
        self.fehler.append(text)

    def hinweis(self, text: str) -> None:
        self.hinweise.append(text)


def _uebernehme_item(item: preflight.PreflightItem, befund: Befund) -> None:
    befund.hinweis(f"{item.label}: {item.hinweis}")
    if item.ampel == "rot":
        befund.fehlschlag(f"{item.label}: {item.hinweis}")


def main() -> int:
    if len(sys.argv) != 2:
        print("Verwendung: python scripts/verify_pdfx.py pfad/zur/datei.pdf")
        return 2

    pfad = Path(sys.argv[1])
    if not pfad.is_file():
        print(f"FEHLER: Datei nicht gefunden: {pfad}")
        return 2

    befund = Befund()

    try:
        bericht = preflight.run_preflight(pfad)
    except pikepdf.PdfError as exc:
        print(f"FEHLER: Datei konnte nicht als PDF gelesen werden: {exc}")
        return 2

    for item in bericht.items:
        _uebernehme_item(item, befund)

    # Zusätzlich: Seitenzahl und Schriften-Einbettung, nicht Teil der
    # Preflight-Ampel, aber Teil der PDF/X-1a-Anforderungen.
    with pikepdf.open(pfad) as pdf:
        anzahl_seiten = len(pdf.pages)
        befund.hinweis(f"Seitenzahl: {anzahl_seiten}")
        if anzahl_seiten != 1:
            befund.fehlschlag(f"Erwartet wird genau 1 Seite, gefunden wurden {anzahl_seiten}.")

        anzahl_schriften, nicht_eingebettet = preflight.nicht_eingebettete_schriften(pdf)
        if anzahl_schriften == 0:
            befund.hinweis("Keine Textobjekte/Schriften im PDF (Version 1 verwendet keinen Text).")
        else:
            befund.hinweis(f"{anzahl_schriften} Font-Objekt(e) gefunden.")
            if nicht_eingebettet:
                befund.fehlschlag(f"Nicht eingebettete Schriften gefunden: {nicht_eingebettet}")

    print("--- Prüfergebnisse ---")
    for zeile in befund.hinweise:
        print(f"  {zeile}")

    if befund.fehler:
        print("--- Fehler ---")
        for zeile in befund.fehler:
            print(f"  {zeile}")
        print("FAIL")
        return 1

    print("PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
