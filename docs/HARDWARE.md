# DEACS-Hardware

Stand: **DEACS V0.13.44**

DEACS verwendet ein ESP32-S3-N16R8-Board mit internem TWAI-Controller. Der ESP32 besitzt keinen CAN-Leitungstreiber; zwischen ESP32 und CAN-H/CAN-L ist immer ein geeigneter Transceiver erforderlich.

## Pinbelegung

| Funktion | ESP32 | Verhalten |
|---|---:|---|
| Physischer CAN-TX | GPIO17 | zum TXD-Eingang des Transceivers |
| CAN-RX | GPIO16 | vom RXD-Ausgang des Transceivers |
| Listen-only Dummy-TX | GPIO21 | muss dauerhaft unbeschaltet bleiben |
| Aktivitäts-LED | GPIO2 | aktiv HIGH, sichtbarer Impuls nach erfolgreichem echtem TX |

Die LED reagiert auf erfolgreiche Sendungen des TWAI-Treibers. Rein interne Browser-, Simulator- oder Generatorframes ohne Live-TX lösen keinen Impuls aus.

## ESP32-S3-N16R8

Die PlatformIO-Umgebung `esp32s3_n16r8` unterstützt den Build für ein ESP32-S3-DevKitC-kompatibles N16R8-Board (16 MB Quad-SPI-Flash, 8 MB Octal-PSRAM). CAN-TX/RX bleiben GPIO17/GPIO16. Der Listen-only-Dummy-TX liegt hier auf **GPIO21**, der dauerhaft unbeschaltet bleiben muss; GPIO27 ist beim S3 für den Speicher reserviert. Die Aktivitätsanzeige auf GPIO2 benötigt eine externe LED mit Vorwiderstand. Die Onboard-RGB-LED wird nicht angesteuert.

Build und Upload sind in der [README](../README.md#esp32-s3-n16r8) beschrieben. Die folgenden Bitraten und CAN-Modi gelten für beide S3-USB-Varianten.

Für den nativen USB-Anschluss des S3 steht zusätzlich `esp32s3_n16r8_usb` bereit. Diese Umgebung aktiviert USB CDC/JTAG auf GPIO19/20. Die vorhandene S3-Umgebung verwendet weiterhin USB-UART. Die lokale [Web-Serial-Oberfläche](USB.md) bevorzugt eine bestätigte USB-Verbindung direkt im Browser; Monitor und USB-UART verwenden seit 0.13.35-TEST 921600 Baud.

## Unterstützte CAN-Bitraten

DEACS unterstützt klassischen CAN mit:

- 25 kbit/s
- 50 kbit/s
- 100 kbit/s
- 125 kbit/s
- 250 kbit/s
- 500 kbit/s
- 1 Mbit/s

Standardwert bei einer neuen Installation ist 500 kbit/s. Bitrate und CAN-Modus werden im nichtflüchtigen ESP32-Speicher abgelegt.

## CAN-Modi

### Nur Mithören

Im Modus `listen` wird das interne TWAI-TX-Signal nicht auf GPIO17 gelegt. Stattdessen wird es auf GPIO21 umgeleitet, während GPIO17 dauerhaft HIGH und damit rezessiv gehalten wird.

**GPIO21 darf mit nichts verbunden sein.** Nur dann ist die zusätzliche physische TX-Trennung wirksam.

GPIO17 wird bereits als erste Aktion beim Booten auf HIGH gesetzt, noch bevor Serial, WLAN, LittleFS oder TWAI initialisiert werden.

### Normal / TX

Der TWAI-Controller sendet im normalen Modus und erwartet die Bestätigung mindestens eines weiteren aktiven CAN-Teilnehmers. Fehlt das ACK, zeigt DEACS dies über Fehler- und Diagnosewerte an.

### TX ohne ACK

Der TWAI-No-Ack-Modus ist für isolierte Prüfaufbauten ohne zweiten bestätigenden Teilnehmer vorgesehen. Er ersetzt keine korrekte Terminierung und darf nicht unbedacht an einem Fahrzeugbus verwendet werden.

## Geeignete Transceiver

Die Logikseite des Transceivers muss zu 3,3-V-Signalen des ESP32 passen. Geeignet sind beispielsweise Transceiver mit separater 3,3-V-Logikversorgung oder reine 3,3-V-CAN-Transceiver.

Das dokumentierte isolierte WeAct-Studio-Modul besitzt eine separate `VIO`-Versorgung und wird in [CANFD_ISO_BOARD.md](CANFD_ISO_BOARD.md) beschrieben.

## TJA1050-RXD an ESP32

Der TJA1050 wird mit 5 V betrieben. Sein RXD-Ausgang darf deshalb nicht direkt an GPIO16 angeschlossen werden. Bei einem passiven Spannungsteiler muss der Widerstand vom GPIO nach Masse größer sein als der Serienwiderstand vom RXD.

Bewährte Werte:

| Verbindung | Widerstand |
|---|---:|
| TJA1050 RXD → GPIO16 | 6,8 kΩ |
| GPIO16 → GND | 12 kΩ |

Bei 5 V RXD-HIGH entstehen damit ungefähr 3,19 V am ESP32. Alternativ sind 10 kΩ vom RXD zum GPIO und 20 kΩ vom GPIO nach Masse geeignet; daraus ergeben sich ungefähr 3,33 V.

**Nicht verwenden:** 10 kΩ vom RXD zum GPIO und 4,7 kΩ nach Masse. Damit entstehen nur ungefähr 1,6 V. Der ESP32 erkennt HIGH dann nicht zuverlässig und der TWAI-Controller kann fortlaufend `BUS_ERROR`-Ereignisse melden.

## Terminierung

Ein klassischer CAN-Bus wird an beiden physischen Enden mit jeweils 120 Ω zwischen CAN-H und CAN-L abgeschlossen. Bei ausgeschalteter Versorgung sind an einem korrekt aufgebauten Bus typischerweise ungefähr 60 Ω zwischen CAN-H und CAN-L messbar.

Ein zusätzlicher Abschluss in der Busmitte oder ein fehlender Abschluss kann Kommunikation und Diagnose verfälschen.

## Inbetriebnahme

1. ESP32, Transceiver und Bus spannungsfrei verdrahten.
2. Versorgung und Logikpegel des verwendeten Transceivers prüfen.
3. CAN-H, CAN-L und gegebenenfalls die Bus-Bezugsmasse korrekt anschließen.
4. Terminierung prüfen.
5. ESP32 einschalten und mit dem WLAN `DEACS` verbinden.
6. Weboberfläche unter `http://192.168.4.1` öffnen.
7. Zuerst Bitrate und **Nur Mithören** verwenden.
8. Senden erst nach eindeutiger Prüfung von Bus, IDs und möglichen Auswirkungen aktivieren.

## Sicherheit

- Verdrahtung niemals unter Spannung ändern.
- Vor dem Fahrzeuganschluss Pinbelegung, Spannungen, Bitrate und Terminierung prüfen.
- Bei unbekannten Netzen zunächst ausschließlich im Listen-only-Modus arbeiten.
- Unbekannte Frames können Steuergeräte oder sicherheitsrelevante Fahrzeugfunktionen beeinflussen.
- Die galvanische Trennung eines Transceivers ersetzt keine sichere Arbeitsweise und keine korrekte Bus-Bezugsmasse, wenn der Aufbau diese erfordert.
