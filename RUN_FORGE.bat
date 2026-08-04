@echo off
setlocal

cd /d "%~dp0"

where pm2 >nul 2>&1
if errorlevel 1 (
    echo pm2 not found. Run INSTALL_FORGE.bat first.
    pause
    exit /b 1
)

:: ── PHASE-55 W-4: restart-safe start ─────────────────────────────────────────
:: Remove any existing pm2 "forge" entry FIRST (tolerant — INSTALL_FORGE.bat:78
:: precedent). This (a) cleanly stops a pm2-managed instance, including one the
:: ForgeAPI Task-Scheduler task resurrected at logon (same pm2 daemon — PHASE-49
:: W-D), so the taskkill below never kills a managed process behind pm2's back
:: and autorestart cannot race this script; and (b) clears a DEAD entry left by a
:: previous kill, which made the bare `pm2 start` below crash with "Process 0 not
:: found" + TypeError on pm2_env at API.js:1718 (restart-over-dead-entry). If the
:: pm2 daemon itself is broken the delete no-ops and the self-heal below fixes it;
:: a fresh daemon starts with an empty list, which is equally restart-safe.
echo Removing any existing pm2 forge entry (restart-safe)...
call pm2 delete forge >nul 2>&1

echo Clearing any orphan processes on port 3100...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3100" ^| findstr "LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: ── Self-heal broken pm2 daemon (EPERM on \\.\pipe\rpc.sock) ──────────────
:: pm2 ping reveals daemon health. If EPERM/rpc.sock detected, kill ONLY the
:: pm2 daemon PID from ~/.pm2/pm2.pid — never taskkill /IM node.exe.
set "PM2_TMPOUT=%TEMP%\forge_pm2_ping_%RANDOM%.txt"
call pm2 ping >"%PM2_TMPOUT%" 2>&1
if errorlevel 1 (
    findstr /i "EPERM rpc.sock" "%PM2_TMPOUT%" >nul 2>&1
    if not errorlevel 1 (
        echo [WARN] pm2 daemon broken ^(EPERM^). Self-healing...
        powershell -NoProfile -Command "$f=\"$env:USERPROFILE\.pm2\pm2.pid\"; if (Test-Path $f) { $p=[int](Get-Content $f -Raw).Trim(); Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Remove-Item $f -Force -ErrorAction SilentlyContinue; Write-Host '[OK] pm2 daemon cleared.' }"
        timeout /t 2 /nobreak >nul
    )
)
del /Q "%PM2_TMPOUT%" >nul 2>&1

echo Starting Forge...
call pm2 start ecosystem.config.js --update-env
if errorlevel 1 (
    echo pm2 start failed. Check pm2 logs: pm2 logs forge
    pause
    exit /b 1
)

:: ── A-6: verified start — poll :3100 (up to ~30s) instead of a blind 3s wait ──
set "FORGE_UP="
for /l %%I in (1,1,30) do (
    if not defined FORGE_UP (
        powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:3100/' -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
        if not errorlevel 1 (
            set "FORGE_UP=1"
        ) else (
            timeout /t 1 /nobreak >nul
        )
    )
)
if defined FORGE_UP (
    echo.
    echo Forge is running -^> http://127.0.0.1:3100
    start "" "http://127.0.0.1:3100"
    timeout /t 5 /nobreak >nul
) else (
    echo.
    echo [ERROR] Forge did not respond on http://127.0.0.1:3100 within ~30 seconds.
    echo         Check the logs with: pm2 logs forge
    pause
    exit /b 1
)
