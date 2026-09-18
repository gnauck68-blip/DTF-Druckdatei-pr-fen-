"""Aufbau des Druck-PDFs und Export als PDF/X-1a:2001 (Punkt 6 und 7).

Aufgabenteilung im Code, wie im Stack vorgegeben:
    1. Ein einfaches Quell-PDF wird mit pikepdf gebaut: eine Seite mit dem
       bereits CMYK-konvertierten und farbauftragsbegrenzten Bild als
       Image-XObject, dazu Schnittmarken und Passermarken als Vektorlinien.
       TrimBox und BleedBox werden hier bereits gesetzt.
    2. Ghostscript wandelt dieses Quell-PDF in echtes PDF/X-1a:2001 um:
       erzwingt PDF-Version 1.3, ausschließlich CMYK/Graustufen-Farbräume
       (-sColorConversionStrategy=CMYK), keine Transparenz (durch die alte
       Kompatibilitätsstufe 1.3 gibt es keine PDF-Transparenzgruppen) und
       bettet das OutputIntent mit dem konfigurierten ICC-Profil ein.
    3. pikepdf öffnet die Ghostscript-Ausgabe erneut und setzt TrimBox und
       BleedBox nochmals explizit auf die berechneten Werte. Das ist eine
       bewusste doppelte Absicherung, falls Ghostscript beim Umwandeln die
       ursprünglichen Boxen nicht exakt übernimmt.

Unsicherheit zur Norm (ISO 15930-1 / PDF/X-1a:2001), hier bewusst benannt
statt geraten:
    Die genaue Geometrie von Schnitt- und Passermarken (Länge, Abstand zum
    Endformat, ob Passermarken auf jeder Druckplatte erscheinen müssen) ist
    kein Bestandteil der PDF/X-Norm selbst, sondern eine Druckerei-Konvention.
    Ebenso ist der Wortlaut von OutputCondition/OutputConditionIdentifier bei
    einem selbst eingerichteten (nicht bei ICC.org registrierten) Profil nicht
    normativ vorgeschrieben. Es wird hier ein nachvollziehbarer, aber nicht
    normativ zwingender Standardwert verwendet (siehe Konstanten unten und
    _build_output_intent_fields()). Echte Passermarken (die auf jeder
    Farbseparation erscheinen) benötigen eigentlich einen speziellen
    "All"-Separationsfarbraum statt eines einfachen CMYK-Schwarz – das ist
    hier aus Aufwandsgründen vereinfacht als reines K-Schwarz umgesetzt.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import pikepdf
from PIL import Image

from .color import TargetProfileInfo, convert_to_cmyk, get_target_profile_info, limit_ink_coverage, measure_max_ink_coverage
from .config import BLEED_MM
from .formats import PageFormat

PT_PER_MM = 72.0 / 25.4

# Länge der Schnitt- und Passermarken sowie ihr Abstand zum Endformat.
# Festlegung (siehe Modul-Docstring: nicht normativ vorgeschrieben):
# Die Marken beginnen dort, wo die Anschnittzugabe endet (Abstand zum
# Endformat = BLEED_MM) und ragen von dort MARK_LAENGE_MM weiter nach außen.
MARK_LAENGE_MM = 5.0
MARK_LINIENBREITE_PT = 0.5
# Zusätzlicher Sicherheitsrand um die Marken herum, damit nichts abgeschnitten wird.
SEITENRAND_PUFFER_MM = 2.0

def _finde_ghostscript() -> str | None:
    """Sucht das Ghostscript-Kommandozeilenprogramm plattformunabhängig.

    Unter Linux/macOS heißt es "gs", unter Windows meist "gswin64c" (64-Bit)
    oder "gswin32c" (32-Bit) – ein bloßes "gs" existiert dort in der Regel
    nicht, auch wenn Ghostscript korrekt installiert ist.
    """
    for kandidat in ("gs", "gswin64c", "gswin32c"):
        pfad = shutil.which(kandidat)
        if pfad is not None:
            return pfad
    return None


GS_BINARY = _finde_ghostscript()


class GhostscriptNotFoundError(RuntimeError):
    pass


class PdfXExportError(RuntimeError):
    pass


@dataclass(frozen=True)
class PageGeometry:
    """Alle Maße in PDF-Punkten (1/72 Zoll), Ursprung unten links der Seite."""

    media_w_pt: float
    media_h_pt: float
    trim_x0: float
    trim_y0: float
    trim_x1: float
    trim_y1: float
    bleed_x0: float
    bleed_y0: float
    bleed_x1: float
    bleed_y1: float


def _mm(value_mm: float) -> float:
    return value_mm * PT_PER_MM


def compute_geometry(page_format: PageFormat, bleed_mm: float = BLEED_MM) -> PageGeometry:
    media_margin_mm = bleed_mm + MARK_LAENGE_MM + SEITENRAND_PUFFER_MM

    trim_w_mm = page_format.width_mm
    trim_h_mm = page_format.height_mm

    trim_x0 = _mm(media_margin_mm)
    trim_y0 = _mm(media_margin_mm)
    trim_x1 = trim_x0 + _mm(trim_w_mm)
    trim_y1 = trim_y0 + _mm(trim_h_mm)

    bleed_x0 = trim_x0 - _mm(bleed_mm)
    bleed_y0 = trim_y0 - _mm(bleed_mm)
    bleed_x1 = trim_x1 + _mm(bleed_mm)
    bleed_y1 = trim_y1 + _mm(bleed_mm)

    media_w_pt = trim_x1 + _mm(media_margin_mm)
    media_h_pt = trim_y1 + _mm(media_margin_mm)

    return PageGeometry(
        media_w_pt=media_w_pt,
        media_h_pt=media_h_pt,
        trim_x0=trim_x0,
        trim_y0=trim_y0,
        trim_x1=trim_x1,
        trim_y1=trim_y1,
        bleed_x0=bleed_x0,
        bleed_y0=bleed_y0,
        bleed_x1=bleed_x1,
        bleed_y1=bleed_y1,
    )


def _crop_marks_content(geo: PageGeometry) -> str:
    """Erzeugt die PDF-Content-Stream-Befehle für die vier Schnittmarken-Ecken."""
    mark_len = _mm(MARK_LAENGE_MM)
    lines: list[tuple[float, float, float, float]] = []

    # Unten links
    lines.append((geo.bleed_x0 - mark_len, geo.trim_y0, geo.bleed_x0, geo.trim_y0))
    lines.append((geo.trim_x0, geo.bleed_y0 - mark_len, geo.trim_x0, geo.bleed_y0))
    # Oben links
    lines.append((geo.bleed_x0 - mark_len, geo.trim_y1, geo.bleed_x0, geo.trim_y1))
    lines.append((geo.trim_x0, geo.bleed_y1, geo.trim_x0, geo.bleed_y1 + mark_len))
    # Unten rechts
    lines.append((geo.bleed_x1, geo.trim_y0, geo.bleed_x1 + mark_len, geo.trim_y0))
    lines.append((geo.trim_x1, geo.bleed_y0 - mark_len, geo.trim_x1, geo.bleed_y0))
    # Oben rechts
    lines.append((geo.bleed_x1, geo.trim_y1, geo.bleed_x1 + mark_len, geo.trim_y1))
    lines.append((geo.trim_x1, geo.bleed_y1, geo.trim_x1, geo.bleed_y1 + mark_len))

    parts = []
    for x0, y0, x1, y1 in lines:
        parts.append(f"{x0:.2f} {y0:.2f} m {x1:.2f} {y1:.2f} l S")
    return "\n".join(parts)


def _circle_path(cx: float, cy: float, r: float) -> str:
    # Bezier-Näherung eines Kreises (Kappa-Konstante für 4 Viertelkreise).
    k = 0.5522847498
    ops = [f"{cx + r:.2f} {cy:.2f} m"]
    ops.append(
        f"{cx + r:.2f} {cy + r * k:.2f} {cx + r * k:.2f} {cy + r:.2f} {cx:.2f} {cy + r:.2f} c"
    )
    ops.append(
        f"{cx - r * k:.2f} {cy + r:.2f} {cx - r:.2f} {cy + r * k:.2f} {cx - r:.2f} {cy:.2f} c"
    )
    ops.append(
        f"{cx - r:.2f} {cy - r * k:.2f} {cx - r * k:.2f} {cy - r:.2f} {cx:.2f} {cy - r:.2f} c"
    )
    ops.append(
        f"{cx + r * k:.2f} {cy - r:.2f} {cx + r:.2f} {cy - r * k:.2f} {cx + r:.2f} {cy:.2f} c"
    )
    return "\n".join(ops) + "\nS"


def _registration_marks_content(geo: PageGeometry) -> str:
    """Passermarken (Kreis mit Fadenkreuz) an den vier Kantenmitten."""
    radius = _mm(MARK_LAENGE_MM / 2)
    abstand = _mm(BLEED_MM + MARK_LAENGE_MM / 2)

    mitte_x = (geo.trim_x0 + geo.trim_x1) / 2
    mitte_y = (geo.trim_y0 + geo.trim_y1) / 2

    zentren = [
        (mitte_x, geo.trim_y0 - abstand),  # unten
        (mitte_x, geo.trim_y1 + abstand),  # oben
        (geo.trim_x0 - abstand, mitte_y),  # links
        (geo.trim_x1 + abstand, mitte_y),  # rechts
    ]

    parts = []
    for cx, cy in zentren:
        parts.append(_circle_path(cx, cy, radius))
        parts.append(f"{cx - radius:.2f} {cy:.2f} m {cx + radius:.2f} {cy:.2f} l S")
        parts.append(f"{cx:.2f} {cy - radius:.2f} m {cx:.2f} {cy + radius:.2f} l S")
    return "\n".join(parts)


def _build_source_pdf(cmyk_image: Image.Image, geo: PageGeometry, title: str) -> pikepdf.Pdf:
    pdf = pikepdf.Pdf.new()
    page = pdf.add_blank_page(page_size=(geo.media_w_pt, geo.media_h_pt))

    raw_bytes = cmyk_image.tobytes()  # unkomprimiert, RAW; pikepdf komprimiert beim Speichern
    image_obj = pikepdf.Stream(pdf, raw_bytes)
    image_obj.Type = pikepdf.Name.XObject
    image_obj.Subtype = pikepdf.Name.Image
    image_obj.Width = cmyk_image.width
    image_obj.Height = cmyk_image.height
    image_obj.ColorSpace = pikepdf.Name.DeviceCMYK
    image_obj.BitsPerComponent = 8
    # CMYK-Bilddaten aus PIL sind bereits im "normalen" (nicht invertierten) Sinn:
    # 0 = kein Farbauftrag, 255 = voller Farbauftrag je Kanal. Das entspricht
    # der PDF-Konvention für DeviceCMYK-Bilddaten ohne Decode-Array.

    bleed_w = geo.bleed_x1 - geo.bleed_x0
    bleed_h = geo.bleed_y1 - geo.bleed_y0

    content_lines = [
        "q",
        f"{bleed_w:.4f} 0 0 {bleed_h:.4f} {geo.bleed_x0:.4f} {geo.bleed_y0:.4f} cm",
        "/Im0 Do",
        "Q",
        "q",
        f"{MARK_LINIENBREITE_PT} w",
        "0 0 0 1 K",  # CMYK-Schwarz für die Konturlinien (siehe Docstring-Hinweis zu Passermarken)
        _crop_marks_content(geo),
        _registration_marks_content(geo),
        "Q",
    ]
    content = "\n".join(content_lines).encode("latin-1")

    page.Resources = pikepdf.Dictionary(
        XObject=pikepdf.Dictionary(Im0=image_obj),
        ProcSet=pikepdf.Array([pikepdf.Name.PDF, pikepdf.Name.ImageC]),
    )
    page.Contents = pikepdf.Stream(pdf, content)

    page.TrimBox = pikepdf.Array([geo.trim_x0, geo.trim_y0, geo.trim_x1, geo.trim_y1])
    page.BleedBox = pikepdf.Array([geo.bleed_x0, geo.bleed_y0, geo.bleed_x1, geo.bleed_y1])

    with pdf.open_metadata() as meta:
        meta["dc:title"] = title

    return pdf


def _write_pdfx_def_ps(path: Path, icc_profile_path: str, profile_description: str, title: str) -> None:
    def _ps_escape(text: str) -> str:
        return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    # Vorlage angelehnt an das mit Ghostscript ausgelieferte PDFX_def.ps,
    # angepasst auf PDF/X-1a:2001 (siehe Modul-Docstring zur Unsicherheit
    # bei OutputCondition/OutputConditionIdentifier).
    content = f"""%!
