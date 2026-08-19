@echo off
setlocal
chcp 65001 >nul 2>nul
cd /d "%~dp0"

echo.
echo  ==================================================
echo    Schoon opnieuw installeren
echo  ==================================================
echo.
echo  Gebruik dit als de Expo-versie is veranderd, of als
echo  er iets blijft haperen dat je niet kunt plaatsen.
echo.
echo  Alle opgehaalde pakketten worden weggegooid en opnieuw
echo  binnengehaald. Je spelvoortgang blijft gewoon staan -
echo  die zit in de database, niet in deze mappen.
echo.
pause

echo.
echo  Oude pakketten verwijderen...
if exist "node_modules" rmdir /s /q "node_modules"
if exist "apps\mobile\node_modules" rmdir /s /q "apps\mobile\node_modules"
if exist "apps\server\node_modules" rmdir /s /q "apps\server\node_modules"
if exist "packages\shared\node_modules" rmdir /s /q "packages\shared\node_modules"
if exist "apps\mobile\.expo" rmdir /s /q "apps\mobile\.expo"

echo  Opnieuw ophalen. Dit duurt een paar minuten...
echo.
call pnpm install
if errorlevel 1 goto MISLUKT

echo.
echo  ==================================================
echo    Klaar. Dubbelklik nu op START.bat
echo  ==================================================
echo.
pause
exit /b 0

:MISLUKT
echo.
echo   [FOUT] Het ophalen is misgegaan. Zie de melding hierboven.
echo   Meestal is dat een haperende internetverbinding; probeer opnieuw.
echo.
pause
exit /b 1
