# DEACS V0.13.05-TEST – DBC-Verwaltung für Endanwender

- DBC-Dateien können direkt unter Settings im Browser auf den ESP32 geladen und gelöscht werden.
- PlatformIO und Zugriff auf `data/dbc/` sind für die DBC-Verwaltung nicht mehr erforderlich.
- Uploads werden auf DBC-Endung, Dateiname und maximal 512 KB geprüft.

# DEACS V0.13.04-TEST – DBC-Laden abgesichert

- Die Generatorsteuerung erscheint nur noch im Simulator und nicht mehr im Label Dictionary.
- Die Übersicht-Werkzeuge sind in Suche, sichtbare IDs, Frequenzfilter und Hervorhebung gruppiert.
- Neuer Übersichtsfilter blendet CAN-IDs aus, deren durchschnittlicher Nachrichtenabstand unter einer einstellbaren Millisekunden-Grenze liegt.
- Feste Spaltenbreiten verhindern, dass wachsende Frame-Zähler die CAN-Übersicht verschieben.
- Ereignis-Marker verwenden immer den aktuellen Monitor; die tatsächliche Frame-Quelle wird am Marker und in der Analyse angezeigt.
- Das globale ID-Format wird zentral unter Settings eingestellt und gilt für alle Seiten.
- Unter `Δt Ø` wird der aktuelle Abstand zur vorherigen Nachricht derselben CAN-ID angezeigt.
- Doppelklick auf eine CAN-ID übernimmt ein gefundenes DBC- oder Decoded-Label dauerhaft ins Label Dictionary.
- Labels aus gespeicherten Decoded-Einträgen werden beim Start wieder in der CAN-Übersicht angezeigt und live aktualisiert.
- Neuer Filter `Nur Decoded` in den Übersicht-Werkzeugen zeigt ausschließlich manuell definierte oder durch die aktive DBC dekodierbare CAN-IDs.
- DBC wird nach Browser-Neustart nicht mehr automatisch aktiviert oder geladen.
- DBC-Dateiliste liefert Dateigrößen; Auswahl zeigt die Größe in KB.
- Maximale DBC-Dateigröße für ESP32-Webserver auf 512 KB begrenzt.
- HTTP 413 bei zu großen DBC-Dateien statt langer/blockierender Übertragung.
- DBC-Fetch erhält 10-s-Abbruchschutz.
- Datei-Handles beim Auflisten von `/dbc` werden explizit geschlossen.
- Bestehende Tabs und CAN-Funktionen bleiben unverändert.

# DEACS V0.13.03-TEST – DBC-Unterstützung

- Neuer Ordner `data/dbc/` für DBC-Dateien im LittleFS.
- Settings: DBC aktivieren, Datei auswählen und neu laden.
- DBC-Dateien werden vom ESP32 dynamisch aus `/dbc` aufgelistet.
- Parser für `BO_`, `SG_`, `VAL_` und `CM_`.
- Intel/Motorola, signed/unsigned, Faktor, Offset und Einheit werden dekodiert.
- DBC-Nachrichtennamen ergänzen bestehende Labels; manuelle Label-Dictionary-Einträge haben Vorrang.
- Decoded Messages zeigt für die ausgewählte Zeile die DBC-Signale und dekodierten Werte.

# DEACS V0.13.02-TEST – neuer Tab Ereignis-Analyse

- Neuer, vollständig getrennter Tab „Ereignis“ zwischen Logs und Settings.
- Bereiche für Quelle/Marker, Analyse-Einstellungen, Ergebnisse und Detailansicht ergänzt.
- Marker können benannt, per Enter oder Button gesetzt, ausgewählt und gelöscht werden.
- Quellenwahl für Live CAN, geladenen Log und Simulator vorbereitet.
- Bestehende Tabs und Funktionen wurden nicht umgebaut.

# DEACS V0.13.01-TEST – Übersicht: zyklische Frames sichtbar

- „Nur Änderungen“ verwendet für das Sichtfenster jetzt den letzten Empfang eines Frames.
- Unveränderte zyklische Frames (z. B. ID 0x5A0 alle 5 s) erscheinen wieder in der Übersicht und bleiben bei einem 10-s-Fenster sichtbar.
- Die echte Datenänderungszeit bleibt getrennt erhalten und wird weiterhin für Byte-Änderungen verwendet.
- Beim Einschalten des Filters bleiben die aktuell sichtbaren Zeilen zunächst erhalten.

# DEACS V0.13.00-TEST – gemeinsame Spaltenmittelachsen

- Simulator: Überschriften der Eingabezeile stehen exakt mittig über ID, DLC, D0–D7 und Intervall.
- Simulator-Tabelle: Kopf, Daten und Inline-Editoren verwenden dieselbe geometrische Mittelachse.
- Seitliches Zell-Padding als Ursache kleiner optischer Verschiebungen entfernt.
- TX-Eingabe und TX-Verlauf übernehmen dieselbe Zentrierungsregel.
- Tabellenstandard im Styleguide verbindlich präzisiert.

# DEACS V0.13.00-TEST – Release-Feinschliff

- TX und Simulator bleiben als getrennte Seiten erhalten.
- Eingabezeilen in TX und Simulator kompakter gestaltet.
- Simulator-Eingabe mit denselben Überschriften wie TX: ID, DLC, D0 bis D7 und Intervall.
- Simulator-Tabelle auf das einheitliche Layout ID, Label, DLC, D0 bis D7, Intervall, Aktiv und Quelle umgestellt.
- DLC 0 bis 8 wird im Simulator berücksichtigt; Bytes außerhalb des DLC werden nicht simuliert.
- Erste Datenzeile in TX-Verlauf und Simulator erhält ausreichend Höhe für Schaltflächen und Inhalte.
- Browser-Cache-Version für CSS und JavaScript aktualisiert.

# DEACS V0.13.00-TEST

- Simulator: Das Dropdown „Mehr“ wurde entfernt.
- „Beispiele laden“ und „Alle löschen“ stehen jetzt nebeneinander rechts unter „Frame hinzufügen“.
- Keine zusätzlichen Start-/Stop- oder „Simulator: AN“-Bedienelemente ergänzt.

# DEACS V0.13.00-TEST

- Simulator: Das Menü „Mehr“ wird wieder als kompaktes Dropdown dargestellt.
- Die Aktionen „Beispiele laden“ und „Alle löschen“ sind wieder sichtbar und anklickbar.
- Ursache war eine Überschneidung mit dem globalen Stil für einklappbare Bereiche.

# DEACS V0.12.97-TEST

