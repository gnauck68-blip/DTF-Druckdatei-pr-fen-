import pytest

from texstyle_dtf.formats import InvalidFormatError, resolve_format


def test_standardformat_a4():
    fmt = resolve_format("A4")
    assert fmt.width_mm == 210.0
    assert fmt.height_mm == 297.0


def test_freies_format_gueltig():
    fmt = resolve_format("CUSTOM", width_mm=150, height_mm=100)
    assert fmt.width_mm == 150
    assert fmt.height_mm == 100


def test_freies_format_ohne_masse_wirft_fehler():
    with pytest.raises(InvalidFormatError):
        resolve_format("CUSTOM")


def test_freies_format_ausserhalb_grenzen_wirft_fehler():
    with pytest.raises(InvalidFormatError):
        resolve_format("CUSTOM", width_mm=1, height_mm=1)


def test_unbekanntes_format_wirft_fehler():
    with pytest.raises(InvalidFormatError):
        resolve_format("A99")
