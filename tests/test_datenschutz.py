"""Datenschutz: keine Metadaten aus Fotos speichern, Arbeitsordner beim Start leeren."""
import io
import os
import time

from PIL import Image

from texstyle_dtf import uploads, workdir_cleanup


def _jpeg_mit_exif(breite: int, hoehe: int, orientation: int = 1) -> bytes:
    exif = Image.Exif()
    exif[0x013B] = "Max Mustermann"  # Artist
    exif[0x010F] = "Kamerahersteller"  # Make
    exif[0x0112] = orientation
    buf = io.BytesIO()
    Image.new("RGB", (breite, hoehe), (30, 120, 200)).save(buf, format="JPEG", exif=exif)
    return buf.getvalue()


def test_upload_speichert_keine_metadaten():
    gespeichert = uploads.save_upload(_jpeg_mit_exif(120, 80), "image/jpeg")
    roh = gespeichert.stored_path.read_bytes()
    assert gespeichert.stored_path.suffix == ".png"
    assert b"Mustermann" not in roh and b"Kamerahersteller" not in roh
    with Image.open(gespeichert.stored_path) as img:
        assert not img.getexif()
    assert b"Mustermann" not in gespeichert.preview_path.read_bytes()


def test_upload_dreht_handyfoto_nach_exif():
    # Orientation 6: Kamera hochkant gehalten, Pixel liegen quer
    gespeichert = uploads.save_upload(_jpeg_mit_exif(120, 80, orientation=6), "image/jpeg")
    assert (gespeichert.width_px, gespeichert.height_px) == (80, 120)
    with Image.open(gespeichert.stored_path) as img:
        assert img.size == (80, 120)


def test_upload_behaelt_transparenz_aus_palettenbild():
    buf = io.BytesIO()
    Image.new("P", (10, 10), 0).save(buf, format="PNG", transparency=0)
    gespeichert = uploads.save_upload(buf.getvalue(), "image/png")
    with Image.open(gespeichert.stored_path) as img:
        assert img.mode == "RGBA" and img.getpixel((0, 0))[3] == 0


def test_loeschlauf_beim_start_leert_alles_ausser_versteckten_dateien(tmp_path, monkeypatch):
    uploads_dir, outputs_dir = tmp_path / "uploads", tmp_path / "outputs"
    uploads_dir.mkdir()
    outputs_dir.mkdir()
    monkeypatch.setattr(workdir_cleanup, "UPLOAD_DIR", uploads_dir)
    monkeypatch.setattr(workdir_cleanup, "OUTPUT_DIR", outputs_dir)
    frisch = uploads_dir / "frisch.png"
    frisch.write_bytes(b"x")
    alt = outputs_dir / "alt.pdf"
    alt.write_bytes(b"x")
    zwei_tage = time.time() - 48 * 3600
    os.utime(alt, (zwei_tage, zwei_tage))
    (uploads_dir / ".gitkeep").write_bytes(b"")

    assert workdir_cleanup.run_cleanup_once() == 1  # stündlich: nur das Alte
    assert frisch.exists() and not alt.exists()
    assert workdir_cleanup.run_cleanup_once(alle=True) == 1  # beim Start: alles
    assert not frisch.exists()
    assert (uploads_dir / ".gitkeep").exists()
