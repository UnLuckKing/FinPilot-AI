@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 veya uzeri bulunamadi. https://nodejs.org adresinden LTS surumunu kurun.
  pause
  exit /b 1
)
if not exist .env (
  copy .env.example .env >nul
  echo .env olusturuldu. FINPILOT_WEBHOOK_SECRET alanini en az 32 rastgele karakterle doldurun.
  notepad .env
  pause
)
start "FinPilot" http://127.0.0.1:4310
node server/index.mjs
if errorlevel 1 pause
