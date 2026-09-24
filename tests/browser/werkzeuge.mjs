// Spielt die Werkzeuge für Fachkräfte im Browser durch und speichert die
// Dateien für die Prüfung in tests/test_werkzeuge.py.
//   node werkzeuge.mjs <App-Adresse> <Bild> <Ausgabeordner>
import { createRequire } from 'module';
import { execSync } from 'child_process';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch (e) {
  playwright = require(execSync('npm root -g').toString().trim() + '/playwright');
}
const { chromium } = playwright;
const [adresse, bild, ausgabe] = process.argv.slice(2);

const browser = await chromium.launch(process.env.CHROMIUM_PFAD ? { executablePath: process.env.CHROMIUM_PFAD } : {});
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1000, height: 900 } });
// Ohne Ordner-Dialog: Speichern geht dann immer als Download (im Test prüfbar)
await ctx.addInitScript(() => { delete window.showSaveFilePicker; });
const seite = await ctx.newPage();
const ergebnis = { fehler: [], apiAnfragen: 0, dateien: {}, texte: {} };
seite.on('pageerror', (e) => ergebnis.fehler.push(e.message));
seite.on('request', (r) => { if (r.url().includes('/api/')) ergebnis.apiAnfragen++; });

async function alleAuf() { await seite.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; })); }
async function setze(id, wert) {
  await seite.evaluate(([id, wert]) => {
    const el = document.getElementById(id);
    if (el.type === 'checkbox') el.checked = wert; else el.value = wert;
    el.dispatchEvent(new Event(el.type === 'checkbox' || el.tagName === 'SELECT' || el.type === 'color' ? 'change' : 'input', { bubbles: true }));
  }, [id, wert]);
  await seite.waitForTimeout(450);
}
async function bereit() { await seite.waitForSelector('#status-2 .status:not(.warten)'); await seite.waitForSelector('#status-3 .status'); }
async function laden() {
  await seite.setInputFiles('#datei-input', bild);
  await bereit();
  await seite.fill('#breite', '8');
  await seite.waitForTimeout(600);
}
async function speichernVon(klick, name) {
  const [dl] = await Promise.all([seite.waitForEvent('download', { timeout: 60000 }), klick()]);
  const pfad = `${ausgabe}/${name}`;
  await dl.saveAs(pfad);
  ergebnis.dateien[name] = pfad;
  return pfad;
}
async function machen(name) {
  await seite.click('#machen-btn');
  await seite.waitForSelector('#status-4 .status:not(.warten)', { timeout: 60000 });
  ergebnis.texte[name] = await seite.innerText('#pruef-liste');
  if (await seite.isVisible('#speichern-link') || !(await seite.isDisabled('#maske-btn'))) ergebnis.fehler.push('Speichern ohne Pflicht-Häkchen möglich: ' + name);
  await seite.check('#pflicht-bild');
  if (await seite.isVisible('#speichern-link')) ergebnis.fehler.push('Ein Häkchen reicht zum Speichern: ' + name);
  await seite.check('#pflicht-groesse');
  return speichernVon(() => seite.click('#speichern-link'), name);
}

await seite.goto(adresse);
await alleAuf();
await laden();
await machen('standard.png');

await setze('verfahren', 'ueberall');
await machen('ueberall.png');

await seite.click('#spiegeln-btn');
await seite.waitForTimeout(300);
await machen('gespiegelt.png');

// Projekt speichern (ueberall + gespiegelt), später wieder öffnen
await speichernVon(() => seite.click('#projekt-speichern-btn'), 'projekt.texdtf');

await seite.click('#spiegeln-btn');
await setze('dpi', '600');
await machen('600dpi.png');
await setze('dpi', '300');

await setze('format', 'pdf');
await machen('datei.pdf');
await setze('format', 'png');

await setze('raster', true);
await machen('raster.png');
await setze('raster', false);

await setze('helligkeit', '-60');
await machen('dunkler.png');
await seite.click('#ton-zurueck-btn');
await machen('nach-ton.png'); // Änderungen machen die alte Datei ungültig

await speichernVon(() => seite.click('#maske-btn'), 'maske.png');
await speichernVon(() => seite.click('#svg-btn'), 'konturen.svg');

// Beidseitig zuschneiden und rückgängig machen
ergebnis.texte.vorZuschnitt = await seite.innerText('#bild-info');
await setze('beschnitt-x', '20');
await seite.click('#beschnitt-btn');
await seite.waitForTimeout(300);
ergebnis.texte.nachZuschnitt = await seite.innerText('#bild-info');
await seite.click('#rueck-btn');
await seite.waitForTimeout(300);
ergebnis.texte.nachRueckgaengig = await seite.innerText('#bild-info');

// Zuschnitt-Dialog mit der Maus: nur die linke Hälfte (Ring) nehmen
await seite.click('#zuschnitt-btn');
const b = await seite.locator('#zs-buehne').boundingBox();
await seite.mouse.move(b.x + b.width * 0.02, b.y + b.height * 0.02);
await seite.mouse.down();
await seite.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.5, { steps: 5 });
await seite.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.98, { steps: 5 });
await seite.mouse.up();
ergebnis.texte.zuschnittInfo = await seite.innerText('#zs-info');
await seite.click('#zs-ok-btn');
await seite.waitForTimeout(300);
ergebnis.texte.nachDialog = await seite.innerText('#bild-info');
await machen('ausschnitt.png');
await seite.click('#original-btn');
await seite.waitForTimeout(300);

// Sammelbogen: 3 × das Motiv auf 20 cm Bogen
await seite.click('#bogen-dazu-btn');
await seite.fill('#bogen-0-Menge', '3');
await seite.dispatchEvent('#bogen-0-Menge', 'change');
await setze('bogen-breite', '20');
await seite.click('#bogen-ordnen-btn');
ergebnis.texte.bogen = await seite.innerText('#bogen-info');
await speichernVon(() => seite.click('#bogen-png-btn'), 'bogen.png');

// Projekt nach Neuladen öffnen und dieselbe Datei machen
await seite.reload();
await alleAuf();
await seite.setInputFiles('#projekt-input', `${ausgabe}/projekt.texdtf`);
await bereit();
await machen('aus-projekt.png');

// Ansichten und Dunkel-Modus ohne Fehler
for (const a of ['original', 'vergleich', 'maske', 'ergebnis']) {
  await seite.click(`[data-ansicht="${a}"]`);
  await seite.waitForTimeout(150);
}
await seite.click('.textil-btn[data-textil="#172126"]');
await seite.click('#dunkel-btn');
await seite.click('#testmotiv-btn');
await bereit();
await setze('verfahren', 'schrift');
await machen('schrift.png');

await browser.close();
console.log(JSON.stringify(ergebnis));
