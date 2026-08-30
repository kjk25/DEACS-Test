@echo off
pio run -t upload
if errorlevel 1 exit /b 1
pio run -t uploadfs
