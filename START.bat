@echo off
setlocal
chcp 65001 >nul 2>nul
cd /d "%~dp0"

echo.
echo  ==================================================
echo    Just a Game  -  starten
echo  ==================================================
echo.

where pnpm >nul 2>nul
if errorlevel 1 goto NIET_GEINSTALLEERD

if not exist "node_modules" goto NIET_GEINSTALLEERD

docker info >nul 2>nul
if errorlevel 1 goto DOCKER_UIT

echo  Database starten...
call pnpm db:up
if errorlevel 1 goto DB_MISLUKT

echo  Netwerkadres controleren...
call node scripts\setup.mjs >nul 2>nul

echo  Server starten in een apart venster...
start "Just a Game - SERVER" cmd /k pnpm dev:server

echo  Wachten tot de server klaar is...
timeout /t 10 /nobreak >nul

echo  App starten in een apart venster...
start "Just a Game - APP" cmd /k pnpm dev:mobile

echo.
echo  ==================================================
echo    Er zijn twee vensters geopend.
echo.
echo    Scan de QR-code in het APP-venster met Expo Go
echo    op je telefoon. Je telefoon moet op hetzelfde
echo    wifi-netwerk zitten als deze computer.
echo.
echo    Stoppen? Sluit die twee vensters en draai STOP.bat
echo  ==================================================
echo.
pause
exit /b 0

:NIET_GEINSTALLEERD
echo   [FOUT] Het spel is nog niet geinstalleerd.
echo.
echo   Dubbelklik eerst op INSTALLEER.bat
echo.
pause
exit /b 1

:DOCKER_UIT
echo   [FOUT] Docker Desktop draait niet.
echo.
echo   Start Docker Desktop, wacht tot het icoon rechtsonder
echo   stil staat, en probeer dit bestand opnieuw.
echo.
pause
exit /b 1

:DB_MISLUKT
echo   [FOUT] De database kon niet starten.
echo.
echo   Controleer of Docker Desktop draait.
echo.
pause
exit /b 1
