import pytest

from texstyle_dtf.resolution import check_resolution


def test_ausreichende_aufloesung_ist_gruen():
    # A4 = 210 x 297 mm, deutlich über 300 dpi in beiden Achsen
    result = check_resolution(2600, 3650, 210, 297)
    assert result.ampel == "gruen"
    assert result.dpi_effective >= 300


def test_grenzwertige_aufloesung_ist_gelb():
    # ca. 200 dpi bei A4
    result = check_resolution(1654, 2339, 210, 297)
    assert result.ampel == "gelb"
    assert 150 <= result.dpi_effective < 300


def test_niedrige_aufloesung_ist_rot():
    # 72 dpi bei A4
    result = check_resolution(595, 842, 210, 297)
    assert result.ampel == "rot"
    assert result.dpi_effective < 150


def test_ungueltige_masse_werfen_fehler():
    with pytest.raises(ValueError):
        check_resolution(0, 100, 210, 297)
    with pytest.raises(ValueError):
        check_resolution(100, 100, 0, 297)
