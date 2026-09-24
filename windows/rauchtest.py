"""Selbsttest für das Windows-Paket.

Läuft mit dem mitgelieferten Python und Ghostscript, genau wie die
Startdatei die App startet. Prüft: Ghostscript wird gefunden, ein Druck-PDF
entsteht und besteht den Preflight, das DTF-Modul rechnet, und der Server
liefert die Oberfläche aus. Bricht bei jedem Fehler mit Exit-Code 1 ab.

Aufruf (aus dem Paketordner):
    set TEXSTYLE_GS=...\\programm\\ghostscript\\bin\\gswin64c.exe
    set TEXSTYLE_ICC_CMYK=...\\irgendein-cmyk-profil.icc
    programm\\python\\python.exe rauchtest.py
"""
import json
import os
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw


def main() -> int:
    from texstyle_dtf import dtf, formats, pdfx, preflight

    print("Ghostscript:", pdfx.GS_BINARY)
    if not pdfx.GS_BINARY or not os.path.isfile(pdfx.GS_BINARY):
        print("FEHLER: Ghostscript nicht gefunden (TEXSTYLE_GS prüfen).")
        return 1

    # A6 bei 300 dpi, rundes Logo auf transparentem Grund
    bild = Image.new("RGBA", (1240, 1748), (0, 0, 0, 0))
    ImageDraw.Draw(bild).ellipse((120, 300, 1120, 1300), fill=(200, 20, 20, 255))

    with tempfile.TemporaryDirectory() as tmp:
        pdf_pfad = Path(tmp) / "rauchtest.pdf"
        pdfx.export_pdfx(bild, formats.resolve_format("A6"), pdf_pfad)
        bericht = preflight.run_preflight(pdf_pfad)
        for punkt in bericht.items:
            print(f"  {punkt.ampel:5} {punkt.label}: {punkt.hinweis}")
        if not bericht.download_erlaubt:
            print("FEHLER: Preflight sperrt das Test-PDF.")
            return 1

        ergebnis = dtf.export_dtf(bild, Path(tmp), "rauchtest", 45, 22.5, 240)
        print("DTF-Film:", ergebnis.breite_px, "x", ergebnis.hoehe_px, "Pixel")

    import uvicorn

    from texstyle_dtf.main import app

    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=8799, log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.1)
    try:
        seite = urllib.request.urlopen("http://127.0.0.1:8799/", timeout=10).read().decode("utf-8")
        formate = json.loads(urllib.request.urlopen("http://127.0.0.1:8799/api/formate", timeout=10).read())
    finally:
        server.should_exit = True
        thread.join(timeout=10)
    if "TexStyle DTF" not in seite or len(formate) != 4:
        print("FEHLER: Server liefert nicht die erwartete Oberfläche.")
        return 1

    print("RAUCHTEST OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
