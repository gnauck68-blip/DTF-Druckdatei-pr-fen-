"""Werkzeuge für Fachkräfte (Funktionen aus dem Texstyle DTF Studio) im Browser.

Spielt tests/browser/werkzeuge.mjs durch und prüft die gespeicherten Dateien:
Freistell-Verfahren, Spiegeln, 600 dpi, PDF, Raster, Tonwerte, Weißmaske,
SVG, Zuschnitt mit Rückgängig, Zuschnitt-Dialog, Sammelbogen und Projekt
speichern/öffnen. Braucht Node.js mit Playwright und Chromium wie
tests/test_browser.py; fehlt das, wird der Test übersprungen.
"""
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw

from texstyle_dtf import rip
from tests.test_browser import HIER, _browser_verfuegbar, adresse  # noqa: F401  (Fixture)



def _testbild(pfad: Path) -> None:
    """Weißer Grund, schwarzer Ring mit weißem Loch links, rotes Quadrat rechts."""
    bild = Image.new("RGB", (600, 400), (255, 255, 255))
    z = ImageDraw.Draw(bild)
    z.ellipse((80, 80, 320, 320), fill=(0, 0, 0))
    z.ellipse((140, 140, 260, 260), fill=(255, 255, 255))
    z.rectangle((420, 140, 540, 260), fill=(220, 20, 20))
    bild.save(pfad)


def _rgba(pfad: str) -> np.ndarray:
    with Image.open(pfad) as b:
        return np.asarray(b.convert("RGBA")).astype(int)


def _loch_alpha(a: np.ndarray) -> int:
    """Alpha in der Mitte des Rings (dort ist im Original das weiße Loch)."""
    schwarz = (a[..., 3] == 255) & (a[..., :3].max(axis=2) < 60)
    ys, xs = np.nonzero(schwarz)
    return int(a[(ys.min() + ys.max()) // 2, (xs.min() + xs.max()) // 2, 3])


def _rot_x(a: np.ndarray) -> float:
    rot = (a[..., 3] == 255) & (a[..., 0] > 150) & (a[..., 1] < 80)
    return float(np.nonzero(rot)[1].mean())


def _schwarz_x(a: np.ndarray) -> float:
    return float(np.nonzero((a[..., 3] == 255) & (a[..., :3].max(axis=2) < 60))[1].mean())


@pytest.mark.skipif(not _browser_verfuegbar(), reason="Node.js mit Playwright fehlt")
def test_werkzeuge_fuer_fachkraefte(adresse, tmp_path: Path):  # noqa: F811
    bild = tmp_path / "ring.png"
    _testbild(bild)
    lauf = subprocess.run(
        ["node", str(HIER / "browser" / "werkzeuge.mjs"), adresse, str(bild), str(tmp_path)],
        capture_output=True, text=True, timeout=300,
    )
    assert lauf.returncode == 0, lauf.stderr
    e = json.loads(lauf.stdout.strip().splitlines()[-1])
    d, t = e["dateien"], e["texte"]
    assert e["fehler"] == []
    assert e["apiAnfragen"] == 0  # alles bleibt auf dem Gerät

    # Standard: Hintergrund am Rand weg, weißes Loch im Ring bleibt (Innenfläche)
    standard = _rgba(d["standard.png"])
    with Image.open(d["standard.png"]) as datei:
        assert datei.info["icc_profile"] == rip.SRGB_PROFIL
        assert tuple(round(v) for v in datei.info["dpi"]) == (300, 300)
        assert datei.width == 945  # 8 cm bei 300 dpi
    assert standard[0, 0, 3] == 0
    assert _loch_alpha(standard) == 255

    # „Überall im Bild“ entfernt auch das Loch
    ueberall = _rgba(d["ueberall.png"])
    assert _loch_alpha(ueberall) == 0

    # Spiegeln: das rote Quadrat liegt jetzt links vom Ring
    assert _rot_x(standard) > _schwarz_x(standard)
    gespiegelt = _rgba(d["gespiegelt.png"])
    assert _rot_x(gespiegelt) < _schwarz_x(gespiegelt)
    assert "Gespiegelt" in t["gespiegelt.png"]

    # 600 dpi: doppelte Pixelzahl, 600 dpi im PNG, sRGB-Profil
    with Image.open(d["600dpi.png"]) as datei:
        assert datei.width == 1890
        assert tuple(round(v) for v in datei.info["dpi"]) == (600, 600)
        assert datei.info["icc_profile"] == rip.SRGB_PROFIL

    assert Path(d["datei.pdf"]).read_bytes().startswith(b"%PDF-1.4")
    assert "Raster" in t["raster.png"]
    assert set(np.unique(_rgba(d["raster.png"])[..., 3])) <= {0, 255}

    # Helligkeit -60: das Rot wird dunkler
    dunkler = _rgba(d["dunkler.png"])
    rot = (standard[..., 3] == 255) & (standard[..., 0] > 150) & (standard[..., 1] < 80)
    assert dunkler[rot][:, 0].mean() < standard[rot][:, 0].mean() - 30

    # Weißmaske: dieselbe Fläche, nur weiß
    maske = _rgba(d["maske.png"])
    assert maske.shape == standard.shape
    assert (maske[maske[..., 3] > 0][:, :3] == 255).all()
    assert "<path" in Path(d["konturen.svg"]).read_text()

    # Zuschnitt 20 % links und rechts, dann Rückgängig
    assert t["nachZuschnitt"] != t["vorZuschnitt"]
    assert t["nachRueckgaengig"] == t["vorZuschnitt"]
    # Zuschnitt-Dialog: nur der Ring bleibt, kein Rot mehr
    assert t["nachDialog"] != t["vorZuschnitt"]
    ausschnitt = _rgba(d["ausschnitt.png"])
    assert not ((ausschnitt[..., 3] == 255) & (ausschnitt[..., 0] > 150) & (ausschnitt[..., 1] < 80)).any()

    # Sammelbogen: 20 cm breit, 300 dpi, sRGB, drei Motive
    assert "3 Motive" in t["bogen"]
    with Image.open(d["bogen.png"]) as datei:
        assert datei.width == 2362
        assert datei.info["icc_profile"] == rip.SRGB_PROFIL

    # Projekt öffnen liefert dieselbe Datei wie beim Speichern (überall + gespiegelt)
    assert (np.abs(_rgba(d["aus-projekt.png"]) - gespiegelt) <= 1).all()

    # Schriftmodus am Testmotiv
    assert _rgba(d["schrift.png"])[..., 3].min() == 0


@pytest.mark.skipif(not shutil.which("node"), reason="Node.js fehlt")
def test_studio_engine_ist_aktuell():
    """studio-engine.js muss aus studio/dist neu gebaut sein."""
    lauf = subprocess.run(["node", str(HIER.parent / "scripts" / "studio-engine-bauen.mjs"), "--pruefen"],
                          capture_output=True, text=True, timeout=60)
    assert lauf.returncode == 0, lauf.stderr
