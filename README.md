# DEACS V0.13.32-TEST

**Deutsch** | [English](README_EN.md)

**Der Etwas Andere CAN Sniffer** ist ein browserbasiertes CAN-Werkzeug für den ESP32. Es empfängt, analysiert, protokolliert, simuliert und sendet klassische CAN-Frames über den internen TWAI-Controller des ESP32.

> Diese Version ist eine TEST-Version. Beim aktiven Senden an einem Fahrzeug-CAN ist besondere Vorsicht erforderlich.

![DEACS V0.13.32-TEST – CAN-Monitor](docs/images/deacs-monitor-v0.13.32.png)

![DEACS V0.13.32-TEST – CAN-Übersicht](docs/images/deacs-overview-v0.13.32.png)

![DEACS V0.13.32-TEST – Browser-Logging und Import](docs/images/deacs-logging-v0.13.32.png)

## Funktionen

- Live-Monitor für Standard- und Extended-CAN-Frames
- Übersicht mit Änderungs-, Decoded- und Frequenzfiltern
- DBC-Decodierung und verwaltbares Label Dictionary
- Einzelne und zyklische TX-Frames
- Simulator, Generator und Log-Wiedergabe
- Optionales Live-Senden von Simulator, Generator und Log-Wiedergabe
- CAN-Filter zum gezielten Anzeigen oder Ausblenden mehrerer IDs
- Browser-Logging mit Export als DEACS-Log (`.dlog`) oder CSV
- Ereignis-Analyse mit Markern, Zeitfenstern sowie Vorher-/Nachher-Vergleich
- Globale ID-Anzeige in Hexadezimal oder Dezimal; Hexwerte werden mit kleinem `0x` dargestellt
- Diagnoseanzeigen für CAN-Status, Queue, Drops, TWAI-Fehler und fehlendes ACK

## Hardware

- ESP32 Dev Module / ESP32-WROOM-32D
- Externer 3,3-V-kompatibler CAN-Transceiver
- Der ESP32 verwendet seinen internen TWAI-Controller; ein MCP2515 wird nicht benötigt.

| Signal | ESP32-Pin |
|---|---:|
| CAN TX | GPIO 17 |
| CAN RX | GPIO 16 |
| Aktivitäts-LED | GPIO 2 |

Der CAN-Bus muss passend terminiert sein. Üblich sind 120 Ohm an beiden Busenden.

### WeAct Studio ISOCANFD Module V1 anschließen

![DEACS – ESP32 mit CANFD ISO verbinden](docs/images/esp32-canfd-iso-wiring.png)

Das gezeigte Board verwendet den isolierten CAN-FD-Transceiver **CA-IS2062A**. Laut Herstellerangabe unterstützt es bis zu **5 Mbit/s**, eine Logikspannung `VIO` von **2,5–5,5 V**, eine Versorgung von **4,5–5,5 V** und eine Isolation von **2,5 kV**. DEACS verwendet davon klassische CAN-Übertragung bis 1 Mbit/s.

| ESP32 | CANFD ISO | Funktion |
|---|---|---|
| VIN / 5V | 5V | Versorgung des Transceiver-Boards |
| 3V3 | VIO | 3,3-V-Logikpegel für den ESP32 |
| GND | G | Masse der ESP32-Seite |
| GPIO 17 | TX | CAN-Sendedaten vom ESP32 |
| GPIO 16 | RX | CAN-Empfangsdaten zum ESP32 |
| – | H | CAN-H des Busses |
| – | L | CAN-L des Busses |
| – | G1 | optionale CAN-Bus-Bezugsmasse |

`G` und `G1` gehören zu den beiden getrennten Seiten des Moduls und dürfen für den isolierten Betrieb nicht miteinander verbunden werden. Den 120-Ω-Schalter nur einschalten, wenn DEACS an einem Ende des CAN-Busses sitzt und dort noch kein Abschlusswiderstand vorhanden ist.

Ausführliche Hinweise: [WeAct Studio ISOCANFD Module V1 verwenden](docs/CANFD_ISO_BOARD.md).

## CAN-Modi

- **Nur Mithören:** empfängt Frames und hält den Transceiver-TX-Ausgang rezessiv.
- **Normal / TX:** sendet nur mit ACK. Fehlt ein weiterer aktiver CAN-Teilnehmer, wird der Fehler in der Oberfläche angezeigt.
- **TX ohne ACK:** ermöglicht Tests ohne weiteren CAN-Teilnehmer. Dieser Modus ist für Prüfaufbauten gedacht.

Die Board-LED zeigt erfolgreiche Live-Sendungen auf dem CAN-Bus an. Reine Simulator- oder Generator-Daten ohne Live-TX lösen sie nicht aus.

## Installation und Upload

