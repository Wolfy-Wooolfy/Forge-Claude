@echo off
REM ============================================================
REM  Forge — Single-Command Launcher (Windows)
REM ============================================================
REM  بيشغل السيرفرين مع بعض في نافذتين منفصلتين
REM  بيقرا البورتات و OPENAI_API_KEY من ملف .env
REM ============================================================

setlocal EnableDelayedExpansion

REM -- انتقل لمجلد السكريبت (جذر المشروع)
cd /d "%~dp0"

REM -- حمّل المتغيرات من .env لو موجود
if exist ".env" (
  for /f "usebackq tokens=1* delims==" %%a in (".env") do (
    set "_key=%%a"
    set "_val=%%b"
    if not "!_key!"=="" (
      set "_first=!_key:~0,1!"
      if not "!_first!"=="#" (
        set "!_key!=!_val!"
      )
    )
  )
) else (
  echo [WARN] .env file not found. Using defaults.
)

REM -- قيم افتراضية لو المتغير مش موجود
if "%FORGE_API_PORT%"=="" set "FORGE_API_PORT=3100"
if "%FORGE_WEB_PORT%"=="" set "FORGE_WEB_PORT=3000"

REM -- تحقق من OPENAI_API_KEY
if "%OPENAI_API_KEY%"=="" (
  echo.
  echo [ERROR] OPENAI_API_KEY is not set.
  echo Add it to .env file or set it manually:
  echo   set OPENAI_API_KEY=sk-proj-...
  echo.
  pause
  exit /b 1
)

REM -- تحقق من وجود start-api.js
if not exist "start-api.js" (
  echo.
  echo [ERROR] start-api.js not found in project root.
  echo Make sure you copied start-api.js next to start.bat.
  echo.
  pause
  exit /b 1
)

echo ============================================================
echo  Forge Launcher
echo ============================================================
echo  API Server  : http://localhost:%FORGE_API_PORT%
echo  Web Server  : http://localhost:%FORGE_WEB_PORT%
echo  API Key     : %OPENAI_API_KEY:~0,12%...
echo ============================================================
echo.

REM -- شغّل API server في نافذة منفصلة (يستخدم start-api.js بدل node -e)
start "Forge API (port %FORGE_API_PORT%)" cmd /k "set OPENAI_API_KEY=%OPENAI_API_KEY%&& set FORGE_API_PORT=%FORGE_API_PORT%&& set FORGE_WORKSPACE_API_PORT=%FORGE_API_PORT%&& node start-api.js"

REM -- انتظر ثانيتين عشان الـ API يبدأ
timeout /t 2 /nobreak >nul

REM -- شغّل Web server في نافذة منفصلة
start "Forge Web (port %FORGE_WEB_PORT%)" cmd /k "set OPENAI_API_KEY=%OPENAI_API_KEY%&& set FORGE_WEB_PORT=%FORGE_WEB_PORT%&& set FORGE_API_PORT=%FORGE_API_PORT%&& node web/server.js"

REM -- انتظر 3 ثواني وافتح المتصفح
timeout /t 3 /nobreak >nul
start http://localhost:%FORGE_WEB_PORT%/

echo.
echo Both servers started in separate windows.
echo To stop: close the two opened CMD windows.
echo.
timeout /t 5 /nobreak >nul
exit /b 0