- Simulator-Einträge können direkt in der Tabelle bearbeitet werden: ID, Label, Daten und Intervall.
- Änderungen werden geprüft, lokal gespeichert und bei laufendem Browser-Simulator sofort übernommen.
- Das Zeilenmenü enthält nun den passenden Eintrag „Ändern“.

# DEACS V0.12.94-TEST

## CAN-Übersicht

- Spalte `Alter [s]` in `Zuletzt [s]` umbenannt.
- `Zuletzt [s]` zeigt weiterhin unabhängig vom Filter die Zeit seit dem letzten empfangenen Frame der jeweiligen CAN-ID.
- Beschriftung `sichtbar für` in `Ausblenden nach:` geändert, damit der Zeitraum von `Nur Änderungen` eindeutig beschrieben ist.
- Die bereits vorhandene differenzielle Tabellenaktualisierung bleibt erhalten: Bestehende sichtbare Zeilen werden zellenweise aktualisiert und nur bei geänderter Struktur neu aufgebaut.

# DEACS V0.12.93-TEST

- Große Browser-Logs zeigen beim Export sofort einen modalen Fortschrittsdialog.
- Fortschritt wird als Prozentwert und als verarbeitete Frames angezeigt.
- Status unterscheidet Lesen, Dateierstellung, Dateiteile und Öffnen des Speicherdialogs.
- Export-Schaltflächen bleiben während eines laufenden Exports gesperrt.
- Fehler beim DLOG- oder CSV-Export werden als DEACS-Meldung angezeigt.

# DEACS V0.12.92-TEST

- Bereichsumbau auf Basis der stabilen V0.12.90 neu und robust umgesetzt.
- Alle Tabs besitzen jetzt echte einklappbare HTML-Details-Bereiche.
- TX, Label Dictionary, Logs und Einstellungen erhalten jeweils mindestens einen sichtbaren Bereich.
- Monitor, Übersicht und Decoded besitzen getrennte einklappbare Werkzeug- und Datenbereiche.
- Simulator-Gruppen bleiben ebenfalls einklappbar.
- Ein bloßer Kartenrahmen gilt laut Styleguide nicht mehr als Bereich.

# DEACS Changelog

## V0.12.75-TEST
- Log-Wiedergabe: Auswahl der im Log vorhandenen Gruppen RX, TX, SIM/GEN und Andere.
- Gruppen zeigen die jeweilige Frameanzahl und werden ausgegraut, wenn sie im Log nicht vorkommen.
- Nur ausgewählte Frames werden zeitgetreu simuliert; geloggte TX-Frames werden niemals auf den CAN-Bus gesendet.

## V0.12.73-TEST
- Serverfilter wird erst mit Enter oder „Filter anwenden“ aktiviert.
- Bei aktivem Filter wird der Button zu „Filter löschen“.
- Filtereingaben bleiben während des Live-Empfangs editierbar.
- Übersichtssortierung: aufsteigend, absteigend, dritter Klick hebt die Sortierung auf.
- CAN-ID-Sortierung und HEX/DEC-Anzeige sind getrennt.
- Statusnamen: CAN LIVE, CAN LISTEN und CAN DISCONNECTED.

# DEACS Änderungsprotokoll

## V0.12.71-TEST

- Firmware-only optimization; no UI or CAN behavior changes.
- Frame flow reviewed: the two fixed `CanFrame` copies (TWAI → ring buffer and ring buffer → WS batch) are required by the current safe SPSC architecture.
- Logger and WebSocket APIs already use `const CanFrame&` / pointer access and add no whole-frame copies.
- WebSocket batch JSON is now formatted directly into the final fixed buffer, removing one temporary buffer and one `memcpy` per transmitted frame.
- Based on the stable V0.12.69 build fix (`HEX_DIGITS`).

## V0.12.69-TEST

- WebSocket-Statusausgabe verwendet jetzt einen festen Puffer statt dynamisch wachsender `String`-Verkettungen.
- Laufende Frame-Paketbildung bleibt vollständig in festen Speicherpuffern.
- Datenbytes werden über eine direkte HEX-Konvertierung ohne wiederholte `snprintf`-Aufrufe erzeugt.
- HTTP-Statusantworten verwenden denselben zentralen Status-Builder.
- Browserprotokoll, Oberfläche, CAN-Empfang, Simulator und Logging bleiben unverändert.

## V0.12.66-TEST

- CAN-Ring wird im Hauptloop vor HTTP/WebSocket-Arbeit geleert, damit Browserarbeit den RX-Verbraucher weniger verzögert.
- Vorhandene High-Priority-TWAI-RX-Task und fester Ringpuffer bleiben unverändert die erste Empfangsstufe.
- Neue Diagnosewerte: Queue-Kapazität, Queue-Auslastung, maximale RX-Drain-Zeit, maximale Frames pro Drain und Backlog-Ereignisse.
- Backlog-Ereignisse sind nur ein Warnindikator; echte Verluste werden weiterhin separat als Ring-Drops sowie TWAI missed/overrun gezählt.
- Keine sichtbare Änderung außerhalb der Diagnoseansicht.

## V0.12.65-TEST

- WebSocket-Framepakete werden in einem festen Puffer aufgebaut; wiederholtes dynamisches Vergrößern von `String` entfällt.
- Dadurch weniger Heap-Fragmentierung und stabileres Verhalten bei hoher CAN-Last und langen Laufzeiten.
- Firmware überwacht jetzt freien Heap, bisherigen Heap-Tiefstand, größten freien Block und dessen Tiefstand.
- Zusätzlich werden maximale WebSocket-Paketgröße und maximale Sendedauer erfasst.
- Die Werte sind unter **Settings → Diagnose und Gerätestatus** sichtbar.
- CAN-Empfang, Filter, Simulator und Browserdarstellung bleiben unverändert.

## V0.12.64-TEST

- Übersicht verwendet jetzt virtuelles Rendering: Nur Zeilen im sichtbaren Scrollbereich plus kleiner Puffer werden im DOM gehalten.
- Datenmodell und Zähler laufen für alle IDs im Hintergrund vollständig weiter.
- Neue Statuszeile zeigt Gesamtframes, eindeutige IDs und aktuell gerenderte Zeilen.
- Scrollen aktualisiert den sichtbaren Ausschnitt ohne Änderung der CAN-, TX-, Simulator- oder Filterlogik.

## V0.12.63-TEST

- Übersicht aktualisiert bestehende Zeilen jetzt gezielt statt die komplette Tabelle bei jedem Zyklus neu aufzubauen.
- Laufende Werte wie Frames, Alter, Δ, Min/Max/ØΔt und Datenbytes werden direkt in den vorhandenen Zellen aktualisiert.
- Statische Angaben wie ID, Label, Quelle und DLC bleiben bei normalem Empfang unverändert im DOM.
- Ein vollständiger Tabellenaufbau erfolgt nur noch, wenn sich Filter, Sortierung oder die sichtbare Frame-Liste ändern.
- Oberfläche und CAN-, TX-, Simulator- sowie Generatorlogik bleiben unverändert.

