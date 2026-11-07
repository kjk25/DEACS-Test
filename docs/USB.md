# USB direkt im Browser

Stand: DEACS 0.13.44.

Die Sprachumschaltung **DE / EN** funktioniert auch in der lokalen USB-Datei ohne Netzwerk. Der Build erzeugt `data/i18n-en.js` aus `tools/locales/en.json` und bettet den Katalog zusammen mit `data/i18n.js` in die USB-Datei ein. Übersetzungen werden in `tools/locales/en.json` gepflegt; die generierte Datei nicht separat bearbeiten.

## Verwenden

1. Firmware und LittleFS für das verwendete Board aktualisieren.
2. `release/DEACS_V0_13_44_USB.html` lokal in Chrome oder Edge öffnen. Alternativ in der WLAN-Oberfläche **USB-Oberfläche speichern** wählen und die heruntergeladene HTML-Datei öffnen.
3. ESP32 mit einem USB-Datenkabel anschließen und Uploadprogramme beziehungsweise seriellen Monitor schließen.
4. **USB verbinden** anklicken und im Browser den DEACS-Port auswählen.
5. Nach dem bestätigten Handshake steht oben **USB verbunden**. Die bisherige Oberfläche mit Monitor, Simulator, Einstellungen und DBC-Verwaltung bleibt verfügbar.

Es werden weder Python noch eine installierte Brücke, Browser-Erweiterung oder ein lokaler Server für den Betrieb benötigt. Die einzelne HTML-Datei enthält CSS und JavaScript vollständig.

Web Serial erfordert einen sicheren Seitenkontext und einen unterstützten Browser. Die lokale Datei wird in Chrome/Edge unterstützt und ist im automatisierten Chrome-Test geprüft. Die unverschlüsselte ESP32-Adresse `http://192.168.4.1` stellt normalerweise keinen geeigneten Web-Serial-Kontext bereit. Dort bleibt **USB verbinden** deaktiviert und **USB-Oberfläche speichern** erreichbar. Alternativ kann dieselbe Oberfläche von einem geeigneten HTTPS-Ursprung bereitgestellt werden.

Die erste Portfreigabe kann nur durch einen Klick erfolgen. DEACS öffnet keine ungefragt ausgewählten Ports. Bereits freigegebene Ports werden über `navigator.serial.getPorts()` wiedergefunden; automatisch geöffnet wird nur ein eindeutig zum zuletzt gewählten Gerätetyp passender Port. Bei mehreren gleichartigen freigegebenen Ports muss erneut gewählt werden. Die Browserfreigabe und deren Dauer unterliegen dem Browser.

Browserdaten der WLAN-Adresse und einer lokalen Datei gehören gegebenenfalls zu getrennten Speicherbereichen. Simulator/Labels bei Bedarf exportieren und in der USB-Oberfläche importieren.

USB-HTTP-Anfragen werden nacheinander abgearbeitet; die laufende CAN-WebSocket-Verbindung bleibt daneben offen. Während des Simulator-Uploads ist ein weiterer Start gesperrt. Bei einem Fehler nennt die Meldung den Schritt beziehungsweise Frame und die Ursache. Nur eine HTTP-507-Antwort wird als erreichtes 80-%-Speicherbudget gemeldet. Ein fehlgeschlagener Befehl wird nicht automatisch über WLAN wiederholt.

## Board und Anschluss

| Umgebung | Anschluss | Einstellung |
|---|---|---|
| `esp32s3_n16r8` | USB-UART des S3-Boards | 921600 Baud |
| `esp32s3_n16r8_usb` | nativer USB-Serial/JTAG-Anschluss des S3 | USB CDC/JTAG |

Für den nativen S3 wird `ARDUINO_USB_CDC_ON_BOOT=1` aktiviert; GPIO19/20 werden für native USB-Daten verwendet. CAN-TX/RX bleiben GPIO17/16, GPIO21 bleibt unbeschaltet als Listen-only-Dummy-TX. Ein reines Ladekabel transportiert keine Daten.

Beispiel:

```text
pio run -e esp32s3_n16r8_usb -t upload
pio run -e esp32s3_n16r8_usb -t uploadfs
```

Danach die HTML-Datei öffnen und den Port im Browser wählen.

## Verbindung und Rückfall

- USB hat nach erfolgreichem Handshake Vorrang für neue HTTP-Anfragen und den Live-WebSocket.
- Beim Kabelverlust werden laufende USB-Anfragen abgebrochen. Neue Verbindungsversuche verwenden WLAN unter `192.168.4.1`, wenn der Computer den Access Point erreicht und der Browser den lokalen Netzwerkzugriff erlaubt.
- Für Anfragen einer lokalen Datei erlaubt die Firmware CORS-Antworten für den Browser-Origin `null`; beliebige fremde Web-Ursprünge werden dadurch nicht freigegeben. Browserseitige Netzwerkzugriffsregeln können den WLAN-Rückfall weiterhin begrenzen. USB benötigt diesen Netzwerkzugriff nicht.
- Bei erneutem Anstecken wird ein bereits freigegebener, eindeutig zuordenbarer Port bevorzugt wieder verbunden. Ein belegter Port wird später erneut versucht.
- **USB trennen** beendet die Sitzung und unterbindet automatische USB-Übernahme bis zur nächsten bewussten Verbindung beziehungsweise zum Neuladen der Seite.
- Bereits begonnene Befehle werden beim Wechsel nicht erneut gesendet. Ein unterbrochener CAN-Sendebefehl kann auf dem Gerät bereits angekommen sein; DEACS meldet den Abbruch.
- Ein Verbindungswechsel kann Simulatorläufe in der Oberfläche stoppen; bei Bedarf bewusst neu starten.

