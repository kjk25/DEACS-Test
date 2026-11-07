# Speichergrenzen

DEACS begrenzt das Wachstum von Nutzdaten auf 80 % des jeweiligen verfügbaren Speicherpools. Die Grenze ist gemeinsam: Simulator, Filter und Diagnosehistorie erhalten nicht jeweils 80 % desselben RAMs. Eine feste Anzahl möglicher Einträge lässt sich deshalb nicht angeben.

## ESP32 und ESP32-S3

- Simulator, Serverfilter und Diagnosehistorie wachsen blockweise. Die früheren Grenzen von 16, 32 und 24 Einträgen entfallen.
- Datenblöcke werden bevorzugt im tatsächlich erkannten PSRAM angelegt. Ohne PSRAM oder bei ausgeschöpftem PSRAM-Budget wird interner Heap verwendet, soweit dort noch Budget besteht.
- Interner Heap und PSRAM behalten jeweils mindestens 20 % ihrer vom Heap-Allocator gemeldeten Gesamtkapazität frei. Statische Firmwaredaten sind bereits außerhalb dieses dynamischen Budgets belegt. Fragmentierung oder fehlende zusammenhängende Blöcke können eine Anforderung früher scheitern lassen.
- An der Grenze werden neue Einträge abgelehnt; bestehende Einträge bleiben erhalten. `/api/sim/add` und `/api/filter` melden Speichermangel mit HTTP 507. Ein unvollständig übertragener Simulator wird nicht gestartet; die Browserliste bleibt erhalten.
- Der Simulator arbeitet pro Hauptschleifendurchlauf maximal ungefähr 2 ms an seiner Liste, damit Netzwerk und CAN-Verarbeitung weiter bedient werden. Viele gleichzeitig fällige Einträge können trotzdem später als ihr Sollintervall verarbeitet werden. Speichergröße garantiert keine bestimmte Simulationsrate.
- Der Serverfilter wird bei mehr als 32 IDs ausschließlich softwareseitig umgesetzt. Der Status enthält dann eine Vorschau; `/api/filter/ids` liefert die vollständige Liste als gestreamten Text.
- Diagnosehistorie, Filtertext und DBC-Dateiliste werden gestreamt ausgegeben. Es muss keine zweite vollständige Kopie im internen RAM aufgebaut werden.

Zeitkritische Transportpuffer bleiben begrenzt: TWAI-RX-Queue, lockfreier CAN-Ring, WebSocket-Batches und Diagnose-Textlängen sind Arbeitsmittel der Datenpipeline. Sie wachsen nicht bis zur Speichergrenze. Das 80-%-Budget betrifft die wachsenden Nutzdatenlisten und Dateioperationen; es ist kein globaler Eingriff in sämtliche Allokationen von WLAN, Arduino oder Drittbibliotheken. Diese nutzen die Betriebsreserve weiterhin.

## ESP32-Dateisystem

Das Budget bezieht sich auf die LittleFS-Partition, nicht auf die gesamte Flashgröße einschließlich Firmware und OTA-Partitionen. Webdateien, DBCs und ESP32-Logs zählen gemeinsam zur Belegung.

DBC-Uploads und ESP32-Logging prüfen vor dem Schreiben die 80-%-Grenze einschließlich einer Reserve für Dateisystemblöcke. Der ESP32-Logger stoppt bei fehlendem Platz. `logMemoryLimited` meldet diesen Zustand im Status. Fehler beim Schreiben stoppen den Logger ebenfalls.

Die feste 512-KiB-Grenze pro DBC entfällt. Dateien werden gestreamt; die tatsächliche Grenze ergibt sich aus dem Dateisystembudget. Beim Ersetzen einer DBC wird eine temporäre Datei geschrieben und anschließend umbenannt. Dafür muss vorübergehend Platz für alte und neue Datei bestehen. Ein fehlgeschlagener Upload entfernt nur die temporäre Datei.

## Browser

Browserdaten liegen im Computer beziehungsweise Mobilgerät, nicht im ESP32-PSRAM:

