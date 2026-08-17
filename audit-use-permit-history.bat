@echo off
setlocal
cd /d "%~dp0"

echo ================================================
echo   Taipei-Maps - raw use-permit history audit
echo ================================================
echo.

set "XML=data\raw\taipei_use_permits.xml"
set "REPORT=data\derived\use_permit_history_audit.txt"

if not exist "%XML%" (
  echo Raw XML not found. Running the existing data downloader first...
  call download-building-age-data.bat --no-pause
  if errorlevel 1 (
    echo.
    echo [ERROR] Could not prepare raw XML.
    pause
    exit /b 1
  )
)

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python was not found.
  pause
  exit /b 1
)

if not exist "data\derived" mkdir "data\derived"

echo Scanning the full raw XML. No sampling and no year filter...
echo.
python -X utf8 tools\data\audit_use_permit_history.py "%XML%" > "%REPORT%"
if errorlevel 1 (
  echo.
  echo [ERROR] Audit failed.
  pause
  exit /b 1
)

type "%REPORT%"
echo.
echo -----------------------------------------------
echo Full report saved to:
echo   %REPORT%
echo -----------------------------------------------
pause
endlocal
