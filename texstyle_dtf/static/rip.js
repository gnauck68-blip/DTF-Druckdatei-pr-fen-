/*
 * TexStyle DTF: Datei für den RIP, komplett im Browser gerechnet.
 *
 * Gleiche Regeln wie texstyle_dtf/rip.py (Python), damit Windows, Android-Tablet
 * und Handy dieselbe Datei liefern:
 *   - PNG in RGB mit eingebettetem sRGB-Profil (byte-gleich zur Python-Version),
 *   - Transparenz bleibt, leerer durchsichtiger Rand wird abgeschnitten,
 *   - exakt in Druckgröße bei 300 dpi (pHYs),
 *   - keine CMYK-Umrechnung, kein Raster, keine Weißplatte: das macht der RIP
 *     mit seinem hinterlegten Druckerprofil.
 * Das Bild verlässt das Gerät nie. Der Browser wendet beim Laden die
 * EXIF-Drehung an, rechnet eingebettete Farbprofile nach sRGB um und verwirft
 * alle Metadaten (GPS, Kamera, Name).
 */
(function (global) {
  'use strict';

  const DPI = 300;
  const MM_PRO_ZOLL = 25.4;
  const DPI_ROT = 150;               // wie config.DPI_ERROR_THRESHOLD
  const DPI_GELB = 300;              // wie config.DPI_WARN_THRESHOLD
  const MAX_DATEI_BYTES = 50 * 1024 * 1024;
  const MAX_BILD_PIXEL = 100000000;
  const MAX_AUSGABE_PIXEL = 150000000;
  const LEER_ALPHA = 16;             // Alpha bis hier zählt beim Zuschneiden als leer
  const HALBTRANSPARENZ_HINWEIS = 0.005;
  const FORMATE = {
    A6: { breite: 105, hoehe: 148 },
    A5: { breite: 148, hoehe: 210 },
    A4: { breite: 210, hoehe: 297 },
    A3: { breite: 297, hoehe: 420 },
  };
  // iCCP-Block mit dem sRGB-Profil aus texstyle_dtf/srgb.icc, genau wie ihn die Python-Version schreibt
  const ICCP_SRGB = 'AAABdmlDQ1BJQ0MgUHJvZmlsZQAAeJx1kT1Lw1AUhh+rUr8ddBB16FDFQUEUxFHr4FKk1ApWXdo0aYU2DUmKFFfBxUFwEF38GvwHugquCoKgCCLOjn4tUuK5VmiResPNeXjvfQ8nb8AXzmo5p2EKcqZrR2dDgcX4UsD/QjM9dDBKX0JzrOlIJMy/6/OOOlVvR1Sv/+/VXK0p3dGgrkl4QrNsV1imIbzmWoq3hLu1TCIlfCg8bMuAwldKT5b5WXG6zO+K7Vh0BnyqZyBdxckq1jJ2TnhIOJjLFrTfedSXtOnmwrzUXtn9OESZJUSAJAVWyeIyItWUzGr7Rn98c+TFo8nboogtjjQZ8Q6LWpCuulRDdF2eLEWV+988HWN8rNy9LQSNT573NgD+HShte97XkeeVjqH+ES7Mij8vOU1+iL5d0YIH0LkBZ5cVLbkL55vQ82Al7MSPVC/bZxjwegrtcei6gZblcla/55zcQ2xdftE17O3DoNzvXPkGQtRoKKffvQU=';

  class RipFehler extends Error {}

  function leinwand(breite, hoehe) {
    const c = document.createElement('canvas');
    c.width = breite; c.height = hoehe;
    return c;
  }

  // ---------- Bild laden ----------
  async function ladeBild(datei) {
    if (datei.size > MAX_DATEI_BYTES) throw new RipFehler('Die Datei ist zu groß. Erlaubt sind maximal 50 MB.');
    if (!/^image\/(png|jpeg|webp)$/.test(datei.type) && !/\.(png|jpe?g|webp)$/i.test(datei.name || '')) {
      throw new RipFehler('Dieses Bildformat wird nicht unterstützt. Erlaubt sind JPG, PNG und WebP.');
    }
    let bmp;
    try {
      bmp = await createImageBitmap(datei, { imageOrientation: 'from-image', premultiplyAlpha: 'none', colorSpaceConversion: 'default' });
    } catch (e) {
      try { bmp = await createImageBitmap(datei); } catch (e2) {
        throw new RipFehler('Die Datei konnte nicht als Bild gelesen werden. Erlaubt sind JPG, PNG und WebP.');
      }
    }
    if (bmp.width * bmp.height > MAX_BILD_PIXEL) {
      bmp.close && bmp.close();
      throw new RipFehler('Das Bild ist zu groß. Erlaubt sind höchstens 100 Millionen Pixel.');
    }
    const c = leinwand(bmp.width, bmp.height);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    bmp.close && bmp.close();
    let daten;
    try { daten = ctx.getImageData(0, 0, c.width, c.height).data; }
    catch (e) { throw new RipFehler('Das Bild ist zu groß für dieses Gerät.'); }

    // Sichtbaren Bereich suchen (Alpha > 16), wie uploads._leeren_rand_abschneiden
    let links = c.width, oben = c.height, rechts = -1, unten = -1, transparent = false;
    for (let y = 0; y < c.height; y++) {
      const zeile = y * c.width * 4;
      for (let x = 0; x < c.width; x++) {
        const a = daten[zeile + x * 4 + 3];
        if (a < 255) transparent = true;
        if (a > LEER_ALPHA) {
          if (x < links) links = x;
          if (x > rechts) rechts = x;
          if (y < oben) oben = y;
          if (y > unten) unten = y;
        }
      }
    }
    let bild = c, randEntfernt = false;
    if (transparent && rechts >= 0) {
      const l = Math.max(0, links - 2), o = Math.max(0, oben - 2);
      const r = Math.min(c.width, rechts + 1 + 2), u = Math.min(c.height, unten + 1 + 2);
      if (l > 0 || o > 0 || r < c.width || u < c.height) {
        bild = leinwand(r - l, u - o);
        bild.getContext('2d').drawImage(c, l, o, r - l, u - o, 0, 0, r - l, u - o);
        randEntfernt = true;
      }
    }
    return { leinwand: bild, breite: bild.width, hoehe: bild.height, randEntfernt, transparent };
  }

  function vorschau(bild, maxKante) {
    const f = Math.min(1, maxKante / Math.max(bild.width, bild.height));
    const c = leinwand(Math.max(1, Math.round(bild.width * f)), Math.max(1, Math.round(bild.height * f)));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bild, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }

  // ---------- Größe und Auflösung (wie rip.druckgroesse / resolution.check_resolution) ----------
  function format(code, breiteMm, hoeheMm) {
    if (code === 'CUSTOM') {
      const b = Number(breiteMm), h = Number(hoeheMm);
      if (!(b >= 10 && b <= 3000 && h >= 10 && h <= 3000)) throw new RipFehler('Breite und Höhe müssen zwischen 10 und 3000 mm liegen.');
      return { breite: b, hoehe: h };
    }
    if (!FORMATE[code]) throw new RipFehler('Unbekanntes Format.');
    return FORMATE[code];
  }

  function druckgroesse(breitePx, hoehePx, fmt, anpassung) {
    let skala;
    if (anpassung === 'einpassen') skala = Math.min(fmt.breite / breitePx, fmt.hoehe / hoehePx);
    else if (anpassung === 'fuellen') skala = Math.max(fmt.breite / breitePx, fmt.hoehe / hoehePx);
    else throw new RipFehler('Unbekannte Einstellung: Bild einpassen oder Fläche füllen wählen.');
    const motivB = breitePx * skala, motivH = hoehePx * skala;
    const druckB = anpassung === 'fuellen' ? fmt.breite : motivB;
    const druckH = anpassung === 'fuellen' ? fmt.hoehe : motivH;
    return {
      breiteMm: druckB, hoeheMm: druckH,
      breitePx: Math.max(1, pyRound(druckB / MM_PRO_ZOLL * DPI)),
      hoehePx: Math.max(1, pyRound(druckH / MM_PRO_ZOLL * DPI)),
      motivBreiteMm: motivB, motivHoeheMm: motivH,
    };
  }

  // Python rundet halbe Werte zur geraden Zahl; gleich runden, damit die Pixelmaße übereinstimmen
  function pyRound(v) {
    const f = Math.floor(v), rest = v - f;
    if (Math.abs(rest - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
    return Math.round(v);
  }

  function aufloesung(breitePx, hoehePx, breiteMm, hoeheMm) {
    const dpi = Math.min(breitePx / (breiteMm / MM_PRO_ZOLL), hoehePx / (hoeheMm / MM_PRO_ZOLL));
    const gerundet = pyRound(dpi);
    let ampel, hinweis;
    if (gerundet < DPI_ROT) {
      ampel = 'rot';
      hinweis = 'Auflösung zu niedrig: ' + gerundet + ' dpi in dieser Druckgröße. Unter ' + DPI_ROT + ' dpi ist der Druck deutlich unscharf.';
    } else if (gerundet < DPI_GELB) {
      ampel = 'gelb';
      hinweis = 'Auflösung grenzwertig: ' + gerundet + ' dpi in dieser Druckgröße. Empfohlen sind mindestens ' + DPI_GELB + ' dpi.';
    } else {
      ampel = 'gruen';
      hinweis = 'Auflösung ausreichend: ' + gerundet + ' dpi in dieser Druckgröße.';
    }
    return { dpi, ampel, hinweis };
  }

  function pruefeGroesse(bild, code, breiteMm, hoeheMm, anpassung) {
    const g = druckgroesse(bild.breite, bild.hoehe, format(code, breiteMm, hoeheMm), anpassung);
    return { groesse: g, aufloesung: aufloesung(bild.breite, bild.hoehe, g.motivBreiteMm, g.motivHoeheMm) };
  }

  // ---------- Skalieren ----------
  // Stark verkleinern in Halbierungsschritten: vermeidet Treppen und Flimmern.
  // Die Leinwand rechnet intern mit vormultiplizierter Transparenz, darum
  // entstehen an durchsichtigen Kanten keine dunklen Säume.
  function skaliert(quelle, breite, hoehe) {
    let aktuell = quelle;
    while (aktuell.width / 2 >= breite && aktuell.height / 2 >= hoehe) {
      const halb = leinwand(Math.ceil(aktuell.width / 2), Math.ceil(aktuell.height / 2));
      const hctx = halb.getContext('2d');
      hctx.imageSmoothingQuality = 'high';
      hctx.drawImage(aktuell, 0, 0, halb.width, halb.height);
      aktuell = halb;
    }
    return aktuell;
  }

  // ---------- PNG-Blöcke: sRGB-Profil und 300 dpi eintragen ----------
  const CRC_TABELLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABELLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function block(typ, inhalt) {
    const b = new Uint8Array(12 + inhalt.length);
    const dv = new DataView(b.buffer);
    dv.setUint32(0, inhalt.length);
    for (let i = 0; i < 4; i++) b[4 + i] = typ.charCodeAt(i);
    b.set(inhalt, 8);
    dv.setUint32(8 + inhalt.length, crc32(b.subarray(4, 8 + inhalt.length)));
    return b;
  }
  function base64Bytes(text) {
    const s = atob(text), b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }
  function pngMitProfilUndDpi(png) {
    const signatur = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (png[i] !== signatur[i]) throw new RipFehler('Die PNG-Datei konnte nicht erzeugt werden.');
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const teile = [png.subarray(0, 8)];
    const ppm = pyRound(DPI / 0.0254); // 11811 Pixel pro Meter, wie Pillow
    const phys = new Uint8Array(9);
    new DataView(phys.buffer).setUint32(0, ppm);
    new DataView(phys.buffer).setUint32(4, ppm);
    phys[8] = 1;
    let pos = 8;
    while (pos < png.length) {
      const laenge = dv.getUint32(pos);
      const typ = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
      const ende = pos + 12 + laenge;
      // Eigene Farb- und Auflösungsangaben des Browsers ersetzen
      if (!['iCCP', 'sRGB', 'gAMA', 'cHRM', 'pHYs'].includes(typ)) teile.push(png.subarray(pos, ende));
      if (typ === 'IHDR') { teile.push(base64Bytes(ICCP_SRGB)); teile.push(block('pHYs', phys)); }
      pos = ende;
      if (typ === 'IEND') break;
    }
    const gesamt = new Uint8Array(teile.reduce((s, t) => s + t.length, 0));
    let o = 0;
    for (const t of teile) { gesamt.set(t, o); o += t.length; }
    return gesamt;
  }

  // ---------- RIP-Datei erzeugen ----------
  async function erzeugeRipDatei(bild, code, breiteMm, hoeheMm, anpassung, kantenHaerten) {
    const { groesse: g, aufloesung: auf } = pruefeGroesse(bild, code, breiteMm, hoeheMm, anpassung);
    if (g.breitePx * g.hoehePx > MAX_AUSGABE_PIXEL) {
      throw new RipFehler('Diese Größe ergibt mehr als 150 Millionen Pixel. Bitte eine kleinere Größe wählen.');
    }
    const ziel = leinwand(g.breitePx, g.hoehePx);
    const ctx = ziel.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new RipFehler('Diese Größe ist für dieses Gerät zu groß. Bitte eine kleinere Größe wählen.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (anpassung === 'fuellen') {
      const motivB = Math.max(g.breitePx, pyRound(g.motivBreiteMm / MM_PRO_ZOLL * DPI));
      const motivH = Math.max(g.hoehePx, pyRound(g.motivHoeheMm / MM_PRO_ZOLL * DPI));
      const quelle = skaliert(bild.leinwand, motivB, motivH);
      // Überstand mittig abschneiden (gleiche Ganzzahl-Teilung wie Python)
      ctx.drawImage(quelle, -Math.floor((motivB - g.breitePx) / 2), -Math.floor((motivH - g.hoehePx) / 2), motivB, motivH);
    } else {
      ctx.drawImage(skaliert(bild.leinwand, g.breitePx, g.hoehePx), 0, 0, g.breitePx, g.hoehePx);
    }

    let pixel;
    try { pixel = ctx.getImageData(0, 0, g.breitePx, g.hoehePx); }
    catch (e) { throw new RipFehler('Diese Größe ist für dieses Gerät zu groß. Bitte eine kleinere Größe wählen.'); }
    const d = pixel.data;
    let halb = 0, durchsichtig = false;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < 255) { durchsichtig = true; if (d[i] > 0) halb++; }
    }
    const anteil = halb / (g.breitePx * g.hoehePx);
    const gehaertet = kantenHaerten && durchsichtig && halb > 0;
    if (gehaertet) {
      for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0;
      ctx.putImageData(pixel, 0, 0);
    }

    const roh = await new Promise((ok, fehler) => ziel.toBlob((b) => (b ? ok(b) : fehler(new RipFehler('Die PNG-Datei konnte nicht erzeugt werden (zu wenig Speicher?).'))), 'image/png'));
    const png = pngMitProfilUndDpi(new Uint8Array(await roh.arrayBuffer()));
    const blob = new Blob([png], { type: 'image/png' });
    return { blob, groesse: g, dpiEffektiv: auf.dpi, bericht: bericht(g, auf, durchsichtig, anteil, gehaertet, blob.size) };
  }

  function cm(mm) { return (mm / 10).toFixed(1).replace('.', ','); }

  // Gleiche Prüfpunkte und Texte wie rip._pruefen
  function bericht(g, auf, durchsichtig, anteil, gehaertet, bytes) {
    const punkte = [{ schluessel: 'aufloesung', label: 'Auflösung', ampel: auf.ampel, hinweis: auf.hinweis }];
    punkte.push({ schluessel: 'groesse', label: 'Druckgröße', ampel: 'gruen',
      hinweis: cm(g.breiteMm) + ' x ' + cm(g.hoeheMm) + ' cm (' + g.breitePx + ' x ' + g.hoehePx + ' Pixel bei ' + DPI + ' dpi).' });
    punkte.push(durchsichtig
      ? { schluessel: 'hintergrund', label: 'Hintergrund', ampel: 'gruen', hinweis: 'Das Bild hat durchsichtige Stellen; dort wird nichts gedruckt.' }
      : { schluessel: 'hintergrund', label: 'Hintergrund', ampel: 'gelb', hinweis: 'Kein durchsichtiger Hintergrund: Das ganze Rechteck wird gedruckt, auch ein weißer Hintergrund.' });
    const prozent = (anteil * 100).toFixed(2).replace('.', ',');
    if (gehaertet) punkte.push({ schluessel: 'halbtransparenz', label: 'Kanten', ampel: 'gruen', hinweis: 'Halbtransparente Pixel (' + prozent + ' %) wurden hart gemacht.' });
    else if (anteil >= HALBTRANSPARENZ_HINWEIS) punkte.push({ schluessel: 'halbtransparenz', label: 'Kanten', ampel: 'gelb', hinweis: prozent + ' % halbtransparente Pixel. Im DTF-Druck können daraus fleckige Kanten werden.' });
    else punkte.push({ schluessel: 'halbtransparenz', label: 'Kanten', ampel: 'gruen', hinweis: 'Keine nennenswerte Halbtransparenz.' });
    punkte.push({ schluessel: 'farbraum', label: 'Farben', ampel: 'gruen', hinweis: 'RGB mit sRGB-Profil. Die Umrechnung in Druckfarben macht der RIP mit seinem Druckerprofil.' });
    const menge = bytes < 1024 * 1024 ? Math.round(bytes / 1024) + ' KB' : (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
    punkte.push({ schluessel: 'datei', label: 'Datei', ampel: 'gruen', hinweis: 'PNG mit ' + DPI + ' dpi, ' + menge + '.' });
    const rang = { gruen: 0, gelb: 1, rot: 2 };
    const gesamt = punkte.reduce((s, p) => (rang[p.ampel] > rang[s] ? p.ampel : s), 'gruen');
    return { punkte, gesamt_ampel: gesamt, download_erlaubt: gesamt !== 'rot' };
  }

  global.TexStyleRip = { ladeBild, vorschau, pruefeGroesse, erzeugeRipDatei, RipFehler };
})(window);