[ /GTS_PDFXVersion (PDF/X-1a:2001)
  /Title ({_ps_escape(title)})
  /Trapped /False
/DOCINFO pdfmark

/ICCProfile ({_ps_escape(icc_profile_path)}) def

[/_objdef {{icc_PDFX}} /type /stream /OBJ pdfmark
[{{icc_PDFX}} << /N 4 >> /PUT pdfmark
[{{icc_PDFX}} ICCProfile (r) file /PUT pdfmark

[/_objdef {{OutputIntent_PDFX}} /type /dict /OBJ pdfmark
[{{OutputIntent_PDFX}} <<
  /Type /OutputIntent
  /S /GTS_PDFX
  /OutputCondition ({_ps_escape(profile_description)})
  /Info ({_ps_escape(profile_description)})
  /OutputConditionIdentifier (Custom)
  /RegistryName (http://www.color.org)
  /DestOutputProfile {{icc_PDFX}}
>> /PUT pdfmark
[{{Catalog}} <</OutputIntents [ {{OutputIntent_PDFX}} ]>> /PUT pdfmark
"""
    path.write_text(content, encoding="latin-1")


def _run_ghostscript(source_pdf: Path, pdfx_def: Path, output_pdf: Path, icc_profile_path: str) -> None:
    if GS_BINARY is None:
        raise GhostscriptNotFoundError(
            "Ghostscript wurde nicht gefunden (weder \"gs\" noch \"gswin64c\"/\"gswin32c\" im "
            "Systempfad). Ohne Ghostscript kann keine PDF/X-Datei erzeugt werden."
        )

    cmd = [
        GS_BINARY,
        "-dPDFX",
        "-dBATCH",
        "-dNOPAUSE",
        "-dNOOUTERSAVE",
        # Ghostscript liest das ICC-Profil im PDFX_def.ps über den PostScript-
        # Dateioperator ein. Der SAFER-Sandbox-Modus (Standard seit gs 9.x)
        # blockiert Dateizugriffe außerhalb weniger Standardpfade, daher muss
        # der Profilpfad hier ausdrücklich freigegeben werden.
        f"--permit-file-read={icc_profile_path}",
        "-sColorConversionStrategy=CMYK",
        "-dProcessColorModel=/DeviceCMYK",
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.3",
        "-dEmbedAllFonts=true",
        "-dSubsetFonts=true",
        "-dAutoRotatePages=/None",
        "-dPDFACompatibilityPolicy=1",
        f"-sOutputFile={output_pdf}",
        str(pdfx_def),
        str(source_pdf),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0 or not output_pdf.exists():
        raise PdfXExportError(
            "Ghostscript konnte keine PDF/X-Datei erzeugen. "
            f"Rückgabecode: {result.returncode}. Meldung: {result.stderr.strip()[-2000:]}"
        )


def _finalize_boxes(output_pdf: Path, geo: PageGeometry) -> None:
    """Setzt TrimBox/BleedBox nach dem Ghostscript-Lauf nochmals explizit (siehe Docstring)."""
    with pikepdf.open(output_pdf, allow_overwriting_input=True) as pdf:
        page = pdf.pages[0]
        page.TrimBox = pikepdf.Array([geo.trim_x0, geo.trim_y0, geo.trim_x1, geo.trim_y1])
        page.BleedBox = pikepdf.Array([geo.bleed_x0, geo.bleed_y0, geo.bleed_x1, geo.bleed_y1])
        pdf.save(output_pdf)


@dataclass(frozen=True)
class PdfXExportResult:
    output_path: Path
    geometry: PageGeometry
    max_ink_coverage_percent: float
    profile: TargetProfileInfo


def export_pdfx(image: Image.Image, page_format: PageFormat, output_path: Path, title: str = "TexStyle DTF Druckdatei") -> PdfXExportResult:
    """Orchestriert CMYK-Konvertierung, Farbauftragsbegrenzung und PDF/X-1a-Export."""
    profile = get_target_profile_info()

    cmyk_image = convert_to_cmyk(image)
    cmyk_image = limit_ink_coverage(cmyk_image)
    max_ink = measure_max_ink_coverage(cmyk_image)

    geo = compute_geometry(page_format)

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        source_pdf_path = tmp_path / "quelle.pdf"
        pdfx_def_path = tmp_path / "pdfx_def.ps"

        source_pdf = _build_source_pdf(cmyk_image, geo, title)
        source_pdf.save(source_pdf_path)
        source_pdf.close()

        _write_pdfx_def_ps(pdfx_def_path, profile.path, profile.description, title)
        _run_ghostscript(source_pdf_path, pdfx_def_path, output_path, profile.path)

    _finalize_boxes(output_path, geo)

    return PdfXExportResult(
        output_path=output_path,
        geometry=geo,
        max_ink_coverage_percent=max_ink,
        profile=profile,
    )
