/*
 * TexStyle DTF: Bedienung der Seite. Die Rechenarbeit machen rip.js und
 * studio-engine.js (Funktionen aus dem Texstyle DTF Studio).
 * Einfacher Weg: 4 Schritte. Werkzeuge für Fachkräfte: aufklappbarer Bereich
 * unten; alles dort ist freiwillig und ändert ohne Eingriff nichts.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const R = window.TexStyleRip;
  const S = window.TexStyleStudio;
  const HG_GRUND = () => ({ entfernen: false, farbe: null, toleranz: 30, innenflaechen: false, art: 'keiner' });
  // geladen: Bild wie geladen; original: aktuelles Bild nach Zuschnitt; motiv: nach
  // Hintergrund, Tonwerten und Randbeschnitt; hg: Hintergrund; fach: Werkzeuge für Fachkräfte
  const zustand = {
    geladen: null, original: null, motiv: null, hg: HG_GRUND(), fach: Object.assign({}, R.FACH_GRUND),
    gespiegelt: false, name: 'motiv', ansicht: 'ergebnis', textil: null, pipette: 'hg',
    dateiUrl: null, letzte: null, bogen: [], anordnung: null,
  };

  // ---------- Große Schrift und dunkles Farbschema (im Browser gemerkt, falls erlaubt) ----------
  function merkeEinstellung(schluessel, wert) { try { localStorage.setItem(schluessel, wert); } catch (e) { /* ohne Speicher */ } }
  function leseEinstellung(schluessel) { try { return localStorage.getItem(schluessel); } catch (e) { return null; } }
  function umschalter(knopfId, klasse, schluessel) {
    const knopf = $(knopfId);
    const setze = (an) => { document.documentElement.classList.toggle(klasse, an); knopf.setAttribute('aria-pressed', an ? 'true' : 'false'); };
    setze(leseEinstellung(schluessel) === 'an' || (schluessel === 'texstyle-schrift' && leseEinstellung(schluessel) === 'gross'));
    knopf.addEventListener('click', () => {
      const an = !document.documentElement.classList.contains(klasse);
      setze(an); merkeEinstellung(schluessel, an ? 'an' : 'aus');
    });
  }
  umschalter('schrift-btn', 'gross', 'texstyle-schrift');
  umschalter('dunkel-btn', 'dunkel', 'texstyle-dunkel');

  // ---------- Vorlesen: nur Stimmen, die auf dem Gerät laufen (Datenschutz, offline) ----------
  // Wahl zwischen Frauen- und Männerstimme; die gewählte Stimme wird im Browser gemerkt.
  const sprache = window.speechSynthesis;
  const stimmeWahl = $('stimme');
  // Das Geschlecht steht nicht in der Sprachausgabe-Schnittstelle, nur im Namen der Stimme.
  const FRAUEN = /\b(hedda|katja|anna|petra|helena|marlene|vicki|sabina|amala|louisa|elke|gisela|klarissa|maja|tanja|leni|ingrid|seraphina|katharina|anja|yvonne|nina|female|weiblich|frau)\b/i;
  const MAENNER = /\b(stefan|markus|yannick|hans|conrad|killian|kasper|bernd|christoph|ralf|klaus|florian|jonas|georg|viktor|tobias|male|männlich|mann)\b/i;
  function geschlecht(v) { return FRAUEN.test(v.name) ? 'Frau' : MAENNER.test(v.name) ? 'Mann' : ''; }
  // Bessere Stimmen zuerst: „Natural“/„Neural“/„Premium“ klingen flüssig, Hedda ist die älteste Windows-Stimme.
  function klang(v) {
    let punkte = 0;
    if (/natural|neural|premium|enhanced|verbessert/i.test(v.name)) punkte += 50;
    if (/^de[-_]de/i.test(v.lang)) punkte += 5;
    if (/hedda/i.test(v.name)) punkte -= 20;
    return punkte;
  }
  function deutscheStimmen() {
    if (!sprache) return [];
    return sprache.getVoices()
      .filter((v) => v.localService && v.lang && v.lang.toLowerCase().startsWith('de'))
      .sort((a, b) => klang(b) - klang(a));
  }
  function gewaehlteStimme() {
    const alle = deutscheStimmen();
    return alle.find((v) => v.voiceURI === stimmeWahl.value) || alle[0] || null;
  }
  function stimmenZeigen() {
    const alle = deutscheStimmen();
    const gemerkt = stimmeWahl.value || leseEinstellung('texstyle-stimme');
    let nummer = 0;
    stimmeWahl.replaceChildren(...alle.map((v) => {
      nummer += 1;
      const art = geschlecht(v);
      const name = v.name.replace(/^Microsoft\s+/i, '').replace(/\s*[-–(].*$/, '').trim();
      const o = document.createElement('option');
      o.value = v.voiceURI;
      o.textContent = art ? art + ': ' + name : 'Stimme ' + nummer + ': ' + name;
      return o;
    }));
    if (alle.some((v) => v.voiceURI === gemerkt)) stimmeWahl.value = gemerkt;
    const da = alle.length > 0;
    document.querySelectorAll('.vorlesen-btn').forEach((b) => b.classList.toggle('versteckt', !da));
    $('stimme-feld').classList.toggle('versteckt', !da);
  }
  // Zeilen ohne Satzzeichen bekommen einen Punkt, sonst liest die Stimme sie ohne Pause
  // in einem Atemzug zusammen und betont falsch.
  function vorlesbar(el) {
    return el.innerText.split('\n').map((z) => z.replace(/\s+/g, ' ').trim()).filter(Boolean)
      .map((z) => (/[.!?:;,…]$/.test(z) ? z : z + '.')).join(' ');
  }
  function sprich(text) {
    const stimme = gewaehlteStimme();
    if (!stimme || !text) return;
    sprache.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = stimme; u.lang = stimme.lang; u.rate = 0.9;
    sprache.speak(u);
  }
  if (sprache) { stimmenZeigen(); sprache.addEventListener('voiceschanged', stimmenZeigen); }
  stimmeWahl.addEventListener('change', () => {
    merkeEinstellung('texstyle-stimme', stimmeWahl.value);
    sprich('Hallo. So klinge ich.');
  });
  document.querySelectorAll('.vorlesen-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      sprich(btn.dataset.lies.split(' ').map((id) => ($(id) ? vorlesbar($(id)) : '')).join(' ').trim());
    });
  });

  // ---------- Statusanzeige: Form + Wort + Farbe ----------
  const STATUS = {
    gruen: { symbol: 'i-gut', wort: 'Gut' }, gelb: { symbol: 'i-achtung', wort: 'Achtung' },
    rot: { symbol: 'i-stopp', wort: 'Stopp' }, warten: { symbol: 'i-warten', wort: 'Bitte warten' },
  };
  function zeigeStatus(ziel, art, satz, fehler) {
    const s = STATUS[art];
    const box = document.createElement('div');
    box.className = 'status ' + art;
    if (fehler) box.setAttribute('role', 'alert');
    box.innerHTML = '<svg aria-hidden="true"' + (art === 'warten' ? ' class="dreht"' : '') + '><use href="#' + s.symbol + '"/></svg><div><b></b><span></span></div>';
    box.querySelector('b').textContent = s.wort + '.';
    box.querySelector('span').textContent = satz;
    ziel.replaceChildren(box);
  }
  function leere(ziel) { ziel.replaceChildren(); }
  function fehlerSatz(einfach, fehler) {
    if (fehler instanceof R.RipFehler) return fehler.message;
    return einfach + (fehler && fehler.message ? ' Hinweis für die Fachkraft: ' + fehler.message : '');
  }
  const kurzWarten = () => new Promise((ok) => setTimeout(ok, 30));
  // Meldungen der Werkzeuge; Fehler dort nie still verschlucken
  function werkzeugMeldung(art, satz) { zeigeStatus($('status-w'), art, satz, art === 'rot'); }
  async function werkzeug(fn, einfach) {
    try { await fn(); } catch (e) { werkzeugMeldung('rot', fehlerSatz(einfach || 'Das hat nicht geklappt.', e)); }
  }

  // ---------- Speichern: Ordner wählen, wenn der Browser das kann, sonst Download ----------
  function sichererName(s) { return String(s).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, '-').slice(0, 60) || 'motiv'; }
  async function speichere(blob, dateiname) {
    if (typeof window.showSaveFilePicker === 'function') {
      const endung = dateiname.split('.').pop();
      try {
        const griff = await window.showSaveFilePicker({ suggestedName: dateiname, id: 'texstyle-dtf',
          types: [{ description: endung.toUpperCase() + '-Datei', accept: { [blob.type || 'application/octet-stream']: ['.' + endung] } }] });
        const schreiber = await griff.createWritable();
        await schreiber.write(blob); await schreiber.close();
        return 'Im gewählten Ordner gespeichert: ' + griff.name + '.';
      } catch (e) {
        if (e && e.name === 'AbortError') return null;
        // sonst normaler Download
      }
    }
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = dateiname; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return 'Die Datei „' + dateiname + '“ wird im Download-Ordner gespeichert.';
  }

  // ---------- Rückgängig / Wiederholen (nur im Arbeitsspeicher) ----------
  const verlauf = { zurueck: [], vor: [], schluessel: null, zeit: 0 };
  function schnappschuss() {
    return { original: zustand.original, hg: Object.assign({}, zustand.hg), fach: Object.assign({}, zustand.fach),
      breite: $('breite').value, gespiegelt: zustand.gespiegelt };
  }
  // Schnell aufeinanderfolgende Änderungen am selben Regler zählen als ein Schritt
  function merken(schluessel) {
    if (!zustand.original) return;
    const jetzt = Date.now();
    if (schluessel && schluessel === verlauf.schluessel && jetzt - verlauf.zeit < 1500) { verlauf.zeit = jetzt; return; }
    verlauf.zurueck.push(schnappschuss());
    if (verlauf.zurueck.length > 40) verlauf.zurueck.shift();
    verlauf.vor = []; verlauf.schluessel = schluessel || null; verlauf.zeit = jetzt;
    verlaufKnoepfe();
  }
  function verlaufKnoepfe() { $('rueck-btn').disabled = !verlauf.zurueck.length; $('vor-btn').disabled = !verlauf.vor.length; }
  function herstellen(s) {
    zustand.original = s.original; zustand.hg = Object.assign({}, s.hg); zustand.fach = Object.assign({}, s.fach);
    zustand.gespiegelt = s.gespiegelt; $('breite').value = s.breite;
    felderAusZustand(); histogramm(); hintergrundAnwenden();
  }
  $('rueck-btn').addEventListener('click', () => {
    if (!verlauf.zurueck.length) return;
    verlauf.vor.push(schnappschuss()); herstellen(verlauf.zurueck.pop()); verlauf.schluessel = null; verlaufKnoepfe();
  });
  $('vor-btn').addEventListener('click', () => {
    if (!verlauf.vor.length) return;
    verlauf.zurueck.push(schnappschuss()); herstellen(verlauf.vor.pop()); verlauf.schluessel = null; verlaufKnoepfe();
  });

  // ---------- Schritt 1: Bild ----------
  const dateiInput = $('datei-input');
  const ablage = $('ablage');
  $('bild-btn').addEventListener('click', () => dateiInput.click());
  dateiInput.addEventListener('change', () => { if (dateiInput.files.length) laden(dateiInput.files[0]); dateiInput.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => ablage.addEventListener(ev, (e) => { e.preventDefault(); ablage.classList.add('drueber'); }));
  ['dragleave', 'drop'].forEach((ev) => ablage.addEventListener(ev, (e) => { e.preventDefault(); ablage.classList.remove('drueber'); }));
  ablage.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) laden(e.dataTransfer.files[0]); });

  async function laden(datei) {
    zustand.geladen = null; zustand.original = null; zustand.motiv = null;
    freigeben(); ergebnisZuruecksetzen(); leere($('status-2')); leere($('status-3'));
    zeigeStatus($('status-1'), 'warten', 'Das Bild wird geladen.');
    await kurzWarten();
    let bild;
    try {
      bild = await R.ladeBild(datei);
    } catch (e) {
      $('vorschau').classList.add('versteckt');
      zeigeStatus($('status-1'), 'rot', fehlerSatz('Das Bild geht nicht. Nimm ein anderes Bild (JPG, PNG oder WebP).', e), true);
      return;
    }
    neuesBild(bild, sichererName(datei.name || 'motiv'));
  }

  // Gemeinsamer Start für Datei, Testmotiv und Projekt
  function neuesBild(bild, name, einstellungen) {
    zustand.geladen = bild; zustand.original = bild; zustand.name = name;
    verlauf.zurueck = []; verlauf.vor = []; verlaufKnoepfe();
    const o = bild;
    zeigeStatus($('status-1'), 'gruen', 'Das Bild ist da (' + o.breite + ' × ' + o.hoehe + ' Pixel). Weiter mit Schritt 2.');
    if (einstellungen) {
      zustand.hg = einstellungen.hg; zustand.fach = einstellungen.fach; zustand.gespiegelt = einstellungen.gespiegelt;
      $('breite').value = einstellungen.breite;
    } else {
      // Hintergrund automatisch erkennen und bei einfarbigem Hintergrund gleich entfernen
      const erkannt = R.erkenneHintergrund(o.leinwand);
      zustand.hg = { entfernen: erkannt.art === 'einfarbig', farbe: erkannt.farbe, toleranz: 30, innenflaechen: false, art: erkannt.art };
      // Tonwerte und Freistellen neu, Vorlieben für die Datei (dpi, Format, Lanczos) bleiben
      const f = zustand.fach;
      zustand.fach = Object.assign({}, R.FACH_GRUND, { dpi: f.dpi, format: f.format, lanczos: f.lanczos, textil: f.textil });
      zustand.gespiegelt = false;
    }
    zustand.ansicht = 'ergebnis'; zustand.pipette = 'hg';
    felderAusZustand(); histogramm();
    hintergrundAnwenden();
    // Sinnvolle Startbreite: so breit, wie das Motiv bei 300 dpi scharf ist (höchstens 30 cm)
    if (zustand.motiv && !einstellungen) setzeBreite(Math.max(1, Math.min(30, Math.floor(zustand.motiv.breite / 300 * 2.54 * 2) / 2)));
    freigeben();
  }

  // ---------- Schritt 2: Hintergrund ----------
  function hintergrundAnwenden() {
    const o = zustand.original;
    if (!o) return;
    ergebnisZuruecksetzen();
    try {
      zustand.motiv = R.bereiteVor(o.leinwand, zustand.hg, zustand.fach);
    } catch (e) {
      zeigeStatus($('status-2'), 'rot', fehlerSatz('Das hat nicht geklappt.', e), true);
      return;
    }
    const m = zustand.motiv, hg = zustand.hg;
    vorschauZeigen();
    $('bild-info').textContent = 'Motiv: ' + m.breite + ' × ' + m.hoehe + ' Pixel' + (m.randEntfernt ? ' (leerer Rand abgeschnitten)' : '') +
      (zustand.gespiegelt ? ' · gespiegelt' : '');
    $('hg-btn').setAttribute('aria-pressed', hg.entfernen ? 'true' : 'false');
    $('hg-btn-text').textContent = hg.entfernen ? 'Hintergrund wird entfernt (antippen = behalten)' : 'Hintergrund entfernen';
    if (hg.farbe) $('hg-farbe').value = R.hex(hg.farbe);
    if (hg.entfernen && m.hintergrundEntfernt) {
      zeigeStatus($('status-2'), 'gruen', 'Der Hintergrund ist weg. Wenn noch Reste da sind: Regler nach rechts. Wenn zu viel fehlt: Regler nach links.' +
        (hg.innenflaechen || zustand.fach.verfahren !== 'rand' ? '' : ' Sind in Buchstaben noch Flächen in der alten Farbe? Dann Häkchen bei „Auch Innenflächen entfernen“.'));
    } else if (hg.entfernen) {
      zeigeStatus($('status-2'), 'gelb', zustand.fach.verfahren === 'rand'
        ? 'Diese Farbe liegt nicht am Bildrand. Tipp ins Bild auf die Farbe, die weg soll.'
        : 'Diese Farbe kommt im Bild nicht vor. Tipp ins Bild auf die Farbe, die weg soll.');
    } else if (hg.art === 'durchsichtig' || m.transparent) {
      zeigeStatus($('status-2'), 'gruen', 'Das Bild hat schon einen durchsichtigen Hintergrund.');
    } else if (hg.art === 'keiner' && !hg.farbe) {
      zeigeStatus($('status-2'), 'gelb', 'Kein einfarbiger Hintergrund gefunden. Tipp ins Bild auf die Farbe, die weg soll. Sonst wird das ganze Rechteck gedruckt.');
    } else {
      zeigeStatus($('status-2'), 'gelb', 'Der Hintergrund bleibt. Dann wird das ganze Rechteck gedruckt.');
    }
    groessePruefen();
  }

  // Vorschau in Schritt 2 je nach Ansicht. abbildung merkt sich, worauf ein Tippen zeigt.
  let abbildung = 'motiv';
  function vorschauZeigen() {
    const m = zustand.motiv, o = zustand.original, sp = zustand.gespiegelt;
    if (!m) return;
    let url;
    if (zustand.ansicht === 'original') { url = R.vorschau(o.leinwand, 700, sp); abbildung = 'original'; }
    else if (zustand.ansicht === 'vergleich') {
      const f = Math.min(1, 700 / Math.max(o.breite, o.hoehe));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(o.breite * f)); c.height = Math.max(1, Math.round(o.hoehe * f));
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(o.leinwand, 0, 0, c.width, c.height);
      g.clearRect(c.width / 2, 0, c.width, c.height);
      g.save(); g.beginPath(); g.rect(c.width / 2, 0, c.width, c.height); g.clip();
      g.drawImage(m.leinwand, m.versatz.x * f, m.versatz.y * f, m.breite * f, m.hoehe * f);
      g.restore();
      g.strokeStyle = '#ffbf00'; g.lineWidth = 3; g.beginPath(); g.moveTo(c.width / 2, 0); g.lineTo(c.width / 2, c.height); g.stroke();
      url = R.vorschau(c, 700, sp); abbildung = 'original';
    } else if (zustand.ansicht === 'maske') {
      const maske = R.weissmaske(m.leinwand, zustand.fach.basisEinziehen);
      const c = document.createElement('canvas');
      c.width = maske.width; c.height = maske.height;
      const g = c.getContext('2d');
      g.fillStyle = '#172126'; g.fillRect(0, 0, c.width, c.height); g.drawImage(maske, 0, 0);
      url = R.vorschau(c, 700, sp); abbildung = 'motiv';
    } else { url = R.vorschau(m.leinwand, 700, sp); abbildung = 'motiv'; }
    $('vorschau-bild').src = url;
    $('vorschau').classList.remove('versteckt');
    textilZeigen();
  }

  $('hg-btn').addEventListener('click', () => {
    if (!zustand.hg.farbe) { zeigeStatus($('status-2'), 'gelb', 'Tipp zuerst ins Bild auf die Farbe, die weg soll.'); return; }
    merken();
    zustand.hg.entfernen = !zustand.hg.entfernen;
    hintergrundAnwenden();
  });
  let reglerPause = null;
  $('toleranz').addEventListener('input', () => {
    merken('toleranz');
    zustand.hg.toleranz = Number($('toleranz').value);
    clearTimeout(reglerPause); reglerPause = setTimeout(hintergrundAnwenden, 200);
  });
  $('innen').addEventListener('change', () => { merken(); zustand.hg.innenflaechen = $('innen').checked; hintergrundAnwenden(); });
  // Antippen: Punkt in der Vorschau auf das Originalbild umrechnen und dort messen.
  // Standard: Farbe, die weg soll; nach „Schwarzpunkt/Weißpunkt antippen“ der Tonwert.
  $('vorschau-bild').addEventListener('click', (e) => {
    if (!zustand.original || !zustand.motiv) return;
    const rahmen = e.currentTarget.getBoundingClientRect();
    const o = zustand.original, m = zustand.motiv;
    let fx = (e.clientX - rahmen.left) / rahmen.width;
    const fy = (e.clientY - rahmen.top) / rahmen.height;
    if (zustand.gespiegelt) fx = 1 - fx;
    const x = abbildung === 'original' ? fx * o.breite : m.versatz.x + fx * m.breite;
    const y = abbildung === 'original' ? fy * o.hoehe : m.versatz.y + fy * m.hoehe;
    const farbe = R.farbeAn(o.leinwand, x, y);
    merken();
    if (zustand.pipette === 'schwarz' || zustand.pipette === 'weiss') {
      const ton = Math.round(0.2126 * farbe[0] + 0.7152 * farbe[1] + 0.0722 * farbe[2]);
      if (zustand.pipette === 'schwarz') zustand.fach.schwarz = Math.min(ton, zustand.fach.weiss - 1);
      else zustand.fach.weiss = Math.max(ton, zustand.fach.schwarz + 1);
      werkzeugMeldung('gruen', (zustand.pipette === 'schwarz' ? 'Schwarzpunkt' : 'Weißpunkt') + ' auf ' + ton + ' gesetzt.');
      zustand.pipette = 'hg';
      felderAusZustand();
    } else {
      zustand.hg.farbe = farbe;
      zustand.hg.entfernen = true;
    }
    hintergrundAnwenden();
  });

  // ---------- Schritt 3: Größe ----------
  function formatCm(v) { return String(Math.round(v * 10) / 10).replace('.', ','); }
  function breiteCm() { return Number(String($('breite').value).replace(',', '.')); }
  function setzeBreite(v) { $('breite').value = formatCm(Math.max(1, Math.min(300, v))); groessePruefen(); }
  $('breite-minus').addEventListener('click', () => { merken(); setzeBreite(Math.floor(breiteCm() - 0.001) || 1); });
  $('breite-plus').addEventListener('click', () => { merken(); setzeBreite(Math.ceil(breiteCm() + 0.001)); });
  document.querySelectorAll('.schnell-btn').forEach((b) => b.addEventListener('click', () => { merken(); setzeBreite(Number(b.dataset.cm)); }));
  let tippPause = null;
  $('breite').addEventListener('input', () => { merken('breite'); clearTimeout(tippPause); tippPause = setTimeout(groessePruefen, 400); });

  const SATZ = {
    gruen: 'Das Bild ist scharf genug für diese Größe.',
    gelb: 'Das Bild ist eigentlich zu klein für diese Größe. Die App rechnet es hoch und glättet es.',
  };
  function groessePruefen() {
    ergebnisZuruecksetzen();
    if (!zustand.motiv) return;
    let e;
    try { e = R.pruefeBreite(zustand.motiv, breiteCm(), zustand.fach.dpi); }
    catch (f) { $('hoehe').textContent = ''; zeigeStatus($('status-3'), 'rot', fehlerSatz('Die Größe geht so nicht.', f), true); freigeben(); return; }
    const g = e.groesse, a = e.aufloesung;
    $('hoehe').textContent = 'Höhe: ' + formatCm(g.hoeheMm / 10) + ' cm';
    if (document.activeElement !== $('hoehe-cm')) $('hoehe-cm').value = formatCm(g.hoeheMm / 10);
    let satz = SATZ[a.ampel] + ' (' + Math.round(a.dpi) + ' dpi)';
    if (a.dpi < 150) satz = 'Das Bild ist viel zu klein für diese Größe (' + Math.round(a.dpi) + ' dpi). Die App rechnet es hoch, es kann aber weich wirken. Besser kleiner drucken.';
    zeigeStatus($('status-3'), a.ampel, satz);
    freigeben();
  }
  // Höhe vorgeben: Breite folgt aus dem Seitenverhältnis des Motivs
  let hoehePause = null;
  $('hoehe-cm').addEventListener('input', () => {
    clearTimeout(hoehePause);
    hoehePause = setTimeout(() => {
      const h = Number(String($('hoehe-cm').value).replace(',', '.'));
      if (!zustand.motiv || !(h > 0)) return;
      merken('hoehe');
      setzeBreite(h * zustand.motiv.breite / zustand.motiv.hoehe);
    }, 500);
  });

  // ---------- Schritt 4: Druck-Datei ----------
  const machenBtn = $('machen-btn');
  function ergebnisZuruecksetzen() {
    if (zustand.dateiUrl) { URL.revokeObjectURL(zustand.dateiUrl); zustand.dateiUrl = null; }
    zustand.letzte = null;
    leere($('status-4'));
    $('pflicht').classList.add('versteckt');
    $('pflicht-bild').checked = false; $('pflicht-groesse').checked = false;
    $('speichern-bereich').classList.add('versteckt');
    $('pruef-details').classList.add('versteckt');
    $('ergebnis-bild').classList.add('versteckt');
    ['detail-btn', 'maske-btn'].forEach((id) => { $(id).disabled = true; });
  }
  ['kanten', 'schaerfen', 'logo'].forEach((id) => $(id).addEventListener('change', ergebnisZuruecksetzen));
  function freigeben() {
    const bild = !!zustand.motiv;
    let groesseOk = false;
    if (bild) { try { R.pruefeBreite(zustand.motiv, breiteCm(), zustand.fach.dpi); groesseOk = true; } catch (e) { groesseOk = false; } }
    $('schritt-2').classList.toggle('aus', !bild);
    $('schritt-3').classList.toggle('aus', !bild);
    $('schritt-4').classList.toggle('aus', !groesseOk);
    ['hg-btn', 'toleranz', 'innen', 'breite', 'breite-minus', 'breite-plus', 'hoehe-cm',
      'zuschnitt-btn', 'original-btn', 'beschnitt-btn', 'spiegeln-btn', 'pip-schwarz-btn', 'pip-weiss-btn',
      'projekt-speichern-btn', 'bogen-dazu-btn'].forEach((id) => { $(id).disabled = !bild; });
    $('svg-btn').disabled = !groesseOk;
    document.querySelectorAll('.schnell-btn').forEach((b) => { b.disabled = !bild; });
    machenBtn.disabled = !groesseOk;
  }

  function dateiOptionen() {
    const f = zustand.fach;
    return {
      kantenGlaetten: $('kanten').checked, schaerfen: $('schaerfen').checked, logoGlaetten: $('logo').checked,
      dpi: f.dpi, lanczos: f.lanczos, einziehen: f.einziehen, raster: f.raster, lpi: f.lpi, winkel: f.winkel, form: f.form,
      gespiegelt: zustand.gespiegelt,
    };
  }

  const EINFACH = {
    hintergrund: 'Das Bild hat keinen durchsichtigen Hintergrund. Das ganze Rechteck wird gedruckt.',
    halbtransparenz: 'Das Bild hat weiche Kanten.',
    spiegeln: 'Die Datei ist gespiegelt.',
  };
  machenBtn.addEventListener('click', async () => {
    ergebnisZuruecksetzen();
    machenBtn.disabled = true;
    zeigeStatus($('status-4'), 'warten', 'Die Druck-Datei wird gemacht. Bei großen Drucken kann das eine Minute dauern.');
    await kurzWarten();
    const format = zustand.fach.format || 'png';
    let daten;
    try {
      daten = await R.erzeugeRipDatei(zustand.motiv, breiteCm(), Object.assign(dateiOptionen(), { format }));
    } catch (fehler) {
      machenBtn.disabled = false;
      zeigeStatus($('status-4'), 'rot', fehlerSatz('Das hat nicht geklappt. Bitte hol eine Fachkraft.', fehler), true);
      return;
    }
    machenBtn.disabled = false;
    const p = daten.bericht;
    const liste = $('pruef-liste');
    liste.replaceChildren();
    p.punkte.forEach((punkt) => {
      const li = document.createElement('li');
      const z = document.createElement('span'); z.className = 'zeichen';
      z.textContent = { gruen: '✓ Gut', gelb: '! Achtung', rot: '✗ Stopp' }[punkt.ampel];
      const t = document.createElement('span'); t.textContent = punkt.label + ': ' + punkt.hinweis;
      li.append(z, t); liste.appendChild(li);
    });
    $('pruef-details').classList.remove('versteckt');
    $('ergebnis-img').src = daten.vorschauUrl;
    $('ergebnis-bild').classList.remove('versteckt');
    textilZeigen();

    const cm = (mm) => formatCm(mm / 10);
    const groesse = cm(daten.groesse.breiteMm) + ' × ' + cm(daten.groesse.hoeheMm) + ' cm';
    const dateiname = 'texstyle-dtf-' + cm(daten.groesse.breiteMm).replace(',', '_') + 'cm' +
      (zustand.fach.dpi !== 300 ? '-' + zustand.fach.dpi + 'dpi' : '') + '.' + format;
    zustand.letzte = { leinwand: daten.leinwand, blob: daten.blob, dateiname, groesse: daten.groesse };
    zustand.dateiUrl = URL.createObjectURL(daten.blob);
    $('speichern-link').href = zustand.dateiUrl;
    $('speichern-link').download = dateiname;
    $('ordner-btn').classList.toggle('versteckt', typeof window.showSaveFilePicker !== 'function');
    $('detail-btn').disabled = false;
    // Pflicht-Häkchen: erst nach der Sichtprüfung lässt sich speichern
    $('pflicht').classList.remove('versteckt');
    pflichtPruefen();
    const hinweise = p.punkte.filter((x) => x.ampel === 'gelb' && EINFACH[x.schluessel]).map((x) => EINFACH[x.schluessel]).join(' ');
    zustand.fertigSatz = 'Die Datei für den Drucker ist fertig: ' + groesse + ', ' + zustand.fach.dpi + ' dpi' + (format === 'pdf' ? ', PDF' : '') + '. ' +
      (hinweise ? hinweise + ' ' : '');
    zustand.fertigAmpel = p.gesamt_ampel === 'gruen' ? 'gruen' : 'gelb';
    zeigeStatus($('status-4'), zustand.fertigAmpel, zustand.fertigSatz + 'Prüf das Bild und hake beide Punkte darunter ab. Dann kannst du speichern.');
    $('pflicht-bild').focus();
  });
  function freigegeben() { return !!zustand.letzte && $('pflicht-bild').checked && $('pflicht-groesse').checked; }
  function pflichtPruefen() {
    const ok = freigegeben();
    $('speichern-bereich').classList.toggle('versteckt', !ok);
    $('maske-btn').disabled = !ok;
    return ok;
  }
  ['pflicht-bild', 'pflicht-groesse'].forEach((id) => $(id).addEventListener('change', () => {
    if (!zustand.letzte) return;
    const ok = pflichtPruefen();
    zeigeStatus($('status-4'), zustand.fertigAmpel, zustand.fertigSatz + (ok
      ? 'Geprüft. Drück auf „Datei speichern“.'
      : 'Prüf das Bild und hake beide Punkte darunter ab. Dann kannst du speichern.'));
  }));
  // Auch ein programmatischer Klick speichert nie ohne Häkchen
  $('speichern-link').addEventListener('click', (e) => { if (!freigegeben()) e.preventDefault(); });
  $('ordner-btn').addEventListener('click', async () => {
    const l = zustand.letzte;
    if (!l || !freigegeben()) return;
    const satz = await speichere(l.blob, l.dateiname);
    if (satz) zeigeStatus($('status-4'), 'gruen', satz);
  });

  // =====================================================================
  // Werkzeuge für Fachkräfte
  // =====================================================================
  // Felder <-> zustand.fach. typ: Zahl, Haken, Text (Farbe/Auswahl)
  const FACH_FELDER = {
    verfahren: ['verfahren', 'text'], weich: ['weich', 'zahl'], schriftFarbe: ['schrift-farbe', 'text'],
    schriftRauschen: ['schrift-rauschen', 'zahl'], schriftKontrast: ['schrift-kontrast', 'zahl'],
    saeume: ['saeume', 'haken'], aussparen: ['aussparen', 'haken'], textil: ['textil-farbe', 'text'],
    schwarz: ['schwarz', 'zahl'], weiss: ['weiss', 'zahl'], gamma: ['gamma', 'zahl'], farbton: ['farbton', 'zahl'],
    saettigung: ['saettigung', 'zahl'], helligkeit: ['helligkeit', 'zahl'], einziehen: ['einziehen', 'zahl'],
    raster: ['raster', 'haken'], lpi: ['lpi', 'zahl'], winkel: ['winkel', 'zahl'], form: ['form', 'text'],
    basisEinziehen: ['basis-einziehen', 'zahl'], dpi: ['dpi', 'zahl'], lanczos: ['lanczos', 'haken'], format: ['format', 'text'],
  };
  // Felder, die nur die fertige Datei betreffen (keine neue Vorschau nötig)
  const NUR_DATEI = ['einziehen', 'raster', 'lpi', 'winkel', 'form', 'lanczos', 'format', 'dpi'];
  function feldWert(id, typ) {
    const el = $(id);
    return typ === 'haken' ? el.checked : typ === 'zahl' ? Number(el.value) : el.value;
  }
  function ausgabenAktualisieren() {
    Object.values(FACH_FELDER).forEach(([id]) => { const aus = $(id + '-aus'); if (aus) aus.textContent = $(id).value; });
    $('svg-schwelle-aus').textContent = $('svg-schwelle').value;
    $('schrift-regler').classList.toggle('versteckt', $('verfahren').value !== 'schrift');
    $('raster-regler').classList.toggle('versteckt', !$('raster').checked);
  }
  function felderAusZustand() {
    const f = zustand.fach;
    for (const k in FACH_FELDER) {
      const [id, typ] = FACH_FELDER[k];
      if (typ === 'haken') $(id).checked = !!f[k]; else $(id).value = String(f[k]);
    }
    $('toleranz').value = zustand.hg.toleranz; $('innen').checked = !!zustand.hg.innenflaechen;
    if (zustand.hg.farbe) $('hg-farbe').value = R.hex(zustand.hg.farbe);
    $('spiegeln-btn').setAttribute('aria-pressed', zustand.gespiegelt ? 'true' : 'false');
    document.querySelectorAll('.ansicht-btn').forEach((b) => b.setAttribute('aria-pressed', b.dataset.ansicht === zustand.ansicht ? 'true' : 'false'));
    ausgabenAktualisieren();
  }
  let fachPause = null;
  for (const k in FACH_FELDER) {
    const [id, typ] = FACH_FELDER[k];
    const ereignis = typ === 'haken' || $(id).tagName === 'SELECT' || $(id).type === 'color' ? 'change' : 'input';
    $(id).addEventListener(ereignis, () => {
      merken('fach-' + k);
      zustand.fach[k] = feldWert(id, typ);
      if (k === 'schwarz' && zustand.fach.schwarz >= zustand.fach.weiss) { zustand.fach.weiss = zustand.fach.schwarz + 1; $('weiss').value = zustand.fach.weiss; }
      if (k === 'weiss' && zustand.fach.weiss <= zustand.fach.schwarz) { zustand.fach.schwarz = zustand.fach.weiss - 1; $('schwarz').value = zustand.fach.schwarz; }
      ausgabenAktualisieren();
      if (!zustand.original) return;
      if (NUR_DATEI.includes(k)) { groessePruefen(); return; }
      if (k === 'basisEinziehen' && zustand.ansicht !== 'maske') return;
      clearTimeout(fachPause); fachPause = setTimeout(hintergrundAnwenden, 200);
    });
  }
  $('hg-farbe').addEventListener('change', () => {
    if (!zustand.original) return;
    merken();
    const v = $('hg-farbe').value;
    zustand.hg.farbe = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
    zustand.hg.entfernen = true;
    hintergrundAnwenden();
  });
  $('schrift-preset-btn').addEventListener('click', () => {
    if (!zustand.original) { werkzeugMeldung('gelb', 'Bitte zuerst ein Bild aussuchen.'); return; }
    merken();
    Object.assign(zustand.fach, { verfahren: 'schrift', schriftRauschen: 4, schriftKontrast: 20, einziehen: 0, raster: false });
    if (!zustand.hg.farbe) zustand.hg.farbe = [255, 255, 255];
    zustand.hg.entfernen = true;
    felderAusZustand(); hintergrundAnwenden();
    werkzeugMeldung('gruen', 'Schriftmodus ist an. Hintergrund- und Schriftfarbe prüfen.');
  });
  $('ton-zurueck-btn').addEventListener('click', () => {
    merken();
    Object.assign(zustand.fach, { schwarz: 0, weiss: 255, gamma: 1, farbton: 0, saettigung: 0, helligkeit: 0 });
    felderAusZustand(); hintergrundAnwenden();
  });
  function pipette(art) {
    zustand.pipette = art;
    zustand.ansicht = 'original'; felderAusZustand(); vorschauZeigen();
    zeigeStatus($('status-2'), 'gelb', 'Tipp jetzt im Bild auf die Stelle, die ' + (art === 'schwarz' ? 'ganz schwarz' : 'ganz weiß') + ' werden soll.');
    $('schritt-2').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('pip-schwarz-btn').addEventListener('click', () => pipette('schwarz'));
  $('pip-weiss-btn').addEventListener('click', () => pipette('weiss'));

  // Helligkeitsverteilung des aktuellen Bildes
  function histogramm() {
    const ziel = $('histogramm'), g = ziel.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    if (!zustand.original) return;
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const cg = c.getContext('2d', { willReadFrequently: true });
    cg.drawImage(zustand.original.leinwand, 0, 0, 128, 128);
    const d = cg.getImageData(0, 0, 128, 128).data, faecher = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) if (d[i + 3]) faecher[Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])]++;
    const max = Math.max(1, ...faecher);
    g.fillStyle = document.documentElement.classList.contains('dunkel') ? '#c9d0d6' : '#0b4a8b';
    faecher.forEach((n, x) => g.fillRect(x, 64 - n / max * 60, 1, n / max * 60));
  }

  // Ansicht und Textilvorschau
  document.querySelectorAll('.ansicht-btn').forEach((b) => b.addEventListener('click', () => {
    zustand.ansicht = b.dataset.ansicht; zustand.pipette = 'hg';
    felderAusZustand(); vorschauZeigen();
  }));
  function textilZeigen() {
    document.querySelectorAll('.karo').forEach((k) => {
      k.classList.toggle('textil', !!zustand.textil);
      k.style.backgroundColor = zustand.textil || '';
    });
    $('karo-btn').setAttribute('aria-pressed', zustand.textil ? 'false' : 'true');
    document.querySelectorAll('.textil-btn').forEach((b) => b.setAttribute('aria-pressed', b.dataset.textil === zustand.textil ? 'true' : 'false'));
  }
  $('karo-btn').addEventListener('click', () => { zustand.textil = null; textilZeigen(); });
  document.querySelectorAll('.textil-btn').forEach((b) => b.addEventListener('click', () => { zustand.textil = b.dataset.textil; textilZeigen(); }));
  $('textil-eigen-btn').addEventListener('click', () => { zustand.textil = zustand.fach.textil; textilZeigen(); });

  // Spiegeln
  $('spiegeln-btn').addEventListener('click', () => {
    merken(); zustand.gespiegelt = !zustand.gespiegelt; felderAusZustand(); hintergrundAnwenden();
  });

  // ---------- Zuschnitt ----------
  function schneideZu(p, neueBreiteCm) {
    const o = zustand.original;
    if (p.x === 0 && p.y === 0 && p.w === o.breite && p.h === o.hoehe) { werkzeugMeldung('gruen', 'Das ganze Bild bleibt erhalten.'); return; }
    merken();
    const c = document.createElement('canvas'); c.width = p.w; c.height = p.h;
    c.getContext('2d').drawImage(o.leinwand, p.x, p.y, p.w, p.h, 0, 0, p.w, p.h);
    zustand.original = { leinwand: c, breite: p.w, hoehe: p.h };
    $('breite').value = formatCm(Math.max(1, Math.min(300, neueBreiteCm)));
    histogramm(); hintergrundAnwenden();
    werkzeugMeldung('gruen', 'Ausschnitt übernommen: ' + p.w + ' × ' + p.h + ' Pixel. Bitte die Druckgröße prüfen. Rückgängig geht oben.');
  }
  $('beschnitt-btn').addEventListener('click', () => werkzeug(() => {
    const a = Number($('beschnitt-x').value), b = Number($('beschnitt-y').value);
    if (!(a >= 0 && a <= 45 && b >= 0 && b <= 45)) throw new R.RipFehler('Beschnitt zwischen 0 und 45 % wählen.');
    const o = zustand.original;
    const p = S.cropPixels({ x: a / 100, y: b / 100, w: 1 - 2 * a / 100, h: 1 - 2 * b / 100 }, o.breite, o.hoehe);
    schneideZu(p, breiteCm() * p.w / o.breite);
    $('beschnitt-x').value = 0; $('beschnitt-y').value = 0;
  }));
  $('original-btn').addEventListener('click', () => {
    if (!zustand.geladen) return;
    merken();
    zustand.original = zustand.geladen;
    histogramm(); hintergrundAnwenden();
    werkzeugMeldung('gruen', 'Das geladene Original ist wieder da.');
  });

  const zs = { rechteck: null, neu: true, ziehen: null, basis: null };
  const zsBuehne = $('zs-buehne'), zsRahmen = $('zs-rahmen'), zsDialog = $('zuschnitt-dialog');
  const ZS_FELDER = ['zs-x', 'zs-y', 'zs-b', 'zs-h'];
  function zsPixel() { const o = zustand.original; return S.cropPixels(zs.rechteck, o.breite, o.hoehe); }
  function zsNeueBreite(p) {
    const o = zustand.original;
    return $('zs-groesse').value === 'breite' ? breiteCm() : breiteCm() * p.w / o.breite;
  }
  function zsInfo() {
    const p = zsPixel(), b = zsNeueBreite(p);
    const ok = b >= 1 && b <= 300;
    $('zs-info').textContent = 'Auswahl: ' + p.w + ' × ' + p.h + ' Pixel. Druckgröße danach: ' + formatCm(b) + ' × ' + formatCm(b * p.h / p.w) + ' cm' +
      (zustand.gespiegelt ? ' (gespiegelt angezeigt)' : '') + (ok ? '.' : '. Die Breite muss zwischen 1 und 300 cm liegen.');
    $('zs-ok-btn').disabled = !ok;
  }
  function zsMalen() {
    const r = zs.rechteck, c = $('zs-leinwand'), g = c.getContext('2d');
    zsRahmen.style.left = r.x * 100 + '%'; zsRahmen.style.top = r.y * 100 + '%';
    zsRahmen.style.width = r.w * 100 + '%'; zsRahmen.style.height = r.h * 100 + '%';
    const x = r.x * c.width, y = r.y * c.height, w = r.w * c.width, h = r.h * c.height;
    g.clearRect(0, 0, c.width, c.height); g.drawImage(zs.basis, 0, 0);
    g.fillStyle = 'rgba(0,0,0,.6)';
    g.fillRect(0, 0, c.width, y); g.fillRect(0, y + h, c.width, c.height - y - h); g.fillRect(0, y, x, h); g.fillRect(x + w, y, c.width - x - w, h);
    const p = zsPixel();
    [p.x, p.y, p.w, p.h].forEach((v, i) => { $(ZS_FELDER[i]).value = v; });
    zsInfo();
  }
  function zsNeu(an) { zs.neu = an; $('zs-neu-btn').setAttribute('aria-pressed', an ? 'true' : 'false'); }
  $('zuschnitt-btn').addEventListener('click', () => {
    const o = zustand.original;
    if (!o) return;
    const c = $('zs-leinwand'), f = Math.min(1, 1400 / Math.max(o.breite, o.hoehe));
    c.width = Math.max(1, Math.round(o.breite * f)); c.height = Math.max(1, Math.round(o.hoehe * f));
    zs.basis = document.createElement('canvas'); zs.basis.width = c.width; zs.basis.height = c.height;
    const g = zs.basis.getContext('2d');
    if (zustand.gespiegelt) { g.translate(c.width, 0); g.scale(-1, 1); }
    g.drawImage(o.leinwand, 0, 0, c.width, c.height);
    zsBuehne.style.width = 'min(100%, ' + (55 * o.breite / o.hoehe).toFixed(2) + 'vh)';
    zs.rechteck = { x: 0, y: 0, w: 1, h: 1 }; zsNeu(true); $('zs-groesse').value = 'proportional';
    zsMalen(); zsDialog.showModal();
  });
  function zsSchliessen() { zsDialog.close(); }
  zsDialog.addEventListener('close', () => { if (zs.basis) { zs.basis.width = 1; zs.basis = null; } $('zs-leinwand').width = 1; });
  $('zs-abbrechen-btn').addEventListener('click', zsSchliessen);
  $('zs-neu-btn').addEventListener('click', () => zsNeu(true));
  $('zs-ganz-btn').addEventListener('click', () => { zs.rechteck = { x: 0, y: 0, w: 1, h: 1 }; zsNeu(true); zsMalen(); });
  $('zs-groesse').addEventListener('change', zsInfo);
  function zsPunkt(e) {
    const b = zsBuehne.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)), y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)) };
  }
  zsBuehne.addEventListener('pointerdown', (e) => {
    if (!zs.basis || e.isPrimary === false || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const p = zsPunkt(e), r = zs.rechteck, ecke = e.target.dataset ? e.target.dataset.ecke : null;
    const drin = p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    zs.ziehen = { id: e.pointerId, start: p, rechteck: Object.assign({}, r), art: ecke || (!zs.neu && drin ? 'schieben' : 'neu') };
    zsBuehne.setPointerCapture(e.pointerId);
  });
  zsBuehne.addEventListener('pointermove', (e) => {
    const z = zs.ziehen;
    if (!z || z.id !== e.pointerId) return;
    e.preventDefault();
    const o = zustand.original, p = zsPunkt(e), dx = p.x - z.start.x, dy = p.y - z.start.y, minB = 1 / o.breite, minH = 1 / o.hoehe;
    zs.rechteck = z.art === 'schieben' ? S.moveCropRect(z.rechteck, dx, dy)
      : z.art === 'neu' ? S.drawCropRect(z.start, p, minB, minH) : S.resizeCropRect(z.rechteck, z.art, dx, dy, minB, minH);
    zsMalen();
  });
  zsBuehne.addEventListener('pointerup', (e) => { if (zs.ziehen && zs.ziehen.id === e.pointerId) { zs.ziehen = null; zsNeu(false); zsInfo(); } });
  zsBuehne.addEventListener('pointercancel', (e) => { if (zs.ziehen && zs.ziehen.id === e.pointerId) { zs.rechteck = zs.ziehen.rechteck; zs.ziehen = null; zsMalen(); } });
  zsRahmen.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const o = zustand.original, schritt = e.shiftKey ? 10 : 1;
    const dx = (e.key === 'ArrowLeft' ? -schritt : e.key === 'ArrowRight' ? schritt : 0) / o.breite;
    const dy = (e.key === 'ArrowUp' ? -schritt : e.key === 'ArrowDown' ? schritt : 0) / o.hoehe;
    const ecke = e.target.dataset ? e.target.dataset.ecke : null;
    zs.rechteck = ecke ? S.resizeCropRect(zs.rechteck, ecke, dx, dy, 1 / o.breite, 1 / o.hoehe) : S.moveCropRect(zs.rechteck, dx, dy);
    zsNeu(false); zsMalen();
  });
  ZS_FELDER.forEach((id) => $(id).addEventListener('change', () => {
    const o = zustand.original, [x, y, w, h] = ZS_FELDER.map((i) => Number($(i).value));
    if (![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0 || w < 1 || h < 1 || x + w > o.breite || y + h > o.hoehe) {
      $('zs-info').textContent = 'Die Auswahl muss im Bild liegen (' + o.breite + ' × ' + o.hoehe + ' Pixel). Ganze Zahlen eingeben.';
      $('zs-ok-btn').disabled = true; return;
    }
    zs.rechteck = { x: x / o.breite, y: y / o.hoehe, w: w / o.breite, h: h / o.hoehe }; zsNeu(false); zsMalen();
  }));
  $('zs-ok-btn').addEventListener('click', () => {
    const o = zustand.original;
    // Rechteck bezieht sich auf die (evtl. gespiegelte) Anzeige; cropPixels rechnet zurück
    const p = S.cropPixels(zs.rechteck, o.breite, o.hoehe, zustand.gespiegelt);
    const b = zsNeueBreite(p);
    zsSchliessen();
    schneideZu(p, b);
  });

  // ---------- 100-%-Ansicht und Weißmaske ----------
  $('detail-btn').addEventListener('click', () => {
    const l = zustand.letzte;
    if (!l) return;
    const c = $('detail-leinwand');
    c.width = l.leinwand.width; c.height = l.leinwand.height;
    c.getContext('2d').drawImage(l.leinwand, 0, 0);
    $('detail-info').textContent = l.leinwand.width + ' × ' + l.leinwand.height + ' Pixel. Ein Bildpixel ist ein Bildschirmpixel. Zum Prüfen zur Seite und nach unten schieben.';
    textilZeigen();
    $('detail-dialog').showModal();
  });
  $('detail-zu-btn').addEventListener('click', () => $('detail-dialog').close());
  $('detail-dialog').addEventListener('close', () => { $('detail-leinwand').width = 1; $('detail-leinwand').height = 1; });
  $('maske-btn').addEventListener('click', () => werkzeug(async () => {
    const l = zustand.letzte;
    if (!l || !freigegeben()) { werkzeugMeldung('gelb', 'Erst in Schritt 4 beide Punkte abhaken.'); return; }
    werkzeugMeldung('warten', 'Die Weißmaske wird gemacht.');
    await kurzWarten();
    const blob = await R.weissmaskeDatei(l.leinwand, zustand.fach.basisEinziehen, zustand.fach.dpi);
    const satz = await speichere(blob, l.dateiname.replace(/\.(png|pdf)$/, '') + '-weissmaske.png');
    if (satz) werkzeugMeldung('gruen', satz + ' Die Maske im RIP passend zuordnen.');
    else leere($('status-w'));
  }));
  $('svg-btn').addEventListener('click', () => werkzeug(async () => {
    const blob = R.svgKonturen(zustand.motiv, breiteCm(), Number($('svg-schwelle').value), $('svg-farbe').value, zustand.gespiegelt);
    const satz = await speichere(blob, zustand.name + '-konturen.svg');
    if (satz) werkzeugMeldung('gruen', satz);
  }, 'Die Konturen gingen nicht.'));
  $('svg-schwelle').addEventListener('input', ausgabenAktualisieren);

  // ---------- Projekte (.texdtf) ----------
  function bildAlsDaten(c) { return c.toDataURL('image/png'); }
  function bildAusDaten(daten) {
    return new Promise((ok, fehler) => {
      if (typeof daten !== 'string' || !daten.startsWith('data:image/png;base64,')) { fehler(new R.RipFehler('Ungültige Bilddaten im Projekt.')); return; }
      const im = new Image();
      im.onload = () => {
        if (im.width * im.height > 100000000) { fehler(new R.RipFehler('Das Bild im Projekt ist zu groß.')); return; }
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        c.getContext('2d').drawImage(im, 0, 0);
        ok({ leinwand: c, breite: c.width, hoehe: c.height });
      };
      im.onerror = () => fehler(new R.RipFehler('Das Bild im Projekt ist beschädigt.'));
      im.src = daten;
    });
  }
  // Werte aus einer Datei nie ungeprüft übernehmen: Zahlen begrenzen, Farben und Auswahl prüfen
  function pruefeFach(roh) {
    const f = Object.assign({}, R.FACH_GRUND);
    if (!roh || typeof roh !== 'object') return f;
    for (const k in FACH_FELDER) {
      const [id, typ] = FACH_FELDER[k], v = roh[k], el = $(id);
      if (v === undefined) continue;
      if (typ === 'haken') f[k] = !!v;
      else if (typ === 'zahl') {
        const n = Number(v);
        if (!Number.isFinite(n)) continue;
        if (el.tagName === 'SELECT') { if ([...el.options].some((x) => Number(x.value) === n)) f[k] = n; }
        else f[k] = Math.min(Number(el.max), Math.max(Number(el.min), n));
      } else if (el.type === 'color') { if (/^#[0-9a-fA-F]{6}$/.test(v)) f[k] = v.toLowerCase(); }
      else if ([...el.options].some((x) => x.value === v)) f[k] = v;
    }
    if (f.schwarz >= f.weiss) { f.schwarz = 0; f.weiss = 255; }
    return f;
  }
  function pruefeHg(roh) {
    const hg = HG_GRUND();
    if (!roh || typeof roh !== 'object') return hg;
    hg.entfernen = !!roh.entfernen; hg.innenflaechen = !!roh.innenflaechen;
    if (Array.isArray(roh.farbe) && roh.farbe.length >= 3 && roh.farbe.slice(0, 3).every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) hg.farbe = roh.farbe.slice(0, 3);
    const t = Number(roh.toleranz);
    if (Number.isFinite(t)) hg.toleranz = Math.min(80, Math.max(0, Math.round(t)));
    if (!hg.farbe) hg.entfernen = false;
    return hg;
  }
  function pruefeBreiteWert(v) { const n = Number(String(v).replace(',', '.')); return formatCm(Number.isFinite(n) ? Math.min(300, Math.max(1, n)) : 10); }

  // Projekt aus dem Texstyle DTF Studio in eigene Einstellungen übersetzen
  function ausStudio(p) {
    const s = p.settings || {}, farbe = (h) => (/^#[0-9a-fA-F]{6}$/.test(h || '') ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null);
    return {
      hg: pruefeHg({ entfernen: !!s.remove, farbe: farbe(s.bg), toleranz: s.tol, innenflaechen: false }),
      fach: pruefeFach({
        verfahren: { all: 'ueberall', text: 'schrift', edge: 'rand' }[s.removeMode] || 'rand', weich: s.soft,
        schriftFarbe: s.textInk, schriftRauschen: s.textNoise, schriftKontrast: s.textContrast, saeume: s.dehalo,
        aussparen: s.knock, textil: s.shirt, schwarz: s.black, weiss: s.white, gamma: s.gamma, farbton: s.hue,
        saettigung: s.sat, helligkeit: s.light, einziehen: s.choke, raster: s.halftone, lpi: s.lpi, winkel: s.angle,
        form: s.shape, basisEinziehen: s.baseChoke, dpi: s.dpi,
      }),
      breite: pruefeBreiteWert(s.width), gespiegelt: !!p.mirrored,
    };
  }

  $('projekt-speichern-btn').addEventListener('click', () => werkzeug(async () => {
    if (!zustand.original) return;
    werkzeugMeldung('warten', 'Das Projekt wird gespeichert.');
    await kurzWarten();
    const projekt = {
      typ: 'texstyle-dtf-app', version: 1, name: zustand.name, bild: bildAlsDaten(zustand.original.leinwand),
      hg: zustand.hg, fach: zustand.fach, breite: $('breite').value, gespiegelt: zustand.gespiegelt,
      bogen: zustand.bogen.map((m) => ({ name: m.name, bild: bildAlsDaten(m.bild.leinwand), breiteCm: m.breiteCm, menge: m.menge, optionen: m.optionen })),
      anordnung: zustand.anordnung,
    };
    const satz = await speichere(new Blob([JSON.stringify(projekt)], { type: 'application/json' }), zustand.name + '.texdtf');
    if (satz) werkzeugMeldung('gruen', satz + ' Das Projekt enthält das Bild: nur im freigegebenen Arbeitsordner ablegen.');
    else leere($('status-w'));
  }, 'Das Projekt ging nicht zu speichern.'));
  $('projekt-oeffnen-btn').addEventListener('click', () => $('projekt-input').click());
  $('projekt-input').addEventListener('change', () => {
    const datei = $('projekt-input').files[0];
    $('projekt-input').value = '';
    if (!datei) return;
    werkzeug(async () => {
      if (datei.size > 200 * 1024 * 1024) throw new R.RipFehler('Die Projektdatei ist zu groß (höchstens 200 MB).');
      werkzeugMeldung('warten', 'Das Projekt wird geöffnet.');
      let p;
      try { p = JSON.parse(await datei.text()); } catch (e) { throw new R.RipFehler('Das ist keine gültige Projektdatei.'); }
      if (p && p.type === 'texstyle-dtf' && p.version === 1) {
        const bild = await bildAusDaten(p.source);
        neuesBild(bild, sichererName(p.name || 'motiv'), ausStudio(p));
        werkzeugMeldung('gruen', 'Projekt aus dem Texstyle DTF Studio geöffnet. Ein Sammelbogen daraus wird nicht übernommen.');
        return;
      }
      if (!p || p.typ !== 'texstyle-dtf-app' || p.version !== 1) throw new R.RipFehler('Das ist keine gültige Projektdatei.');
      const bild = await bildAusDaten(p.bild);
      const bogen = [];
      if (Array.isArray(p.bogen)) {
        if (p.bogen.length > 20) throw new R.RipFehler('Zu viele Motive im Sammelbogen.');
        for (const m of p.bogen) {
          const b = await bildAusDaten(m.bild);
          const menge = Math.round(Number(m.menge)), breite = Number(m.breiteCm);
          if (!(menge >= 1 && menge <= 100) || !(breite > 0 && breite <= 120)) throw new R.RipFehler('Ungültige Angaben im Sammelbogen.');
          bogen.push({ name: sichererName(m.name || 'motiv'), bild: b, breiteCm: breite, menge, optionen: pruefeOptionen(m.optionen) });
        }
      }
      neuesBild(bild, sichererName(p.name || 'motiv'), { hg: pruefeHg(p.hg), fach: pruefeFach(p.fach), breite: pruefeBreiteWert(p.breite), gespiegelt: !!p.gespiegelt });
      zustand.bogen = bogen; zustand.anordnung = null;
      if (p.anordnung && bogen.length) {
        try { zustand.anordnung = pruefeAnordnung(p.anordnung); } catch (e) { zustand.anordnung = null; }
      }
      bogenListe(); bogenMalen();
      werkzeugMeldung('gruen', 'Projekt geöffnet: ' + zustand.name + '.');
    }, 'Das Projekt ging nicht zu öffnen.');
  });
  function pruefeOptionen(o) {
    const f = pruefeFach(o || {});
    return { kantenGlaetten: o ? o.kantenGlaetten !== false : true, schaerfen: o ? o.schaerfen !== false : true, logoGlaetten: !!(o && o.logoGlaetten),
      lanczos: f.lanczos, einziehen: f.einziehen, raster: f.raster, lpi: f.lpi, winkel: f.winkel, form: f.form, gespiegelt: !!(o && o.gespiegelt) };
  }
  function pruefeAnordnung(a) {
    if (!a || !Array.isArray(a.placed) || a.placed.length > 2000 || !(a.width > 0) || !(a.height > 0)) throw new R.RipFehler('Ungültige Anordnung.');
    for (const p of a.placed) {
      if (!Number.isInteger(p.idx) || p.idx < 0 || p.idx >= zustand.bogen.length || !['x', 'y', 'w', 'h'].every((k) => Number.isFinite(p[k])) || p.w <= 0 || p.h <= 0) throw new R.RipFehler('Ungültige Anordnung.');
    }
    const sauber = { width: Number(a.width), height: Number(a.height), placed: a.placed.map((p) => ({ idx: p.idx, x: p.x, y: p.y, w: p.w, h: p.h, rotated: !!p.rotated })) };
    R.pruefeBogen(sauber);
    return sauber;
  }

  // Testmotiv (wie im Studio): Schrift auf weißem Grund
  $('testmotiv-btn').addEventListener('click', () => {
    const c = document.createElement('canvas'); c.width = 1000; c.height = 1000;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1000, 1000);
    g.fillStyle = '#183f48'; g.font = 'bold 170px Arial, sans-serif'; g.textAlign = 'center';
    g.fillText('PRINT', 500, 395); g.fillText('LOCAL.', 500, 575);
    g.fillStyle = '#679632'; g.fillRect(170, 640, 660, 12);
    g.font = '34px Arial, sans-serif'; g.fillStyle = '#183f48'; g.fillText('TESTMOTIV', 500, 735);
    neuesBild({ leinwand: c, breite: 1000, hoehe: 1000 }, 'testmotiv');
    werkzeugMeldung('gruen', 'Testmotiv geladen (1.000 × 1.000 Pixel).');
  });

  // ---------- Sammelbogen ----------
  function bogenGeaendert() {
    zustand.anordnung = null;
    $('bogen-vorschau').classList.add('versteckt');
    $('bogen-info').textContent = zustand.bogen.length ? 'Nach Änderungen bitte neu anordnen.' : '';
    bogenKnoepfe();
  }
  function bogenKnoepfe() {
    $('bogen-ordnen-btn').disabled = !zustand.bogen.length;
    $('bogen-png-btn').disabled = !zustand.bogen.length;
    $('bogen-pdf-btn').disabled = !zustand.bogen.length;
  }
  function bogenListe() {
    const liste = $('bogen-liste');
    liste.replaceChildren();
    zustand.bogen.forEach((m, i) => {
      const zeile = document.createElement('div'); zeile.className = 'bogen-motiv';
      const img = document.createElement('img'); img.src = R.vorschau(m.bild.leinwand, 64, m.optionen.gespiegelt); img.alt = '';
      const titel = document.createElement('b'); titel.textContent = (i + 1) + '. ' + m.name;
      const felder = document.createElement('div'); felder.className = 'zwei';
      const feld = (text, wert, min, max, schritt, setze) => {
        const f = document.createElement('div'); f.className = 'feld';
        const l = document.createElement('label'), e = document.createElement('input');
        e.type = 'number'; e.min = min; e.max = max; e.step = schritt; e.value = wert; e.id = 'bogen-' + i + '-' + text.replace(/\W/g, '');
        l.htmlFor = e.id; l.textContent = text;
        e.addEventListener('change', () => { const n = Number(e.value); if (n >= Number(min) && n <= Number(max)) { setze(n); bogenGeaendert(); } else e.value = wert; });
        f.append(l, e); return f;
      };
      felder.append(
        feld('Breite · cm', m.breiteCm, '0.5', '120', '0.1', (n) => { m.breiteCm = n; }),
        feld('Menge', m.menge, '1', '100', '1', (n) => { m.menge = Math.round(n); }));
      const weg = document.createElement('button'); weg.type = 'button'; weg.className = 'leise'; weg.textContent = 'Entfernen';
      weg.setAttribute('aria-label', m.name + ' vom Bogen entfernen');
      weg.addEventListener('click', () => { zustand.bogen.splice(i, 1); bogenListe(); bogenGeaendert(); });
      felder.append(weg);
      zeile.append(img, titel, felder);
      liste.append(zeile);
    });
    bogenKnoepfe();
  }
  $('bogen-dazu-btn').addEventListener('click', () => werkzeug(() => {
    if (!zustand.motiv) return;
    if (zustand.bogen.length >= 20) throw new R.RipFehler('Höchstens 20 verschiedene Motive pro Bogen.');
    const b = breiteCm();
    zustand.bogen.push({ name: zustand.name, bild: zustand.motiv, breiteCm: Math.min(120, b), menge: 1, optionen: dateiOptionen() });
    bogenListe(); bogenGeaendert();
    werkzeugMeldung('gruen', 'Motiv zum Sammelbogen hinzugefügt (' + formatCm(Math.min(120, b)) + ' cm breit).');
  }));
  function bogenOrdnen() {
    if (!zustand.bogen.length) throw new R.RipFehler('Bitte zuerst ein Motiv zum Bogen hinzufügen.');
    const breite = Number($('bogen-breite').value), abstand = Number($('bogen-abstand').value);
    try { zustand.anordnung = R.ordneBogen(zustand.bogen, breite, abstand, $('bogen-drehen').checked); }
    catch (e) { throw new R.RipFehler(e.message); }
    bogenMalen();
  }
  function bogenMalen() {
    const a = zustand.anordnung, c = $('bogen-vorschau');
    if (!a) { c.classList.add('versteckt'); return; }
    const massstab = Math.min(850 / a.width, 1500 / a.height);
    c.width = Math.max(1, Math.round(a.width * massstab)); c.height = Math.max(1, Math.round(a.height * massstab));
    const g = c.getContext('2d');
    g.fillStyle = document.documentElement.classList.contains('dunkel') ? '#262c32' : '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    for (const p of a.placed) {
      const m = zustand.bogen[p.idx];
      g.save(); g.translate(p.x * massstab, p.y * massstab);
      if (p.rotated) { g.translate(p.w * massstab, 0); g.rotate(Math.PI / 2); }
      const w = (p.rotated ? p.h : p.w) * massstab, h = (p.rotated ? p.w : p.h) * massstab;
      if (m.optionen.gespiegelt) { g.translate(w, 0); g.scale(-1, 1); }
      g.drawImage(m.bild.leinwand, 0, 0, w, h);
      g.restore();
      g.strokeStyle = '#8a939c'; g.lineWidth = 1; g.strokeRect(p.x * massstab, p.y * massstab, p.w * massstab, p.h * massstab);
    }
    c.classList.remove('versteckt');
    $('bogen-info').textContent = formatCm(a.width) + ' × ' + formatCm(a.height) + ' cm, ' + a.placed.length + ' Motive. Motive lassen sich verschieben.';
  }
  $('bogen-ordnen-btn').addEventListener('click', () => werkzeug(bogenOrdnen, 'Das Anordnen ging nicht.'));
  ['bogen-breite', 'bogen-abstand', 'bogen-drehen'].forEach((id) => $(id).addEventListener('change', bogenGeaendert));
  let bogenZiehen = null;
  const bv = $('bogen-vorschau');
  bv.addEventListener('pointerdown', (e) => {
    const a = zustand.anordnung;
    if (!a) return;
    const r = bv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * a.width, y = (e.clientY - r.top) / r.height * a.height;
    for (let i = a.placed.length - 1; i >= 0; i--) {
      const p = a.placed[i];
      if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) { bogenZiehen = { i, dx: x - p.x, dy: y - p.y }; bv.setPointerCapture(e.pointerId); break; }
    }
  });
  bv.addEventListener('pointermove', (e) => {
    const a = zustand.anordnung;
    if (!bogenZiehen || !a) return;
    const r = bv.getBoundingClientRect(), p = a.placed[bogenZiehen.i];
    p.x = Math.max(0, Math.min(a.width - p.w, (e.clientX - r.left) / r.width * a.width - bogenZiehen.dx));
    p.y = Math.max(0, Math.min(a.height - p.h, (e.clientY - r.top) / r.height * a.height - bogenZiehen.dy));
    bogenMalen();
  });
  bv.addEventListener('pointerup', () => {
    bogenZiehen = null;
    if (!zustand.anordnung) return;
    try { R.pruefeBogen(zustand.anordnung); } catch (e) { werkzeugMeldung('gelb', e.message); }
  });
  bv.addEventListener('pointercancel', () => { bogenZiehen = null; });
  async function bogenSpeichern(format) {
    if (!zustand.anordnung) bogenOrdnen();
    try { R.pruefeBogen(zustand.anordnung); } catch (e) { throw new R.RipFehler(e.message); }
    const dpi = zustand.fach.dpi;
    werkzeugMeldung('warten', 'Der Sammelbogen wird gemacht.');
    await kurzWarten();
    const motive = zustand.bogen.map((m) => ({ bild: m.bild, optionen: m.optionen }));
    const e = await R.erzeugeBogen(motive, zustand.anordnung, dpi, format,
      (n, von) => werkzeugMeldung('warten', 'Der Sammelbogen wird gemacht: Motiv ' + n + ' von ' + von + '.'));
    const satz = await speichere(e.blob, 'sammelbogen-' + formatCm(zustand.anordnung.width).replace(',', '_') + 'cm-' + dpi + 'dpi.' + format);
    if (satz) werkzeugMeldung('gruen', satz + ' ' + e.breitePx + ' × ' + e.hoehePx + ' Pixel' + (format === 'png' ? ' mit sRGB-Profil.' : '.'));
    else leere($('status-w'));
  }
  $('bogen-png-btn').addEventListener('click', () => werkzeug(() => bogenSpeichern('png'), 'Der Sammelbogen ging nicht.'));
  $('bogen-pdf-btn').addEventListener('click', () => werkzeug(() => bogenSpeichern('pdf'), 'Der Sammelbogen ging nicht.'));

  felderAusZustand();
  freigeben();

  // Offline-Betrieb und „Zum Startbildschirm hinzufügen“ (Android): Service Worker
  if ('serviceWorker' in navigator && window.isSecureContext) {
    // Neue Fassung installiert: einmal neu laden, damit sie sofort zu sehen ist
    // (nicht beim allerersten Start, da gab es noch keine alte Fassung, und nicht,
    // wenn schon ein Bild geladen ist, damit keine Arbeit verloren geht)
    const hatteAlte = !!navigator.serviceWorker.controller;
    let neuGeladen = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hatteAlte && !neuGeladen && !zustand.geladen) { neuGeladen = true; window.location.reload(); }
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => { /* ohne Offline-Speicher weiter nutzbar */ });
  }
})();
