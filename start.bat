@echo off
rem SkyShards Fusable launcher.
rem   - npm missing  -> points you at the Node.js download page
rem   - npm present  -> runs "npm start" in a hidden window and opens the page
rem Stop the server with the "Shut down server" button on the page.
setlocal
cd /d "%~dp0"
if not defined PORT set "PORT=3000"

rem The hidden copy of this script re-runs with --run and keeps npm alive.
if /i "%~1"=="--run" goto run

rem Already running? Just open the page instead of starting a second copy.
netstat -ano | findstr "LISTENING" | findstr /c:"127.0.0.1:%PORT% " >nul
if not errorlevel 1 (
  start "" "http://127.0.0.1:%PORT%"
  exit /b 0
)

where npm >nul 2>nul
if errorlevel 1 goto nonpm

rem Relaunch this script with no console window, then open the page.
powershell -NoProfile -WindowStyle Hidden -Command "Start-Process -FilePath '%~f0' -ArgumentList '--run' -WindowStyle Hidden"
rem Wait until the server actually answers (up to 15s), then open the page.
powershell -NoProfile -Command "$end = (Get-Date).AddSeconds(15); while ((Get-Date) -lt $end) { if (Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue) { exit 0 }; Start-Sleep -Milliseconds 250 }; exit 1"
start "" "http://127.0.0.1:%PORT%"
exit /b 0

:nonpm
echo(
echo   npm was not found on this computer.
echo   SkyShards Fusable needs Node.js 18 or newer, which includes npm.
echo(
echo   Opening the Node.js download page...
echo(
start "" "https://nodejs.org/en/download"
echo   Install Node.js, then run this file again.
pause
exit /b 1

:run
cd /d "%~dp0"
npm start
exit /b
