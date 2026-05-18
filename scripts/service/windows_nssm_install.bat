@echo off
setlocal enabledelayedexpansion

:: ── Forge API Service Installer — Option A: NSSM ────────────────────────────
:: Registers Forge as a Windows service using NSSM 2.24.
::
:: Usage (run as Administrator):
::   windows_nssm_install.bat install   — register and start Forge service
::   windows_nssm_install.bat uninstall — stop and remove Forge service
::   windows_nssm_install.bat start     — start an already-installed service
::   windows_nssm_install.bat stop      — stop the running service
::   windows_nssm_install.bat status    — check service status
::
:: Prerequisites:
::   - NSSM 2.24 in PATH. Download: https://nssm.cc/release/nssm-2.24.zip
::     Verify SHA-256 hash before extracting — see INSTALL.md §Windows Service.
::     Forge scripts NEVER auto-download NSSM.
::   - Node.js >= 20 in PATH.
::   - Run from any location; paths are derived from this script's location.
::
:: Idempotent: safe to re-run install on an existing service (removes and reinstalls).
:: ────────────────────────────────────────────────────────────────────────────

set "SERVICE_NAME=forge-api"

:: Derive FORGE_DIR as two levels up from this script (scripts\service\ → repo root)
set "SCRIPT_DIR=%~dp0"
for %%A in ("%SCRIPT_DIR%..\..")  do set "FORGE_DIR=%%~fA"
set "LAUNCH_SCRIPT=%FORGE_DIR%\start-api.js"
set "LOG_DIR=%FORGE_DIR%\logs"

:: ── Argument dispatch ────────────────────────────────────────────────────────
if "%~1"=="" goto :usage
if /i "%~1"=="install"   goto :install
if /i "%~1"=="uninstall" goto :uninstall
if /i "%~1"=="start"     goto :start
if /i "%~1"=="stop"      goto :stop
if /i "%~1"=="status"    goto :status
goto :usage

:: ── install ──────────────────────────────────────────────────────────────────
:install
call :require_nssm  || exit /b 1
call :require_node  || exit /b 1

:: Idempotent: remove existing service first
nssm status "%SERVICE_NAME%" >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Existing ^"%SERVICE_NAME%^" service found — removing before re-install.
    nssm stop "%SERVICE_NAME%" confirm >nul 2>&1
    nssm remove "%SERVICE_NAME%" confirm >nul 2>&1
)

:: Locate node.exe
for /f "delims=" %%N in ('where node 2^>nul') do set "NODE_EXE=%%N" & goto :node_found
:node_found

:: Create log directory (logs\ is created at first write by log_writer — ensure it exists)
if not exist "%LOG_DIR%\" mkdir "%LOG_DIR%"

:: Install service
echo [INFO] Installing ^"%SERVICE_NAME%^" via NSSM...
nssm install "%SERVICE_NAME%" "%NODE_EXE%" "start-api.js"
if errorlevel 1 ( echo [ERROR] nssm install failed. & exit /b 1 )

:: Configure working directory
nssm set "%SERVICE_NAME%" AppDirectory "%FORGE_DIR%"

:: Restart on crash (10 second delay, unlimited retries)
nssm set "%SERVICE_NAME%" AppExit Default Restart
nssm set "%SERVICE_NAME%" AppRestartDelay 10000

:: Stdout/stderr → logs\ with 10 MB rotation (matches D4 log_writer rotation policy)
nssm set "%SERVICE_NAME%" AppStdout          "%LOG_DIR%\forge.log"
nssm set "%SERVICE_NAME%" AppStderr          "%LOG_DIR%\forge.error.log"
nssm set "%SERVICE_NAME%" AppStdoutCreationDisposition 4
nssm set "%SERVICE_NAME%" AppStderrCreationDisposition 4
nssm set "%SERVICE_NAME%" AppRotateFiles     1
nssm set "%SERVICE_NAME%" AppRotateBytes     10485760
nssm set "%SERVICE_NAME%" AppRotateOnline    1

:: Description and auto-start
nssm set "%SERVICE_NAME%" Description "Forge AI OS — Personal Production API Server"
nssm set "%SERVICE_NAME%" Start SERVICE_AUTO_START

:: Crash recorder hook (Stage 12.1 Group B) — runs crash_recorder.bat on each exit
:: Enabled after Group B creates crash_recorder.bat:
::   nssm set forge-api AppEvents AppExit "%FORGE_DIR%\scripts\service\crash_recorder.bat"
:: Leave commented until Stage 12.1 Group B is complete.

:: Start the service
echo [INFO] Starting ^"%SERVICE_NAME%^"...
nssm start "%SERVICE_NAME%"
if errorlevel 1 (
    echo [ERROR] Service start failed. Check: nssm status %SERVICE_NAME%
    exit /b 1
)

echo.
echo [OK] forge-api service installed and started.
echo      Service name : %SERVICE_NAME%
echo      Forge dir    : %FORGE_DIR%
echo      Logs         : %LOG_DIR%\
echo.
echo To verify: nssm status forge-api
exit /b 0

:: ── uninstall ────────────────────────────────────────────────────────────────
:uninstall
call :require_nssm || exit /b 1
nssm stop "%SERVICE_NAME%" confirm >nul 2>&1
nssm remove "%SERVICE_NAME%" confirm
echo [OK] ^"%SERVICE_NAME%^" service removed. Log files are preserved in %LOG_DIR%\.
exit /b 0

:: ── start ────────────────────────────────────────────────────────────────────
:start
call :require_nssm || exit /b 1
nssm start "%SERVICE_NAME%"
exit /b %errorlevel%

:: ── stop ─────────────────────────────────────────────────────────────────────
:stop
call :require_nssm || exit /b 1
nssm stop "%SERVICE_NAME%" confirm
exit /b %errorlevel%

:: ── status ───────────────────────────────────────────────────────────────────
:status
call :require_nssm || exit /b 1
nssm status "%SERVICE_NAME%"
exit /b %errorlevel%

:: ── usage ────────────────────────────────────────────────────────────────────
:usage
echo Usage: windows_nssm_install.bat [install^|uninstall^|start^|stop^|status]
echo.
echo See INSTALL.md ^§Windows Service (Option A) for full walkthrough.
exit /b 1

:: ── helpers ──────────────────────────────────────────────────────────────────
:require_nssm
where nssm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] NSSM not found in PATH.
    echo.
    echo Download NSSM 2.24 from: https://nssm.cc/release/nssm-2.24.zip
    echo Verify the SHA-256 hash listed in INSTALL.md ^§Windows Service before extracting.
    echo Add the extracted nssm.exe directory to your PATH, then re-run this script.
    echo.
    echo Alternative: use windows_task_scheduler_install.bat ^(Option B, no NSSM needed^).
    exit /b 1
)
exit /b 0

:require_node
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found in PATH. Install Node.js ^>=20 from https://nodejs.org/
    exit /b 1
)
exit /b 0
