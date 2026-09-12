# Spec: DTF-Datencheck

Version 0.4 (Entwurf) · Stand 12.09.2026 · Reha TexStyle, Standort Lahr

Änderungen: 0.2 Mindestlinienstärke 0,4 mm, RIP benannt. 0.3 RIP ist Fiery Digital Factory 12, Gang-Sheet-Prüfung gestrichen. 0.4 Knockout als Modul 2 aufgenommen (Entscheidung Chef), App damit zweiteilig.

Diese Spec ist ein Entwurf. Abschnitt 9 listet auf, was noch offen ist. Punkte mit dem Vermerk (ungeprüft) stammen aus Anbieterseiten und wurden an der eigenen Maschine noch nicht nachgemessen.

## 1. Zweck

Ein Kunde schickt eine Datei per Mail. Die Datei muss vor dem Druck geprüft werden. Heute passiert das von Hand. Die App soll diese Prüfung übernehmen und ein Ergebnis liefern, das man dem Kunden ohne Nacharbeit zurückschicken kann.

Die App hat zwei Teile:

- **Modul 1 Datencheck** (Abschnitte 3 bis 4): prüft und meldet, ändert nichts.
- **Modul 2 Knockout** (Abschnitt 4b): entfernt auf Wunsch Schwarz oder eine gewählte Farbe aus dem Motiv und zeigt das Ergebnis auf der Textilfarbe.

Abgrenzung: Modul 1 repariert keine Dateien. Modul 2 ändert nur, was der Nutzer ausdrücklich anstößt, und schreibt immer eine neue Datei, nie die Originaldatei.

## 2. Ablauf heute

1. Kunde schickt Datei per Mail.
2. Datei wird geprüft: Auflösung, Hintergrund, Größe.
3. Bei Mängeln: Rückfrage an den Kunden.
4. Bei Freigabe: Datei geht in den RIP.

Ergänzung nötig: Die Beschreibung des Ablaufs bricht bei Schritt 2 ab. Siehe Abschnitt 9.

## 3. Soll-Ablauf mit App

1. Datei in die App ziehen (einzeln oder mehrere).
2. Nutzer gibt die gewünschte Druckbreite in cm ein. Ohne diese Angabe ist keine Auflösungsprüfung möglich, siehe 4.1.
3. App zeigt pro Prüfpunkt ein Ergebnis: grün, gelb, rot.
4. App zeigt eine Vorschau mit Schachbrettmuster, damit man sieht, was transparent ist und was nicht.
5. App erzeugt auf Knopfdruck einen Text für die Kundenmail, in dem die roten und gelben Punkte im Klartext stehen.

## 4. Prüfregeln

Alle Schwellenwerte sind in einer Einstellungsdatei änderbar. Die genannten Werte sind Startwerte, keine Naturgesetze.

### 4.1 Auflösung bei der tatsächlichen Druckgröße

Die reine dpi-Angabe in der Datei sagt nichts aus. Entscheidend ist die Auflösung bei der Größe, in der gedruckt wird.

Beispiel: Eine Datei mit 3000 Pixeln Breite, gedruckt auf 25 cm Breite, ergibt rund 305 dpi. Dieselbe Datei auf 40 cm Breite ergibt nur noch rund 190 dpi.

| Ergebnis | Schwelle | Begründung |
| --- | --- | --- |
| grün | ab 300 dpi | Branchenstandard, von allen geprüften Quellen genannt |
| gelb | 150 bis 299 dpi | 150 dpi wird als praktische Untergrenze für große, aus Distanz betrachtete Rückenmotive genannt (ungeprüft) |
| rot | unter 150 dpi | sichtbare Treppenstufen an Rundungen |

Die App zeigt zusätzlich immer an, bis zu welcher Breite in cm die Datei die 300 dpi hält. Das ist die Zahl, die der Kunde braucht.

### 4.2 Hintergrund und Transparenz

| Prüfung | Rot, wenn |
| --- | --- |
| Alphakanal vorhanden | Datei hat keinen Alphakanal (z. B. JPG) |
| Hintergrund freigestellt | Randpixel sind flächig undurchsichtig |
| Vollflächige weiße Ebene | Eine deckende Fläche liegt hinter dem Motiv |

