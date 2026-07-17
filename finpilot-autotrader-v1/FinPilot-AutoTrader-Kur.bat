@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 20 veya uzeri gerekli. & pause & exit /b 1)
if not exist .env copy .env.example .env >nul
call npm install || (pause & exit /b 1)
call npm run check || (pause & exit /b 1)
echo.
echo Kurulum tamamlandi. .env icindeki guvenlik degerlerini degistirin.
pause