## V0.12.62-TEST

- Browser-Performance weiter verbessert: Monitor und Übersicht werden nur noch neu aufgebaut, wenn der jeweilige Tab sichtbar ist.
- Eingehende Frames, Zähler und Analysewerte werden im Hintergrund weiterhin vollständig erfasst.
- Beim Wechsel zu Monitor oder Übersicht wird sofort der aktuelle Datenstand dargestellt.
- Nach Rückkehr zu einem zuvor ausgeblendeten Browserfenster wird der aktive Tab einmal vollständig aktualisiert.
- Keine Änderung an CAN-, TX-, Simulator-, Generator- oder Filterlogik.

## V0.12.61-TEST

- Browser-Performance bei vielen Frames verbessert.
- Abgleich mit **Decoded messages** erfolgt jetzt über einen vorberechneten Schlüsselindex statt über wiederholte vollständige Listensuchen.
- Zeilenaktionen und Doppelklick in der Übersicht greifen Frames direkt über ihre CAN-ID und den Frame-Typ ab.
- Darstellung, Filterverhalten und CAN-/Simulatorlogik bleiben unverändert.

## V0.12.60-TEST

- Fehler in „Nur Änderungen“ behoben: Beim Einschalten bleiben die aktuell sichtbaren Frames zunächst erhalten.
- Das konfigurierte Sichtfenster startet jetzt ab dem Einschaltzeitpunkt.
- Danach wird der Timer nur bei echten Datenänderungen erneut gestartet.
- Die weiche Ausblendanimation aus V0.12.59 bleibt erhalten.

## V0.12.59-TEST

- Ausblendung von Frames in „Nur Änderungen“ korrigiert.
- Statt einer CSS-Transition wird jetzt eine echte Keyframe-Animation verwendet.
- Dadurch ist das Dimmen auch sichtbar, wenn die Übersichtstabelle neu aufgebaut wird.
- Ausblenddauer auf 600 ms erhöht und mit leichter Helligkeitsreduktion deutlicher gemacht.

## V0.12.56-TEST

- Frame-Freeze in der Übersicht ergänzt.
- Einträge können über das Drei-Punkte-Menü eingefroren und wieder freigegeben werden.
- Eingefrorene Werte, Zähler und Zeitstempel bleiben als Referenz stehen, während neue Frames weiterhin im Hintergrund empfangen werden.
- Beim Freigeben springt die Zeile auf den aktuellsten empfangenen Stand.
- Eingefrorene Zeilen werden dezent im bestehenden DEACS-Stil markiert.
- Keine Änderung der CAN-Firmwarelogik oder des Layouts.

## V0.12.55-TEST

- Internes Frame-Datenmodell vereinheitlicht.
- RX, TX, SIM und GEN werden bereits beim Eingang eindeutig normalisiert.
- CAN-ID, DLC, Datenbytes, ASCII, Label und Zeitstempel werden zentral aufbereitet.
- Monitor, Übersicht, Decoded Messages, Logging und Simulator verwenden dieselben Frame-Grunddaten.
- Doppelte Umwandlungen von Datenbytes und ASCII im Monitor entfernt.
- Keine sichtbare Layoutänderung und keine Änderung der CAN-Firmwarelogik.

## V0.12.54-TEST

- Übersicht: neue kompakte Spalte Δ für die Anzahl geänderter Datenbytes gegenüber dem vorherigen Frame.
- Übersicht: Tooltip an jedem Datenbyte zeigt die geänderten Bits.
- Decoded Messages: Klick auf ein Datenbyte öffnet eine kompakte Analysezeile mit HEX, unsigned/signed DEC, BIN, ASCII und Bitzuständen.
- Die ausgewählte Byteposition bleibt beim Wechsel innerhalb der Decoded-Liste erhalten.
- Vergleichsdaten werden beim Frame-Eingang einmal berechnet und von der Übersicht wiederverwendet.
- Keine Änderung der DEACS-Optik und keine Firmware-Funktionsänderung.

# DEACS V0.12.53-TEST

## V0.12.53-TEST

- Letzte reine UI-Konsolidierung vor dem UI-Freeze.
- Tabellenkopf-, Zeilen- und Bedienelementhöhen über alle Tabs vereinheitlicht.
- Tabellen-Hover und Auswahl folgen überall derselben DEACS-Darstellung.
- Einheitliche, dezente Scrollleisten für Tabellen und Kartenbereiche.
- Tab-Werkzeugleisten und Statuszeilen kompakter ausgerichtet, ohne die DEACS-Optik zu verändern.
- Keine Änderungen an CAN-, TX-, Simulator-, Generator- oder Logging-Logik.
- UI-Freeze ab V0.12.53 dokumentiert: künftig nur gezielte Fehlerkorrekturen und funktional notwendige UI-Ergänzungen.


- Letzte kompakte UI-Aufräumrunde im bestehenden DEACS-Stil.
- Simulatoraktionen „Beispiele laden“ und „Alle löschen“ unter „Mehr“ zusammengefasst.
- Simulatorstatus, Backend und Zähler in einer ruhigen Statuszeile zusammengeführt.
- Weniger Abstand oberhalb der Simulator-Tabelle und dadurch mehr sichtbare Zeilen.
- Keine Änderungen an CAN-, TX-, Simulator- oder Generatorlogik.

# V0.12.50-TEST

- Simulator-Tabelle beginnt jetzt wie alle anderen Tabs mit **ID** und **Label**.
- Aktiv-Schalter, Quelle, Sortiergriff und Menü wurden nach rechts verschoben.
- Die bisherige Spaltenbezeichnung **Typ** im Monitor und Simulator heißt jetzt eindeutig **Quelle**.
- Simulator-Spalten neu ausgerichtet; ID und Daten bleiben Monospace.
- Sortiergriff im Ruhezustand dezenter, ohne die DEACS-Optik zu verändern.
- Keine Änderungen an CAN, TX, Simulatorlogik oder Generator.

# V0.12.49-TEST

- Tabellenköpfe und Zeilenhöhen in allen Tabs vereinheitlicht.
- ID, Label, Daten, ASCII und Zahlen konsistent ausgerichtet.
- Auswahl auf Hintergrund plus linke DEACS-Akzentlinie reduziert.
- Einheitliche dezente Scrollleisten ergänzt.
- Bearbeitungsfelder bleiben im Ruhezustand rahmenlos.
- Quellen RX/TX/SIM/GEN bleiben einfacher Text ohne Badge-Rahmen.
- Keine funktionalen Änderungen an CAN, TX, Simulator oder Generator.