Grund: Alles, was nicht transparent ist, wird gedruckt, auch eine weiße Fläche. Das nennen alle geprüften Quellen übereinstimmend.

Zusatzprüfung Alpha-Streupixel: Zählen, wie viele Pixel einen Alphawert zwischen 1 und 254 haben, die nicht an einer Motivkante liegen. Aus KI-Generatoren kommen oft Dateien mit tausenden fast unsichtbaren Halbtransparenz-Pixeln über die ganze Fläche. Diese Erfahrung stammt aus dem eigenen Projekt DTF-Druckprüfer, nicht aus einer externen Quelle.

### 4.3 Halbtransparenz und Verläufe

Hier widersprechen sich die Quellen deutlich (siehe Abschnitt 8). Vorschlag für den Start:

- Anteil der Pixel mit Alpha zwischen 1 und 191 (also unter 75 %) berechnen und als Hinweis anzeigen, nicht als Fehler.
- Kein Rot, solange nicht an der eigenen Maschine gemessen wurde, wie sich weiche Kanten tatsächlich verhalten.

### 4.4 Dateiformat

Die Fiery Digital Factory in der DTF Edition liest laut Herstellerangaben PDF, PNG, SVG, JPG, AI, EPS, BMP und TIF. Händlerangaben nennen zusätzlich PSD. Was der RIP lesen kann, ist aber nicht dasselbe wie das, was ein gutes Druckergebnis gibt. Die Ampel richtet sich nach dem Ergebnis, nicht nach der Lesbarkeit.

| Format | Ergebnis | Begründung |
| --- | --- | --- |
| SVG, AI, EPS | grün | Vektor, Auflösung spielt keine Rolle, beliebig skalierbar. Prüfung stattdessen: Schriften in Pfade umgewandelt? |
| PDF | grün, wenn Vektorinhalt und Transparenz vorhanden | Enthält das PDF nur ein eingebettetes Pixelbild, gelten die Pixelregeln aus 4.1 |
| PNG mit Alphakanal | grün | |
| TIFF mit Alphakanal | grün | |
| PSD | gelb | Ebenen, Ergebnis hängt davon ab, wie der RIP sie zusammenrechnet |
| BMP | rot | kein Alphakanal |
| JPG, WebP, HEIC, GIF | rot | kein oder unzuverlässiger Alphakanal. JPG liest der RIP zwar, druckt dann aber ein Rechteck mit Hintergrund |
| Word, PowerPoint | rot | liest der RIP nicht |

Vektordateien sind der beste Fall und sollten beim Kunden aktiv angefragt werden. Die Auflösungsprüfung aus 4.1 entfällt bei ihnen komplett.

### 4.5 Motivrand

Prüfen, ob das Motiv den Dateirand berührt. Empfohlen werden 2 bis 3 mm Abstand zum Folienrand (ungeprüft), andere Anbieter nennen 5 mm. Startwert: Warnung bei weniger als 3 mm.

### 4.6 Spiegelung

Nicht automatisch prüfbar. Die App zeigt stattdessen einen festen Hinweis: Datei unspiegelt anliefern, der RIP spiegelt selbst.

### 4.7 Feine Linien

Mindeststrichstärke: 0,4 mm. Vorgabe des Chefs, gilt für diesen Betrieb. Die abweichenden Werte aus den Anbieterquellen (0,212 mm bis 1 mm) sind damit erledigt.

Umrechnung in Pixel: bei 300 dpi muss jede Linie mindestens 5 Pixel breit sein. Die App rechnet den Wert immer aus der tatsächlichen Druckbreite, nicht aus einer fest verdrahteten 300.

Messverfahren: Auf dem Alphakanal eine Distanztransformation rechnen. Jedes deckende Pixel bekommt den Abstand zum nächsten transparenten Pixel. Ist der größte Abstand innerhalb eines zusammenhängenden Bereichs kleiner als die halbe Mindestbreite, ist der Bereich zu dünn.

