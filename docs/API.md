# DEACS HTTP- und WebSocket-API

Stand: **DEACS V0.13.44**

DEACS stellt die Weboberfläche und eine HTTP-API auf Port `80` bereit. Live-Daten und Statusmeldungen werden über WebSocket auf Port `81` übertragen.

Ab 0.13.41-TEST erreicht die [USB-Oberfläche](USB.md) dieselben Endpunkte direkt über Web Serial im Browser. `deviceFetch` übersetzt HTTP-Anfragen, `SerialWebSocket` übersetzt WebSocket-Nachrichten über den seriellen Tunnel. Direkt am ESP32 bleiben Ports und Endpunkte unverändert. Eine PC-Brücke und die ehemaligen `/bridge/*`-Pfade werden nicht mehr verwendet. `GET /usb.html` liefert die vollständige lokale USB-Oberfläche als Download.

## Allgemeines

- Standardadresse im DEACS-WLAN: `http://192.168.4.1`
- POST-Parameter werden, sofern nicht anders angegeben, als `application/x-www-form-urlencoded` gesendet.
- Boolesche Parameter verwenden `0`/`1`; an einigen Endpunkten wird zusätzlich `true` akzeptiert.
- CAN-IDs werden ohne Präfix hexadezimal übertragen, beispielsweise `7E8` oder `18DAF110`.
- Datenbytes können kompakt (`00112233`) oder mit Leerzeichen beziehungsweise Kommata getrennt übergeben werden.
- Klassische CAN-Frames sind auf acht Datenbytes begrenzt.
- Wachsende Datenlisten und Schreibvorgänge verwenden ein 80-%-Speicherbudget; siehe [Speicherverwaltung](MEMORY.md). Technische CAN- und Transportgrenzen bleiben bestehen.

## Status

### `GET /api/status`

Liefert den vollständigen Betriebs- und Diagnosestatus als JSON. Die Antwort enthält unter anderem:

- Firmware, Access Point, IP-Adresse, verbundene WLAN-Stationen und Laufzeit
- freien Heap, größten freien Speicherblock und jeweilige Minimalwerte
- CAN-Zustand, Modus, Bitrate, Empfangs-/Senderaten und Buslast
- TWAI-Fehlerzähler, Alert-Zustände und ACK-Diagnose
- Ringpuffer-, Queue-, WebSocket- und Verluststatistiken
- Simulator- und ESP32-Loggerstatus
- Serverfilter mit Modus und CAN-IDs

Wichtige Felder sind beispielsweise:

Zusätzliche Speicherfelder: `memoryLimitPercent`, `heapTotal`, `psramTotal`, `psramFree`, `internalAvailable`, `psramAvailable`, `fsTotal`, `fsUsed`, `simMemoryLimited` und `logMemoryLimited`. `internalAvailable`/`psramAvailable` sind die noch für Nutzdaten verfügbaren Bytes oberhalb der jeweiligen 20-%-Reserve. `simCount` ist nicht mehr auf 8 Bit beschränkt.

```json
{
  "fw": "0.13.44",
  "ip": "192.168.4.1",
  "ssid": "DEACS",
  "canRunning": true,
  "listenOnly": true,
  "noAck": false,
  "ackMissing": false,
  "bitrate": 500000,
  "rx": 1234,
  "tx": 0,
  "busLoad": 12.4,
  "queue": 0,
  "drops": 0,
  "simulator": false,
  "logging": false,
  "filterEnabled": false,
  "filterMode": "exclude",
  "filterIds": ""
}
```

## CAN-Steuerung

### `POST /api/can`

Startet den TWAI-Treiber mit der gewählten Bitrate und dem gewählten Modus neu. Erfolgreiche Einstellungen werden im ESP32 gespeichert.

Parameter:

- `bitrate`: `25000`, `50000`, `100000`, `125000`, `250000`, `500000` oder `1000000`
- `mode`: `listen`, `normal` oder `noack`

Modi:

