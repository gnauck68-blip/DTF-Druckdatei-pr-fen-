"""CMYK-Konvertierung und Farbauftragsbegrenzung (Punkt 4 und 5).

Farbkonvertierung:
    Quellprofil: sRGB (Pillow-eigenes Referenzprofil, ImageCms.createProfile).
    Zielprofil: aus der Umgebungsvariable TEXSTYLE_ICC_CMYK (Datei muss existieren).
    Rendering Intent: relative colorimetric, mit Tiefenkompensation (Black Point
    Compensation), wie in der Anforderung verlangt.
    Fehlt das Zielprofil, wird ICCProfileMissingError ausgelöst. Es gibt
    bewusst keinen stillen Fallback auf ein Ersatzprofil.

Farbauftragsbegrenzung (Total Area Coverage, TAC):
    Methode: Für jedes Pixel wird die Summe der vier CMYK-Kanäle (in Prozent,
    0-400 möglich) gebildet. Überschreitet die Summe MAX_INK_COVERAGE_PERCENT,
    werden alle vier Kanalwerte dieses Pixels gleichmäßig (proportional)
    herunterskaliert, bis die Summe genau der Grenze entspricht. Diese
    gleichmäßige Skalierung verändert den Farbton (Hue) nicht, sondern nur
    die Dichte – ein einfaches und nachvollziehbares Verfahren, wie es auch
    von einfachen Druckvorstufen-Werkzeugen verwendet wird. Eine differenzierte
    Unterfarbentfernung (GCR/UCR), bei der bevorzugt Cyan/Magenta/Gelb
    reduziert und Schwarz erhalten bleibt, wäre farblich exakter, ist aber
    deutlich komplexer und für Version 1 nicht gefordert.

    Messung: measure_max_ink_coverage() bildet für jedes Pixel dieselbe Summe
    und gibt den Maximalwert über das ganze Bild in Prozent zurück. Dieser
    Messwert wird nach der Begrenzung erneut berechnet und im Preflight
    sowie in Tests ausgegeben, um nachzuweisen, dass die Grenze eingehalten
    wird.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageCms

from .config import MAX_INK_COVERAGE_PERCENT, get_icc_cmyk_env

_SRGB_PROFILE = ImageCms.createProfile("sRGB")


class ICCProfileMissingError(RuntimeError):
    """Wird ausgelöst, wenn kein gültiges CMYK-Zielprofil konfiguriert ist."""


@dataclass(frozen=True)
class TargetProfileInfo:
    path: str
    description: str


def get_target_profile_info() -> TargetProfileInfo:
    """Liefert Pfad und Beschreibung des konfigurierten CMYK-Zielprofils.

    Löst ICCProfileMissingError aus, wenn TEXSTYLE_ICC_CMYK nicht gesetzt ist
    oder auf keine lesbare Datei zeigt. Kein stiller Fallback.
    """
    icc_path = get_icc_cmyk_env()
    if not icc_path:
        raise ICCProfileMissingError(
            "Es ist kein CMYK-Zielprofil eingerichtet. Bitte die Umgebungsvariable "
            "TEXSTYLE_ICC_CMYK auf ein gültiges ICC-CMYK-Profil setzen."
        )
    if not os.path.isfile(icc_path):
        raise ICCProfileMissingError(
            f"Das eingerichtete CMYK-Zielprofil wurde nicht gefunden: {icc_path}"
        )
    try:
        profile = ImageCms.getOpenProfile(icc_path)
    except OSError as exc:
        raise ICCProfileMissingError(
            f"Das eingerichtete CMYK-Zielprofil konnte nicht gelesen werden: {icc_path}"
        ) from exc

    if profile.profile.xcolor_space != "CMYK":
        raise ICCProfileMissingError(
            "Das eingerichtete Profil ist kein CMYK-Profil (Farbraum: "
            f"{profile.profile.xcolor_space})."
        )

    description = ImageCms.getProfileDescription(profile).strip()
    return TargetProfileInfo(path=icc_path, description=description)


def convert_to_cmyk(image: Image.Image) -> Image.Image:
    """Konvertiert ein RGB-/RGBA-/Graustufenbild nach CMYK über ICC-Profile.

    sRGB als Quellprofil, das konfigurierte Profil als Ziel, relative
    colorimetric mit Tiefenkompensation (siehe Modul-Docstring).
    """
    target = get_target_profile_info()

    if image.mode == "RGBA":
        # Transparente Bereiche werden für den Druck auf Weiß gelegt, da PDF/X-1a
        # keine Transparenz erlaubt (Punkt 7) und es keinen Alphakanal im
        # Druck-PDF geben darf. Für die DTF-Weißplatte (Schritt 4) wird der
        # Alphakanal separat und vor dieser Konvertierung ausgewertet.
        hintergrund = Image.new("RGB", image.size, (255, 255, 255))
        hintergrund.paste(image, mask=image.split()[3])
        rgb_image = hintergrund
    elif image.mode != "RGB":
        rgb_image = image.convert("RGB")
    else:
        rgb_image = image

    target_profile = ImageCms.getOpenProfile(target.path)
    transform = ImageCms.buildTransform(
        _SRGB_PROFILE,
        target_profile,
        "RGB",
        "CMYK",
        renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
        flags=ImageCms.Flags.BLACKPOINTCOMPENSATION,
    )
    cmyk_image = ImageCms.applyTransform(rgb_image, transform)
    if cmyk_image is None:
        raise RuntimeError("Die CMYK-Umwandlung ist fehlgeschlagen.")
    return cmyk_image


def _channel_sum_percent(cmyk_image: Image.Image) -> np.ndarray:
    if cmyk_image.mode != "CMYK":
        raise ValueError("Farbauftrag kann nur für CMYK-Bilder berechnet werden.")
    arr = np.asarray(cmyk_image, dtype=np.float32)  # H, W, 4 – Werte 0..255
    total_0_255 = arr.sum(axis=2)  # 0..1020
    return total_0_255 / 255.0 * 100.0  # 0..400 Prozent


def limit_ink_coverage(cmyk_image: Image.Image, max_percent: float = MAX_INK_COVERAGE_PERCENT) -> Image.Image:
    """Begrenzt den Gesamtfarbauftrag je Pixel auf max_percent (siehe Modul-Docstring)."""
    arr = np.asarray(cmyk_image, dtype=np.float32)
    total_percent = arr.sum(axis=2) / 255.0 * 100.0

    scale = np.ones_like(total_percent, dtype=np.float32)
    over = total_percent > max_percent
    # Division nur dort, wo tatsächlich über der Grenze (vermeidet Division durch 0
    # ist ohnehin ausgeschlossen, da total_percent > max_percent > 0 in diesen Zellen).
    scale[over] = max_percent / total_percent[over]

    limited = arr * scale[..., np.newaxis]
    limited = np.clip(np.round(limited), 0, 255).astype(np.uint8)
    return Image.fromarray(limited, mode="CMYK")


def measure_max_ink_coverage(cmyk_image: Image.Image) -> float:
    """Gibt den höchsten Gesamtfarbauftrag im Bild in Prozent zurück."""
    return float(_channel_sum_percent(cmyk_image).max())
