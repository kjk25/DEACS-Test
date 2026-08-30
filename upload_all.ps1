$ErrorActionPreference = "Stop"
pio run
pio run -t upload
pio run -t uploadfs
Write-Host "DEACS: Firmware und LittleFS erfolgreich hochgeladen." -ForegroundColor Green