- `listen`: passives Mithören; der physische TX-Pin GPIO17 wird HIGH gehalten und das interne TWAI-TX-Signal auf den unbeschalteten GPIO21 gelegt.
- `normal`: normales Senden mit ACK-Prüfung.
- `noack`: TWAI-No-Ack-Modus für isolierte Prüfaufbauten ohne zweiten bestätigenden Teilnehmer.

Antwort: aktuelles Statusobjekt. Ungültige Parameter liefern HTTP `400`, ein fehlgeschlagener Neustart HTTP `500`.

### `POST /api/can/toggle`

Trennt den CAN-Treiber hardware-nah oder verbindet ihn mit der zuletzt gespeicherten Konfiguration erneut.

Parameter: keine.

Antwort: aktuelles Statusobjekt.

### `POST /api/send`

Sendet einen klassischen CAN-Daten- oder RTR-Frame.

Parameter:

- `id`: hexadezimale CAN-ID
- `data`: null bis acht Datenbytes als Hex
- `extended`: `0` für 11-Bit-ID, `1` für 29-Bit-ID
- `rtr`: `0` für Datenframe, `1` für RTR
- `dlc`: optional bei RTR, Wert `0` bis `8`

Grenzen:

- Standard-ID: maximal `7FF`
- Extended-ID: maximal `1FFFFFFF`
- Daten: maximal 16 Hexzeichen

Erfolg:

```json
{"ok":true}
```

Ungültige Daten oder ein fehlgeschlagener Sendevorgang liefern HTTP `400`.

## Serverfilter

### `POST /api/filter`

Konfiguriert den serverseitigen CAN-ID-Filter.

Parameter:

- `enabled`: `0`/`1` oder `false`/`true`
- `mode`: `include` oder `exclude`
- `ids`: CAN-IDs bis zum verfügbaren Speicherbudget, getrennt durch Leerzeichen, Kommata, Semikolons oder Zeilenumbrüche

IDs ohne Zusatz werden hexadezimal gelesen. Alternativ sind `0x123`, `123h`, `dec:291` oder `291d` möglich.

Im Modus `include` wird bei bis zu 32 ausschließlich 11-Bit-IDs zusätzlich ein gemeinsamer TWAI-Hardwarefilter verwendet. Größere Listen sowie `exclude` werden softwareseitig auf die Ausgabe an WebSocket-Clients angewendet. Der elektrische Empfang des TWAI-Controllers bleibt dabei aktiv. Bei Speichermangel wird HTTP `507` zurückgegeben und die vorherige Filterliste beibehalten.

`GET /api/filter/ids` liefert die vollständige Filterliste als gestreamten Text. Im Status steht bei mehr als 32 IDs nur eine Vorschau in `filterIds`, zusammen mit `filterIdsTruncated=true`, `filterCount` und `filterRevision`.

Antwort: aktuelles Statusobjekt.

## Simulator

Die Weboberfläche verwendet bei bestehender ESP32-Verbindung den ESP32-Simulator. Ohne Verbindung läuft der Simulator lokal im Browser; dafür gibt es keine HTTP-Endpunkte.

### `POST /api/sim/clear`

Stoppt den ESP32-Simulator und entfernt alle dort gespeicherten Einträge.

Parameter: keine.

Antwort: aktuelles Statusobjekt.

### `POST /api/sim/add`

Fügt dem gestoppten ESP32-Simulator einen Frame hinzu. Die Liste wächst bis zum verfügbaren 80-%-Budget des Heaps beziehungsweise PSRAMs. Einträge werden bevorzugt im PSRAM angelegt.

Parameter:

- `id`: hexadezimale CAN-ID
- `data`: null bis acht Datenbytes
- `extended`: `0` oder `1`
- `interval`: `10` bis `60000` ms
- `enabled`: `0` oder `1`
- `dynamic`: `0` oder `1`; erhöht bei jeder Erzeugung ein Datenbyte
- `dynamicIndex`: Byteposition für die dynamische Erhöhung

