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

echo  Versies controleren...
node scripts\sdk-check.mjs
if errorlevel 3 goto NIET_GEINSTALLEERD
if errorlevel 2 goto HERSTELLEN

:NA_CONTROLE
echo.

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

:HERSTELLEN
echo.
echo   De opgehaalde pakketten horen niet bij deze versie van het
echo   project. Dat gebeurt na een update waarin de Expo-versie is
echo   gewijzigd: de oude pakketten blijven anders gewoon staan, en
echo   dan meldt Expo Go dat het project niet past.
echo.
echo   Ik ruim ze op en haal ze opnieuw op. Dit duurt een paar
echo   minuten. Je spelvoortgang blijft staan, die zit in de database.
echo.
pause
if exist "node_modules" rmdir /s /q "node_modules"
if exist "apps\mobile\node_modules" rmdir /s /q "apps\mobile\node_modules"
if exist "apps\server\node_modules" rmdir /s /q "apps\server\node_modules"
if exist "packages\shared\node_modules" rmdir /s /q "packages\shared\node_modules"
if exist "apps\mobile\.expo" rmdir /s /q "apps\mobile\.expo"
call pnpm install
if errorlevel 1 goto INSTALLATIE_MISLUKT
echo.
echo  Opnieuw controleren...
node scripts\sdk-check.mjs
if errorlevel 2 goto NOG_STEEDS_SCHEEF
goto NA_CONTROLE

:NOG_STEEDS_SCHEEF
echo.
echo   [FOUT] De versies kloppen nog steeds niet na een schone
echo   installatie. Maak hier een foto van en stuur die door.
echo.
pause
exit /b 1

:INSTALLATIE_MISLUKT
echo.
echo   [FOUT] Het ophalen van de pakketten is misgegaan.
echo   Meestal is dat een haperende internetverbinding.
echo   Probeer dit bestand opnieuw.
echo.
pause
exit /b 1

:NIET_GEINSTALLEERD
echo.
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