Ausgabe: Anzahl der betroffenen Stellen plus eine Vorschau, in der sie rot markiert sind. Kein hartes Rot im Gesamturteil, sondern Gelb mit Anzeige. Grund: Weiche Kanten und Anti-Aliasing erzeugen bei diesem Verfahren immer ein paar Treffer. Ein Mensch muss die markierten Stellen ansehen.

### 4.8 Was der RIP schon selbst macht

Im Betrieb läuft Fiery Digital Factory 12 (Edition noch zu klären, siehe Abschnitt 9). Die DTF Edition erzeugt Weißunterlegung und weiße Highlights automatisch in einem Durchgang. Sie bringt Knock-Out-Werkzeuge mit, die Schwarz, Weiß oder eine Farbe automatisch aus dem Design entfernen, dazu automatisches Verschachteln von Aufträgen, Barcode-Unterstützung und Rollenbetrieb.

Version 12 hat zusätzlich einen Gang Sheet Builder direkt in der Druckwarteschlange: Motive lassen sich dort per Drag-and-drop ablegen, in der Größe ändern, verschachteln, gruppieren und der Bogen automatisch schließen. Dazu kommen ein neues Sättigungs-Rendering für Textilien, Drucklängenanzeige und optional der Fiery Color Profiler für eigene ICC-Profile.

Folge für die App: Weißplatte, Gang-Sheet-Layout und Motivabstand baut die App nicht nach. Knockout baut sie bewusst doppelt, siehe Abschnitt 4b und die Begründung dort.

Folge für das Projekt DTF Film Studio: Mit dem Knockout in Modul 2 wandert die letzte eigenständige Funktion dieser App in den Datencheck. Das Projekt DTF Film Studio kann damit ruhen.

## 4b. Modul 2: Knockout

Entscheidung des Chefs vom 12.09.2026: Knockout kommt in die App, obwohl Digital Factory 12 es auch kann.

Was die App dabei besser kann als der RIP: Die Vorschau auf der Textilfarbe. Im RIP siehst du die Folie. In der App siehst du, wie es auf dem Shirt aussieht, bevor irgendetwas gedruckt wird. Das ist auch das, was du dem Kunden schickst.

### 4b.1 Ablauf

1. Datei ist in Modul 1 geprüft und mindestens gelb.
2. Nutzer wählt die Textilfarbe: aus einer Liste gespeicherter Farben oder als Hex-Wert.
3. Nutzer wählt das Verfahren: Schwarz entfernen oder bis zu 4 Farben entfernen.
4. Vorschau zeigt nebeneinander: Motiv auf Schachbrett (das ist die Folie) und Motiv auf der Textilfarbe (das ist das Shirt).
5. Nutzer stellt die Regler ein, bis es passt.
6. Export als neues PNG mit Alphakanal. Dateiname bekommt den Zusatz `_knockout`.

### 4b.2 Schwarz entfernen

Rechenweg: Helligkeit pro Pixel nach Rec. 709 (L = 0,2126·R + 0,7152·G + 0,0722·B). Zwei Schwellen, `L_weg` und `L_bleibt`, jeweils 0 bis 255.

Beispiel: L_weg = 40, L_bleibt = 90. Ein Pixel mit RGB 20/20/20 hat L = 20, also Alpha 0. Ein Pixel mit RGB 70/70/70 hat L = 70, also Alpha 0,6 mal dem alten Wert. Ein Pixel mit RGB 200/0/0 hat L = 42,5, liegt knapp über der unteren Schwelle und würde fast verschwinden. Deshalb braucht es die Sperre aus dem nächsten Absatz.

Sperre für bunte Pixel: Ein sattes Dunkelrot oder Dunkelblau ist rechnerisch dunkel, aber kein Schwarz. Sättigung nach HSV berechnen. Ist S größer als S_max (Startwert 0,25), bleibt das Pixel unangetastet, egal wie dunkel es ist.

Bedienelemente: zwei Schieberegler für L_weg und L_bleibt, einer für S_max. Die Namen auf der Oberfläche in Alltagssprache: „Ab wie dunkel wird weggelassen“, „Wie weich ist der Übergang“, „Bunte Farben schützen“.

