# Hardware

ESP32-WROOM-32D mit externem CAN-Transceiver.

| Signal | ESP32 |
|---|---:|
| CAN TX | GPIO17 |
| CAN RX | GPIO16 |
| RX LED | GPIO2 |

Der ESP32 besitzt einen internen TWAI-Controller, aber keinen CAN-Leitungstreiber. Zwischen ESP32 und CAN-H/CAN-L muss ein 3,3-V-kompatibler Transceiver sitzen.


## Sichere Listen-only-Trennung (V0.11.20)

Im Listen-only-Modus wird der TWAI-TX-Ausgang nicht mehr auf GPIO17 gelegt.
GPIO17 bleibt dauerhaft HIGH (recessiv), während der interne TWAI-Ausgang auf
GPIO27 umgeleitet wird. **GPIO27 muss dafür unbeschaltet bleiben.**

| Funktion | ESP32 | Hinweis |
|---|---:|---|
| Physischer CAN-TXD | GPIO17 | zum TXD des Transceivers |
| Listen-only Dummy-TX | GPIO27 | darf mit nichts verbunden sein |
| CAN-RX | GPIO16 | vom RXD des Transceivers |

Damit kann der TWAI-Controller im Listen-only-Betrieb den externen Transceiver
nicht mehr versehentlich dominant ansteuern. GPIO17 wird zusätzlich bereits als
erste Aktion beim Booten auf HIGH gesetzt.

## TJA1050-RXD an ESP32 (5 V auf 3,3 V)

Der TJA1050 wird mit 5 V betrieben. Sein RXD-Ausgang darf deshalb nicht direkt
an GPIO16 angeschlossen werden. Bei einem passiven Spannungsteiler muss der
Widerstand vom GPIO nach Masse größer sein als der Serienwiderstand vom RXD.

Bewährte Werte:

| Verbindung | Widerstand |
|---|---:|
| TJA1050 RXD → GPIO16 | 6,8 kΩ |
| GPIO16 → GND | 12 kΩ |

Bei 5 V RXD-HIGH entstehen damit ungefähr 3,19 V am ESP32. Alternativ sind
10 kΩ vom RXD zum GPIO und 20 kΩ vom GPIO nach Masse geeignet (ca. 3,33 V).

**Nicht verwenden:** 10 kΩ vom RXD zum GPIO und 4,7 kΩ nach Masse. Damit
entstehen nur ungefähr 1,6 V; der ESP32 erkennt HIGH dann nicht zuverlässig und
der TWAI-Controller meldet fortlaufend BUS_ERROR-Ereignisse.
