$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$previousBuildDir = $env:PLATFORMIO_BUILD_DIR
$env:PLATFORMIO_BUILD_DIR = Join-Path $projectRoot '.pio\webflash'
$buildDir = Join-Path $env:PLATFORMIO_BUILD_DIR 'esp32s3_n16r8'
$configPath = Join-Path $projectRoot 'include\config.h'
$pioHome = Join-Path $env:USERPROFILE '.platformio'
$python = Join-Path $pioHome 'penv\Scripts\python.exe'
$esptool = Join-Path $pioHome 'packages\tool-esptoolpy\esptool.py'
$bootApp = Join-Path $pioHome 'packages\framework-arduinoespressif32\tools\partitions\boot_app0.bin'

Push-Location $projectRoot
try {
  & $python -m platformio run -e esp32s3_n16r8
  if ($LASTEXITCODE -ne 0) { throw 'Firmware-Build fehlgeschlagen.' }

  & $python -m platformio run -e esp32s3_n16r8 -t buildfs
  if ($LASTEXITCODE -ne 0) { throw 'LittleFS-Build fehlgeschlagen.' }

  $required = @(
    $python,
    $esptool,
    $bootApp,
    (Join-Path $buildDir 'bootloader.bin'),
    (Join-Path $buildDir 'partitions.bin'),
    (Join-Path $buildDir 'firmware.bin'),
    (Join-Path $buildDir 'littlefs.bin')
  )
  foreach ($file in $required) {
    if (-not (Test-Path -LiteralPath $file)) { throw "Benötigte Datei fehlt: $file" }
  }

  $config = Get-Content -LiteralPath $configPath -Raw
  if ($config -notmatch 'FW_VERSION\[\]\s*=\s*"([^"]+)"') {
    throw 'FW_VERSION wurde nicht gefunden.'
  }
  $version = $Matches[1].Replace('.', '_').Replace('-', '_')
  $releaseDir = Join-Path $projectRoot 'release'
  New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
  $output = Join-Path $releaseDir "DEACS_V${version}_webflash.bin"

  & $python $esptool --chip esp32s3 merge_bin `
    -o $output `
    --flash_mode qio `
    --flash_freq 80m `
    --flash_size 16MB `
    0x0 (Join-Path $buildDir 'bootloader.bin') `
    0x8000 (Join-Path $buildDir 'partitions.bin') `
    0xE000 $bootApp `
    0x10000 (Join-Path $buildDir 'firmware.bin') `
    0xC90000 (Join-Path $buildDir 'littlefs.bin')
  if ($LASTEXITCODE -ne 0) { throw 'Gesamt-BIN konnte nicht erzeugt werden.' }

  # Preserve the test repository's release check for local user-profile paths.
  $imageText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($output))
  foreach ($profileVariant in @($env:USERPROFILE, ($env:USERPROFILE -replace '\\', '/'))) {
    if ($profileVariant -and $imageText.Contains($profileVariant)) {
      throw 'Das Release-Image enthaelt einen lokalen Benutzerpfad. Prefix-Mapping pruefen.'
    }
  }

  Write-Host "`nWeb-Flasher-Datei erstellt: $output" -ForegroundColor Green
  Write-Host 'Flash-Adresse in esptool-js: 0x0' -ForegroundColor Green
}
finally {
  $env:PLATFORMIO_BUILD_DIR = $previousBuildDir
  Pop-Location
}
