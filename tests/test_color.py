import numpy as np
import pytest
from PIL import Image

from texstyle_dtf import color


def test_fehlt_icc_profil_wird_klar_gemeldet(monkeypatch):
    monkeypatch.delenv("TEXSTYLE_ICC_CMYK", raising=False)
    with pytest.raises(color.ICCProfileMissingError):
        color.get_target_profile_info()


def test_nicht_vorhandene_profildatei_wird_klar_gemeldet(monkeypatch):
    monkeypatch.setenv("TEXSTYLE_ICC_CMYK", "/pfad/existiert/nicht.icc")
    with pytest.raises(color.ICCProfileMissingError):
        color.get_target_profile_info()


def test_rgb_bild_wird_zu_cmyk_konvertiert():
    img = Image.new("RGB", (20, 20), (200, 30, 30))
    cmyk = color.convert_to_cmyk(img)
    assert cmyk.mode == "CMYK"
    assert cmyk.size == (20, 20)


def test_rgba_bild_wird_auf_weiss_kompositiert_und_konvertiert():
    img = Image.new("RGBA", (10, 10), (0, 0, 0, 0))  # komplett transparent
    cmyk = color.convert_to_cmyk(img)
    assert cmyk.mode == "CMYK"
    # Transparenter Bereich muss auf Weiß gelegt werden -> nahe 0 Farbauftrag
    max_auftrag = color.measure_max_ink_coverage(cmyk)
    assert max_auftrag < 20


def test_farbauftrag_wird_auf_300_prozent_begrenzt():
    arr = np.full((10, 10, 4), 255, dtype=np.uint8)  # 400 % Farbauftrag
    img = Image.fromarray(arr, mode="CMYK")
    assert color.measure_max_ink_coverage(img) == pytest.approx(400.0)

    begrenzt = color.limit_ink_coverage(img, max_percent=300.0)
    gemessen = color.measure_max_ink_coverage(begrenzt)
    assert gemessen <= 300.0
    assert gemessen == pytest.approx(300.0, abs=0.5)


def test_farbauftrag_unter_grenze_bleibt_unveraendert():
    arr = np.full((5, 5, 4), 50, dtype=np.uint8)  # 78 % Farbauftrag
    img = Image.fromarray(arr, mode="CMYK")
    vor = color.measure_max_ink_coverage(img)
    begrenzt = color.limit_ink_coverage(img, max_percent=300.0)
    nach = color.measure_max_ink_coverage(begrenzt)
    assert nach == pytest.approx(vor)
