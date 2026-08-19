@echo off
setlocal
chcp 65001 >nul 2>nul
cd /d "%~dp0"
call node scripts\versies.mjs
echo.
pause
