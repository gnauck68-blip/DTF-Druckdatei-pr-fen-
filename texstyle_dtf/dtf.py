"""DTF-Modul: Halbton-Rasterung, Weißplatte, Filmrand, Export (Punkt 9).

Aufbau:
    1. Farbfilm: Das Bild wird wie beim Druck-PDF über ICC nach CMYK
       konvertiert und auf 300% Farbauftrag begrenzt (siehe color.py) – so
       bleiben Farbwiedergabe und Tintenmenge zwischen Druck-PDF und
       DTF-Film konsistent. Danach wird eine klassische amplitudenmodulierte
       Halbton-Rasterung (runde Punkte) je Kanal gerechnet, mit
       einstellbarer Rasterweite (Linien pro Zoll) und einstellbarem Winkel.
    2. Weißplatte: eine Graustufen-Maske aus dem Alphakanal (transparente
       Bereiche werden nie mit Weiß unterlegt) und der Helligkeit des
       Originalbilds. Pixel, die heller als die Knockout-Schwelle sind
       (z. B. nahezu weiße Bildbereiche), werden von der Weißplatte
       ausgenommen ("Knockout"), damit auf hellem/weißem Stoff kein
       sichtbarer weißer Fleck entsteht.
    3. Filmrand: 5 mm Rand rundum, ohne Farbauftrag, auf beiden Filmen
       identisch, damit sie deckungsgleich bleiben.
    4. Export als zwei PNG (300 dpi) und zusätzlich als PDF.

Bewusste Vereinfachungen, hier benannt statt geraten (kein ISO-Normbezug,
da PDF/X-1a nur für das Druck-PDF aus Schritt 2 gilt, nicht für dieses Modul):
    - Es wird nur EIN Rasterwinkel für alle vier CMYK-Kanäle verwendet (die
      Anforderung spricht von "einstellbarer ... Winkel", nicht von vier
      unterschiedlichen Winkeln je Kanal). In der klassischen Offset-Trennung
      bekommt jeder Kanal einen eigenen Winkel, um Moiré zu vermeiden – das
      ist hier bewusst nicht umgesetzt.
    - PNG kennt keinen CMYK-Farbraum. Die im CMYK-Raum berechneten
      Halbtonpunkte werden daher mit einer einfachen, nicht farbmetrischen
      Formel nach RGB zurückgerechnet (R=255*(1-C)*(1-K) usw.), nur damit
      der Farbfilm überhaupt als PNG gespeichert werden kann. Für die
      tatsächliche Druckfreigabe ist weiterhin das PDF/X-Druck-PDF aus
      Schritt 2 maßgeblich.
    - Die zusätzliche PDF-Ausgabe ist ein einfaches zweiseitiges
      Vorschau-/Dokumentations-PDF (Seite 1 Farbfilm, Seite 2 Weißplatte),
      keine PDF/X-Datei – das ist für dieses Modul nirgends gefordert.
    - Die Weißplatte wird nicht gerastert, sondern bleibt eine
      Halbton-freie Graustufen-Maske (kontinuierlicher Tintenauftrag), da
      Weißunterdruck beim DTF-Druck in der Praxis meist als Volltonfläche
      und nicht als Raster gedruckt wird.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pikepdf
from PIL import Image

from .color import convert_to_cmyk, limit_ink_coverage
from .config import DTF_DPI, DTF_FILMRAND_MM

PT_PER_MM = 72.0 / 25.4
MM_PER_INCH = 25.4


class DtfParameterError(ValueError):
    pass


def _halbton_punkte(cmyk_array_0_1: np.ndarray, lpi: float, winkel_grad: float, dpi: int) -> np.ndarray:
    """Berechnet für ein H,W,4-Array (Werte 0..1) das binäre Halbton-Muster (0/255).

    Klassisches amplitudenmoduliertes Rundpunkt-Raster: In einem um
    winkel_grad gedrehten Gitter mit Zellgröße dpi/lpi Pixel wächst der
    Punktradius mit der Flächendeckung. Bis 78,5% Deckung (π/4, die Fläche
    des größten einbeschriebenen Kreises je Zelle) wächst ein schwarzer
    Punkt auf weißem Grund; darüber schrumpft ein weißes Loch auf
    schwarzem Grund (klassisches "Euclidean Dot"-Verhalten).
    """
    hoehe, breite = cmyk_array_0_1.shape[:2]
    zelle_px = dpi / lpi

    y_idx, x_idx = np.mgrid[0:hoehe, 0:breite].astype(np.float64)
    theta = np.radians(winkel_grad)
    xr = x_idx * np.cos(theta) + y_idx * np.sin(theta)
    yr = -x_idx * np.sin(theta) + y_idx * np.cos(theta)

    cx = np.mod(xr, zelle_px) - zelle_px / 2
    cy = np.mod(yr, zelle_px) - zelle_px / 2
    dist = np.sqrt(cx**2 + cy**2)

    schwelle_flaeche = np.pi / 4
    ergebnis = np.zeros_like(cmyk_array_0_1, dtype=np.uint8)

    for kanal in range(cmyk_array_0_1.shape[2]):
        deckung = cmyk_array_0_1[..., kanal]
        r_wachsend = zelle_px * np.sqrt(np.clip(deckung, 0, None) / np.pi)
        punkt_niedrig = dist <= r_wachsend
        r_loch = zelle_px * np.sqrt(np.clip(1 - deckung, 0, None) / np.pi)
        punkt_hoch = dist > r_loch
        gepunktet = np.where(deckung <= schwelle_flaeche, punkt_niedrig, punkt_hoch)
        ergebnis[..., kanal] = np.where(gepunktet, 255, 0).astype(np.uint8)

    return ergebnis


def render_farbfilm(image: Image.Image, lpi: float, winkel_grad: float, dpi: int = DTF_DPI) -> Image.Image:
    """Erzeugt den halbtongerasterten Farbfilm als RGBA-Bild (siehe Modul-Docstring)."""
    if lpi <= 0:
        raise DtfParameterError("Die Rasterweite muss größer als 0 sein.")

    cmyk_bild = limit_ink_coverage(convert_to_cmyk(image))
    cmyk_arr = np.asarray(cmyk_bild, dtype=np.float64) / 255.0

    halbton = _halbton_punkte(cmyk_arr, lpi, winkel_grad, dpi).astype(np.float64) / 255.0
    c, m, y, k = (halbton[..., i] for i in range(4))

    r = 255.0 * (1 - c) * (1 - k)
    g = 255.0 * (1 - m) * (1 - k)
    b = 255.0 * (1 - y) * (1 - k)
    rgb = np.clip(np.stack([r, g, b], axis=-1), 0, 255).astype(np.uint8)

    if image.mode == "RGBA":
        alpha = np.asarray(image.split()[3], dtype=np.uint8)
    else:
        alpha = np.full((image.height, image.width), 255, dtype=np.uint8)

    rgba = np.dstack([rgb, alpha])
    return Image.fromarray(rgba, mode="RGBA")


def render_weissplatte(image: Image.Image, knockout_schwelle: int) -> Image.Image:
    """Erzeugt die Weißplatte als Graustufen-Bild (0 = kein Weiß, 255 = volles Weiß)."""
    if not (0 <= knockout_schwelle <= 255):
        raise DtfParameterError("Die Knockout-Schwelle muss zwischen 0 und 255 liegen.")

    if image.mode == "RGBA":
        alpha = np.asarray(image.split()[3], dtype=np.float64) / 255.0
        rgb_bild = image.convert("RGB")
    else:
        rgb_bild = image.convert("RGB")
        alpha = np.ones((image.height, image.width), dtype=np.float64)

    rgb_arr = np.asarray(rgb_bild, dtype=np.float64)
    helligkeit = 0.299 * rgb_arr[..., 0] + 0.587 * rgb_arr[..., 1] + 0.114 * rgb_arr[..., 2]

    braucht_weiss = (helligkeit < knockout_schwelle).astype(np.float64)
    weiss = alpha * braucht_weiss
    weiss_8bit = np.clip(np.round(weiss * 255), 0, 255).astype(np.uint8)
    return Image.fromarray(weiss_8bit, mode="L")


def _mit_filmrand(image: Image.Image, filmrand_mm: float, dpi: int) -> Image.Image:
    rand_px = round(filmrand_mm / MM_PER_INCH * dpi)
    neue_breite = image.width + 2 * rand_px
    neue_hoehe = image.height + 2 * rand_px

    hintergrund = (0, 0, 0, 0) if image.mode == "RGBA" else 0
    leinwand = Image.new(image.mode, (neue_breite, neue_hoehe), hintergrund)
    leinwand.paste(image, (rand_px, rand_px))
    return leinwand


def _bild_als_pdf_seite(pdf: pikepdf.Pdf, bild: Image.Image, dpi: int) -> None:
    breite_pt = bild.width / dpi * 72.0
    hoehe_pt = bild.height / dpi * 72.0
    seite = pdf.add_blank_page(page_size=(breite_pt, hoehe_pt))

    if bild.mode == "L":
        farbraum = pikepdf.Name.DeviceGray
        rohbytes = bild.tobytes()
    else:
        vorschau_rgb = bild.convert("RGB") if bild.mode != "RGB" else bild
        farbraum = pikepdf.Name.DeviceRGB
        rohbytes = vorschau_rgb.tobytes()

    bild_obj = pikepdf.Stream(pdf, rohbytes)
    bild_obj.Type = pikepdf.Name.XObject
    bild_obj.Subtype = pikepdf.Name.Image
    bild_obj.Width = bild.width
    bild_obj.Height = bild.height
    bild_obj.ColorSpace = farbraum
    bild_obj.BitsPerComponent = 8

    seite.Resources = pikepdf.Dictionary(
        XObject=pikepdf.Dictionary(Im0=bild_obj),
        ProcSet=pikepdf.Array([pikepdf.Name.PDF, pikepdf.Name.ImageC]),
    )
    inhalt = f"q {breite_pt:.4f} 0 0 {hoehe_pt:.4f} 0 0 cm /Im0 Do Q".encode("latin-1")
    seite.Contents = pikepdf.Stream(pdf, inhalt)


def _baue_dokumentations_pdf(farbfilm_rgba: Image.Image, weissplatte_grau: Image.Image, output_path: Path, dpi: int) -> None:
    """Einfaches zweiseitiges Vorschau-PDF (siehe Modul-Docstring zur Einordnung)."""
    farbfilm_vorschau = Image.new("RGB", farbfilm_rgba.size, (255, 255, 255))
    farbfilm_vorschau.paste(farbfilm_rgba, mask=farbfilm_rgba.split()[3])

    pdf = pikepdf.Pdf.new()
    _bild_als_pdf_seite(pdf, farbfilm_vorschau, dpi)
    _bild_als_pdf_seite(pdf, weissplatte_grau, dpi)
    with pdf.open_metadata() as meta:
        meta["dc:title"] = "TexStyle DTF – Farbfilm und Weißplatte"
    pdf.save(output_path)


@dataclass(frozen=True)
class DtfExportResult:
    farbfilm_png: Path
    weissplatte_png: Path
    pdf_pfad: Path
    breite_px: int
    hoehe_px: int


def export_dtf(
    image: Image.Image,
    output_dir: Path,
    basisname: str,
    lpi: float,
    winkel_grad: float,
    knockout_schwelle: int,
    dpi: int = DTF_DPI,
    filmrand_mm: float = DTF_FILMRAND_MM,
) -> DtfExportResult:
    """Orchestriert Halbton-Farbfilm, Weißplatte, Filmrand und Export (PNG x2 + PDF)."""
    farbfilm = render_farbfilm(image, lpi, winkel_grad, dpi)
    weissplatte = render_weissplatte(image, knockout_schwelle)

    farbfilm_final = _mit_filmrand(farbfilm, filmrand_mm, dpi)
    weissplatte_final = _mit_filmrand(weissplatte, filmrand_mm, dpi)

    if farbfilm_final.size != weissplatte_final.size:
        # Kann bei korrekter Implementierung nicht auftreten (beide stammen aus
        # demselben Quellbild mit identischem Filmrand) - Absicherung gegen
        # stille Fehldeckung, siehe Anforderung "deckungsgleich".
        raise RuntimeError("Farbfilm und Weißplatte haben unterschiedliche Pixelmaße.")

    farbfilm_pfad = output_dir / f"{basisname}_farbfilm.png"
    weissplatte_pfad = output_dir / f"{basisname}_weissplatte.png"
    pdf_pfad = output_dir / f"{basisname}_dtf.pdf"

    dpi_meta = (dpi, dpi)
    farbfilm_final.save(farbfilm_pfad, format="PNG", dpi=dpi_meta)
    weissplatte_final.save(weissplatte_pfad, format="PNG", dpi=dpi_meta)
    _baue_dokumentations_pdf(farbfilm_final, weissplatte_final, pdf_pfad, dpi)

    return DtfExportResult(
        farbfilm_png=farbfilm_pfad,
        weissplatte_png=weissplatte_pfad,
        pdf_pfad=pdf_pfad,
        breite_px=farbfilm_final.width,
        hoehe_px=farbfilm_final.height,
    )
