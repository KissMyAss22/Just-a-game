@echo off
setlocal
chcp 65001 >nul 2>nul
cd /d "%~dp0"

echo.
echo  ==================================================
echo    Just a Game  -  controle
echo  ==================================================
echo.

node scripts\sdk-check.mjs
if errorlevel 3 goto NIET_GEINSTALLEERD
if errorlevel 2 goto SCHEEF

echo.
echo  Alles staat goed. Dubbelklik op START.bat om te spelen.
echo.
pause
exit /b 0

:SCHEEF
echo.
echo  Dit klopt niet. START.bat ruimt dit zelf op zodra je
echo  hem draait; je hoeft hier verder niets voor te doen.
echo.
pause
exit /b 0

:NIET_GEINSTALLEERD
echo.
echo  Dubbelklik eerst op INSTALLEER.bat
echo.
pause
exit /b 1