### 4b.3 Farben entfernen

Nutzer klickt bis zu 4 Farben im Bild an oder gibt Hex-Werte ein. Für jede gewählte Farbe: Abstand jedes Pixels zur Zielfarbe im CIELAB-Raum berechnen (Formel CIE76, also einfache euklidische Distanz über L*, a*, b*). Liegt der Abstand unter dE_weg, wird das Pixel transparent. Zwischen dE_weg und dE_bleibt läuft Alpha linear hoch, wie bei 4b.2.

Startwerte: dE_weg = 8, dE_bleibt = 20. Ein Delta-E von etwa 2,3 gilt als gerade noch sichtbarer Unterschied, 8 ist also deutlich mehr als eine Nuance.

CIE76 ist die einfachste Formel und in dunklen und gesättigten Bereichen ungenau. Für den Zweck reicht sie, weil der Nutzer das Ergebnis sieht und nachregelt. Falls die Trennung in der Praxis nicht sauber wird, ist CIEDE2000 der nächste Schritt.

### 4b.4 Das Randproblem

Nach dem Entfernen bleiben an den Kanten halbtransparente Pixel stehen, die noch die entfernte Farbe enthalten. Auf einem schwarzen Shirt fällt das nicht auf. Auf einem roten Shirt sieht man einen dunklen Saum um jedes Motivteil.

Behandlung: Für jedes Pixel mit Alpha zwischen 1 und 254 die Farbe um den Anteil der entfernten Farbe bereinigen (Unpremultiply gegen die Knockout-Farbe). Die App zeigt das Ergebnis in der Vorschau auf der Textilfarbe, damit man es sieht.

Ich kann nicht vorhersagen, wie gut das bei euren Motiven funktioniert. Das ist ein Punkt, der beim Bauen an echten Dateien bewertet werden muss.

### 4b.5 Pflichtvermerk im Export

Die exportierte Datei darf im RIP nicht noch einmal durch KnockMeBlackOut laufen, sonst wird zweimal entfernt. Die App schreibt deshalb:

- den Zusatz `_knockout` in den Dateinamen,
- die verwendete Textilfarbe und die Reglerwerte in die PNG-Metadaten (tEXt-Chunk),
- eine Zeile in den Prüfbericht: „Knockout bereits angewendet, Textilfarbe #1A1A1A. Im RIP kein KnockMeOut aktivieren.“

### 4b.6 Was Modul 2 nicht macht

- Keine Weißplatte. Die erzeugt der RIP aus dem Alphakanal.
- Kein Halftone, also keine Rasterung von Volltonflächen in Punkte.
- Keine automatische Erkennung der Textilfarbe aus einem Foto.

## 5. Was die App nicht tut

- Keine automatische Freistellung. Der Versuch über Randfarben ist am 08.09.2026 an Fotos mit Wandverlauf und Schatten gescheitert.
- Keine Vektorisierung. Begründung steht in den Projekt-Learnings: Die Heuristik hat ein Logo mehrfach als Foto eingestuft, und Alpha-Streupixel wurden beim Tracen zu grauen Kästen.
- Keine Farbraumkonvertierung.
- Kein Hochrechnen niedrig aufgelöster Dateien.
- Kein Gang-Sheet-Layout. Das macht der Gang Sheet Builder in Digital Factory 12.
- Keine Entscheidung über Drucken oder nicht. Das macht ein Mensch.

## 6. Ausgaben

- Prüfbericht am Bildschirm: pro Punkt Ampel plus Zahl.
- Kundentext zum Kopieren: nur die gelben und roten Punkte, in Alltagssprache. Beispiel: „Ihre Datei ist 1200 Pixel breit. Für 30 cm Druckbreite reicht das nicht aus, das ergibt 102 dpi. Wir brauchen mindestens 3543 Pixel Breite.“
- Optional: Bericht als PDF für die Auftragsakte.

## 7. Technik

Offen. Zwei Wege stehen zur Wahl:

