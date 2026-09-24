"""RIP-Datei: druckfertiges PNG für den RIP des DTF-Druckers.

Der RIP legt die endgültigen Druckdaten mit seinem hinterlegten ICC-Profil an:
Er rechnet die Farben um, rastert und erzeugt die Weißunterlage. Die App darf
deshalb keine dieser Aufgaben vorwegnehmen, sonst würde doppelt umgerechnet
bzw. doppelt gerastert. Die RIP-Datei ist darum:

    - PNG in RGB, mit eingebettetem sRGB-Profil, damit der RIP weiß, wie die
      Farben gemeint sind (Bilder mit anderem Profil werden beim Hochladen
      nach sRGB umgerechnet, siehe uploads.py),
    - mit Transparenz (Alphakanal), wo das Bild durchsichtig ist,
    - exakt in Druckgröße bei 300 dpi (pHYs-Angabe im PNG),
    - ohne CMYK-Umrechnung, ohne Raster, ohne Weißplatte, ohne Schnittmarken.

Größe: Das Motiv wird in das gewählte Format gesetzt, ohne Verzerrung.
    einpassen: Das ganze Motiv passt ins Format; die Datei ist so groß wie das
               Motiv (kein leerer Rand, der Film kosten würde).
    fuellen:   Das Motiv füllt das Format ganz; Überstand wird mittig
               abgeschnitten. Die Datei ist genau so groß wie das Format.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageCms

from .formats import PageFormat
from .preflight import PreflightItem, PreflightReport
from .resolution import check_resolution

DPI = 300
MM_PER_INCH = 25.4
ANPASSUNG_EINPASSEN = "einpassen"
ANPASSUNG_FUELLEN = "fuellen"
ANPASSUNGEN = (ANPASSUNG_EINPASSEN, ANPASSUNG_FUELLEN)

# Obergrenze für die erzeugte Datei, z. B. 58 x 180 cm bei 300 dpi (rund 145 MP).
MAX_AUSGABE_PIXEL = 150_000_000

# Anteil halbtransparenter Pixel, ab dem ohne Härten ein Hinweis kommt
HALBTRANSPARENZ_HINWEIS = 0.005

SRGB_PROFIL = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()


class RipFehler(ValueError):
    """Fachlicher Fehler, wird als Klartext angezeigt."""


@dataclass(frozen=True)
class Druckgroesse:
    breite_mm: float
    hoehe_mm: float
    breite_px: int
    hoehe_px: int
    # Größe, in der das ganze Motiv (vor dem Abschneiden beim Füllen) gedruckt wird
    motiv_breite_mm: float
    motiv_hoehe_mm: float


def druckgroesse(breite_px: int, hoehe_px: int, page_format: PageFormat, anpassung: str) -> Druckgroesse:
    """Berechnet die Druckgröße des Motivs im Format, ohne Verzerrung."""
    if anpassung == ANPASSUNG_EINPASSEN:
        skala = min(page_format.width_mm / breite_px, page_format.height_mm / hoehe_px)
    elif anpassung == ANPASSUNG_FUELLEN:
        skala = max(page_format.width_mm / breite_px, page_format.height_mm / hoehe_px)
    else:
        raise RipFehler("Unbekannte Einstellung: Bild einpassen oder Fläche füllen wählen.")
    motiv_w, motiv_h = breite_px * skala, hoehe_px * skala
    if anpassung == ANPASSUNG_FUELLEN:
        druck_w, druck_h = page_format.width_mm, page_format.height_mm
    else:
        druck_w, druck_h = motiv_w, motiv_h
    return Druckgroesse(
        breite_mm=druck_w,
        hoehe_mm=druck_h,
        breite_px=max(1, round(druck_w / MM_PER_INCH * DPI)),
        hoehe_px=max(1, round(druck_h / MM_PER_INCH * DPI)),
        motiv_breite_mm=motiv_w,
        motiv_hoehe_mm=motiv_h,
    )


def _skalieren(bild: Image.Image, breite: int, hoehe: int) -> Image.Image:
    """Lanczos-Skalierung; mit Transparenz über vormultiplizierte Farben, damit an
    durchsichtigen Kanten keine dunklen oder hellen Säume entstehen."""
    if bild.mode == "RGBA":
        return bild.convert("RGBa").resize((breite, hoehe), Image.LANCZOS).convert("RGBA")
    return bild.resize((breite, hoehe), Image.LANCZOS)


def _haerten(bild: Image.Image) -> Image.Image:
    """Alpha unter 128 wird 0, ab 128 wird 255: klare Kanten für die Weißunterlage im RIP."""
    arr = np.asarray(bild).copy()
    arr[..., 3] = np.where(arr[..., 3] >= 128, 255, 0).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def _halbtransparenz(bild: Image.Image) -> tuple[bool, float]:
    """(hat durchsichtige Stellen, Anteil halbtransparenter Pixel)."""
    if bild.mode != "RGBA":
        return False, 0.0
    alpha = np.asarray(bild.getchannel("A"))
    durchsichtig = bool((alpha < 255).any())
    halb = float(((alpha > 0) & (alpha < 255)).mean())
    return durchsichtig, halb


@dataclass(frozen=True)
class RipErgebnis:
    pfad: Path
    groesse: Druckgroesse
    dpi_effektiv: float
    bericht: PreflightReport


def erzeuge_rip_datei(
    bild: Image.Image,
    page_format: PageFormat,
    ausgabe: Path,
    anpassung: str = ANPASSUNG_EINPASSEN,
    kanten_haerten: bool = True,
) -> RipErgebnis:
    """Skaliert das Motiv auf Druckgröße bei 300 dpi und speichert es als PNG für den RIP."""
    if bild.mode not in ("RGB", "RGBA"):
        bild = bild.convert("RGBA" if "A" in bild.getbands() else "RGB")

    groesse = druckgroesse(bild.width, bild.height, page_format, anpassung)
    if groesse.breite_px * groesse.hoehe_px > MAX_AUSGABE_PIXEL:
        raise RipFehler(
            f"Diese Größe ergibt mehr als {MAX_AUSGABE_PIXEL // 1_000_000} Millionen Pixel. "
            "Bitte eine kleinere Größe wählen."
        )

    if anpassung == ANPASSUNG_FUELLEN:
        motiv_w = max(groesse.breite_px, round(groesse.motiv_breite_mm / MM_PER_INCH * DPI))
        motiv_h = max(groesse.hoehe_px, round(groesse.motiv_hoehe_mm / MM_PER_INCH * DPI))
        gross = _skalieren(bild, motiv_w, motiv_h)
        links = (motiv_w - groesse.breite_px) // 2
        oben = (motiv_h - groesse.hoehe_px) // 2
        druck = gross.crop((links, oben, links + groesse.breite_px, oben + groesse.hoehe_px))
    else:
        druck = _skalieren(bild, groesse.breite_px, groesse.hoehe_px)

    durchsichtig, halb_vorher = _halbtransparenz(druck)
    gehaertet = kanten_haerten and durchsichtig and halb_vorher > 0
    if gehaertet:
        druck = _haerten(druck)

    druck.save(ausgabe, format="PNG", dpi=(DPI, DPI), icc_profile=SRGB_PROFIL)

    # Auflösung des Originals in Druckgröße (das Hochrechnen auf 300 dpi fügt keine Details hinzu)
    aufloesung = check_resolution(bild.width, bild.height, groesse.motiv_breite_mm, groesse.motiv_hoehe_mm)
    bericht = _pruefen(ausgabe, groesse, aufloesung.ampel, aufloesung.hinweis, durchsichtig, halb_vorher, gehaertet)
    return RipErgebnis(pfad=ausgabe, groesse=groesse, dpi_effektiv=aufloesung.dpi_effective, bericht=bericht)


def _cm(mm: float) -> str:
    return f"{mm / 10:.1f}".replace(".", ",")


def _pruefen(
    pfad: Path,
    groesse: Druckgroesse,
    aufloesung_ampel: str,
    aufloesung_hinweis: str,
    durchsichtig: bool,
    halbtransparenz: float,
    gehaertet: bool,
) -> PreflightReport:
    """Prüfbericht; Datei-Eigenschaften werden an der gespeicherten Datei nachgelesen."""
    punkte = [PreflightItem("aufloesung", "Auflösung", aufloesung_ampel, aufloesung_hinweis)]

    punkte.append(PreflightItem(
        "groesse", "Druckgröße", "gruen",
        f"{_cm(groesse.breite_mm)} x {_cm(groesse.hoehe_mm)} cm ({groesse.breite_px} x {groesse.hoehe_px} Pixel bei {DPI} dpi).",
    ))

    if durchsichtig:
        punkte.append(PreflightItem("hintergrund", "Hintergrund", "gruen", "Das Bild hat durchsichtige Stellen; dort wird nichts gedruckt."))
    else:
        punkte.append(PreflightItem(
            "hintergrund", "Hintergrund", "gelb",
            "Kein durchsichtiger Hintergrund: Das ganze Rechteck wird gedruckt, auch ein weißer Hintergrund.",
        ))

    prozent = f"{halbtransparenz * 100:.2f}".replace(".", ",")
    if gehaertet:
        punkte.append(PreflightItem("halbtransparenz", "Kanten", "gruen", f"Halbtransparente Pixel ({prozent} %) wurden hart gemacht."))
    elif halbtransparenz >= HALBTRANSPARENZ_HINWEIS:
        punkte.append(PreflightItem(
            "halbtransparenz", "Kanten", "gelb",
            f"{prozent} % halbtransparente Pixel. Im DTF-Druck können daraus fleckige Kanten werden.",
        ))
    else:
        punkte.append(PreflightItem("halbtransparenz", "Kanten", "gruen", "Keine nennenswerte Halbtransparenz."))

    with Image.open(pfad) as datei:
        hat_srgb = datei.info.get("icc_profile") == SRGB_PROFIL
        dpi = datei.info.get("dpi", (0, 0))
        modus = datei.mode
    if hat_srgb and modus in ("RGB", "RGBA"):
        punkte.append(PreflightItem(
            "farbraum", "Farben", "gruen",
            "RGB mit sRGB-Profil. Die Umrechnung in Druckfarben macht der RIP mit seinem Druckerprofil.",
        ))
    else:
        punkte.append(PreflightItem("farbraum", "Farben", "rot", "Die Datei hat kein sRGB-Profil oder ist nicht RGB."))

    if round(dpi[0]) == DPI and round(dpi[1]) == DPI:
        groesse_b = pfad.stat().st_size
        menge = f"{groesse_b / 1024:.0f} KB" if groesse_b < 1024 * 1024 else f"{groesse_b / (1024 * 1024):.1f} MB".replace(".", ",")
        punkte.append(PreflightItem("datei", "Datei", "gruen", f"PNG mit {DPI} dpi, {menge}."))
    else:
        punkte.append(PreflightItem("datei", "Datei", "rot", f"Die Auflösungsangabe im PNG fehlt oder stimmt nicht ({dpi})."))

    return PreflightReport(items=tuple(punkte))
