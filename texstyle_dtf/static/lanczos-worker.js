/* Rechnet ein Bild mit Lanczos-3 auf Druckgröße, ohne die Seite zu blockieren.
   Bekommt RGBA-Pixel, gibt RGBA-Pixel zurück. Kein Netzzugriff. */
importScripts('studio-engine.js');
self.onmessage = ({ data: m }) => {
  try {
    const d = self.TexStyleStudio.lanczosResize(new Uint8ClampedArray(m.buffer), m.sw, m.sh, m.w, m.h);
    self.postMessage({ buffer: d.buffer }, [d.buffer]);
  } catch (e) {
    self.postMessage({ fehler: e.message });
  }
};
