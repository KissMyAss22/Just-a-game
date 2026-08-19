@echo off
setlocal
chcp 65001 >nul 2>nul
cd /d "%~dp0"

echo.
echo  ==================================================
echo    Just a Game  -  eenmalige installatie
echo  ==================================================
echo.
echo  Dit duurt de eerste keer een paar minuten.
echo.

REM ---------- Node ----------
where node >nul 2>nul
if errorlevel 1 goto GEEN_NODE

node -e "process.exit(parseInt(process.versions.node)>=20?0:1)"
if errorlevel 1 goto OUDE_NODE

for /f "delims=" %%v in ('node -v') do echo   [ok]     Node %%v

REM ---------- pnpm ----------
where pnpm >nul 2>nul
if not errorlevel 1 goto PNPM_OK
echo   [bezig]  pnpm ontbreekt, wordt nu geinstalleerd...
call npm install -g pnpm
if errorlevel 1 goto PNPM_MISLUKT
:PNPM_OK
echo   [ok]     pnpm

REM ---------- Docker en instellingen ----------
echo.
echo  Instellingen controleren...
echo.
call node scripts\setup.mjs
if errorlevel 1 goto SETUP_MISLUKT

REM ---------- Dependencies ----------
echo.
echo  Dependencies ophalen. Even geduld, dit duurt het langst...
echo.
call pnpm install
if errorlevel 1 goto INSTALL_MISLUKT

REM ---------- Database ----------
echo.
echo  Database starten...
call pnpm db:up
if errorlevel 1 goto DB_MISLUKT

echo.
echo  Tabellen aanmaken en de stad vullen met items...
call pnpm db:migrate
if errorlevel 1 goto MIGRATE_MISLUKT

echo.
echo  ==================================================
echo    Klaar. Dubbelklik nu op  START.bat
echo  ==================================================
echo.
pause
exit /b 0

:GEEN_NODE
echo.
echo   [FOUT] Node is niet gevonden.
echo.
echo   Installeer Node 20 of hoger via https://nodejs.org
echo   Kies de LTS-versie. Herstart daarna je computer
echo   en probeer dit bestand opnieuw.
echo.
pause
exit /b 1

:OUDE_NODE
echo.
echo   [FOUT] Je Node-versie is te oud. Je hebt versie 20 of hoger nodig.
echo.
echo   Download de LTS-versie via https://nodejs.org
echo.
pause
exit /b 1

:PNPM_MISLUKT
echo.
echo   [FOUT] pnpm kon niet worden geinstalleerd.
echo.
echo   Probeer dit venster als Administrator te openen:
echo   rechtermuisknop op INSTALLEER.bat, "Als administrator uitvoeren".
echo.
pause
exit /b 1

:SETUP_MISLUKT
echo.
echo   [FOUT] Er ontbreekt nog iets. Zie de melding hierboven.
echo.
echo   Draait Docker Desktop? Start dat programma en wacht tot het
echo   icoon rechtsonder stil staat. Probeer dit bestand daarna opnieuw.
echo.
pause
exit /b 1

:INSTALL_MISLUKT
echo.
echo   [FOUT] Het ophalen van de dependencies is misgegaan.
echo.
echo   Meestal is dat een haperende internetverbinding.
echo   Probeer dit bestand nog een keer.
echo.
pause
exit /b 1

:DB_MISLUKT
echo.
echo   [FOUT] De database kon niet starten.
echo.
echo   Controleer of Docker Desktop draait en probeer opnieuw.
echo.
pause
exit /b 1

:MIGRATE_MISLUKT
echo.
echo   [FOUT] De database kon niet worden ingericht.
echo.
echo   Zie de melding hierboven. Blijft het misgaan, dan helpt vaak:
echo     pnpm db:down
echo     docker volume rm jag-pgdata jag-redisdata
echo   en daarna dit bestand opnieuw draaien.
echo.
pause
exit /b 1
