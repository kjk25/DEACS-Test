DEACS DBC-Ordner
================

DBC-Dateien hier ablegen und danach das LittleFS neu hochladen:

  pio run -t uploadfs

Speicherbudget:
- Uploads bis zum gemeinsamen 80-%-Budget der LittleFS-Partition
- DBC wird nach Browser-Neustart nicht automatisch aktiviert
- Aktivierung erfolgt bewusst unter Settings

Die Browser-RAM-Pruefung kann grosse DBC-Dateien frueher ablehnen.
Details: docs/MEMORY.md im Projektverzeichnis.
