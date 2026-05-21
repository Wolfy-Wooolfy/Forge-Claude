@echo off
setlocal

cd /d "%~dp0"

call pm2 stop forge
call pm2 delete forge
echo Forge stopped.
timeout /t 2 /nobreak >nul
