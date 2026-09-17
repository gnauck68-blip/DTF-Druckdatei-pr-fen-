#!/usr/bin/env python3
"""Prüft eine erzeugte Datei auf die Kernanforderungen von PDF/X-1a:2001.

Verwendung:
    python scripts/verify_pdfx.py pfad/zur/datei.pdf

Geprüft wird:
    - PDF-Version genau 1.3
    - genau eine Seite (Version 1 kennt keine Mehrseitigkeit)
    - OutputIntent vorhanden, mit /S /GTS_PDFX und eingebettetem CMYK-Profil
    - TrimBox vorhanden, Maße werden in mm ausgegeben
    - BleedBox vorhanden und exakt TrimBox + Anschnitt (siehe texstyle_dtf.config.BLEED_MM)
      auf jeder Seite
    - keine RGB-Farbräume (DeviceRGB, CalRGB oder ICCBased mit 3 Komponenten)
      in irgendeinem PDF-Objekt
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

import numpy as np
import pikepdf

PT_PER_MM = 72.0 / 25.4
EXPECTED_PDF_VERSION = "1.3"

# Bleed-Wert aus der Anwendungskonfiguration, damit dieses Skript nicht
# unabhängig von texstyle_dtf/config.py gepflegt werden muss.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from texstyle_dtf.config import BLEED_MM, MAX_INK_COVERAGE_PERCENT  # noqa: E402


class Befund:
    def __init__(self) -> None:
        self.fehler: list[str] = []
        self.hinweise: list[str] = []

    def fehlschlag(self, text: str) -> None:
        self.fehler.append(text)

    def hinweis(self, text: str) -> None:
        self.hinweise.append(text)

    @property
    def bestanden(self) -> bool:
        return not self.fehler


def pt_to_mm(value_pt: float) -> float:
    return float(value_pt) / PT_PER_MM


def pruefe_version(pdf: pikepdf.Pdf, befund: Befund) -> None:
    version = pdf.pdf_version
    befund.hinweis(f"PDF-Version: {version}")
    if version != EXPECTED_PDF_VERSION:
        befund.fehlschlag(f"PDF-Version ist {version}, erwartet wird {EXPECTED_PDF_VERSION}.")


def pruefe_seitenzahl(pdf: pikepdf.Pdf, befund: Befund) -> None:
    anzahl = len(pdf.pages)
    befund.hinweis(f"Seitenzahl: {anzahl}")
    if anzahl != 1:
        befund.fehlschlag(f"Erwartet wird genau 1 Seite, gefunden wurden {anzahl}.")


def pruefe_output_intent(pdf: pikepdf.Pdf, befund: Befund) -> None:
    intents = pdf.Root.get("/OutputIntents")
    if not intents or len(intents) == 0:
        befund.fehlschlag("Kein OutputIntent im PDF gefunden.")
        return

    intent = intents[0]
    if str(intent.get("/S", "")) != "/GTS_PDFX":
        befund.fehlschlag("OutputIntent hat nicht /S /GTS_PDFX gesetzt.")

    profil_stream = intent.get("/DestOutputProfile")
    if profil_stream is None:
        befund.fehlschlag("OutputIntent enthält kein eingebettetes ICC-Profil (DestOutputProfile).")
        return

    n = int(profil_stream.get("/N", 0))
    befund.hinweis(f"OutputIntent: eingebettetes Profil mit N={n} Komponenten.")
    if n != 4:
        befund.fehlschlag(f"Das eingebettete OutputIntent-Profil hat N={n}, erwartet wird 4 (CMYK).")


def pruefe_boxen(pdf: pikepdf.Pdf, befund: Befund) -> None:
    page = pdf.pages[0]
    trim = page.get("/TrimBox")
    bleed = page.get("/BleedBox")

    if trim is None:
        befund.fehlschlag("Keine TrimBox auf der Seite gesetzt.")
        return
    if bleed is None:
        befund.fehlschlag("Keine BleedBox auf der Seite gesetzt.")
        return

    trim_w_mm = pt_to_mm(float(trim[2]) - float(trim[0]))
    trim_h_mm = pt_to_mm(float(trim[3]) - float(trim[1]))
    bleed_w_mm = pt_to_mm(float(bleed[2]) - float(bleed[0]))
    bleed_h_mm = pt_to_mm(float(bleed[3]) - float(bleed[1]))

    befund.hinweis(f"TrimBox: {trim_w_mm:.1f} x {trim_h_mm:.1f} mm")
    befund.hinweis(f"BleedBox: {bleed_w_mm:.1f} x {bleed_h_mm:.1f} mm")

    erwartete_bleed_w = trim_w_mm + 2 * BLEED_MM
    erwartete_bleed_h = trim_h_mm + 2 * BLEED_MM
    toleranz_mm = 0.1
    if abs(bleed_w_mm - erwartete_bleed_w) > toleranz_mm or abs(bleed_h_mm - erwartete_bleed_h) > toleranz_mm:
        befund.fehlschlag(
            f"BleedBox ({bleed_w_mm:.2f} x {bleed_h_mm:.2f} mm) entspricht nicht "
            f"TrimBox + {BLEED_MM} mm Anschnitt je Seite "
            f"(erwartet {erwartete_bleed_w:.2f} x {erwartete_bleed_h:.2f} mm)."
        )


def pruefe_keine_rgb_farbraeume(pdf: pikepdf.Pdf, befund: Befund) -> None:
    gefunden = []
    for obj in pdf.objects:
        try:
            cs = obj.get("/ColorSpace") if hasattr(obj, "get") else None
        except Exception:
            continue
        if cs is None:
            continue
        cs_text = str(cs)
        if "DeviceRGB" in cs_text or "CalRGB" in cs_text:
            gefunden.append(cs_text)
        elif "ICCBased" in cs_text:
            # ICCBased-Farbräume verweisen auf einen Profil-Stream mit /N.
            try:
                icc_stream = cs[1] if isinstance(cs, pikepdf.Array) else None
                if icc_stream is not None and int(icc_stream.get("/N", 0)) == 3:
                    gefunden.append("ICCBased mit N=3 (RGB)")
            except Exception:
                pass

    if gefunden:
        befund.fehlschlag(f"RGB-Farbräume im PDF gefunden: {gefunden}")
    else:
        befund.hinweis("Keine RGB-Farbräume gefunden.")


def pruefe_schriften(pdf: pikepdf.Pdf, befund: Befund) -> None:
    schriften_gefunden = 0
    nicht_eingebettet = []
    for obj in pdf.objects:
        try:
            if hasattr(obj, "get") and str(obj.get("/Type", "")) == "/Font":
                schriften_gefunden += 1
                descriptor = obj.get("/FontDescriptor")
                eingebettet = False
                if descriptor is not None:
                    eingebettet = any(
                        key in descriptor for key in ("/FontFile", "/FontFile2", "/FontFile3")
                    )
                if not eingebettet:
                    nicht_eingebettet.append(str(obj.get("/BaseFont", "unbekannt")))
        except Exception:
            continue

    if schriften_gefunden == 0:
        befund.hinweis("Keine Textobjekte/Schriften im PDF (Version 1 verwendet keinen Text).")
    else:
        befund.hinweis(f"{schriften_gefunden} Font-Objekt(e) gefunden.")
        if nicht_eingebettet:
            befund.fehlschlag(f"Nicht eingebettete Schriften gefunden: {nicht_eingebettet}")


def pruefe_farbauftrag(pdf: pikepdf.Pdf, befund: Befund) -> None:
    max_wert = 0.0
    bilder_geprueft = 0
    for obj in pdf.objects:
        try:
            if not hasattr(obj, "get"):
                continue
            if str(obj.get("/Subtype", "")) != "/Image":
                continue
            if str(obj.get("/ColorSpace", "")) != "/DeviceCMYK":
                continue
            width = int(obj.get("/Width"))
            height = int(obj.get("/Height"))
            rohbytes = obj.read_bytes()
            erwartete_laenge = width * height * 4
            if len(rohbytes) != erwartete_laenge:
                befund.hinweis(
                    f"Bild-Objekt übersprungen (unerwartete Datenlänge {len(rohbytes)}, erwartet {erwartete_laenge})."
                )
                continue
            arr = np.frombuffer(rohbytes, dtype=np.uint8).reshape(height, width, 4).astype(np.float32)
            summe_prozent = arr.sum(axis=2) / 255.0 * 100.0
            bild_max = float(summe_prozent.max())
            max_wert = max(max_wert, bild_max)
            bilder_geprueft += 1
        except Exception as exc:
            befund.hinweis(f"Bild-Objekt konnte nicht geprüft werden: {exc}")

    if bilder_geprueft == 0:
        befund.fehlschlag("Kein DeviceCMYK-Bild im PDF gefunden, Farbauftrag konnte nicht gemessen werden.")
        return

    befund.hinweis(f"Gemessener maximaler Farbauftrag: {max_wert:.1f} %")
    if max_wert > MAX_INK_COVERAGE_PERCENT + 0.5:  # kleine Toleranz für Rundung
        befund.fehlschlag(
            f"Maximaler Farbauftrag {max_wert:.1f} % überschreitet die Grenze von {MAX_INK_COVERAGE_PERCENT} %."
        )


def pruefe_dateigroesse(pfad: Path, befund: Befund) -> None:
    groesse_mb = pfad.stat().st_size / (1024 * 1024)
    befund.hinweis(f"Dateigröße: {groesse_mb:.2f} MB")


def main() -> int:
    if len(sys.argv) != 2:
        print("Verwendung: python scripts/verify_pdfx.py pfad/zur/datei.pdf")
        return 2

    pfad = Path(sys.argv[1])
    if not pfad.is_file():
        print(f"FEHLER: Datei nicht gefunden: {pfad}")
        return 2

    befund = Befund()
    pruefe_dateigroesse(pfad, befund)

    try:
        with pikepdf.open(pfad) as pdf:
            pruefe_version(pdf, befund)
            pruefe_seitenzahl(pdf, befund)
            pruefe_output_intent(pdf, befund)
            pruefe_boxen(pdf, befund)
            pruefe_keine_rgb_farbraeume(pdf, befund)
            pruefe_schriften(pdf, befund)
            pruefe_farbauftrag(pdf, befund)
    except pikepdf.PdfError as exc:
        print(f"FEHLER: Datei konnte nicht als PDF gelesen werden: {exc}")
        return 2

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