|  | Python-Desktop (wie DTF PrintReady) | Browser-App (wie DTF-Druckprüfer) |
| --- | --- | --- |
| Läuft ohne Internet | ja | ja, nach Installation |
| Große Dateien (50 MB+) | unproblematisch | Speichergrenze im Browser |
| PDF-Prüfung | mit Bibliothek machbar | aufwendig |
| Verteilung im Team | Installation pro Rechner | ein Link |

Empfehlung erst nach Klärung von Abschnitt 9.

## 8. Widersprüche in den Quellen

Es gibt für DTF keine Norm wie bei Offsetdruck. Alle gefundenen Angaben stammen von Anbieterseiten, also von Firmen, die DTF-Transfers verkaufen. Sie beschreiben, was die jeweils eigene Maschine und der jeweils eigene RIP erwarten. Das erklärt die Abweichungen.

**Farbraum: CMYK oder RGB?**

- CMYK verlangen: dtf-manufaktur.de, dtf-king.de, mavi-dtf.de, transferprofi24.de
- RGB verlangen: weprintupress.com, dtfturbo.de
- Beides akzeptiert: dtf-blitz.de

Die Frage ist nicht allgemein zu beantworten. Sie hängt davon ab, was der eigene RIP macht. Das muss an der eigenen Maschine geklärt werden.

**Mindestlinienstärke: geklärt**

- 0,212 mm (0,6 pt): dtf-manufaktur.de
- 0,4 mm: dtf-king.de
- 1 mm: weprintupress.com

Für diesen Betrieb gilt 0,4 mm, festgelegt vom Chef am 12.09.2026. Die Spannbreite der Quellen erklärt sich daraus, dass jeder Anbieter für seine eigene Maschine und sein eigenes Folien-Kleber-System spricht. dtf-king.de nennt als Grund für die Untergrenze nicht die Auflösung, sondern die Haftung: Zu dünne Linien bieten dem Kleber zu wenig Fläche und halten auf dem Textil nicht dauerhaft.

**Halbtransparenz**

- dtf-king.de: gar keine Transparenzen und Verläufe
- weprintupress.com: Deckkraft unter 75 % vermeiden
- dtf-profis.de: Transparenzen bleiben transparent, kein grundsätzliches Problem

Diese Spannbreite ist der Grund, warum 4.3 und 4.7 im ersten Release nur Hinweise erzeugen.

## 9. Offene Punkte

Diese Fragen kann nur die Druckerei selbst beantworten:

1. Wie geht der Ablauf nach dem Check weiter? Die Beschreibung brach nach „die Datei muss 300 dpi haben“ ab.
2. Edition des RIP. Version 12 ist bestätigt. Offen ist die Edition. Die Desktop Edition ist für Drucker bis A2 beziehungsweise 17 bis 18 Zoll Rollenbreite gedacht, die Wide Format Edition für 24 Zoll und mehr. Steht in der Software unter „Über“.
3. Erwartet der RIP RGB oder CMYK? Ich habe keine belastbare Aussage von Fiery dazu gefunden und kann das nicht bestätigen. Praktischer Test: dieselbe Datei einmal als RGB und einmal als CMYK durch den RIP schicken und die beiden Drucke nebeneinanderlegen.
4. Maximale Druckbreite in cm. Hängt am Drucker, nicht nur an der Software. Bitte an der Maschine ablesen.
5. Wer benutzt die App außer dir? Davon hängt Abschnitt 7 ab.
6. Sollen geprüfte Dateien protokolliert werden, so wie DTF PrintReady das mit SQLite macht?

## 10. Abnahmekriterien

Die App gilt als fertig, wenn sie diese Testfälle richtig beurteilt. Die Testdateien müssen vorher zusammengestellt werden.

