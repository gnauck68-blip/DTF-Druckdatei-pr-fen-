"""Preflight-Prüfung vor dem Download (Punkt 8).

Alle Prüfpunkte werden direkt aus der fertigen PDF-Datei ermittelt, nicht aus
zwischengespeicherten Werten aus dem Erzeugungsvorgang. Das macht die Prüfung
unabhängig und nachvollziehbar: Wer die Datei später erneut prüfen will, kann
das mit genau diesem Modul (bzw. scripts/verify_pdfx.py, das dieselben
Hilfsfunktionen verwendet) jederzeit wiederholen.

Die Auflösung wird aus dem eingebetteten Bild (Pixelmaße) und der TrimBox
(Endformat in mm) zurückgerechnet – das ist dieselbe Rechnung wie beim
Hochladen (siehe resolution.py), nur direkt an der fertigen Datei überprüft.

Ampel-Regel: Der Gesamtstatus ist die schlechteste Einzelampel (Rot schlägt
Gelb schlägt Grün). Bei Rot ist der Download gesperrt (siehe main.py).
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pikepdf

from .config import BLEED_MM, MAX_INK_COVERAGE_PERCENT
from .resolution import check_resolution

PT_PER_MM = 72.0 / 25.4
EXPECTED_PDF_VERSION = "1.3"
_AMPEL_RANG = {"gruen": 0, "gelb": 1, "rot": 2}


@dataclass(frozen=True)
class PreflightItem:
    schluessel: str
    label: str
    ampel: str  # "gruen" | "gelb" | "rot"
    hinweis: str


@dataclass(frozen=True)
class PreflightReport:
    items: tuple[PreflightItem, ...]

    @property
    def gesamt_ampel(self) -> str:
        if not self.items:
            return "rot"
        return max((i.ampel for i in self.items), key=lambda a: _AMPEL_RANG[a])

    @property
    def download_erlaubt(self) -> bool:
        return self.gesamt_ampel != "rot"


def _pt_to_mm(value: float) -> float:
    return float(value) / PT_PER_MM


def _cmyk_bilder(pdf: pikepdf.Pdf) -> list[pikepdf.Object]:
    bilder = []
    for obj in pdf.objects:
        try:
            if hasattr(obj, "get") and str(obj.get("/Subtype", "")) == "/Image":
                if str(obj.get("/ColorSpace", "")) == "/DeviceCMYK":
                    bilder.append(obj)
        except Exception:
            continue
    return bilder


def gefundene_rgb_farbraeume(pdf: pikepdf.Pdf) -> list[str]:
    """Sucht im gesamten PDF nach RGB-Farbräumen (DeviceRGB, CalRGB, ICCBased mit N=3)."""
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
            try:
                icc_stream = cs[1] if isinstance(cs, pikepdf.Array) else None
                if icc_stream is not None and int(icc_stream.get("/N", 0)) == 3:
                    gefunden.append("ICCBased mit N=3 (RGB)")
            except Exception:
                pass
    return gefunden


def gemessener_max_farbauftrag(pdf: pikepdf.Pdf) -> float | None:
    """Liest die eingebetteten CMYK-Bilddaten und gibt den höchsten Gesamtfarbauftrag
    in Prozent zurück, oder None, wenn kein CMYK-Bild gefunden wurde.

    Hinweis: Ghostscript bettet sehr kleine Bilder (in der Praxis unter ca.
    40x40 px) als Inline-Image direkt im Content-Stream statt als eigenes
    Image-XObject ein. Solche Inline-Images werden hier nicht ausgewertet.
    Da echte Druckvorlagen immer deutlich mehr Pixel haben (siehe
    Auflösungsprüfung, mindestens einige Hundert Pixel je Kante), tritt das
    im normalen Betrieb nicht auf; findet sich kein Bild, meldet die
    Preflight-Prüfung sicherheitshalber Rot statt eines stillen Fallbacks.
    """
    max_wert: float | None = None
    for bild in _cmyk_bilder(pdf):
        try:
            width = int(bild.get("/Width"))
            height = int(bild.get("/Height"))
            rohbytes = bild.read_bytes()
            if len(rohbytes) != width * height * 4:
                continue
            arr = np.frombuffer(rohbytes, dtype=np.uint8).reshape(height, width, 4).astype(np.float32)
            wert = float((arr.sum(axis=2) / 255.0 * 100.0).max())
            max_wert = wert if max_wert is None else max(max_wert, wert)
        except Exception:
            continue
    return max_wert


def nicht_eingebettete_schriften(pdf: pikepdf.Pdf) -> tuple[int, list[str]]:
    """Gibt (Anzahl Font-Objekte, Liste nicht eingebetteter Schriftnamen) zurück."""
    anzahl = 0
    fehlend = []
    for obj in pdf.objects:
        try:
            if hasattr(obj, "get") and str(obj.get("/Type", "")) == "/Font":
                anzahl += 1
                descriptor = obj.get("/FontDescriptor")
                eingebettet = descriptor is not None and any(
                    key in descriptor for key in ("/FontFile", "/FontFile2", "/FontFile3")
                )
                if not eingebettet:
                    fehlend.append(str(obj.get("/BaseFont", "unbekannt")))
        except Exception:
            continue
    return anzahl, fehlend


def _pruefe_aufloesung(pdf: pikepdf.Pdf) -> PreflightItem:
    try:
        page = pdf.pages[0]
        trim = page.get("/TrimBox")
        bilder = _cmyk_bilder(pdf)
        if trim is None or not bilder:
            return PreflightItem("aufloesung", "Auflösung", "rot", "Auflösung konnte nicht ermittelt werden.")
        trim_w_mm = _pt_to_mm(float(trim[2]) - float(trim[0]))
        trim_h_mm = _pt_to_mm(float(trim[3]) - float(trim[1]))
        bild = bilder[0]
        breite_px = int(bild.get("/Width"))
        hoehe_px = int(bild.get("/Height"))
        ergebnis = check_resolution(breite_px, hoehe_px, trim_w_mm, trim_h_mm)
        return PreflightItem("aufloesung", "Auflösung", ergebnis.ampel, ergebnis.hinweis)
    except Exception:
        return PreflightItem("aufloesung", "Auflösung", "rot", "Auflösung konnte nicht ermittelt werden.")


def _pruefe_farbraum(pdf: pikepdf.Pdf) -> PreflightItem:
    gefunden = gefundene_rgb_farbraeume(pdf)
    if gefunden:
        return PreflightItem(
            "farbraum", "Farbraum", "rot", "Im PDF wurden RGB-Farbräume gefunden. Nur CMYK/Graustufen sind erlaubt."
        )
    return PreflightItem("farbraum", "Farbraum", "gruen", "Nur CMYK/Graustufen im PDF, wie gefordert.")


def _pruefe_icc_profil(pdf: pikepdf.Pdf) -> PreflightItem:
    intents = pdf.Root.get("/OutputIntents")
    if not intents or len(intents) == 0:
        return PreflightItem("icc_profil", "ICC-Profil vorhanden", "rot", "Kein ICC-Profil im PDF eingebettet.")
    profil = intents[0].get("/DestOutputProfile")
    if profil is None:
        return PreflightItem("icc_profil", "ICC-Profil vorhanden", "rot", "Kein ICC-Profil im PDF eingebettet.")
    n = int(profil.get("/N", 0))
    if n != 4:
        return PreflightItem(
            "icc_profil", "ICC-Profil vorhanden", "rot", f"Eingebettetes Profil hat {n} statt 4 Farbkanälen (CMYK)."
        )
    return PreflightItem("icc_profil", "ICC-Profil vorhanden", "gruen", "CMYK-ICC-Profil ist eingebettet.")


def _pruefe_farbauftrag(pdf: pikepdf.Pdf) -> PreflightItem:
    wert = gemessener_max_farbauftrag(pdf)
    if wert is None:
        return PreflightItem("farbauftrag", "Farbauftrag", "rot", "Farbauftrag konnte nicht gemessen werden.")
    if wert > MAX_INK_COVERAGE_PERCENT + 0.5:
        return PreflightItem(
            "farbauftrag", "Farbauftrag", "rot", f"Farbauftrag {wert:.0f}% liegt über der Grenze von {MAX_INK_COVERAGE_PERCENT:.0f}%."
        )
    if wert > MAX_INK_COVERAGE_PERCENT - 50:
        return PreflightItem(
            "farbauftrag", "Farbauftrag", "gelb", f"Farbauftrag {wert:.0f}% ist nah an der Grenze von {MAX_INK_COVERAGE_PERCENT:.0f}%."
        )
    return PreflightItem("farbauftrag", "Farbauftrag", "gruen", f"Farbauftrag {wert:.0f}% ist unbedenklich.")


def _pruefe_trimbox(pdf: pikepdf.Pdf) -> PreflightItem:
    trim = pdf.pages[0].get("/TrimBox")
    if trim is None:
        return PreflightItem("trimbox", "TrimBox", "rot", "Keine TrimBox (Endformat) im PDF gesetzt.")
    breite_mm = _pt_to_mm(float(trim[2]) - float(trim[0]))
    hoehe_mm = _pt_to_mm(float(trim[3]) - float(trim[1]))
    if breite_mm <= 0 or hoehe_mm <= 0:
        return PreflightItem("trimbox", "TrimBox", "rot", "TrimBox hat ungültige Maße.")
    return PreflightItem("trimbox", "TrimBox", "gruen", f"Endformat: {breite_mm:.0f} x {hoehe_mm:.0f} mm.")


def _pruefe_bleedbox(pdf: pikepdf.Pdf) -> PreflightItem:
    page = pdf.pages[0]
    trim = page.get("/TrimBox")
    bleed = page.get("/BleedBox")
    if trim is None or bleed is None:
        return PreflightItem("bleedbox", "BleedBox", "rot", "Keine BleedBox (Anschnitt) im PDF gesetzt.")

    trim_w_mm = _pt_to_mm(float(trim[2]) - float(trim[0]))
    trim_h_mm = _pt_to_mm(float(trim[3]) - float(trim[1]))
    bleed_w_mm = _pt_to_mm(float(bleed[2]) - float(bleed[0]))
    bleed_h_mm = _pt_to_mm(float(bleed[3]) - float(bleed[1]))

    erwartet_w = trim_w_mm + 2 * BLEED_MM
    erwartet_h = trim_h_mm + 2 * BLEED_MM
    toleranz = 0.2
    if abs(bleed_w_mm - erwartet_w) > toleranz or abs(bleed_h_mm - erwartet_h) > toleranz:
        return PreflightItem(
            "bleedbox", "BleedBox", "rot",
            f"BleedBox ({bleed_w_mm:.1f} x {bleed_h_mm:.1f} mm) passt nicht zu Endformat + {BLEED_MM:.0f} mm Anschnitt."
        )
    return PreflightItem("bleedbox", "BleedBox", "gruen", f"Anschnitt {BLEED_MM:.0f} mm rundum korrekt gesetzt.")


def _pruefe_pdf_version(pdf: pikepdf.Pdf) -> PreflightItem:
    version = pdf.pdf_version
    if version != EXPECTED_PDF_VERSION:
        return PreflightItem("pdf_version", "PDF-Version", "rot", f"PDF-Version ist {version}, gefordert ist {EXPECTED_PDF_VERSION}.")
    return PreflightItem("pdf_version", "PDF-Version", "gruen", f"PDF-Version {version} ist korrekt.")


def _pruefe_output_intent(pdf: pikepdf.Pdf) -> PreflightItem:
    intents = pdf.Root.get("/OutputIntents")
    if not intents or len(intents) == 0 or str(intents[0].get("/S", "")) != "/GTS_PDFX":
        return PreflightItem("output_intent", "OutputIntent", "rot", "Kein gültiges OutputIntent im PDF gefunden.")
    return PreflightItem("output_intent", "OutputIntent", "gruen", "OutputIntent ist eingebettet.")


def _pruefe_dateigroesse(pfad: Path) -> PreflightItem:
    if not pfad.is_file() or pfad.stat().st_size == 0:
        return PreflightItem("dateigroesse", "Dateigröße", "rot", "Die Datei ist leer oder fehlt.")
    groesse_mb = pfad.stat().st_size / (1024 * 1024)
    return PreflightItem("dateigroesse", "Dateigröße", "gruen", f"{groesse_mb:.1f} MB.")


def run_preflight(pdf_path: Path) -> PreflightReport:
    """Führt alle Preflight-Prüfungen aus Punkt 8 auf der fertigen PDF-Datei aus."""
    items = [_pruefe_dateigroesse(pdf_path)]
    with pikepdf.open(pdf_path) as pdf:
        items.append(_pruefe_aufloesung(pdf))
        items.append(_pruefe_farbraum(pdf))
        items.append(_pruefe_icc_profil(pdf))
        items.append(_pruefe_farbauftrag(pdf))
        items.append(_pruefe_trimbox(pdf))
        items.append(_pruefe_bleedbox(pdf))
        items.append(_pruefe_pdf_version(pdf))
        items.append(_pruefe_output_intent(pdf))
    return PreflightReport(items=tuple(items))
