from pathlib import Path

import numpy as np
import pikepdf
import pytest
from PIL import Image

from texstyle_dtf import dtf
from texstyle_dtf.config import DTF_FILMRAND_MM


def _testbild_mit_transparenz_und_hellem_bereich() -> Image.Image:
    arr = np.full((300, 400, 4), 255, dtype=np.uint8)
    arr[..., 0] = 200  # R
    arr[..., 1] = 30   # G
    arr[..., 2] = 30   # B
    arr[:, :50, 3] = 0  # transparenter Streifen links -> nie Weiß
    arr[:40, :, :3] = 250  # heller Streifen oben -> Knockout
    return Image.fromarray(arr, mode="RGBA")


def test_export_dtf_liefert_deckungsgleiche_pngs_mit_300dpi(tmp_path: Path):
    img = _testbild_mit_transparenz_und_hellem_bereich()
    ergebnis = dtf.export_dtf(img, tmp_path, "test", lpi=45, winkel_grad=22.5, knockout_schwelle=240)

    assert ergebnis.farbfilm_png.is_file()
    assert ergebnis.weissplatte_png.is_file()
    assert ergebnis.pdf_pfad.is_file()

    with Image.open(ergebnis.farbfilm_png) as farbfilm, Image.open(ergebnis.weissplatte_png) as weiss:
        assert farbfilm.size == weiss.size
        assert farbfilm.size == (ergebnis.breite_px, ergebnis.hoehe_px)
        for bild in (farbfilm, weiss):
            dpi_x, dpi_y = bild.info["dpi"]
            # Die PNG-pHYs-Angabe rundet auf ganze Pixel je Meter, daher minimale Toleranz.
            assert dpi_x == pytest.approx(300, abs=0.01)
            assert dpi_y == pytest.approx(300, abs=0.01)


def test_filmrand_ist_5mm_auf_beiden_seiten(tmp_path: Path):
    img = _testbild_mit_transparenz_und_hellem_bereich()
    ergebnis = dtf.export_dtf(img, tmp_path, "test3", lpi=45, winkel_grad=22.5, knockout_schwelle=240)

    rand_px_erwartet = round(DTF_FILMRAND_MM / 25.4 * 300)
    breite_erwartet = img.width + 2 * rand_px_erwartet
    hoehe_erwartet = img.height + 2 * rand_px_erwartet

    assert ergebnis.breite_px == breite_erwartet
    assert ergebnis.hoehe_px == hoehe_erwartet


def test_weissplatte_knockout_bei_transparenz_und_helligkeit():
    img = _testbild_mit_transparenz_und_hellem_bereich()
    weiss = dtf.render_weissplatte(img, knockout_schwelle=240)
    arr = np.asarray(weiss)

    # Transparenter Streifen links (Spalten 0-49): kein Weiß
    assert arr[:, :50].max() == 0
    # Heller Streifen oben (Zeilen 0-39, ab Spalte 50): kein Weiß (Knockout)
    assert arr[:40, 50:].max() == 0
    # Restlicher, dunkler und opaker Bereich: volles Weiß
    assert arr[100:, 100:].min() == 255


def test_weissplatte_ohne_alpha_ist_ueberall_voll_ausser_knockout():
    img = Image.new("RGB", (100, 100), (10, 10, 10))
    weiss = dtf.render_weissplatte(img, knockout_schwelle=240)
    arr = np.asarray(weiss)
    assert arr.min() == 255  # kein Alpha -> überall potenziell Weiß, dunkles Bild -> kein Knockout


def test_ungueltige_knockout_schwelle_wirft_fehler():
    import pytest

    img = Image.new("RGB", (10, 10))
    with pytest.raises(dtf.DtfParameterError):
        dtf.render_weissplatte(img, knockout_schwelle=300)


def test_ungueltige_rasterweite_wirft_fehler():
    import pytest

    img = Image.new("RGB", (10, 10))
    with pytest.raises(dtf.DtfParameterError):
        dtf.render_farbfilm(img, lpi=0, winkel_grad=0)


def test_halbton_erzeugt_binaere_werte_je_kanal():
    # Ein mittelgraues CMYK-Bild sollte nach der Rasterung nur 0 oder 255 je Kanal enthalten.
    arr = np.full((60, 60, 4), 128, dtype=np.uint8)
    cmyk_bild = Image.fromarray(arr, mode="CMYK")
    cmyk_arr = np.asarray(cmyk_bild, dtype=np.float64) / 255.0
    gerastert = dtf._halbton_punkte(cmyk_arr, lpi=20, winkel_grad=15, dpi=300)
    werte = set(np.unique(gerastert).tolist())
    assert werte.issubset({0, 255})
    # Ungefähr die Hälfte der Fläche sollte Farbe tragen, da Ausgangswert 50% Deckung war.
    anteil = gerastert.mean() / 255.0
    assert 0.3 < anteil < 0.7


def test_dtf_pdf_hat_zwei_seiten(tmp_path: Path):
    img = _testbild_mit_transparenz_und_hellem_bereich()
    ergebnis = dtf.export_dtf(img, tmp_path, "test4", lpi=45, winkel_grad=22.5, knockout_schwelle=240)
    with pikepdf.open(ergebnis.pdf_pfad) as pdf:
        assert len(pdf.pages) == 2
