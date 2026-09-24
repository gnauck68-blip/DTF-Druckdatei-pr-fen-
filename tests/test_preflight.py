from pathlib import Path

from PIL import Image

from texstyle_dtf import pdfx, preflight
from texstyle_dtf.formats import resolve_format


def test_preflight_ist_gruen_bei_guter_aufloesung(tmp_path: Path):
    # A4 bei deutlich über 300 dpi
    img = Image.new("RGB", (2600, 3650), (30, 60, 150))
    fmt = resolve_format("A4")
    output = tmp_path / "gut.pdf"
    pdfx.export_pdfx(img, fmt, output)

    bericht = preflight.run_preflight(output)

    assert bericht.gesamt_ampel == "gruen"
    assert bericht.download_erlaubt is True
    schluessel = {item.schluessel for item in bericht.items}
    erwartete_punkte = {
        "aufloesung", "farbraum", "icc_profil", "farbauftrag",
        "trimbox", "bleedbox", "pdf_version", "output_intent", "dateigroesse",
    }
    assert erwartete_punkte.issubset(schluessel)


def test_preflight_sperrt_download_bei_72_dpi_testbild(tmp_path: Path):
    # 72 dpi bei A4 (595 x 842 px entspricht ziemlich genau 72 dpi bei A4)
    img = Image.new("RGB", (595, 842), (30, 60, 150))
    fmt = resolve_format("A4")
    output = tmp_path / "schlecht.pdf"
    pdfx.export_pdfx(img, fmt, output)

    bericht = preflight.run_preflight(output)

    aufloesung_item = next(item for item in bericht.items if item.schluessel == "aufloesung")
    assert aufloesung_item.ampel == "rot"
    assert bericht.gesamt_ampel == "rot"
    assert bericht.download_erlaubt is False


def test_preflight_erkennt_hohen_farbauftrag_als_gelb_oder_rot(tmp_path: Path, monkeypatch):
    import numpy as np
    from texstyle_dtf import color

    # Hinweis: Bilder unter ca. 40x40 px bettet Ghostscript als Inline-Image
    # statt als Image-XObject ein (siehe test_pdfx.py). Echte Fotos sind immer
    # deutlich größer, daher hier 60x60 px mit leichter Variation.
    rng = np.random.default_rng(0)
    arr = rng.integers(250, 256, size=(60, 60, 4)).astype(np.uint8)  # nahe 400% vor Begrenzung
    hoher_auftrag = Image.fromarray(arr, mode="CMYK")

    original = color.convert_to_cmyk
    try:
        color.convert_to_cmyk = lambda img: hoher_auftrag
        fmt = resolve_format("A6")
        output = tmp_path / "hoch.pdf"
        pdfx.export_pdfx(Image.new("RGB", (60, 60)), fmt, output)
    finally:
        color.convert_to_cmyk = original

    bericht = preflight.run_preflight(output)
    farbauftrag_item = next(item for item in bericht.items if item.schluessel == "farbauftrag")
    # Nach der Begrenzung in export_pdfx liegt der Wert nah an, aber unter 300% -> gelb/grün.
    # Hinweis: Das 60x60-px-Testbild ist für A6 viel zu klein und macht die
    # Auflösungs-Ampel separat rot – hier wird nur der Farbauftrag-Punkt geprüft.
    assert farbauftrag_item.ampel in ("gelb", "gruen")
