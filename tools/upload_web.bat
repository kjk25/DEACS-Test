@echo off
cd /d "%~dp0..\firmware"
python -m platformio run -t uploadfs
pause
