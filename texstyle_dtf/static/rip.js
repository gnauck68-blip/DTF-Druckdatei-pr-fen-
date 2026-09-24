/*
 * TexStyle DTF: Datei für den RIP, komplett im Browser gerechnet.
 *
 * Ablauf: Bild laden -> Hintergrund entfernen (optional) -> Breite in cm
 * wählen -> auf 300 dpi hoch- bzw. herunterrechnen, Kanten glätten, bei
 * Bedarf schärfen oder als Logo glätten -> PNG für den RIP.
 *
 * Werkzeuge für Fachkräfte (Einstellungen „fach“, siehe FACH_GRUND) nutzen
 * die Rechenfunktionen des Texstyle DTF Studio aus studio-engine.js:
 * weitere Freistell-Verfahren, Tonwerte und Farbe, Textilfarbe aussparen,
 * Kanten einziehen, Halbtonraster, Weißmaske, Lanczos-3, 600 dpi, PDF, SVG
 * und Sammelbogen.
 *
 * Die Datei ist ein PNG in RGB mit sRGB-Profil (texstyle_dtf/srgb.icc),
 * durchsichtigem Hintergrund und 300 dpi. Farbumrechnung, Raster und
 * Weißunterlage macht der RIP mit seinem Druckerprofil.
 * Das Bild verlässt das Gerät nie. Der Browser wendet beim Laden die
 * EXIF-Drehung an, rechnet eingebettete Farbprofile nach sRGB um und
 * verwirft alle Metadaten (GPS, Kamera, Name).
 */
