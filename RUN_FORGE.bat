@echo off
setlocal

cd /d "%~dp0"

where pm2 >nul 2>&1
if errorlevel 1 (
    echo pm2 not found. Run INSTALL_FORGE.bat first.
    pause
    exit /b 1
)

echo Clearing any orphan processes on port 3100...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3100" ^| findstr "LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Starting Forge...
call pm2 start ecosystem.config.js --update-env
if errorlevel 1 (
    echo pm2 start failed. Check pm2 logs: pm2 logs forge
    pause
    exit /b 1
)

timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:3100"
echo Forge is running.
