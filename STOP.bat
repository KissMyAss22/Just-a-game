@echo off
setlocal
chcp 65001 >nul 2>nul
cd /d "%~dp0"

echo.
echo  Database stoppen...
call pnpm db:down

echo.
echo  Klaar. De vensters met SERVER en APP kun je zelf sluiten.
echo.
echo  Je voortgang blijft bewaard. Volgende keer weer START.bat.
echo.
pause
