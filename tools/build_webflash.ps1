$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $projectRoot '.pio\build\esp32dev'
$configPath = Join-Path $projectRoot 'include\config.h'
$pioHome = Join-Path $env:USERPROFILE '.platformio'
$python = Join-Path $pioHome 'penv\Scripts\python.exe'
$esptool = Join-Path $pioHome 'packages\tool-esptoolpy\esptool.py'
$bootApp = Join-Path $pioHome 'packages\framework-arduinoespressif32\tools\partitions\boot_app0.bin'

Push-Location $projectRoot
try {
  & pio run
  if ($LASTEXITCODE -ne 0) { throw 'Firmware-Build fehlgeschlagen.' }

  & pio run -t buildfs
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

  & $python $esptool --chip esp32 merge_bin `
    -o $output `
    --flash_mode dio `
    --flash_freq 40m `
    --flash_size 4MB `
    0x1000 (Join-Path $buildDir 'bootloader.bin') `
    0x8000 (Join-Path $buildDir 'partitions.bin') `
    0xE000 $bootApp `
    0x10000 (Join-Path $buildDir 'firmware.bin') `
    0x290000 (Join-Path $buildDir 'littlefs.bin')
  if ($LASTEXITCODE -ne 0) { throw 'Gesamt-BIN konnte nicht erzeugt werden.' }

  $outputBytes = [System.IO.File]::ReadAllBytes($output)
  $sensitivePaths = @(
    $env:USERPROFILE,
    ($env:USERPROFILE -replace '\\', '/')
  ) | Where-Object { $_ }

  foreach ($path in $sensitivePaths) {
    $needle = [System.Text.Encoding]::UTF8.GetBytes($path)
    if ($needle.Length -eq 0 -or $needle.Length -gt $outputBytes.Length) { continue }

    for ($i = 0; $i -le $outputBytes.Length - $needle.Length; $i++) {
      $match = $true
      for ($j = 0; $j -lt $needle.Length; $j++) {
        if ($outputBytes[$i + $j] -ne $needle[$j]) { $match = $false; break }
      }
      if ($match) {
        $outputBytes[$i] = [byte][char]'.'
        for ($j = 1; $j -lt $needle.Length; $j++) { $outputBytes[$i + $j] = 0 }
      }
    }
  }
  [System.IO.File]::WriteAllBytes($output, $outputBytes)

  Write-Host "`nWeb-Flasher-Datei erstellt: $output" -ForegroundColor Green
  Write-Host 'Flash-Adresse in esptool-js: 0x0' -ForegroundColor Green
}
finally {
  Pop-Location
}