# V0.12.48-TEST

- Quellen RX, TX, SIM und GEN werden in Tabellen als ruhiger Text statt als zusätzliche Badge-Rahmen angezeigt.
- Simulator-Labels besitzen im Ruhezustand keinen sichtbaren Eingaberahmen; der Rahmen erscheint erst beim Bearbeiten.
- Drei-Punkte-Menüs sind im Ruhezustand rahmenlos und werden erst beim Überfahren oder Öffnen hervorgehoben.
- Simulator-Zähler Frames, Aktiv und Inaktiv werden kompakt ohne einzelne Kästchen dargestellt.
- Decoded-DLC bleibt ein Dropdown, wirkt aber ohne ständig sichtbaren Auswahlpfeil wie eine normale Tabellenzelle.
- ASCII-Anzeige und die bestehende DEACS-Optik bleiben erhalten.
- Keine Funktionsänderungen an CAN, TX, Simulator oder Generator.

# V0.12.47-TEST

- Decoded messages ohne Auswahlpunkte; Auswahl erfolgt über die Zeile.
- RTR- und IDE-Spalten aus der normalen Decoded-Ansicht entfernt.
- ASCII-Spalte im Monitor und in Decoded messages ergänzt.
- Monitor-Reihenfolge auf ID, Label, Zeit, Δt, Typ, DLC und Daten vereinheitlicht.
- Tabellenfelder optisch beruhigt, ohne die DEACS-Optik zu verändern.
- DEACS Styleguide 1.0 ergänzt.

# V0.12.47-TEST

- Quelle in der Übersicht ergänzt: RX, TX, SIM oder GEN.
- Generator-Frames bleiben beim Import als GEN erhalten.
- CSV-/DLOG-Export verwendet die Spalte „Quelle“ statt der missverständlichen Bezeichnung „Dir“.
- Alte Dateien mit „Dir“ bleiben weiterhin importierbar.
- Simulator-Buttons und Statuszähler auf eine gemeinsame Grundlinie ausgerichtet.

# DEACS V0.12.47-TEST

- Simulator-Tabelle wieder vertikal scrollbar.
- Tabellen verwenden einheitlich die Reihenfolge ID, Label.
- Spaltenausrichtung in Monitor, Übersicht, Decoded, Labels, TX und Simulator bereinigt.
- Strg+C kopiert die markierte Tabellenzeile als semikolongetrennte CSV-Zeile.

# V0.12.47-TEST

- Übersicht: kompaktes Drei-Punkte-Menü pro CAN-ID.
- Frames können direkt in TX, Simulator oder Generator übernommen und kopiert werden.
- Simulator-Einträge besitzen einen frei editierbaren Namen und eine dezente Herkunftskennzeichnung.
- Simulator-Aktionsmenü mit Duplizieren, als Generator verwenden und Löschen.
- Keine Änderung am CAN-TX-Verhalten der Simulation: SIM- und Generatorframes bleiben intern.

# V0.12.42-TEST

- Simulator-Oberfläche aufgeräumt und Generator klar als separates Reverse-Engineering-Werkzeug abgegrenzt.
- Generator-Startknopf in den eingeklappten Generatorbereich verschoben.
- Generatorbereich standardmäßig geschlossen und mit blauem Akzent gekennzeichnet.
- Byte-Maske und Vorschau kompakter angeordnet.
- Keine Änderung am CAN-TX-Verhalten: Generator und Simulator erzeugen ausschließlich interne Frames.

# V0.12.42-TEST

- Generatorabhängige Zusatzfelder kompakt in den aufgeklappten Einstellungen.
- Zähler: Startwert und Schritt.
- Sinus/Rechteck: Datenbyte und Periode.
- Sägezahn: Datenbyte und Schritt.
- LFSR: Seed.
- Laufbit und Zufall benötigen keine Zusatzfelder.
- Einstellungen werden lokal gespeichert.
- Weiterhin ausschließlich interne Simulation, kein CAN-TX.

# DEACS V0.12.39-TEST

- Generator-Auswahl in den eingeklappten Simulator-Einstellungen ergänzt.
- Generatoren: Zufall, Zähler, Laufbit, Sinus, Sägezahn, Rechteck und LFSR.
- Start/Stop-Schaltfläche neutral in „Generator starten/stoppen“ umbenannt.
- Generator läuft ausschließlich intern im Browser; kein CAN-TX.

# DEACS V0.12.39-TEST

- Random-Einstellungen bleiben platzsparend eingeklappt.
- Einstellbar: 1–1000 Frames/s, CAN-ID-Bereich und feste oder zufällige DLC.
- Einstellungen werden im Browser gespeichert.
- Random-Frames bleiben interne SIM-Frames und werden nicht auf den CAN-Bus gesendet.
- Keine zusätzlichen Generatoren oder dauerhaft sichtbaren Bedienelemente, damit der Simulator übersichtlich bleibt.

# DEACS V0.12.37-TEST

- Monitor wieder als reine fortlaufende Rohdatenanzeige: keine Byte-Änderungsanimation pro Zeile.
- Byte-Änderungen, Änderungshäufigkeit und neue CAN-IDs bleiben ausschließlich in der Übersicht.
- Übersichtssortierung, Auswahl und vorhandene Hervorhebungen bleiben unverändert.
- Random-Simulator und TX-Größenanpassungen aus V0.12.36 bleiben enthalten.

- Neuer Button „Random starten“ erzeugt 50 interne Zufallsframes pro Sekunde.
- Random-Simulation bleibt vollständig im Browser und sendet nichts auf den CAN-Bus.
- TX-Eingabefelder und Aktionsbuttons haben einheitliche Höhen und Breiten.
- Senden/Löschen im TX-Verlauf sind gleich groß und sauber ausgerichtet.


- Monitor hebt nur tatsächlich geänderte Datenbytes kurz hervor; die komplette Zeile bleibt ruhig.
- Monitor-Aktualisierungen werden stärker gebündelt, um die Anzeige bei hoher CAN-Last flüssiger zu halten.
- Neue CAN-IDs werden in der Übersicht einmalig dezent markiert.
- Übersicht wird häufiger, aber gebündelt aktualisiert; Auswahl und Sortierung bleiben erhalten.
- Tabellenbereiche erhalten Browser-Rendering-Isolation, um unnötige Neuberechnungen zu reduzieren.

# DEACS V0.12.34-TEST