- Monitor, Übersicht, Simulator, TX-Historie, Decoded-Liste, Labels, Ereignismarker, Importe, Wiedergabe und Analyse prüfen den gemeinsamen Browser-RAM-Bedarf vor zusätzlichem Wachstum. Die bisherigen Grenzen von 10.000 Monitorframes, 50 TX-Einträgen und 5.000 Simulator-Importeinträgen entfallen.
- Wenn `performance.memory` gültige Werte liefert, verwendet DEACS die gemeldete Heap-Belegung und Heap-Grenze statt der konservativen Objektgrößenschätzung. Diese API ist browserabhängig. Ohne sie wird ein Viertel der von `navigator.deviceMemory` gemeldeten RAM-Kapazität als Budget angesetzt, begrenzt auf 128 bis 2.048 MiB. Fehlt auch diese grobe Kapazitätsangabe, beträgt das Ersatzbudget 512 MiB. Davon werden maximal 80 % genutzt. Diese Angaben messen nicht den freien Betriebssystem-RAM und garantieren keine tatsächliche Browser-Heap-Grenze.
- Ein voller Monitor stoppt weder Simulator noch Generator oder Wiedergabe. Weitere Monitor-Frames werden mit sichtbarem Verlustzähler abgelehnt; Erzeugungs- und Empfangszähler laufen weiter. Bereits gepufferte Frames bleiben erhalten. Ein wegen Speicherknappheit abgelehnter Simulator-Neustart aus dem Editor behält die bisherigen Timer bei.
- Kleine USB-HTTP-Antworten bis 64 KiB nutzen die Betriebsreserve, damit Status, Stoppen und Leeren auch bei ausgeschöpftem Monitor-Budget bedienbar bleiben. Größere Antworten prüfen weiterhin das Browser-Budget.
- Objektgrößen werden konservativ geschätzt; Import und Analyse reservieren zusätzlichen Platz für temporäre Daten. Speicherbelegung wird regelmäßig neu bewertet. Browser und Garbage Collector können davon abweichen.
- Simulator, TX-Historie, Decoded und Labels zeigen jeweils 200 Zeilen pro Seite. Alle gespeicherten Einträge bleiben über die Seiten erreichbar. Monitor und Übersicht behalten ihre bestehenden begrenzten beziehungsweise virtuellen Darstellungsfenster.
- Der CAN-Monitor hält höchstens 1.200 Datenzeilen gleichzeitig im DOM; der Scrollbereich umfasst alle zum Filter passenden gepufferten Frames. Bei ausgeschaltetem Auto-Scroll werden neue Frames weiter erfasst und die Tabelle aktualisiert, während Scrollposition und betrachtete Zeilen stehen bleiben. Neue Frames sind durch manuelles Scrollen erreichbar. „Zum Ende“ aktiviert Auto-Scroll erneut.
- Bei Live-Empfang werden Browserframes in einer begrenzten Arbeitswarteschlange mit 8.192 Plätzen aufgenommen und in Portionen von höchstens 128 Frames beziehungsweise etwa 4 ms verarbeitet. Zwischen den Portionen erhalten Bedienung, Status und Rendering Rechenzeit. Ein einzelner Verarbeitungsschritt kann die Zeitgrenze überschreiten. Auch der USB-WebSocket gibt nach etwa 4 ms gepufferter Verarbeitung an die Ereignisschleife zurück.
- Der Monitor rendert ungefähr zehnmal pro Sekunde nur den sichtbaren Ausschnitt mit einigen zusätzlichen Zeilen. Filtereingaben werden einmal je Renderdurchlauf gelesen. Bei unverändertem Ausschnitt bleiben bestehende Datenzeilen erhalten.
- Bei voller Browser-Empfangswarteschlange werden neu ankommende Frames verworfen. Auch wegen des Browser-RAM-Budgets abgelehnte Live-Frames zählen zum separaten Browser-Verlustzähler. „Browser wartend / verworfen“ macht diese Verluste sichtbar; sie fehlen auch im Browser-Log und sind von ESP32-Ring-Drops und TWAI-Verlusten zu unterscheiden. „Leeren“ leert auch die Arbeitswarteschlange und setzt diesen Zähler zurück. Der Schutz garantiert keine verlustfreie Erfassung bei beliebiger Bus- oder Transportlast.
- Lokale Listen bleiben im `localStorage`; hier gilt separat ein Budget von 80 % von 5 MiB. Schreibfehler werden angezeigt und der bisher gespeicherte Stand bleibt erhalten. Änderungen im RAM können weiterhin exportiert werden.
- Browser-Logging verwendet IndexedDB. Vor jeder Schreibcharge wird `navigator.storage.estimate()` geprüft, sofern verfügbar. Unter unverschlüsseltem HTTP kann diese API fehlen. Dann verwendet DEACS ein ausgewiesenes 128-MiB-Dateibudget mit einer Schätzung aus den gespeicherten Sessionzählern und Aufschlägen für Datensätze/Indizes. Andere Anwendungen desselben Ursprungs sind in dieser Ersatzschätzung nicht enthalten.
- Bei Quoten- oder Schreibfehlern stoppt die Aufzeichnung. Nicht geschriebene Frames bleiben im RAM und werden beim CSV-/DLOG-Export mit ausgegeben. Ein Neustart des Loggings darf diesen Puffer nicht überschreiben; zuerst exportieren und anschließend die lokalen Logs bewusst löschen.
- Export erfolgt weiterhin in ungefähr 5-MiB-Teilen, damit auch an der Wachstumsgrenze mit begrenztem temporärem Speicher exportiert werden kann.

Die Diagnose zeigt die getrennten Belegungen und kennzeichnet Browser-Schätzungen. Eine exakt garantierte Grenze von 80 % über sämtliche Browserprozesse ist mit den verfügbaren Browser-APIs nicht möglich.

## Prüfung

`python tools/test_memory_browser.py` startet einen lokalen Testserver und eine isolierte Headless-Chrome-Sitzung. Geprüft werden unter anderem Listen über den alten Grenzen, Seitennavigation mit korrekten Zeilenaktionen, Ablehnung bei 80 %, Erhalt bereits gespeicherter Daten und Export ungespeicherter Logframes nach Quotenfehlern.

Firmware und LittleFS müssen nach der Änderung erneut gebaut und hochgeladen werden. Ein Langzeit- und Lasttest auf echter ESP32-/S3-Hardware steht noch aus.
