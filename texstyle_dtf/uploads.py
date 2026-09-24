"""Upload-Verarbeitung: Validierung, Speicherung, Vorschau (Punkt 1)."""
from __future__ import annotations

import io
import logging
import uuid
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError

from .config import ALLOWED_UPLOAD_CONTENT_TYPES, MAX_BILD_PIXEL, MAX_UPLOAD_BYTES, UPLOAD_DIR

logger = logging.getLogger("texstyle_dtf")

PREVIEW_MAX_SIZE = (600, 600)

# Pillow bricht über dieser Grenze selbst ab (DecompressionBombError); die
# eigentliche Prüfung mit verständlicher Meldung steht in save_upload().
Image.MAX_IMAGE_PIXELS = MAX_BILD_PIXEL


class UploadError(ValueError):
    """Fachlicher Fehler bei der Bildannahme, wird als Klartext angezeigt."""


@dataclass(frozen=True)
class StoredUpload:
    upload_id: str
    stored_path: Path
    preview_path: Path
    width_px: int
    height_px: int
    content_type: str
    rand_entfernt: bool = False


def save_upload(raw_bytes: bytes, declared_content_type: str) -> StoredUpload:
    """Prüft und speichert ein hochgeladenes Bild.

    Wirft UploadError mit einer für Werkstattmitarbeitende verständlichen
    Meldung, wenn das Bild nicht angenommen werden kann.
    """
    if len(raw_bytes) == 0:
        raise UploadError("Die Datei ist leer.")

    if len(raw_bytes) > MAX_UPLOAD_BYTES:
        max_mb = MAX_UPLOAD_BYTES / (1024 * 1024)
        raise UploadError(f"Die Datei ist zu groß. Erlaubt sind maximal {max_mb:.0f} MB.")

    # Nicht blind auf den vom Browser gemeldeten Content-Type verlassen:
    # Das Bild wird tatsächlich geöffnet und geprüft.
    try:
        with Image.open(io.BytesIO(raw_bytes)) as probe:
            probe.verify()
        with Image.open(io.BytesIO(raw_bytes)) as img:
            real_format = img.format  # z. B. "JPEG", "PNG", "WEBP"
            width_px, height_px = img.size
    except Image.DecompressionBombError:
        raise _zu_viele_pixel()
    except (UnidentifiedImageError, OSError):
        raise UploadError(
            "Die Datei konnte nicht als Bild gelesen werden. Erlaubt sind JPG, PNG und WebP."
        )
    if width_px * height_px > MAX_BILD_PIXEL:
        raise _zu_viele_pixel()

    format_to_content_type = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
    content_type = format_to_content_type.get(real_format or "")
    if content_type is None or content_type not in ALLOWED_UPLOAD_CONTENT_TYPES:
        raise UploadError("Dieses Bildformat wird nicht unterstützt. Erlaubt sind JPG, PNG und WebP.")

    upload_id = uuid.uuid4().hex
    # Gespeichert werden nur die Bildpunkte als PNG, nie die Originaldatei:
    # Metadaten wie GPS-Ort, Kamera oder Name des Fotografen (EXIF, XMP, IPTC)
    # werden für den Druck nicht gebraucht und landen so gar nicht erst auf der
    # Platte (DSGVO Art. 5 Abs. 1 lit. c, Datenminimierung). PNG ist verlustfrei,
    # die Bildqualität bleibt genau so, wie die App das Bild ohnehin liest.
    stored_path = UPLOAD_DIR / f"{upload_id}.png"
    preview_path = UPLOAD_DIR / f"{upload_id}_preview.png"
    try:
        with Image.open(io.BytesIO(raw_bytes)) as original:
            # Handyfotos stehen oft nur per EXIF-Angabe aufrecht; vor dem
            # Verwerfen der Metadaten die Drehung auf die Pixel anwenden.
            eigenes_profil = original.info.get("icc_profile")
            bild = ImageOps.exif_transpose(original)
            bild = _nach_srgb(bild, eigenes_profil)
            bild, rand_entfernt = _leeren_rand_abschneiden(bild)
            bild.info = {}
            bild.save(stored_path, format="PNG")
            width_px, height_px = bild.size

            # Transparenz behalten, sonst erscheint sie in der Vorschau schwarz
            vorschau = bild.convert("RGBA")
            vorschau.thumbnail(PREVIEW_MAX_SIZE)
            vorschau.save(preview_path, format="PNG")
    except OSError:
        stored_path.unlink(missing_ok=True)
        preview_path.unlink(missing_ok=True)
        logger.error("Hochgeladenes Bild konnte nicht gespeichert werden.")
        raise UploadError("Das Bild konnte nicht verarbeitet werden. Bitte ein anderes Bild versuchen.")

    return StoredUpload(
        upload_id=upload_id,
        stored_path=stored_path,
        preview_path=preview_path,
        width_px=width_px,
        height_px=height_px,
        content_type=content_type,
        rand_entfernt=rand_entfernt,
    )