- Simulator-Hinweis deutlich verkleinert: „Interne Simulation · kein CAN-TX“.
- Start-/Stop-Schaltfläche eindeutig in „Simulation starten/stoppen“ umbenannt.
- Backend-Anzeige, Zähler und Browser-Status kompakter gestaltet.
- Simulator-Tabelle vergrößert, damit mehr Frames ohne Scrollen sichtbar sind.
- Simulator-Frames können per Drag-and-drop neu sortiert werden.
- Die geänderte Reihenfolge wird sofort dauerhaft im Browser gespeichert.

# DEACS V0.12.33-TEST

- Simulator startet bei einer neuen Installation mit einer leeren Frame-Liste.
- Neuer Button „Beispiele laden“ fügt die bekannten Testframes bewusst ein.
- Neuer Button „Alle löschen“ entfernt nach Sicherheitsabfrage die komplette Simulator-Liste.
- Statuszähler für Frames, aktive und inaktive Einträge ergänzt.
- Leere Liste wird mit einem eindeutigen Hinweis dargestellt.
- Beispiel- und Löschfunktionen sind während eines laufenden Simulators gesperrt.
- Änderungen werden weiterhin dauerhaft im Browser gespeichert.

# DEACS V0.12.32-TEST

- Simulator-Liste wird lokal im Browser gespeichert und nach einem Neuladen wiederhergestellt.
- Hinzugefügte, gelöschte und aktivierte/deaktivierte Simulator-Frames bleiben erhalten.
- Beschädigte gespeicherte Einträge werden beim Laden automatisch verworfen.
- Beim ersten Start ohne gespeicherte Liste werden weiterhin die bisherigen Standard-Frames verwendet.

# DEACS V0.12.31-TEST

- Browser-Simulator erzeugt SIM-Frames jetzt vollständig lokal ohne ESP32-Verbindung.
- Lokale Frames werden in Monitor, Übersicht, Decoded-Auswertung und Browser-Logging eingespeist.
- Unabhängige Intervalle und dynamische Datenbytes funktionieren wie beim ESP32-Simulator.
- Beim Wechsel zwischen Browser- und ESP32-Verbindung wird ein laufender Simulator sicher gestoppt.

# DEACS V0.12.29-TEST

- Simulator zeigt automatisch die aktive Datenquelle ESP32 oder Browser.
- Start/Stop trennt die ESP32- und Browser-Pfade als Vorbereitung für den lokalen Offline-Simulator.
- Noch keine lokale Frame-Erzeugung in dieser Zwischenversion.

- Simulator-Dateneingabe formatiert HEX-Zeichen bereits während der Eingabe automatisch als Bytes.
- Eingabe auf maximal 8 Datenbytes begrenzt.
- Ungültige Zeichen werden entfernt; Kleinbuchstaben werden in Großbuchstaben umgewandelt.
- Unvollständiges letztes Byte wird markiert und kann nicht hinzugefügt werden.
- Präzisere Fehlermeldungen für Simulator-ID und Daten.

# DEACS V0.12.27-TEST

- Übersicht nach ID, Label, Frames und Alter sortierbar.
- Sortierung bleibt nach neuen Frames und nach Browser-Neustart erhalten.
- Auswahl bleibt bei Aktualisierungen erhalten und unterscheidet Standard-/Extended-IDs korrekt.
- Tabellenkopf, Spaltenbreiten und Monospace-Darstellung vereinheitlicht.
- Keine Änderungen an Firmwarelogik, Monitor, Logs oder TX.

# DEACS V0.12.26-TEST

- TX-Verlauf: Einfachklick markiert, Doppelklick übernimmt den Frame.
- Entf-Taste löscht den markierten Verlaufseintrag.
- Zuletzt gesendeter Frame wird zwei Sekunden grün hervorgehoben.
- Feste Spaltenbreiten und Monospace-Datenbytes im TX-Verlauf.
- Fokus nach Senden und Listenlöschen zurück im ID-Feld.
- Schutz vor doppeltem Senden durch schnellen Doppelklick.

# DEACS V0.12.25-TEST

- TX-Verlauf wird bei schnellem oder zyklischem Senden nur noch gesammelt aktualisiert.
- Browser-Speicherung und Tabellen-Neuzeichnung erfolgen maximal alle 500 ms.
- Die Anzahl gesendeter Frames bleibt korrekt, während die Oberfläche bei kurzen Intervallen deutlich flüssiger bleibt.
- Löschen einzelner Einträge oder der gesamten Liste wird weiterhin sofort angezeigt und gespeichert.

# V0.12.24-TEST

- TX-Verlauf zeigt zusätzlich, wie oft ein Frame gesendet wurde.
- Die Uhrzeit der letzten Sendung wird angezeigt.
- Beim erneuten Senden wird der vorhandene Eintrag aktualisiert und nach oben verschoben.
- Gespeicherte HEX-IDs bleiben nach einem Browser-Neustart unverändert; die bisher mögliche falsche Umwandlung in Dezimal wurde behoben.

# V0.12.23-TEST

- TX-Verlauf wird im Browser gespeichert und nach Neuladen wiederhergestellt.
- Es werden weiterhin maximal 50 unterschiedliche gesendete Frames gespeichert.
- Einzelnes Löschen und „Liste löschen“ aktualisieren den gespeicherten Verlauf sofort.
- Ungültige oder beschädigte gespeicherte Einträge werden beim Laden verworfen.

# V0.12.22-TEST

- TX-Verlauf erhält den Button „Liste löschen“ mit Sicherheitsabfrage.
- Ein Klick auf eine Verlaufszeile übernimmt ID, DLC, Daten, EXT und RTR in die TX-Eingabe.
- Nach erneutem Senden erscheint kurz „Frame erneut gesendet.“.
- Gleiche Frames werden weiterhin nur einmal geführt und nach erneutem Senden nach oben verschoben.
- Senden aus dem Verlauf bleibt im Listen-only-Modus deaktiviert.

# V0.12.21-TEST

- Beim zyklischen Senden werden ID, DLC, Datenbytes, EXT/RTR und Intervall gesperrt.
- Der aktive Zyklus wird mit Intervall direkt im TX-Bereich angezeigt.
- Stoppen, Löschen oder Wechsel auf Listen-only beendet den Zyklus sauber und gibt die Eingaben wieder frei.
- Der zyklisch gesendete Frame bleibt während des gesamten Zyklus unverändert.

# V0.12.20-TEST

- TX-Eingabe prüft CAN-ID vor dem Senden.
- Ungültige IDs werden markiert und nicht gesendet.
- Erfolgreiches Senden wird kurz bestätigt.
- Zyklisches Senden erzeugt bei Eingabefehlern keine unbehandelten JavaScript-Fehler.

