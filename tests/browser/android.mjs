// Spielt die App auf einem nachgebildeten Android-Handy (Pixel 7) durch:
// Bild laden, Größe wählen, RIP-Datei erzeugen und speichern, dann im
// Flugmodus neu laden und noch einmal. Aufgerufen von tests/test_browser.py.
//   node android.mjs <App-Adresse> <Bild> <Breite in cm> <Ausgabeordner>
import { createRequire } from 'module';
import { execSync } from 'child_process';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch (e) {
  playwright = require(execSync('npm root -g').toString().trim() + '/playwright');
}
const { chromium, devices } = playwright;
const [adresse, bild, breiteCm, ausgabe] = process.argv.slice(2);

const browser = await chromium.launch(process.env.CHROMIUM_PFAD ? { executablePath: process.env.CHROMIUM_PFAD } : {});
const ctx = await browser.newContext({ ...devices['Pixel 7'], acceptDownloads: true });
const seite = await ctx.newPage();
const ergebnis = { fehler: [], apiAnfragen: 0, laeufe: [] };
seite.on('pageerror', (e) => ergebnis.fehler.push(e.message));
seite.on('request', (r) => { if (r.url().includes('/api/')) ergebnis.apiAnfragen++; });

async function durchlauf(name) {
  await seite.setInputFiles('#datei-input', bild);
  await seite.waitForSelector('#status-2 .status:not(.warten)');
  await seite.fill('#breite', breiteCm);
  await seite.waitForTimeout(600);
  await seite.waitForSelector('#status-3 .status:not(.warten)');
  await seite.tap('#machen-btn');
  await seite.waitForSelector('#status-4 .status:not(.warten)', { timeout: 60000 });
  const lauf = { name, status: await seite.innerText('#status-4'), datei: null,
    vorHakenVersteckt: !(await seite.isVisible('#speichern-link')) };
  await seite.tap('#pflicht-bild');
  await seite.tap('#pflicht-groesse');
  if (await seite.isVisible('#speichern-link')) {
    const [dl] = await Promise.all([seite.waitForEvent('download'), seite.tap('#speichern-link')]);
    lauf.datei = `${ausgabe}/${name}.png`;
    await dl.saveAs(lauf.datei);
  }
  ergebnis.laeufe.push(lauf);
}

await seite.goto(adresse);
await durchlauf('online');
await seite.evaluate(() => navigator.serviceWorker.ready);
await seite.reload();
await ctx.setOffline(true);
await seite.reload();
await durchlauf('offline');
await browser.close();
console.log(JSON.stringify(ergebnis));
