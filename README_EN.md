# DEACS V0.13.63-TEST

[Deutsch](README.md) | **English**

This test repository now follows the current DEACS feature set. It targets the **ESP32-S3 N16R8**, with **16 MB flash and 8 MB PSRAM**. The new firmware images are **not compatible with the ESP32-WROOM** used by the previous test release.

DEACS is a browser-based classic CAN monitor, decoder, logger, transmitter and simulator. The interface supports **German, English and Japanese**, including language changes during a running BMW demo.

## Hardware and configuration

| Setting | Value |
|---|---|
| PlatformIO default environment | `esp32s3_n16r8` |
| Upload / serial monitor | `COM9` |
| Serial baud rate | 921600 |
| CAN TX / RX | GPIO17 / GPIO16 |
| Listen-only dummy TX | GPIO21, leave unconnected |
| Activity LED | GPIO2, external LED with resistor |

An external 3.3 V compatible CAN transceiver is required. GPIO27 is reserved for flash/PSRAM on this S3 target. The optional native USB environment is `esp32s3_n16r8_usb`; the default uses the USB-UART connector.

## Download and upload

- [Standalone USB interface](release/DEACS_V0_13_63_TEST_USB.html)
- [Complete webflash image](release/DEACS_V0_13_63_TEST_webflash.bin)
- [Test release notes](release/DEACS_V0_13_63_TEST_NOTES.md)

Flash the complete webflash image at **address `0x0`** using [Espressif ESP Tool](https://espressif.github.io/esptool-js/) in Chrome or Edge. It includes the bootloader, partition table, firmware and LittleFS.

Alternatively, open the project in VS Code with PlatformIO and run **DEACS: Upload komplett**. Upload firmware and LittleFS together:

```text
pio run -e esp32s3_n16r8
pio run -e esp32s3_n16r8 -t upload --upload-port COM9
pio run -e esp32s3_n16r8 -t uploadfs --upload-port COM9
```

To rebuild the downloadable files:

```text
python tools/build_usb_page.py
powershell -ExecutionPolicy Bypass -File tools/build_webflash.ps1
```

## Connect

Open the standalone USB HTML locally in Chrome or Edge, select **Connect USB** and choose the DEACS port. Close upload tools and serial monitors first. An established USB connection takes priority over Wi-Fi.

Wi-Fi access point: **DEACS**, password **deacs123**, interface **http://192.168.4.1**. Direct browser serial access generally requires the local HTML rather than the unencrypted AP page.

## Features

- Live monitor and per-ID overview, filtering, changed-byte highlighting and frequency analysis
- DBC decoding, labels, manual and cyclic transmission
- Simulator, dynamic payload generators and log replay with optional live CAN output
- Browser logging, `.dlog` / CSV import and export, event analysis and markers
- RAM/PSRAM budgets, queue diagnostics, CAN status and missing-ACK reporting
- Settings import/export and persistent language selection

## BMW E90 cluster demo

Select **BMW E90** and **Start cluster demo**. The speed and RPM needles cycle automatically; warning groups, indicators, high beam, fog lights and parking brake change during the demo. Fuel and coolant gauges are inside the cockpit below the demo state.

For a physical cluster, enable **Send BMW E90 live to CAN** in Settings. Starting the demo configures and verifies **100 kbit/s, TX without ACK**. Without this option the frames appear only in the monitor.

The ignition heartbeat continues while the animation is held. Fuel drains over roughly 70 seconds of simulated engine running. **Reset** stops the demo, refills the tank and transmits both full sensor values. **Stop** sends the lamp and ignition shutdown commands.

Keep the browser open and in the foreground: this is a browser-driven demo, not an autonomous firmware mode. Standby or connection loss can interrupt its timing. Warning-symbol availability and gauge calibration depend on the cluster. Airbag/seatbelt test IDs are not invented; the community reference does not provide a confirmed dedicated mapping.

Protocol references: [veikkos/e90-can-cluster](https://github.com/veikkos/e90-can-cluster) and [BMW community DBC](https://github.com/Maseg535/E90-and-e8x-DBC-mega-merge-project).

## Documentation

- [Hardware](docs/HARDWARE.md)
- [USB transport](docs/USB.md)
- [CAN transceiver wiring](docs/CANFD_ISO_BOARD.md)
- [API](docs/API.md)
- [Memory budgets](docs/MEMORY.md)

The documentation and screenshots inherited from older releases may show previous layouts. Use the current hardware table and build environment above. Third-party content retains its original license; acknowledgements are listed in the [German README](README.md#danksagung).