# DEACS V0.12.19-TEST

- TX-Hinweis im Listen-only-Modus ergänzt.
- Hinweis verschwindet automatisch, sobald ein sendefähiger CAN-Modus aktiv ist.
- Senden, Zyklus und erneutes Senden werden weiterhin zentral über den CAN-Status aktiviert/deaktiviert.

## V0.12.18-TEST
- TX-Senden und zyklisches Senden sind im Listen-only-Modus deaktiviert.
- Senden aus der Historie ist im Listen-only-Modus deaktiviert.
- Die interne TX-Debugausgabe unter den Bedienelementen wurde entfernt.

## V0.12.17-TEST

- Monitorzeilen lassen sich anklicken und bleiben markiert.
- Doppelklick auf einen Monitorframe übernimmt ID, DLC, Daten, EXT und RTR in den TX-Bereich.
- Manuelles Scrollen pausiert Auto-Scroll automatisch.
- Neuer Button „Zum Ende“ aktiviert Auto-Scroll wieder und springt ans Tabellenende.
- Zeilenhöhe und Tabellenkopf im Monitor vereinheitlicht.

## V0.12.16-TEST

- Logs-Status kompakter beschriftet.
- Bereich „Geladene Daten“ in „Aktuelle Daten“ umbenannt.
- Importinformationen um Quelle und separate Dauer ergänzt.
- Zeitraum und Dauer werden nun getrennt und übersichtlicher angezeigt.
- Sonstige Funktionen unverändert.

## V0.12.15-TEST

- Log-Bedienung als eine klare Werkzeugleiste mit vier gleich großen Schaltflächen angeordnet.
- Export ist jetzt ein einzelner Button mit Dialog für DEACS (.dlog) oder CSV (.csv).
- Import öffnet weiterhin direkt die Dateiauswahl.
- Doppelte/verschachtelte Datei-Bedienelemente und das Dropdown wurden entfernt.
- Abstände und Größen im Logs-Tab vereinheitlicht.

## V0.12.14-TEST
- Logs: Die interne Anzeige „Noch im Puffer“ wurde aus der Oberfläche entfernt.
- Sonst keine funktionalen Änderungen.

## V0.12.13-TEST
- Logs: „Datei“-Button entfernt.
- Logs: ein „Export“-Button mit DEACS/CSV-Auswahl und ein direkter „Import“-Button.
- Sonst keine funktionalen Änderungen.

## V0.12.12-TEST

- Offline-Analysemodus und alle zugehörigen Offline-/Reconnect-Anpassungen wieder entfernt.
- Verbindungsverhalten entspricht wieder V0.12.7-TEST.
- ID-Umschaltung DEC/HEX bleibt erhalten.
- Weißer Fokusrahmen an der ID-Überschrift bleibt entfernt.

## 0.12.7-TEST
- CAN-ID-Anzeige per Klick auf die Spaltenüberschrift zwischen HEX und DEC umschaltbar.
- Gewähltes ID-Format wird im Browser gespeichert.

# Changelog

## V0.12.6-TEST
- Zyklus starten/stoppen ist jetzt ein einzelner Umschaltknopf in den Optionen.
- Der separate untere Aktionsbereich wurde entfernt.
- Senden und Löschen stehen direkt rechts neben dem aktuellen Frame.
- Löschen leert den Editor und beendet einen laufenden Zyklus.

# V0.12.4-TEST

- DEACS-Logdatei (`.dlog`) speichern und wieder importieren.
- DLOG enthält Formatkennung, Metadaten und alle CAN-Frames.
- DLOG- und CSV-Export werden bei ungefähr 5 MB in Teile aufgeteilt.
- Import-Schaltfläche akzeptiert `.dlog`, `.csv` und `.json`.
- CAN- und WebSocket-Pfad unverändert.

# V0.12.2-TEST

- Log-Tab für Desktop-Bildschirme kompakter gestaltet.
- Statuswerte in drei Spaltenpaaren angeordnet.
- Importbereich, Aktionsgruppen und Hinweise platzsparend angeordnet.
- Keine Änderung an Logging-, IndexedDB- oder CSV-Logik.

# V0.12.1-TEST

- WebSocket-Heartbeat auf dem ESP aktiviert; tote Clients werden automatisch getrennt.
- Browser-Reconnect mit sauberem Socket-Austausch, Verbindungs-Timeout und gestaffelten Wiederholungen.
- Browser-Watchdog erzwingt bei ausbleibenden Statusdaten einen Neuaufbau.
- Reconnect nach Rückkehr zum Tab oder nach Netzwerk-Wiederkehr.
- Übersicht: Hz und die doppelte Spalte Änderungen entfernt.
- Frame-Zahl blitzt größer und kräftiger rot.
- CAN-RX-Pfad unverändert gegenüber V0.12.0-TEST.

# V0.12.0-TEST

Experimenteller, jederzeit rückbaubarer Analyse-Stand auf Basis von V0.11.26.

- Übersicht ergänzt um Live-Frequenz pro CAN-ID (2-Sekunden-Fenster).
- Δt-Statistik pro ID: Mittelwert, Minimum und Maximum.
- Gesamtzahl geänderter Frames pro ID.
- Änderungszähler für jedes Datenbyte D0 bis D7 direkt unter dem aktuellen Bytewert.
- CAN-Kern, TWAI-Konfiguration, WebSocket-Pipeline und Simulator unverändert.
- V0.11.26 bleibt als stabile Rückfallversion erhalten.

# V0.11.26

- TWAI-RX-Queue von 256 auf 512 Frames vergrößert.
- RX-Drain-Budget pro Task-Durchlauf von 32 auf 256 Frames erhöht.
- RX-Task-Priorität von 10 auf 12 angehoben; Core-Zuordnung bleibt Core 1.
- Diagnosewert `Max. RX-Burst` ergänzt, um Lastspitzen und das Erreichen des Drain-Limits sichtbar zu machen.
- Keine Änderungen an CAN-Bittiming, Filtern, Logging oder der WebSocket-Batchgröße.

# V0.11.25

- Kopfzeile auf die wesentlichen Betriebswerte reduziert: Verbindung, CAN-Modus, Bitrate, RX/s, TX/s, Queue, Drops und TWAI-Verluste.
- Erweiterte Pipeline-, TWAI-, Alert- und RXD-Diagnose in den ausklappbaren Bereich „Diagnose und Gerätestatus“ verschoben.
- Keine Änderung an CAN-Empfang, Bittiming, Ringpuffer oder WebSocket-Pipeline.
- Hardware-Dokumentation um die korrekte 5-V-zu-3,3-V-Pegelanpassung für TJA1050-RXD ergänzt.