_SRGB = ImageCms.createProfile("sRGB")

# Alpha bis zu diesem Wert zählt beim Zuschneiden als leer (unsichtbare Reste)
_LEER_ALPHA = 16


def _nach_srgb(bild: Image.Image, eigenes_profil: bytes | None) -> Image.Image:
    """Liefert RGB bzw. RGBA in sRGB.

    Die App gibt sRGB an den RIP weiter, der mit seinem Druckerprofil umrechnet.
    Hat das Bild ein eigenes Profil (z. B. Adobe RGB oder ein CMYK-JPEG), werden
    die Farben darum hier farbrichtig nach sRGB umgerechnet. Ohne Profil gilt,
    wie im Web üblich, sRGB.
    """
    transparent = _hat_transparenz(bild)
    ziel_modus = "RGBA" if transparent else "RGB"
    if eigenes_profil:
        try:
            alpha = bild.convert("RGBA").getchannel("A") if transparent else None
            if bild.mode in ("L", "LA", "I;16", "I"):
                basis = bild.convert("L")
            elif bild.mode == "CMYK":
                basis = bild
            else:
                basis = bild.convert("RGB")
            umrechnung = ImageCms.buildTransform(
                ImageCms.ImageCmsProfile(io.BytesIO(eigenes_profil)),
                _SRGB,
                basis.mode,
                "RGB",
                renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
                flags=ImageCms.Flags.BLACKPOINTCOMPENSATION,
            )
            ergebnis = ImageCms.applyTransform(basis, umrechnung)
            if alpha is not None:
                ergebnis.putalpha(alpha)
            return ergebnis
        except (ImageCms.PyCMSError, OSError, ValueError):
            logger.error("Eingebettetes Farbprofil ist unbrauchbar; das Bild wird als sRGB behandelt.")
    return bild.convert(ziel_modus)


def _leeren_rand_abschneiden(bild: Image.Image) -> tuple[Image.Image, bool]:
    """Schneidet durchsichtige Ränder ab (mit 2 px Sicherheitsrand).

    Leerer Rand kostet im DTF-Druck Folie und verfälscht die Druckgröße.
    """
    if bild.mode != "RGBA":
        return bild, False
    sichtbar = bild.getchannel("A").point(lambda a: 255 if a > _LEER_ALPHA else 0)
    kasten = sichtbar.getbbox()
    if kasten is None:
        return bild, False  # ganz durchsichtig: nichts zu schneiden
    links, oben, rechts, unten = kasten
    kasten = (max(0, links - 2), max(0, oben - 2), min(bild.width, rechts + 2), min(bild.height, unten + 2))
    if kasten == (0, 0, bild.width, bild.height):
        return bild, False
    return bild.crop(kasten), True


def _hat_transparenz(bild: Image.Image) -> bool:
    return bild.mode in ("RGBA", "LA", "PA", "La", "RGBa") or (bild.mode == "P" and "transparency" in bild.info)


def _zu_viele_pixel() -> UploadError:
    return UploadError(
        f"Das Bild ist zu groß. Erlaubt sind höchstens {MAX_BILD_PIXEL // 1_000_000} Millionen Pixel."
    )


def find_stored_upload(upload_id: str) -> Path | None:
    """Findet die gespeicherte Originaldatei zu einer Upload-ID (sicher gegen Path-Traversal)."""
    if not _is_safe_id(upload_id):
        return None
    for content_type, exts in ALLOWED_UPLOAD_CONTENT_TYPES.items():
        for ext in exts:
            candidate = UPLOAD_DIR / f"{upload_id}{ext}"
            if candidate.exists():
                return candidate
    return None


def find_preview(upload_id: str) -> Path | None:
    if not _is_safe_id(upload_id):
        return None
    candidate = UPLOAD_DIR / f"{upload_id}_preview.png"
    return candidate if candidate.exists() else None


def _is_safe_id(upload_id: str) -> bool:
    return bool(upload_id) and len(upload_id) == 32 and all(c in "0123456789abcdef" for c in upload_id)
