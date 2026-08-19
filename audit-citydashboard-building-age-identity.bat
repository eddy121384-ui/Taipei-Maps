@echo off
setlocal
cd /d "%~dp0"

echo ======================================================
echo   Taipei-Maps - City Dashboard building-age identity audit
echo ======================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  pause
  exit /b 1
)

set "IN=data\derived\citydashboard_building_age.geojson"
set "OUT=data\derived\citydashboard_building_age_identity_report.txt"

if not exist "%IN%" (
  echo City Dashboard building-age GeoJSON not found.
  echo Running the downloader/audit first...
  echo.
  call probe-citydashboard-building-age.bat
  if errorlevel 1 (
    echo.
    echo [ERROR] Could not prepare City Dashboard building-age GeoJSON.
    pause
    exit /b 1
  )
)

echo Auditing address / coordinate / cpid identity and duplicate structure...
echo This may take a little while because the source has more than 250k rows.
echo.

node tools\data\audit_citydashboard_building_age_duplicates.mjs "%IN%" "%OUT%"
if errorlevel 1 (
  echo.
  echo [ERROR] Identity audit failed. Send me this screen.
  pause
  exit /b 1
)

echo.
echo ======================================================
echo   DONE
echo ======================================================
echo Report:
echo   %OUT%
echo.
pause
endlocal
