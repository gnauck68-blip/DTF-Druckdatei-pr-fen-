import subprocess
import sys
from pathlib import Path

import numpy as np
import pikepdf
import pytest
from PIL import Image

from texstyle_dtf import color, pdfx
from texstyle_dtf.config import BLEED_MM
from texstyle_dtf.formats import resolve_format

PT_PER_MM = 72.0 / 25.4


def test_geometrie_bleedbox_ist_trimbox_plus_anschnitt():
    fmt = resolve_format("A3")
    geo = pdfx.compute_geometry(fmt)

    trim_w_mm = (geo.trim_x1 - geo.trim_x0) / PT_PER_MM
    trim_h_mm = (geo.trim_y1 - geo.trim_y0) / PT_PER_MM
    bleed_w_mm = (geo.bleed_x1 - geo.bleed_x0) / PT_PER_MM
    bleed_h_mm = (geo.bleed_y1 - geo.bleed_y0) / PT_PER_MM

    assert trim_w_mm == pytest.approx(297.0, abs=0.01)
    assert trim_h_mm == pytest.approx(420.0, abs=0.01)
    assert bleed_w_mm == pytest.approx(297.0 + 2 * BLEED_MM, abs=0.01)
    assert bleed_h_mm == pytest.approx(420.0 + 2 * BLEED_MM, abs=0.01)


def test_export_pdfx_erzeugt_gueltige_pdfx1a_datei(tmp_path: Path):
    img = Image.new("RGB", (600, 848), (20, 60, 140))
    fmt = resolve_format("A6")
    output = tmp_path / "test.pdf"

    result = pdfx.export_pdfx(img, fmt, output)

    assert output.is_file()
    assert result.max_ink_coverage_percent <= 300.0

    with pikepdf.open(output) as pdf:
        assert pdf.pdf_version == "1.3"
        assert len(pdf.pages) == 1
        page = pdf.pages[0]

        trim = page.get("/TrimBox")
        bleed = page.get("/BleedBox")
        assert trim is not None and bleed is not None
        trim_w_mm = (float(trim[2]) - float(trim[0])) / PT_PER_MM
        assert trim_w_mm == pytest.approx(fmt.width_mm, abs=0.1)

        intents = pdf.Root.get("/OutputIntents")
        assert intents is not None and len(intents) == 1
        assert str(intents[0].get("/S")) == "/GTS_PDFX"
        assert intents[0].get("/DestOutputProfile") is not None


def test_fehlt_icc_profil_bricht_export_klar_ab(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("TEXSTYLE_ICC_CMYK", raising=False)
    img = Image.new("RGB", (100, 100), (10, 10, 10))
    fmt = resolve_format("A6")
    with pytest.raises(color.ICCProfileMissingError):
        pdfx.export_pdfx(img, fmt, tmp_path / "out.pdf")


def test_gerastertes_pdf_hat_hoechstens_300_prozent_farbauftrag(tmp_path: Path):
    """End-to-End: ein künstlich auf 400% gesetztes CMYK-Bild darf im fertigen
    PDF nicht mehr über 300% liegen (Messung direkt aus den PDF-Bilddaten,
    wie auch scripts/verify_pdfx.py es tut)."""
    arr = np.full((30, 30, 4), 255, dtype=np.uint8)
    hoher_auftrag_cmyk = Image.fromarray(arr, mode="CMYK")

    original = color.convert_to_cmyk
    try:
        color.convert_to_cmyk = lambda img: hoher_auftrag_cmyk
        fmt = resolve_format("A6")
        output = tmp_path / "hoch.pdf"
        pdfx.export_pdfx(Image.new("RGB", (30, 30)), fmt, output)
    finally:
        color.convert_to_cmyk = original

    with pikepdf.open(output) as pdf:
        max_wert = 0.0
        for obj in pdf.objects:
            if hasattr(obj, "get") and str(obj.get("/Subtype", "")) == "/Image":
                width = int(obj.get("/Width"))
                height = int(obj.get("/Height"))
                rohbytes = obj.read_bytes()
                bild = np.frombuffer(rohbytes, dtype=np.uint8).reshape(height, width, 4).astype(np.float32)
                max_wert = max(max_wert, float((bild.sum(axis=2) / 255.0 * 100.0).max()))
    assert max_wert <= 300.0


def test_verify_pdfx_skript_meldet_pass(tmp_path: Path):
    img = Image.new("RGB", (400, 566), (100, 100, 20))
    fmt = resolve_format("A6")
    output = tmp_path / "verify_test.pdf"
    pdfx.export_pdfx(img, fmt, output)

    projekt_root = Path(__file__).resolve().parent.parent
    ergebnis = subprocess.run(
        [sys.executable, str(projekt_root / "scripts" / "verify_pdfx.py"), str(output)],
        capture_output=True,
        text=True,
    )
    assert "PASS" in ergebnis.stdout
    assert ergebnis.returncode == 0