Antwort: `{"ok":true}`, HTTP `400` bei ungültigen Daten oder laufendem Simulator, HTTP `507` bei ausgeschöpftem Speicherbudget. Bestehende Einträge bleiben erhalten.

### `POST /api/sim/start`

Startet den ESP32-Simulator.

Parameter:

- `liveTx`: `0`/`1` oder `false`/`true`; bei `1` werden erzeugte Frames zusätzlich auf den echten CAN-Bus gesendet, sofern der CAN-Modus dies erlaubt
- `loop`: `0`/`false` für einen einmaligen Lauf, `1`/`true` für Endlosbetrieb. Ohne Parameter bleibt der bisherige Endlosbetrieb aktiv. Andere Werte liefern HTTP `400`.

Im einmaligen Lauf wird jeder aktivierte Eintrag einmal nach seinem Intervall erzeugt; nach dem letzten Eintrag endet der Simulator automatisch. Die Liste bleibt für einen erneuten Start erhalten. Die Log-Wiedergabe im Browser besitzt eine separate Wiederholungsoption.

Zusätzliche Statusfelder: `simLoop` (Wiederholung aktiv), `simRemaining` (im Einmallauf noch ausstehende Einträge; im Endlosbetrieb aktive Einträge) und `simRunId` (Kennung des zuletzt gestarteten Laufs). Die Oberfläche berücksichtigt nur Abschlussmeldungen des eigenen aktuellen Laufs.

Antwort: aktuelles Statusobjekt.

### `POST /api/sim/stop`

Stoppt den ESP32-Simulator.

Parameter: keine.

Antwort: aktuelles Statusobjekt.

### `POST /api/sim/inject`

Speist einmalig einen simulierten Frame in die interne DEACS-Verarbeitung ein. Der Endpunkt wird unter anderem für die Session-Wiedergabe verwendet.

Parameter:

- `id`: hexadezimale CAN-ID
- `data`: null bis acht Datenbytes
- `extended`: `0` oder `1`

Antwort: `{"ok":true}` oder HTTP `400` mit `{"ok":false}`.

### Simulator-Dateiimport und -export

Der JSON-Import und -Export ab V0.13.33-TEST wird vollständig im Browser ausgeführt und besitzt keinen HTTP-Endpunkt. Das Format lautet:

```json
{
  "format": "DEACS-Simulator",
  "version": 1,
  "createdAt": "2026-10-26T17:30:00.000Z",
  "firmware": "0.13.44",
  "frames": [
    {
      "id": "123",
      "data": "00 11 22 33 44 55 66 77",
      "dlc": 8,
      "ms": 100,
      "enabled": true,
      "dynamic": false,
      "dynamicIndex": 0,
      "name": "Frame 123",
      "source": "SIM"
    }
  ]
}
```

## DBC-Verwaltung

### `GET /api/dbc/list`

Listet die DBC-Dateien im LittleFS-Verzeichnis `/dbc` auf.

Antwort:

```json
{
  "files": [
    {"name": "beispiel.dbc", "size": 12345}
  ],
  "maxSize": 524288
}
```

### `GET /api/dbc/file?name=<datei.dbc>`

Liefert den Inhalt einer DBC-Datei als `text/plain`. Die Antwort enthält den Header `X-DEACS-DBC-Size`.

- Ungültiger Name: HTTP `400`
- Nicht gefunden: HTTP `404`

### `POST /api/dbc/upload`

Lädt eine DBC-Datei per `multipart/form-data` hoch. Erlaubt sind nichtleere Dateien mit der Endung `.dbc` bis zum gemeinsamen 80-%-Budget des LittleFS. Die Weboberfläche verwendet das Formularfeld `file`. Ein fehlgeschlagener Upload liefert HTTP `400`; ein fehlgeschlagenes Umbenennen HTTP `500`. Ein temporärer Upload ersetzt die Zieldatei erst nach vollständigem Schreiben.

