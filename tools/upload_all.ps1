$ErrorActionPreference = "Stop"
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
pio run -e esp32s3_n16r8
if ($LASTEXITCODE -ne 0) { throw "Firmware-Build fehlgeschlagen." }
pio run -e esp32s3_n16r8 -t upload --upload-port COM9
if ($LASTEXITCODE -ne 0) { throw "Firmware-Upload fehlgeschlagen." }
pio run -e esp32s3_n16r8 -t uploadfs --upload-port COM9
if ($LASTEXITCODE -ne 0) { throw "LittleFS-Upload fehlgeschlagen." }
Write-Host "DEACS: Firmware und LittleFS erfolgreich hochgeladen." -ForegroundColor Green
