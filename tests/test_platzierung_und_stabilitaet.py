"""Tests für Bildplatzierung ohne Verzerrung, Auflösungsprüfung am platzierten
Bild, Upload-Vorschau mit Transparenz und Eingabeprüfungen der API."""
import io
from pathlib import Path

import numpy as np
import pikepdf
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from texstyle_dtf import dtf, formats, pdfx, preflight
from texstyle_dtf.main import app
from texstyle_dtf.resolution import check_resolution

A4 = formats.resolve_format("A4")


@pytest.mark.parametrize("breite_px, hoehe_px", [(2480, 2480), (4000, 1000), (1000, 4000)])
@pytest.mark.parametrize("anpassung", pdfx.ANPASSUNGEN)
def test_platzierung_behaelt_seitenverhaeltnis(breite_px, hoehe_px, anpassung):
    geo = pdfx.compute_geometry(A4)
    p = pdfx.bild_platzierung(breite_px, hoehe_px, geo, anpassung)
    assert p.breite / p.hoehe == pytest.approx(breite_px / hoehe_px, rel=1e-9)


def test_einpassen_bleibt_im_endformat_und_ist_zentriert():
    geo = pdfx.compute_geometry(A4)
    p = pdfx.bild_platzierung(4000, 1000, geo, pdfx.ANPASSUNG_EINPASSEN)
    assert p.x0 == pytest.approx(geo.trim_x0)
    assert p.x0 + p.breite == pytest.approx(geo.trim_x1)
    mitte_y = (geo.trim_y0 + geo.trim_y1) / 2
    assert p.y0 + p.hoehe / 2 == pytest.approx(mitte_y)


def test_fuellen_deckt_den_ganzen_anschnitt():
    geo = pdfx.compute_geometry(A4)
    p = pdfx.bild_platzierung(4000, 1000, geo, pdfx.ANPASSUNG_FUELLEN)
    assert p.x0 <= geo.bleed_x0 + 1e-6 and p.x0 + p.breite >= geo.bleed_x1 - 1e-6
    assert p.y0 <= geo.bleed_y0 + 1e-6 and p.y0 + p.hoehe >= geo.bleed_y1 - 1e-6


def test_unbekannte_anpassung_wird_abgelehnt():
    with pytest.raises(pdfx.UngueltigeAnpassungError):
        pdfx.bild_platzierung(100, 100, pdfx.compute_geometry(A4), "strecken")


@pytest.mark.parametrize("anpassung", pdfx.ANPASSUNGEN)
def test_quadratisches_bild_bleibt_im_pdf_quadratisch(tmp_path: Path, anpassung):
    img = Image.new("RGB", (2480, 2480), (200, 0, 0))
    out = tmp_path / "quadrat.pdf"
    pdfx.export_pdfx(img, A4, out, anpassung=anpassung)
    with pikepdf.open(out) as pdf:
        _, breite_pt, hoehe_pt = preflight.platziertes_bild(pdf.pages[0])
    assert breite_pt / hoehe_pt == pytest.approx(1.0, abs=1e-3)
    erwartet_mm = pdfx.platzierte_groesse_mm(2480, 2480, A4, anpassung)
    assert breite_pt / pdfx.PT_PER_MM == pytest.approx(erwartet_mm[0], abs=0.1)


def test_preflight_misst_aufloesung_am_platzierten_bild(tmp_path: Path):
    # Querformat 3508 x 1240 px eingepasst auf A4-Breite (210 mm) = 424 dpi.
    # Die alte Rechnung gegen die volle A4-Höhe hätte 106 dpi (rot) ergeben.
    img = Image.new("RGB", (3508, 1240), (0, 90, 160))
    out = tmp_path / "quer.pdf"
    pdfx.export_pdfx(img, A4, out)
    auf = next(i for i in preflight.run_preflight(out).items if i.schluessel == "aufloesung")
    assert auf.ampel == "gruen"
    assert "424 dpi" in auf.hinweis


def test_a4_mit_2480_pixeln_gilt_als_300_dpi():
    # 2480 px / 210 mm = 299,95 dpi; angezeigt werden 300 dpi, also grün
    assert check_resolution(2480, 3508, 210, 297).ampel == "gruen"


def test_farbfilm_in_streifen_ist_nahtlos(monkeypatch):
    rng = np.random.default_rng(7)
    img = Image.fromarray((rng.random((300, 200, 4)) * 255).astype(np.uint8), "RGBA")
    ganz = np.asarray(dtf.render_farbfilm(img, 45, 22.5))
    monkeypatch.setattr(dtf, "STREIFEN_ZEILEN", 37)  # krumme Streifenhöhe
    gestreift = np.asarray(dtf.render_farbfilm(img, 45, 22.5))
    assert np.array_equal(ganz, gestreift)


@pytest.mark.parametrize("winkel", [float("nan"), float("inf")])
def test_farbfilm_lehnt_ungueltigen_winkel_ab(winkel):
    with pytest.raises(dtf.DtfParameterError):
        dtf.render_farbfilm(Image.new("RGB", (10, 10)), 45, winkel)


def _png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _hochladen(client, img: Image.Image) -> dict:
    r = client.post("/api/upload", files={"datei": ("bild.png", _png_bytes(img), "image/png")})
    assert r.status_code == 200, r.text
    return r.json()


def test_vorschau_behaelt_transparenz(client):
    # Roter Rahmen mit durchsichtiger Mitte (der Rand außen wird beim Hochladen abgeschnitten)
    img = Image.new("RGBA", (400, 300), (220, 0, 0, 255))
    img.paste((0, 0, 0, 0), (100, 100, 300, 200))
    daten = _hochladen(client, img)
    vorschau = Image.open(io.BytesIO(client.get(daten["vorschau_url"]).content))
    assert vorschau.mode == "RGBA"
    assert vorschau.getpixel((vorschau.width // 2, vorschau.height // 2))[3] == 0


def test_zu_viele_pixel_ergeben_verstaendliche_meldung(client, monkeypatch):
    from texstyle_dtf import uploads

    monkeypatch.setattr(uploads, "MAX_BILD_PIXEL", 10_000)
    r = client.post("/api/upload", files={"datei": ("gross.png", _png_bytes(Image.new("RGB", (200, 200))), "image/png")})
    assert r.status_code == 400
    assert "zu groß" in r.json()["detail"]


@pytest.mark.parametrize("winkel", ["nan", "400", "-1"])
def test_api_lehnt_ungueltigen_rasterwinkel_ab(client, winkel):
    daten = _hochladen(client, Image.new("RGB", (50, 50), (0, 0, 0)))
    r = client.post("/api/dtf-erzeugen", data={"upload_id": daten["upload_id"], "winkel_grad": winkel})
    assert r.status_code == 400
    assert "Rasterwinkel" in r.json()["detail"]


def test_aufloesungspruefung_nutzt_anpassung(client):
    daten = _hochladen(client, Image.new("RGB", (2480, 1240), (0, 0, 0)))
    felder = {"upload_id": daten["upload_id"], "format_code": "A4"}
    einpassen = client.post("/api/aufloesung-pruefen", data=felder).json()
    fuellen = client.post("/api/aufloesung-pruefen", data={**felder, "anpassung": "fuellen"}).json()
    assert einpassen["druckgroesse_mm"] == {"breite": 210.0, "hoehe": 105.0}
    assert fuellen["dpi_effektiv"] < einpassen["dpi_effektiv"]
    r = client.post("/api/aufloesung-pruefen", data={**felder, "anpassung": "strecken"})
    assert r.status_code == 400
