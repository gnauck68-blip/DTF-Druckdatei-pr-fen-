"""Die Browser-Version (rip.js) auf einem nachgebildeten Android-Handy.

Prüft, dass der Browser dieselbe RIP-Datei liefert wie die Python-Version
(Größe, 300 dpi, sRGB-Profil, harte Kanten, Motivfläche), offline läuft und
nichts an den Server schickt. Braucht Node.js mit Playwright und Chromium;
fehlt das, wird der Test übersprungen. Chromium-Pfad optional über CHROMIUM_PFAD.
"""
import json
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw

from texstyle_dtf import formats, rip, uploads

HIER = Path(__file__).parent


def _browser_verfuegbar() -> bool:
    if not shutil.which("node"):
        return False
    try:
        subprocess.run(
            ["node", "-e", "try{require('playwright')}catch(e){require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright')}"],
            check=True, capture_output=True, timeout=30,
        )
        return True
    except (subprocess.SubprocessError, OSError):
        return False


pytestmark = pytest.mark.skipif(not _browser_verfuegbar(), reason="Node.js mit Playwright fehlt")


@pytest.fixture(scope="module")
def adresse():
    import uvicorn

    from texstyle_dtf.main import app

    if "CHROMIUM_PFAD" not in os.environ and Path("/opt/pw-browsers/chromium").exists():
        os.environ["CHROMIUM_PFAD"] = "/opt/pw-browsers/chromium"
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=8791, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.1)
    yield "http://127.0.0.1:8791/"
    server.should_exit = True
    thread.join(timeout=10)


def test_browser_liefert_dieselbe_datei_wie_python_und_laeuft_offline(adresse, tmp_path: Path):
    logo = Image.new("RGBA", (2400, 1600), (0, 0, 0, 0))
    zeichnen = ImageDraw.Draw(logo)
    zeichnen.ellipse((300, 300, 2100, 1300), fill=(200, 20, 20, 255))
    zeichnen.rectangle((900, 600, 1500, 1000), fill=(255, 255, 255, 255))
    logo = logo.resize((1500, 1000), Image.LANCZOS)  # weiche Kanten
    bild = tmp_path / "logo.png"
    logo.save(bild)

    lauf = subprocess.run(
        ["node", str(HIER / "browser" / "android.mjs"), adresse, str(bild), "A6", str(tmp_path)],
        capture_output=True, text=True, timeout=240,
    )
    assert lauf.returncode == 0, lauf.stderr
    ergebnis = json.loads(lauf.stdout.strip().splitlines()[-1])
    assert ergebnis["fehler"] == []
    assert ergebnis["apiAnfragen"] == 0  # das Bild verlässt das Gerät nicht
    assert [l["datei"] is not None for l in ergebnis["laeufe"]] == [True, True]  # online und offline

    gespeichert = uploads.save_upload(bild.read_bytes(), "image/png")
    python = rip.erzeuge_rip_datei(Image.open(gespeichert.stored_path), formats.resolve_format("A6"), tmp_path / "python.png")
    with Image.open(python.pfad) as p_datei:
        p = np.asarray(p_datei.convert("RGBA")).astype(int)
    for l in ergebnis["laeufe"]:
        with Image.open(l["datei"]) as datei:
            assert datei.format == "PNG"
            assert datei.info["icc_profile"] == rip.SRGB_PROFIL
            assert tuple(round(v) for v in datei.info["dpi"]) == (300, 300)
            assert not datei.getexif()
            b = np.asarray(datei.convert("RGBA")).astype(int)
        assert b.shape == p.shape
        assert set(np.unique(b[..., 3])) <= {0, 255}
        assert ((b[..., 3] == 255) == (p[..., 3] == 255)).mean() > 0.995
        beide = (b[..., 3] == 255) & (p[..., 3] == 255)
        assert np.abs(b[beide][:, :3] - p[beide][:, :3]).mean() < 2