## Technische Grenzen

Der Browser transportiert HTTP und WebSocket über CRC16-geschützte serielle Pakete zu den bestehenden Firmware-Listenern. Er verarbeitet Multipart, Content-Length, Chunked-Encoding, binäre Antworten, maskierte WebSocket-Sendungen, Fragmentierung und Ping/Pong. Die Firmware verwendet intern Loopback-TCP; dazu ist kein WLAN-Datenverkehr zum Computer erforderlich. Der Access Point bleibt als Rückfall aktiv.

Drei begrenzte Kanäle, 512-Byte-Pakete, Bestätigungen und begrenzte Warteschlangen verhindern unbegrenztes Puffern. Bei Überlast wird eine Verbindung abgebrochen statt Bytes still zu verlieren. Bei hoher CAN-Last kann USB-UART langsamer als WLAN sein. Eine verlustfreie Übertragung bei beliebiger Buslast wird nicht garantiert.

Ab 0.13.41 nutzt der USB-Worker nicht blockierende TCP-Lese-/Schreibaufrufe. Pro Kanal wird höchstens ein 512-Byte-Schreibpaket zurückgehalten und erst nach vollständiger TCP-Übernahme bestätigt. Bei einem TCP-Schreibstau nach drei Sekunden wird der betroffene Kanal geschlossen; andere Kanäle und USB-Lebenszeichen werden weiter bedient.

Während der seriellen Sitzung wird normale Firmware-Debugausgabe unterdrückt. Der Status enthält `usbTunnelStarted` und `usbHostActive`. Fehlt interner Speicher für den USB-Worker, bleibt WLAN verfügbar.

## Erzeugen und prüfen

PlatformIO erzeugt die lokale Seite automatisch vor dem Build. Ohne Firmware-Build kann sie mit `python tools/build_usb_page.py` oder dem VS-Code-Task **DEACS: USB-HTML erstellen** erzeugt werden. Python ist hierfür ein Entwicklungswerkzeug und wird zum Verwenden der fertigen HTML-Datei nicht benötigt.

Die Dateien entstehen unter `data/usb.html` für den ESP32-Download und `release/DEACS_V0_13_44_USB.html` zur Weitergabe. Den generierten HTML-Code nicht separat bearbeiten; Quellen sind `data/index.html`, CSS und die JavaScript-Dateien.

- `python tools/test_web_serial.py`: echte Browseroberfläche mit simuliertem Web-Serial-Gerät.
- `python tools/test_web_serial.py --file`: dieselben Prüfungen beim direkten Öffnen der eigenständigen Datei über `file://`.
- `python tools/test_memory_browser.py`: Regression für Listen, Speichergrenzen und Endlos-Wiedergabe.
- Firmware- und LittleFS-Builds für alle drei Umgebungen.

Die Tests prüfen unter anderem CRC/Fragmentierung, HTTP/Chunked-Encoding, große binäre Antworten, DBC-Multipart, Live-TX-Nachrichten, Ping/Pong, USB-Vorrang, Kabelverlust, Stream-Freigabe und automatische Wiederverbindung. Die Portauswahl ist im Test simuliert. Ein Test der tatsächlichen Browser-Portfreigabe, physischer Kabelwechsel und hoher CAN-Last auf echter Hardware steht aus.

Für eine Statusabfrage an einem echten Gerät kann nach dem Schließen der Browser-USB-Verbindung das Entwicklungswerkzeug `python tools/check_usb_device.py --port COM15` verwendet werden (Port anpassen; benötigt pyserial). Es verändert keine Simulator- oder CAN-Einstellungen. Der Fehler von 0.13.39 wurde damit auf einem S3 über CH343 reproduziert: HELLO/PING und kleine HTTP-Antworten funktionierten, `/api/status` blieb ohne HTTP-Antwort und ohne weitere USB-Lebenszeichen. Die Korrektur benötigt eine gesonderte Prüfung auf dem Gerät.

Mit 0.13.40 wurde die tatsächliche Ursache erfasst: `Stack canary watchpoint triggered (loopTask)` beim Statusabruf, gefolgt von einem Neustart. 0.13.41 verschiebt den 4096-Byte-Statuspuffer in statischen Speicher. Die kompilierte S3-Funktion `statusJsonString` benötigt damit 32 statt 4144 Byte Stack. Der nicht blockierende Tunnel allein hatte diesen Absturz nicht behoben.

`python tools/test_usb_hardware.py --port COM15` ist ein gesonderter, ausdrücklich zu autorisierender Gerätetest: Er ersetzt die flüchtige Simulatorliste, prüft Status, WebSocket-Daten sowie Einmalig/Endlos mit 14 Frames und deaktiviertem CAN-TX und leert die Testliste anschließend. Die Browser-Portfreigabe und die reale Browseroberfläche sind damit noch nicht geprüft.

Referenzen: [Web Serial in Chrome](https://developer.chrome.com/docs/capabilities/serial), [MDN: Serial](https://developer.mozilla.org/en-US/docs/Web/API/Serial).
