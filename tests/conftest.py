"""Gemeinsame Test-Fixtures.

Für die CMYK-Konvertierung wird ein echtes CMYK-ICC-Profil benötigt
(TEXSTYLE_ICC_CMYK). Ist im Testsystem keines gesetzt, wird ersatzweise das
Profil verwendet, das mit dem Ghostscript-Systempaket ausgeliefert wird
(/usr/share/color/icc/ghostscript/default_cmyk.icc). Das ist kein Download
aus dem Netz, sondern Teil der bereits installierten Ghostscript-Installation.
Im echten Betrieb muss der Betreiber weiterhin sein eigenes Farbprofil über
TEXSTYLE_ICC_CMYK einrichten (siehe README).
"""
import os

_FALLBACK_PROFILE = "/usr/share/color/icc/ghostscript/default_cmyk.icc"

if not os.environ.get("TEXSTYLE_ICC_CMYK") and os.path.isfile(_FALLBACK_PROFILE):
    os.environ["TEXSTYLE_ICC_CMYK"] = _FALLBACK_PROFILE
