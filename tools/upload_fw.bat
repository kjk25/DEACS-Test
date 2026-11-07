@echo off
cd /d "%~dp0.."
python -m platformio run -e esp32s3_n16r8 -t upload --upload-port COM9
pause
