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

:: ── Step 6: Clear any saved pm2 forge process ─────────────────────
:: pm2 is now OPTIONAL / interactive-only (via RUN_FORGE.bat).
:: Task Scheduler is the sole boot mechanism. Any saved pm2 forge
:: process must be cleared so it cannot race Task Scheduler at boot.
echo [6/8] Clearing saved pm2 forge process (pm2 is interactive-only)...
cd /d "%ROOT%"
call pm2 delete forge >nul 2>&1
call pm2 save --force >nul 2>&1
echo [OK] pm2 state cleared — no forge process saved.

:: ── Step 7: Auto-start on boot (Task Scheduler) ──────────────────
echo [7/8] Configuring Windows startup via Task Scheduler...
:: Remove stale forge-resurrect.bat from Startup folder if present (replaced by Task Scheduler)
del /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\forge-resurrect.bat" >nul 2>&1

call "%ROOT%scripts\service\windows_task_scheduler_install.bat" install
if errorlevel 1 (
    echo WARNING: Task Scheduler registration failed.
    echo   Run manually: scripts\service\windows_task_scheduler_install.bat install
) else (
    echo [OK] Forge registered as Windows Task Scheduler task ^(ForgeAPI^).
    echo      Starts automatically at logon. Restarts on crash ^(3x, 30s delay^).
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

:success
echo.
echo ================================================================
echo   FORGE installed from: %ROOT%
echo   Starts automatically at Windows logon ^(Task Scheduler^).
echo   Use RUN_FORGE.bat for an interactive manual start ^(pm2^).
echo ================================================================
echo.
