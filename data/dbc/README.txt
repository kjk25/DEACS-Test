DEACS DBC-Ordner
================

DBC-Dateien hier ablegen und danach das LittleFS neu hochladen:

  pio run -t uploadfs

Sicherheitsgrenze V0.13.04-TEST:
- maximal 512 KB pro DBC-Datei
- DBC wird nach Browser-Neustart nicht automatisch aktiviert
- Aktivierung erfolgt bewusst unter Settings

Groessere DBC-Dateien bitte vorerst auf die benoetigten CAN-Nachrichten reduzieren
oder in mehrere fahrzeug-/funktionsbezogene Dateien aufteilen.
