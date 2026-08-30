@echo off
pio run -t clean
if errorlevel 1 exit /b 1
pio run
if errorlevel 1 exit /b 1
pio run -t buildfs
