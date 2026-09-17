"""TexStyle DTF – FastAPI-Anwendung.

Start (Standard, nur lokal erreichbar):
    uvicorn texstyle_dtf.main:app

Start mit Netzwerkfreigabe (bewusster Schalter, siehe Datenschutz-Vorgabe):
    python -m texstyle_dtf.main --lan
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image

from . import formats, pdfx, preflight
from .color import ICCProfileMissingError
from .config import MAX_UPLOAD_BYTES, OUTPUT_DIR, PROJECT_ROOT
from .resolution import check_resolution
from .uploads import UploadError, find_preview, find_stored_upload, save_upload
from .workdir_cleanup import cleanup_loop, run_cleanup_once

# Kein Zugriffslog mit IP-Adressen (Datenschutz-Vorgabe): der uvicorn-eigene
# Access-Logger wird deaktiviert, unabhängig davon, wie die App gestartet wird.
logging.getLogger("uvicorn.access").disabled = True

logger = logging.getLogger("texstyle_dtf")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

STATIC_DIR = PROJECT_ROOT / "texstyle_dtf" / "static"

_cleanup_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Löschlauf beim Start (Datenschutz-Vorgabe).
    run_cleanup_once()
    global _cleanup_task
    _cleanup_task = asyncio.create_task(cleanup_loop())
    try:
        yield
    finally:
        if _cleanup_task is not None:
            _cleanup_task.cancel()


app = FastAPI(title="TexStyle DTF", lifespan=lifespan)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc: Exception):
    # Nur Fehler loggen, ohne Dateinamen und ohne Nutzerdaten (Datenschutz-Vorgabe).
    logger.error("Unerwarteter Fehler bei der Verarbeitung einer Anfrage.")
    return JSONResponse(status_code=500, content={"fehler": "Es ist ein unerwarteter Fehler aufgetreten."})


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/formate")
async def formate() -> list[dict]:
    return [
        {"code": f.code, "label": f.label, "breite_mm": f.width_mm, "hoehe_mm": f.height_mm}
        for f in formats.STANDARD_FORMATS.values()
    ]


@app.post("/api/upload")
async def upload(datei: UploadFile = File(...)) -> dict:
    raw = await datei.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        max_mb = MAX_UPLOAD_BYTES / (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Die Datei ist zu groß. Erlaubt sind maximal {max_mb:.0f} MB.")
    try:
        stored = save_upload(raw, datei.content_type or "")
    except UploadError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "upload_id": stored.upload_id,
        "breite_px": stored.width_px,
        "hoehe_px": stored.height_px,
        "vorschau_url": f"/api/vorschau/{stored.upload_id}",
    }


@app.get("/api/vorschau/{upload_id}")
async def vorschau(upload_id: str) -> FileResponse:
    path = find_preview(upload_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Vorschau nicht gefunden.")
    return FileResponse(path, media_type="image/png")


@app.post("/api/aufloesung-pruefen")
async def aufloesung_pruefen(
    upload_id: str = Form(...),
    format_code: str = Form(...),
    breite_mm: float | None = Form(default=None),
    hoehe_mm: float | None = Form(default=None),
) -> dict:
    stored_path = find_stored_upload(upload_id)
    if stored_path is None:
        raise HTTPException(status_code=404, detail="Bild nicht gefunden. Bitte erneut hochladen.")

    try:
        page_format = formats.resolve_format(format_code, breite_mm, hoehe_mm)
    except formats.InvalidFormatError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    with Image.open(stored_path) as img:
        width_px, height_px = img.size

    result = check_resolution(width_px, height_px, page_format.width_mm, page_format.height_mm)

    return {
        "format": {"code": page_format.code, "label": page_format.label},
        "dpi_x": round(result.dpi_x, 1),
        "dpi_y": round(result.dpi_y, 1),
        "dpi_effektiv": round(result.dpi_effective, 1),
        "ampel": result.ampel,
        "hinweis": result.hinweis,
    }


def _is_safe_pdf_id(pdf_id: str) -> bool:
    return bool(pdf_id) and len(pdf_id) == 32 and all(c in "0123456789abcdef" for c in pdf_id)


def _preflight_report_dict(bericht: preflight.PreflightReport) -> dict:
    return {
        "gesamt_ampel": bericht.gesamt_ampel,
        "download_erlaubt": bericht.download_erlaubt,
        "punkte": [
            {"schluessel": item.schluessel, "label": item.label, "ampel": item.ampel, "hinweis": item.hinweis}
            for item in bericht.items
        ],
    }


def _pdf_pfad_oder_404(pdf_id: str) -> Path:
    if not _is_safe_pdf_id(pdf_id):
        raise HTTPException(status_code=404, detail="PDF nicht gefunden.")
    path = OUTPUT_DIR / f"{pdf_id}.pdf"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="PDF nicht gefunden. Möglicherweise wurde es bereits automatisch gelöscht.")
    return path


@app.post("/api/pdf-erzeugen")
async def pdf_erzeugen(
    upload_id: str = Form(...),
    format_code: str = Form(...),
    breite_mm: float | None = Form(default=None),
    hoehe_mm: float | None = Form(default=None),
) -> dict:
    stored_path = find_stored_upload(upload_id)
    if stored_path is None:
        raise HTTPException(status_code=404, detail="Bild nicht gefunden. Bitte erneut hochladen.")

    try:
        page_format = formats.resolve_format(format_code, breite_mm, hoehe_mm)
    except formats.InvalidFormatError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    pdf_id = uuid.uuid4().hex
    output_path = OUTPUT_DIR / f"{pdf_id}.pdf"

    try:
        with Image.open(stored_path) as img:
            result = pdfx.export_pdfx(img, page_format, output_path)
    except ICCProfileMissingError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except (pdfx.GhostscriptNotFoundError, pdfx.PdfXExportError) as exc:
        logger.error("PDF/X-Export ist fehlgeschlagen.")
        raise HTTPException(status_code=500, detail=str(exc))

    bericht = preflight.run_preflight(output_path)

    return {
        "pdf_id": pdf_id,
        "download_url": f"/api/pdf/{pdf_id}",
        "max_farbauftrag_prozent": round(result.max_ink_coverage_percent, 1),
        "icc_profil": result.profile.description,
        "trimbox_mm": {
            "breite": round((result.geometry.trim_x1 - result.geometry.trim_x0) / pdfx.PT_PER_MM, 1),
            "hoehe": round((result.geometry.trim_y1 - result.geometry.trim_y0) / pdfx.PT_PER_MM, 1),
        },
        "dateigroesse_bytes": output_path.stat().st_size,
        "preflight": _preflight_report_dict(bericht),
    }


@app.get("/api/preflight/{pdf_id}")
async def preflight_abrufen(pdf_id: str) -> dict:
    path = _pdf_pfad_oder_404(pdf_id)
    bericht = preflight.run_preflight(path)
    return _preflight_report_dict(bericht)


@app.get("/api/pdf/{pdf_id}")
async def pdf_download(pdf_id: str) -> FileResponse:
    path = _pdf_pfad_oder_404(pdf_id)

    # Preflight wird vor jedem Download erneut geprüft (Punkt 8): Bei Rot ist
    # der Download gesperrt, unabhängig davon, was das Frontend anzeigt.
    bericht = preflight.run_preflight(path)
    if not bericht.download_erlaubt:
        rote_punkte = [item.label for item in bericht.items if item.ampel == "rot"]
        raise HTTPException(
            status_code=409,
            detail=f"Download gesperrt: Preflight-Prüfung zeigt Rot bei: {', '.join(rote_punkte)}.",
        )

    return FileResponse(path, media_type="application/pdf", filename="texstyle-dtf-druckdatei.pdf")


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="TexStyle DTF starten")
    parser.add_argument(
        "--lan",
        action="store_true",
        help="App im lokalen Netzwerk freigeben (Standard: nur dieser Rechner).",
    )
    parser.add_argument("--port", type=int, default=8000, help="Port (Standard: 8000).")
    return parser.parse_args()


def main() -> None:
    import uvicorn

    args = _parse_args()
    host = "0.0.0.0" if args.lan else "127.0.0.1"

    if args.lan:
        print(
            "WARNUNG: Die App ist jetzt im lokalen Netzwerk erreichbar (--lan). "
            "Jede Person im selben Netzwerk kann Bilder hochladen und Dateien abrufen."
        )

    uvicorn.run(app, host=host, port=args.port, access_log=False)


if __name__ == "__main__":
    main()