# V0.11.24

- Datenpfad-Diagnose ergänzt: TWAI-RX, erfolgreiche Ringbuffer-Schreibvorgänge, Ringbuffer-Lesevorgänge, WebSocket-Frames, Browser-Empfang und Serverfilter jeweils als Frames/s.
- Kumulative Pipeline-Zähler in `/api/status` ergänzt.
- Keine Änderung an CAN-Bittiming, Listen-only-Trennung oder Ringbuffer-Größe.

## V0.11.23
- Diagnose des physischen CAN-RX-Eingangs ergänzt.
- Anzeige `RXD HIGH/LOW` und prozentualer LOW-Anteil pro Sekunde.
- Klargestellt: `twai_status_info_t::bus_error_count` ist in der verwendeten ESP32-Plattform vorhanden; ein Anstieg nahe der Bitrate deutet auf dauerhaft dominanten RXD-Pegel hin.
- Sichere TX-Trennung im Listen-only-Modus unverändert.

## 0.11.22

- Alert-Auswertung instrumentiert: jede erfolgreiche `twai_read_alerts()`-Lesung wird genau einmal gezählt.
- Rohmaske des letzten Alerts wird hexadezimal angezeigt.
- `BUS_ERROR`-Alert-Ereignisse und der native TWAI-`bus_error_count` werden getrennt dargestellt.
- Native Busfehler-Differenz pro Statusintervall ergänzt.
- Keine Änderung an Empfang, Timing oder sicherer Listen-only-TX-Isolation.

# Changelog

## 0.11.20
- Physische TX-Isolation im Listen-only-Modus: TWAI-TX wird auf den unbeschalteten GPIO27 umgeleitet.
- GPIO17 (Transceiver TXD) wird schon als erste Boot-Aktion auf HIGH/recessiv gesetzt.
- GPIO17 bleibt auch während CAN-Neustart und Treiberwechsel HIGH.
- Hardware-Dokumentation für den zwingend unbeschalteten Dummy-TX ergänzt.

## V0.11.20

- CAN-RX-Task auf Core 1 verschoben und Priorität auf 10 reduziert.
- LED-Zugriff aus dem RX-Task entfernt.
- RX wird in begrenzten Bursts verarbeitet und gibt danach den Scheduler frei.
- WebSocket-Ausgabe wird maximal alle 25 ms oder bei vollem 64-Frame-Batch gesendet.
- Browser-Monitor rendert höchstens alle 50 ms.
- Fehlerdiagnose in Busfehler, RX-Queue-voll, Error-Passive, TX-Fehler und Bus-Off getrennt.
- Freier Heap und größter freier Heap-Block im Status ergänzt.

# Changelog

## 0.11.20
- CAN-Empfang in hochpriorisierten FreeRTOS-Task auf Core 0 ausgelagert.
- TWAI-RX-Queue auf 256 und SPSC-Ringpuffer auf 2048 Frames vergrößert.
- Lock-free Ringpuffer mit Drop- und High-Water-Diagnose.
- Serielle Ausgabe jedes CAN-Frames entfernt.
- WebSocket-Frames werden in Paketen bis 64 Frames übertragen.
- Diagnose um TWAI RX missed/overrun und Ringpuffer-Maximalstand ergänzt.

# DEACS V0.11.17

## 0.11.17

- Änderungen von CAN-Bitrate und CAN-Modus werden sofort übernommen.
- Der CAN-Treiber wird nach jeder Auswahl automatisch neu gestartet.
- Der Button „CAN neu starten“ wurde entfernt.
- Bei einem fehlgeschlagenen Neustart wird die letzte funktionierende CAN-Konfiguration wiederhergestellt.
- Eingehende Bitrate- und Moduswerte werden serverseitig validiert.

## 0.11.16

- CAN-Modus und Bitrate werden beim Bearbeiten nicht mehr durch den sekündlichen Status-Refresh zurückgesetzt.
- Nach erfolgreichem CAN-Neustart werden die tatsächlich übernommenen Einstellungen angezeigt.
- Bei fehlgeschlagenem CAN-Neustart bleibt die gewählte Einstellung sichtbar und es erscheint eine Fehlermeldung.

# DEACS V0.11.15

## 0.11.15

- Importierte Datei bleibt im Logging-Bereich mit Dateiname, Framezahl, Zeitbereich, Dateigröße und Importzeit sichtbar.
- CAN-Senden-Bereich in ein ausgerichtetes Raster mit klaren Gruppen aufgeteilt.
- TX-Bedienelemente und Aktionen responsiv vereinheitlicht.


## 0.11.14
- Datenimport zeigt importierte Frames sofort im Monitor an.
- Monitor-Anzeigefilter werden beim Import zurückgesetzt, damit Daten sichtbar sind.
- CSV-Feld `Extended` wird korrekt als IDE/Extended-ID erkannt.
- Browser-Alerts und Bestätigungen durch DEACS-eigene Meldungen und Dialoge ersetzt.
- Log-Aktionen optisch gruppiert und an das restliche Design angepasst.

# DEACS V0.11.13

## 0.11.13

- JavaScript-Startfehler aus V0.11.11 behoben.
- Fehlende Decoder-, Label- und Formatierungsfunktionen wiederhergestellt.
- WebSocket-Verbindung startet wieder zuverlässig.
- IndexedDB-Browser-Logging aus V0.11.10/11 bleibt erhalten.
- Frames-Zahl blitzt weiterhin bei jedem neuen Paket rot und fett.

# DEACS V0.11.13

## 0.11.13

- **Neue Pakete: Ein** reagiert jetzt bei jedem empfangenen CAN-Frame.
- Die Frames-Zahl der betreffenden CAN-ID blitzt kurz rot und fett auf.
- Die komplette Zeile, der Hintergrund und der Rahmen bleiben unverändert.
- **Neue Daten** markiert weiterhin ausschließlich geänderte Datenbytes D0 bis D7.

# DEACS V0.11.10

## 0.11.10

- CSV-Direktschreiben über die File System Access API entfernt.
- Browser-Logging auf IndexedDB umgestellt; funktioniert auch in Firefox.
- Frames werden alle 1 Sekunde, nach 1000 Frames oder ab 256 KiB gepuffert gespeichert.
- Bereits gespeicherte Daten bleiben nach F5 oder Browserabsturz erhalten.
- Letzte Log-Session wird beim Öffnen automatisch erkannt.
- Manueller CSV-Export aus IndexedDB, automatisch in ungefähr 5-MB-Dateien aufgeteilt.
- Schaltfläche zum vollständigen Löschen der lokalen Browser-Logs ergänzt.

# DEACS V0.11.9

