# DEACS HTTP- und WebSocket-API V0.2.0

## HTTP

### `GET /api/status`

Liefert Firmwareversion, WLAN-, CAN-, Simulator-, Filter-, Queue- und Speicherstatus.

### `POST /api/can`

Parameter:

- `bitrate`: 125000, 250000, 500000 oder 1000000
- `mode`: `listen` oder `normal`

### `POST /api/send`

Parameter:

- `id`: hexadezimale CAN-ID
- `data`: 0 bis 8 Datenbytes als Hex
- `extended`: `0` oder `1`
- `rtr`: `0` oder `1`
- `dlc`: DLC für RTR-Frames

### `POST /api/simulator`

Parameter:

- `enabled`: `0` oder `1`
- `interval`: 10 bis 5000 ms
- `profile`: `obd`, `vehicle` oder `mixed`

### `POST /api/filter`

Parameter:

- `enabled`: `0` oder `1`
- `id`: Filter-ID als Hex
- `mask`: Filtermaske als Hex

Der Filter beeinflusst die Ausgabe an WebSocket-Clients, nicht den elektrischen TWAI-Empfang.

## WebSocket

Port `81`. Frames werden als JSON übertragen:

```json
{"type":"frame","dir":"RX","us":123456,"id":"7E8","dlc":8,"data":"04410C0D48000000","ext":false,"rtr":false,"sim":false}
```
