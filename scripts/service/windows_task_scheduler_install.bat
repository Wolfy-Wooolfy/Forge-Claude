@echo off
setlocal enabledelayedexpansion

:: ── Forge API Service Installer — Option B: Windows Task Scheduler ───────────
:: Registers Forge to boot on user logon via a SINGLE canonical path: `pm2 resurrect`
:: (PHASE-49 W-D). pm2 is the supervisor (crash-restart + daemon self-heal); this task
:: only triggers `pm2 resurrect` at logon to restore the saved pm2 process list (`forge`).
:: (Previously this task ran `node start-api.js` directly — a second, un-supervised boot
:: path that competed with pm2 for :3100; retired in PHASE-49 W-D.)
:: No third-party software required (Task Scheduler is built into Windows).
::
:: Usage (run as current user — no Administrator required):
::   windows_task_scheduler_install.bat install   — register Forge task
::   windows_task_scheduler_install.bat uninstall — remove Forge task
::   windows_task_scheduler_install.bat start     — start task immediately
::   windows_task_scheduler_install.bat stop      — stop running task
::   windows_task_scheduler_install.bat status    — check task status
::
:: Crash-restart of the running server is handled by pm2 (ecosystem autorestart,
:: max_restarts 10); the task's RestartCount 3 covers the `pm2 resurrect` action itself.
:: Task runs as current user via AtLogOn trigger (no S4U, no stored password).
::
:: Idempotent: safe to re-run install on an existing task (removes and recreates).
:: ────────────────────────────────────────────────────────────────────────────

set "TASK_NAME=ForgeAPI"

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
call :require_node || exit /b 1

:: Locate node.exe
for /f "delims=" %%N in ('where node 2^>nul') do set "NODE_EXE=%%N" & goto :node_found
:node_found

:: Locate the global pm2 CLI — PATH-independent invocation for the logon task context
:: (a scheduled task's environment may lack the npm global bin on PATH).
for /f "delims=" %%R in ('npm root -g 2^>nul') do set "NPM_GLOBAL_ROOT=%%R"
set "PM2_CLI=%NPM_GLOBAL_ROOT%\pm2\bin\pm2"
if not exist "%PM2_CLI%" (
    echo [ERROR] pm2 CLI not found at "%PM2_CLI%" — run: npm install -g pm2
    exit /b 1
)

:: Create log directory
if not exist "%LOG_DIR%\" mkdir "%LOG_DIR%"

:: Idempotent: delete existing task first
schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Existing ^"%TASK_NAME%^" task found — removing before re-install.
    schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
)

:: Use PowerShell to create task with restart-on-failure settings.
:: schtasks /create does not expose restart-on-failure via command line;
:: PowerShell's Register-ScheduledTask supports it natively.
echo [INFO] Creating ^"%TASK_NAME%^" via PowerShell Register-ScheduledTask...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$action   = New-ScheduledTaskAction -Execute '%NODE_EXE%' -Argument ([char]34 + '%PM2_CLI%' + [char]34 + ' resurrect') -WorkingDirectory '%FORGE_DIR%';" ^
  "$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME;" ^
  "$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew;" ^
  "Register-ScheduledTask -TaskName '%TASK_NAME%' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null;" ^
  "Write-Host '[OK] Task registered.'"

if errorlevel 1 (
    echo [ERROR] Task registration failed.
    exit /b 1
)

:: Start immediately so the service is running without waiting for next logon
echo [INFO] Starting ^"%TASK_NAME%^" immediately...
schtasks /run /tn "%TASK_NAME%"
if errorlevel 1 (
    echo [WARN] Could not start task immediately. It will run on next logon.
)

echo.
echo [OK] ForgeAPI task installed.
echo      Task name : %TASK_NAME%
echo      Forge dir : %FORGE_DIR%
echo      Action    : node "%PM2_CLI%" resurrect  (pm2 canonical boot path)
echo      Trigger   : On logon (user: %USERNAME%), restart 3x on failure (1min delay)
echo.
echo To verify: schtasks /query /tn ForgeAPI /v /fo LIST
exit /b 0

:: ── uninstall ────────────────────────────────────────────────────────────────
:uninstall
schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Task ^"%TASK_NAME%^" not found — nothing to remove.
    exit /b 0
)
schtasks /end /tn "%TASK_NAME%" >nul 2>&1
schtasks /delete /tn "%TASK_NAME%" /f
echo [OK] ^"%TASK_NAME%^" task removed. Log files are preserved in %LOG_DIR%\.
exit /b 0

:: ── start ────────────────────────────────────────────────────────────────────
:start
schtasks /run /tn "%TASK_NAME%"
exit /b %errorlevel%

:: ── stop ─────────────────────────────────────────────────────────────────────
:stop
schtasks /end /tn "%TASK_NAME%"
exit /b %errorlevel%

:: ── status ───────────────────────────────────────────────────────────────────
:status
schtasks /query /tn "%TASK_NAME%" /v /fo LIST 2>&1 | findstr /i "Status Last Run Result"
exit /b %errorlevel%

:: ── usage ────────────────────────────────────────────────────────────────────
:usage
echo Usage: windows_task_scheduler_install.bat [install^|uninstall^|start^|stop^|status]
echo.
echo See INSTALL.md ^§Windows Service (Option B) for full walkthrough.
exit /b 1

:: ── helpers ──────────────────────────────────────────────────────────────────
:require_node
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found in PATH. Install Node.js ^>=20 from https://nodejs.org/
    exit /b 1
)
exit /b 0
