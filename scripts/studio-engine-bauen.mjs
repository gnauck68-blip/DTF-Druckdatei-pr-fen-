// Baut texstyle_dtf/static/studio-engine.js aus den Rechenfunktionen des
// Texstyle DTF Studio (studio/dist). Das Ergebnis ist ein klassisches Script
// ohne import/export: Es läuft in der Seite und im Worker (importScripts)
// und stellt alles unter self.TexStyleStudio bereit.
//   node scripts/studio-engine-bauen.mjs          Datei schreiben
//   node scripts/studio-engine-bauen.mjs --pruefen nur prüfen, ob sie aktuell ist
import { readFileSync, writeFileSync } from 'node:fs';

const quelle = (name) => readFileSync(new URL('../studio/dist/' + name, import.meta.url), 'utf8')
  .replace(/^import .*?;\n/gm, '').replace(/^export /gm, '');
const namen = ['MAX_PIXELS', 'dimensions', 'rgb', 'erodeAlpha', 'processPixels', 'adjustHsl', 'makeBase',
  'traceSvg', 'pack', 'validateSheet', 'pdfImage', 'resolutionPlan', 'lanczosResize',
  'moveCropRect', 'resizeCropRect', 'drawCropRect', 'cropPixels'];
const inhalt = '/* Erzeugt von scripts/studio-engine-bauen.mjs aus studio/dist (engine.mjs,\n' +
  '   resample.mjs, crop-geometry.mjs). Nicht von Hand ändern. */\n' +
  '(function (global) {\n\'use strict\';\n' +
  quelle('engine.mjs') + '\n' + quelle('resample.mjs') + '\n' + quelle('crop-geometry.mjs') + '\n' +
  'global.TexStyleStudio = {' + namen.join(', ') + '};\n})(self);\n';
const ziel = new URL('../texstyle_dtf/static/studio-engine.js', import.meta.url);
if (process.argv.includes('--pruefen')) {
  if (readFileSync(ziel, 'utf8') !== inhalt) { console.error('studio-engine.js ist veraltet: node scripts/studio-engine-bauen.mjs'); process.exit(1); }
} else {
  writeFileSync(ziel, inhalt);
}
