"""RIP-Datei: PNG in sRGB mit Transparenz, exakt in Druckgröße bei 300 dpi,
ohne eigene Farbumrechnung (die macht der RIP mit seinem Druckerprofil)."""
import io
import os
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from texstyle_dtf import formats, rip, uploads
from texstyle_dtf.main import app

A4 = formats.resolve_format("A4")
A6 = formats.resolve_format("A6")


def _logo(breite=1240, hoehe=620) -> Image.Image:
    bild = Image.new("RGBA", (breite, hoehe), (0, 0, 0, 0))
    ImageDraw.Draw(bild).ellipse((0, 0, breite - 1, hoehe - 1), fill=(200, 30, 30, 255))
    return bild


def test_einpassen_datei_ist_so_gross_wie_das_motiv(tmp_path: Path):
    ergebnis = rip.erzeuge_rip_datei(_logo(), A6, tmp_path / "a.png")
    assert (ergebnis.groesse.breite_mm, ergebnis.groesse.hoehe_mm) == pytest.approx((105.0, 52.5))
    with Image.open(ergebnis.pfad) as datei:
        assert datei.size == (1240, 620)


def test_fuellen_datei_ist_genau_das_format(tmp_path: Path):
    ergebnis = rip.erzeuge_rip_datei(_logo(), A6, tmp_path / "f.png", anpassung=rip.ANPASSUNG_FUELLEN)
    with Image.open(ergebnis.pfad) as datei:
        assert datei.size == (1240, 1748)  # 105 x 148 mm bei 300 dpi


def test_datei_ist_srgb_png_mit_300_dpi_und_transparenz(tmp_path: Path):
    ergebnis = rip.erzeuge_rip_datei(_logo(), A6, tmp_path / "d.png")
    with Image.open(ergebnis.pfad) as datei:
        assert datei.format == "PNG" and datei.mode == "RGBA"
        assert datei.info["icc_profile"] == rip.SRGB_PROFIL
        assert tuple(round(v) for v in datei.info["dpi"]) == (300, 300)
        assert datei.getpixel((0, 0))[3] == 0  # Ecke außerhalb der Ellipse
    assert ergebnis.bericht.download_erlaubt


def test_farben_werden_nicht_umgerechnet(tmp_path: Path):
    # Keine eigene Farbumrechnung: RGB-Werte bleiben (bis auf Rundung beim Skalieren) gleich
    bild = Image.new("RGB", (1240, 1748), (12, 170, 90))
    ergebnis = rip.erzeuge_rip_datei(bild, A6, tmp_path / "c.png")
    with Image.open(ergebnis.pfad) as datei:
        assert datei.getpixel((600, 800)) == (12, 170, 90)


def test_kanten_werden_gehaertet_oder_bleiben_weich(tmp_path: Path):
    weich = _logo().resize((620, 310), Image.LANCZOS)
    hart = rip.erzeuge_rip_datei(weich, A6, tmp_path / "h.png")
    offen = rip.erzeuge_rip_datei(weich, A6, tmp_path / "w.png", kanten_haerten=False)
    with Image.open(hart.pfad) as datei:
        assert set(np.unique(np.asarray(datei.getchannel("A")))) <= {0, 255}
    with Image.open(offen.pfad) as datei:
        assert len(np.unique(np.asarray(datei.getchannel("A")))) > 2


def test_skalierung_ohne_dunklen_saum(tmp_path: Path):
    # Weißes Motiv auf durchsichtigem Grund: ohne vormultiplizierte Skalierung
    # würden die Kantenpixel grau (Mischung mit dem Schwarz der durchsichtigen Pixel)
    bild = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
    ImageDraw.Draw(bild).rectangle((100, 100, 299, 299), fill=(255, 255, 255, 255))
    ergebnis = rip.erzeuge_rip_datei(bild, A6, tmp_path / "s.png", kanten_haerten=False)
    arr = np.asarray(Image.open(ergebnis.pfad))
    sichtbar = arr[arr[..., 3] > 0]
    assert sichtbar[..., :3].min() >= 250


def test_kein_durchsichtiger_hintergrund_gibt_hinweis(tmp_path: Path):
    ergebnis = rip.erzeuge_rip_datei(Image.new("RGB", (1240, 1748), "white"), A6, tmp_path / "j.png")
    hintergrund = next(p for p in ergebnis.bericht.items if p.schluessel == "hintergrund")
    assert hintergrund.ampel == "gelb"


def test_zu_grosse_ausgabe_wird_abgelehnt(tmp_path: Path):
    riesig = formats.resolve_format("CUSTOM", 3000, 3000)
    with pytest.raises(rip.RipFehler):
        rip.erzeuge_rip_datei(Image.new("RGB", (100, 100)), riesig, tmp_path / "r.png")


def test_upload_schneidet_leeren_rand_ab():
    bild = Image.new("RGBA", (500, 400), (0, 0, 0, 0))
    bild.paste((0, 0, 255, 255), (100, 50, 300, 250))
    buf = io.BytesIO()
    bild.save(buf, format="PNG")
    gespeichert = uploads.save_upload(buf.getvalue(), "image/png")
    assert gespeichert.rand_entfernt
    assert (gespeichert.width_px, gespeichert.height_px) == (204, 204)  # 200 px + 2 px Sicherheitsrand


def test_upload_rechnet_cmyk_jpeg_mit_profil_nach_srgb():
    profil = os.environ.get("TEXSTYLE_ICC_CMYK", "")
    if not os.path.isfile(profil):
        pytest.skip("kein CMYK-Profil im Testsystem")
    cmyk = Image.new("CMYK", (50, 50), (0, 0, 0, 0))  # kein Farbauftrag = Papierweiß
    buf = io.BytesIO()
    cmyk.save(buf, format="JPEG", icc_profile=Path(profil).read_bytes(), quality=100)
    gespeichert = uploads.save_upload(buf.getvalue(), "image/jpeg")
    with Image.open(gespeichert.stored_path) as img:
        assert img.mode == "RGB"
        assert min(img.getpixel((25, 25))) >= 245  # weiß, nicht schwarz oder verfärbt


def test_api_rip_datei_und_download_sperre():
    with TestClient(app) as client:
        buf = io.BytesIO()
        _logo(300, 150).save(buf, format="PNG")
        upload = client.post("/api/upload", files={"datei": ("l.png", buf.getvalue(), "image/png")}).json()

        # 300 px auf A4-Breite = 36 dpi: Stopp, Download gesperrt
        rot = client.post("/api/rip-datei-erzeugen", data={"upload_id": upload["upload_id"], "format_code": "A4"}).json()
        assert rot["preflight"]["gesamt_ampel"] == "rot"
        assert client.get(rot["download_url"]).status_code == 409

        # Eigene Größe 25 x 25 mm: gut genug, Download frei
        felder = {"upload_id": upload["upload_id"], "format_code": "CUSTOM", "breite_mm": "25", "hoehe_mm": "25"}
        gut = client.post("/api/rip-datei-erzeugen", data=felder).json()
        assert gut["preflight"]["download_erlaubt"]
        antwort = client.get(gut["download_url"])
        assert antwort.status_code == 200 and antwort.headers["content-type"] == "image/png"