(function (global) {
  'use strict';

  const DPI = 300;
  const MM_PRO_ZOLL = 25.4;
  const MAX_DATEI_BYTES = 50 * 1024 * 1024;
  const MAX_BILD_PIXEL = 100000000;
  const MAX_AUSGABE_PIXEL = 150000000;
  const MIN_BREITE_CM = 1;
  const MAX_BREITE_CM = 300;
  const LEER_ALPHA = 16;             // Alpha bis hier zählt beim Zuschneiden als leer
  const MAX_INNENFLAECHE = 0.10;     // größere eingeschlossene Flächen bleiben (gewollte Motivteile)
  const ICCP_SRGB = 'AAABdmlDQ1BJQ0MgUHJvZmlsZQAAeJx1kT1Lw1AUhh+rUr8ddBB16FDFQUEUxFHr4FKk1ApWXdo0aYU2DUmKFFfBxUFwEF38GvwHugquCoKgCCLOjn4tUuK5VmiResPNeXjvfQ8nb8AXzmo5p2EKcqZrR2dDgcX4UsD/QjM9dDBKX0JzrOlIJMy/6/OOOlVvR1Sv/+/VXK0p3dGgrkl4QrNsV1imIbzmWoq3hLu1TCIlfCg8bMuAwldKT5b5WXG6zO+K7Vh0BnyqZyBdxckq1jJ2TnhIOJjLFrTfedSXtOnmwrzUXtn9OESZJUSAJAVWyeIyItWUzGr7Rn98c+TFo8nboogtjjQZ8Q6LWpCuulRDdF2eLEWV+988HWN8rNy9LQSNT573NgD+HShte97XkeeVjqH+ES7Mij8vOU1+iL5d0YIH0LkBZ5cVLbkL55vQ82Al7MSPVC/bZxjwegrtcei6gZblcla/55zcQ2xdftE17O3DoNzvXPkGQtRoKKffvQU=';

  class RipFehler extends Error {}
  const S = global.TexStyleStudio;
  // Adresse des Lanczos-Workers relativ zu rip.js (funktioniert auch in Unterordnern)
  const WORKER_URL = (function () {
    try { return new URL('lanczos-worker.js', document.currentScript.src).href; } catch (e) { return 'lanczos-worker.js'; }
  })();

  // Einstellungen der Werkzeuge für Fachkräfte. Die Standardwerte ändern nichts
  // am einfachen Ablauf.
  const FACH_GRUND = Object.freeze({
    verfahren: 'rand',        // 'rand' (am Rand zusammenhängend) | 'ueberall' | 'schrift'
    weich: 10,                // weicher Übergang (nur 'ueberall' und Textilfarbe aussparen)
    schriftFarbe: '#000000', schriftRauschen: 4, schriftKontrast: 20,
    saeume: false,            // Farbsäume an Halbtransparenz bereinigen
    aussparen: false, textil: '#172126', // Textilfarbe im Motiv aussparen
    schwarz: 0, weiss: 255, gamma: 1, farbton: 0, saettigung: 0, helligkeit: 0,
    einziehen: 0,             // Kanten einziehen in Pixeln der Druckdatei
    raster: false, lpi: 35, winkel: 22.5, form: 'circle', // Halbtonraster auf der Transparenz
    basisEinziehen: 1,        // Weißmaske einziehen
    dpi: 300, lanczos: false, format: 'png', // 'png' (RIP) oder 'pdf'
  });
  // Vollständiger Einstellungssatz für processPixels aus dem Studio (alles aus)
  const STUDIO_AUS = Object.freeze({
    remove: false, bg: '#ffffff', removeMode: 'edge', textInk: '#000000', textNoise: 4, textContrast: 20,
    tol: 30, soft: 10, choke: 0, dehalo: false, knock: false, shirt: '#172126',
    black: 0, white: 255, gamma: 1, hue: 0, sat: 0, light: 0,
    halftone: false, lpi: 35, angle: 22.5, shape: 'circle', baseChoke: 1,
  });
  function hex(f) { return '#' + f.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join(''); }
  function studio(img, einstellungen, dpi) {
    const d = S.processPixels(img.data, img.width, img.height, Object.assign({}, STUDIO_AUS, einstellungen), dpi || DPI);
    img.data.set(d);
  }

  function leinwand(breite, hoehe) {
    const c = document.createElement('canvas');
    c.width = breite; c.height = hoehe;
    return c;
  }
  function pixelVon(c) {
    try { return c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height); }
    catch (e) { throw new RipFehler('Das Bild ist zu groß für dieses Gerät.'); }
  }
  function ausPixeln(img) {
    const c = leinwand(img.width, img.height);
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  }
  // Python rundet halbe Werte zur geraden Zahl; gleich runden, damit Pixelmaße übereinstimmen
  function pyRound(v) {
    const f = Math.floor(v), rest = v - f;
    if (Math.abs(rest - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
    return Math.round(v);
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
      if (bmp.close) bmp.close();
      throw new RipFehler('Das Bild ist zu groß. Erlaubt sind höchstens 100 Millionen Pixel.');
    }
    const c = leinwand(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0);
    if (bmp.close) bmp.close();
    return { leinwand: c, breite: c.width, hoehe: c.height };
  }

  // ---------- Hintergrund erkennen (Randanalyse wie im DTF-Prüfer v15) ----------
  // Ergebnis: art = 'durchsichtig' | 'einfarbig' | 'keiner', farbe = [r, g, b] bei 'einfarbig'
  function erkenneHintergrund(original) {
    const { width: w, height: h } = original;
    const d = pixelVon(original).data;
    const rand = [];
    const schritt = Math.max(1, Math.floor(Math.max(w, h) / 400));
    const nimm = (x, y) => { const p = (y * w + x) * 4; rand.push([d[p], d[p + 1], d[p + 2], d[p + 3]]); };
    for (let x = 0; x < w; x += schritt) { nimm(x, 0); nimm(x, h - 1); }
    for (let y = 0; y < h; y += schritt) { nimm(0, y); nimm(w - 1, y); }
    const deckend = rand.filter((p) => p[3] > 200);
    if (deckend.length < rand.length * 0.6) return { art: 'durchsichtig', farbe: null };
    const mittel = [0, 1, 2].map((k) => Math.round(deckend.reduce((s, p) => s + p[k], 0) / deckend.length));
    const gleich = deckend.filter((p) => [0, 1, 2].every((k) => Math.abs(p[k] - mittel[k]) <= 40)).length / deckend.length;
    return gleich >= 0.8 ? { art: 'einfarbig', farbe: mittel } : { art: 'keiner', farbe: null };
  }

  function farbeAn(original, x, y) {
    const px = original.getContext('2d', { willReadFrequently: true }).getImageData(
      Math.min(original.width - 1, Math.max(0, Math.floor(x))), Math.min(original.height - 1, Math.max(0, Math.floor(y))), 1, 1).data;
    return [px[0], px[1], px[2]];
  }

  // ---------- Hintergrund entfernen ----------
  // Entfernt die Farbe, die mit dem Bildrand zusammenhängt (Flutfüllung), auf
  // Wunsch auch eingeschlossene Flächen in dieser Farbe (Innenflächen in „e“, „a“, „8“).
  function entferneFarbe(img, farbe, toleranz, innenflaechen) {
    const { width: w, height: h, data: d } = img;
    const passt = (i) => {
      const p = i * 4;
      return d[p + 3] > 0 && Math.abs(d[p] - farbe[0]) <= toleranz &&
        Math.abs(d[p + 1] - farbe[1]) <= toleranz && Math.abs(d[p + 2] - farbe[2]) <= toleranz;
    };
    const besucht = new Uint8Array(w * h);
    const stapel = new Int32Array(w * h);
    let oben = 0;
    const start = (i) => { if (!besucht[i] && passt(i)) { besucht[i] = 1; stapel[oben++] = i; } };
    for (let x = 0; x < w; x++) { start(x); start((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { start(y * w); start(y * w + w - 1); }
    let entfernt = 0;
    while (oben > 0) {
      const i = stapel[--oben];
      d[i * 4 + 3] = 0; entfernt++;
      const x = i % w;
      if (x > 0) start(i - 1);
      if (x < w - 1) start(i + 1);
      if (i >= w) start(i - w);
      if (i < (h - 1) * w) start(i + w);
    }
    if (innenflaechen) {
      const gesehen = new Uint8Array(w * h);
      const teil = new Int32Array(w * h);
      const grenze = w * h * MAX_INNENFLAECHE;
      for (let s = 0; s < w * h; s++) {
        if (gesehen[s] || besucht[s] || !passt(s)) continue;
        let n = 0, top = 0;
        gesehen[s] = 1; stapel[top++] = s;
        while (top > 0) {
          const i = stapel[--top];
          teil[n++] = i;
          const x = i % w;
          const nachbarn = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i >= w ? i - w : -1, i < (h - 1) * w ? i + w : -1];
          for (const m of nachbarn) if (m >= 0 && !gesehen[m] && !besucht[m] && passt(m)) { gesehen[m] = 1; stapel[top++] = m; }
        }
        if (n <= grenze) { for (let k = 0; k < n; k++) d[teil[k] * 4 + 3] = 0; entfernt += n; }
      }
    }
    return entfernt;
  }

  // Alphakanal: Minimum-Filter (Saum abtragen) und 3x3-Mittelung (Treppen glätten)
  function erodiereAlpha(a, w, h, r) {
    const tmp = new Uint8Array(w * h), aus = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = 255;
      for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w && a[y * w + xx] < m) m = a[y * w + xx]; }
      tmp[y * w + x] = m;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let m = 255;
      for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h && tmp[yy * w + x] < m) m = tmp[yy * w + x]; }
      aus[y * w + x] = m;
    }
    return aus;
  }
  function mittleAlpha(a, w, h, r) {
    const tmp = new Uint16Array(w * h), aus = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      let summe = 0, n = 0;
      for (let x = -r; x < w; x++) {
        if (x + r < w) { summe += a[y * w + x + r]; n++; }
        if (x - r - 1 >= 0) { summe -= a[y * w + x - r - 1]; n--; }
        if (x >= 0) tmp[y * w + x] = Math.round(summe / n);
      }
    }
    for (let x = 0; x < w; x++) {
      let summe = 0, n = 0;
      for (let y = -r; y < h; y++) {
        if (y + r < h) { summe += tmp[(y + r) * w + x]; n++; }
        if (y - r - 1 >= 0) { summe -= tmp[(y - r - 1) * w + x]; n--; }
        if (y >= 0) aus[y * w + x] = Math.round(summe / n);
      }
    }
    return aus;
  }
  function alphaAus(d) { const a = new Uint8Array(d.length / 4); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]; return a; }
  function alphaEin(d, a) { for (let i = 0; i < a.length; i++) d[i * 4 + 3] = a[i]; }

  function zuschneiden(c) {
    const d = pixelVon(c).data, w = c.width, h = c.height;
    let links = w, oben = h, rechts = -1, unten = -1, transparent = false;
    for (let y = 0; y < h; y++) {
      const z = y * w * 4;
      for (let x = 0; x < w; x++) {
        const a = d[z + x * 4 + 3];
        if (a < 255) transparent = true;
        if (a > LEER_ALPHA) {
          if (x < links) links = x;
          if (x > rechts) rechts = x;
          if (y < oben) oben = y;
          if (y > unten) unten = y;
        }
      }
    }
    const ganz = { leinwand: c, randEntfernt: false, transparent, versatz: { x: 0, y: 0 } };
    if (!transparent || rechts < 0) return ganz;
    const l = Math.max(0, links - 2), o = Math.max(0, oben - 2);
    const r = Math.min(w, rechts + 1 + 2), u = Math.min(h, unten + 1 + 2);
    if (l === 0 && o === 0 && r === w && u === h) return ganz;
    const neu = leinwand(r - l, u - o);
    neu.getContext('2d').drawImage(c, l, o, r - l, u - o, 0, 0, r - l, u - o);
    return { leinwand: neu, randEntfernt: true, transparent, versatz: { x: l, y: o } };
  }

  // Liefert das Motiv für die weiteren Schritte: Hintergrund entfernt (auf Wunsch),
  // Saum abgetragen, leerer Rand abgeschnitten.
  // fach: Werkzeuge für Fachkräfte (FACH_GRUND); ohne Angabe wie bisher.
  function bereiteVor(original, hintergrund, fach) {
    const f = Object.assign({}, FACH_GRUND, fach || {});
    const hg = hintergrund || {};
    const img = pixelVon(original);
    const w = img.width, h = img.height;
    const bg = hex(hg.farbe || [255, 255, 255]);
    const tol = hg.toleranz === undefined ? 30 : hg.toleranz;
    const ton = { black: f.schwarz, white: f.weiss, gamma: f.gamma, hue: f.farbton, sat: f.saettigung, light: f.helligkeit };
    const rest = Object.assign({ knock: f.aussparen, shirt: f.textil, bg, tol, soft: f.weich }, ton);
    let entfernt = 0;
    if (hg.entfernen && hg.farbe && f.verfahren === 'rand') {
      entfernt = entferneFarbe(img, hg.farbe, tol, hg.innenflaechen);
      if (entfernt > 0) {
        // Hellen Saum der alten Hintergrundfarbe abtragen (1 px) und Kante glätten
        const a = mittleAlpha(erodiereAlpha(alphaAus(img.data), w, h, 1), w, h, 1);
        alphaEin(img.data, a);
      }
      studio(img, Object.assign({ dehalo: f.saeume }, rest));
    } else if (hg.entfernen && hg.farbe) {
      // Studio-Verfahren: überall im Bild oder einfarbige Schrift
      const vorher = alphaAus(img.data);
      if (f.verfahren === 'schrift') {
        studio(img, { remove: true, removeMode: 'text', bg, textInk: f.schriftFarbe, textNoise: f.schriftRauschen, textContrast: f.schriftKontrast });
        studio(img, rest);
      } else {
        studio(img, Object.assign({ remove: true, removeMode: 'all', dehalo: f.saeume }, rest));
      }
      for (let i = 0; i < vorher.length; i++) if (img.data[i * 4 + 3] < vorher[i]) entfernt++;
    } else {
      studio(img, rest);
    }
    const z = zuschneiden(ausPixeln(img));
    return {
      leinwand: z.leinwand, breite: z.leinwand.width, hoehe: z.leinwand.height,
      randEntfernt: z.randEntfernt, transparent: z.transparent, hintergrundEntfernt: entfernt > 0,
      versatz: z.versatz, // Lage des Motivs im Originalbild (für das Antippen einer Farbe)
    };
  }

  function vorschau(bild, maxKante, gespiegelt) {
    const f = Math.min(1, maxKante / Math.max(bild.width, bild.height));
    const c = leinwand(Math.max(1, Math.round(bild.width * f)), Math.max(1, Math.round(bild.height * f)));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (gespiegelt) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(bild, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  }
  function spiegle(c) {
    const neu = leinwand(c.width, c.height), ctx = neu.getContext('2d');
    ctx.translate(c.width, 0); ctx.scale(-1, 1); ctx.drawImage(c, 0, 0);
    return neu;
  }
  // Weißmaske: überall weiß, wo gedruckt wird (für den RIP, falls er eine eigene Maske braucht)
  function weissmaske(c, einziehen) {
    const img = pixelVon(c);
    img.data.set(S.makeBase(img.data, c.width, c.height, Math.round(einziehen || 0)));
    return ausPixeln(img);
  }

  // ---------- Größe und Auflösung ----------
  function druckgroesse(breitePx, hoehePx, breiteCm, dpi) {
    dpi = dpi || DPI;
    const b = Number(String(breiteCm).replace(',', '.'));
    if (!(b >= MIN_BREITE_CM && b <= MAX_BREITE_CM)) throw new RipFehler('Die Breite muss zwischen 1 und 300 cm liegen.');
    const breiteMm = b * 10, hoeheMm = breiteMm * hoehePx / breitePx;
    return {
      breiteMm, hoeheMm,
      breitePx: Math.max(1, pyRound(breiteMm / MM_PRO_ZOLL * dpi)),
      hoehePx: Math.max(1, pyRound(hoeheMm / MM_PRO_ZOLL * dpi)), dpi,
    };
  }

  // Ampel immer nach 300 dpi (Druckqualität); faktor bezieht sich auf die Ziel-Auflösung
  function aufloesung(breitePx, breiteMm, zielDpi) {
    const dpi = breitePx / (breiteMm / MM_PRO_ZOLL);
    const g = pyRound(dpi);
    const faktor = (zielDpi || DPI) / dpi;
    if (g >= DPI) return { dpi, faktor, ampel: 'gruen', hinweis: 'Das Bild ist scharf genug: ' + g + ' dpi bei dieser Breite.' };
    if (g >= 150) return { dpi, faktor, ampel: 'gelb', hinweis: g + ' dpi bei dieser Breite. Die App rechnet auf 300 dpi hoch und glättet die Kanten.' };
    return { dpi, faktor, ampel: 'gelb', hinweis: 'Nur ' + g + ' dpi bei dieser Breite. Die App rechnet stark hoch; das Motiv kann weich wirken. Besser kleiner drucken oder ein größeres Bild nehmen.' };
  }

  function pruefeBreite(bild, breiteCm, dpi) {
    const g = druckgroesse(bild.breite, bild.hoehe, breiteCm, dpi);
    return { groesse: g, aufloesung: aufloesung(bild.breite, g.breiteMm, dpi) };
  }

  // ---------- Rechnen auf Druckgröße ----------
  // Verkleinern in Halbierungsschritten (keine Treppen), Vergrößern in einem
  // Schritt mit bester Glättung. Die Leinwand rechnet mit vormultiplizierter
  // Transparenz, darum entstehen an Kanten keine dunklen Säume.
  function skaliere(quelle, breite, hoehe) {
    let aktuell = quelle;
    while (aktuell.width / 2 >= breite && aktuell.height / 2 >= hoehe) {
      const halb = leinwand(Math.ceil(aktuell.width / 2), Math.ceil(aktuell.height / 2));
      const hctx = halb.getContext('2d');
      hctx.imageSmoothingQuality = 'high';
      hctx.drawImage(aktuell, 0, 0, halb.width, halb.height);
      aktuell = halb;
    }
    const ziel = leinwand(breite, hoehe);
    const ctx = ziel.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new RipFehler('Diese Größe ist für dieses Gerät zu groß. Bitte kleiner wählen.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(aktuell, 0, 0, breite, hoehe);
    return ziel;
  }

  // Lanczos-3 aus dem Studio (vormultiplizierte Transparenz), im Worker, sonst hier
  async function skaliereLanczos(quelle, breite, hoehe) {
    if (breite * hoehe > S.MAX_PIXELS) throw new RipFehler('Lanczos-3 geht bis 24 Millionen Pixel. Bitte kleiner drucken oder Lanczos-3 ausschalten.');
    const src = pixelVon(quelle);
    let pixel = null;
    if (typeof Worker !== 'undefined') {
      let worker = null;
      try {
        worker = new Worker(WORKER_URL);
        const puffer = await new Promise((ok, fehler) => {
          worker.onmessage = ({ data }) => (data.fehler ? fehler(new RipFehler(data.fehler)) : ok(data.buffer));
          worker.onerror = (e) => { e.preventDefault(); fehler(null); };
          worker.postMessage({ buffer: src.data.buffer, sw: src.width, sh: src.height, w: breite, h: hoehe }, [src.data.buffer]);
        });
        pixel = new Uint8ClampedArray(puffer);
      } catch (e) {
        if (e) throw e;
      } finally { if (worker) worker.terminate(); }
    }
    if (!pixel) pixel = S.lanczosResize(pixelVon(quelle).data, quelle.width, quelle.height, breite, hoehe);
    return ausPixeln(new ImageData(pixel, breite, hoehe));
  }

  // Logo-Glättung: Motiv als Vektorform nachzeichnen und in Druckgröße neu zeichnen.
  // Gut für Logos und Schrift (glatte Kurven in jeder Größe), nicht für Fotos.
  function logoGlaetten(quelle, breite, hoehe) {
    if (!global.ImageTracer) throw new RipFehler('Die Logo-Glättung ist auf diesem Gerät nicht verfügbar.');
    const f = Math.min(1, 1400 / Math.max(quelle.width, quelle.height));
    const klein = skaliere(quelle, Math.max(1, Math.round(quelle.width * f)), Math.max(1, Math.round(quelle.height * f)));
    const img = pixelVon(klein);
    // Halb durchsichtige Randpixel vorher ganz sichtbar oder ganz durchsichtig machen:
    // sonst erkennt der Vektorisierer sie als eigene (dunkle) Farbe und es entstehen Krümel am Rand.
    const a = mittleAlpha(alphaAus(img.data), img.width, img.height, 1);
    for (let i = 0; i < a.length; i++) {
      img.data[i * 4 + 3] = a[i] >= 128 ? 255 : 0;
      if (a[i] < 128) { img.data[i * 4] = 0; img.data[i * 4 + 1] = 0; img.data[i * 4 + 2] = 0; }
    }
    const svg = global.ImageTracer.imagedataToSVG(img, {
      numberofcolors: 16, pathomit: 8, ltres: 1, qtres: 1, blurradius: 1, blurdelta: 20,
      strokewidth: 0, roundcoords: 2, viewbox: true, desc: false,
    }).replace('<svg ', '<svg width="' + breite + '" height="' + hoehe + '" ');
    return new Promise((ok, fehler) => {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const bildEl = new Image();
      bildEl.onload = () => {
        URL.revokeObjectURL(url);
        const ziel = leinwand(breite, hoehe);
        const ctx = ziel.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bildEl, 0, 0, breite, hoehe);
        ok(ziel);
      };
      bildEl.onerror = () => { URL.revokeObjectURL(url); fehler(new RipFehler('Die Logo-Glättung ist fehlgeschlagen.')); };
      bildEl.src = url;
    });
  }

  // Leichtes Nachschärfen nach dem Hochrechnen (Unscharfmaske, nur Farbe, nur sichtbare Pixel)
  function schaerfe(img, staerke) {
    const { width: w, height: h, data: d } = img;
    for (let k = 0; k < 3; k++) {
      const kanal = new Uint8Array(w * h);
      for (let i = 0; i < kanal.length; i++) kanal[i] = d[i * 4 + k];
      const weich = mittleAlpha(kanal, w, h, 1);
      for (let i = 0; i < kanal.length; i++) {
        if (d[i * 4 + 3] === 0) continue;
        const v = kanal[i] + staerke * (kanal[i] - weich[i]);
        d[i * 4 + k] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
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
  function pngMitProfilUndDpi(png, dpi) {
    const signatur = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (png[i] !== signatur[i]) throw new RipFehler('Die PNG-Datei konnte nicht erzeugt werden.');
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const teile = [png.subarray(0, 8)];
    const ppm = pyRound((dpi || DPI) / 0.0254); // bei 300 dpi 11811 Pixel pro Meter, wie Pillow
    const phys = new Uint8Array(9);
    new DataView(phys.buffer).setUint32(0, ppm);
    new DataView(phys.buffer).setUint32(4, ppm);
    phys[8] = 1;
    let pos = 8;
    while (pos < png.length) {
      const laenge = dv.getUint32(pos);
      const typ = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
      const ende = pos + 12 + laenge;
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

  // ---------- Motiv in Pixelgröße rechnen ----------
  // Gemeinsamer Kern für die RIP-Datei, PDF und Sammelbogen.
  // faktor: Vergrößerung gegenüber dem Motiv (für Schärfen und Kantenglättung).
  async function rendereMotiv(bild, breitePx, hoehePx, faktor, o) {
    const hoch = faktor > 1.05;
    const ziel = o.lanczos ? await skaliereLanczos(bild.leinwand, breitePx, hoehePx) : skaliere(bild.leinwand, breitePx, hoehePx);
    const img = pixelVon(ziel);
    const d = img.data;
    if (o.logoGlaetten) {
      // Umriss (Alpha) kommt aus der Rasterfassung, die gleich geglättet wird; die
      // Vektorform liefert nur die Farben innen (klare Farbgrenzen, keine JPEG-Störungen).
      // Wo die Vektorform eine Lücke hat, bleibt das Rasterbild: keine Löcher, keine Krümel.
      const v = pixelVon(await logoGlaetten(bild.leinwand, breitePx, hoehePx)).data;
      for (let i = 0; i < d.length; i += 4) {
        if (v[i + 3] >= 128) { d[i] = v[i]; d[i + 1] = v[i + 1]; d[i + 2] = v[i + 2]; }
      }
    }

    let halb = 0, durchsichtig = false;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 255) { durchsichtig = true; if (d[i] > 0) halb++; }
    const anteil = halb / (breitePx * hoehePx);

    const geschaerft = o.schaerfen && hoch && !o.logoGlaetten;
    if (geschaerft) schaerfe(img, 0.6);

    const eingezogen = Math.round(o.einziehen || 0);
    if (eingezogen > 0 && durchsichtig) S.erodeAlpha(d, breitePx, hoehePx, eingezogen);

    // Halbtonraster: halbtransparente Pixel werden zu Punkten (Studio). Ersetzt das
    // Kantenglätten, weil beides den Alphakanal auf 0 oder 255 bringt.
    const gerastert = !!o.raster && durchsichtig;
    if (gerastert) studio(img, { halftone: true, lpi: o.lpi, angle: o.winkel, shape: o.form }, o.dpi || DPI);

    const geglaettet = o.kantenGlaetten && durchsichtig && !gerastert;
    if (geglaettet) {
      // Kontur vor dem Schwellenschnitt weichzeichnen (zwei Durchgänge, fast wie ein
      // Gaußfilter): beim Hochrechnen stärker, damit aus Treppen und JPEG-Störungen
      // runde, ruhige Kanten werden. Danach Alpha nur 0 oder 255.
      const radius = Math.max(1, Math.min(8, Math.round(faktor * 0.6)));
      const a = mittleAlpha(mittleAlpha(alphaAus(d), breitePx, hoehePx, radius), breitePx, hoehePx, radius);
      for (let i = 0; i < a.length; i++) a[i] = a[i] >= 128 ? 255 : 0;
      alphaEin(d, a);
    }
    ziel.getContext('2d').putImageData(img, 0, 0);
    return { leinwand: o.gespiegelt ? spiegle(ziel) : ziel, durchsichtig, anteil, geglaettet, geschaerft, gerastert, eingezogen };
  }

  async function pngBlob(c, dpi) {
    const roh = await new Promise((ok, fehler) => c.toBlob((b) => (b ? ok(b) : fehler(new RipFehler('Die PNG-Datei konnte nicht erzeugt werden (zu wenig Speicher?).'))), 'image/png'));
    return new Blob([pngMitProfilUndDpi(new Uint8Array(await roh.arrayBuffer()), dpi)], { type: 'image/png' });
  }
  // PDF (Studio): Rasterbild mit Alphamaske in Druckgröße, ohne Farbprofil
  function pdfBlob(c, breiteMm, hoeheMm) {
    return S.pdfImage(pixelVon(c).data, c.width, c.height, breiteMm / 10, hoeheMm / 10);
  }

  // ---------- RIP-Datei erzeugen ----------
  // optionen: kantenGlaetten (Standard an), schaerfen (Standard an, nur beim
  // Hochrechnen), logoGlaetten (Standard aus); dazu aus den Werkzeugen für
  // Fachkräfte: dpi, lanczos, einziehen, raster/lpi/winkel/form, gespiegelt,
  // format ('png' oder 'pdf').
  async function erzeugeRipDatei(bild, breiteCm, optionen) {
    const o = Object.assign({ kantenGlaetten: true, schaerfen: true, logoGlaetten: false, dpi: DPI, format: 'png' }, optionen || {});
    const { groesse: g, aufloesung: auf } = pruefeBreite(bild, breiteCm, o.dpi);
    if (g.breitePx * g.hoehePx > MAX_AUSGABE_PIXEL) {
      throw new RipFehler('Diese Größe ergibt mehr als 150 Millionen Pixel. Bitte kleiner wählen.');
    }
    const r = await rendereMotiv(bild, g.breitePx, g.hoehePx, auf.faktor, o);
    const blob = o.format === 'pdf' ? await pdfBlob(r.leinwand, g.breiteMm, g.hoeheMm) : await pngBlob(r.leinwand, o.dpi);
    return {
      blob, groesse: g, dpiEffektiv: auf.dpi, vorschauUrl: vorschau(r.leinwand, 900), leinwand: r.leinwand,
      bericht: bericht(g, auf, bild, r, o, blob.size),
    };
  }

  // SVG (Studio): einfarbige Konturen aus dem Motiv, höchstens 1000 Pixel Kantenlänge
  function svgKonturen(bild, breiteCm, schwelle, farbe, gespiegelt) {
    const g = druckgroesse(bild.breite, bild.hoehe, breiteCm);
    const f = Math.min(1, 1000 / Math.max(bild.breite, bild.hoehe));
    let c = skaliere(bild.leinwand, Math.max(1, Math.round(bild.breite * f)), Math.max(1, Math.round(bild.hoehe * f)));
    if (gespiegelt) c = spiegle(c);
    const svg = S.traceSvg(pixelVon(c).data, c.width, c.height, schwelle, farbe, +(g.breiteMm / 10).toFixed(2), +(g.hoeheMm / 10).toFixed(2));
    return new Blob([svg], { type: 'image/svg+xml' });
  }

  // Weißmaske als PNG in Druckgröße
  async function weissmaskeDatei(leinwandDruck, einziehen, dpi) {
    return pngBlob(weissmaske(leinwandDruck, einziehen), dpi);
  }

  // ---------- Sammelbogen (Studio: Anordnung in Reihen, Überlappungsprüfung) ----------
  // motive: [{ bild, breiteCm, menge, optionen }]; Ergebnis der Anordnung in cm
  function ordneBogen(motive, bogenBreiteCm, abstandMm, drehen) {
    return S.pack(motive.map((m) => ({ width: m.breiteCm, qty: m.menge, ratio: m.bild.breite / m.bild.hoehe })), bogenBreiteCm, abstandMm / 10, drehen);
  }
  function pruefeBogen(bogen) { S.validateSheet(bogen); }
  async function erzeugeBogen(motive, bogen, dpi, format, fortschritt) {
    pruefeBogen(bogen);
    dpi = dpi || DPI;
    const breitePx = Math.max(1, pyRound(bogen.width * 10 / MM_PRO_ZOLL * dpi));
    const hoehePx = Math.max(1, pyRound(bogen.height * 10 / MM_PRO_ZOLL * dpi));
    if (breitePx * hoehePx > MAX_AUSGABE_PIXEL) throw new RipFehler('Der Bogen ergibt mehr als 150 Millionen Pixel. Bitte schmaler oder mit weniger Motiven anlegen.');
    const c = leinwand(breitePx, hoehePx), ctx = c.getContext('2d');
    if (!ctx) throw new RipFehler('Der Bogen ist für dieses Gerät zu groß.');
    const pxProCm = breitePx / bogen.width;
    for (let i = 0; i < bogen.placed.length; i++) {
      const p = bogen.placed[i], m = motive[p.idx];
      if (fortschritt) fortschritt(i + 1, bogen.placed.length);
      const w = Math.max(1, Math.round((p.rotated ? p.h : p.w) * pxProCm));
      const h = Math.max(1, Math.round((p.rotated ? p.w : p.h) * pxProCm));
      const r = await rendereMotiv(m.bild, w, h, w / m.bild.breite, Object.assign({}, m.optionen, { dpi }));
      ctx.save();
      ctx.translate(Math.round(p.x * pxProCm), Math.round(p.y * pxProCm));
      if (p.rotated) { ctx.translate(Math.round(p.w * pxProCm), 0); ctx.rotate(Math.PI / 2); }
      ctx.drawImage(r.leinwand, 0, 0);
      ctx.restore();
    }
    const blob = format === 'pdf' ? await pdfBlob(c, bogen.width * 10, bogen.height * 10) : await pngBlob(c, dpi);
    return { blob, breitePx, hoehePx, vorschauUrl: vorschau(c, 900) };
  }

  function cm(mm) { return (mm / 10).toFixed(1).replace('.', ','); }

  function bericht(g, auf, bild, r, o, bytes) {
    const { durchsichtig, anteil, geglaettet, geschaerft } = r, logo = o.logoGlaetten, dpi = o.dpi || DPI;
    const punkte = [{ schluessel: 'aufloesung', label: 'Auflösung', ampel: auf.ampel, hinweis: auf.hinweis }];
    punkte.push({ schluessel: 'groesse', label: 'Druckgröße', ampel: 'gruen',
      hinweis: cm(g.breiteMm) + ' x ' + cm(g.hoeheMm) + ' cm (' + g.breitePx + ' x ' + g.hoehePx + ' Pixel bei ' + dpi + ' dpi).' });
    punkte.push(durchsichtig
      ? { schluessel: 'hintergrund', label: 'Hintergrund', ampel: 'gruen', hinweis: bild.hintergrundEntfernt ? 'Hintergrund entfernt; dort wird nichts gedruckt.' : 'Das Bild hat durchsichtige Stellen; dort wird nichts gedruckt.' }
      : { schluessel: 'hintergrund', label: 'Hintergrund', ampel: 'gelb', hinweis: 'Kein durchsichtiger Hintergrund: Das ganze Rechteck wird gedruckt, auch ein weißer Hintergrund.' });
    const prozent = (anteil * 100).toFixed(2).replace('.', ',');
    if (r.gerastert) punkte.push({ schluessel: 'halbtransparenz', label: 'Kanten', ampel: 'gruen', hinweis: 'Halbtransparenz in ein Raster mit ' + o.lpi + ' LPI umgewandelt (vorher ' + prozent + ' % halbtransparente Pixel). Das Raster des RIP für diese Datei abschalten oder prüfen.' });
    else if (geglaettet) punkte.push({ schluessel: 'halbtransparenz', label: 'Kanten', ampel: 'gruen', hinweis: 'Kanten geglättet und hart gemacht (vorher ' + prozent + ' % halbtransparente Pixel).' });
    else if (anteil >= 0.005) punkte.push({ schluessel: 'halbtransparenz', label: 'Kanten', ampel: 'gelb', hinweis: prozent + ' % halbtransparente Pixel. Im DTF-Druck können daraus fleckige Kanten werden.' });
    else punkte.push({ schluessel: 'halbtransparenz', label: 'Kanten', ampel: 'gruen', hinweis: 'Keine nennenswerte Halbtransparenz.' });
    if (logo) punkte.push({ schluessel: 'optimierung', label: 'Optimierung', ampel: 'gruen', hinweis: 'Logo als Vektorform nachgezeichnet und in Druckgröße neu gezeichnet.' });
    else if (geschaerft) punkte.push({ schluessel: 'optimierung', label: 'Optimierung', ampel: 'gruen', hinweis: 'Auf ' + dpi + ' dpi hochgerechnet und leicht nachgeschärft.' });
    if (r.eingezogen) punkte.push({ schluessel: 'einziehen', label: 'Kanten eingezogen', ampel: 'gruen', hinweis: 'Motivrand um ' + r.eingezogen + ' Pixel nach innen gezogen.' });
    if (o.gespiegelt) punkte.push({ schluessel: 'spiegeln', label: 'Ausrichtung', ampel: 'gelb', hinweis: 'Gespiegelt. Nur so drucken, wenn der RIP nicht selbst spiegelt.' });
    punkte.push(o.format === 'pdf'
      ? { schluessel: 'farbraum', label: 'Farben', ampel: 'gelb', hinweis: 'PDF mit RGB-Bild ohne eingebettetes Farbprofil. Für den RIP besser die PNG-Datei nehmen.' }
      : { schluessel: 'farbraum', label: 'Farben', ampel: 'gruen', hinweis: 'RGB mit sRGB-Profil. Die Umrechnung in Druckfarben macht der RIP mit seinem Druckerprofil.' });
    const menge = bytes < 1024 * 1024 ? Math.round(bytes / 1024) + ' KB' : (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
    punkte.push({ schluessel: 'datei', label: 'Datei', ampel: 'gruen', hinweis: (o.format === 'pdf' ? 'PDF in Druckgröße, ' : 'PNG mit ' + dpi + ' dpi, ') + menge + '.' });
    const rang = { gruen: 0, gelb: 1, rot: 2 };
    const gesamt = punkte.reduce((s, p) => (rang[p.ampel] > rang[s] ? p.ampel : s), 'gruen');
    return { punkte, gesamt_ampel: gesamt, download_erlaubt: gesamt !== 'rot' };
  }

  global.TexStyleRip = {
    ladeBild, erkenneHintergrund, farbeAn, bereiteVor, vorschau, pruefeBreite, erzeugeRipDatei, RipFehler,
    FACH_GRUND, hex, spiegle, weissmaske, weissmaskeDatei, svgKonturen, ordneBogen, pruefeBogen, erzeugeBogen,
  };
})(window);