- Fehler in der Übersicht behoben: Bei **Neue Pakete: Ein** wird die Frames-Zahl einer erstmals erkannten CAN-ID jetzt rot und fett dargestellt.
- Die Markierung verwendet nun dieselbe CSS-Klasse wie die JavaScript-Ausgabe.
- Keine rote Zeile, kein roter Hintergrund und kein Rahmen.


## 0.11.8

- Browserbasiertes CSV-Datei-Logging ergänzt.
- Direkte fortlaufende Speicherung in einen ausgewählten Ordner über die File System Access API.
- Automatischer Dateiwechsel bei 5 MiB pro CSV-Datei.
- Dateinamen nach Schema `DEACS_JJJJ-MM-TT_HH-MM-SS_001.csv`.
- Jede Teildatei enthält einen eigenen CSV-Kopf.
- Schreibpuffer wird nach spätestens 1 Sekunde, 1000 Frames oder 256 KiB geleert.
- Log-Anzeige zeigt aktuelle Datei, Teilgröße, Gesamtgröße und Framezahl.
- Warnung beim Schließen oder Neuladen, solange Logging aktiv ist.
- Direkte Dateiausgabe ist für Chrome und Edge vorgesehen; Firefox unterstützt die notwendige Ordner-Schnittstelle nicht.

## 0.11.8

- Serverfilter vereinfacht: Ein/Aus-Schalter plus Liste exakter CAN-IDs.
- Mehrere IDs können mit Leerzeichen, Komma oder Semikolon getrennt werden.
- ID/Masken-Eingabe entfernt.
- CAN-Einstellungen und Serverfilter jeweils kompakt in einer Zeile angeordnet.
- Gerätestatus in einen aufklappbaren Bereich verschoben.
- Bei „Neue Pakete“ wird nur die Frames-Zahl kurz rot und fett.
- Bei „Neue Daten“ blitzen ausschließlich geänderte D0–D7-Zellen.
- Monitor und Übersicht bleiben getrennte Ansichten.

## Änderungen

- Simulator-Scheduler vollständig in die ESP32-Firmware verschoben.
- Jede Simulator-Message besitzt einen eigenen Sendezeitpunkt und ihr eigenes Intervall.
- Browser- und WLAN-Verzögerungen beeinflussen die Simulator-Intervalle nicht mehr direkt.
- Verspätete Simulator-Frames werden nicht nachträglich als Warteschlange abgearbeitet.
- Stop beendet den Simulator sofort und verwirft alle nächsten Sendezeitpunkte.
- Start überträgt die aktuell aktivierten Simulator-Zeilen neu an den ESP32.
- Delta-Zeit im Monitor bleibt pro CAN-ID berechnet.
- CAN-IDs, die in Decoded Messages liegen, erhalten auch im Monitor die dezente blaue Markierung.
- Bei **Neue Daten: Ein** blitzt zusätzlich zur geänderten Byte-Zelle auch der zugehörige Framezähler kurz rot.
- Monitor und Übersicht bleiben getrennte Ansichten.
- Version auf 0.11.6 aktualisiert.

## V0.12.4-TEST
- Log starten und stoppen zu einem Umschaltknopf zusammengeführt.
- Dateiaktionen in einem gemeinsamen Menü gebündelt: DEACS speichern, CSV exportieren und DEACS/CSV importieren.
- Logging- und Import/Export-Logik unverändert.


## V0.12.42-TEST
- Generator: Byte-Maske B0 bis B7 und feste Grunddaten ergänzt.
- Generator: kompakte Live-Vorschau des erzeugten Frames ergänzt.
- Übersicht: empfangenen Frame direkt als Generator-Grundlage übernehmen.
- Nicht ausgewählte Bytes bleiben unverändert.

## V0.12.52-TEST

- Reine UI-Aufräumrunde ohne Änderungen an CAN-, TX-, Simulator- oder Generatorlogik.
- Äußeren Kartenrahmen des Simulator-Tabs entfernt; der Inhalt nutzt wieder die normale DEACS-Fläche.
- Simulator-Status als dezente Textzeile statt als zusätzlicher Kasten dargestellt.
- Decoded- und Simulator-Tabelle optisch an die bestehende Übersicht angeglichen.
- Tabellenfelder bleiben im Ruhezustand rahmenlos und zeigen den Rahmen erst beim Bearbeiten.
- Drei-Punkte-Menüs sind im Ruhezustand unauffällig und werden erst bei Hover, Fokus oder Öffnen sichtbar.
- Markierte Zeilen verwenden weiterhin nur Hintergrund und linke DEACS-Akzentlinie.


## V0.12.57-TEST

- Übersicht startet mit **Nur Änderungen: Ein**.
- Geänderte Frames bleiben für ein konfigurierbares Zeitfenster sichtbar.
- Einstellbar: 0,5 / 1 / 2 / 3 / 5 / 10 / 30 / 60 Sekunden; Standard 2 Sekunden.
- Die gewählte Anzeigedauer wird im Browser gespeichert.
- Nach Ablauf verschwinden unveränderte Frames automatisch aus der gefilterten Übersicht.


## V0.12.58-TEST

- Frames werden nach Ablauf des Zeitfensters von **Nur Änderungen** nicht mehr abrupt entfernt.
- Die betroffene Zeile wird 400 ms lang weich gedimmt und anschließend aus der Übersicht entfernt.
- Trifft während des Ausblendens erneut eine Datenänderung ein, erscheint die Zeile sofort wieder vollständig.
- Zeitfenster und bestehende Filterlogik bleiben unverändert.

### V0.12.69-TEST Build-Fix
- Arduino-Makrokonflikt `HEX` in `src/web_app.cpp` behoben.
- Hex-Zifferntabelle in `HEX_DIGITS` umbenannt.
- Projektordner in der ZIP auf `DEACS_V0.12.69_TEST_source` korrigiert.

### V0.13.00-TEST Style-Konsolidierung
- Tabellenüberschriften auf allen Seiten verbindlich mittig über den jeweiligen Datenspalten ausgerichtet.
- Sortier- und Aktionsinhalte innerhalb von Kopfzellen ebenfalls zentriert.
- Zentrale CSS-Variablen für Eingabehöhe, Buttonhöhe, Tabellenkopf, Tabellenzeile, Abstände und Rundung ergänzt.
- DEACS-Styleguide um die verbindliche projektweite Tabellenregel erweitert.

- Simulator-Tabelle mit gemeinsamem `colgroup` für exakt identische Spaltenbreiten in Kopf und Daten versehen.
- ID-, Label-, DLC-, Byte-, Intervall-, Status- und Aktionsspalten sind nun dauerhaft deckungsgleich ausgerichtet.
