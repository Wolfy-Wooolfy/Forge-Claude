@echo off
REM ============================================================
REM  Forge — Cleanup Stray Files
REM ============================================================
REM  بيمسح الملفات الفاضية اللي اتعملت بالغلط
REM  من سكريبت قديم (cd, cls, echo, set, node, findstr...الخ)
REM ============================================================

setlocal EnableDelayedExpansion

cd /d "%~dp0"

echo Cleaning stray empty files...
echo.

set "CLEANED=0"

REM -- قائمة بأسماء الملفات الفاضية اللي اتعملت بالغلط
for %%F in (cd cls echo set node findstr powershell type bin verify "0" "C" "{" "}") do (
  if exist "%%~F" (
    REM -- تأكد إن الملف فعلاً file مش directory
    if not exist "%%~F\" (
      del /q "%%~F" 2>nul
      if not exist "%%~F" (
        echo  Deleted: %%~F
        set /a CLEANED+=1
      )
    )
  )
)

REM -- ملفات مؤقتة معروفة
for %%F in (_tmp_code_files.txt _tmp_docs_files.txt doc_id_index.txt trace_output.txt) do (
  if exist "%%~F" (
    del /q "%%~F" 2>nul
    if not exist "%%~F" (
      echo  Deleted: %%~F
      set /a CLEANED+=1
    )
  )
)

echo.
echo Done. Cleaned !CLEANED! file(s).
echo.
pause
exit /b 0
