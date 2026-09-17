"""Papierformate für den Druckauftrag (Punkt 2 der Anforderungen)."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PageFormat:
    code: str
    label: str
    width_mm: float
    height_mm: float


# Standardformate, Hochformat (Breite x Höhe), nach DIN 476.
STANDARD_FORMATS: dict[str, PageFormat] = {
    "A6": PageFormat("A6", "A6 (105 x 148 mm)", 105.0, 148.0),
    "A5": PageFormat("A5", "A5 (148 x 210 mm)", 148.0, 210.0),
    "A4": PageFormat("A4", "A4 (210 x 297 mm)", 210.0, 297.0),
    "A3": PageFormat("A3", "A3 (297 x 420 mm)", 297.0, 420.0),
}

CUSTOM_FORMAT_CODE = "CUSTOM"

# Grenzen für das freie Format, damit keine unsinnigen Werte durchgehen.
MIN_CUSTOM_MM = 10.0
MAX_CUSTOM_MM = 3000.0


class InvalidFormatError(ValueError):
    """Wird ausgelöst, wenn Formatangaben ungültig sind."""


def resolve_format(code: str, width_mm: float | None = None, height_mm: float | None = None) -> PageFormat:
    """Liefert das gewählte Seitenformat.

    Bei code == "CUSTOM" müssen width_mm und height_mm gesetzt sein und
    innerhalb sinnvoller Grenzen liegen.
    """
    code = (code or "").strip().upper()

    if code == CUSTOM_FORMAT_CODE:
        if width_mm is None or height_mm is None:
            raise InvalidFormatError("Für ein freies Format müssen Breite und Höhe in mm angegeben werden.")
        if not (MIN_CUSTOM_MM <= width_mm <= MAX_CUSTOM_MM) or not (MIN_CUSTOM_MM <= height_mm <= MAX_CUSTOM_MM):
            raise InvalidFormatError(
                f"Breite und Höhe müssen zwischen {MIN_CUSTOM_MM:.0f} und {MAX_CUSTOM_MM:.0f} mm liegen."
            )
        return PageFormat(CUSTOM_FORMAT_CODE, f"Frei ({width_mm:.0f} x {height_mm:.0f} mm)", width_mm, height_mm)

    if code not in STANDARD_FORMATS:
        raise InvalidFormatError(f"Unbekanntes Format: {code!r}")

    return STANDARD_FORMATS[code]