`maxSize` aus `/api/dbc/list` bezeichnet die theoretische 80-%-Größe der Partition; bereits belegter Platz und Dateisystemreserve reduzieren den tatsächlich verfügbaren Uploadplatz.

Erfolg:

```json
{"ok":true,"size":12345}
```

### `POST /api/dbc/delete?name=<datei.dbc>`

Löscht eine DBC-Datei.

- Erfolg: `{"ok":true}`
- Ungültiger Name: HTTP `400`
- Nicht gefunden: HTTP `404`

## Diagnose

### `POST /api/diagnostics/reset`

Setzt Diagnose-Spitzenwerte wie minimale Heapwerte, maximale WebSocket-Größe und maximale RX-Abarbeitungszeit zurück. Kumulative CAN-Zähler werden nicht gelöscht.

Antwort: aktuelles Statusobjekt.

### `GET /api/diagnostics/selftest`

Liefert eine kompakte Zustandsprüfung:

```json
{
  "can": true,
  "websocket": true,
  "heap": true,
  "queue": true,
  "queuePercent": 0,
  "freeHeap": 150000,
  "drops": 0
}
```

### `GET /api/diagnostics/events`

Liefert die bis zur Speichergrenze aufbewahrten internen Diagnoseereignisse in zeitlicher Reihenfolge als gestreamtes JSON:

```json
{"events":[{"ms":1234,"text":"Browser verbunden"}]}
```

## ESP32-Logger

Diese Endpunkte betreffen den Logger im ESP32-LittleFS. Das Browser-Logging der Weboberfläche verwendet dagegen IndexedDB und exportiert lokal `.dlog`- oder `.csv`-Dateien.

### `POST /api/log/start`

Startet den ESP32-CSV-Logger.

Bei fehlendem Dateispeicher wird der Start abgewiesen beziehungsweise ein laufender Logger gestoppt. `logMemoryLimited` kennzeichnet die erreichte Budgetgrenze.

- `append=1`: an vorhandene Datei anhängen
- ohne `append=1`: vorhandene Datei neu anlegen

### `POST /api/log/stop`

Stoppt den ESP32-Logger.

### `POST /api/log/delete`

Stoppt den Logger und löscht `/canlog.csv`.

### `GET /api/log/download`

Liefert das ESP32-Log als `deacs_canlog.csv`. Wenn keine Datei vorhanden ist, wird HTTP `404` zurückgegeben.

## WebSocket

Verbindung:

```text
ws://192.168.4.1:81/
```

DEACS verwendet Protokoll-Pings zur Erkennung abgebrochener Browserverbindungen und sendet etwa einmal pro Sekunde ein Statusobjekt.

### Einzelner Frame

```json
{
  "type": "frame",
  "dir": "RX",
  "us": 123456,
  "id": "7E8",
  "dlc": 8,
  "data": "04410C0D48000000",
  "ext": false,
  "rtr": false,
  "sim": false
}
```

### Frame-Batch

Bei hoher Last werden bis zu 64 Frames gemeinsam übertragen:

```json
{
  "type": "frames",
  "items": [
    {"dir":"RX","us":123456,"id":"123","dlc":8,"data":"0011223344556677","ext":false,"rtr":false,"sim":false}
  ]
}
```

### Statusmeldung

```json
{"type":"status","value":{"fw":"0.13.44","canRunning":true}}
```

`value` besitzt dasselbe Schema wie `GET /api/status`.

### Live-TX vom Browser

Für Live-TX von Browser-Simulator, Generator oder Log-Wiedergabe akzeptiert der Server Textnachrichten im Format:

```text
TX:<ID_HEX>:<EXT_0_ODER_1>:<RTR_0_ODER_1>:<DATEN_HEX>
```

Beispiel:

```text
TX:123:0:0:0011223344556677
```

Die Nachricht darf höchstens acht Datenbytes enthalten. Live-TX wird nur ausgeführt, wenn CAN-Senden im aktuellen Modus möglich ist.