Benötigt werden [Visual Studio Code](https://code.visualstudio.com/) und [PlatformIO](https://platformio.org/).

1. Repository öffnen.
2. ESP32 per USB verbinden.
3. In VS Code den Standard-Build-Task **DEACS: Upload komplett** starten.

Der Task baut die Firmware und überträgt anschließend Firmware und LittleFS-Weboberfläche. Alternativ:

```text
pio run
pio run -t upload
pio run -t uploadfs
```

Nach Änderungen an Dateien unter `data/` muss auch LittleFS erneut hochgeladen werden.

### Komplettes BIN für den Browser-Flasher erstellen

Der zusätzliche VS-Code-Task **DEACS: Web-Flasher BIN erstellen** baut Firmware und LittleFS und verbindet anschließend alle benötigten Bestandteile zu einer einzigen Datei:

`release/DEACS_V0_13_32_TEST_webflash.bin`

Der bisherige Task **DEACS: Upload komplett** bleibt unverändert.

### Mit esptool-js flashen

1. Die Datei [`DEACS_V0_13_32_TEST_webflash.bin`](release/DEACS_V0_13_32_TEST_webflash.bin) herunterladen oder mit dem VS-Code-Task **DEACS: Web-Flasher BIN erstellen** lokal erzeugen.
2. [Espressif ESP Tool](https://espressif.github.io/esptool-js/) in Chrome oder Edge öffnen. Safari wird nicht unterstützt.
3. ESP32 per USB verbinden und **Connect** wählen.
4. Unter **Program** die heruntergeladene Datei auswählen.
5. Als Flash-Adresse `0x0` eintragen.
6. **Program** starten und warten, bis das Schreiben abgeschlossen ist.
7. Den ESP32 neu starten und mit dem WLAN `DEACS` verbinden.

Das Gesamt-BIN enthält Bootloader, Partitionstabelle, Firmware und die vollständige LittleFS-Weboberfläche. Es darf deshalb ausschließlich an Adresse `0x0` geflasht werden.

## Erster Start

Der ESP32 stellt einen eigenen WLAN-Access-Point bereit:

| Einstellung | Wert |
|---|---|
| WLAN | `DEACS` |
| Passwort | `deacs123` |
| Weboberfläche | `http://192.168.4.1` |

Nach dem Verbinden mit dem WLAN die Weboberfläche im Browser öffnen.

## Bedienbereiche

- **Monitor:** fortlaufende Frame-Liste mit Suche, Filtern, Pause und Auto-Scroll
- **Übersicht:** eine Zeile je CAN-ID mit Zykluszeiten und Byte-Änderungen
- **Decoded messages:** DBC-decodierte Signale
- **Label dictionary:** eigene Bezeichnungen für CAN-IDs importieren, exportieren und bearbeiten
- **TX:** einzelne oder zyklische Frames konfigurieren
- **Simulator:** Frames erzeugen, importierte Logs abspielen und Generatoren verwalten
- **Logs:** Aufzeichnung, Import, Wiedergabe und Export
- **Ereignis:** Marker setzen und Änderungen vor und nach einem Ereignis vergleichen
- **Settings:** Bitrate, Betriebsart, ID-Darstellung, Live-TX-Quellen, CAN-Filter und DBC-Dateien

## DBC-Dateien

DBC-Dateien können in den Einstellungen direkt hinzugefügt, ausgewählt und gelöscht werden. Sie werden im LittleFS des ESP32 gespeichert. Manuelle Einträge im Label Dictionary haben Vorrang vor DBC-Namen.

## Ereignis-Analyse

Die Analyse verwendet die Daten des aktuellen Monitors und speichert beim Setzen eines Markers dessen Quelle. Für ein einstellbares Zeitfenster vor und nach dem Marker werden geänderte IDs, Bytes und Bitpositionen ermittelt. Gleiche Daten oder zyklische Nachrichten können ausgeblendet werden.

## Projektstruktur

| Pfad | Inhalt |
|---|---|
| `src/` | ESP32-Firmware |
| `include/` | Konfiguration und Header |
| `data/` | Weboberfläche und LittleFS-Inhalte |
| `data/dbc/` | mitgelieferte DBC-Dateien |
| `docs/` | Hardware-, API- und Stil-Dokumentation |

Weitere Details: [Hardware](docs/HARDWARE.md), [API](docs/API.md) und [DEACS Styleguide](docs/DEACS_STYLEGUIDE.md).


## Danksagung

DEACS baut auf der Arbeit zahlreicher Open-Source-Projekte und ihrer Mitwirkenden auf. Besonderer Dank gilt:

- [Espressif ESP-IDF](https://github.com/espressif/esp-idf) für die ESP32-Plattform, den TWAI-Treiber, Wi-Fi und LittleFS
- [Arduino Core for the ESP32](https://github.com/espressif/arduino-esp32) als Firmware-Framework
- [PlatformIO](https://github.com/platformio/platformio-core) für Build, Abhängigkeitsverwaltung und Upload
- [arduinoWebSockets](https://github.com/Links2004/arduinoWebSockets) von Markus Sattler und allen Mitwirkenden für die WebSocket-Kommunikation
- [adamtheone/canDrive](https://github.com/adamtheone/canDrive), insbesondere `01_canSniffer_Arduino`, als Referenz für CAN-Sniffer, Simulation und Analyse
- [ludwig-v/arduino-psa-diag](https://github.com/ludwig-v/arduino-psa-diag) für grundlegende Arbeiten zur PSA-/Stellantis-Diagnose über CAN
- [Barracuda09/PyPSADiag](https://github.com/Barracuda09/PyPSADiag) für die weiterführende PSA-/Stellantis-Diagnose und als fachliche Referenz
- den Autoren und Mitwirkenden der verwendeten beziehungsweise referenzierten DBC-Dateien und CAN-Dokumentationen

Alle Namen und Marken gehören ihren jeweiligen Inhabern. Für eingebundene Drittinhalte gelten die jeweiligen Lizenzen und Nutzungsbedingungen der Ursprungsprojekte.

## Sicherheit

Das Senden beliebiger CAN-Frames kann Steuergeräte und Fahrzeugfunktionen beeinflussen. DEACS nur an geeigneten Testaufbauten oder mit vollständigem Verständnis des angeschlossenen Systems verwenden. Für Schäden durch unsachgemäßen Einsatz wird keine Haftung übernommen.
