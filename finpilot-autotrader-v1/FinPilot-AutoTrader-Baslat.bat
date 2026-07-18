@echo off
setlocal
cd /d "%~dp0"
if not exist .env (echo Once FinPilot-AutoTrader-Kur.bat dosyasini calistirin. & pause & exit /b 1)
start "FinPilot AutoTrader" cmd /k "npm start"
timeout /t 4 /nobreak >nul
start "" "http://127.0.0.1:4310"