| Testdatei | Erwartetes Ergebnis |
| --- | --- |
| PNG 3000 px breit, Alphakanal sauber, Ziel 25 cm | grün, 305 dpi, max. Breite 25,4 cm |
| Dieselbe Datei, Ziel 40 cm | gelb, 190 dpi |
| JPG 4000 px breit | rot: kein Alphakanal |
| PNG mit deckend weißer Hintergrundebene | rot: Hintergrund nicht freigestellt |
| KI-generiertes PNG mit Alpha-Streupixeln | Hinweis mit Pixelanzahl |
| Handyfoto, 1080 px breit, Ziel 30 cm | rot, 91 dpi |
| PNG mit Linien von 3 px bei 300 dpi (= 0,25 mm) | gelb, Stellen rot markiert |
| PNG mit Linien von 8 px bei 300 dpi (= 0,68 mm) | keine Meldung |

Für Modul 2:

| Testdatei | Erwartetes Ergebnis |
| --- | --- |
| Logo mit reinschwarzer Kontur, Textilfarbe #000000 | Kontur verschwindet, farbige Flächen unverändert |
| Motiv mit dunkelrotem Element (RGB 140/10/10), Schwarz entfernen | Dunkelrot bleibt stehen, Sättigungssperre greift |
| Motiv mit Farbverlauf ins Schwarze | weicher Übergang ohne sichtbare Abbruchkante in der Shirt-Vorschau |
| Exportierte Datei | Dateiname endet auf `_knockout`, Metadaten enthalten Textilfarbe und Reglerwerte |

## 11. Quellen

Alle am 12.09.2026 abgerufen. Es handelt sich durchweg um Sekundärquellen mit kommerziellem Interesse, keine Normen. Veröffentlichungsdaten stehen dabei, soweit die Seite eines nennt.

- https://www.dtf-manufaktur.de/datenanforderung (kein Datum)
- https://dtf-king.de (vom Nutzer eingefügter Auszug, Seite nicht selbst abgerufen)
- https://dtf-blitz.de/pages/druckdaten-richtig-anlegen-fur-dtf-der-komplette-guide (kein Datum)
- https://dtf-profis.de/druckdaten (kein Datum)
- https://dtfturbo.de/blogs/wissen-praxis/dtf-druckdatei-erstellen-formate-vorlagen-fehler (03.06.2026)
- https://mavi-dtf.de/blogs/dtf-druck-ratgeber/dtf-druckdaten-richtig-anlegen-der-komplette-mavi-guide-fur-perfekte-dtf-transfers (28.05.2026)
- https://weprintupress.com/blogs/dtf-transfer-tips/dtf-design-tips-best-file-formats-and-resolution-for-high-quality-prints (August 2026)
- https://www.transferprofi24.de/hilfe/druckdaten (kein Datum)
- https://dtf-labor.de/how-to/ (02.04.2024, älteste Quelle, entsprechend vorsichtig verwenden)

Zum RIP, ebenfalls am 12.09.2026 abgerufen:

- https://www.fiery.com/products/digital-factory-dtf/ (Herstellerseite, Primärquelle für den Funktionsumfang)
- https://www.gcc-deutschland.de/software-rips/fiery/fiery-digitalfactory-dtf-edition-v11/ (Händler, Stand 05.12.2025, Quelle für die Knock-Out-Werkzeuge)
- https://www.colormatch.org/PRODUKTE/Software/Fiery-Digital-Factory/ (Händler, kein Datum, Quelle für Weißunterlegung, Gang Sheet Builder v12 und Systemvoraussetzungen)
- https://dtfprinting.com/equipment-reviews/cadlink-digital-factory-11-direct-to-film-edition (Fachportal, 01.07.2026, Quelle für die unterstützten Dateiformate von v11.1: PDF, PNG, SVG, JPG, AI, EPS, BMP, TIF)
- https://kingdomdtf.com/products/fiery-digital-factory-dtf-wide-format-full-edition (Händler, kein Datum, nennt zusätzlich PSD)

Händlerseiten sind Sekundärquellen mit Verkaufsinteresse. Für den tatsächlichen Funktionsumfang der bei euch installierten Version gilt das Handbuch der installierten Version.

Der Hinweis, dass der eingesetzte RIP die Weißplatte aus dem Alphakanal selbst erzeugt, stammt aus einer früheren Angabe des Chefs, nicht aus diesen Quellen.
