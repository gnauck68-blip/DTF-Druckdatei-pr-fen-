"""Auflösungsprüfung gegen 300 dpi im gewählten Endformat (Punkt 3).

Berechnung: dpi = Pixelanzahl je Achse / (Länge der Achse in Zoll).
1 Zoll = 25.4 mm. Als "tatsächliche dpi" wird der kleinere der beiden
Achsenwerte verwendet, da dieser Wert die im Druck sichtbare Auflösung
begrenzt (die schwächere Achse bestimmt die wahrnehmbare Schärfe).
"""
from __future__ import annotations

from dataclasses import dataclass

from .config import DPI_ERROR_THRESHOLD, DPI_WARN_THRESHOLD

MM_PER_INCH = 25.4


@dataclass(frozen=True)
class ResolutionCheck:
    dpi_x: float
    dpi_y: float
    dpi_effective: float
    ampel: str  # "gruen" | "gelb" | "rot"
    hinweis: str


def check_resolution(pixel_width: int, pixel_height: int, width_mm: float, height_mm: float) -> ResolutionCheck:
    if pixel_width <= 0 or pixel_height <= 0:
        raise ValueError("Bildmaße müssen größer als 0 Pixel sein.")
    if width_mm <= 0 or height_mm <= 0:
        raise ValueError("Zielformat muss größer als 0 mm sein.")

    dpi_x = pixel_width / (width_mm / MM_PER_INCH)
    dpi_y = pixel_height / (height_mm / MM_PER_INCH)
    dpi_effective = min(dpi_x, dpi_y)
    # Mit dem angezeigten, gerundeten Wert vergleichen: 2480 px auf A4 (299,95 dpi)
    # soll nicht als „300 dpi, empfohlen mindestens 300 dpi“ gelb werden.
    dpi_gerundet = round(dpi_effective)

    if dpi_gerundet < DPI_ERROR_THRESHOLD:
        ampel = "rot"
        hinweis = (
            f"Auflösung zu niedrig: {dpi_effective:.0f} dpi im Endformat. "
            f"Unter {DPI_ERROR_THRESHOLD} dpi ist der Druck deutlich unscharf."
        )
    elif dpi_gerundet < DPI_WARN_THRESHOLD:
        ampel = "gelb"
        hinweis = (
            f"Auflösung grenzwertig: {dpi_effective:.0f} dpi im Endformat. "
            f"Empfohlen sind mindestens {DPI_WARN_THRESHOLD} dpi."
        )
    else:
        ampel = "gruen"
        hinweis = f"Auflösung ausreichend: {dpi_effective:.0f} dpi im Endformat."

    return ResolutionCheck(dpi_x=dpi_x, dpi_y=dpi_y, dpi_effective=dpi_effective, ampel=ampel, hinweis=hinweis)
