@echo off
setlocal enabledelayedexpansion

echo.
echo ================================================================
echo   FORGE INSTALLER — One-time machine setup
echo ================================================================
echo.

:: ── Step 1: Determine install directory ──────────────────────────
if exist "D:\" (
    set "INSTALL=D:\ForgeAI"
) else (
    set "INSTALL=C:\ForgeAI"
)
echo Install directory: %INSTALL%
echo.

:: ── Step 2: Check Node.js ─────────────────────────────────────────
echo [1/10] Checking Node.js...
where node >nul 2>&1
if not errorlevel 1 goto :node_ok

echo Node.js not found. Attempting automatic install via winget...
winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto :err_node_winget

where node >nul 2>&1
if errorlevel 1 goto :err_node_path

:node_ok
echo [OK] Node.js found.

:: ── Step 3: Check git ─────────────────────────────────────────────
echo [2/10] Checking git...
where git >nul 2>&1
if not errorlevel 1 goto :git_ok

echo Git not found. Attempting automatic install via winget...
winget install Git.Git --silent --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto :err_git_winget

where git >nul 2>&1
if errorlevel 1 goto :err_git_path

:git_ok
echo [OK] Git found.

:: ── Step 4: Clone or update repo ──────────────────────────────────
echo [3/10] Cloning / updating Forge repo...
if not exist "%INSTALL%\" goto :do_clone
if not exist "%INSTALL%\.git" goto :err_not_a_repo
:: existing repo — pull updates
cd /d "%INSTALL%"
call git pull
if errorlevel 1 goto :err_clone
goto :repo_ready

:do_clone
call git clone "https://github.com/Wolfy-Wooolfy/Forge-Claude" "%INSTALL%"
if errorlevel 1 goto :err_clone
cd /d "%INSTALL%"

:repo_ready
echo [OK] Repo ready at %INSTALL%.

:: ── Step 5: npm install ───────────────────────────────────────────
echo [4/10] Installing npm packages (1-2 min)...
if not exist "%INSTALL%\logs" mkdir "%INSTALL%\logs"
call npm install --silent
if errorlevel 1 goto :err_npm
echo [OK] npm packages installed.

:: ── Step 6: Ensure pm2 ───────────────────────────────────────────
echo [5/10] Checking pm2...
where pm2 >nul 2>&1
if not errorlevel 1 goto :pm2_ok

echo Installing pm2 globally...
call npm install -g pm2 --silent
if errorlevel 1 goto :err_pm2

:pm2_ok
echo [OK] pm2 ready.

:: ── Step 7: Clear orphan processes on port 3100 (Bug B8 guard) ───
echo [6/10] Clearing any orphan processes on port 3100...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3100" ^| findstr "LISTENING" 2^>nul') do (
    echo   Stopping orphan process PID %%a
    taskkill /F /PID %%a >nul 2>&1
)

:: ── Step 8: pm2 start + save ──────────────────────────────────────
echo [7/10] Starting Forge via pm2...
call pm2 start ecosystem.config.js --update-env
if errorlevel 1 goto :err_pm2_start
call pm2 save --force
if errorlevel 1 echo WARNING: pm2 save failed — auto-resurrect on next boot may not work.
echo [OK] Forge running via pm2.

:: ── Step 9: Auto-start on boot (Startup folder) ──────────────────
echo [8/10] Configuring Windows startup...
(
    echo @echo off
    echo cd /d "%INSTALL%"
    echo call pm2 resurrect
) > "%INSTALL%\forge-resurrect.bat"
copy /Y "%INSTALL%\forge-resurrect.bat" "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\" >nul
if errorlevel 1 (
    echo WARNING: Could not write to Startup folder — auto-start on boot not configured.
    echo   Manually copy %INSTALL%\forge-resurrect.bat to:
    echo   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\
) else (
    echo [OK] forge-resurrect.bat added to Windows Startup.
)

:: ── Step 10: Desktop shortcuts for RUN_FORGE and STOP_FORGE ───────
echo [9/10] Creating Desktop shortcuts...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\RUN_FORGE.lnk'); $sc.TargetPath = '%INSTALL%\RUN_FORGE.bat'; $sc.WorkingDirectory = '%INSTALL%'; $sc.Save()"
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\STOP_FORGE.lnk'); $sc.TargetPath = '%INSTALL%\STOP_FORGE.bat'; $sc.WorkingDirectory = '%INSTALL%'; $sc.Save()"
echo [OK] Desktop shortcuts created (RUN_FORGE, STOP_FORGE).

:: ── Step 11: Open browser + success banner ───────────────────────
echo [10/10] Waiting for Forge to initialize...
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:3100"

goto :success

:: ════════════════════════════════════════════════════════════════
:: Error labels — each exits with code 1 after informing the user
:: ════════════════════════════════════════════════════════════════

:err_node_winget
echo.
echo ERROR: winget could not install Node.js.
echo Install it manually:
start "" "https://nodejs.org/"
echo   1. Download Node.js LTS from https://nodejs.org/
echo   2. Run the installer.
echo   3. Close this window and re-run INSTALL_FORGE.bat.
pause
exit /b 1

:err_node_path
echo.
echo Node.js was installed but PATH needs refreshing.
echo Close this window and re-run INSTALL_FORGE.bat.
pause
exit /b 1

:err_git_winget
echo.
echo ERROR: winget could not install Git.
echo Install it manually:
start "" "https://git-scm.com/download/win"
echo   1. Download Git from https://git-scm.com/download/win
echo   2. Run the installer.
echo   3. Close this window and re-run INSTALL_FORGE.bat.
pause
exit /b 1

:err_git_path
echo.
echo Git was installed but PATH needs refreshing.
echo Close this window and re-run INSTALL_FORGE.bat.
pause
exit /b 1

:err_not_a_repo
echo.
echo ERROR: %INSTALL% exists but is not a git repository.
echo Delete or rename it, then re-run INSTALL_FORGE.bat.
pause
exit /b 1

:err_clone
echo.
echo ERROR: git clone/pull failed. Check your network connection and try again.
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
echo   FORGE installed to %INSTALL%
echo   Running now, and starts automatically with Windows.
echo   Use the Desktop shortcuts to run/stop manually.
echo ================================================================
echo.
