@echo off
setlocal enabledelayedexpansion

:: Root = directory containing this script (trailing backslash from %~dp0)
SET "ROOT=%~dp0"

echo.
echo ================================================================
echo   FORGE INSTALLER — One-time machine setup
echo   Installing from: %ROOT%
echo ================================================================
echo.

:: ── Step 1: Validate we are in a Forge project root ───────────────
echo [1/8] Validating Forge project root...
if not exist "%ROOT%package.json" (
    echo ERROR: package.json not found.
    echo Run INSTALL_FORGE.bat from the Forge project root directory.
    pause
    exit /b 1
)
if not exist "%ROOT%ecosystem.config.js" (
    echo ERROR: ecosystem.config.js not found.
    echo Run INSTALL_FORGE.bat from the Forge project root directory.
    pause
    exit /b 1
)
echo [OK] Forge project root confirmed.

:: ── Step 2: Check Node.js ─────────────────────────────────────────
echo [2/8] Checking Node.js...
where node >nul 2>&1
if not errorlevel 1 goto :node_ok

echo Node.js not found. Attempting automatic install via winget...
winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto :err_node_winget

where node >nul 2>&1
if errorlevel 1 goto :err_node_path

:node_ok
echo [OK] Node.js found.

:: ── Step 3: npm install ───────────────────────────────────────────
echo [3/8] Installing npm packages (1-2 min)...
cd /d "%ROOT%"
if not exist "%ROOT%logs" mkdir "%ROOT%logs"
call npm install --silent
if errorlevel 1 goto :err_npm
echo [OK] npm packages installed.

:: ── Step 4: Ensure pm2 ───────────────────────────────────────────
echo [4/8] Checking pm2...
where pm2 >nul 2>&1
if not errorlevel 1 goto :pm2_ok

echo Installing pm2 globally...
call npm install -g pm2 --silent
if errorlevel 1 goto :err_pm2

:pm2_ok
echo [OK] pm2 ready.

:: ── Step 5: Clear orphan processes on port 3100 (Bug B8 guard) ───
echo [5/8] Clearing any orphan processes on port 3100...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3100" ^| findstr "LISTENING" 2^>nul') do (
    echo   Stopping orphan process PID %%a
    taskkill /F /PID %%a >nul 2>&1
)

:: ── Step 6: pm2 start + save ──────────────────────────────────────
echo [6/8] Starting Forge via pm2...
cd /d "%ROOT%"
call pm2 start ecosystem.config.js --update-env
if errorlevel 1 goto :err_pm2_start
call pm2 save --force
if errorlevel 1 echo WARNING: pm2 save failed — auto-resurrect on next boot may not work.
echo [OK] Forge running via pm2.

:: ── Step 7: Auto-start on boot (Startup folder) ──────────────────
echo [7/8] Configuring Windows startup...
(
    echo @echo off
    echo call pm2 resurrect
) > "%ROOT%forge-resurrect.bat"
copy /Y "%ROOT%forge-resurrect.bat" "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\" >nul
if errorlevel 1 (
    echo WARNING: Could not write to Startup folder — auto-start on boot not configured.
    echo   Manually copy %ROOT%forge-resurrect.bat to:
    echo   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\
) else (
    echo [OK] forge-resurrect.bat added to Windows Startup.
)

:: ── Step 8: Desktop shortcuts + open browser ─────────────────────
echo [8/8] Creating Desktop shortcuts and opening browser...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\RUN_FORGE.lnk'); $sc.TargetPath = '%ROOT%RUN_FORGE.bat'; $sc.WorkingDirectory = '%ROOT%'; $sc.Save()"
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\STOP_FORGE.lnk'); $sc.TargetPath = '%ROOT%STOP_FORGE.bat'; $sc.WorkingDirectory = '%ROOT%'; $sc.Save()"
echo [OK] Desktop shortcuts created (RUN_FORGE, STOP_FORGE).

timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:3100"

goto :success

:: ════════════════════════════════════════════════════════════════
:: Error labels
:: ════════════════════════════════════════════════════════════════

:err_node_winget
echo.
echo ERROR: winget could not install Node.js.
echo Install it manually from https://nodejs.org/ then re-run.
pause
exit /b 1

:err_node_path
echo.
echo Node.js was installed but PATH needs refreshing.
echo Close this window and re-run INSTALL_FORGE.bat.
pause
exit /b 1

:err_npm
echo.
echo ERROR: npm install failed. Check your network connection and try again.
pause
exit /b 1

:err_pm2
echo.
echo ERROR: pm2 global install failed.
pause
exit /b 1

:err_pm2_start
echo.
echo ERROR: pm2 could not start Forge. Run: pm2 logs forge
pause
exit /b 1

:success
echo.
echo ================================================================
echo   FORGE installed and running from: %ROOT%
echo   Starts automatically with Windows.
echo   Use the Desktop shortcuts to run/stop manually.
echo ================================================================
echo.
