"""Upload-Verarbeitung: Validierung, Speicherung, Vorschau (Punkt 1)."""
from __future__ import annotations

import io
import logging
import uuid
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, UnidentifiedImageError

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


def _extension_for(content_type: str) -> str:
    return ALLOWED_UPLOAD_CONTENT_TYPES[content_type][0]


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
    ext = _extension_for(content_type)
    stored_path = UPLOAD_DIR / f"{upload_id}{ext}"
    stored_path.write_bytes(raw_bytes)

    preview_path = UPLOAD_DIR / f"{upload_id}_preview.png"
    try:
        with Image.open(stored_path) as img:
            # Transparenz behalten, sonst erscheint sie in der Vorschau schwarz
            img = img.convert("RGBA")
            img.thumbnail(PREVIEW_MAX_SIZE)
            img.save(preview_path, format="PNG")
    except OSError:
        stored_path.unlink(missing_ok=True)
        logger.error("Vorschau konnte nicht erzeugt werden.")
        raise UploadError("Aus dem Bild konnte keine Vorschau erzeugt werden.")

    return StoredUpload(
        upload_id=upload_id,
        stored_path=stored_path,
        preview_path=preview_path,
        width_px=width_px,
        height_px=height_px,
        content_type=content_type,
    )


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
