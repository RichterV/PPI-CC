@echo off
chcp 65001 > nul
setlocal

REM Obtém a data e hora no formato YYYY-MM-DD HH:MM:SS
for /f "delims=" %%i in ('powershell -NoProfile -Command "Get-Date -Format ''yyyy-MM-dd HH:mm:ss''"') do set "DATA=%%i"

git init
git add .
git commit -m "modificações %DATA%"
git push -u origin main

pause