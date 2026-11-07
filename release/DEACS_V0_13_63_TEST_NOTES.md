# DEACS 0.13.63-TEST

Dieses Update hebt das Test-Repository von 0.13.32-TEST auf den aktuellen DEACS-Funktionsstand an. Die Umstellung auf ESP32-S3 N16R8 und COM9 wurde ausdrücklich gewählt.

## Zielhardware

- ESP32-S3 N16R8: 16 MB Flash, 8 MB PSRAM
- Standardumgebung `esp32s3_n16r8`, Upload/Monitor COM9, 921600 Baud
- CAN TX GPIO17, RX GPIO16, unbeschalteter Listen-only-Dummy GPIO21
- GPIO27 ist beim S3 für Speicher reserviert

Das neue Gesamt-BIN ist nicht für den alten ESP32-WROOM vorgesehen. Die ursprüngliche 0.13.32-TEST-Datei bleibt als historisches Artefakt erhalten.

## Aktualisiert

- Direkte Browser-USB-Verbindung und WLAN-Rückfall
- Monitor, Decoder, Simulator, Generator, Log-Wiedergabe, Settings und Speicherbudgets aus dem aktuellen Hauptprojekt
- BMW-E90-Tacho-Demo mit zyklischer Zündung, Grundstatus, Zeigerfahrt, 18 Lampentasten und langsamen Zusatztests
- Tank/Kühlmittel im Cockpit unter DEMO; Tankverbrauch über etwa 70 Sekunden, Pause und Auffüllen bei Reset
- Deutsch, Englisch und Japanisch, einschließlich dynamischer Lampentasten
- COM9 in PlatformIO, VS-Code-Tasks und Upload-Skripten
- Deutsche und englische README sowie S3-Verkabelungsdokumentation

Bei aktivierter BMW-Live-Ausgabe stellt die Demo CAN auf 100 kbit/s und TX ohne ACK. Ohne Live-Ausgabe erscheinen die Frames nur im Monitor. Die Demo läuft im Browser; Fenster im Vordergrund geöffnet lassen. Die tatsächliche Symbolverfügbarkeit hängt vom Kombiinstrument ab.

## Dateien

- `DEACS_V0_13_63_TEST_USB.html`: lokale USB-Oberfläche für Chrome/Edge
- `DEACS_V0_13_63_TEST_webflash.bin`: vollständiges S3-Image, Flash-Adresse `0x0`

Firmware und LittleFS werden im Test-Repository neu gebaut. Browserprüfungen umfassen Demo, Tank, Stop/Reset und DE/EN/JA-Sprachwechsel. Es wurde kein Gerät geflasht.

## English

This test release targets ESP32-S3 N16R8 / COM9 and follows the current DEACS feature set. It adds direct browser USB, the BMW cluster demo and German/English/Japanese UI support. The new image must not be flashed to the former ESP32-WROOM target. See README_EN.md for setup and build instructions.
